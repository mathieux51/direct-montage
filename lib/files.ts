const AUDIO_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.wma',
  '.aiff',
  '.opus',
  '.webm',
]

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  const name = file.name.toLowerCase()
  return AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension))
}

/** File name without its extension. */
export const baseName = (name: string) => name.replace(/\.[^./]+$/, '') || name

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/** Formats seconds as m:ss (or h:mm:ss) with the given number of decimals. */
export function formatTime(seconds: number, decimals = 0): string {
  const factor = 10 ** decimals
  const total = Math.round(Math.max(0, seconds) * factor) / factor
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = (total % 60)
    .toFixed(decimals)
    .padStart(decimals > 0 ? decimals + 3 : 2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
    : `${minutes}:${secs}`
}
