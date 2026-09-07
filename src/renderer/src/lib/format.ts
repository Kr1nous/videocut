export function formatTimecode(ms: number, withMs = false): string {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.max(0, Math.abs(ms))
  const totalSec = Math.floor(abs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const frac = Math.floor((abs % 1000) / 10)
  const core = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
  return sign + (withMs ? `${core}.${String(frac).padStart(2, '0')}` : core)
}

import { mediaSrc } from './cut'

export function mediaUrl(filePath: string): string {
  return mediaSrc(filePath)
}
