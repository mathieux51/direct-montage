import { computePeaks, type PeakLevel } from './peaks'

export interface LoadedSource {
  id: string
  name: string
  buffer: AudioBuffer
  channels: Float32Array[]
  peaks: PeakLevel[]
}

/** Decoded audio of the project, shared by the timeline, playback and export. */
export class SourceStore {
  private sources = new Map<string, LoadedSource>()
  private listeners = new Set<() => void>()
  private version = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = () => this.version

  get(id: string): LoadedSource | undefined {
    return this.sources.get(id)
  }

  async add(id: string, name: string, buffer: AudioBuffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i)
    )
    const peaks = await computePeaks(channels)
    this.sources.set(id, { id, name, buffer, channels, peaks })
    this.notify()
  }

  /** Frees the decoded audio of every source not listed. */
  retain(ids: Set<string>) {
    for (const id of this.sources.keys()) {
      if (!ids.has(id)) this.sources.delete(id)
    }
    this.notify()
  }

  clear() {
    this.sources.clear()
    this.notify()
  }

  private notify() {
    this.version += 1
    this.listeners.forEach((listener) => listener())
  }
}
