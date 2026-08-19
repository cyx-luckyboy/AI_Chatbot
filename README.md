# 小猪 AI 助手（pig-ai-assistant）— **vchat 总项目**

本仓库为 **Monorepo**：Electron 桌面端 + 奶龙 TTS + Pipecat 语音对话，代码均在 `vchat/` 目录内（见 [`docs/overview.md`](./docs/overview.md)）。

基于 **Electron + Vue 3 + Vite** 的桌面端 AI 对话客户端，支持多家大模型厂商，消息与会话保存在本机 **IndexedDB**。
## 功能概览

- **多会话**：左侧会话列表、新建聊天、设置入口。
- **侧栏**：搜索会话标题/模型名、收起边栏（主区顶栏可展开）、刷新应用（整页重载并恢复当前路由）。
- **对话**：流式回复、Markdown 高亮、附件（文本/PDF/Word/图片多模态）、语音输入（百度 / Web Speech）。
- **消息操作**：助手回复支持复制、朗读、喜欢/不喜欢、导出图片/Markdown、重新生成；用户消息支持导出、引用到输入框。
- **设置**：界面语言与主题、聊天背景、各厂商 Key 与 Base URL（仅存本机）。

## 快速开始

```bash
npm install
npm start          # 开发：Electron + Vite 热更新
```

打包与发布脚本见 `package.json`（如 `npm run package`、`npm run make:zip`）。

## 文档

- **[目录与功能总览](./docs/overview.md)**：域分类、`services` / `vendor`、语音栈启动。
- **[用户使用与开发说明（中文）](./docs/用户与开发说明.md)**：操作步骤、主进程/渲染职责、附件与语音行为。
- **[Pipecat 奶龙语音](./docs/pipecat-nailong-voice.md)**：持续语音对话联调。

## 旁路语音（可选）

```powershell
npm run vendor:link   # 检查 vendor/pipecat 与 vendor/GPT-SoVITS 是否齐全
npm run start:all     # TTS + voice-bot + 桌面端
# 或分别：npm run voice:tts / npm run voice:bot / npm start
```

从旧布局（`E:\Project\pipecat` 与 vchat 平级）迁入：`scripts\migrate-vendor-in.ps1`。

## 说明

- 请使用 **`npm start` 运行桌面端**；仅在浏览器打开 Vite 预览时，部分能力由 `browserElectronShim.ts` 模拟，无法完整对话。
- 大模型 HTTP 请求在 **Electron 主进程** 发出，**渲染进程 DevTools → Network 中通常看不到**接口请求，属正常现象。

## 许可证

MIT（见 `package.json`）。
