// Min/max summaries of the audio, from fine to coarse, so the waveform can be
// drawn at any zoom level without scanning every sample.

export const BASE_SAMPLES_PER_PEAK = 128
const MAX_SAMPLES_PER_PEAK = 1 << 17

export interface PeakLevel {
  samplesPerPeak: number
  /** Interleaved [min, max] pairs. */
  data: Float32Array
}

const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function computePeaks(
  channels: Float32Array[]
): Promise<PeakLevel[]> {
  const length = channels[0]?.length ?? 0
  const count = Math.ceil(length / BASE_SAMPLES_PER_PEAK)
  const base = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const from = i * BASE_SAMPLES_PER_PEAK
    const to = Math.min(length, from + BASE_SAMPLES_PER_PEAK)
    let min = 0
    let max = 0
    for (const channel of channels) {
      for (let j = from; j < to; j++) {
        const value = channel[j]
        if (value < min) min = value
        else if (value > max) max = value
      }
    }
    base[i * 2] = min
    base[i * 2 + 1] = max
    // Keep the page responsive while summarising long recordings.
    if (i % 32768 === 32767) await yieldToBrowser()
  }

  const levels: PeakLevel[] = [
    { samplesPerPeak: BASE_SAMPLES_PER_PEAK, data: base },
  ]
  let previous = levels[0]
  while (
    previous.samplesPerPeak < MAX_SAMPLES_PER_PEAK &&
    previous.data.length > 2
  ) {
    const pairs = previous.data.length / 2
    const nextPairs = Math.ceil(pairs / 2)
    const data = new Float32Array(nextPairs * 2)
    for (let i = 0; i < nextPairs; i++) {
      const a = i * 4
      const hasSecond = i * 2 + 1 < pairs
      data[i * 2] = hasSecond
        ? Math.min(previous.data[a], previous.data[a + 2])
        : previous.data[a]
      data[i * 2 + 1] = hasSecond
        ? Math.max(previous.data[a + 1], previous.data[a + 3])
        : previous.data[a + 1]
    }
    previous = { samplesPerPeak: previous.samplesPerPeak * 2, data }
    levels.push(previous)
  }
  return levels
}

/** Lowest and highest sample value between two (fractional) sample positions. */
export function peakRange(
  levels: PeakLevel[],
  channels: Float32Array[],
  from: number,
  to: number
): [number, number] {
  let min = 0
  let max = 0
  if (to - from < BASE_SAMPLES_PER_PEAK) {
    const start = Math.max(0, Math.floor(from))
    const end = Math.min(channels[0]?.length ?? 0, Math.ceil(to))
    for (const channel of channels) {
      for (let j = start; j < end; j++) {
        const value = channel[j]
        if (value < min) min = value
        else if (value > max) max = value
      }
    }
    return [min, max]
  }

  // A level at most a quarter of the range wide, so edge peaks barely overreach.
  let level = levels[0]
  for (const candidate of levels) {
    if (candidate.samplesPerPeak * 4 > to - from) break
    level = candidate
  }
  const first = Math.max(0, Math.floor(from / level.samplesPerPeak))
  const last = Math.min(
    level.data.length / 2,
    Math.ceil(to / level.samplesPerPeak)
  )
  for (let i = first; i < last; i++) {
    if (level.data[i * 2] < min) min = level.data[i * 2]
    if (level.data[i * 2 + 1] > max) max = level.data[i * 2 + 1]
  }
  return [min, max]
}
