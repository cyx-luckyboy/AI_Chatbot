# domains — 产品能力域

| 目录 | 职责 |
|------|------|
| `chat/` | 对话流水线、联网搜索、附件、会话 stores |
| `meeting/` | 会议录音/转写/总结/翻译 + UI |
| `pet/` | 桌宠窗口、TTS、文字聊；`ui/` 为渲染层 |
| `speech/` | 百度 ASR、WAV、麦克风输入 |
| `workspace/` | 工作台、终端、Agent、Monaco |
| `media/` | 文生图、PPT（`ppt/`）、翻译 |
| `location/` | 定位 |

跨域共享放 `src/shared/`；进程壳在 `src/main|preload|renderer|ipc`。总览见 `docs/overview.md`。
