import { dbToGain, fadeFactor, projectDuration } from './edit'
import type { Clip, Project } from './types'
import { toPcm16, wavHeader } from './wav'

/** The part of an AudioBuffer the mixdown reads. */
export interface AudioData {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

const CHUNK_SECONDS = 10

/**
 * Mixes every unmuted track into a 16-bit WAV file. Works in chunks so long
 * projects never need one huge buffer.
 */
export async function mixdownToWav(
  project: Project,
  getSource: (sourceId: string) => AudioData | undefined,
  sampleRate: number,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
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
  const parts: BlobPart[] = [wavHeader(totalFrames, channelCount, sampleRate)]

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
    parts.push(toPcm16(out))
    onProgress?.((chunkStart + frames) / totalFrames)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return new Blob(parts, { type: 'audio/wav' })
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
