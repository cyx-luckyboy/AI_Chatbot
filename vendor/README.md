# vendor — 旁路服务源码（已纳入 monorepo）

本目录包含 **完整旁路服务代码**，与桌面端同属 `vchat` 仓库：

| 目录 | 说明 | 默认端口 |
|------|------|----------|
| `pipecat/` | Pipecat 语音框架源码 | — |
| `GPT-SoVITS/` | 奶龙 TTS 服务 + 权重 | HTTP `9880` |

业务 bot 脚本在仓库 `services/voice-bot/bot.py`（不在此目录）。

## 启动

```powershell
npm run voice:tts      # vendor/GPT-SoVITS
npm run voice:bot      # services/voice-bot + vendor/pipecat
npm run services:status
```

`.gitignore` 会忽略各 vendor 下的 `.venv/`、大权重目录等；**源码在仓库内**。

若仍保留旧的 `E:\Project\GPT-SoVITS` 副本（迁移前 TTS 未停），可确认 `vendor/GPT-SoVITS` 可用后手动删除旧目录。
