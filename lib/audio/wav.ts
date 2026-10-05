/** 44-byte header of a 16-bit PCM WAV file. */
export function wavHeader(
  frames: number,
  channels: number,
  sampleRate: number
): ArrayBuffer {
  const blockAlign = channels * 2
  const dataSize = frames * blockAlign
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, dataSize, true)
  return buffer
}

/** Interleaves float channels into 16-bit samples, clipping at full scale. */
export function toPcm16(channels: Float32Array[]): Int16Array {
  const frames = channels[0]?.length ?? 0
  const count = channels.length
  const out = new Int16Array(frames * count)
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]))
      out[i * count + c] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
  }
  return out
}
