import { EditorSelection, type EditorState } from '@codemirror/state';
import { indentLess, indentMore, redo, selectAll, selectLine, undo } from '@codemirror/commands';
import { openSearchPanel, gotoLine } from '@codemirror/search';
import type { Command, KeyBinding } from '@codemirror/view';

export interface IShortcut {
    id: string; label: string; group: string; key: string; mac?: string;
    markdown?: boolean; changes?: boolean; run: Command;
}
function starRun(state: EditorState, position: number, direction: number): number {
    let count = 0;
    let cursor = direction < 0 ? position - 1 : position;
    while (cursor >= 0 && cursor < state.doc.length && state.sliceDoc(cursor, cursor + 1) === '*') {
        count++;
        cursor += direction;
    }
    return count;
}
function wrap(before: string, after = before): Command {
    return (view) => {
        const { state } = view;
        if (state.readOnly) { return false; }
        view.dispatch(state.changeByRange((range) => {
            const selected = state.sliceDoc(range.from, range.to);
            const italicOutside = before !== '*' ||
                (starRun(state, range.from, -1) % 2 === 1 && starRun(state, range.to, 1) % 2 === 1);
            const outside = italicOutside && range.from >= before.length &&
                state.sliceDoc(range.from - before.length, range.from) === before &&
                state.sliceDoc(range.to, range.to + after.length) === after;
            if (outside) {
                return { changes: [{ from: range.from - before.length, to: range.from },
                    { from: range.to, to: range.to + after.length }],
                range: EditorSelection.range(range.from - before.length, range.to - before.length) };
            }
            const italicInside = before !== '*' ||
                ((selected.match(/^\*+/)?.[0].length ?? 0) % 2 === 1 &&
                    (selected.match(/\*+$/)?.[0].length ?? 0) % 2 === 1);
            if (italicInside && selected.startsWith(before) && selected.endsWith(after) &&
                selected.length >= before.length + after.length) {
                const text = selected.slice(before.length, selected.length - after.length);
                return { changes: { from: range.from, to: range.to, insert: text },
                    range: EditorSelection.range(range.from, range.from + text.length) };
            }
            return { changes: { from: range.from, to: range.to, insert: before + selected + after },
                range: EditorSelection.range(range.from + before.length, range.to + before.length) };
        }));
        return true;
    };
}
function lines(prefix: string, pattern: RegExp): Command {
    return (view) => {
        const { state } = view;
        if (state.readOnly) { return false; }
        const numbers = new Set<number>();
        for (const range of state.selection.ranges) {
            const last = state.doc.lineAt(range.to > range.from ? range.to - 1 : range.to).number;
            for (let number = state.doc.lineAt(range.from).number; number <= last; number++) {
                numbers.add(number);
            }
        }
        const selected = [...numbers].map((number) => state.doc.line(number));
        const remove = prefix !== '' && selected.every((line) => line.text.startsWith(prefix));
        const changes = selected.map((line) => ({ from: line.from,
            to: line.from + (line.text.match(pattern)?.[0].length ?? 0),
            insert: remove ? '' : prefix }));
        view.dispatch({ changes, userEvent: 'input.format' });
        return true;
    };
}
function link(image: boolean): Command {
    return (view) => {
        if (view.state.readOnly) { return false; }
        view.dispatch(view.state.changeByRange((range) => {
            const title = view.state.sliceDoc(range.from, range.to) || (image ? '图片说明' : '链接文字');
            const start = `${image ? '!' : ''}[${title}](`;
            return { changes: { from: range.from, to: range.to, insert: `${start}https://)` },
                range: EditorSelection.range(range.from + start.length, range.from + start.length + 8) };
        }));
        return true;
    };
}
const LIST_PREFIX = /^(?:[-+*] (?:\[[ xX]\] )?|\d+\. )/;
export const SHORTCUTS: IShortcut[] = [
    { id: 'undo', label: '撤销', group: '编辑', key: 'Mod-z', run: undo, changes: true },
    { id: 'redo', label: '重做', group: '编辑', key: 'Mod-Shift-z', run: redo, changes: true },
    { id: 'find', label: '查找与替换', group: '编辑', key: 'Mod-f', run: openSearchPanel },
    { id: 'select-line', label: '选择当前行', group: '编辑', key: 'Mod-l', run: selectLine },
    { id: 'line', label: '跳转行', group: '编辑', key: 'Mod-Alt-g', run: gotoLine },
    { id: 'select', label: '全选', group: '编辑', key: 'Mod-a', run: selectAll },
    { id: 'indent', label: '增加缩进', group: '编辑', key: 'Mod-[', run: indentMore, changes: true },
    { id: 'outdent', label: '减少缩进', group: '编辑', key: 'Mod-]', run: indentLess, changes: true },
    { id: 'bold', label: '加粗', group: '格式', key: 'Mod-b', run: wrap('**'), markdown: true, changes: true },
    { id: 'italic', label: '斜体', group: '格式', key: 'Mod-i', run: wrap('*'), markdown: true, changes: true },
    { id: 'inline-code', label: '行内代码', group: '格式', key: 'Mod-Shift-`', run: wrap('`'), markdown: true, changes: true },
    { id: 'strike', label: '删除线', group: '格式', key: 'Alt-Shift-5', mac: 'Ctrl-Shift-`', run: wrap('~~'), markdown: true, changes: true },
    { id: 'link', label: '链接', group: '格式', key: 'Mod-k', run: link(false), markdown: true, changes: true },
    { id: 'image', label: '图片', group: '格式', key: 'Mod-Shift-i', mac: 'Mod-Ctrl-i', run: link(true), markdown: true, changes: true },
    ...[1, 2, 3, 4, 5, 6, 0].map((level): IShortcut => ({ id: `heading-${level}`,
        label: level ? `${level} 级标题` : '正文', group: '段落', key: `Mod-${level}`,
        run: lines(level ? '#'.repeat(level) + ' ' : '', /^#{1,6} /), markdown: true, changes: true })),
    { id: 'quote', label: '引用', group: '段落', key: 'Mod-Shift-q', mac: 'Mod-Alt-q', run: lines('> ', /^> /), markdown: true, changes: true },
    { id: 'unordered', label: '无序列表', group: '段落', key: 'Mod-Shift-]', mac: 'Mod-Alt-u', run: lines('- ', LIST_PREFIX), markdown: true, changes: true },
    { id: 'ordered', label: '有序列表', group: '段落', key: 'Mod-Shift-[', mac: 'Mod-Alt-o', run: lines('1. ', LIST_PREFIX), markdown: true, changes: true },
    { id: 'task', label: '任务列表', group: '段落', key: 'Mod-Alt-x', run: lines('- [ ] ', LIST_PREFIX), markdown: true, changes: true },
    { id: 'fence', label: '代码块', group: '段落', key: 'Mod-Shift-k', mac: 'Mod-Alt-c', run: wrap('\n```\n', '\n```\n'), markdown: true, changes: true },
    { id: 'table', label: '表格', group: '段落', key: 'Mod-t', mac: 'Mod-Alt-t', run: wrap('\n| 列一 | 列二 |\n| --- | --- |\n| ', ' |  |\n'), markdown: true, changes: true },
];
export function shortcutsFor(markdown: boolean): IShortcut[] {
    return SHORTCUTS.filter((item) => markdown || !item.markdown);
}
export function runShortcut(shortcut: IShortcut, view: Parameters<Command>[0]): boolean {
    if (shortcut.changes && view.state.readOnly) { return false; }
    return shortcut.run(view);
}
export function shortcutKeymap(markdown: boolean): KeyBinding[] {
    return shortcutsFor(markdown).map((shortcut) => ({ key: shortcut.key, mac: shortcut.mac,
        run: (view) => runShortcut(shortcut, view) }));
}
export function shortcutLabel(shortcut: Pick<IShortcut, 'key' | 'mac'>, mac: boolean): string {
    return (mac ? shortcut.mac ?? shortcut.key : shortcut.key).split('-').map((part) => {
        if (part === 'Mod') { return mac ? '⌘' : 'Ctrl'; }
        if (part === 'Ctrl') { return mac ? '⌃' : 'Ctrl'; }
        if (part === 'Alt') { return mac ? '⌥' : 'Alt'; }
        if (part === 'Shift') { return mac ? '⇧' : 'Shift'; }
        return part.toUpperCase();
    }).join(mac ? '' : '+');
}
