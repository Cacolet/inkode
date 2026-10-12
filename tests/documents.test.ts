import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentStore, isDirty, textOf } from '../src/documents';
import { Mode } from '../src/types';
import type { IFileData } from '../src/types';
import { native } from '../src/native';

vi.mock('../src/native', () => ({
    NATIVE: false,
    native: { save: vi.fn(), read: vi.fn(), writeDraft: vi.fn(), discardDraft: vi.fn() },
}));
const file: IFileData = { id: 'test', path: '/tmp/test.md', name: 'test.md',
    text: '# Start\n', revision: 'r1', bom: false, lineEnding: 'LF', readOnly: false };
function change(store: DocumentStore, text: string): void {
    const session = store.active!;
    store.dispatch(session, { changes: { from: 0, to: session.bundle.state.doc.length, insert: text } });
}
describe('document consistency', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(native.writeDraft).mockResolvedValue();
        vi.mocked(native.discardDraft).mockResolvedValue();
    });
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks(); });
    it('switches presentation without changing the document or its version', () => {
        const store = new DocumentStore();
        const session = store.add(file);
        change(store, '# Edited\n');
        const version = session.version;
        store.mode(Mode.SOURCE);
        store.mode(Mode.PREVIEW);
        expect(textOf(session)).toBe('# Edited\n');
        expect(session.version).toBe(version);
        expect(isDirty(session)).toBe(true);
    });
    it('keeps edits made during an in-flight save dirty and uses the saved revision', async () => {
        const store = new DocumentStore();
        store.autosave = false;
        const session = store.add(file);
        change(store, 'first');
        let resolve!: (result: IFileData) => void;
        vi.mocked(native.save).mockReturnValue(new Promise((done) => { resolve = done; }));
        const pending = store.save(session);
        change(store, 'second');
        resolve({ ...file, text: 'first', revision: 'r2' });
        await pending;
        expect(session.baseContent).toBe('first');
        expect(session.file.revision).toBe('r2');
        expect(textOf(session)).toBe('second');
        expect(isDirty(session)).toBe(true);
    });
    it('keeps base/local/disk separate on external conflict and refuses autosave', async () => {
        const store = new DocumentStore();
        const session = store.add(file);
        change(store, 'local');
        vi.mocked(native.read).mockResolvedValue({ ...file, text: 'external', revision: 'r2' });
        await store.check(session);
        await store.save(session);
        expect(session.baseContent).toBe(file.text);
        expect(textOf(session)).toBe('local');
        expect(session.external?.text).toBe('external');
        expect(native.save).not.toHaveBeenCalled();
    });
    it('discards an external read started before a local edit', async () => {
        const store = new DocumentStore();
        const session = store.add(file);
        let resolve!: (result: IFileData) => void;
        vi.mocked(native.read).mockReturnValue(new Promise((done) => { resolve = done; }));
        const checking = store.check(session);
        change(store, 'new local edit');
        resolve({ ...file, text: 'old read', revision: 'r2' });
        await checking;
        expect(textOf(session)).toBe('new local edit');
        expect(session.external).toBeUndefined();
    });
    it('reloads a clean document and establishes a fresh base', async () => {
        const store = new DocumentStore();
        const session = store.add(file);
        vi.mocked(native.read).mockResolvedValue({ ...file, text: 'external', revision: 'r2' });
        await store.check(session);
        expect(textOf(session)).toBe('external');
        expect(isDirty(session)).toBe(false);
        expect(session.file.revision).toBe('r2');
    });
    it('restores a scratch into an already-open starter without marking it saved', () => {
        const store = new DocumentStore();
        const session = store.add(file, true);
        store.recoverScratch({ id: file.id, path: file.path, text: 'recovered text',
            baseContent: file.text, baseRevision: file.revision, bom: false, lineEnding: 'LF' });
        expect(store.sessions).toHaveLength(1);
        expect(textOf(session)).toBe('recovered text');
        expect(isDirty(session)).toBe(true);
    });
    it('does not close a dirty document when keeping its draft fails', async () => {
        const store = new DocumentStore();
        const session = store.add(file);
        change(store, 'keep me');
        vi.mocked(native.writeDraft).mockRejectedValue(new Error('disk full'));
        await expect(store.close(session, true)).rejects.toThrow('草稿未写入成功');
        expect(store.sessions).toContain(session);
        expect(textOf(session)).toBe('keep me');
    });

});
