# 工作台 / IDE 路线图

## Phase 1（已交付）

- 轻量「工作台」页：文件树 + 简易文本编辑 + 右侧本机 Agent
- AI 供应商插件开关（设置 → AI 插件）：Claude / OpenAI(Codex) / 中转等
- Claude 直连支持 Agent 工具（写文件、开浏览器等）
- 本机工具：`write_file` / `open_url` / `open_in_editor` 等

## Phase 2（进行中）

- ✅ Monaco 编辑器：行号、语法高亮、括号配色、minimap
- ✅ Ctrl+单击 / F12 跳转定义（工作区符号粗搜；完整 LSP 待后续）
- ✅ 内置终端：工作台底部面板，`Ctrl+\`` / 菜单「视图 → 切换终端」
- 规划：多标签、Diff 审阅、MCP Host、真 PTY（node-pty）
## Phase 3（终局目标）

完整类 Cursor 体验 + **安装 VS Code 扩展市场中的 Claude / Codex 等扩展**。

该目标实质是嵌入 **Code-OSS / VS Code for Electron**（或等价内核），而不是用 Vue 自研兼容 `.vsix`。届时需单独评估：

- 许可与商标（Code-OSS vs 带品牌 VS Code）
- 安装包体积（通常数百 MB）
- 升级、签名与扩展市场鉴权

工作台与 Provider 配置可迁移为 Code-OSS 侧栏/设置，或继续作为 Agent 后端。
