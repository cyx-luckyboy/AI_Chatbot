# Pipecat 奶龙语音对话

桌宠窗口右上角的“麦”按钮会打开持续语音会话。前端发送 16-bit mono PCM（16 kHz），Pipecat 负责 VAD、轮次判断、打断、STT 和 LLM，回复通过本地 GPT-SoVITS `/tts` 合成为奶龙音色并以 24 kHz PCM 返回。

## 启动

先启动奶龙 TTS 服务，确认 `http://127.0.0.1:9880/tts` 可用。然后在本项目 `.env` 填好 Pipecat 的 LLM 和 STT 配置：

```env
PIPECAT_LLM_API_KEY=sk-...
PIPECAT_LLM_BASE_URL=https://api.openai.com/v1
PIPECAT_LLM_MODEL=gpt-4o-mini
PIPECAT_STT_API_KEY=sk-...
PIPECAT_STT_BASE_URL=https://api.openai.com/v1
# 优先复用项目设置中的百度 ASR，不需要额外 STT key
# BAIDU_ASR_API_KEY=...
# BAIDU_ASR_SECRET_KEY=...
# BAIDU_ASR_DEV_PID=1537
PIPECAT_STT_MODEL=gpt-4o-mini-transcribe
NAILONG_TTS_BASE_URL=http://127.0.0.1:9880
```

在 PowerShell 启动 Pipecat 服务（bot 位于 `services/voice-bot/bot.py`）：

```powershell
.\scripts\link-vendor.ps1          # 首次：联接 vendor/pipecat 与 vendor/GPT-SoVITS
.\scripts\start-voice-bot.ps1
# 兼容旧名：
.\scripts\start-pipecat-nailong.ps1
```

脚本使用仓库内 `vendor/pipecat` 与 `services/voice-bot/bot.py`。首次运行会由 `uv` 创建/同步 Pipecat 运行环境。

```powershell
.\scripts\start-voice-bot.ps1
# 兼容旧名：
.\scripts\start-pipecat-nailong.ps1
```

自定义 Pipecat 路径（一般不需要）：

```powershell
.\scripts\start-voice-bot.ps1 -PipecatRoot 'D:\other\pipecat'
```

一条龙：`.\scripts\start-all.ps1`。目录约定见 `docs/overview.md`。

启动 Electron 后，点击桌宠右上角“麦”并允许麦克风权限。奶龙正在回复时直接开口即可打断，前端会立即清空播放队列，Pipecat 的 `InterruptionFrame` 会同步取消服务端当前 TTS。

## 注意

LLM 会复用项目 `.env` 中的 AIPAIBOX_API_KEY 和 AIPAIBOX_BASE_URL；若环境变量为空，也会读取 Electron 用户配置中的 OpenAI 兼容 provider。模型名请将 `PIPECAT_LLM_MODEL` 设置为当前桌宠会话使用的模型。语音识别优先读取 Electron 配置中已有的百度 ASR 凭据（也可以使用 BAIDU_ASR_API_KEY 和 BAIDU_ASR_SECRET_KEY 覆盖），不需要单独的 OpenAI STT key。

只有找不到百度配置时，才会回退到 OpenAI 兼容的 /audio/transcriptions 接口；纯文本聊天网关通常不提供这个接口。GPT-SoVITS 是本地 TTS，不需要 key。

百度 ASR 使用实时 WebSocket，AppID、API Key 和 Secret Key 会优先从 Electron 配置读取；实时连接只在桌宠客户端发送音频后建立，避免空闲连接被百度关闭。