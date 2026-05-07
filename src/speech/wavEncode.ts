/** 浏览器侧：解码录音 Blob → 16kHz 单声道 16bit PCM → WAV ArrayBuffer */

export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0
  }
  return out
}

export function encodeWavPcm16Mono(pcm16: Int16Array, sampleRate: number): ArrayBuffer {
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + pcm16.byteLength)
  const view = new DataView(buffer)
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + pcm16.byteLength, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm16.byteLength, true)
  const pcmBytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
  new Uint8Array(buffer, headerSize, pcmBytes.length).set(pcmBytes)
  return buffer
}

/** 单声道重采样到 16kHz（最近邻），再量化 PCM */
export function audioBufferTo16kWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const rate = audioBuffer.sampleRate
  const ch0 =
    audioBuffer.numberOfChannels > 1
      ? mixDown(audioBuffer)
      : audioBuffer.getChannelData(0)
  const targetLen = Math.max(1, Math.round(ch0.length * (16000 / rate)))
  const resampled = new Float32Array(targetLen)
  const scale = rate / 16000
  for (let i = 0; i < targetLen; i++) {
    const idx = Math.min(Math.floor(i * scale), ch0.length - 1)
    resampled[i] = ch0[idx] ?? 0
  }
  const pcm = floatTo16BitPCM(resampled)
  return encodeWavPcm16Mono(pcm, 16000)
}

function mixDown(buffer: AudioBuffer): Float32Array {
  const n = buffer.numberOfChannels
  const len = buffer.length
  const out = new Float32Array(len)
  for (let c = 0; c < n; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += ch[i] ?? 0
  }
  for (let i = 0; i < len; i++) out[i] /= n
  return out
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(null, Array.from(sub))
  }
  return btoa(binary)
}

export async function recordingBlobToWavBase64(blob: Blob): Promise<{ base64: string; len: number }> {
  const ctx = new AudioContext()
  try {
    const arrayBuf = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0))
    const wav = audioBufferTo16kWav(audioBuffer)
    return { base64: arrayBufferToBase64(wav), len: wav.byteLength }
  } finally {
    await ctx.close().catch(() => undefined)
  }
}
