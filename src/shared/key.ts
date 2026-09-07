import type { ClipFx, ClipKey } from './types'

export const DEFAULT_KEY: ClipKey = {
  color: '#00ff00',
  tolerance: 0.3,
  spill: 0.35,
  edge: 0.08
}

export function parseKeyColor(color: string): string {
  const c = (color || '').trim().toLowerCase()
  if (c === 'green' || c === 'g') return '#00ff00'
  if (c === 'blue' || c === 'b') return '#0000ff'
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
  if (/^[0-9a-f]{6}$/.test(c)) return `#${c}`
  return '#00ff00'
}

export function isBlueKey(color: string): boolean {
  const hex = parseKeyColor(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return b >= g && b >= r
}

export function defaultKey(color = 'green'): ClipKey {
  return { ...DEFAULT_KEY, color: parseKeyColor(color) }
}

function clamp01(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n))
}

/** ffmpeg colorkey: RGB 欧氏距离 / 255，similarity 阈值，blend 为过渡宽度。 */
export function keyFfmpeg(fx: ClipFx): string[] {
  const k = fx.key
  if (!k) return []
  const hex = parseKeyColor(k.color).slice(1).toUpperCase()
  const sim = clamp01(k.tolerance, 0.00001, 1)
  const blend = clamp01(k.edge)
  const bits = [`format=rgba`, `colorkey=0x${hex}:${sim.toFixed(3)}:${blend.toFixed(3)}`]
  if (k.spill > 0.01) {
    bits.push(`despill=type=${isBlueKey(k.color) ? 'blue' : 'green'}:mix=${k.spill.toFixed(3)}:alpha=0`)
  }
  return bits
}

export function stabilizeFfmpeg(fx: ClipFx): string[] {
  const s = fx.stabilize
  if (!s?.enabled || fx.freeze) return []
  const amt = clamp01(s.amount ?? 0.5)
  const r = amt >= 0.66 ? 32 : 16
  return [`deshake=rx=${r}:ry=${r}:edge=mirror`]
}

export function applyKeyCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, fx: ClipFx): void {
  const k = fx.key
  if (!k) return
  const hex = parseKeyColor(k.color).slice(1)
  const kr = parseInt(hex.slice(0, 2), 16)
  const kg = parseInt(hex.slice(2, 4), 16)
  const kb = parseInt(hex.slice(4, 6), 16)
  const sim = clamp01(k.tolerance, 0.00001, 1)
  const blend = clamp01(k.edge)
  const spill = clamp01(k.spill)
  const blue = isBlueKey(k.color)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - kr
    const dg = d[i + 1] - kg
    const db = d[i + 2] - kb
    const diff = Math.sqrt((dr * dr + dg * dg + db * db) / (255 * 255))
    const a = blend > 0.0001 ? clamp01((diff - sim) / blend) : diff > sim ? 1 : 0
    d[i + 3] = Math.round(d[i + 3] * a)
    if (spill > 0.01 && a > 0.02) {
      if (blue) {
        const extra = Math.max(0, d[i + 2] - Math.max(d[i], d[i + 1]))
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] - extra * spill))
      } else {
        const extra = Math.max(0, d[i + 1] - Math.max(d[i], d[i + 2]))
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] - extra * spill))
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}
