# 项目总览 — vchat 总项目（Monorepo）

**`vchat` 即总项目根目录**，桌面端、旁路服务源码、启动脚本均在此仓库内。

## 目录树

```text
vchat/
├── src/                        # Electron 桌面应用
│   ├── main|preload|renderer|ipc|providers|shared
│   └── domains/                # chat / meeting / pet / speech / workspace / media / location
├── services/
│   └── voice-bot/bot.py        # Pipecat 奶龙语音 bot（业务脚本）
├── vendor/
│   ├── pipecat/                # Pipecat 框架（完整源码）
│   └── GPT-SoVITS/             # 奶龙 TTS（完整源码 + 权重，权重见 .gitignore）
├── scripts/                    # 启动、状态检查、一次性迁移
├── public/                     # live2d、桌宠资源
└── docs/
```

## 功能与服务对应

| 能力 | 代码位置 | 运行时 |
|------|----------|--------|
| 桌面客户端 | `src/` | `npm start` |
| 奶龙 TTS | `vendor/GPT-SoVITS/` | `:9880` |
| 持续语音对话 | `services/voice-bot/` + `vendor/pipecat/` | WS `:8765` |
| 服务管理 UI | 设置 → 外观 → 旁路服务 | Electron IPC |

## 常用命令

```powershell
npm run vendor:link       # 检查 vendor 是否齐全
npm run services:status   # TTS / voice-bot 状态
npm run voice:tts         # 启动 TTS
npm run voice:bot         # 启动 Pipecat bot
npm run start:all         # TTS + bot + 桌面端
npm start                 # 仅桌面端
```

## 从旧布局迁移

若 `pipecat`、`GPT-SoVITS` 仍在 `E:\Project\` 与 `vchat` 平级：

```powershell
.\scripts\migrate-vendor-in.ps1
```

迁移完成后可删除旧目录（需先停止占用中的 TTS 进程）。
