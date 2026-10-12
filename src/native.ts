import { invoke, isTauri } from '@tauri-apps/api/core';
import type { IDraft, IEntry, IFileData, IWorkspace } from './types';
import { sampleFiles } from './samples';

export const NATIVE = isTauri();
const BROWSER_DRAFTS = 'inkode.browser-drafts.v1';
const memoryFiles = new Map(sampleFiles().map((file) => [file.id, file]));

export const native = {
    workspaces: (): Promise<IWorkspace[]> => invoke('list_workspaces'),
    removeWorkspace: (id: string): Promise<void> => invoke('remove_workspace', { id }),
    workspace: (): Promise<IWorkspace | null> => invoke('choose_workspace'),
    choose: (): Promise<IFileData | null> => invoke('choose_file'),
    directory: (workspaceId: string, relative: string): Promise<IEntry[]> =>
        invoke('list_directory', { workspaceId, relative }),
    open: (workspaceId: string, relative: string): Promise<IFileData> =>
        invoke('open_document', { workspaceId, relative }),
    read: async (id: string): Promise<IFileData> => {
        if (NATIVE) { return invoke('read_document', { id }); }
        const file = memoryFiles.get(id);
        if (!file) { throw new Error('文件尚未保存'); }
        return { ...file };
    },
    save: async (file: IFileData, text: string): Promise<IFileData> => {
        if (NATIVE) {
            return invoke('save_document', { input: { id: file.id, text,
                expectedRevision: file.revision, bom: file.bom, lineEnding: file.lineEnding } });
        }
        const previous = memoryFiles.get(file.id);
        if (previous && previous.revision !== file.revision) {
            throw { code: 'revisionConflict', message: '文件已变化' };
        }
        const saved = { ...file, text, revision: text };
        memoryFiles.set(file.id, saved);
        return saved;
    },
    saveAs: async (name: string, text: string): Promise<IFileData | null> => {
        if (NATIVE) { return invoke('save_as', { name, text }); }
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: name });
        link.click();
        URL.revokeObjectURL(url);
        return null;
    },
    drafts: async (): Promise<IDraft[]> => {
        if (NATIVE) { return invoke('load_drafts'); }
        return JSON.parse(localStorage.getItem(BROWSER_DRAFTS) ?? '[]');
    },
    writeDraft: async (draft: IDraft): Promise<void> => {
        if (NATIVE) { return invoke('write_draft', { draft }); }
        const all = await native.drafts();
        localStorage.setItem(BROWSER_DRAFTS,
            JSON.stringify([...all.filter((item) => item.id !== draft.id), draft]));
    },
    discardDraft: async (id: string): Promise<void> => {
        if (NATIVE) { return invoke('discard_draft', { id }); }
        const all = await native.drafts();
        localStorage.setItem(BROWSER_DRAFTS, JSON.stringify(all.filter((item) => item.id !== id)));
    },
    restore: async (draft: IDraft): Promise<IFileData | null> => {
        if (NATIVE) { return invoke('restore_draft', { id: draft.id }); }
        return memoryFiles.get(draft.id) ?? null;
    },
    image: async (id: string, relative: string): Promise<string> => {
        if (!NATIVE) { throw new Error('本地图片预览需要桌面版'); }
        const packed = await invoke<string>('load_image', { id, relative });
        const separator = packed.indexOf(';');
        const mime = packed.slice(0, separator);
        const hex = packed.slice(separator + 1);
        const bytes = Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    },
};
