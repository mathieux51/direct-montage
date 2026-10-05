// A project is a list of tracks. A track holds regions (clips) that point into
// decoded source audio, so every edit only rewrites this small structure.

export interface Clip {
  id: string
  sourceId: string
  /** Position on the timeline, in seconds. */
  start: number
  /** Where the clip begins inside its source audio, in seconds. */
  offset: number
  duration: number
  /** Clip volume in dB (0 = unchanged). */
  gain: number
  /** Linear fade-in length in seconds, anchored at the clip start. */
  fadeIn: number
  /** Linear fade-out length in seconds, anchored at the clip end. */
  fadeOut: number
}

export interface Track {
  id: string
  name: string
  color: string
  muted: boolean
  clips: Clip[]
}

export interface Project {
  tracks: Track[]
}

/** A time range on one or more tracks. `start === end` is a plain cursor. */
export interface Selection {
  trackIds: string[]
  start: number
  end: number
}

export interface ClipboardData {
  duration: number
  /** One entry per copied track, clip starts relative to the copied range. */
  tracks: { name: string; clips: Clip[] }[]
}
