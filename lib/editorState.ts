import {
  changeGain,
  clipEnd,
  copyRange,
  deleteRange,
  findClip,
  hasRange,
  insertClipboard,
  moveClip,
  projectDuration,
  setFade,
  splitAtSelection,
} from './audio/edit'
import type { ClipboardData, Project, Selection, Track } from './audio/types'

export interface EditorState {
  name: string
  project: Project
  /** Older versions of the project, most recent last. */
  past: Project[]
  future: Project[]
  selection: Selection | null
  clipboard: ClipboardData | null
}

export type EditorAction =
  | { type: 'load'; name: string; project: Project }
  | { type: 'rename'; name: string }
  | { type: 'select'; selection: Selection | null }
  | { type: 'selectAll' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'addTracks'; tracks: Track[] }
  | { type: 'removeTrack'; trackId: string }
  | { type: 'renameTrack'; trackId: string; name: string }
  | { type: 'toggleMute'; trackId: string }
  | { type: 'moveClip'; clipId: string; trackId: string; start: number }
  | { type: 'cut' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'delete' }
  | { type: 'split' }
  | { type: 'gain'; delta: number }
  | { type: 'fade'; edge: 'in' | 'out'; seconds: number }

export const emptyEditorState: EditorState = {
  name: '',
  project: { tracks: [] },
  past: [],
  future: [],
  selection: null,
  clipboard: null,
}

const HISTORY_LIMIT = 100

function commit(
  state: EditorState,
  project: Project,
  selection: Selection | null = state.selection
): EditorState {
  if (project === state.project) {
    return selection === state.selection ? state : { ...state, selection }
  }
  return {
    ...state,
    project,
    selection,
    past: [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
  }
}

/** Undo and redo bring back regions and tracks, but keep the current mute buttons. */
function withCurrentMutes(current: Project, restored: Project): Project {
  const muted = new Map(current.tracks.map((track) => [track.id, track.muted]))
  return {
    ...restored,
    tracks: restored.tracks.map((track) => {
      const value = muted.get(track.id)
      return value === undefined || value === track.muted
        ? track
        : { ...track, muted: value }
    }),
  }
}

function keepValidSelection(
  project: Project,
  selection: Selection | null
): Selection | null {
  if (!selection) return null
  const ids = new Set(project.tracks.map((track) => track.id))
  const trackIds = selection.trackIds.filter((id) => ids.has(id))
  if (trackIds.length === 0) return null
  return trackIds.length === selection.trackIds.length
    ? selection
    : { ...selection, trackIds }
}

export function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  const { project, selection } = state
  switch (action.type) {
    case 'load':
      return { ...emptyEditorState, name: action.name, project: action.project }

    case 'rename':
      return { ...state, name: action.name }

    case 'select':
      return { ...state, selection: action.selection }

    case 'selectAll':
      if (project.tracks.length === 0) return state
      return {
        ...state,
        selection: {
          trackIds: project.tracks.map((track) => track.id),
          start: 0,
          end: projectDuration(project),
        },
      }

    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      const restored = withCurrentMutes(project, previous)
      return {
        ...state,
        project: restored,
        past: state.past.slice(0, -1),
        future: [project, ...state.future],
        selection: keepValidSelection(restored, selection),
      }
    }

    case 'redo': {
      const [next, ...future] = state.future
      if (!next) return state
      const restored = withCurrentMutes(project, next)
      return {
        ...state,
        project: restored,
        past: [...state.past, project],
        future,
        selection: keepValidSelection(restored, selection),
      }
    }

    case 'addTracks': {
      const [first] = action.tracks
      if (!first) return state
      const clip = first.clips[0]
      return commit(
        state,
        { ...project, tracks: [...project.tracks, ...action.tracks] },
        clip
          ? { trackIds: [first.id], start: clip.start, end: clipEnd(clip) }
          : selection
      )
    }

    case 'removeTrack': {
      const tracks = project.tracks.filter(
        (track) => track.id !== action.trackId
      )
      if (tracks.length === project.tracks.length) return state
      const next = { ...project, tracks }
      return commit(state, next, keepValidSelection(next, selection))
    }

    case 'renameTrack': {
      const name = action.name.trim()
      const track = project.tracks.find((item) => item.id === action.trackId)
      if (!track || !name || track.name === name) return state
      return commit(state, {
        ...project,
        tracks: project.tracks.map((item) =>
          item.id === action.trackId ? { ...item, name } : item
        ),
      })
    }

    case 'toggleMute':
      // Not an undo step, like in Audacity.
      return {
        ...state,
        project: {
          ...project,
          tracks: project.tracks.map((track) =>
            track.id === action.trackId
              ? { ...track, muted: !track.muted }
              : track
          ),
        },
      }

    case 'moveClip': {
      const next = moveClip(
        project,
        action.clipId,
        action.trackId,
        action.start
      )
      const moved = findClip(next, action.clipId)
      return commit(
        state,
        next,
        moved
          ? {
              trackIds: [moved.track.id],
              start: moved.clip.start,
              end: clipEnd(moved.clip),
            }
          : selection
      )
    }

    case 'copy': {
      if (!selection || !hasRange(selection)) return state
      const clipboard = copyRange(
        project,
        selection.trackIds,
        selection.start,
        selection.end
      )
      return clipboard ? { ...state, clipboard } : state
    }

    case 'cut':
    case 'delete': {
      if (!selection || !hasRange(selection)) return state
      const clipboard =
        action.type === 'cut'
          ? copyRange(
              project,
              selection.trackIds,
              selection.start,
              selection.end
            )
          : state.clipboard
      const next = deleteRange(
        project,
        selection.trackIds,
        selection.start,
        selection.end
      )
      const cursor = { ...selection, end: selection.start }
      return { ...commit(state, next, cursor), clipboard }
    }

    case 'paste': {
      const { clipboard } = state
      if (!clipboard) return state
      let next = project
      let at = 0
      let index = 0
      if (selection) {
        at = selection.start
        index = Math.max(
          0,
          project.tracks.findIndex((track) =>
            selection.trackIds.includes(track.id)
          )
        )
        if (hasRange(selection)) {
          next = deleteRange(
            next,
            selection.trackIds,
            selection.start,
            selection.end
          )
        }
      }
      const pasted = insertClipboard(next, index, at, clipboard)
      return commit(state, pasted.project, {
        trackIds: pasted.trackIds,
        start: at,
        end: at + clipboard.duration,
      })
    }

    case 'split':
      return selection
        ? commit(state, splitAtSelection(project, selection))
        : state

    case 'gain':
      return selection
        ? commit(state, changeGain(project, selection, action.delta))
        : state

    case 'fade':
      return selection
        ? commit(
            state,
            setFade(project, selection, action.edge, action.seconds)
          )
        : state
  }
}
