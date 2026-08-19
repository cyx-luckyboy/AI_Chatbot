import type { BrowserWindow } from 'electron'
import os from 'os'
import { BaiduRealtimeAsrSession } from '../speech/baiduRealtimeAsrMain'
import {
  appendPcm,
  cancelAudioWrite,
  finalizeAudioWrite,
  startAudioWrite,
} from './meetingAudioMain'
import { configManager } from '../../shared/config'

interface MeetingAsrSession {
  meetingId: number
  asr: BaiduRealtimeAsrSession
}

const activeSessions = new Map<number, MeetingAsrSession>()

function getBaiduRealtimeConfig(): { appId: number; appKey: string } | null {
  const cfg = configManager.get()
  const appIdRaw = (cfg.baiduAsrAppId ?? '').trim()
  const appKey = (cfg.baiduAsrApiKey ?? '').trim()
  const appId = parseInt(appIdRaw, 10)
  if (!appIdRaw || !Number.isFinite(appId) || !appKey) return null
  return { appId, appKey }
}

export async function startMeetingAsrSession(
  win: BrowserWindow,
  meetingId: number,
  devPid = 15372,
): Promise<{ ok: true; sn: string } | { ok: false; error: string }> {
  if (activeSessions.has(meetingId)) {
    return { ok: false, error: 'SESSION_EXISTS' }
  }
  const creds = getBaiduRealtimeConfig()
  if (!creds) {
    return { ok: false, error: 'BAIDU_ASR_NOT_CONFIGURED' }
  }

  await startAudioWrite(meetingId)

  const asr = new BaiduRealtimeAsrSession({
    appId: creds.appId,
    appKey: creds.appKey,
    devPid,
    cuid: `vchat-${os.hostname()}`.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 128),
    onResult: (result) => {
      win.webContents.send('meeting-asr-result', {
        meetingId,
        type: result.type,
        text: result.text,
        startTime: result.startTime,
        endTime: result.endTime,
      })
    },
    onError: (error) => {
      win.webContents.send('meeting-asr-error', { meetingId, error })
    },
  })

  try {
    await asr.start()
  } catch (e) {
    cancelAudioWrite(meetingId)
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }

  activeSessions.set(meetingId, { meetingId, asr })
  return { ok: true, sn: String(meetingId) }
}

export function sendMeetingAsrAudio(meetingId: number, pcm: Buffer): void {
  if (pcm.length === 0) return
  appendPcm(meetingId, pcm)
  const session = activeSessions.get(meetingId)
  session?.asr.sendAudio(pcm)
}

export async function stopMeetingAsrSession(meetingId: number): Promise<
  | { ok: true; durationMs: number; waveformPeaks: number[]; audioFileName: string }
  | { ok: false; error: string }
> {
  const session = activeSessions.get(meetingId)
  if (session) {
    try {
      await session.asr.finish()
    } catch {
      session.asr.close()
    }
    activeSessions.delete(meetingId)
  }

  try {
    const audio = await finalizeAudioWrite(meetingId)
    return {
      ok: true,
      durationMs: audio.durationMs,
      waveformPeaks: audio.waveformPeaks,
      audioFileName: audio.audioFileName,
    }
  } catch (e) {
    cancelAudioWrite(meetingId)
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export function abortMeetingAsrSession(meetingId: number): void {
  const session = activeSessions.get(meetingId)
  if (session) {
    session.asr.close()
    activeSessions.delete(meetingId)
  }
  cancelAudioWrite(meetingId)
}
