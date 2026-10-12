import { useEffect, useState } from 'react';
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import { Columns2, AlignJustify, X } from 'lucide-react';
import { textOf, type ISession } from '../documents';

const DIFF_DELAY = 250;
const DIFF_LIMIT = 500_000;
export default function Review({ session, dark, onClose }: {
    session: ISession; dark: boolean; onClose: () => void;
}): React.JSX.Element {
    const [split, setSplit] = useState(false);
    const [content, setContent] = useState(textOf(session));
    const current = textOf(session);
    const original = session.external?.text ?? session.baseContent;
    useEffect(() => {
        const timer = setTimeout(() => setContent(current), DIFF_DELAY);
        return () => clearTimeout(timer);
    }, [current]);
    const tooLarge = content.length + original.length > DIFF_LIMIT;
    const diff = tooLarge ? null : parseDiffFromFile(
        { name: session.file.name, contents: original },
        { name: session.file.name, contents: content },
    );
    return <section className="review-panel" aria-label="差异审阅">
        <header className="review-heading">
            <div><strong>变更审阅</strong><small>{session.external ? '磁盘版本' : '保存基线'} → 当前内容</small></div>
            <button className="icon-button" title={split ? '统一视图' : '左右视图'}
                aria-label={split ? '统一视图' : '左右视图'} onClick={() => setSplit(!split)}>
                {split ? <AlignJustify size={16} /> : <Columns2 size={16} />}
            </button>
            <button className="icon-button" aria-label="关闭审阅" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="review-content">
            {tooLarge ? <p className="muted">文件较大，初版暂停差异渲染以保持编辑流畅。</p>
                : diff && <FileDiff fileDiff={diff} disableWorkerPool options={{
                    theme: { light: 'github-light', dark: 'github-dark' },
                    themeType: dark ? 'dark' : 'light', diffStyle: split ? 'split' : 'unified',
                    overflow: 'wrap', disableFileHeader: true,
                }} />}
        </div>
    </section>;
}
