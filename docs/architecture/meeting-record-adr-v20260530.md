# ADR：会议记录功能关键决策

> 日期：2026-05-30  
> 状态：已接受

---

## ADR-001：实时 ASR 使用百度 WebSocket 而非 REST 分段识别

**背景**：现有 `baiduAsrMain.ts` 为 REST 短时识别（整段上传），不支持流式中间结果。

**决策**：新增 `baiduRealtimeAsrMain.ts`，使用 `wss://vop.baidu.com/realtime_asr` WebSocket API。

**理由**：
- 用户要求真正实时转写（逐字/逐句上屏）
- 百度 WS 返回 `MID_TEXT` 中间结果，体验接近元宝
- REST 分段方案（每 30s 识别）延迟高、句边界断裂

**代价**：
- 需新增 `baiduAsrAppId` 配置（WS 鉴权与 REST OAuth 不同）
- 主进程需维护 WebSocket 长连接与音频帧转发

---

## ADR-002：音频采集在渲染进程，ASR 连接在主进程

**背景**：Electron 渲染进程无法直连百度 WS（CORS/安全策略）；主进程无法直接访问麦克风。

**决策**：渲染进程 AudioContext 采集 PCM → IPC 发送至主进程 → 主进程转发 WS + 写盘。

**理由**：
- 与现有 `baiduAsrRecognize` 主进程代理模式一致
- 麦克风 API 仅在渲染进程可用
- 主进程统一 outbound 网络请求

---

## ADR-003：流式写 WAV 文件而非内存 Blob

**背景**：需求不限录音时长，1h+ 会议可能产生 ~115MB WAV（16k×2×3600s）。

**决策**：主进程以 Append 模式写 `{userData}/meetings/{id}.pcm`，停止时补 WAV header；或使用 `fs.createWriteStream` 跳过 header 先写 data chunk。

**理由**：避免 Renderer/Main 内存中持有完整音频
**替代方案**：WebM 流式录制（MediaRecorder）→ 停止时转 WAV；延迟更高，不采用

---

## ADR-004：波形 peaks 预计算存储

**背景**：播放时需要波形可视化，实时解码 WAV 计算振幅开销大。

**决策**：录音停止时在主进程解码 PCM 计算 ~300 个 peak 值，存入 Dexie `waveformPeaks` 字段。

**理由**：一次计算、多次播放；300 点对 Canvas 渲染足够

---

## ADR-005：长转写文本分段总结

**背景**：2h 会议转写可达 3~5 万字，超出多数 LLM 上下文或影响质量。

**决策**：
- ≤ 24,000 字：单次总结
- \> 24,000 字：按段落切分为 ~8000 字段落 → 每段生成小结 → 最后合并为总总结

**理由**：平衡 token 成本与总结质量；阈值可配置

---

## ADR-006：会议数据独立表，不混入 conversations/messages

**背景**：会议记录有独立生命周期（录音、转写、总结、音频文件），与聊天消息结构差异大。

**决策**：Dexie 新增 `meetings` 表，不复用 `conversations`。

**理由**：
- 避免污染聊天数据模型
- 会议模块可独立演进（后续 RAG 问答）
- 删除会议不影响聊天历史
