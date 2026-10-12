import { StateField, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { MermaidWidget, TableWidget, refreshPreview } from './blocks';
import { native } from '../native';

const MAX_PREVIEW_LENGTH = 2 * 1024 * 1024;
const HIDDEN_MARKS = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'QuoteMark']);

class BulletWidget extends WidgetType {
    eq(): boolean { return true; }
    toDOM(): HTMLElement {
        const bullet = document.createElement('span');
        bullet.className = 'md-list-bullet';
        bullet.textContent = '•';
        bullet.setAttribute('aria-hidden', 'true');
        return bullet;
    }
}

class TaskWidget extends WidgetType {
    constructor(private checked: boolean, private from: number) { super(); }
    eq(other: TaskWidget): boolean { return this.checked === other.checked && this.from === other.from; }
    toDOM(view: EditorView): HTMLElement {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = this.checked;
        box.disabled = view.state.readOnly;
        box.setAttribute('aria-label', '切换任务状态');
        box.className = 'md-task';
        box.addEventListener('change', () => {
            if (view.state.readOnly) { return; }
            view.dispatch({ changes: { from: this.from + 1, to: this.from + 2,
                insert: box.checked ? 'x' : ' ' } });
        });
        return box;
    }
    ignoreEvent(): boolean { return true; }
}
class ImageWidget extends WidgetType {
    private objectUrl?: string;
    constructor(private id: string, private url: string, private alt: string) { super(); }
    eq(other: ImageWidget): boolean { return this.url === other.url && this.id === other.id; }
    toDOM(view: EditorView): HTMLElement {
        const wrapper = document.createElement('span');
        const button = document.createElement('button');
        button.className = 'md-image-button';
        button.textContent = `▧ ${this.alt || '图片'} · 点击加载`;
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                if (/^[a-z]+:|^\/\//i.test(this.url)) {
                    throw new Error('初版不加载远程图片');
                }
                this.objectUrl = await native.image(this.id, decodeURIComponent(this.url));
                if (!wrapper.isConnected) { URL.revokeObjectURL(this.objectUrl); return; }
                const image = Object.assign(document.createElement('img'), {
                    src: this.objectUrl, alt: this.alt, className: 'md-image',
                });
                image.addEventListener('load', () => view.requestMeasure());
                wrapper.replaceChildren(image);
            } catch (error) {
                button.textContent = error instanceof Error ? error.message : '图片无法加载';
            }
        });
        wrapper.append(button);
        return wrapper;
    }
    destroy(): void { if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); } }
    ignoreEvent(): boolean { return true; }
}

function decorate(state: import('@codemirror/state').EditorState, id: string): DecorationSet {
    if (state.doc.length > MAX_PREVIEW_LENGTH) { return Decoration.none; }
    const ranges: Range<Decoration>[] = [];
    const shorthandMarkers: { from: number; to: number }[] = [];
    const selected = (from: number, to: number): boolean => state.selection.ranges.some(
        (range) => range.empty ? range.from >= from && range.from <= to
            : range.from < to && range.to > from,
    );
    const lineClass = (position: number, className: string): void => {
        ranges.push(Decoration.line({ class: className }).range(state.doc.lineAt(position).from));
    };
    syntaxTree(state).iterate({
        enter(node) {
            const { name, from, to } = node;
            const parent = node.node.parent;
            const active = parent ? selected(parent.from, parent.to) : selected(from, to);
            if (shorthandMarkers.some((marker) => from >= marker.from && to <= marker.to)) {
                return false;
            }
            // Standalone checkboxes are an Inkode convenience; never rewrite the document.
            if (name === 'Paragraph' && parent?.name === 'Document') {
                const end = state.doc.lineAt(to).number;
                for (let number = state.doc.lineAt(from).number; number <= end; number++) {
                    const line = state.doc.line(number);
                    const match = /^( {0,3})\[([ xX])\](?=\s|$)/.exec(line.text);
                    if (!match) { continue; }
                    const markerFrom = line.from + match[1].length;
                    const markerTo = markerFrom + 3;
                    if (!selected(markerFrom, markerTo)) {
                        shorthandMarkers.push({ from: markerFrom, to: markerTo });
                        ranges.push(Decoration.replace({ widget: new TaskWidget(match[2] !== ' ', markerFrom) })
                            .range(markerFrom, markerTo));
                    }
                }
            }
            if (name === 'ListMark') {
                if (parent?.getChild('Task')) {
                    // The checkbox is the task marker; suppress the extra list marker and gap.
                    const gap = /^[ \t]+/.exec(state.sliceDoc(to, state.doc.lineAt(to).to))?.[0].length ?? 0;
                    ranges.push(Decoration.replace({}).range(from, to + gap));
                } else if (parent?.parent?.name === 'BulletList' &&
                    /^[ \t]/.test(state.sliceDoc(to, state.doc.lineAt(to).to))) {
                    ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to));
                }
                return false;
            }
            if (/^ATXHeading[1-6]$/.test(name)) {
                lineClass(from, `md-heading md-h${name.slice(-1)}`);
            }
            if (name === 'Blockquote') {
                const end = state.doc.lineAt(to).number;
                for (let number = state.doc.lineAt(from).number; number <= end; number++) {
                    lineClass(state.doc.line(number).from, 'md-quote');
                }
            }
            if (name === 'Table' && !selected(from, to)) {
                const header = node.node.getChild('TableHeader');
                const rows = [header, ...node.node.getChildren('TableRow')].filter((row) => row !== null)
                    .map((row) => row.getChildren('TableCell').map((cell) => state.sliceDoc(cell.from, cell.to)));
                const delimiter = node.node.getChild('TableDelimiter');
                const alignments = delimiter ? state.sliceDoc(delimiter.from, delimiter.to).trim()
                    .replace(/^\||\|$/g, '').split('|').map((cell) => {
                        const value = cell.trim();
                        if (value.startsWith(':') && value.endsWith(':')) { return 'center'; }
                        return value.endsWith(':') ? 'right' : 'left';
                    }) : [];
                ranges.push(Decoration.replace({ block: true,
                    widget: new TableWidget(state.sliceDoc(from, to), rows, alignments, from),
                }).range(from, to));
                return false;
            }
            if (name === 'TableHeader') { lineClass(from, 'md-table-header'); }
            if (name === 'TableRow' || name === 'TableDelimiter') { lineClass(from, 'md-table-row'); }
            if (name === 'FencedCode') {
                const start = state.doc.lineAt(from).number;
                const end = state.doc.lineAt(to).number;
                const opening = state.doc.line(start).text.match(/^ {0,3}(`{3,}|~{3,})\s*mermaid\s*$/i);
                const closing = state.doc.line(end).text.trim();
                const complete = opening && closing.length >= opening[1].length &&
                    [...closing].every((char) => char === opening[1][0]);
                if (complete && end > start && !selected(from, to)) {
                    const source = state.sliceDoc(state.doc.line(start).to + 1, state.doc.line(end).from);
                    const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
                    ranges.push(Decoration.replace({ block: true,
                        widget: new MermaidWidget(source, state.doc.line(start).to + 1, dark),
                    }).range(from, to));
                    return false;
                }
                for (let line = start; line <= end; line++) {
                    lineClass(state.doc.line(line).from, 'md-code-block');
                }
                return false;
            }
            const marks: Record<string, string> = {
                StrongEmphasis: 'md-strong', Emphasis: 'md-emphasis',
                InlineCode: 'md-inline-code', Strikethrough: 'md-strike', Link: 'md-link',
            };
            if (marks[name]) {
                ranges.push(Decoration.mark({ class: marks[name] }).range(from, to));
            }
            if (name === 'TaskMarker' && !selected(from, to)) {
                const checked = /x/i.test(state.sliceDoc(from, to));
                ranges.push(Decoration.replace({ widget: new TaskWidget(checked, from) }).range(from, to));
                return false;
            }
            if (name === 'Image' && !selected(from, to)) {
                const source = state.sliceDoc(from, to);
                const match = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)$/.exec(source);
                if (match) {
                    ranges.push(Decoration.replace({ widget: new ImageWidget(id, match[2], match[1]) })
                        .range(from, to));
                    return false;
                }
            }
            if (HIDDEN_MARKS.has(name) && !(name === 'QuoteMark' ?
                selected(state.doc.lineAt(from).from, state.doc.lineAt(from).to) : active)) {
                ranges.push(Decoration.replace({}).range(from, to));
            }
        },
    });
    return Decoration.set(ranges, true);
}
export function markdownPresentation(id: string): StateField<DecorationSet> {
    return StateField.define<DecorationSet>({
        create: (state) => decorate(state, id),
        update(value, transaction) {
            if (transaction.docChanged || transaction.selection ||
                transaction.effects.some((effect) => effect.is(refreshPreview)) ||
                syntaxTree(transaction.startState) !== syntaxTree(transaction.state)) {
                return decorate(transaction.state, id);
            }
            return value;
        },
        provide: (field) => EditorView.decorations.from(field),
    });
}
