import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, children, onClose }: {
    title: string; children: React.ReactNode; onClose: () => void;
}): React.JSX.Element {
    const reference = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = reference.current;
        const previous = document.activeElement as HTMLElement | null;
        dialog?.showModal();
        return () => { dialog?.close(); previous?.focus(); };
    }, []);
    return <dialog ref={reference} className="dialog" aria-labelledby="dialog-title"
        onCancel={(event) => { event.preventDefault(); onClose(); }}>
        <header><h2 id="dialog-title">{title}</h2>
            <button className="icon-button" aria-label="关闭对话框" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
    </dialog>;
}
