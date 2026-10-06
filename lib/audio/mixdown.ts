import { dbToGain, fadeFactor, projectDuration } from './edit'
import type { Clip, Project } from './types'
import { toPcm16, toPcm24, wavHeader, type BitDepth } from './wav'

/** The part of an AudioBuffer the mixdown reads. */
export interface AudioData {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

type GetSource = (sourceId: string) => AudioData | undefined
type Progress = (ratio: number) => void

const CHUNK_SECONDS = 10
const MP3_BITRATE = 320

/**
 * Mixes every unmuted track and hands the result to `onChunk` about ten
 * seconds at a time, so long projects never need one huge buffer.
 */
export async function renderMix(
  project: Project,
  getSource: GetSource,
  sampleRate: number,
  onChunk: (channels: Float32Array[]) => void,
  onProgress?: Progress
): Promise<{ frames: number; channels: number }> {
  const audible = { tracks: project.tracks.filter((track) => !track.muted) }
  const clips = audible.tracks.flatMap((track) => track.clips)
  const totalFrames = Math.ceil(projectDuration(audible) * sampleRate)
  const channelCount = Math.min(
    2,
    Math.max(
      1,
      ...clips.map((clip) => getSource(clip.sourceId)?.numberOfChannels ?? 1)
    )
  )
  const chunkFrames = CHUNK_SECONDS * sampleRate

  for (
    let chunkStart = 0;
    chunkStart < totalFrames;
    chunkStart += chunkFrames
  ) {
    const frames = Math.min(chunkFrames, totalFrames - chunkStart)
    const out = Array.from(
      { length: channelCount },
      () => new Float32Array(frames)
    )
    for (const clip of clips) {
      const source = getSource(clip.sourceId)
      if (source) mixClip(out, chunkStart, clip, source, sampleRate)
    }
    onChunk(out)
    onProgress?.((chunkStart + frames) / totalFrames)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { frames: totalFrames, channels: channelCount }
}

/** The mix as a PCM WAV file (24-bit is the "HD" export). */
export async function mixdownToWav(
  project: Project,
  getSource: GetSource,
  sampleRate: number,
  bitDepth: BitDepth,
  onProgress?: Progress
): Promise<Blob> {
  const parts: BlobPart[] = []
  const { frames, channels } = await renderMix(
    project,
    getSource,
    sampleRate,
    (chunk) => {
      parts.push(bitDepth === 24 ? toPcm24(chunk) : toPcm16(chunk))
    },
    onProgress
  )
  return new Blob(
    [wavHeader(frames, channels, sampleRate, bitDepth), ...parts],
    {
      type: 'audio/wav',
    }
  )
}

/** The mix as a 320 kbit/s MP3 file. The encoder only loads when needed. */
export async function mixdownToMp3(
  project: Project,
  getSource: GetSource,
  sampleRate: number,
  onProgress?: Progress
): Promise<Blob> {
  const { createMp3Encoder } = await import('wasm-media-encoders')
  const encoder = await createMp3Encoder()
  const parts: BlobPart[] = []
  let configured = false
  await renderMix(
    project,
    getSource,
    sampleRate,
    (chunk) => {
      if (!configured) {
        encoder.configure({
          sampleRate,
          channels: chunk.length === 1 ? 1 : 2,
          bitrate: MP3_BITRATE,
        })
        configured = true
      }
      for (const channel of chunk) {
        for (let i = 0; i < channel.length; i++) {
          channel[i] = Math.max(-1, Math.min(1, channel[i]))
        }
      }
      // The encoder reuses its output buffer, so keep a copy.
      parts.push(encoder.encode(chunk).slice())
    },
    onProgress
  )
  if (configured) parts.push(encoder.finalize().slice())
  return new Blob(parts, { type: 'audio/mpeg' })
}

function mixClip(
  out: Float32Array[],
  chunkStart: number,
  clip: Clip,
  source: AudioData,
  sampleRate: number
) {
  const clipStart = Math.round(clip.start * sampleRate)
  const from = Math.max(chunkStart, clipStart)
  const to = Math.min(
    chunkStart + out[0].length,
    clipStart + Math.round(clip.duration * sampleRate)
  )
  if (from >= to) return

  const inputs = Array.from({ length: source.numberOfChannels }, (_, c) =>
    source.getChannelData(c)
  )
  const ratio = source.sampleRate / sampleRate
  const sourceStart = clip.offset * source.sampleRate
  const gain = dbToGain(clip.gain)

  for (let frame = from; frame < to; frame++) {
    const index = Math.floor(sourceStart + (frame - clipStart) * ratio)
    if (index < 0 || index >= source.length) continue
    const g = gain * fadeFactor(clip, (frame - clipStart) / sampleRate)
    const at = frame - chunkStart
    if (out.length === 1) {
      let sum = 0
      for (const input of inputs) sum += input[index]
      out[0][at] += (sum / inputs.length) * g
    } else {
      for (let c = 0; c < out.length; c++) {
        out[c][at] += inputs[Math.min(c, inputs.length - 1)][index] * g
      }
    }
  }
}
