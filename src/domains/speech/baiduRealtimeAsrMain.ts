/**
 * 百度实时语音识别 WebSocket
 * 文档：https://ai.baidu.com/ai-doc/SPEECH/jlbxejt2i
 */

import { randomUUID } from 'crypto'
import WebSocket from 'ws'

export type RealtimeAsrResultType = 'MID_TEXT' | 'FIN_TEXT'

export interface RealtimeAsrResult {
  type: RealtimeAsrResultType
  text: string
  startTime?: number
  endTime?: number
}

export interface BaiduRealtimeAsrOptions {
  appId: number
  appKey: string
  devPid?: number
  cuid?: string
  onResult: (result: RealtimeAsrResult) => void
  onError: (error: string) => void
}

interface BaiduWsMessage {
  type?: string
  result?: string
  start_time?: number
  end_time?: number
  err_no?: number
  err_msg?: string
}

export class BaiduRealtimeAsrSession {
  private ws: WebSocket | null = null
  private sn = randomUUID().replace(/-/g, '')
  private finished = false

  constructor(private readonly opts: BaiduRealtimeAsrOptions) {}

  async start(): Promise<void> {
    if (this.ws) return
    const url = `wss://vop.baidu.com/realtime_asr?sn=${this.sn}`
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws
      let settled = false

      ws.on('open', () => {
        const startFrame = {
          type: 'START',
          data: {
            appid: this.opts.appId,
            appkey: this.opts.appKey,
            dev_pid: this.opts.devPid ?? 15372,
            cuid: (this.opts.cuid ?? 'vchat-meeting').slice(0, 128),
            format: 'pcm',
            sample: 16000,
          },
        }
        ws.send(JSON.stringify(startFrame))
        settled = true
        resolve()
      })

      ws.on('message', (data) => {
        this.handleMessage(data.toString())
      })

      ws.on('error', (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (!settled) {
          settled = true
          reject(new Error(msg || 'WebSocket 连接失败'))
        } else {
          this.opts.onError(msg || 'WebSocket 传输错误')
        }
      })

      ws.on('close', () => {
        if (!this.finished) {
          this.opts.onError('语音识别连接已断开')
        }
      })
    })
  }

  private handleMessage(raw: string) {
    let msg: BaiduWsMessage
    try {
      msg = JSON.parse(raw) as BaiduWsMessage
    } catch {
      return
    }
    if (msg.err_no != null && msg.err_no !== 0) {
      this.opts.onError(msg.err_msg || `ASR 错误 ${msg.err_no}`)
      return
    }
    const type = msg.type
    if (type !== 'MID_TEXT' && type !== 'FIN_TEXT') return
    const text = (msg.result ?? '').trim()
    if (!text) return
    this.opts.onResult({
      type,
      text,
      startTime: msg.start_time,
      endTime: msg.end_time,
    })
  }

  sendAudio(pcm: Buffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(pcm)
  }

  async finish(): Promise<void> {
    this.finished = true
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.close()
      return
    }
    this.ws.send(JSON.stringify({ type: 'FINISH' }))
    await new Promise<void>((resolve) => {
      const ws = this.ws!
      const timer = setTimeout(() => {
        this.close()
        resolve()
      }, 3000)
      ws.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  close(): void {
    this.finished = true
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close()
        }
      } catch {
        /* noop */
      }
      this.ws = null
    }
  }
}
