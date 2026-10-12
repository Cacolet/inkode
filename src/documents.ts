import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { createEditor, presentationExtensions, type IEditorBundle } from './editor/setup';
import { languageFor } from './editor/languages';
import { NATIVE, native } from './native';
import { Mode, Status, errorMessage, isMarkdown } from './types';
import type { IDraft, IFileData, TMode, TStatus } from './types';

export const Timing = { AUTOSAVE: 800, DRAFT: 1000, POLL: 3000, MAX_WAIT: 5000 } as const;
const PREVIEW_LIMIT = 2 * 1024 * 1024;
export interface ISession {
    file: IFileData;
    baseContent: string;
    bundle: IEditorBundle;
    view?: EditorView;
    version: number;
    mode: TMode;
    status: TStatus;
    error?: string;
    draftError?: string;
    external?: IFileData;
    unavailable?: boolean;
    scratch: boolean;
    draftQueue: Promise<void>;
    pendingSave?: Promise<void>;
    autosaveTimer?: ReturnType<typeof setTimeout>;
    draftTimer?: ReturnType<typeof setTimeout>;
    maxTimer?: ReturnType<typeof setTimeout>;
}
export function textOf(session: ISession): string { return session.bundle.state.doc.toString(); }
export function isDirty(session: ISession): boolean { return textOf(session) !== session.baseContent; }

export class DocumentStore {
    sessions: ISession[] = [];
    activeId = '';
    autosave = true;
    notice = '';
    private revision = 0;
    private listeners = new Set<() => void>();
    private checking = false;
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    snapshot = (): number => this.revision;
    emit(): void {
        this.revision++;
        for (const listener of this.listeners) { listener(); }
    }
    get active(): ISession | undefined {
        return this.sessions.find((session) => session.file.id === this.activeId);
    }
    activate(id: string): void { this.activeId = id; this.emit(); }
    add(file: IFileData, scratch = false): ISession {
        const existing = this.sessions.find((session) => session.file.id === file.id);
        if (existing) { this.activate(file.id); return existing; }
        const mode = isMarkdown(file.name) && file.text.length < PREVIEW_LIMIT
            ? Mode.PREVIEW : Mode.SOURCE;
        const session = { file, baseContent: file.text, version: 0, mode,
            status: Status.READY, scratch, draftQueue: Promise.resolve() } as ISession;
        session.bundle = this.build(session, file.text);
        this.sessions.push(session);
        this.activeId = file.id;
        this.emit();
        return session;
    }
    private build(session: ISession, text: string): IEditorBundle {
        const bundle = createEditor({
            id: session.file.id, name: session.file.name, text,
            readOnly: session.file.readOnly, mode: session.mode,
            onSave: () => { void this.save(session); },
            onToggleSource: () => this.mode(session.mode === Mode.SOURCE ? Mode.PREVIEW : Mode.SOURCE),
            onUpdate: (state, changed) => this.updated(session, state, changed),
        });
        if (!isMarkdown(session.file.name)) {
            void languageFor(session.file.name).then((language) => {
                this.dispatch(session, { effects: bundle.language.reconfigure(language) });
            }).catch((error) => this.report(error));
        }
        return bundle;
    }
    private updated(session: ISession, state: EditorState, changed: boolean): void {
        session.bundle.state = state;
        if (changed) {
            session.version++;
            this.schedule(session);
        }
        this.emit();
    }
    dispatch(session: ISession, spec: TransactionSpec): void {
        if (session.view) { session.view.dispatch(spec); return; }
        const transaction = session.bundle.state.update(spec);
        this.updated(session, transaction.state, transaction.docChanged);
    }
    mode(mode: TMode): void {
        const session = this.active;
        if (!session) { return; }
        if (mode === Mode.PREVIEW && session.bundle.state.doc.length >= PREVIEW_LIMIT) {
            this.report('较大文件使用源码模式，避免预览影响输入'); return;
        }
        session.mode = mode;
        this.dispatch(session, { effects: session.bundle.presentation.reconfigure(
            presentationExtensions(session.file.id, session.file.name, mode),
        ) });
    }
    setAutosave(value: boolean): void {
        this.autosave = value;
        for (const session of this.sessions) {
            clearTimeout(session.autosaveTimer);
            clearTimeout(session.maxTimer);
            session.maxTimer = undefined;
            if (value && isDirty(session)) { this.schedule(session); }
        }
        this.emit();
    }
    private schedule(session: ISession): void {
        clearTimeout(session.draftTimer);
        session.draftTimer = setTimeout(() => { void this.flushDraft(session); }, Timing.DRAFT);
        if (!this.autosave || session.scratch || session.external || session.unavailable) { return; }
        clearTimeout(session.autosaveTimer);
        session.autosaveTimer = setTimeout(() => { void this.save(session); }, Timing.AUTOSAVE);
        session.maxTimer ??= setTimeout(() => {
            session.maxTimer = undefined;
            void this.save(session);
        }, Timing.MAX_WAIT);
    }
    async flushDraft(session: ISession): Promise<void> {
        const draft: IDraft = {
            id: session.file.id, path: session.file.path, text: textOf(session),
            baseContent: session.baseContent, baseRevision: session.file.revision,
            bom: session.file.bom, lineEnding: session.file.lineEnding,
        };
        if (session.scratch && NATIVE) {
            // Scratch files are kept separately until the user chooses a disk location.
            try { localStorage.setItem(`inkode.scratch.${draft.id}`, JSON.stringify(draft)); }
            catch (error) {
                session.draftError = errorMessage(error);
                this.report(`草稿保存失败：${session.draftError}`);
                return;
            }
            session.draftError = undefined;
            return;
        }
        session.draftQueue = session.draftQueue.then(async () => {
            if (draft.text === draft.baseContent) { await native.discardDraft(draft.id); }
            else { await native.writeDraft(draft); }
            session.draftError = undefined;
        }).catch((error) => {
            session.draftError = errorMessage(error);
            this.report(`草稿保存失败：${session.draftError}`);
        });
        await session.draftQueue;
    }
    async save(session = this.active): Promise<void> {
        if (!session || session.file.readOnly || session.external || session.unavailable) { return; }
        if (session.pendingSave) { await session.pendingSave; return; }
        if (session.view?.composing) { this.schedule(session); return; }
        if (!isDirty(session) && !session.scratch) { return; }
        clearTimeout(session.autosaveTimer);
        clearTimeout(session.maxTimer);
        session.maxTimer = undefined;
        const snapshot = textOf(session);
        session.status = Status.SAVING;
        this.emit();
        session.pendingSave = this.performSave(session, snapshot);
        await session.pendingSave;
        session.pendingSave = undefined;
        if (session.error) { await this.check(session); }
        if (isDirty(session) && !session.error && !session.external) { this.schedule(session); }
    }
    private async performSave(session: ISession, snapshot: string): Promise<void> {
        try {
            const saved = session.scratch
                ? await native.saveAs(session.file.name, snapshot)
                : await native.save(session.file, snapshot);
            if (saved && session.scratch) {
                const oldId = session.file.id;
                session.file = saved;
                session.baseContent = snapshot;
                session.scratch = false;
                session.status = Status.READY;
                session.error = undefined;
                if (this.activeId === oldId) { this.activeId = saved.id; }
                this.dispatch(session, { effects: session.bundle.presentation.reconfigure(
                    presentationExtensions(saved.id, saved.name, session.mode),
                ) });
                localStorage.removeItem(`inkode.scratch.${oldId}`);
                await this.flushDraft(session);
            } else if (saved) {
                session.file = saved;
                session.baseContent = snapshot;
                session.status = Status.READY;
                session.error = undefined;
                await this.flushDraft(session);
            } else { session.status = Status.READY; }
        } catch (error) {
            session.status = Status.ERROR;
            session.error = errorMessage(error);
            await this.flushDraft(session);
            await this.check(session);
        }
        this.emit();
    }
    private replace(session: ISession, text: string): void {
        this.dispatch(session, { changes: { from: 0, to: session.bundle.state.doc.length, insert: text } });
    }
    private reset(session: ISession, file: IFileData): void {
        const position = Math.min(session.bundle.state.selection.main.head, file.text.length);
        session.file = file;
        session.baseContent = file.text;
        session.external = undefined;
        session.unavailable = false;
        session.status = Status.READY;
        session.error = undefined;
        session.bundle = this.build(session, file.text);
        session.bundle.state = session.bundle.state.update({ selection: { anchor: position } }).state;
        session.view?.setState(session.bundle.state);
        this.emit();
    }
    async check(session: ISession): Promise<void> {
        if (session.scratch || session.pendingSave || !this.sessions.includes(session)) { return; }
        const revision = session.file.revision;
        const version = session.version;
        try {
            const disk = await native.read(session.file.id);
            if (revision !== session.file.revision || version !== session.version || session.pendingSave) { return; }
            session.unavailable = false;
            if (disk.revision === revision) { return; }
            if (!isDirty(session) || disk.text === textOf(session)) {
                this.reset(session, disk);
                await this.flushDraft(session);
            } else { session.external = disk; this.emit(); }
        } catch (error) {
            session.unavailable = true;
            session.error = errorMessage(error);
            this.emit();
        }
    }
    async checkAll(): Promise<void> {
        if (this.checking) { return; }
        this.checking = true;
        try { await Promise.all(this.sessions.map((session) => this.check(session))); }
        finally { this.checking = false; }
    }
    async useDisk(session: ISession): Promise<void> {
        if (!session.external) { return; }
        this.reset(session, session.external);
        await this.flushDraft(session);
    }
    async keepLocal(session: ISession): Promise<void> {
        if (!session.external) { return; }
        // Explicit user choice, still revision-checked by Rust on the next save.
        session.file = session.external;
        session.baseContent = session.external.text;
        session.external = undefined;
        session.status = Status.READY;
        await this.save(session);
    }
    async copy(session = this.active): Promise<void> {
        if (!session) { return; }
        try { await native.saveAs(session.file.name, textOf(session)); }
        catch (error) { this.report(error); }
    }
    recoverScratch(draft: IDraft): void {
        const session = this.add({ ...draft, text: draft.baseContent,
            name: draft.path.split(/[\\/]/).pop() ?? '恢复.md',
            revision: draft.baseRevision, readOnly: false }, true);
        session.baseContent = draft.baseContent;
        this.replace(session, draft.text);
    }
    async recover(draft: IDraft): Promise<void> {
        try {
            const disk = await native.restore(draft);
            if (!disk) {
                const recovered = this.add({ ...draft, text: draft.baseContent,
                    name: draft.path.split(/[\\/]/).pop() ?? '恢复.md',
                    revision: draft.baseRevision, readOnly: false }, true);
                this.replace(recovered, draft.text);
                return;
            }
            const session = this.add({ ...disk, text: draft.baseContent });
            session.file = { ...disk, revision: draft.baseRevision };
            this.replace(session, draft.text);
            if (disk.revision !== draft.baseRevision && disk.text !== draft.text) {
                session.external = disk;
            }
            this.emit();
        } catch (error) { this.report(error); }
    }
    async close(session: ISession, keepDraft: boolean): Promise<void> {
        if (session.pendingSave) { await session.pendingSave; }
        clearTimeout(session.draftTimer);
        clearTimeout(session.autosaveTimer);
        clearTimeout(session.maxTimer);
        if (keepDraft) {
            await this.flushDraft(session);
            if (session.draftError) { throw new Error('草稿未写入成功，已保留文档，请重试或另存文件。'); }
        } else {
            await session.draftQueue;
            if (!session.scratch || !NATIVE) { await native.discardDraft(session.file.id); }
            localStorage.removeItem(`inkode.scratch.${session.file.id}`);
        }
        this.remove(session);
    }
    private remove(session: ISession): void {
        clearTimeout(session.draftTimer);
        clearTimeout(session.autosaveTimer);
        clearTimeout(session.maxTimer);
        this.sessions = this.sessions.filter((item) => item !== session);
        if (this.activeId === session.file.id) { this.activeId = this.sessions.at(-1)?.file.id ?? ''; }
        this.emit();
    }
    report(error: unknown): void { this.notice = errorMessage(error); this.emit(); }
}
export const documents = new DocumentStore();
