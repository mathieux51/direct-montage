import { clipEnd, dbToGain } from './edit'
import type { Clip, Project } from './types'

type AudioContextConstructor = typeof AudioContext
type WindowWithWebkit = Window & {
  webkitAudioContext?: AudioContextConstructor
}
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } }

/**
 * Every file is decoded at this rate, whatever the output device runs at
 * (a Bluetooth headset in call mode can run at 16 or 24 kHz). Exports use it too.
 */
export const PROJECT_SAMPLE_RATE = 48000

/** Plays a project through the Web Audio API by scheduling every clip. */
export class PlaybackEngine {
  private context: AudioContext | null = null
  private decoder: OfflineAudioContext | null = null
  private nodes: AudioBufferSourceNode[] = []
  private output: GainNode | null = null
  private meters: AnalyserNode[] = []
  private meterSamples = new Float32Array(2048)
  private startTime = 0
  private startPosition = 0
  private token = 0
  playing = false

  getContext(): AudioContext {
    if (!this.context) {
      const Constructor =
        window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
      if (!Constructor) throw new Error('Web Audio API unavailable')
      this.context = new Constructor()
      // Lets iPhones play even when the ring/silent switch is on silent.
      const session = (navigator as NavigatorWithAudioSession).audioSession
      if (session) session.type = 'playback'
    }
    return this.context
  }

  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.decoder) {
      this.decoder = new OfflineAudioContext(1, 1, PROJECT_SAMPLE_RATE)
    }
    return this.decoder.decodeAudioData(data)
  }

  async play(
    project: Project,
    getBuffer: (sourceId: string) => AudioBuffer | undefined,
    from: number,
    to: number
  ): Promise<void> {
    this.stop()
    this.startPosition = from
    const token = this.token
    const context = this.getContext()
    // resume() must start inside the click/tap handler for mobile browsers.
    if (context.state !== 'running') await context.resume()
    if (token !== this.token) return

    const output = context.createGain()
    output.connect(context.destination)
    // Mono projects are shown on both meter bars.
    output.channelCount = 2
    output.channelCountMode = 'explicit'
    output.channelInterpretation = 'speakers'
    const splitter = context.createChannelSplitter(2)
    output.connect(splitter)
    this.meters = [0, 1].map((channel) => {
      const analyser = context.createAnalyser()
      analyser.fftSize = this.meterSamples.length
      splitter.connect(analyser, channel)
      return analyser
    })
    const when = context.currentTime + 0.05
    for (const track of project.tracks) {
      if (track.muted) continue
      for (const clip of track.clips) {
        const buffer = getBuffer(clip.sourceId)
        const start = Math.max(from, clip.start)
        const end = Math.min(to, clipEnd(clip))
        if (!buffer || end - start <= 0) continue
        const node = context.createBufferSource()
        node.buffer = buffer
        const at = when + (start - from)
        const envelope = scheduleEnvelope(context, clip, start - clip.start, at)
        node.connect(envelope.input)
        envelope.output.connect(output)
        node.start(at, clip.offset + (start - clip.start), end - start)
        this.nodes.push(node)
      }
    }
    this.output = output
    this.startTime = when
    this.playing = true
  }

  /** Current playback position on the timeline, in seconds. */
  position(): number {
    if (!this.playing || !this.context) return this.startPosition
    const latency = this.context.outputLatency || this.context.baseLatency || 0
    return (
      this.startPosition +
      Math.max(0, this.context.currentTime - this.startTime - latency)
    )
  }

  /** Peak level (linear, 1 = full scale) of each output channel right now. */
  levels(): number[] {
    if (!this.playing) return []
    return this.meters.map((analyser) => {
      analyser.getFloatTimeDomainData(this.meterSamples)
      let peak = 0
      for (const value of this.meterSamples) {
        const level = Math.abs(value)
        if (level > peak) peak = level
      }
      return peak
    })
  }

  stop() {
    this.token += 1
    for (const node of this.nodes) {
      try {
        node.stop()
      } catch {
        // Already stopped.
      }
      node.disconnect()
    }
    this.nodes = []
    this.output?.disconnect()
    this.output = null
    this.meters.forEach((analyser) => analyser.disconnect())
    this.meters = []
    this.playing = false
  }
}

/**
 * Two chained gain nodes: the first ramps the fade-in (scaled by the clip
 * volume), the second the fade-out. Playback may start in the middle of a clip,
 * so each ramp starts from its current value.
 */
function scheduleEnvelope(
  context: BaseAudioContext,
  clip: Clip,
  offsetInClip: number,
  when: number
): { input: AudioNode; output: AudioNode } {
  const fadeIn = context.createGain()
  const fadeOut = context.createGain()
  fadeIn.connect(fadeOut)
  const gain = dbToGain(clip.gain)

  if (clip.fadeIn > 0 && offsetInClip < clip.fadeIn) {
    fadeIn.gain.setValueAtTime((gain * offsetInClip) / clip.fadeIn, when)
    fadeIn.gain.linearRampToValueAtTime(gain, when + clip.fadeIn - offsetInClip)
  } else {
    fadeIn.gain.setValueAtTime(gain, when)
  }

  if (clip.fadeOut > 0) {
    const fadeStart = clip.duration - clip.fadeOut
    if (offsetInClip < fadeStart) {
      fadeOut.gain.setValueAtTime(1, when)
      fadeOut.gain.setValueAtTime(1, when + fadeStart - offsetInClip)
    } else {
      fadeOut.gain.setValueAtTime(
        (clip.duration - offsetInClip) / clip.fadeOut,
        when
      )
    }
    fadeOut.gain.linearRampToValueAtTime(0, when + clip.duration - offsetInClip)
  }
  return { input: fadeIn, output: fadeOut }
}
