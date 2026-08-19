# 会议记录功能 — 增量架构设计

> 版本：v20260530  
> 状态：待确认  
> 需求文档：`docs/requirements/incremental/meeting-record-req-v20260530.md`

---

## 第一章 概述

### 1.1 目的

在 vchat（小猪 AI 助手）Electron 桌面应用中新增**会议记录**模块，实现长时间录音、百度实时 ASR 转写、音频回放（含波形）、录音结束自动 LLM 总结。架构设计遵循现有三进程模型（主进程 / 预加载 / 渲染进程），最大化复用 Provider、IPC、Dexie、safe-file 等既有能力。

原产品：小猪 AI 助手  
原产品 code：vchat  
新增功能：会议记录（Meeting Record）

---

## 第二章 架构设计

### 2.1 逻辑架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        渲染进程 (Vue 3)                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Home.vue │  │ Meetings.vue │  │ components/meeting/*        │ │
│  │ 入口卡片  │→ │ 列表+详情双栏 │  │ Recorder/Player/Waveform  │ │
│  └──────────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│                       │                         │               │
│              stores/meeting.ts (Pinia)          │               │
│              db.meetings (Dexie)                │               │
│                       │                         │               │
│              useMeetingRecorder.ts              │               │
│              (AudioContext → PCM 16k)           │               │
└───────────────────────┼─────────────────────────┼───────────────┘
                        │ IPC (preload.ts)        │
┌───────────────────────┼─────────────────────────┼───────────────┐
│                   主进程 (Node.js)              │               │
│  ┌────────────────────▼─────────────────────────▼─────────────┐ │
│  │ ipc.ts — meeting-* 通道注册                                 │ │
│  └──────┬──────────────────┬──────────────────┬───────────────┘ │
│         │                  │                  │                 │
│  baiduRealtimeAsrMain.ts   meetingAudioMain.ts  meetingSummarizeMain.ts
│  (WebSocket → 百度)        (流式写 WAV)          (LLM 总结)
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                 │
│                            │                                    │
│                   userData/meetings/{id}.wav                    │
└─────────────────────────────────────────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │ 外部服务           │
              │ 百度实时 ASR (WS)  │
              │ 用户配置的 LLM API │
              └───────────────────┘
```

**新增模块清单：**

| 模块 | 路径 | 职责 |
|------|------|------|
| 百度实时 ASR | `src/baiduRealtimeAsrMain.ts` | WebSocket 连接、START/FINISH 帧、音频转发、结果解析 |
| 会议音频 IO | `src/meetingAudioMain.ts` | 流式追加 PCM 写 WAV、删除文件、读取 safe-file URL |
| 会议总结 | `src/meetingSummarizeMain.ts` | LLM Prompt、流式生成、结构化解析 |
| Pinia Store | `src/stores/meeting.ts` | 会议 CRUD、录音状态、选中项 |
| 录音 Composable | `src/speech/useMeetingRecorder.ts` | 麦克风采集、PCM 编码、IPC 发送 |
| 会议页面 | `src/views/Meetings.vue` | 双栏布局、路由 `/meetings` |
| 子组件 | `src/components/meeting/` | 列表、播放器、波形、转写、总结 Tab |

**与已有模块关系：**

- `baiduAsrMain.ts`（REST 短时）— **不修改**，聊天语音输入继续走 REST
- `createProvider.ts` — **复用**，总结生成
- `wavEncode.ts` — **复用**，PCM 编码工具函数
- `safe-file` 协议 — **复用**，音频预览播放

### 2.2 技术架构

无新技术栈引入。新增依赖：

- Node.js 内置 `ws` 或通过 Electron 主进程 `WebSocket`（Node 18+ 原生支持）连接百度
- 渲染进程 `AudioContext` + `ScriptProcessorNode`（或 `AudioWorklet`）采集 PCM

Vite 主进程 bundle：若使用 `ws` 包需加入 `vite.base.config.ts` 的 `bundleIntoElectronMain`；优先使用 Node 18+ 原生 `WebSocket`。

### 2.4 安全设计

- 音频文件仅主进程读写，渲染进程通过 `safe-file:///` 播放
- 百度 AppID/AppKey、LLM Key 仅存主进程 `config.json`，不暴露给渲染进程 DOM
- IPC payload 经 `cloneForIpc` 序列化，音频帧以 `ArrayBuffer` / `Buffer` 传递

### 2.5 业务数据流

#### 2.5.1 录音 + 实时转写

```
1. UI 点击「开始录音」
2. 渲染进程检查 config.baiduAsrAppId + baiduAsrApiKey
3. invoke('meeting-asr-start', { meetingId, devPid: 15372 })
4. 主进程：
   a. 打开 WebSocket wss://vop.baidu.com/realtime_asr?sn={uuid}
   b. 发送 START JSON { appid, appkey, dev_pid, cuid, format: pcm, sample: 16000 }
   c. 创建 userData/meetings/{id}.wav 写入流（仅 data chunk，录音结束补 header）
5. 渲染进程 AudioContext 采集 → 重采样 16k → PCM16 → send('meeting-asr-audio', buffer)
6. 主进程：
   a. 转发 buffer 至 WebSocket（二进制帧）
   b. 追加 PCM 至 WAV 文件流
7. WebSocket 收到 MID_TEXT / FIN_TEXT → send('meeting-asr-result', { type, text, startTime, endTime })
8. 渲染进程追加 transcript → 更新 Dexie + Pinia
9. 用户点击「停止」：
   a. invoke('meeting-asr-stop', { meetingId })
   b. 主进程发送 FINISH 帧 → 关闭 WS → 补全 WAV header → 计算 duration + waveformPeaks
   c. 返回 { durationMs, waveformPeaks }
10. 自动 invoke('meeting-summarize', { meetingId, providerId, model, transcript })
```

#### 2.5.2 AI 总结

```
1. 主进程 meetingSummarizeMain：
   a. 若 transcript > 24000 字：分段（按段落切）→ 每段总结 → 再合并总结
   b. 否则：单次 LLM 调用
2. System Prompt 要求输出固定 JSON 结构：
   { title, overview, sections: [{ heading, bullets: string[] }] }
3. 流式生成 → send('meeting-summary-chunk', { meetingId, partial })
4. 解析完成 → send('meeting-summary-done', { meetingId, title, overview, sections })
5. 渲染进程写入 Dexie，status → completed
```

### 2.6 数据库设计

#### 2.6.1 数据模型（Dexie version 2）

**新增表 `meetings`：**

```typescript
export type MeetingStatus =
  | 'recording'
  | 'transcribed'      // 录音结束，总结进行中
  | 'completed'
  | 'summary_failed'

export interface TranscriptSegment {
  text: string
  startTime?: number   // ms，来自百度 FIN_TEXT
  endTime?: number
  isFinal: boolean
}

export interface SummarySection {
  heading: string
  bullets: string[]
}

export interface MeetingRecordProps {
  id?: number
  title: string
  status: MeetingStatus
  transcript: string                    // 完整转写文本（FIN_TEXT 拼接）
  segments: TranscriptSegment[]         // 带时间戳的分段
  summaryOverview?: string
  summarySections?: SummarySection[]
  audioFileName: string                 // 相对文件名，如 "{id}.wav"
  durationMs: number
  waveformPeaks: number[]               // 归一化 0~1，约 300 点
  providerId: number                    // 总结时使用的厂商
  selectedModel: string
  summaryError?: string
  createdAt: string
  updatedAt: string
}
```

**Dexie 迁移：**

```typescript
db.version(2).stores({
  meetings: '++id, status, createdAt',
})
```

**文件存储：**

- 路径：`{userData}/meetings/{id}.wav`
- 格式：16kHz / mono / 16bit PCM WAV
- 删除记录时主进程同步删文件

#### 2.6.2 配置扩展

`AppConfig` 新增：

```typescript
/** 百度实时语音识别 AppID（控制台应用鉴权信息，WebSocket 必填） */
baiduAsrAppId?: string
```

> **说明**：现有 `baiduAsrApiKey` 在 REST 短时识别中作 OAuth client_id；在实时 WebSocket 中作 START 帧的 `appkey`。`baiduAsrSecretKey` 仅 REST 使用，实时 WS 不需要。`baiduAsrAppId` 为实时 ASR 新增必填项。

### 2.7 接口设计（Electron IPC）

> vchat 无 REST/Dubbo，接口以 IPC 通道定义。

#### 2.7.1 主进程 Handler（invoke）

| 通道 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `meeting-asr-start` | `{ meetingId: number, devPid?: number }` | `{ ok: true, sn: string } \| { ok: false, error }` | 建立 WS + 创建 WAV 写入流 |
| `meeting-asr-stop` | `{ meetingId: number }` | `{ ok: true, durationMs, waveformPeaks } \| { ok: false, error }` | FINISH 帧 + 关闭 + 补 WAV header |
| `meeting-delete-audio` | `{ audioFileName: string }` | `{ ok: boolean }` | 删除音频文件 |
| `meeting-summarize` | `{ meetingId, providerId, providerName, model, transcript }` | `{ ok: true } \| { ok: false, error }` | 异步总结，结果通过 event 推送 |
| `meeting-check-incomplete` | — | `{ meeting?: MeetingRecordProps }` | 启动时检测未完成录音 |

#### 2.7.2 渲染 → 主进程（send，无返回）

| 通道 | 参数 | 说明 |
|------|------|------|
| `meeting-asr-audio` | `{ meetingId, pcm: ArrayBuffer }` | PCM16 音频帧，建议每 100~200ms 一帧 |

#### 2.7.3 主进程 → 渲染（event）

| 通道 | 参数 | 说明 |
|------|------|------|
| `meeting-asr-result` | `{ meetingId, type: 'MID_TEXT'\|'FIN_TEXT', text, startTime?, endTime? }` | 实时转写结果 |
| `meeting-asr-error` | `{ meetingId, error }` | WS 错误或断线 |
| `meeting-summary-chunk` | `{ meetingId, partial: string }` | 总结流式片段 |
| `meeting-summary-done` | `{ meetingId, title, overview, sections }` | 总结完成 |
| `meeting-summary-error` | `{ meetingId, error }` | 总结失败 |

#### 2.7.4 preload 暴露（electronAPI 扩展）

```typescript
meetingAsrStart(payload): Promise<MeetingAsrStartResult>
meetingAsrStop(payload): Promise<MeetingAsrStopResult>
meetingAsrSendAudio(payload): void
onMeetingAsrResult(callback): () => void
onMeetingAsrError(callback): () => void
meetingSummarize(payload): Promise<{ ok: boolean; error?: string }>
onMeetingSummaryChunk(callback): () => void
onMeetingSummaryDone(callback): () => void
onMeetingSummaryError(callback): () => void
meetingDeleteAudio(payload): Promise<{ ok: boolean }>
meetingCheckIncomplete(): Promise<{ meeting?: MeetingRecordProps }>
```

### 2.8 UI 结构

#### 路由

```typescript
{ path: '/meetings', component: Meetings }
{ path: '/meetings/:id', component: Meetings }  // 可选，同一组件内切换选中项
```

#### 页面布局（Meetings.vue）

```
┌────────────────────────────────────────────────────────┐
│ [← 返回]  会议记录                    [开始录音/停止]   │
├──────────────┬─────────────────────────────────────────┤
│ 会议列表      │  详情区                                  │
│ ┌──────────┐ │  ┌─────────────────────────────────────┐│
│ │ 标题      │ │  │ 00:00  ▁▂▃▅▇  [1x ▼] [▶]           ││
│ │ 日期 时长 │ │  └─────────────────────────────────────┘│
│ └──────────┘ │  [实时转写] [AI总结]                     │
│ ...          │  Tab 内容区                              │
└──────────────┴─────────────────────────────────────────┘
```

#### 子组件

| 组件 | 文件 | 职责 |
|------|------|------|
| MeetingList | `MeetingList.vue` | 列表、选中、删除、标题编辑 |
| MeetingRecorderBar | `MeetingRecorderBar.vue` | 开始/停止、计时、状态 |
| MeetingAudioPlayer | `MeetingAudioPlayer.vue` | 播放/暂停、倍速、进度 |
| MeetingWaveform | `MeetingWaveform.vue` | Canvas 波形 + 播放进度指示 |
| MeetingTranscript | `MeetingTranscript.vue` | 转写全文 + 录音中实时追加 |
| MeetingSummary | `MeetingSummary.vue` | 概述 + 分节要点 Markdown 渲染 |

#### 首页入口（Home.vue）

在模型选择区下方增加卡片：

```html
<button @click="router.push('/meetings')" class="...">
  🎙 会议记录
</button>
```

---

## 第三章 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| ASR 引擎 | 百度实时 WebSocket | 用户确认；国内稳定；支持 MID_TEXT 中间结果 |
| dev_pid | 15372（普通话+标点） | 百度推荐；比 1537 更适合会议场景 |
| 音频采集 | 渲染进程 AudioContext | MediaRecorder 输出 WebM 需解码，延迟高；直接 PCM 更低延迟 |
| 音频存储 | 主进程流式写 WAV | 避免长时间录音内存溢出 |
| 波形数据 | 录音结束时预计算 peaks | 避免每次播放重新解码；约 300 点足够渲染 |
| 总结策略 | ≤24k 字单次；超出分段合并 | 控制 token 用量；兼顾长会议 |
| 总结 Provider | 用户在首页/设置选中的当前 Provider | 复用现有配置，不新增专用模型 |
| 数据存储 | Dexie meetings 表 + 本地 WAV | 与现有会话存储模式一致 |

---

## 第四章 百度实时 ASR 协议摘要

- **URL**：`wss://vop.baidu.com/realtime_asr?sn={唯一序列号}`
- **START 帧**（JSON text）：
  ```json
  { "type": "START", "data": { "appid": 123456, "appkey": "xxx", "dev_pid": 15372, "cuid": "vchat-{machineId}", "format": "pcm", "sample": 16000 } }
  ```
- **音频帧**：二进制 PCM16 LE，16000Hz，mono
- **FINISH 帧**（JSON text）：`{ "type": "FINISH" }`
- **结果帧**：
  - `MID_TEXT`：中间结果（实时上屏，可能被修正）
  - `FIN_TEXT`：一句话最终结果（追加到 transcript）

---

## 第五章 异常处理

| 场景 | 处理 |
|------|------|
| 未配置 AppID/ApiKey | 进入会议页 Banner 提示；禁用开始录音 |
| WS 断线 | 保留已转写内容；Toast 提示；允许停止保存 |
| 麦克风拒绝 | Modal 引导开启系统权限 |
| 总结失败 | status=`summary_failed`；显示「重新生成」按钮 |
| 应用崩溃中录音 | 启动时 `meeting-check-incomplete` 检测 `status=recording` 的记录，提示恢复（仅保留已写盘部分）或删除 |
| 转写为空 | 跳过总结；提示「未识别到语音内容」 |

---

## 确认清单

- [ ] 模块拆分与 IPC 契约
- [ ] Dexie meetings 表结构
- [ ] 新增 baiduAsrAppId 配置项
- [ ] 百度实时 WS 主进程实现方案
- [ ] 分段总结策略（24k 字阈值）
- [ ] UI 双栏布局与子组件划分

**确认后可进入实现计划（superu-plan）与开发。**
