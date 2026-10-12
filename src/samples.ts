import type { IFileData } from './types';

const WELCOME = `# 留一点空间，给想法。\n\n欢迎来到 **Inkode**。一个安静、轻巧的 Markdown 与代码工作台。\n\n## 从这里开始\n\n打开一个文件夹，把文字与代码放在同一张桌面上。修改会自动保存，也可以随时使用 \`⌘ / Ctrl + S\`。\n\n- [x] Markdown 即时预览\n- [x] 代码编辑与语法高亮\n- [ ] 写下你的下一个想法\n\n> 专注眼前这一行，其他的慢慢来。\n> 回车后可以继续写引用。\n\n## 写作，也写代码\n\n选中工具栏的「源码」可以看到原始 Markdown；切换模式不会改变内容，也不会丢失撤销历史。\n\n\`\`\`typescript\ninterface Thought {\n    title: string;\n    ready: boolean;\n}\n\nconst next: Thought = {\n    title: '让想法发生',\n    ready: true,\n};\n\`\`\`\n\n## 一个小计划\n\n| 时间 | 事情 | 状态 |\n| --- | --- | --- |\n| 今天 | 记录灵感 | 进行中 |\n| 明天 | 做出一点东西 | 待开始 |\n\n## Mermaid 流程图\n\n点击图表的「编辑源码」可修改，光标离开代码块后显示图形。\n\n\`\`\`mermaid\nflowchart LR\n    A[记录想法] --> B{开始行动?}\n    B -->|是| C[写下第一行]\n    B -->|稍后| D[保存灵感]\n    C --> E[完成作品]\n    D --> A\n\`\`\`\n\n## Mermaid 时序图\n\n\`\`\`mermaid\nsequenceDiagram\n    participant Writer as 作者\n    participant Inkode\n    Writer->>Inkode: 编辑文档\n    Inkode-->>Writer: 即时预览\n    Writer->>Inkode: 保存\n    Inkode-->>Writer: 已保存\n\`\`\`\n\n---\n\n*Inkode，写下此刻。*\n`;
const CODE = `// 一点灵感，从一行代码开始。\ninterface Note {\n    id: string;\n    title: string;\n    content: string;\n}\n\nexport function createNote(title: string): Note {\n    return {\n        id: crypto.randomUUID(),\n        title,\n        content: '',\n    };\n}\n`;
export function sampleFiles(): IFileData[] {
    return [
        { id: 'welcome', path: '快速开始/欢迎.md', name: '欢迎.md', text: WELCOME },
        { id: 'code', path: '快速开始/灵感.ts', name: '灵感.ts', text: CODE },
        { id: 'notes', path: '快速开始/随手记.md', name: '随手记.md', text: '# 随手记\n\n每一个好想法，都值得被记下来。\n\n- \n' },
    ].map((file) => ({ ...file, revision: file.text, bom: false,
        lineEnding: 'LF', readOnly: false }));
}
