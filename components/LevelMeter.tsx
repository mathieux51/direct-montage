'use client'

import { useEffect, useRef, useState } from 'react'

const MIN_DB = -60
const TARGET_DB = -12
const RELEASE_DB_PER_SECOND = 24
const HOLD_SECONDS = 1.5
const TICKS = [-48, -36, -24, -12, -6, -3, 0]

/** Position of a level on the meter, from 0 (-60 dB or less) to 1 (0 dB). */
const position = (db: number) =>
  (Math.min(0, Math.max(MIN_DB, db)) - MIN_DB) / -MIN_DB

const toDb = (level: number) => (level > 0 ? 20 * Math.log10(level) : -Infinity)

const GRADIENT = `linear-gradient(to right, #a3be8c 0%, #a3be8c ${
  position(TARGET_DB) * 100
}%, #ebcb8b ${position(TARGET_DB) * 100}%, #ebcb8b ${
  position(-3) * 100
}%, #bf616a ${position(-3) * 100}%)`

/**
 * Peak meter of the playback, with the -12 dB mark highlighted to help set
 * region volumes. The bars are moved directly in the DOM every frame.
 */
export default function LevelMeter({
  getLevels,
  playing,
}: {
  getLevels: () => number[]
  playing: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const masks = useRef<(HTMLDivElement | null)[]>([])
  const holds = useRef<(HTMLDivElement | null)[]>([])
  const [clipped, setClipped] = useState(false)

  useEffect(() => {
    if (playing) setClipped(false)
    const shown = [MIN_DB, MIN_DB]
    const held = [
      { db: MIN_DB, at: 0 },
      { db: MIN_DB, at: 0 },
    ]
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000
      last = now
      const levels = playing ? getLevels() : []
      let loudest = MIN_DB
      for (let i = 0; i < 2; i++) {
        const raw = levels[i] ?? levels[0] ?? 0
        if (raw >= 0.999) setClipped(true)
        const db = Math.max(MIN_DB, toDb(raw))
        // Rises at once, falls back slowly, like a hardware meter.
        shown[i] = Math.max(db, shown[i] - RELEASE_DB_PER_SECOND * elapsed)
        if (shown[i] >= held[i].db) held[i] = { db: shown[i], at: now }
        else if (now - held[i].at > HOLD_SECONDS * 1000) {
          held[i].db = Math.max(
            shown[i],
            held[i].db - RELEASE_DB_PER_SECOND * elapsed
          )
        }
        loudest = Math.max(loudest, shown[i])
        const mask = masks.current[i]
        if (mask) mask.style.width = `${(1 - position(shown[i])) * 100}%`
        const hold = holds.current[i]
        if (hold) {
          hold.style.left = `${position(held[i].db) * 100}%`
          hold.style.opacity = held[i].db > MIN_DB ? '1' : '0'
        }
      }
      rootRef.current?.setAttribute('data-level', loudest.toFixed(1))
      // Keep animating until the bars have fallen back after playback.
      if (playing || loudest > MIN_DB || held.some((h) => h.db > MIN_DB)) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, getLevels])

  return (
    <div
      ref={rootRef}
      className='flex min-w-[220px] flex-1 basis-full items-center gap-2 sm:basis-auto'
      aria-label='Vumètre (niveau de lecture)'
      data-level={MIN_DB}
    >
      <span className='text-xs text-gray-400'>Niveau</span>
      <div className='relative min-w-0 flex-1 pb-3.5' aria-hidden='true'>
        {[0, 1].map((channel) => (
          <div
            key={channel}
            className='relative mb-0.5 h-2 overflow-hidden rounded-sm'
            style={{ background: GRADIENT }}
          >
            <div
              ref={(element) => {
                masks.current[channel] = element
              }}
              className='absolute inset-y-0 right-0 bg-gray-900'
              style={{ width: '100%' }}
            />
            <div
              ref={(element) => {
                holds.current[channel] = element
              }}
              className='absolute inset-y-0 w-0.5 -translate-x-full bg-white'
              style={{ left: '0%', opacity: 0 }}
            />
          </div>
        ))}
        <div
          className='absolute top-0 h-[18px] w-0.5 -translate-x-1/2 bg-[#ebcb8b]'
          style={{ left: `${position(TARGET_DB) * 100}%` }}
        />
        {TICKS.map((db) => (
          <span
            key={db}
            className={`absolute bottom-0 -translate-x-1/2 text-[10px] leading-none tabular-nums ${
              db === TARGET_DB
                ? 'font-semibold text-[#ebcb8b]'
                : db < -24
                  ? 'hidden text-gray-500 md:inline'
                  : 'text-gray-500'
            }`}
            style={{ left: `${position(db) * 100}%` }}
          >
            {db === 0 ? '0' : `−${-db}`}
            {db === TARGET_DB && ' dB'}
          </span>
        ))}
      </div>
      <button
        type='button'
        onClick={() => setClipped(false)}
        title={
          clipped
            ? 'Saturation détectée pendant la lecture (cliquer pour effacer)'
            : 'Aucune saturation'
        }
        className={`h-5 touch-manipulation rounded px-1.5 text-[10px] font-semibold tracking-wide transition-colors ${
          clipped ? 'bg-[#bf616a] text-white' : 'bg-gray-700 text-gray-400'
        }`}
      >
        SAT
      </button>
    </div>
  )
}
