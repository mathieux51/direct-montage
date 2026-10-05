'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clipEnd,
  dbToGain,
  EPS,
  fadeFactor,
  hasRange,
  moveClip,
  projectDuration,
} from '@/lib/audio/edit'
import { peakRange } from '@/lib/audio/peaks'
import type { SourceStore } from '@/lib/audio/sources'
import type { Clip, Project, Selection, Track } from '@/lib/audio/types'
import { baseName, formatTime } from '@/lib/files'
import {
  clampView,
  scrollExtent,
  zoomView,
  type TimelineView,
} from '@/lib/view'
import {
  MutedIcon,
  SpeakerIcon,
  TrashIcon,
  TriangleDownIcon,
  TriangleUpIcon,
} from './icons'

const RULER_HEIGHT = 26
const CLIP_HEADER = 20
const LANE_PADDING = 3
const DRAG_THRESHOLD = 4
const SNAP_PX = 8
const EDGE_PX = 28
const DOUBLE_TAP_MS = 350
const VOLUME_WIDTH = 118
const VOLUME_HEIGHT = 34
const MUTED_COLOR = '#6b7280'
const PLAYHEAD_COLOR = '#ebcb8b'

/** Major tick spacing and minor tick spacing, in seconds. */
const RULER_STEPS: [number, number][] = [
  [0.01, 0.002],
  [0.02, 0.005],
  [0.05, 0.01],
  [0.1, 0.02],
  [0.2, 0.05],
  [0.5, 0.1],
  [1, 0.2],
  [2, 0.5],
  [5, 1],
  [10, 2],
  [15, 5],
  [30, 5],
  [60, 10],
  [120, 30],
  [300, 60],
  [600, 120],
  [1800, 300],
  [3600, 600],
]

export interface TimelineProps {
  project: Project
  selection: Selection | null
  sources: SourceStore
  sourcesVersion: number
  view: TimelineView
  playing: boolean
  getPlayhead: () => number
  /** Volume of the selected region, shown between the ▼/▲ buttons; null hides them. */
  gainLabel: string | null
  onViewChange: (view: TimelineView) => void
  onWidthChange: (width: number) => void
  onSelect: (selection: Selection | null) => void
  onSeek: (time: number) => void
  onMoveClip: (clipId: string, trackId: string, start: number) => void
  onGain: (delta: number) => void
  onToggleMute: (trackId: string) => void
  onRemoveTrack: (trackId: string) => void
  onRenameTrack: (trackId: string, name: string) => void
}

type Point = { x: number; y: number }

type Gesture =
  | {
      kind: 'select'
      pointerId: number
      origin: Point
      anchorTime: number
      anchorTrack: number
      moved: boolean
    }
  | {
      kind: 'ruler'
      pointerId: number
      origin: Point
      anchorTime: number
      moved: boolean
    }
  | {
      kind: 'move'
      pointerId: number
      origin: Point
      clip: Clip
      trackIndex: number
      grab: number
      moved: boolean
    }
  | { kind: 'pinch'; distance: number; pxPerSec: number; anchorTime: number }

interface MovePreview {
  clipId: string
  trackIndex: number
  start: number
}

interface Scene {
  project: Project
  selection: Selection | null
  view: TimelineView
  width: number
  height: number
  laneHeight: number
  sources: SourceStore
  font: string
  activeClipId: string | null
}

export default function Timeline(props: TimelineProps) {
  const { project, selection, view, playing, getPlayhead, onWidthChange } =
    props
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const [rootWidth, setRootWidth] = useState(0)
  const [preview, setPreview] = useState<MovePreview | null>(null)
  const [font, setFont] = useState('sans-serif')

  const compact = rootWidth > 0 && rootWidth < 640
  const headerWidth = compact ? 92 : 148
  const laneHeight = compact ? 84 : 100
  const width = Math.max(0, Math.floor(rootWidth - headerWidth))
  const height = RULER_HEIGHT + project.tracks.length * laneHeight

  // The project as drawn: includes the region being dragged.
  const shown = useMemo(() => {
    const track = preview && project.tracks[preview.trackIndex]
    return preview && track
      ? moveClip(project, preview.clipId, track.id, preview.start)
      : project
  }, [project, preview])
  const duration = projectDuration(shown)

  // Pointer handlers span several renders, so they read the latest values here.
  const latest = useRef({ props, shown, width, laneHeight, duration })
  const viewRef = useRef(view)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const lastTap = useRef<{ at: number; point: Point } | null>(null)
  const previewRef = useRef<MovePreview | null>(null)
  const autoScroll = useRef({ frame: 0, speed: 0, point: { x: 0, y: 0 } })

  useLayoutEffect(() => {
    latest.current = { props, shown, width, laneHeight, duration }
    viewRef.current = props.view
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(([entry]) =>
      setRootWidth(entry.contentRect.width)
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (width > 0) onWidthChange(width)
  }, [width, onWidthChange])

  useEffect(() => {
    // Canvas text needs the page font by name, once it has loaded.
    const update = () => setFont(getComputedStyle(document.body).fontFamily)
    update()
    document.fonts?.ready.then(update)
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    drawTimeline(canvas, {
      project: shown,
      selection,
      view,
      width,
      height,
      laneHeight,
      sources: props.sources,
      font,
      activeClipId: preview?.clipId ?? null,
    })
  }, [
    shown,
    selection,
    view,
    width,
    height,
    laneHeight,
    props.sources,
    props.sourcesVersion,
    font,
    preview,
  ])

  // Only reads refs, so it never changes.
  const setView = useCallback((next: TimelineView) => {
    viewRef.current = next
    latest.current.props.onViewChange(next)
  }, [])

  const timeAt = (x: number) =>
    viewRef.current.scroll + x / viewRef.current.pxPerSec

  const toLocal = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  const trackIndexAt = (y: number) => {
    const count = latest.current.shown.tracks.length
    const index = Math.floor((y - RULER_HEIGHT) / latest.current.laneHeight)
    return Math.min(count - 1, Math.max(0, index))
  }

  const hitTest = (point: Point) => {
    const { shown: drawn, laneHeight: lane } = latest.current
    const index = Math.floor((point.y - RULER_HEIGHT) / lane)
    const track = drawn.tracks[index]
    if (!track) return null
    const top = RULER_HEIGHT + index * lane
    const { scroll, pxPerSec } = viewRef.current
    for (let i = track.clips.length - 1; i >= 0; i--) {
      const clip = track.clips[i]
      const x0 = (clip.start - scroll) * pxPerSec
      const x1 = Math.max((clipEnd(clip) - scroll) * pxPerSec, x0 + 4)
      if (point.x >= x0 - 1 && point.x <= x1 + 1) {
        const onHeader =
          point.y >= top + LANE_PADDING &&
          point.y <= top + LANE_PADDING + CLIP_HEADER
        return { trackIndex: index, track, clip, onHeader }
      }
    }
    return { trackIndex: index, track, clip: null, onHeader: false }
  }

  const selectClip = (clip: Clip, track: Track) =>
    latest.current.props.onSelect({
      trackIds: [track.id],
      start: clip.start,
      end: clipEnd(clip),
    })

  const snap = (start: number, clip: Clip) => {
    const { project: committed } = latest.current.props
    let best = start
    let distance = SNAP_PX / viewRef.current.pxPerSec
    for (const track of committed.tracks) {
      for (const other of track.clips) {
        if (other.id === clip.id) continue
        for (const edge of [other.start, clipEnd(other)]) {
          for (const shift of [edge - start, edge - start - clip.duration]) {
            if (Math.abs(shift) < distance) {
              distance = Math.abs(shift)
              best = start + shift
            }
          }
        }
      }
    }
    if (Math.abs(start) < distance) best = 0
    return Math.max(0, best)
  }

  const applyGesture = (point: Point) => {
    const g = gesture.current
    if (!g || g.kind === 'pinch') return
    const { props: current, shown: drawn } = latest.current
    const time = Math.max(0, timeAt(point.x))
    if (g.kind === 'select') {
      const index = trackIndexAt(point.y)
      const from = Math.min(index, g.anchorTrack)
      const to = Math.max(index, g.anchorTrack)
      current.onSelect({
        trackIds: drawn.tracks.slice(from, to + 1).map((track) => track.id),
        start: Math.min(g.anchorTime, time),
        end: Math.max(g.anchorTime, time),
      })
    } else if (g.kind === 'ruler') {
      current.onSelect({
        trackIds: drawn.tracks.map((track) => track.id),
        start: Math.min(g.anchorTime, time),
        end: Math.max(g.anchorTime, time),
      })
    } else {
      const next = {
        clipId: g.clip.id,
        trackIndex: trackIndexAt(point.y),
        start: snap(time - g.grab, g.clip),
      }
      previewRef.current = next
      setPreview(next)
    }
  }

  const stopAutoScroll = () => {
    cancelAnimationFrame(autoScroll.current.frame)
    autoScroll.current.frame = 0
  }

  // Scrolls while a drag is held near the left or right edge.
  const updateAutoScroll = (point: Point) => {
    const edgeRight = latest.current.width - EDGE_PX
    const raw =
      point.x < EDGE_PX
        ? point.x - EDGE_PX
        : point.x > edgeRight
          ? point.x - edgeRight
          : 0
    autoScroll.current.speed = Math.max(-60, Math.min(60, raw))
    autoScroll.current.point = point
    if (raw === 0) {
      stopAutoScroll()
      return
    }
    if (autoScroll.current.frame) return
    const step = () => {
      const current = viewRef.current
      const next = clampView(
        {
          ...current,
          scroll:
            current.scroll +
            (autoScroll.current.speed * 0.5) / current.pxPerSec,
        },
        latest.current.width,
        latest.current.duration
      )
      if (next.scroll !== current.scroll) {
        setView(next)
        applyGesture(autoScroll.current.point)
      }
      autoScroll.current.frame = requestAnimationFrame(step)
    }
    autoScroll.current.frame = requestAnimationFrame(step)
  }

  const cancelGesture = () => {
    stopAutoScroll()
    gesture.current = null
    previewRef.current = null
    setPreview(null)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const point = toLocal(event)
    pointers.current.set(event.pointerId, point)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom, slide to scroll.
      cancelGesture()
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        kind: 'pinch',
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        pxPerSec: viewRef.current.pxPerSec,
        anchorTime: timeAt((a.x + b.x) / 2),
      }
      return
    }
    if (pointers.current.size > 2) return

    const time = Math.max(0, timeAt(point.x))
    const { props: current } = latest.current
    if (point.y < RULER_HEIGHT) {
      gesture.current = {
        kind: 'ruler',
        pointerId: event.pointerId,
        origin: point,
        anchorTime: time,
        moved: false,
      }
      return
    }
    const hit = hitTest(point)
    if (!hit) return
    if (hit.clip && hit.onHeader) {
      event.currentTarget.style.cursor = 'grabbing'
      gesture.current = {
        kind: 'move',
        pointerId: event.pointerId,
        origin: point,
        clip: hit.clip,
        trackIndex: hit.trackIndex,
        grab: time - hit.clip.start,
        moved: false,
      }
      return
    }
    const existing = current.selection
    if (event.shiftKey && existing) {
      // Shift-click extends the selection to this point and track.
      const tracks = latest.current.shown.tracks
      const indices = tracks
        .map((track, index) =>
          existing.trackIds.includes(track.id) ? index : -1
        )
        .filter((index) => index >= 0)
      const from = Math.min(hit.trackIndex, ...indices)
      const to = Math.max(hit.trackIndex, ...indices)
      current.onSelect({
        trackIds: tracks.slice(from, to + 1).map((track) => track.id),
        start: Math.min(existing.start, time),
        end: Math.max(existing.end, time),
      })
      return
    }
    gesture.current = {
      kind: 'select',
      pointerId: event.pointerId,
      origin: point,
      anchorTime: time,
      anchorTrack: hit.trackIndex,
      moved: false,
    }
  }

  const updateHoverCursor = (canvas: HTMLCanvasElement, point: Point) => {
    let cursor = 'default'
    if (point.y < RULER_HEIGHT) cursor = 'pointer'
    else {
      const hit = hitTest(point)
      if (hit) cursor = hit.clip && hit.onHeader ? 'grab' : 'text'
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toLocal(event)
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, point)
    }
    const g = gesture.current
    if (!g) {
      if (event.pointerType === 'mouse') {
        updateHoverCursor(event.currentTarget, point)
      }
      return
    }
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const { width: w, duration: d } = latest.current
      const pxPerSec = clampView(
        {
          pxPerSec:
            g.pxPerSec * (Math.hypot(a.x - b.x, a.y - b.y) / g.distance),
          scroll: 0,
        },
        w,
        d
      ).pxPerSec
      setView(
        clampView(
          { pxPerSec, scroll: g.anchorTime - (a.x + b.x) / 2 / pxPerSec },
          w,
          d
        )
      )
      return
    }
    if (event.pointerId !== g.pointerId) return
    if (
      !g.moved &&
      Math.hypot(point.x - g.origin.x, point.y - g.origin.y) < DRAG_THRESHOLD
    ) {
      return
    }
    g.moved = true
    applyGesture(point)
    updateAutoScroll(point)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    if (event.pointerId !== g.pointerId) return
    stopAutoScroll()
    gesture.current = null
    event.currentTarget.style.cursor = ''
    const { props: current, shown: drawn } = latest.current
    const point = toLocal(event)
    const time = Math.max(0, timeAt(point.x))

    if (g.kind === 'move') {
      const moved = previewRef.current
      previewRef.current = null
      setPreview(null)
      const target = moved && current.project.tracks[moved.trackIndex]
      if (g.moved && moved && target) {
        current.onMoveClip(moved.clipId, target.id, moved.start)
      } else {
        const track = current.project.tracks[g.trackIndex]
        if (track) selectClip(g.clip, track)
      }
      return
    }
    if (g.moved) return

    if (g.kind === 'ruler') {
      const trackIds = current.selection?.trackIds.length
        ? current.selection.trackIds
        : drawn.tracks.map((track) => track.id)
      current.onSelect({ trackIds, start: time, end: time })
      current.onSeek(time)
      return
    }

    // A tap places the cursor; a double tap selects the whole region.
    const now = performance.now()
    const previous = lastTap.current
    const isDouble =
      previous !== null &&
      now - previous.at < DOUBLE_TAP_MS &&
      Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < 24
    lastTap.current = isDouble ? null : { at: now, point }
    const hit = hitTest(point)
    if (isDouble && hit?.clip) {
      selectClip(hit.clip, hit.track)
      return
    }
    const track = drawn.tracks[g.anchorTrack]
    if (!track) return
    current.onSelect({ trackIds: [track.id], start: time, end: time })
    current.onSeek(time)
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId)
    event.currentTarget.style.cursor = ''
    cancelGesture()
  }

  // Wheel: horizontal scroll, and zoom with Ctrl/⌘ (trackpad pinch on desktop).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      const { width: w, duration: d } = latest.current
      const scale = event.deltaMode === 1 ? 16 : 1
      const current = viewRef.current
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const x = event.clientX - canvas.getBoundingClientRect().left
        const factor = Math.min(
          2,
          Math.max(0.5, Math.exp(-event.deltaY * scale * 0.01))
        )
        setView(
          zoomView(
            current,
            factor,
            current.scroll + x / current.pxPerSec,
            x,
            w,
            d
          )
        )
        return
      }
      const horizontal =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0
      if (horizontal === 0) return
      event.preventDefault()
      setView(
        clampView(
          {
            ...current,
            scroll: current.scroll + (horizontal * scale) / current.pxPerSec,
          },
          w,
          d
        )
      )
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [setView])

  useEffect(() => {
    const scrolling = autoScroll.current
    return () => cancelAnimationFrame(scrolling.frame)
  }, [])

  // Playhead: moved every frame without re-rendering; the view follows it page by page.
  useEffect(() => {
    const element = playheadRef.current
    if (!element) return
    if (!playing) {
      element.style.display = 'none'
      return
    }
    let frame = 0
    let previousX: number | null = null
    const tick = () => {
      const { width: w, duration: d } = latest.current
      const current = viewRef.current
      const position = getPlayhead()
      let x = (position - current.scroll) * current.pxPerSec
      const offscreenAtStart = previousX === null && (x < 0 || x > w)
      const reachedEdge =
        previousX !== null && previousX <= w - 2 && x > w - 2 && x < w + 80
      if ((offscreenAtStart || reachedEdge) && !gesture.current) {
        const next = clampView(
          { ...current, scroll: position - (w * 0.05) / current.pxPerSec },
          w,
          d
        )
        setView(next)
        x = (position - next.scroll) * next.pxPerSec
      }
      previousX = x
      element.style.display = x >= -2 && x <= w ? 'block' : 'none'
      element.style.transform = `translateX(${Math.round(x) - 1}px)`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, getPlayhead, setView])

  // Where the ▼/▲ volume buttons sit: centred in the visible part of the
  // selection, under the region header bar so they never cover a drag handle.
  const volumePosition = useMemo(() => {
    if (!props.gainLabel || !selection || preview || width <= 0) return null
    const first = project.tracks.findIndex((track) =>
      selection.trackIds.includes(track.id)
    )
    if (first < 0) return null
    const startX = (selection.start - view.scroll) * view.pxPerSec
    const endX = (selection.end - view.scroll) * view.pxPerSec
    if (endX < 0 || startX > width) return null
    const visibleStart = Math.max(0, startX)
    const visibleEnd = Math.min(width, endX)
    let left = (visibleStart + visibleEnd) / 2 - VOLUME_WIDTH / 2
    if (visibleEnd - visibleStart < VOLUME_WIDTH + 12) {
      // Narrow selection: put the buttons beside it.
      left =
        endX + 6 + VOLUME_WIDTH <= width ? endX + 6 : startX - 6 - VOLUME_WIDTH
    }
    const body = laneHeight - 2 * LANE_PADDING - CLIP_HEADER
    return {
      left: Math.max(0, Math.min(width - VOLUME_WIDTH, left)),
      top:
        RULER_HEIGHT +
        first * laneHeight +
        LANE_PADDING +
        CLIP_HEADER +
        (body - VOLUME_HEIGHT) / 2,
    }
  }, [props.gainLabel, selection, preview, width, project, view, laneHeight])

  const selectWholeTrack = (track: Track) => {
    const end = track.clips.reduce(
      (max, clip) => Math.max(max, clipEnd(clip)),
      0
    )
    props.onSelect({ trackIds: [track.id], start: 0, end })
  }

  return (
    <div ref={rootRef} className='select-none'>
      <div className='flex overflow-hidden rounded-md border border-gray-700 bg-gray-900'>
        <div
          className='shrink-0 border-r border-gray-700'
          style={{ width: headerWidth }}
        >
          <div
            className='flex items-end border-b border-gray-700 bg-[#0b1220] px-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500'
            style={{ height: RULER_HEIGHT }}
          >
            Pistes
          </div>
          {project.tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              height={laneHeight}
              compact={compact}
              selected={selection?.trackIds.includes(track.id) ?? false}
              onSelectTrack={() => selectWholeTrack(track)}
              onToggleMute={() => props.onToggleMute(track.id)}
              onRemove={() => props.onRemoveTrack(track.id)}
              onRename={(name) => props.onRenameTrack(track.id, name)}
            />
          ))}
        </div>
        <div className='relative min-w-0 flex-1'>
          <canvas
            ref={canvasRef}
            className='block'
            style={{
              height,
              touchAction: 'none',
              overscrollBehavior: 'contain',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            // A click handler makes Android Chrome treat the canvas as tappable,
            // so its touch adjustment stops sending taps near the edges to the
            // track headers or the volume buttons.
            onClick={() => undefined}
          />
          <div
            ref={playheadRef}
            className='pointer-events-none absolute left-0 top-0 w-0.5'
            style={{ height, background: PLAYHEAD_COLOR, display: 'none' }}
          />
          {volumePosition && (
            <div
              className='absolute z-10 flex items-stretch overflow-hidden rounded-md border border-gray-500 bg-gray-950/85 shadow-lg'
              style={{
                left: volumePosition.left,
                top: volumePosition.top,
                width: VOLUME_WIDTH,
                height: VOLUME_HEIGHT,
              }}
            >
              <button
                type='button'
                onClick={() => props.onGain(-1)}
                aria-label='Baisser le volume de la région'
                title='Volume -1 dB (flèche bas)'
                className='flex w-9 touch-manipulation items-center justify-center text-gray-100 hover:bg-gray-700 active:bg-gray-600'
              >
                <TriangleDownIcon size={16} />
              </button>
              <span className='flex flex-1 items-center justify-center border-x border-gray-700 text-xs text-gray-100 tabular-nums'>
                {props.gainLabel}
              </span>
              <button
                type='button'
                onClick={() => props.onGain(1)}
                aria-label='Monter le volume de la région'
                title='Volume +1 dB (flèche haut)'
                className='flex w-9 touch-manipulation items-center justify-center text-gray-100 hover:bg-gray-700 active:bg-gray-600'
              >
                <TriangleUpIcon size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className='mt-1 flex'>
        <div className='shrink-0' style={{ width: headerWidth }} />
        <Scrollbar
          view={view}
          width={width}
          duration={duration}
          onScroll={(scroll) =>
            setView(clampView({ ...view, scroll }, width, duration))
          }
        />
      </div>
    </div>
  )
}

function TrackHeader({
  track,
  height,
  compact,
  selected,
  onSelectTrack,
  onToggleMute,
  onRemove,
  onRename,
}: {
  track: Track
  height: number
  compact: boolean
  selected: boolean
  onSelectTrack: () => void
  onToggleMute: () => void
  onRemove: () => void
  onRename: (name: string) => void
}) {
  return (
    <div
      className={`relative flex flex-col justify-between border-b border-gray-700 py-1.5 pl-3 pr-1.5 ${
        selected ? 'bg-gray-700/70' : 'bg-gray-800'
      }`}
      style={{ height }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelectTrack()
      }}
    >
      <span
        className='pointer-events-none absolute inset-y-0 left-0 w-1'
        style={{ background: track.color }}
      />
      <input
        key={track.name}
        defaultValue={track.name}
        aria-label='Nom de la piste'
        className='w-full truncate rounded bg-transparent px-1 py-0.5 text-sm text-white outline-none focus:bg-gray-900'
        onBlur={(event) => {
          const name = event.target.value.trim()
          if (name && name !== track.name) onRename(name)
          else event.target.value = track.name
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = track.name
            event.currentTarget.blur()
          }
        }}
      />
      <div className='flex items-center gap-1'>
        <button
          type='button'
          onClick={onToggleMute}
          aria-pressed={track.muted}
          aria-label={
            track.muted ? 'Réactiver la piste' : 'Rendre la piste muette'
          }
          title={track.muted ? 'Réactiver la piste' : 'Rendre la piste muette'}
          className={`flex h-8 touch-manipulation items-center gap-1 rounded px-2 text-xs transition-colors ${
            track.muted
              ? 'bg-[#ebcb8b] text-gray-900 hover:bg-[#f0d6a3]'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
        >
          {track.muted ? <MutedIcon size={15} /> : <SpeakerIcon size={15} />}
          {!compact && <span>Muet</span>}
        </button>
        <button
          type='button'
          onClick={onRemove}
          aria-label='Supprimer la piste'
          title='Supprimer la piste'
          className='flex h-8 w-8 touch-manipulation items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300'
        >
          <TrashIcon size={15} />
        </button>
      </div>
    </div>
  )
}

function Scrollbar({
  view,
  width,
  duration,
  onScroll,
}: {
  view: TimelineView
  width: number
  duration: number
  onScroll: (scroll: number) => void
}) {
  const drag = useRef<{ pointerId: number; grab: number } | null>(null)
  const extent = scrollExtent(view, width, duration)
  const visible = width / view.pxPerSec
  const scrollable = width > 0 && extent - visible > 1e-6
  const thumbWidth = scrollable
    ? Math.max(32, (visible / extent) * width)
    : width
  const range = Math.max(1, width - thumbWidth)
  const thumbLeft = scrollable ? (view.scroll / (extent - visible)) * range : 0

  const scrollTo = (left: number) =>
    onScroll((Math.min(range, Math.max(0, left)) / range) * (extent - visible))

  const localX = (event: ReactPointerEvent<HTMLDivElement>) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left

  return (
    <div
      className={`relative flex h-6 min-w-0 flex-1 items-center ${
        scrollable ? '' : 'pointer-events-none opacity-0'
      }`}
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        const x = localX(event)
        const onThumb = x >= thumbLeft && x <= thumbLeft + thumbWidth
        const grab = onThumb ? x - thumbLeft : thumbWidth / 2
        drag.current = { pointerId: event.pointerId, grab }
        event.currentTarget.setPointerCapture(event.pointerId)
        if (!onThumb) scrollTo(x - grab)
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return
        scrollTo(localX(event) - drag.current.grab)
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      aria-hidden='true'
    >
      <div className='h-2.5 w-full rounded-full bg-gray-700/60' />
      <div
        className='absolute h-2.5 rounded-full bg-gray-400 hover:bg-gray-300'
        style={{ left: thumbLeft, width: thumbWidth }}
      />
    </div>
  )
}

// Drawing

function rgba(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawTimeline(canvas: HTMLCanvasElement, scene: Scene) {
  const ratio = window.devicePixelRatio || 1
  const pixelWidth = Math.max(1, Math.round(scene.width * ratio))
  const pixelHeight = Math.max(1, Math.round(scene.height * ratio))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  canvas.style.width = `${scene.width}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, scene.width, scene.height)
  ctx.font = `12px ${scene.font}`
  ctx.textBaseline = 'alphabetic'
  drawRuler(ctx, scene)
  scene.project.tracks.forEach((track, index) =>
    drawLane(ctx, scene, track, index)
  )
  // While a region is dragged, its old selection would only be noise.
  if (!scene.activeClipId) drawSelection(ctx, scene)
}

function drawRuler(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { view, width, selection } = scene
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, width, RULER_HEIGHT)

  const showSelection = selection && !scene.activeClipId
  if (showSelection && hasRange(selection)) {
    const x0 = (selection.start - view.scroll) * view.pxPerSec
    const x1 = (selection.end - view.scroll) * view.pxPerSec
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.fillRect(x0, 0, x1 - x0, RULER_HEIGHT)
  }

  const [major, minor] =
    RULER_STEPS.find(([step]) => step * view.pxPerSec >= 72) ??
    RULER_STEPS[RULER_STEPS.length - 1]
  const decimals = major < 0.1 ? 2 : major < 1 ? 1 : 0
  const last = view.scroll + width / view.pxPerSec
  for (let i = Math.floor(view.scroll / minor); i * minor <= last; i++) {
    const t = i * minor
    const x = Math.round((t - view.scroll) * view.pxPerSec) + 0.5
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
    ctx.fillStyle = isMajor ? '#6b7280' : '#374151'
    const tick = isMajor ? 9 : 4
    ctx.fillRect(x - 0.5, RULER_HEIGHT - tick, 1, tick)
    if (isMajor) {
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(formatTime(t, decimals), x + 4, 13)
    }
  }

  if (showSelection && !hasRange(selection)) {
    const x = (selection.start - view.scroll) * view.pxPerSec
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(x - 5, RULER_HEIGHT - 7)
    ctx.lineTo(x + 5, RULER_HEIGHT - 7)
    ctx.lineTo(x, RULER_HEIGHT)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#374151'
  ctx.fillRect(0, RULER_HEIGHT - 1, width, 1)
}

function isClipSelected(scene: Scene, track: Track, clip: Clip) {
  if (scene.activeClipId === clip.id) return true
  const { selection } = scene
  if (!selection || !hasRange(selection)) return false
  if (!selection.trackIds.includes(track.id)) return false
  return (
    clip.start >= selection.start - EPS && clipEnd(clip) <= selection.end + EPS
  )
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  track: Track,
  index: number
) {
  const top = RULER_HEIGHT + index * scene.laneHeight
  const selected = scene.selection?.trackIds.includes(track.id) ?? false
  ctx.fillStyle = selected ? '#1a2436' : index % 2 === 0 ? '#111827' : '#131b2a'
  ctx.fillRect(0, top, scene.width, scene.laneHeight)
  ctx.fillStyle = '#273244'
  ctx.fillRect(0, top + scene.laneHeight - 1, scene.width, 1)
  // The dragged region is drawn last, on top of the others.
  const clips = scene.activeClipId
    ? [
        ...track.clips.filter((clip) => clip.id !== scene.activeClipId),
        ...track.clips.filter((clip) => clip.id === scene.activeClipId),
      ]
    : track.clips
  for (const clip of clips) drawClip(ctx, scene, track, clip, top)
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  track: Track,
  clip: Clip,
  laneTop: number
) {
  const { view, width, laneHeight } = scene
  const x0 = (clip.start - view.scroll) * view.pxPerSec
  const x1 = (clipEnd(clip) - view.scroll) * view.pxPerSec
  if (x1 < -2 || x0 > width + 2) return
  const top = laneTop + LANE_PADDING
  const bottom = laneTop + laneHeight - LANE_PADDING - 1
  const bodyTop = top + CLIP_HEADER
  const left = Math.max(x0, -4)
  const right = Math.min(Math.max(x1, x0 + 2), width + 4)
  const color = track.muted ? MUTED_COLOR : track.color
  const selected = isClipSelected(scene, track, clip)

  ctx.save()
  roundedRect(ctx, left, top, right - left, bottom - top, 4)
  ctx.fillStyle = rgba(color, track.muted ? 0.07 : 0.13)
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = rgba(color, selected ? 0.95 : 0.45)
  ctx.fillRect(left, top, right - left, CLIP_HEADER)
  drawWaveform(ctx, scene, clip, color, x0, x1, bodyTop + 3, bottom - 3)
  drawFades(ctx, clip, x0, x1, bodyTop, bottom, view.pxPerSec)

  const source = scene.sources.get(clip.sourceId)
  const name = source ? baseName(source.name) : 'Audio indisponible'
  const gain =
    clip.gain === 0 ? '' : `   ${clip.gain > 0 ? '+' : ''}${clip.gain} dB`
  ctx.fillStyle = selected ? '#0b1220' : '#f3f4f6'
  ctx.fillText(`${name}${gain}`, Math.max(x0, 0) + 6, top + 14)
  ctx.restore()

  ctx.strokeStyle = selected ? '#ffffff' : rgba(color, 0.75)
  ctx.lineWidth = selected ? 2 : 1
  roundedRect(ctx, left + 0.5, top + 0.5, right - left - 1, bottom - top - 1, 4)
  ctx.stroke()
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  clip: Clip,
  color: string,
  x0: number,
  x1: number,
  top: number,
  bottom: number
) {
  const source = scene.sources.get(clip.sourceId)
  if (!source) return
  const { view, width } = scene
  const mid = (top + bottom) / 2
  const half = (bottom - top) / 2
  const sampleRate = source.buffer.sampleRate
  const gain = dbToGain(clip.gain)
  const secondsPerPx = 1 / view.pxPerSec
  const from = Math.max(0, Math.floor(x0))
  const to = Math.min(width, Math.ceil(x1))
  const clipped: number[] = []

  ctx.fillStyle = rgba(color, 0.35)
  ctx.fillRect(from, Math.round(mid), Math.max(0, to - from), 1)
  ctx.fillStyle = color
  for (let x = from; x < to; x++) {
    const a = Math.max(0, view.scroll + x * secondsPerPx - clip.start)
    const b = Math.min(
      clip.duration,
      view.scroll + (x + 1) * secondsPerPx - clip.start
    )
    if (b <= a) continue
    const [min, max] = peakRange(
      source.peaks,
      source.channels,
      (clip.offset + a) * sampleRate,
      (clip.offset + b) * sampleRate
    )
    const g = gain * fadeFactor(clip, (a + b) / 2)
    const high = max * g
    const low = min * g
    const yTop = mid - Math.min(1, high) * half
    const yBottom = mid - Math.max(-1, low) * half
    if (high > 1 || low < -1) clipped.push(x, yTop, yBottom)
    else ctx.fillRect(x, yTop, 1, Math.max(1, yBottom - yTop))
  }
  // Samples pushed past full scale by the volume are drawn in red.
  ctx.fillStyle = '#f87171'
  for (let i = 0; i < clipped.length; i += 3) {
    ctx.fillRect(
      clipped[i],
      clipped[i + 1],
      1,
      Math.max(1, clipped[i + 2] - clipped[i + 1])
    )
  }
}

function drawFades(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  pxPerSec: number
) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 1.5
  if (clip.fadeIn > 0) {
    const x = x0 + clip.fadeIn * pxPerSec
    ctx.beginPath()
    ctx.moveTo(x0, top)
    ctx.lineTo(x, top)
    ctx.lineTo(x0, bottom)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x0, bottom)
    ctx.lineTo(x, top)
    ctx.stroke()
  }
  if (clip.fadeOut > 0) {
    const x = x1 - clip.fadeOut * pxPerSec
    ctx.beginPath()
    ctx.moveTo(x1, top)
    ctx.lineTo(x, top)
    ctx.lineTo(x1, bottom)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x1, bottom)
    ctx.stroke()
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { selection, view, laneHeight, project } = scene
  if (!selection) return
  const x0 = (selection.start - view.scroll) * view.pxPerSec
  const x1 = (selection.end - view.scroll) * view.pxPerSec
  project.tracks.forEach((track, index) => {
    if (!selection.trackIds.includes(track.id)) return
    const top = RULER_HEIGHT + index * laneHeight
    if (hasRange(selection)) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)'
      ctx.fillRect(x0, top, x1 - x0, laneHeight - 1)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.fillRect(Math.round(x0), top, 1, laneHeight - 1)
      ctx.fillRect(Math.round(x1) - 1, top, 1, laneHeight - 1)
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(x0), top, 1.5, laneHeight - 1)
    }
  })
}
