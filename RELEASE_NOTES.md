# Inkode v0.1.0

首个开源版本：本地优先的 Markdown 与代码工作台，MIT License。

## macOS 下载

- `Inkode_0.1.0_aarch64.dmg`：Apple Silicon Mac（M 系列），macOS 12+。打开后将 Inkode 拖入 Applications。
- `Inkode_0.1.0_aarch64.app.zip`：同一应用的 ZIP 版本，解压后移入 Applications。
- `SHA256SUMS.txt`：两个安装包的 SHA-256 校验值。

这些是 **release 优化构建**，使用 ad-hoc 签名。尚未使用 Apple Developer ID 签名或公证，首次打开可能出现安全提示；请确认来源和校验值，再按系统“隐私与安全性”的提示允许打开。参见 [macOS 签名说明](https://v2.tauri.app/distribute/sign/macos/)。Intel Mac、Windows 和 Linux 暂无已验证安装包。

## 功能

- Markdown 即时预览/源码编辑，代码高亮、查找替换、撤销重做。
- 表格、引用、可勾选任务、无序列表与 Mermaid 预览。`-` 后跟空格才显示列表圆点。
- 多目录工作区、临时文档、多标签、自动保存、草稿恢复、外部修改冲突处理。
- 窗口置顶、明暗主题、紧凑圆角界面、响应式侧栏。
- Typora 风格快捷键与右侧可点击快捷键列表。

## 验证与限制

TypeScript 检查、16 项前端单元测试、5 项 Rust 测试通过；列表、引用、表格和 Mermaid 浏览器交互已验证。当前仍为早期版本，不提供数学公式、语言服务器或 Git 集成；完整边界见 [README](https://github.com/Cacolet/inkode#当前边界)。

应用自有代码为 MIT；JavaScript/Rust 第三方许可随应用附带。源码、许可证、构建脚本与锁文件均公开。
