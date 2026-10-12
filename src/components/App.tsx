import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openSearchPanel, gotoLine } from '@codemirror/search';
import {
    ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Code2, FilePlus2, FileText,
    FolderOpen, GitCompareArrows, Menu, Moon, Pin, PinOff, Search, Sun, X, Copy, SquarePen,
} from 'lucide-react';
import { documents, isDirty, textOf, type ISession } from '../documents';
import { NATIVE, native } from '../native';
import { sampleFiles } from '../samples';
import { Mode, Status, isMarkdown, type IDraft, type IFileData, type IWorkspace } from '../types';
import { useRuntime } from '../useRuntime';
import { Editor } from './Editor';
import { ShortcutDock } from './ShortcutDock';
import { Sidebar } from './Sidebar';
import { Dialog } from './Dialog';

const Review = lazy(() => import('./Review'));
const PREFERENCES = { THEME: 'inkode.theme', PIN: 'inkode.pin' } as const;
type TDialog = { type: 'close'; session: ISession } | { type: 'quit' }
    | { type: 'new' } | { type: 'disk'; session: ISession } | null;

function Tool({ label, children, active, disabled, onClick }: {
    label: string; children: React.ReactNode; active?: boolean;
    disabled?: boolean; onClick: () => void;
}): React.JSX.Element {
    return <button className={`tool-button ${active ? 'active' : ''}`}
        title={label} aria-label={label} aria-pressed={active}
        disabled={disabled} onClick={onClick}>{children}</button>;
}
function SessionTabs({ onClose }: { onClose: (session: ISession) => void }): React.JSX.Element {
    return <div className="tabs" role="tablist" aria-label="打开的文件">
        {documents.sessions.map((session) => <div className={`tab ${documents.activeId ===
            session.file.id ? 'active' : ''}`} key={session.file.id}>
            <button role="tab" aria-selected={documents.activeId === session.file.id}
                onClick={() => documents.activate(session.file.id)}>
                {isMarkdown(session.file.name) ? <FileText size={14} /> : <Code2 size={14} />}
                <span>{session.file.name}</span>{isDirty(session) && <span className="dirty-dot" />}
            </button>
            <button className="tab-close" aria-label={`关闭 ${session.file.name}`}
                onClick={() => onClose(session)}><X size={13} /></button>
        </div>)}
    </div>;
}
function Conflict({ session, onReview, onDisk }: {
    session: ISession; onReview: () => void; onDisk: () => void;
}): React.JSX.Element | null {
    if (!session.external && !session.unavailable) { return null; }
    return <div className="conflict-banner" role="alert">
        <span>{session.external ? '磁盘文件已修改，自动保存已暂停。' : '文件无法读取，本地内容仍保留。'}</span>
        <button onClick={() => { void documents.copy(session); }}>另存本地副本</button>
        {session.external && <><button onClick={onReview}>比较差异</button>
            <button onClick={onDisk}>使用磁盘版本</button>
            <button onClick={() => { void documents.keepLocal(session); }}>用本地覆盖</button></>}
    </div>;
}
function SaveStatus({ session }: { session: ISession | undefined }): React.JSX.Element {
    let label = '准备就绪';
    if (session) {
        if (session.status === Status.SAVING) { label = '保存中…'; }
        else if (session.external) { label = '存在外部修改'; }
        else if (session.status === Status.ERROR) { label = '保存失败 · 点击重试'; }
        else if (session.scratch) { label = '未保存'; }
        else { label = isDirty(session) ? '有未保存修改' : '已保存'; }
    }
    return <button className={`save-status ${session?.status === Status.ERROR ? 'error' : ''}`}
        title={session?.error ?? label} onClick={() => { void documents.save(session); }}>
        <span className={session?.status === Status.SAVING ? 'saving-dot' : 'status-dot'} />{label}
    </button>;
}

export function App(): React.JSX.Element {
    useSyncExternalStore(documents.subscribe, documents.snapshot);
    const [workspaces, setWorkspaces] = useState<IWorkspace[]>([]);
    const workspace = sessionWorkspace();
    function sessionWorkspace(): IWorkspace | undefined {
        const active = documents.active;
        if (!active || active.scratch) { return undefined; }
        return [...workspaces].sort((left, right) => right.path.length - left.path.length)
            .find((root) => active.file.path.replaceAll('\\', '/')
                .startsWith(`${root.path.replaceAll('\\', '/').replace(/\/$/, '')}/`));
    }
    const [sidebar, setSidebar] = useState(false);
    const [review, setReview] = useState(false);
    const [dark, setDark] = useState(localStorage.getItem(PREFERENCES.THEME) === 'dark');
    const [pinned, setPinned] = useState(false);
    const [pinBusy, setPinBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState<TDialog>(null);
    const [newName, setNewName] = useState('未命名.md');
    const [recoveries, setRecoveries] = useState<IDraft[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const session = documents.active;
    const quit = useCallback(() => {
        if (documents.sessions.some((item) => isDirty(item) || item.pendingSave)) {
            setDialog({ type: 'quit' });
        } else { void getCurrentWindow().destroy().catch((error) => documents.report(error)); }
    }, []);
    useRuntime(quit);
    useEffect(() => {
        if (documents.sessions.length === 0) { documents.add(sampleFiles()[0], true); }
        void native.drafts().then(setRecoveries).catch((error) => documents.report(error));
        const scratch: IDraft[] = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (!key?.startsWith('inkode.scratch.')) { continue; }
            try { scratch.push(JSON.parse(localStorage.getItem(key) ?? '{}')); }
            catch { /* A malformed local scratch is not opened as a document. */ }
        }
        if (scratch.length) { setRecoveries((previous) => [...previous, ...scratch]); }
        if (NATIVE) {
            void native.workspaces().then(setWorkspaces).catch((error) => documents.report(error));
            const window = getCurrentWindow();
            const requested = localStorage.getItem(PREFERENCES.PIN) === 'true';
            void window.setAlwaysOnTop(requested).then(() => window.isAlwaysOnTop())
                .then(setPinned).catch((error) => documents.report(error));
        }
    }, []);
    useEffect(() => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        localStorage.setItem(PREFERENCES.THEME, dark ? 'dark' : 'light');
    }, [dark]);
    useEffect(() => {
        if (NATIVE) {
            void getCurrentWindow().setTitle(session ? `${session.file.name} · Inkode` : 'Inkode')
                .catch((error) => documents.report(error));
        }
    }, [session?.file.name]);
    useEffect(() => {
        function keydown(event: KeyboardEvent): void {
            const mac = /Mac|iPhone|iPad/.test(navigator.platform);
            if (event.defaultPrevented || !(mac ? event.metaKey : event.ctrlKey) || event.altKey || event.isComposing ||
                dialog || busy || document.querySelector('dialog[open]')) { return; }
            const element = event.target;
            if (element instanceof Element && element.closest('input, textarea, select')) { return; }
            const key = event.key.toLowerCase();
            if (key === 'n' && !event.shiftKey) { setDialog({ type: 'new' }); }
            else if (key === 'o' && !event.shiftKey) { void openFile(); }
            else if (key === 'w' && !event.shiftKey) {
                const active = documents.active;
                if (!active) { return; }
                closeTab(active);
            } else if (key === 's') {
                if (event.shiftKey) { void documents.copy(); } else { void documents.save(); }
            }
            else if (key === 'l' && event.shiftKey) { setSidebar((value) => !value); }
            else if (key === '/' && !event.shiftKey) {
                const active = documents.active;
                if (!active || !isMarkdown(active.file.name) || !active.view?.hasFocus) { return; }
                documents.mode(active.mode === Mode.SOURCE ? Mode.PREVIEW : Mode.SOURCE);
            } else { return; }
            event.preventDefault();
        }
        document.addEventListener('keydown', keydown);
        return () => document.removeEventListener('keydown', keydown);
    }, [dialog, busy]);
    async function pin(): Promise<void> {
        setPinBusy(true);
        try {
            const window = getCurrentWindow();
            await window.setAlwaysOnTop(!pinned);
            const actual = await window.isAlwaysOnTop();
            setPinned(actual);
            localStorage.setItem(PREFERENCES.PIN, String(actual));
        } catch (error) { documents.report(error); }
        finally { setPinBusy(false); }
    }
    function opened(file: IFileData, scratch = false): void {
        documents.add(file, scratch);
        setSidebar(false);
        setReview(false);
    }
    async function openWorkspace(): Promise<void> {
        if (!NATIVE) { documents.report('工作区访问与窗口置顶请使用桌面版；网页可打开单个文件。'); return; }
        setBusy(true);
        try {
            const choice = await native.workspace();
            if (choice) {
                setWorkspaces((previous) => previous.some((root) => root.id === choice.id)
                    ? previous : [...previous, choice]);
                setSidebar(true);
            }
        } catch (error) { documents.report(error); }
        finally { setBusy(false); }
    }
    async function removeWorkspace(id: string): Promise<void> {
        setBusy(true);
        try {
            await native.removeWorkspace(id);
            setWorkspaces((previous) => previous.filter((root) => root.id !== id));
        } catch (error) { documents.report(error); }
        finally { setBusy(false); }
    }
    async function openFile(): Promise<void> {
        if (!NATIVE) { fileInput.current?.click(); return; }
        setBusy(true);
        try { const file = await native.choose(); if (file) { opened(file); } }
        catch (error) { documents.report(error); }
        finally { setBusy(false); }
    }
    async function importFile(file: File | undefined): Promise<void> {
        if (!file) { return; }
        if (file.size > 10 * 1024 * 1024) { documents.report('初版支持 10 MiB 以内的文本文件'); return; }
        opened({ id: crypto.randomUUID(), name: file.name, path: file.name,
            text: await file.text(), revision: '', bom: false, lineEnding: 'LF', readOnly: false }, true);
    }
    function newDocument(event: React.FormEvent): void {
        event.preventDefault();
        const name = newName.trim();
        if (!name || /[\\/]/.test(name)) { return; }
        opened({ id: crypto.randomUUID(), name, path: name, text: '', revision: '',
            bom: false, lineEnding: 'LF', readOnly: false }, true);
        setDialog(null);
    }
    function closeTab(item: ISession): void {
        if (isDirty(item) || item.pendingSave) { setDialog({ type: 'close', session: item }); }
        else { void documents.close(item, false).catch((error) => documents.report(error)); }
    }
    async function finishClose(keepDraft: boolean, save: boolean): Promise<void> {
        setBusy(true);
        try {
            const targets = dialog?.type === 'close' ? [dialog.session] : [...documents.sessions];
            for (const target of targets) {
                if (save) {
                    await documents.save(target);
                    if (isDirty(target) || target.scratch || target.pendingSave ||
                        target.status === Status.ERROR) {
                        documents.report('文件未保存，请先处理冲突或保留草稿。'); return;
                    }
                }
                await documents.close(target, keepDraft);
            }
            if (dialog?.type === 'quit') { await getCurrentWindow().destroy(); }
            setDialog(null);
        } catch (error) { documents.report(error); }
        finally { setBusy(false); }
    }
    async function recover(): Promise<void> {
        setBusy(true);
        try {
            for (const draft of recoveries) {
                if (NATIVE && localStorage.getItem(`inkode.scratch.${draft.id}`)) {
                    documents.recoverScratch(draft);
                } else { await documents.recover(draft); }
            }
            setRecoveries([]);
        } finally { setBusy(false); }
    }
    const position = session?.bundle.state.selection.main.head ?? 0;
    const line = session?.bundle.state.doc.lineAt(position);
    return <div className={`inkode ${review ? 'review-open' : ''}`}>
        <Sidebar workspaces={workspaces} busy={busy} visible={sidebar} onClose={() => setSidebar(false)}
            onWorkspace={() => { void openWorkspace(); }}
            onRemove={(id) => { void removeWorkspace(id); }}
            onActivate={(id) => { documents.activate(id); setSidebar(false); setReview(false); }}
            onNew={() => setDialog({ type: 'new' })}
            onFile={(file) => opened(file)} />
        <main className="workbench">
            <header className="app-header">
                <div className="header-leading">
                    <Tool label="显示文件侧栏" onClick={() => setSidebar(!sidebar)}><Menu size={18} /></Tool>
                    <Tool label="打开文件" disabled={busy} onClick={() => { void openFile(); }}>
                        <FolderOpen size={17} />
                    </Tool>
                    <span className="breadcrumb">{session?.scratch ? '临时目录' : workspace?.name ?? '我的工作台'}<ChevronRight size={13} />
                        <span>{session?.file.name ?? '开始创作'}</span></span>
                </div>
                <div className="header-actions">
                    <label className="autosave-toggle"><input type="checkbox" checked={documents.autosave}
                        onChange={(event) => documents.setAutosave(event.target.checked)} />自动保存</label>
                    <span className="toolbar-separator" />
                    <Tool label={NATIVE ? (pinned ? '取消窗口置顶' : '窗口置顶') : '窗口置顶需要桌面版'}
                        active={pinned} disabled={!NATIVE || pinBusy} onClick={() => { void pin(); }}>
                        {pinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </Tool>
                    <Tool label={dark ? '浅色模式' : '深色模式'} onClick={() => setDark(!dark)}>
                        {dark ? <Sun size={17} /> : <Moon size={17} />}
                    </Tool>
                </div>
            </header>
            <div className="tab-row"><SessionTabs onClose={closeTab} />
                <Tool label="新建文档" onClick={() => setDialog({ type: 'new' })}><FilePlus2 size={16} /></Tool>
            </div>
            <div className="document-toolbar">
                <div className="document-identity"><span className="file-type">
                    {session && isMarkdown(session.file.name) ? <FileText size={17} /> : <Code2 size={17} />}</span>
                    <strong>{session?.file.name ?? 'Inkode'}</strong>
                </div>
                <div className="editor-actions">
                    {session && isMarkdown(session.file.name) && <div className="mode-switch" aria-label="编辑模式">
                        <button className={session.mode === Mode.PREVIEW ? 'active' : ''}
                            aria-pressed={session.mode === Mode.PREVIEW} onClick={() => documents.mode(Mode.PREVIEW)}>
                            即时预览</button>
                        <button className={session.mode === Mode.SOURCE ? 'active' : ''}
                            aria-pressed={session.mode === Mode.SOURCE} onClick={() => documents.mode(Mode.SOURCE)}>源码</button>
                    </div>}
                    <Tool label="查找与替换" disabled={!session} onClick={() => {
                        if (session?.view) { openSearchPanel(session.view); }
                    }}><Search size={16} /></Tool>
                    <Tool label="变更审阅" active={review} disabled={!session} onClick={() => setReview(!review)}>
                        <GitCompareArrows size={17} />
                    </Tool>
                    <Tool label="另存副本" disabled={!session || busy} onClick={() => {
                        void documents.copy();
                    }}><Copy size={16} /></Tool>
                    <button className="save-button" disabled={!session || busy || session.status === Status.SAVING ||
                        session.file.readOnly || !!session.external || session.unavailable}
                        onClick={() => { void documents.save(); }}>
                        <ArrowDownToLine size={15} /><span>保存</span>
                    </button>
                </div>
            </div>
            {session && <Conflict session={session} onReview={() => setReview(true)}
                onDisk={() => setDialog({ type: 'disk', session })} />}
            {session?.file.readOnly && <div className="info-banner">只读文件 · 保留原始编码与换行</div>}
            {recoveries.length > 0 && <div className="recovery-banner">
                <span>发现 {recoveries.length} 份未保存草稿。</span>
                <button disabled={busy} onClick={() => { void recover(); }}>恢复编辑</button>
                <button onClick={() => setRecoveries([])}>稍后</button>
            </div>}
            <div className="editor-layout">
                {session ? <Editor key={session.file.id} session={session} /> : <section className="empty-state">
                    <span className="empty-symbol"><SquarePen size={44} /></span><h1>下一页，写点什么？</h1>
                    <p>打开文字与代码，留在你的思绪里。</p>
                    <div><button className="primary-button" disabled={busy} onClick={() => { void openFile(); }}>
                        <FolderOpen size={16} />打开文件</button>
                    <button className="secondary-button" onClick={() => setDialog({ type: 'new' })}>新建文档</button></div>
                </section>}
                <ShortcutDock session={session} />
                {review && session && <Suspense fallback={<div className="review-panel muted">正在加载差异…</div>}>
                    <Review key={session.file.id} session={session} dark={dark} onClose={() => setReview(false)} />
                </Suspense>}
            </div>
            <footer className="status-bar"><SaveStatus session={session} />
                <div className="status-right">
                    <button onClick={() => { if (session?.view) { gotoLine(session.view); } }}>
                        行 {line?.number ?? 1}，列 {line ? position - line.from + 1 : 1}</button>
                    <span>{session?.file.bom ? 'UTF-8 BOM' : 'UTF-8'}</span>
                    <span>{session?.file.lineEnding ?? 'LF'}</span>
                    <span>{session ? session.bundle.state.doc.length.toLocaleString() : 0} 字符</span>
                </div>
            </footer>
        </main>
        <button className="floating-open" title="打开文件" aria-label="打开文件" disabled={busy}
            onClick={() => { void openFile(); }}><FolderOpen size={18} /><span>打开文件</span><ArrowUpRight size={14} /></button>
        <input hidden ref={fileInput} type="file" onChange={(event) => {
            void importFile(event.target.files?.[0]); event.target.value = '';
        }} />
        {documents.notice && <div className="toast" role="alert"><span>{documents.notice}</span>
            <button className="icon-button" aria-label="关闭提示" onClick={() => {
                documents.notice = ''; documents.emit();
            }}><X size={16} /></button>
        </div>}
        {dialog?.type === 'new' && <Dialog title="新建文档" onClose={() => setDialog(null)}>
            <form onSubmit={newDocument}><label className="form-label">文件名
                <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)}
                    placeholder="未命名.md" required pattern="[^\\/]+" />
            </label><p className="muted">以 .md 结尾开始写作，也可以创建 .ts、.rs 等代码文件。</p>
                <div className="dialog-actions"><button type="button" className="secondary-button"
                    onClick={() => setDialog(null)}>取消</button><button className="primary-button">创建</button></div>
            </form>
        </Dialog>}
        {(dialog?.type === 'close' || dialog?.type === 'quit') &&
            <Dialog title="还有未保存的文字" onClose={() => { if (!busy) { setDialog(null); } }}>
                <p>可以先保存，也可以保留恢复草稿后关闭。</p>
                <div className="dialog-actions wrap">
                    <button className="secondary-button" disabled={busy} onClick={() => setDialog(null)}>继续编辑</button>
                    <button className="text-button danger" disabled={busy} onClick={() => { void finishClose(false, false); }}>放弃修改</button>
                    <button className="secondary-button" disabled={busy} onClick={() => { void finishClose(true, false); }}>保留草稿并关闭</button>
                    <button className="primary-button" disabled={busy} onClick={() => { void finishClose(false, true); }}>
                        <Check size={15} />{busy ? '处理中…' : '保存并关闭'}</button>
                </div>
            </Dialog>}
        {dialog?.type === 'disk' && <Dialog title="使用磁盘版本？" onClose={() => setDialog(null)}>
            <p>当前文档的本地修改将被替换。需要保留时，请先另存副本。</p>
            <div className="dialog-actions"><button className="secondary-button" onClick={() => setDialog(null)}>继续编辑</button>
                <button className="primary-button" onClick={() => {
                    void documents.useDisk(dialog.session); setDialog(null);
                }}>加载磁盘版本</button></div>
        </Dialog>}
    </div>;
}
