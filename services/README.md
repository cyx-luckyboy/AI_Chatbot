# 旁路服务（services）

与桌面端同仓，源码在 `vendor/` + 本目录。

| 路径 | 作用 | 端口 |
|------|------|------|
| `vendor/GPT-SoVITS/` | 奶龙 TTS | HTTP `9880` |
| `vendor/pipecat/` | Pipecat 框架 | — |
| `services/voice-bot/bot.py` | 奶龙持续语音 bot | WS `8765` |

## 启动

```powershell
npm run vendor:link
npm run voice:tts
npm run voice:bot
npm start
# 或 npm run start:all
```

环境变量：根目录 `.env.example`（`NAILONG_TTS_*`、`PIPECAT_*`、`BAIDU_ASR_*`）。
