import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { createWriteStream, type WriteStream } from 'fs'

const SAMPLE_RATE = 16000
const PEAK_COUNT = 300

export function getMeetingsDir(): string {
  return path.join(app.getPath('userData'), 'meetings')
}

export async function ensureMeetingsDir(): Promise<void> {
  await fs.mkdir(getMeetingsDir(), { recursive: true })
}

interface AudioWriteSession {
  meetingId: number
  pcmPath: string
  writeStream: WriteStream
  pcmBytes: number
}

const writeSessions = new Map<number, AudioWriteSession>()

function pcmPathFor(meetingId: number): string {
  return path.join(getMeetingsDir(), `${meetingId}.pcm`)
}

function wavPathFor(meetingId: number): string {
  return path.join(getMeetingsDir(), `${meetingId}.wav`)
}

export async function startAudioWrite(meetingId: number): Promise<void> {
  await ensureMeetingsDir()
  const pcmPath = pcmPathFor(meetingId)
  try {
    await fs.unlink(pcmPath)
  } catch {
    /* fresh */
  }
  const writeStream = createWriteStream(pcmPath, { flags: 'w' })
  writeSessions.set(meetingId, { meetingId, pcmPath, writeStream, pcmBytes: 0 })
}

export function appendPcm(meetingId: number, pcm: Buffer): void {
  const session = writeSessions.get(meetingId)
  if (!session) return
  session.writeStream.write(pcm)
  session.pcmBytes += pcm.length
}

function buildWavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

function computeWaveformPeaks(pcm: Buffer): number[] {
  const sampleCount = Math.floor(pcm.length / 2)
  if (sampleCount === 0) return new Array(PEAK_COUNT).fill(0)
  const peaks: number[] = []
  const bucketSize = Math.max(1, Math.floor(sampleCount / PEAK_COUNT))
  let maxPeak = 1
  for (let i = 0; i < PEAK_COUNT; i++) {
    const start = i * bucketSize
    const end = Math.min(sampleCount, start + bucketSize)
    let peak = 0
    for (let s = start; s < end; s++) {
      const v = Math.abs(pcm.readInt16LE(s * 2))
      if (v > peak) peak = v
    }
    peaks.push(peak)
    if (peak > maxPeak) maxPeak = peak
  }
  return peaks.map((p) => p / maxPeak)
}

export async function finalizeAudioWrite(meetingId: number): Promise<{
  durationMs: number
  waveformPeaks: number[]
  audioFileName: string
  absPath: string
}> {
  const session = writeSessions.get(meetingId)
  if (!session) {
    throw new Error('NO_AUDIO_SESSION')
  }
  await new Promise<void>((resolve, reject) => {
    session.writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
  })
  writeSessions.delete(meetingId)

  const pcm = await fs.readFile(session.pcmPath)
  const wavPath = wavPathFor(meetingId)
  const header = buildWavHeader(pcm.length)
  await fs.writeFile(wavPath, Buffer.concat([header, pcm]))
  try {
    await fs.unlink(session.pcmPath)
  } catch {
    /* noop */
  }

  const durationMs = Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000)
  const waveformPeaks = computeWaveformPeaks(pcm)
  return {
    durationMs,
    waveformPeaks,
    audioFileName: `${meetingId}.wav`,
    absPath: wavPath,
  }
}

export function cancelAudioWrite(meetingId: number): void {
  const session = writeSessions.get(meetingId)
  if (!session) return
  session.writeStream.destroy()
  writeSessions.delete(meetingId)
  void fs.unlink(session.pcmPath).catch(() => {})
}

export async function deleteMeetingAudio(audioFileName: string): Promise<void> {
  const base = path.basename(audioFileName)
  if (!/^\d+\.wav$/.test(base)) {
    throw new Error('INVALID_AUDIO_NAME')
  }
  const abs = path.join(getMeetingsDir(), base)
  const root = path.resolve(getMeetingsDir())
  if (!path.resolve(abs).startsWith(root + path.sep) && path.resolve(abs) !== root) {
    throw new Error('PATH_NOT_ALLOWED')
  }
  try {
    await fs.unlink(abs)
  } catch {
    /* already gone */
  }
  const pcm = abs.replace(/\.wav$/, '.pcm')
  try {
    await fs.unlink(pcm)
  } catch {
    /* noop */
  }
}

export function resolveMeetingAudioPath(audioFileName: string): string {
  const base = path.basename(audioFileName)
  if (!/^\d+\.wav$/.test(base)) {
    throw new Error('INVALID_AUDIO_NAME')
  }
  return path.join(getMeetingsDir(), base)
}

export function toSafeFileUrl(absPath: string): string {
  return `safe-file:///${encodeURIComponent(absPath)}`
}
