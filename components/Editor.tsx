'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'
import AudioUpload from './AudioUpload'
import Timeline from './Timeline'
import Toolbar from './Toolbar'
import { AddTrackIcon, AudioFileIcon, CloseIcon, DownloadIcon } from './icons'
import {
  clipsInSelection,
  createClip,
  createId,
  createTrack,
  groupSizes,
  hasRange,
  projectDuration,
} from '@/lib/audio/edit'
import { PlaybackEngine, PROJECT_SAMPLE_RATE } from '@/lib/audio/engine'
import { mixdownToMp3, mixdownToWav } from '@/lib/audio/mixdown'
import { SourceStore } from '@/lib/audio/sources'
import type { Project, Selection, Track } from '@/lib/audio/types'
import { editorReducer, emptyEditorState } from '@/lib/editorState'
import { baseName, downloadBlob, formatTime, isAudioFile } from '@/lib/files'
import {
  clearLegacyAudio,
  clearStoredProject,
  deleteStoredSources,
  loadStoredProject,
  readLegacyAudio,
  saveStoredProject,
  saveStoredSource,
  type StoredSource,
} from '@/lib/projectDB'
import { clearSharedAudioFiles, getLatestSharedAudioFile } from '@/lib/sharedDB'
import { clampView, fitView, zoomView, type TimelineView } from '@/lib/view'

const SAVE_ERROR =
  "Le projet n'a pas pu être enregistré dans ce navigateur (espace de stockage insuffisant ?)."

const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db} dB`

const exportName = (name: string) =>
  name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'montage'

function describeSelection(selection: Selection | null): string {
  if (!selection) return 'Touchez ou cliquez une piste pour placer le curseur.'
  if (!hasRange(selection)) return `Curseur : ${formatTime(selection.start, 2)}`
  const length = (selection.end - selection.start).toFixed(2)
  return `Sélection : ${formatTime(selection.start, 2)} → ${formatTime(selection.end, 2)} (${length} s)`
}

/** Decodes a stored audio file into the source store and returns its duration. */
async function decodeSource(
  store: SourceStore,
  engine: PlaybackEngine,
  source: StoredSource
): Promise<number> {
  // decodeAudioData detaches the buffer it gets, so keep the original for storage.
  const buffer = await engine.decode(source.data.slice(0))
  await store.add(source.id, source.name, buffer)
  return buffer.duration
}

export default function Editor() {
  const [state, dispatch] = useReducer(editorReducer, emptyEditorState)
  const [store] = useState(() => new SourceStore())
  const [engine] = useState(() => new PlaybackEngine())
  const sourcesVersion = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getVersion
  )
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingShare, setPendingShare] = useState<StoredSource | null>(null)
  const [view, setView] = useState<TimelineView>({ pxPerSec: 20, scroll: 0 })
  const [width, setWidth] = useState(0)
  const [fitPending, setFitPending] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [fadeSeconds, setFadeSeconds] = useState('2')
  const [draggingFiles, setDraggingFiles] = useState(false)
  const stateRef = useRef(state)
  const playback = useRef<{ to: number; range: boolean } | null>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    stateRef.current = state
  })

  const { project, selection } = state
  const duration = projectDuration(project)
  const regions = clipsInSelection(project, selection)
  // The padlock groups the touched regions, or ungroups them when they all
  // already belong to one group.
  const sizes = groupSizes(project)
  const isGrouped = (groupId?: string) =>
    !!groupId && (sizes.get(groupId) ?? 0) > 1
  const units = new Set(
    regions.map((clip) => (isGrouped(clip.groupId) ? clip.groupId : clip.id))
  )
  const oneGroup =
    units.size === 1 && regions.every((clip) => isGrouped(clip.groupId))
  const groupAction = oneGroup ? 'ungroup' : 'group'
  const canGroup = oneGroup || units.size > 1

  /** Decodes files and adds one track per file, or starts a new project with them. */
  const importSources = useCallback(
    async (items: StoredSource[], mode: 'add' | 'replace' = 'add') => {
      const decoded: { item: StoredSource; length: number }[] = []
      const failed: string[] = []
      for (const item of items) {
        setBusy(`Chargement de « ${item.name} »…`)
        try {
          decoded.push({
            item,
            length: await decodeSource(store, engine, item),
          })
        } catch {
          failed.push(`« ${item.name} »`)
        }
      }
      if (failed.length > 0) {
        setMessage(
          `Impossible de lire ${failed.join(', ')} : ce format audio n'est pas pris en charge par ce navigateur.`
        )
      }
      if (decoded.length === 0) {
        setBusy(null)
        return
      }

      const replace = mode === 'replace'
      const current = stateRef.current
      const existing = replace ? [] : current.project.tracks
      const tracks: Track[] = []
      for (const { item, length } of decoded) {
        tracks.push(
          createTrack(
            baseName(item.name),
            [...existing, ...tracks],
            [createClip(item.id, length)]
          )
        )
      }
      const name =
        replace || !current.name.trim()
          ? baseName(decoded[0].item.name)
          : current.name

      // Store the files and the project right away: the old project is only
      // dropped once the new files are known to be readable.
      setBusy('Enregistrement…')
      try {
        if (replace) await clearStoredProject()
        for (const { item } of decoded) await saveStoredSource(item)
        await saveStoredProject({
          name,
          project: { tracks: [...existing, ...tracks] },
        })
      } catch {
        setMessage(SAVE_ERROR)
      }
      setBusy(null)

      if (replace) {
        store.retain(new Set(decoded.map(({ item }) => item.id)))
        dispatch({ type: 'load', name, project: { tracks } })
        setFitPending(true)
        return
      }
      if (stateRef.current.project.tracks.length === 0) setFitPending(true)
      if (name !== stateRef.current.name) dispatch({ type: 'rename', name })
      dispatch({ type: 'addTracks', tracks })
    },
    [store, engine]
  )

  const importFiles = useCallback(
    async (files: File[]) => {
      const audio = files.filter(isAudioFile)
      if (audio.length < files.length) {
        setMessage("Les fichiers qui ne sont pas de l'audio ont été ignorés.")
      }
      if (audio.length === 0) return
      setBusy('Lecture des fichiers…')
      const items = await Promise.all(
        audio.map(async (file) => ({
          id: createId('src'),
          name: file.name,
          type: file.type,
          data: await file.arrayBuffer(),
        }))
      )
      await importSources(items)
    },
    [importSources]
  )

  // Restore the saved project, then pick up a recording shared by Direct Podcast.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let name = ''
      let loaded: Project = { tracks: [] }
      try {
        const { stored, sources } = await loadStoredProject()
        if (stored) {
          const used = new Set(
            stored.project.tracks.flatMap((track) =>
              track.clips.map((clip) => clip.sourceId)
            )
          )
          for (const source of sources) {
            if (!used.has(source.id)) continue
            setBusy(`Chargement de « ${source.name} »…`)
            await decodeSource(store, engine, source).catch(() => undefined)
          }
          const unused = sources
            .filter((source) => !used.has(source.id))
            .map((source) => source.id)
          if (unused.length > 0) await deleteStoredSources(unused)
          name = stored.name
          loaded = stored.project
        } else {
          const legacy = await readLegacyAudio()
          if (legacy) {
            // File kept by the single-track version of Direct Montage.
            setBusy('Récupération de votre fichier…')
            try {
              const length = await decodeSource(store, engine, legacy)
              name = baseName(legacy.name)
              loaded = {
                tracks: [
                  createTrack(name, [], [createClip(legacy.id, length)]),
                ],
              }
              await saveStoredSource(legacy)
              await saveStoredProject({ name, project: loaded })
            } finally {
              await clearLegacyAudio()
            }
          }
        }
      } catch {
        // Storage unavailable (private browsing for example): start empty.
      }
      if (cancelled) return
      dispatch({ type: 'load', name, project: loaded })
      if (loaded.tracks.length > 0) setFitPending(true)

      const params = new URLSearchParams(window.location.search)
      if (params.get('sharing') === 'true') {
        try {
          const shared = await getLatestSharedAudioFile()
          await clearSharedAudioFiles()
          if (shared) {
            const item = {
              id: createId('src'),
              name: shared.filename,
              type: shared.fileType,
              data: shared.arrayBuffer,
            }
            if (loaded.tracks.length > 0) setPendingShare(item)
            else await importSources([item])
          }
        } catch {
          setMessage('Erreur lors du chargement du fichier partagé.')
        }
        params.delete('sharing')
        const query = params.toString()
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
        )
      }
      setBusy(null)
      setReady(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [store, engine, importSources])

  // Save the project shortly after each change, and right away when the page is hidden.
  useEffect(() => {
    if (!ready) return
    const save = () =>
      saveStoredProject({ name: state.name, project: state.project }).catch(
        () => setMessage(SAVE_ERROR)
      )
    const timer = setTimeout(save, 400)
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [ready, state.name, state.project])

  useEffect(() => {
    if (!fitPending || width <= 0) return
    setView(fitView(width, duration))
    setFitPending(false)
  }, [fitPending, width, duration])

  useEffect(() => {
    if (width > 0) setView((current) => clampView(current, width, duration))
  }, [width, duration])

  // Playback

  const getPlayhead = useCallback(() => engine.position(), [engine])
  const getLevels = useCallback(() => engine.levels(), [engine])

  const startPlayback = useCallback(
    (from: number, to: number, range: boolean) => {
      playback.current = { to, range }
      engine
        .play(stateRef.current.project, (id) => store.get(id)?.buffer, from, to)
        .catch(() =>
          setMessage('La lecture est impossible dans ce navigateur.')
        )
      setPlaying(true)
    },
    [engine, store]
  )

  const stopPlayback = useCallback(
    (keepPosition: boolean) => {
      const current = playback.current
      if (!current) return
      const position = engine.position()
      engine.stop()
      playback.current = null
      setPlaying(false)
      // Like a media player: pausing leaves the cursor where playback stopped.
      if (keepPosition && !current.range) {
        const { selection: active, project: currentProject } = stateRef.current
        const trackIds =
          active?.trackIds ?? currentProject.tracks.slice(0, 1).map((t) => t.id)
        dispatch({
          type: 'select',
          selection: { trackIds, start: position, end: position },
        })
      }
    },
    [engine]
  )

  const togglePlay = useCallback(() => {
    if (playback.current) {
      stopPlayback(true)
      return
    }
    const { project: current, selection: active } = stateRef.current
    const end = projectDuration(current)
    if (end <= 0) return
    if (active && hasRange(active)) {
      startPlayback(active.start, active.end, true)
    } else {
      const from = active && active.start < end - 0.05 ? active.start : 0
      startPlayback(from, end, false)
    }
  }, [startPlayback, stopPlayback])

  const seek = useCallback(
    (time: number) => {
      if (!playback.current) return
      startPlayback(time, projectDuration(stateRef.current.project), false)
    },
    [startPlayback]
  )

  // Stop at the end of the range, and keep the time display moving.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const position = engine.position()
      if (timeRef.current) timeRef.current.textContent = formatTime(position, 2)
      const current = playback.current
      if (current && position >= current.to) {
        engine.stop()
        playback.current = null
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, engine])

  // An edit or a mute during playback is heard right away.
  useEffect(() => {
    const current = playback.current
    if (!current || !engine.playing) return
    const to = current.range ? current.to : projectDuration(project)
    startPlayback(engine.position(), to, current.range)
  }, [project, engine, startPlayback])

  useEffect(() => () => engine.stop(), [engine])

  // View

  const zoom = useCallback(
    (factor: number) => {
      if (width <= 0) return
      setView((current) => {
        const visible = width / current.pxPerSec
        const cursor = stateRef.current.selection?.start
        // Zoom around the cursor when it is on screen, otherwise around the middle.
        const anchor =
          cursor !== undefined &&
          cursor >= current.scroll &&
          cursor <= current.scroll + visible
            ? cursor
            : current.scroll + visible / 2
        const anchorX = (anchor - current.scroll) * current.pxPerSec
        return zoomView(current, factor, anchor, anchorX, width, duration)
      })
    },
    [width, duration]
  )

  const moveCursor = useCallback(
    (time: number) => {
      const { selection: active, project: current } = stateRef.current
      const trackIds =
        active?.trackIds ?? current.tracks.map((track) => track.id)
      dispatch({
        type: 'select',
        selection: { trackIds, start: time, end: time },
      })
      setView((v) => {
        const visible = width / v.pxPerSec
        if (time >= v.scroll && time <= v.scroll + visible) return v
        return clampView(
          { ...v, scroll: time - visible / 2 },
          width,
          projectDuration(current)
        )
      })
      seek(time)
    },
    [width, seek]
  )

  // Keyboard shortcuts, read through a ref so the listener is installed once.
  const shortcuts = useRef({
    togglePlay,
    zoom,
    moveCursor,
    hasRange: false,
    hasRegion: false,
  })
  useLayoutEffect(() => {
    shortcuts.current = {
      togglePlay,
      zoom,
      moveCursor,
      hasRange: selection !== null && hasRange(selection),
      hasRegion: regions.length > 0,
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return
      const target = event.target as Element | null
      if (
        target?.closest?.('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }
      const keys = shortcuts.current
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      let handled = true
      if (key === ' ' && !mod) keys.togglePlay()
      else if (mod && key === 'z')
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      else if (mod && key === 'y') dispatch({ type: 'redo' })
      else if (mod && key === 'a') dispatch({ type: 'selectAll' })
      else if (mod && key === 'x' && keys.hasRange) dispatch({ type: 'cut' })
      else if (mod && key === 'c' && keys.hasRange) dispatch({ type: 'copy' })
      else if (mod && key === 'v') dispatch({ type: 'paste' })
      else if ((mod && key === 'i') || (!mod && key === 's'))
        dispatch({ type: 'split' })
      else if (mod && key === 'g') {
        dispatch({ type: event.shiftKey ? 'ungroup' : 'group' })
      } else if ((key === 'delete' || key === 'backspace') && keys.hasRange) {
        dispatch({ type: 'delete' })
      } else if (key === 'arrowup' && keys.hasRegion)
        dispatch({ type: 'gain', delta: 1 })
      else if (key === 'arrowdown' && keys.hasRegion)
        dispatch({ type: 'gain', delta: -1 })
      else if (key === 'home') keys.moveCursor(0)
      else if (key === 'end') {
        keys.moveCursor(projectDuration(stateRef.current.project))
      } else if (!mod && (key === '+' || key === '=')) keys.zoom(2)
      else if (!mod && key === '-') keys.zoom(0.5)
      else if (key === 'escape') dispatch({ type: 'select', selection: null })
      else handled = false
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Project actions

  /** WAV HD is 24-bit, MP3 HD is 320 kbit/s; both at 48 kHz. */
  const exportMix = async (format: 'wav' | 'mp3') => {
    const { project: current, name } = stateRef.current
    if (projectDuration(current, false) <= 0) {
      setMessage('Rien à exporter : toutes les pistes sont vides ou muettes.')
      return
    }
    const label = format.toUpperCase()
    const progress = (ratio: number) =>
      setBusy(`Export ${label}… ${Math.round(ratio * 100)} %`)
    progress(0)
    const getSource = (id: string) => store.get(id)?.buffer
    try {
      const blob =
        format === 'wav'
          ? await mixdownToWav(
              current,
              getSource,
              PROJECT_SAMPLE_RATE,
              24,
              progress
            )
          : await mixdownToMp3(
              current,
              getSource,
              PROJECT_SAMPLE_RATE,
              progress
            )
      downloadBlob(blob, `${exportName(name)}.${format}`)
    } catch {
      setMessage("L'export a échoué.")
    } finally {
      setBusy(null)
    }
  }

  const addBlankTrack = () => {
    const { tracks } = stateRef.current.project
    const names = new Set(tracks.map((track) => track.name))
    let number = tracks.length + 1
    while (names.has(`Piste ${number}`)) number += 1
    dispatch({
      type: 'addTracks',
      tracks: [createTrack(`Piste ${number}`, tracks)],
    })
  }

  const newProject = async () => {
    if (
      project.tracks.length > 0 &&
      !window.confirm(
        'Commencer un nouveau projet ? Le projet en cours sera effacé.'
      )
    ) {
      return
    }
    stopPlayback(false)
    store.clear()
    dispatch({ type: 'load', name: '', project: { tracks: [] } })
    await clearStoredProject().catch(() => undefined)
  }

  const answerShare = (mode: 'add' | 'replace' | null) => {
    const item = pendingShare
    setPendingShare(null)
    if (!item || !mode) return
    if (mode === 'replace') stopPlayback(false)
    void importSources([item], mode)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDraggingFiles(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingFiles(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDraggingFiles(false)
    void importFiles(Array.from(event.dataTransfer.files))
  }

  const notices = (
    <>
      {pendingShare && (
        <ShareDialog fileName={pendingShare.name} onAnswer={answerShare} />
      )}
      {(busy || message) && (
        <div className='fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4'>
          {busy && (
            <div className='flex items-center gap-3 rounded-md bg-gray-950/95 px-4 py-2 text-sm text-white shadow-lg'>
              <span className='h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white' />
              {busy}
            </div>
          )}
          {message && (
            <div
              role='alert'
              className='flex max-w-lg items-start gap-3 rounded-md bg-red-900/95 px-4 py-2 text-sm text-red-50 shadow-lg'
            >
              <span>{message}</span>
              <button
                type='button'
                onClick={() => setMessage(null)}
                aria-label='Fermer'
                className='shrink-0 rounded p-0.5 hover:bg-red-800'
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )

  if (!ready) {
    return (
      <div className='rounded-lg bg-gray-800 p-8 text-center shadow-lg'>
        <div className='animate-pulse text-lg text-white'>
          {busy ?? 'Chargement du projet…'}
        </div>
      </div>
    )
  }

  if (project.tracks.length === 0 && state.past.length === 0) {
    return (
      <>
        <AudioUpload onFilesSelect={importFiles} />
        {notices}
      </>
    )
  }

  return (
    <div
      className='relative space-y-4 rounded-lg bg-gray-800 p-3 shadow-lg sm:p-6'
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className='flex flex-wrap items-center gap-3'>
        <input
          type='text'
          value={state.name}
          onChange={(event) =>
            dispatch({ type: 'rename', name: event.target.value })
          }
          className='min-w-0 flex-1 basis-48 rounded bg-transparent py-1 text-xl font-semibold text-white outline-none transition-all focus:bg-gray-700 focus:px-2'
          placeholder='Nom du projet'
          aria-label='Nom du projet'
        />
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            onClick={() => fileInput.current?.click()}
            className='flex h-9 touch-manipulation items-center gap-1.5 rounded-md bg-gray-700 px-3 text-sm text-white transition-colors hover:bg-gray-600'
          >
            <AudioFileIcon size={16} />
            Ajouter un fichier son
          </button>
          <button
            type='button'
            onClick={addBlankTrack}
            className='flex h-9 touch-manipulation items-center gap-1.5 rounded-md bg-gray-700 px-3 text-sm text-white transition-colors hover:bg-gray-600'
          >
            <AddTrackIcon size={16} />
            Ajouter une piste vierge
          </button>
          <button
            type='button'
            onClick={() => exportMix('wav')}
            disabled={busy !== null}
            title='WAV 24 bits, 48 kHz'
            className='flex h-9 touch-manipulation items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm text-white transition-colors hover:bg-indigo-700 disabled:opacity-50'
          >
            <DownloadIcon size={16} />
            Exporter WAV (HD)
          </button>
          <button
            type='button'
            onClick={() => exportMix('mp3')}
            disabled={busy !== null}
            title='MP3 320 kbit/s, 48 kHz'
            className='flex h-9 touch-manipulation items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm text-white transition-colors hover:bg-indigo-700 disabled:opacity-50'
          >
            <DownloadIcon size={16} />
            Exporter MP3 (HD)
          </button>
          <button
            type='button'
            onClick={newProject}
            className='h-9 touch-manipulation rounded-md bg-gray-600 px-3 text-sm text-white transition-colors hover:bg-gray-500'
          >
            Nouveau projet
          </button>
        </div>
        <input
          ref={fileInput}
          type='file'
          multiple
          hidden
          onChange={(event) => {
            void importFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      <Toolbar
        playing={playing}
        timeRef={timeRef}
        cursorTime={selection?.start ?? 0}
        duration={duration}
        selectionInfo={describeSelection(selection)}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        hasRange={selection !== null && hasRange(selection)}
        canPaste={state.clipboard !== null}
        hasRegion={regions.length > 0}
        groupAction={groupAction}
        canGroup={canGroup}
        getLevels={getLevels}
        fadeSeconds={fadeSeconds}
        onFadeSecondsChange={setFadeSeconds}
        onTogglePlay={togglePlay}
        onToStart={() => moveCursor(0)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onCut={() => dispatch({ type: 'cut' })}
        onCopy={() => dispatch({ type: 'copy' })}
        onPaste={() => dispatch({ type: 'paste' })}
        onDelete={() => dispatch({ type: 'delete' })}
        onSplit={() => dispatch({ type: 'split' })}
        onGroupToggle={() => dispatch({ type: groupAction })}
        onFade={(edge) =>
          dispatch({
            type: 'fade',
            edge,
            seconds: parseFloat(fadeSeconds.replace(',', '.')) || 0,
          })
        }
        onZoomIn={() => zoom(2)}
        onZoomOut={() => zoom(0.5)}
        onFit={() => setView(fitView(width, duration))}
      />

      {project.tracks.length > 0 ? (
        <Timeline
          project={project}
          selection={selection}
          sources={store}
          sourcesVersion={sourcesVersion}
          view={view}
          playing={playing}
          getPlayhead={getPlayhead}
          gainLabel={
            selection && hasRange(selection) && regions.length > 0
              ? formatDb(regions[0].gain)
              : null
          }
          onViewChange={setView}
          onWidthChange={setWidth}
          onSelect={(next) => dispatch({ type: 'select', selection: next })}
          onSeek={seek}
          onMoveClip={(clipId, trackId, start) =>
            dispatch({ type: 'moveClip', clipId, trackId, start })
          }
          onTrimClip={(clipId, edge, time, sourceDuration) =>
            dispatch({ type: 'trimClip', clipId, edge, time, sourceDuration })
          }
          onGain={(delta) => dispatch({ type: 'gain', delta })}
          onToggleMute={(trackId) => dispatch({ type: 'toggleMute', trackId })}
          onRemoveTrack={(trackId) =>
            dispatch({ type: 'removeTrack', trackId })
          }
          onRenameTrack={(trackId, name) =>
            dispatch({ type: 'renameTrack', trackId, name })
          }
        />
      ) : (
        <button
          type='button'
          onClick={() => fileInput.current?.click()}
          className='flex h-40 w-full items-center justify-center rounded-md border-2 border-dashed border-gray-600 text-sm text-gray-300 transition-colors hover:border-gray-400'
        >
          Aucune piste. Touchez ici ou glissez des fichiers audio pour en
          ajouter.
        </button>
      )}

      <p className='text-xs leading-relaxed text-gray-400'>
        <span className='md:hidden'>
          Glissez sur une piste pour sélectionner. Faites glisser la barre du
          haut d&apos;une région pour la déplacer, ses extrémités pour la
          rallonger ou la raccourcir. Touchez deux fois une région pour la
          sélectionner. Deux doigts pour zoomer et défiler.
        </span>
        <span className='hidden md:inline'>
          Glissez sur une piste pour sélectionner (Maj+clic pour étendre),
          faites glisser la barre du haut d&apos;une région pour la déplacer et
          ses extrémités pour la rallonger ou la raccourcir, double-cliquez pour
          sélectionner une région entière. Raccourcis : Espace lecture,
          Ctrl+X/C/V couper/copier/coller, Suppr supprimer, S scinder, Ctrl+G
          grouper, ↑/↓ volume, Ctrl+Z annuler.
        </span>
      </p>

      {draggingFiles && (
        <div className='pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-gray-900/80 text-lg text-white'>
          Déposez les fichiers pour ajouter des pistes
        </div>
      )}
      {notices}
    </div>
  )
}

function ShareDialog({
  fileName,
  onAnswer,
}: {
  fileName: string
  onAnswer: (mode: 'add' | 'replace' | null) => void
}) {
  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
      role='dialog'
      aria-modal='true'
      aria-labelledby='share-title'
    >
      <div className='w-full max-w-md space-y-4 rounded-lg bg-gray-800 p-6 shadow-xl'>
        <h2 id='share-title' className='text-xl text-white'>
          Fichier reçu de Direct Podcast
        </h2>
        <p className='break-words text-sm text-gray-300'>
          « {fileName} ». Un projet est déjà ouvert : que voulez-vous faire ?
        </p>
        <div className='flex flex-col gap-2'>
          <button
            type='button'
            onClick={() => onAnswer('add')}
            className='rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700'
            autoFocus
          >
            Ajouter comme nouvelle piste
          </button>
          <button
            type='button'
            onClick={() => onAnswer('replace')}
            className='rounded-md bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-500'
          >
            Commencer un nouveau projet
          </button>
          <button
            type='button'
            onClick={() => onAnswer(null)}
            className='px-4 py-2 text-sm text-gray-400 hover:text-gray-200'
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  )
}
