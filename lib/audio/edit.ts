import type { Clip, ClipboardData, Project, Selection, Track } from './types'

/** Time tolerance in seconds: shorter fragments are dropped, closer edges are merged. */
export const EPS = 0.001
export const MIN_GAIN_DB = -40
export const MAX_GAIN_DB = 20

export const TRACK_COLORS = [
  '#60a5fa',
  '#a3be8c',
  '#ebcb8b',
  '#d08770',
  '#b48ead',
  '#88c0d0',
]

let idCounter = 0

export function createId(prefix: string): string {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${random}`
}

export const clipEnd = (clip: Clip) => clip.start + clip.duration

export const dbToGain = (db: number) => Math.pow(10, db / 20)

export const clampGain = (db: number) =>
  Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, Math.round(db * 10) / 10))

/** Multiplier applied by the linear fades `t` seconds after the clip start. */
export function fadeFactor(clip: Clip, t: number): number {
  let factor = 1
  if (clip.fadeIn > 0 && t < clip.fadeIn) factor *= Math.max(0, t) / clip.fadeIn
  const remaining = clip.duration - t
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
    factor *= Math.max(0, remaining) / clip.fadeOut
  }
  return factor
}

export function projectDuration(project: Project, includeMuted = true): number {
  let end = 0
  for (const track of project.tracks) {
    if (track.muted && !includeMuted) continue
    for (const clip of track.clips) end = Math.max(end, clipEnd(clip))
  }
  return end
}

export const hasRange = (selection: Selection) =>
  selection.end - selection.start >= EPS

export function createTrack(
  name: string,
  existing: Track[],
  clips: Clip[] = []
): Track {
  const used = new Set(existing.map((track) => track.color))
  const color =
    TRACK_COLORS.find((candidate) => !used.has(candidate)) ??
    TRACK_COLORS[existing.length % TRACK_COLORS.length]
  return { id: createId('track'), name, color, muted: false, clips }
}

export function createClip(sourceId: string, duration: number): Clip {
  return {
    id: createId('clip'),
    sourceId,
    start: 0,
    offset: 0,
    duration,
    gain: 0,
    fadeIn: 0,
    fadeOut: 0,
  }
}

export function findClip(
  project: Project,
  clipId: string
): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}

const sortClips = (clips: Clip[]) =>
  [...clips].sort((a, b) => a.start - b.start)

/** Applies `fn` to the given tracks, keeping the same project object when nothing changed. */
function mapTracks(
  project: Project,
  trackIds: string[],
  fn: (track: Track) => Track
): Project {
  let changed = false
  const tracks = project.tracks.map((track) => {
    if (!trackIds.includes(track.id)) return track
    const next = fn(track)
    if (next !== track) changed = true
    return next
  })
  return changed ? { ...project, tracks } : project
}

/**
 * Part of `clip` inside the timeline range [from, to), or null when it would
 * be too short. The piece keeps the clip id. A fade is only kept on the piece
 * that still has the edge it is anchored to, so that piece sounds unchanged.
 */
export function sliceClip(clip: Clip, from: number, to: number): Clip | null {
  const start = Math.max(clip.start, from)
  const end = Math.min(clipEnd(clip), to)
  if (end - start < EPS) return null
  return {
    ...clip,
    start,
    offset: clip.offset + (start - clip.start),
    duration: end - start,
    fadeIn: start - clip.start < EPS ? clip.fadeIn : 0,
    fadeOut: clipEnd(clip) - end < EPS ? clip.fadeOut : 0,
  }
}

/** Splits a clip at timeline time `t`, or returns null when `t` is not inside it. */
export function splitClipAt(clip: Clip, t: number): [Clip, Clip] | null {
  if (t - clip.start < EPS || clipEnd(clip) - t < EPS) return null
  const left = sliceClip(clip, clip.start, t)
  const right = sliceClip(clip, t, clipEnd(clip))
  if (!left || !right) return null
  return [left, { ...right, id: createId('clip') }]
}

export function splitTrack(track: Track, times: number[]): Track {
  let changed = false
  let clips = track.clips
  for (const t of times) {
    clips = clips.flatMap((clip) => {
      const parts = splitClipAt(clip, t)
      if (parts) changed = true
      return parts ?? [clip]
    })
  }
  return changed ? { ...track, clips } : track
}

/** Splits the selected tracks at the cursor, or at both edges of a range. */
export function splitAtSelection(
  project: Project,
  selection: Selection
): Project {
  const times = hasRange(selection)
    ? [selection.start, selection.end]
    : [selection.start]
  return mapTracks(project, selection.trackIds, (track) =>
    splitTrack(track, times)
  )
}

/** Removes [start, end) from the given tracks and closes the gap, like deleting text. */
export function deleteRange(
  project: Project,
  trackIds: string[],
  start: number,
  end: number
): Project {
  const length = end - start
  if (length < EPS) return project
  return mapTracks(project, trackIds, (track) => {
    let changed = false
    const clips = track.clips.flatMap((clip) => {
      if (clipEnd(clip) <= start) return [clip]
      changed = true
      if (clip.start >= end) return [{ ...clip, start: clip.start - length }]
      const before = sliceClip(clip, clip.start, start)
      const after = sliceClip(clip, end, clipEnd(clip))
      const pieces: Clip[] = before ? [before] : []
      if (after) {
        pieces.push({
          ...after,
          id: before ? createId('clip') : clip.id,
          start: after.start - length,
        })
      }
      return pieces
    })
    return changed ? { ...track, clips: sortClips(clips) } : track
  })
}

export function copyRange(
  project: Project,
  trackIds: string[],
  start: number,
  end: number
): ClipboardData | null {
  const tracks = project.tracks.filter((track) => trackIds.includes(track.id))
  if (end - start < EPS || tracks.length === 0) return null
  return {
    duration: end - start,
    tracks: tracks.map((track) => ({
      name: track.name,
      clips: track.clips.flatMap((clip) => {
        const piece = sliceClip(clip, start, end)
        return piece ? [{ ...piece, start: piece.start - start }] : []
      }),
    })),
  }
}

/**
 * Inserts the clipboard at time `at`, on the track at `index` and the ones
 * below it (created when missing). Later audio on those tracks moves right.
 */
export function insertClipboard(
  project: Project,
  index: number,
  at: number,
  clipboard: ClipboardData
): { project: Project; trackIds: string[] } {
  const tracks = [...project.tracks]
  const trackIds: string[] = []
  clipboard.tracks.forEach((copied, i) => {
    const target = tracks[index + i] ?? createTrack(copied.name, tracks)
    const split = splitTrack(target, [at])
    const kept = split.clips.map((clip) =>
      clip.start >= at - EPS
        ? { ...clip, start: clip.start + clipboard.duration }
        : clip
    )
    const pasted = copied.clips.map((clip) => ({
      ...clip,
      id: createId('clip'),
      start: clip.start + at,
    }))
    tracks[index + i] = { ...split, clips: sortClips([...kept, ...pasted]) }
    trackIds.push(target.id)
  })
  return { project: { ...project, tracks }, trackIds }
}

export function moveClip(
  project: Project,
  clipId: string,
  trackId: string,
  start: number
): Project {
  const found = findClip(project, clipId)
  if (!found || !project.tracks.some((track) => track.id === trackId)) {
    return project
  }
  const nextStart = Math.max(0, start)
  if (found.track.id === trackId && found.clip.start === nextStart) {
    return project
  }
  const moved = { ...found.clip, start: nextStart }
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      const others = track.clips.filter((clip) => clip.id !== clipId)
      if (track.id === trackId) {
        return { ...track, clips: placeClip(others, moved) }
      }
      return others.length === track.clips.length
        ? track
        : { ...track, clips: others }
    }),
  }
}

/**
 * Puts `clip` on a track at its start time without overlapping anything: a
 * region it lands inside is split there, and the regions in its way slide
 * right just enough to make room.
 */
export function placeClip(clips: Clip[], clip: Clip): Clip[] {
  const at = clip.start
  const pieces = clips.flatMap((other) => splitClipAt(other, at) ?? [other])
  const before = pieces.filter((other) => other.start < at - EPS)
  let cursor = clipEnd(clip)
  const after = sortClips(pieces.filter((other) => other.start >= at - EPS))
  const pushed = after.map((other) => {
    const start = Math.max(other.start, cursor)
    cursor = Math.max(cursor, start + other.duration)
    return start === other.start ? other : { ...other, start }
  })
  return sortClips([...before, clip, ...pushed])
}

/** Clips of the selected tracks touched by the range, or under the cursor. */
export function clipsInSelection(
  project: Project,
  selection: Selection | null
): Clip[] {
  if (!selection) return []
  const ranged = hasRange(selection)
  const result: Clip[] = []
  for (const track of project.tracks) {
    if (!selection.trackIds.includes(track.id)) continue
    for (const clip of track.clips) {
      const hit = ranged
        ? clip.start < selection.end - EPS &&
          clipEnd(clip) > selection.start + EPS
        : clip.start <= selection.start + EPS &&
          selection.start < clipEnd(clip) - EPS
      if (hit) result.push(clip)
    }
  }
  return result
}

/**
 * Applies `fn` to the clips in the selection. A range that covers only part
 * of a clip is first split off into its own clip.
 */
export function updateSelectedClips(
  project: Project,
  selection: Selection,
  fn: (clip: Clip) => Clip
): Project {
  const split = hasRange(selection)
    ? splitAtSelection(project, selection)
    : project
  const targets = new Set(
    clipsInSelection(split, selection).map((clip) => clip.id)
  )
  let changed = false
  const tracks = split.tracks.map((track) => {
    if (!track.clips.some((clip) => targets.has(clip.id))) return track
    return {
      ...track,
      clips: track.clips.map((clip) => {
        if (!targets.has(clip.id)) return clip
        const next = fn(clip)
        if (next !== clip) changed = true
        return next
      }),
    }
  })
  return changed ? { ...split, tracks } : project
}

export function changeGain(
  project: Project,
  selection: Selection,
  deltaDb: number
): Project {
  return updateSelectedClips(project, selection, (clip) => {
    const gain = clampGain(clip.gain + deltaDb)
    return gain === clip.gain ? clip : { ...clip, gain }
  })
}

export function setFade(
  project: Project,
  selection: Selection,
  edge: 'in' | 'out',
  seconds: number
): Project {
  const length = Math.max(0, seconds)
  return updateSelectedClips(project, selection, (clip) => {
    const fade = Math.min(length, clip.duration)
    if (edge === 'in') {
      return clip.fadeIn === fade ? clip : { ...clip, fadeIn: fade }
    }
    return clip.fadeOut === fade ? clip : { ...clip, fadeOut: fade }
  })
}
