import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { documents, isDirty, Timing } from './documents';
import { NATIVE } from './native';

export function useRuntime(onQuit: () => void): void {
    useEffect(() => {
        const timer = setInterval(() => { void documents.checkAll(); }, Timing.POLL);
        const focus = (): void => { void documents.checkAll(); };
        const beforeUnload = (event: BeforeUnloadEvent): void => {
            if (documents.sessions.some(isDirty)) { event.preventDefault(); }
        };
        window.addEventListener('focus', focus);
        window.addEventListener('beforeunload', beforeUnload);
        let disposed = false;
        const cleaners: (() => void)[] = [];
        function register(cleaner: () => void): void {
            if (disposed) { cleaner(); } else { cleaners.push(cleaner); }
        }
        if (NATIVE) {
            void listen('disk-change', focus).then(register).catch((error) => documents.report(error));
            void getCurrentWindow().onCloseRequested((event) => {
                event.preventDefault();
                onQuit();
            }).then(register).catch((error) => documents.report(error));
        }
        return () => {
            disposed = true;
            clearInterval(timer);
            window.removeEventListener('focus', focus);
            window.removeEventListener('beforeunload', beforeUnload);
            for (const cleaner of cleaners) { cleaner(); }
        };
    }, [onQuit]);
}
