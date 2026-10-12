import { EditorSelection, StateEffect } from '@codemirror/state';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

export const refreshPreview = StateEffect.define<null>();
const MAX_DIAGRAM_LENGTH = 50_000;
let diagramNumber = 0;
let renderQueue: Promise<void> = Promise.resolve();
function editButton(view: EditorView, from: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'md-block-edit';
    button.textContent = '编辑源码';
    button.addEventListener('click', () => {
        view.dispatch({ selection: EditorSelection.cursor(from), scrollIntoView: true });
        view.focus();
    });
    return button;
}
const INLINE_TAGS: Record<string, string> = {
    StrongEmphasis: 'strong', Emphasis: 'em', InlineCode: 'code', Strikethrough: 's', Link: 'span',
};
const INLINE_MARKS = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark', 'LinkMark', 'URL', 'LinkTitle']);
function inline(parent: HTMLElement, node: SyntaxNode, source: string): void {
    if (INLINE_MARKS.has(node.name)) { return; }
    if (node.name === 'Escape') {
        parent.append(document.createTextNode(source.slice(node.from + 1, node.to))); return;
    }
    const tag = INLINE_TAGS[node.name];
    const target = tag ? document.createElement(tag) : parent;
    if (node.name === 'Link') { target.className = 'md-link'; }
    let position = node.from;
    for (let child = node.firstChild; child; child = child.nextSibling) {
        target.append(document.createTextNode(source.slice(position, child.from)));
        inline(target, child, source);
        position = child.to;
    }
    target.append(document.createTextNode(source.slice(position, node.to)));
    if (tag) { parent.append(target); }
}
export class TableWidget extends WidgetType {
    constructor(private source: string, private rows: string[][],
        private alignments: string[], private from: number) { super(); }
    eq(other: TableWidget): boolean { return this.source === other.source && this.from === other.from; }
    get estimatedHeight(): number { return this.rows.length * 34 + 40; }
    toDOM(view: EditorView): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'md-table-preview md-block-preview';
        wrapper.append(editButton(view, this.from));
        const scroll = document.createElement('div');
        scroll.className = 'md-table-scroll';
        const table = document.createElement('table');
        table.setAttribute('aria-label', 'Markdown 表格');
        const head = table.createTHead();
        const body = table.createTBody();
        const columns = this.rows[0]?.length ?? 0;
        this.rows.forEach((cells, index) => {
            const row = (index ? body : head).insertRow();
            for (let column = 0; column < columns; column++) {
                const cell = document.createElement(index ? 'td' : 'th');
                cell.style.textAlign = this.alignments[column] || 'left';
                if (!index) { cell.setAttribute('scope', 'col'); }
                const text = cells[column] ?? '';
                inline(cell, markdownLanguage.parser.parse(text).topNode, text);
                row.append(cell);
            }
        });
        scroll.append(table);
        wrapper.append(scroll);
        return wrapper;
    }
    ignoreEvent(): boolean { return true; }
}
export class MermaidWidget extends WidgetType {
    constructor(private source: string, private from: number, private dark: boolean) { super(); }
    eq(other: MermaidWidget): boolean {
        return this.source === other.source && this.from === other.from && this.dark === other.dark;
    }
    get estimatedHeight(): number { return 260; }
    toDOM(view: EditorView): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'md-mermaid-preview md-block-preview';
        const canvas = document.createElement('div');
        canvas.className = 'md-diagram-canvas';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Mermaid 图表');
        canvas.textContent = '正在绘制图表…';
        wrapper.append(editButton(view, this.from), canvas);
        queueMicrotask(() => {
            renderQueue = renderQueue.then(async () => {
                if (!wrapper.isConnected) { return; }
                try {
                    if (this.source.length > MAX_DIAGRAM_LENGTH) { throw new Error('图表过大，请缩短源码'); }
                    const { default: mermaid } = await import('mermaid');
                    if (!wrapper.isConnected) { return; }
                    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict',
                        suppressErrorRendering: true, maxTextSize: MAX_DIAGRAM_LENGTH, maxEdges: 500,
                        theme: this.dark ? 'dark' : 'neutral', htmlLabels: false,
                        flowchart: { htmlLabels: false },
                        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
                            'suppressErrorRendering', 'htmlLabels', 'flowchart', 'theme', 'themeCSS'],
                    });
                    const { svg } = await mermaid.render(`inkode-diagram-${++diagramNumber}`, this.source);
                    if (!wrapper.isConnected) { return; }
                    // Mermaid sanitizes its SVG with strict security; user HTML is never inserted directly.
                    canvas.innerHTML = svg;
                    view.requestMeasure();
                } catch (error) {
                    if (!wrapper.isConnected) { return; }
                    canvas.removeAttribute('role');
                    canvas.classList.add('md-diagram-error');
                    canvas.textContent = `Mermaid 无法预览：${error instanceof Error ? error.message : '语法错误'}。可点击“编辑源码”修正。`;
                    view.requestMeasure();
                }
            }).catch(() => { /* A removed editor must not interrupt the next diagram. */ });
        });
        return wrapper;
    }
    ignoreEvent(): boolean { return true; }
}
