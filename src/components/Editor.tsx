import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { refreshPreview } from '../editor/blocks';
import { documents, type ISession } from '../documents';

export function Editor({ session }: { session: ISession }): React.JSX.Element {
    const parent = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!parent.current) { return; }
        const view = new EditorView({ state: session.bundle.state, parent: parent.current });
        session.view = view;
        const themeObserver = new MutationObserver(() => {
            view.dispatch({ effects: refreshPreview.of(null) });
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const frame = requestAnimationFrame(() => view.focus());
        return () => {
            cancelAnimationFrame(frame);
            themeObserver.disconnect();
            session.bundle.state = view.state;
            session.view = undefined;
            view.destroy();
            if (documents.sessions.includes(session)) { void documents.flushDraft(session); }
        };
    }, [session]);
    return <div className={`editor-host ${session.mode}`} ref={parent} />;
}
