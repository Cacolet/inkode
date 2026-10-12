import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { runShortcut, SHORTCUTS, shortcutLabel, shortcutsFor } from '../src/editor/shortcuts';

function editor(text: string, ranges = [EditorSelection.range(0, text.length)], readOnly = false): EditorView {
    const view = {
        state: EditorState.create({ doc: text, selection: EditorSelection.create(ranges),
            extensions: [EditorState.allowMultipleSelections.of(true), EditorState.readOnly.of(readOnly)] }),
        dispatch(spec: TransactionSpec): void { view.state = view.state.update(spec).state; },
    };
    return view as unknown as EditorView;
}
function run(id: string, view: EditorView): boolean {
    return runShortcut(SHORTCUTS.find((shortcut) => shortcut.id === id)!, view);
}
describe('editor shortcuts', () => {
    it('wraps and unwraps selection while preserving selected content', () => {
        const view = editor('文字');
        run('bold', view);
        expect(view.state.doc.toString()).toBe('**文字**');
        expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('文字');
        run('bold', view);
        expect(view.state.doc.toString()).toBe('文字');
    });
    it('combines bold and italic without treating bold markers as italic', () => {
        const view = editor('word');
        run('bold', view);
        run('italic', view);
        expect(view.state.doc.toString()).toBe('***word***');
        run('italic', view);
        expect(view.state.doc.toString()).toBe('**word**');
        const selected = editor('**word**');
        run('italic', selected);
        expect(selected.state.doc.toString()).toBe('***word***');
    });
    it('inserts markers around a caret and lets repeated shortcuts remove them', () => {
        const view = editor('ab', [EditorSelection.cursor(1)]);
        run('italic', view);
        expect(view.state.doc.toString()).toBe('a**b');
        expect(view.state.selection.main.head).toBe(2);
        run('italic', view);
        expect(view.state.doc.toString()).toBe('ab');
    });
    it('formats multiple selections in a single transaction', () => {
        const view = editor('one two', [EditorSelection.range(0, 3), EditorSelection.range(4, 7)]);
        run('inline-code', view);
        expect(view.state.doc.toString()).toBe('`one` `two`');
        expect(view.state.selection.ranges.map((range) => view.state.sliceDoc(range.from, range.to))).toEqual(['one', 'two']);
    });
    it('changes heading level and restores paragraphs across selected lines', () => {
        const view = editor('# one\ntwo\nlast', [EditorSelection.range(0, 10)]);
        run('heading-2', view);
        expect(view.state.doc.toString()).toBe('## one\n## two\nlast');
        run('heading-0', view);
        expect(view.state.doc.toString()).toBe('one\ntwo\nlast');
    });
    it('replaces existing list markers and toggles a task list', () => {
        const view = editor('1. one\n- two');
        run('task', view);
        expect(view.state.doc.toString()).toBe('- [ ] one\n- [ ] two');
        run('task', view);
        expect(view.state.doc.toString()).toBe('one\ntwo');
    });
    it('wraps a fence and selects the URL of inserted links', () => {
        const view = editor('text');
        run('fence', view);
        expect(view.state.doc.toString()).toBe('\n```\ntext\n```\n');
        run('fence', view);
        expect(view.state.doc.toString()).toBe('text');
        run('link', view);
        expect(view.state.doc.toString()).toBe('[text](https://)');
        expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('https://');
    });
    it('does not modify read-only documents or expose Markdown actions for code files', () => {
        const view = editor('protected', undefined, true);
        expect(run('bold', view)).toBe(false);
        expect(run('undo', view)).toBe(false);
        expect(view.state.doc.toString()).toBe('protected');
        expect(shortcutsFor(false).some((shortcut) => shortcut.markdown)).toBe(false);
    });
    it('uses the macOS override for both key labels and keyboard bindings', () => {
        const command = SHORTCUTS.find((shortcut) => shortcut.id === 'fence')!;
        expect(shortcutLabel(command, true)).toBe('⌘⌥C');
        expect(shortcutLabel(command, false)).toBe('Ctrl+Shift+K');
    });
});
