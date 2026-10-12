export interface IFileData {
    id: string;
    path: string;
    name: string;
    text: string;
    revision: string;
    bom: boolean;
    lineEnding: string;
    readOnly: boolean;
}
export interface IWorkspace { id: string; name: string; path: string }
export interface IEntry { name: string; path: string; isDirectory: boolean }
export interface IDraft {
    id: string; path: string; text: string; baseContent: string;
    baseRevision: string; bom: boolean; lineEnding: string;
}
export const Mode = { PREVIEW: 'preview', SOURCE: 'source' } as const;
export type TMode = typeof Mode[keyof typeof Mode];
export const Status = { READY: 'ready', SAVING: 'saving', ERROR: 'error' } as const;
export type TStatus = typeof Status[keyof typeof Status];
export function isMarkdown(name: string): boolean {
    return /\.(md|markdown)$/i.test(name);
}
export function errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return String(error);
}
