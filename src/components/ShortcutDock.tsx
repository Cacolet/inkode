import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { Keyboard, X } from 'lucide-react';
import { documents, type ISession } from '../documents';
import { runShortcut, shortcutLabel, shortcutsFor, type IShortcut } from '../editor/shortcuts';
import { isMarkdown, Mode } from '../types';

export function ShortcutDock({ session }: { session: ISession | undefined }): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const dock = useRef<HTMLDivElement>(null);
    const target = useRef<EditorView | null>(null);
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    useEffect(() => {
        function track(event: Event): void {
            const element = event.target;
            if (!(element instanceof Element) || dock.current?.contains(element)) { return; }
            const view = documents.active?.view;
            target.current = view && element.closest('.editor-host')?.contains(view.dom) ? view : null;
        }
        function escape(event: KeyboardEvent): void {
            if (event.key === 'Escape') { setOpen(false); }
        }
        document.addEventListener('pointerover', track);
        document.addEventListener('focusin', track);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerover', track);
            document.removeEventListener('focusin', track);
            document.removeEventListener('keydown', escape);
        };
    }, []);
    function execute(shortcut: IShortcut): void {
        const view = target.current;
        if (!view || view !== documents.active?.view || !view.dom.isConnected ||
            !view.dom.getClientRects().length || document.querySelector('dialog[open]')) { return; }
        if (runShortcut(shortcut, view) && !['find', 'line'].includes(shortcut.id)) { view.focus(); }
    }
    const shortcuts: IShortcut[] = [
        { id: 'save', label: '保存', group: '文档', key: 'Mod-s', run: () => {
            void documents.save(); return true;
        } },
        { id: 'copy', label: '另存副本', group: '文档', key: 'Mod-Shift-s', run: () => {
            void documents.copy(); return true;
        } },
        ...(session && isMarkdown(session.file.name) ? [{ id: 'source', label: '切换源码',
            group: '文档', key: 'Mod-/', run: () => {
                documents.mode(documents.active?.mode === Mode.SOURCE ? Mode.PREVIEW : Mode.SOURCE);
                return true;
            } } as IShortcut] : []),
        ...shortcutsFor(!!session && isMarkdown(session.file.name)),
    ];
    const groups = ['格式', '段落', '编辑', '文档']
        .filter((group) => shortcuts.some((shortcut) => shortcut.group === group));
    return <div className="shortcut-dock" ref={dock} onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)} onFocusCapture={() => setOpen(true)}
        onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); }
        }}>
        <button className="shortcut-trigger" aria-label="快捷键" title="快捷键"
            aria-expanded={open} aria-controls="shortcut-panel" onClick={() => setOpen(true)}>
            <Keyboard size={19} />
        </button>
        {open && <section id="shortcut-panel" className="shortcut-panel" aria-label="快捷键列表">
            <header><strong>快捷键</strong>
                <button className="icon-button" aria-label="关闭快捷键" onClick={() => setOpen(false)}>
                    <X size={15} />
                </button>
            </header>
            <div className="shortcut-scroll">
                {groups.map((group) => <div className="shortcut-group" key={group}>
                    <h3>{group}</h3>
                    {shortcuts.filter((shortcut) => shortcut.group === group).map((shortcut) =>
                        <button key={shortcut.id} aria-label={shortcut.label} className="shortcut-item"
                            disabled={!!shortcut.changes && !!session?.file.readOnly}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => execute(shortcut)}>
                            <span>{shortcut.label}</span><kbd>{shortcutLabel(shortcut, mac)}</kbd>
                        </button>)}
                </div>)}
            </div>
        </section>}
    </div>;
}
