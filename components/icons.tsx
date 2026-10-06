import type { ReactNode, SVGProps } from 'react'

function Icon({
  children,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      {...props}
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number }

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M7 4.5v15l12-7.5z' fill='currentColor' />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x='6' y='4.5' width='4' height='15' rx='1' fill='currentColor' />
    <rect x='14' y='4.5' width='4' height='15' rx='1' fill='currentColor' />
  </Icon>
)

export const SkipBackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M19 5v14L9 12z' fill='currentColor' />
    <path d='M5 5v14' />
  </Icon>
)

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M9 14 4 9l5-5' />
    <path d='M4 9h10.5a5.5 5.5 0 0 1 0 11H11' />
  </Icon>
)

export const RedoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='m15 14 5-5-5-5' />
    <path d='M20 9H9.5a5.5 5.5 0 0 0 0 11H13' />
  </Icon>
)

export const ScissorsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx='6' cy='6' r='3' />
    <circle cx='6' cy='18' r='3' />
    <path d='M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12' />
  </Icon>
)

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x='9' y='9' width='12' height='12' rx='2' />
    <path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' />
  </Icon>
)

export const PasteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' />
    <rect x='8' y='2' width='8' height='4' rx='1' />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
  </Icon>
)

export const SplitIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M12 3v18' />
    <path d='m8 8-4 4 4 4M16 8l4 4-4 4' />
  </Icon>
)

export const FadeInIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M3 20h18' />
    <path d='M3 20 13 6h8' />
  </Icon>
)

export const FadeOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M3 20h18' />
    <path d='M3 6h8l10 14' />
  </Icon>
)

export const ZoomInIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx='11' cy='11' r='7' />
    <path d='m21 21-4.3-4.3M11 8v6M8 11h6' />
  </Icon>
)

export const ZoomOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx='11' cy='11' r='7' />
    <path d='m21 21-4.3-4.3M8 11h6' />
  </Icon>
)

export const FitIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' />
  </Icon>
)

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M12 5v14M5 12h14' />
  </Icon>
)

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M11 5 6 9H2v6h4l5 4z' fill='currentColor' />
    <path d='M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14' />
  </Icon>
)

export const MutedIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M11 5 6 9H2v6h4l5 4z' fill='currentColor' />
    <path d='m22 9-6 6M16 9l6 6' />
  </Icon>
)

export const TriangleUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M12 6 20 18H4z' fill='currentColor' stroke='none' />
  </Icon>
)

export const TriangleDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M12 18 4 6h16z' fill='currentColor' stroke='none' />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M18 6 6 18M6 6l12 12' />
  </Icon>
)

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x='5' y='11' width='14' height='10' rx='2' />
    <path d='M8 11V7a4 4 0 0 1 8 0v4' />
  </Icon>
)

export const UnlockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x='5' y='11' width='14' height='10' rx='2' />
    <path d='M8 11V7a4 4 0 0 1 7.75-1.4' />
  </Icon>
)

export const AudioFileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
    <path d='M14 2v6h6' />
    <circle cx='10' cy='17' r='2' />
    <path d='M12 17v-6l3 1.5' />
  </Icon>
)

export const AddTrackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d='M3 6h18M3 12h10M3 18h8M17 14v8M13 18h8' />
  </Icon>
)
