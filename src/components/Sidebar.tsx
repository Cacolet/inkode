import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen, Plus, X, RefreshCw, Minus, Inbox, SquarePen } from 'lucide-react';
import { documents } from '../documents';
import { native } from '../native';
import { isMarkdown, type IEntry, type IFileData, type IWorkspace } from '../types';

function Directory({ workspace, path, onFile }: {
    workspace: IWorkspace; path: string; onFile: (file: IFileData) => void;
}): React.JSX.Element {
    const [entries, setEntries] = useState<IEntry[]>([]);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    useEffect(() => {
        let alive = true;
        void native.directory(workspace.id, path).then((items) => {
            if (alive) { setEntries(items); }
        }).catch(() => { if (alive) { setError('目录读取失败'); } });
        return () => { alive = false; };
    }, [workspace.id, path]);
    async function select(entry: IEntry): Promise<void> {
        if (entry.isDirectory) {
            setExpanded((previous) => {
                const next = new Set(previous);
                if (next.has(entry.path)) { next.delete(entry.path); } else { next.add(entry.path); }
                return next;
            });
            return;
        }
        try { onFile(await native.open(workspace.id, entry.path)); }
        catch (error) { documents.report(error); }
    }
    return <ul className="file-tree">
        {error && <li className="muted">{error}</li>}
        {entries.map((entry) => <li key={entry.path}>
            <button className={`tree-item ${documents.active?.file.path.replaceAll('\\', '/') === `${workspace.path}/${entry.path}`.replaceAll('\\', '/') ? 'selected' : ''}`}
                onClick={() => { void select(entry); }} title={entry.name}>
                {entry.isDirectory ? <>
                    {expanded.has(entry.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Folder size={15} />
                </> : <><span className="tree-indent" />
                    {isMarkdown(entry.name) ? <FileText size={15} /> : <FileCode2 size={15} />}</>}
                <span>{entry.name}</span>
            </button>
            {entry.isDirectory && expanded.has(entry.path) &&
                <Directory workspace={workspace} path={entry.path} onFile={onFile} />}
        </li>)}
        {entries.length === 0 && !error && <li className="empty-directory">空目录</li>}
    </ul>;
}
function WorkspaceRoot({ workspace, busy, onFile, onRemove }: {
    workspace: IWorkspace; busy: boolean; onFile: (file: IFileData) => void;
    onRemove: (id: string) => void;
}): React.JSX.Element {
    const [expanded, setExpanded] = useState(true);
    const [generation, setGeneration] = useState(0);
    return <section className="workspace-root" aria-label={`目录 ${workspace.name}`}>
        <div className="workspace-root-header">
            <button className="root-toggle" aria-expanded={expanded} title={workspace.path}
                onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <FolderOpen size={15} /><span>{workspace.name}</span>
            </button>
            <button className="icon-button root-action" aria-label={`刷新目录 ${workspace.name}`}
                title="刷新目录" onClick={() => setGeneration((value) => value + 1)}>
                <RefreshCw size={13} />
            </button>
            <button className="icon-button root-action remove-root" disabled={busy}
                aria-label={`移除目录 ${workspace.name}`} title="从工作区移除，不删除磁盘文件"
                onClick={() => onRemove(workspace.id)}><Minus size={14} /></button>
        </div>
        {expanded && <Directory key={generation} workspace={workspace} path="" onFile={onFile} />}
    </section>;
}
export function Sidebar({ workspaces, busy, visible, onClose, onWorkspace, onRemove, onNew, onFile, onActivate }: {
    workspaces: IWorkspace[]; busy: boolean; visible: boolean; onClose: () => void;
    onWorkspace: () => void; onRemove: (id: string) => void; onNew: () => void;
    onFile: (file: IFileData) => void; onActivate: (id: string) => void;
}): React.JSX.Element {
    const temporary = documents.sessions.filter((session) => session.scratch);
    return <>
        {visible && <button className="sidebar-backdrop" aria-label="关闭文件侧栏" onClick={onClose} />}
        <aside className={`sidebar ${visible ? 'is-open' : ''}`} aria-label="文件导航">
            <div className="brand"><span className="brand-mark"><SquarePen size={23} /></span>
                <div><strong>Inkode</strong></div>
                <button className="icon-button sidebar-close" aria-label="关闭文件侧栏" onClick={onClose}>
                    <X size={17} />
                </button>
            </div>
            <button className="workspace-button" onClick={onWorkspace} disabled={busy}
                title="添加目录到工作区，支持多个目录">
                <FolderOpen size={17} /><span>添加目录</span><Plus size={15} />
            </button>
            <div className="tree-scroll">
                <div className="sidebar-section"><span>工作区目录</span>
                    <span className="item-count">{workspaces.length}</span>
                </div>
                {workspaces.map((workspace) => <WorkspaceRoot key={workspace.id} workspace={workspace}
                    busy={busy} onFile={onFile} onRemove={onRemove} />)}
                <section className="temporary-directory" aria-label="临时目录">
                    <div className="sidebar-section"><span className="section-label"><Inbox size={14} />临时目录
                        <span className="item-count">{temporary.length}</span></span>
                        <button className="icon-button" aria-label="新建文档" title="新建临时文档" onClick={onNew}>
                            <Plus size={15} />
                        </button>
                    </div>
                    {temporary.map(({ file }) => <button key={file.id}
                        className={`tree-item sample-item ${documents.activeId === file.id ? 'selected' : ''}`}
                        aria-current={documents.activeId === file.id ? 'page' : undefined}
                        title={`${file.name} · 尚未保存为文件`} onClick={() => onActivate(file.id)}>
                        {isMarkdown(file.name) ? <FileText size={16} /> : <FileCode2 size={16} />}
                        <span>{file.name}</span>
                    </button>)}
                </section>
            </div>
        </aside>
    </>;
}
