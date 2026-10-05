/** Horizontal view of the timeline: zoom level and left edge, in seconds. */
export interface TimelineView {
  pxPerSec: number
  scroll: number
}

export const MAX_PX_PER_SEC = 4000

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Zooming out stops when twice the project (or 10 s) fits on screen. */
export const minPxPerSec = (width: number, duration: number) =>
  clamp(width / (Math.max(duration, 10) * 2), 0.01, MAX_PX_PER_SEC)

/** Keeps the zoom in bounds and lets the view scroll half a screen past the end. */
export function clampView(
  view: TimelineView,
  width: number,
  duration: number
): TimelineView {
  const pxPerSec = clamp(
    view.pxPerSec,
    minPxPerSec(width, duration),
    MAX_PX_PER_SEC
  )
  const visible = width / pxPerSec
  const extent = Math.max(duration + visible / 2, visible)
  return {
    pxPerSec,
    scroll: clamp(view.scroll, 0, Math.max(0, extent - visible)),
  }
}

/** Zooms by `factor` while keeping `anchorTime` under the pixel `anchorX`. */
export function zoomView(
  view: TimelineView,
  factor: number,
  anchorTime: number,
  anchorX: number,
  width: number,
  duration: number
): TimelineView {
  const pxPerSec = clampView(
    { pxPerSec: view.pxPerSec * factor, scroll: 0 },
    width,
    duration
  ).pxPerSec
  return clampView(
    { pxPerSec, scroll: anchorTime - anchorX / pxPerSec },
    width,
    duration
  )
}

export const fitView = (width: number, duration: number) =>
  clampView(
    { pxPerSec: width / (Math.max(duration, 1) * 1.02), scroll: 0 },
    width,
    duration
  )

/** Total scrollable length in seconds, used by the scrollbar. */
export function scrollExtent(
  view: TimelineView,
  width: number,
  duration: number
) {
  const visible = width / view.pxPerSec
  return Math.max(duration + visible / 2, visible)
}
