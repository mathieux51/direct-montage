'use client'

import type { ReactNode, RefObject } from 'react'
import { formatTime } from '@/lib/files'
import LevelMeter from './LevelMeter'
import {
  CopyIcon,
  FadeInIcon,
  FadeOutIcon,
  FitIcon,
  LockIcon,
  PasteIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  ScissorsIcon,
  SkipBackIcon,
  SplitIcon,
  TrashIcon,
  UndoIcon,
  UnlockIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'

interface ToolbarProps {
  playing: boolean
  /** Updated every frame by the editor while playing. */
  timeRef: RefObject<HTMLSpanElement | null>
  cursorTime: number
  duration: number
  selectionInfo: string
  canUndo: boolean
  canRedo: boolean
  hasRange: boolean
  canPaste: boolean
  hasRegion: boolean
  /** What the padlock button does for the current selection. */
  groupAction: 'group' | 'ungroup'
  canGroup: boolean
  getLevels: () => number[]
  fadeSeconds: string
  onFadeSecondsChange: (value: string) => void
  onTogglePlay: () => void
  onToStart: () => void
  onUndo: () => void
  onRedo: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onSplit: () => void
  onGroupToggle: () => void
  onFade: (edge: 'in' | 'out') => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

function ToolButton({
  label,
  description = label,
  shortcut,
  onClick,
  disabled,
  showLabel = 'desktop',
  children,
}: {
  label: string
  /** Accessible name and tooltip, when the visible label is too short. */
  description?: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  showLabel?: 'always' | 'desktop' | 'never'
  children: ReactNode
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={description}
      title={shortcut ? `${description} (${shortcut})` : description}
      className='flex h-9 min-w-9 touch-manipulation items-center justify-center gap-1.5 rounded-md bg-gray-700 px-2.5 text-sm text-gray-100 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-700'
    >
      {children}
      {showLabel !== 'never' && (
        <span className={showLabel === 'desktop' ? 'hidden md:inline' : ''}>
          {label}
        </span>
      )}
    </button>
  )
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className='flex flex-wrap items-center gap-1.5'>{children}</div>
)

const Divider = () => (
  <span className='hidden h-6 w-px bg-gray-600 sm:block' aria-hidden='true' />
)

export default function Toolbar(props: ToolbarProps) {
  const fadeValue = parseFloat(props.fadeSeconds.replace(',', '.'))
  const canFade =
    props.hasRegion && Number.isFinite(fadeValue) && fadeValue >= 0

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <Group>
            <ToolButton
              label='Revenir au début'
              shortcut='Début'
              onClick={props.onToStart}
              showLabel='never'
            >
              <SkipBackIcon />
            </ToolButton>
            <button
              type='button'
              onClick={props.onTogglePlay}
              disabled={props.duration <= 0}
              title={props.playing ? 'Pause (Espace)' : 'Lire (Espace)'}
              className='flex h-9 w-28 touch-manipulation items-center justify-center gap-2 rounded-md bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40'
            >
              {props.playing ? <PauseIcon /> : <PlayIcon />}
              {props.playing ? 'Pause' : 'Lire'}
            </button>
          </Group>
          <div className='text-sm text-gray-300 tabular-nums'>
            <span ref={props.timeRef} hidden={!props.playing} />
            <span hidden={props.playing}>
              {formatTime(props.cursorTime, 2)}
            </span>
            <span className='text-gray-500'>
              {' '}
              / {formatTime(props.duration, 2)}
            </span>
          </div>
        </div>
        <div className='order-last flex min-w-0 flex-1 basis-full sm:order-none sm:basis-auto'>
          <LevelMeter getLevels={props.getLevels} playing={props.playing} />
        </div>
        <Group>
          <ToolButton
            label='Dézoomer'
            shortcut='-'
            onClick={props.onZoomOut}
            showLabel='never'
          >
            <ZoomOutIcon />
          </ToolButton>
          <ToolButton
            label='Zoomer'
            shortcut='+'
            onClick={props.onZoomIn}
            showLabel='never'
          >
            <ZoomInIcon />
          </ToolButton>
          <ToolButton label='Tout afficher' onClick={props.onFit}>
            <FitIcon />
          </ToolButton>
        </Group>
      </div>

      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <Group>
          <ToolButton
            label='Annuler'
            shortcut='Ctrl+Z'
            onClick={props.onUndo}
            disabled={!props.canUndo}
            showLabel='never'
          >
            <UndoIcon />
          </ToolButton>
          <ToolButton
            label='Rétablir'
            shortcut='Ctrl+Maj+Z'
            onClick={props.onRedo}
            disabled={!props.canRedo}
            showLabel='never'
          >
            <RedoIcon />
          </ToolButton>
        </Group>
        <Divider />
        <Group>
          <ToolButton
            label='Couper'
            shortcut='Ctrl+X'
            onClick={props.onCut}
            disabled={!props.hasRange}
          >
            <ScissorsIcon />
          </ToolButton>
          <ToolButton
            label='Copier'
            shortcut='Ctrl+C'
            onClick={props.onCopy}
            disabled={!props.hasRange}
          >
            <CopyIcon />
          </ToolButton>
          <ToolButton
            label='Coller'
            shortcut='Ctrl+V'
            onClick={props.onPaste}
            disabled={!props.canPaste}
          >
            <PasteIcon />
          </ToolButton>
          <ToolButton
            label='Supprimer'
            shortcut='Suppr'
            onClick={props.onDelete}
            disabled={!props.hasRange}
          >
            <TrashIcon />
          </ToolButton>
          <ToolButton
            label='Scinder'
            description='Scinder la région au curseur ou aux bords de la sélection'
            shortcut='S'
            onClick={props.onSplit}
            disabled={!props.hasRegion}
            showLabel='always'
          >
            <SplitIcon />
          </ToolButton>
          <ToolButton
            label={props.groupAction === 'ungroup' ? 'Dégrouper' : 'Grouper'}
            description={
              props.groupAction === 'ungroup'
                ? 'Dégrouper les régions sélectionnées'
                : 'Grouper les régions sélectionnées pour les déplacer ensemble'
            }
            shortcut={props.groupAction === 'ungroup' ? 'Ctrl+Maj+G' : 'Ctrl+G'}
            onClick={props.onGroupToggle}
            disabled={!props.canGroup}
            showLabel='always'
          >
            {props.groupAction === 'ungroup' ? <UnlockIcon /> : <LockIcon />}
          </ToolButton>
        </Group>
        <Divider />
        <Group>
          <label className='flex items-center gap-1.5 text-sm text-gray-300'>
            Fondu
            <input
              type='number'
              inputMode='decimal'
              min='0'
              step='0.5'
              value={props.fadeSeconds}
              onChange={(event) =>
                props.onFadeSecondsChange(event.target.value)
              }
              className='h-9 w-16 rounded-md border border-gray-600 bg-gray-900 px-2 text-right text-white outline-none focus:border-blue-400'
              aria-label='Durée du fondu en secondes'
            />
            s
          </label>
          <ToolButton
            label='Entrée'
            description="Fondu d'entrée linéaire sur la région"
            onClick={() => props.onFade('in')}
            disabled={!canFade}
            showLabel='always'
          >
            <FadeInIcon />
          </ToolButton>
          <ToolButton
            label='Sortie'
            description='Fondu de sortie linéaire sur la région'
            onClick={() => props.onFade('out')}
            disabled={!canFade}
            showLabel='always'
          >
            <FadeOutIcon />
          </ToolButton>
        </Group>
      </div>

      <p className='min-h-5 text-xs text-gray-400 tabular-nums'>
        {props.selectionInfo}
      </p>
    </div>
  )
}
