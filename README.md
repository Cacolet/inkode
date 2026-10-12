# Inkode

一个本地优先的 Markdown 与代码工作台。名字取自 Ink + Code，使用笔形图标。

基于 React、CodeMirror 6、Tauri 2 和 Rust。当前版本 **0.1.0**，是设计的首个可运行版本。

## 下载与安装

[GitHub Releases](https://github.com/Cacolet/inkode/releases) 提供 macOS Apple Silicon（M1/M2/M3/M4 等，arm64）安装包，要求 macOS 12 或更高。Intel Mac 暂无已验证的安装包。

打开 DMG，将 Inkode 拖入 Applications。当前使用 ad-hoc 签名，**未经过 Apple 开发者身份签名和公证**；首次打开可能被 Gatekeeper 拦截，可在确认下载来自本仓库后，按系统“隐私与安全性”提示允许打开。参见 [Tauri macOS 签名说明](https://v2.tauri.app/distribute/sign/macos/)。

## 从源码启动

```sh
git clone https://github.com/Cacolet/inkode.git
cd inkode
pnpm install --frozen-lockfile
pnpm desktop
```

开发要求：Node.js 22+、pnpm、Rust stable、对应平台的 Tauri 开发依赖。macOS 需要 Xcode Command Line Tools。

全新环境先运行 `cargo fetch --locked --manifest-path src-tauri/Cargo.toml` 获取 Rust 依赖；许可收集脚本使用本地 Cargo 元数据。`pnpm run licenses` 可重新生成 JavaScript 与 Rust 第三方声明。

- `pnpm dev`：网页体验，默认地址 http://127.0.0.1:1420。网页可以编辑、导出文件；工作区访问和窗口置顶使用桌面版。
- `pnpm desktop`：Tauri 开发窗口。
- `pnpm package`：正式编译并打包当前平台应用。
- `pnpm tauri build --debug --bundles app`：快速生成 macOS 开发应用包。
- `pnpm typecheck`、`pnpm test`、`cargo test --manifest-path src-tauri/Cargo.toml`：检查和测试。
- `pnpm test:ui`：先启动开发服务，再运行浏览器交互检查。测试脚本默认使用 macOS 已安装的 Google Chrome；可用 `CHROME_PATH` 指定其他 Chromium 可执行文件。

`pnpm tauri build --bundles app,dmg` 生成当前架构的正式优化构建。Windows/Linux 的源码入口已保留，尚未在这些平台验证。

## 已实现

- 多目录工作区：逐个添加、重复目录去重、独立折叠/刷新/移除，重启后恢复目录列表。移除只取消工作区关联，不删除磁盘文件，也不关闭已打开文档。
- 临时目录统一收纳示例、新建和恢复的未落盘文档；首次保存成功后自动移出，取消保存则保留。
- 按目录懒加载文件树、打开单个文件、多标签和新建文档。
- Markdown 即时预览/源码切换，共享文本、选区和撤销历史。
- 标题、强调、行内代码、多行引用、任务复选框、围栏代码。无序列表显示圆点，任务列表仅显示复选框；除标准 `- [ ]` / `- [x]` 外，支持行首 `[ ]` / `[x]` 简写（Inkode 扩展，保留原始源码）。
- GFM 表格预览：表头、单元格、列对齐、转义竖线和基本行内格式；点击“编辑源码”继续编辑。
- Mermaid 本地图形预览，欢迎文档包含流程图与时序图示例；支持源码编辑、主题切换及语法错误提示。
- 本地同目录 PNG/JPEG/GIF/WebP 图片按点击加载，不自动访问远程图片。
- TS/JS、JSON、CSS、HTML、Rust、Python、YAML、SQL 语法支持。
- 查找替换、跳转行、括号匹配、缩进、撤销重做。
- Typora 风格快捷键；右侧悬浮按钮悬停展开可点击列表，保留当前编辑选区。列表按文档类型显示适用操作，编辑目标失效时不执行。
- 紧凑工具栏、文件树与正文排版，移除侧栏标语、辅助小字及重复格式标签。
- 最近保存基线与当前内容的只读 Diff；有外部冲突时比较磁盘与本地内容。
- 手动保存、800ms 防抖自动保存、持续输入保存上限、草稿恢复。
- Rust 保存前内容哈希校验、同目录临时文件替换、最近一次原文件备份。
- 原生文件事件监听加 3s 轮询兜底、外部冲突横幅和显式处理入口。
- **窗口置顶**：真实 Tauri 窗口开关，启动时恢复上次选择。
- 统一圆角的目录、选中与悬停状态、标签、按钮和编辑区高亮。
- 浅色/深色主题，宽窗口双栏、小于 850px 时文件树进入侧栏、窄窗口 Diff 独占正文区。
- 键盘焦点、关闭未保存文档提示、保留草稿失败时阻止关闭。

示例与新建文件属于草稿，首次保存会选择文件路径。另存副本目前只创建新文件；如果目标已存在会拒绝覆盖，以免丢失未经审阅的内容。

## 快捷键

按键参考 [Typora 官方快捷键表](https://support.typora.io/Shortcut-Keys/)，面板自动显示当前系统的按键。下表的 Mod 在 macOS 是 Command，在 Windows/Linux 是 Ctrl。

| 操作 | Windows/Linux | macOS |
| --- | --- | --- |
| 新建 / 打开 / 关闭文档 | Ctrl+N / O / W | ⌘N / O / W |
| 保存 / 另存副本 | Ctrl+S / Shift+S | ⌘S / ⇧⌘S |
| 加粗 / 斜体 / 链接 | Ctrl+B / I / K | ⌘B / I / K |
| 行内代码 | Ctrl+Shift+反引号 | ⇧⌘反引号 |
| 删除线 | Alt+Shift+5 | ⌃⇧反引号 |
| 标题 1–6 / 正文 | Ctrl+1–6 / 0 | ⌘1–6 / 0 |
| 引用 | Ctrl+Shift+Q | ⌥⌘Q |
| 无序 / 有序列表 | Ctrl+Shift+] / [ | ⌥⌘U / O |
| 代码块 / 表格 | Ctrl+Shift+K / Ctrl+T | ⌥⌘C / T |
| 图片 | Ctrl+Shift+I | ⌃⌘I |
| 切换源码 / 文件侧栏 | Ctrl+/ / Ctrl+Shift+L | ⌘/ / ⇧⌘L |
| 撤销 / 重做 / 查找替换 | Ctrl+Z / Shift+Z / F | ⌘Z / ⇧⌘Z / ⌘F |
| 全选 / 选择当前行 | Ctrl+A / L | ⌘A / L |
| 增加 / 减少缩进 | Ctrl+[ / ] | ⌘[ / ] |
| 任务列表 / 跳转行（Inkode 扩展） | Ctrl+Alt+X / G | ⌥⌘X / G |

将鼠标从编辑区移到右侧键盘按钮上，悬停显示列表；点击操作作用于该编辑区已有的光标或选区，不会按鼠标坐标重新定位光标。面板可滚动，支持点击展开、Tab 导航和 Esc 关闭。没有有效编辑区、切换后旧编辑器已销毁、编辑器被隐藏或正在显示弹窗时，点击不执行，也不显示错误提示。查找框和文件名输入框中的按键不会被当作正文格式操作。

支持的是表内已实现的功能，未复刻 Typora 的全部命令（例如数学公式、下划线和快捷键自定义）。面板中的“查找与替换”共用编辑器搜索栏。浏览器可能保留部分组合键，完整文件快捷键以桌面版为准。

## 保存与恢复

- UTF-8/UTF-8 BOM 可编辑，统一 LF/CRLF 保存时保留，末尾换行不会自动添加。
- 混合换行只读；非 UTF-8、二进制和超过 10 MiB 文件拒绝编辑。大于约 2M 字符的 Markdown 使用源码模式。
- 保存期间继续输入不会错误显示为“已保存”；磁盘与草稿各自维护状态。
- 冲突后暂停自动保存，提供比较、另存副本、加载磁盘版本或明确使用本地覆盖；覆盖仍执行内容修订检查。
- 文件删除或无法读取时保留内存内容，不自动重新创建原文件。
- 文件草稿位于 Tauri app data 的 `drafts/`，最近一次被替换的原始内容位于 `backups/`。macOS 默认在 `~/Library/Application Support/studio.inkode.editor/`。
- 新建/示例草稿保存在应用 WebView 的 localStorage。草稿约 1s 防抖落盘，强制终止可能丢失最后一小段输入；跨重启不恢复完整撤销历史。
- 普通文件系统无法对其他应用的任意写入提供完整 CAS 保证，检查与替换之间仍有极短竞态；保留备份用于恢复。初版拒绝符号链接与硬链接文件。

## 当前边界

- 即时预览基于同一份源码，光标进入表格或 Mermaid 区域时显示源码，离开后恢复预览。表格暂不提供电子表格式单元格编辑，使用“编辑源码”入口。
- 暂不提供数学公式渲染、可执行 HTML、Git 操作、语言服务器、格式化或 AI 模型连接。
- 链接目前显示和编辑文本，不提供文档内导航或系统浏览器打开入口。
- 只读 Diff 在前端防抖计算，总输入超过 500k 字符暂停计算；未迁移到 Worker，也没有按块接受/拒绝。
- 目录树当前不订阅增删事件，可用每个目录右侧的刷新按钮更新文件树；已打开文件的内容监听已接入。
- 同一进程内同一文件去重，保存通过 Rust 状态锁串行处理；当前不保证多个独立应用进程共同编辑的一致性。
- 尚未测定性能 P95、测试全部操作系统输入法、ACL/扩展属性等文件元数据保留。当前通过 macOS 原生启动与置顶检查，不能据此声称三平台兼容已完成。

## 项目结构

```text
src/documents.ts          文档状态、保存队列、冲突、草稿
src/editor/              编辑器配置、Markdown 装饰、语言支持
src/components/          工作台、文件树、Diff、编辑器及对话框
src/native.ts            Tauri commands 和网页体验适配
src-tauri/src/files.rs   编码、修订、原子保存、路径边界与测试
src-tauri/src/lib.rs     原生对话框、监听、草稿、文件 commands
src-tauri/src/workspaces.rs 多目录列表持久化与测试
```

## 许可

Inkode 自有代码以 [MIT License](LICENSE) 开源；第三方依赖遵循各自许可证，见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。本项目独立实现，不包含 Codex 或 Typora 的专有源代码。

本项目是独立桌面应用，使用自己的样式变量和组件，不依赖中台 poppy 运行时。构建时收集第三方许可到 `THIRD_PARTY_NOTICES.txt` 并随应用分发。CodeMirror 使用 MIT；Pierre Diffs 使用 Apache 2.0，具体许可见对应声明。


Mermaid 按需加载，使用[官方渲染 API](https://mermaid.js.org/config/usage)与 strict 模式，不开启图表点击脚本。单个图表源码限 50,000 字符、最多 500 条边，超过时保留源码并显示提示。渲染在本机进行，不调用远程图表服务。
