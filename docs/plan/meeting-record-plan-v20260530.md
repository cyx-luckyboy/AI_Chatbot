# 会议记录功能 — 实现计划

> 版本：v20260530  
> 架构文档：`docs/architecture/incremental/meeting-record-arch-v20260530.md`  
> ADR：`docs/architecture/meeting-record-adr-v20260530.md`

---

## 目标

实现会议记录 MVP：首页入口 → 录音实时转写 → 音频回放（波形）→ 自动 AI 总结 → 列表管理。

## 验收标准（整体）

- [ ] 配置百度 AppID + ApiKey 后，可开始录音并实时看到转写文字
- [ ] 停止录音后音频保存到本地，可回放（0.5x~2x 倍速）并显示波形
- [ ] 停止后自动生成 AI 标题 + 结构化总结
- [ ] 历史会议列表可查看、编辑标题、删除（含音频文件）
- [ ] 未配置 ASR 时无法开始录音并有明确提示
- [ ] 不影响现有聊天语音输入功能

---

## 实现任务

### Layer 0：数据层与类型

- [ ] **T1**：`types.ts` 新增 `MeetingRecordProps`、`MeetingStatus`、`TranscriptSegment`、`SummarySection` 及 IPC 相关类型；`AppConfig` 新增 `baiduAsrAppId`（frontend-developer）
  - 验收：`MeetingRecordProps` 字段与架构文档 2.6.1 一致

- [ ] **T2**：`db.ts` Dexie version 2 迁移，新增 `meetings` 表（`++id, status, createdAt`）（frontend-developer）
  - 验收：升级后旧数据不丢失；`db.meetings` 可 CRUD

- [ ] **T3**：`config.ts` / `Settings.vue` / `locales/*` 新增 `baiduAsrAppId` 配置项与说明文案（frontend-developer）
  - 验收：设置页可保存 AppID；i18n 中英文齐全

### Layer 1：主进程 — ASR 与音频

- [ ] **T4**：`src/baiduRealtimeAsrMain.ts` — 百度实时 WebSocket 客户端（START/音频/FINISH、MID_TEXT/FIN_TEXT 解析、错误处理）（backend-developer）
  - 验收：独立脚本或单元测试可连百度 WS 并收到 FIN_TEXT（需有效 Key）

- [ ] **T5**：`src/meetingAudioMain.ts` — 流式 PCM 写盘、停止时补 WAV header、计算 `durationMs` + `waveformPeaks`、删除文件（backend-developer）
  - 验收：1 分钟录音生成可播放 WAV；peaks 数组长度 ≈ 300

- [ ] **T6**：`src/meetingSummarizeMain.ts` — LLM 总结（Prompt、JSON 解析、≤24k 单次 / 超出分段合并、流式推送）（backend-developer）
  - 验收：给定样例转写文本，返回 `{ title, overview, sections }` 结构

- [ ] **T7**：`ipc.ts` 注册 meeting-* 通道；`preload.ts` + `preload.d.ts` + `browserElectronShim.ts` 暴露 API（backend-developer）
  - 验收：渲染进程可 start/stop ASR、收发 audio/result 事件、触发 summarize

### Layer 1：渲染进程 — 业务逻辑

- [ ] **T8**：`src/stores/meeting.ts` — Pinia store（列表加载、选中、创建、更新、删除、录音状态）（frontend-developer）
  - 验收：store 方法与 Dexie 同步；删除时调用 `meetingDeleteAudio`

- [ ] **T9**：`src/speech/useMeetingRecorder.ts` — AudioContext 采集 16k PCM、IPC 发送、监听 ASR 结果追加 transcript（frontend-developer）
  - 验收：开始/停止生命周期正确；停止后 transcript 完整

### Layer 2：UI 组件

- [ ] **T10**：`src/components/meeting/MeetingWaveform.vue` — Canvas 波形渲染 + 播放进度指示（frontend-developer）
  - 验收：peaks 数据驱动绘制；点击/拖动 seek（可选，至少进度联动）

- [ ] **T11**：`src/components/meeting/MeetingAudioPlayer.vue` — 播放/暂停、倍速（0.5/1/1.5/2x）、进度条，集成 Waveform（frontend-developer）
  - 验收：safe-file 音频可播放；倍速切换生效

- [ ] **T12**：`src/components/meeting/MeetingTranscript.vue` — 转写全文展示，录音中实时追加（frontend-developer）
  - 验收：录音过程中文字实时出现；完成后展示完整文本

- [ ] **T13**：`src/components/meeting/MeetingSummary.vue` — 概述 + 分节要点 Markdown 渲染；加载态；重新生成按钮（frontend-developer）
  - 验收：总结完成后正确渲染；失败态显示 error + 重试

- [ ] **T14**：`src/components/meeting/MeetingList.vue` — 列表、选中高亮、标题 inline 编辑、删除确认（frontend-developer）
  - 验收：按 createdAt 倒序；删除同步清 DB + 文件

- [ ] **T15**：`src/components/meeting/MeetingRecorderBar.vue` — 开始/停止按钮、计时器、录音状态指示（frontend-developer）
  - 验收：录音中计时递增；未配置 ASR 时按钮 disabled + tooltip

- [ ] **T16**：`src/views/Meetings.vue` — 双栏布局，组合上述组件，处理录音→总结完整流程（frontend-developer）
  - 验收：端到端流程可走通；窄屏列表可折叠

### Layer 3：入口与路由

- [ ] **T17**：`renderer.ts` 新增 `/meetings` 路由；`Home.vue` 新增入口卡片；`App.vue` 导航适配（frontend-developer）
  - 验收：首页卡片可跳转；返回首页正常

- [ ] **T18**：启动时 `meetingCheckIncomplete` 检测未完成录音，弹窗提示恢复或丢弃（frontend-developer）
  - 验收：模拟 crash 后重启可检测到 recording 状态记录

### Layer 4：审查

- [ ] **T19**：代码审查 — 模块边界、IPC 安全、内存泄漏（AudioContext/WS 清理）（code-reviewer）

- [ ] **T20**：安全审查 — Key 不泄露、音频路径校验、IPC payload 大小限制（security-reviewer）

---

## 依赖关系

```
T1, T2, T3 (并行)
  ↓
T4, T5, T6 (并行，依赖 T1)
  ↓
T7 (依赖 T4, T5, T6)
  ↓
T8, T9 (并行，依赖 T2, T7)
  ↓
T10 → T11 (Waveform → Player)
T12, T13, T14, T15 (并行，依赖 T8)
  ↓
T16 (依赖 T10~T15)
  ↓
T17, T18 (依赖 T16)
  ↓
T19, T20
```

## 并行机会

- Layer 0 三项可并行
- T4/T5/T6 可并行
- T10~T15 在 T8 完成后可并行
- T19/T20 可并行

---

## 风险与注意事项

| 风险 | 缓解 |
|------|------|
| 百度 WS 需 AppID，与现有 REST Key 配置不同 | T3 设置页明确说明；文档补充获取路径 |
| IPC 频繁发送音频帧可能影响性能 | 合并帧至 100~200ms 一批；使用 Buffer 直传 |
| ScriptProcessorNode 已废弃 | 第一版可用；后续换 AudioWorklet |
| 长会议总结超时 | 分段策略 + UI loading + 可重试 |
| vite 主进程 bundle WebSocket | 优先 Node 18 原生 WebSocket，无需额外依赖 |

---

## 预估工作量

| 层级 | 任务数 | 预估 |
|------|--------|------|
| Layer 0 | 3 | 0.5 天 |
| Layer 1 主进程 | 4 | 1.5 天 |
| Layer 1 渲染 | 2 | 1 天 |
| Layer 2 UI | 7 | 2 天 |
| Layer 3 入口 | 2 | 0.5 天 |
| Layer 4 审查 | 2 | 0.5 天 |
| **合计** | **20** | **~6 天** |

---

## 审阅选项

- **A**：没问题，开始开发
- **B**：已修改完成（AI 读取文件差异，针对性更新）
- **C**：`<修改意见>`
