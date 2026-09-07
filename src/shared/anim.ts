import { clipFx } from './types'
import type { AnimKey, AnimProp, ClipFx, EaseKind, TimelineClip } from './types'

export function easeFn(u: number, kind: EaseKind): number {
  const t = Math.min(1, Math.max(0, u))
  if (kind === 'ease_in') return t * t
  if (kind === 'ease_out') return 1 - (1 - t) * (1 - t)
  if (kind === 'ease_in_out') return (1 - Math.cos(Math.PI * t)) / 2
  return t
}

export function sampleKeys(keys: AnimKey[] | undefined, t01: number, fallback: number): number {
  if (!keys?.length) return fallback
  const s = [...keys].sort((a, b) => a.t - b.t)
  if (t01 <= s[0].t) return s[0].value
  const last = s[s.length - 1]
  if (t01 >= last.t) return last.value
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]
    const b = s[i + 1]
    if (t01 <= b.t) {
      const span = Math.max(1e-6, b.t - a.t)
      const u = easeFn((t01 - a.t) / span, a.ease || 'linear')
      return a.value + (b.value - a.value) * u
    }
  }
  return fallback
}

export function localT01(clip: TimelineClip, timeMs: number): number {
  if (clip.durationMs <= 0) return 0
  return Math.min(1, Math.max(0, (timeMs - clip.startMs) / clip.durationMs))
}

export function fxAt(clip: TimelineClip, timeMs: number): ClipFx {
  const fx = clipFx(clip)
  const t = localT01(clip, timeMs)
  return {
    ...fx,
    opacity: sampleKeys(fx.keys?.opacity, t, fx.opacity),
    scale: sampleKeys(fx.keys?.scale, t, fx.scale),
    posX: sampleKeys(fx.keys?.posX, t, fx.posX),
    posY: sampleKeys(fx.keys?.posY, t, fx.posY)
  }
}

export function hasAnim(fx: ClipFx, prop?: AnimProp): boolean {
  if (prop) return Boolean(fx.keys?.[prop]?.length)
  return Boolean(
    fx.keys?.opacity?.length ||
      fx.keys?.scale?.length ||
      fx.keys?.posX?.length ||
      fx.keys?.posY?.length ||
      fx.keys?.volume?.length
  )
}

function easeExpr(u: string, kind: EaseKind): string {
  if (kind === 'ease_in') return `pow(${u}\\,2)`
  if (kind === 'ease_out') return `(1-pow(1-(${u})\\,2))`
  if (kind === 'ease_in_out') return `((1-cos(PI*(${u})))/2)`
  return u
}

/** ffmpeg 表达式，timeVar 为 t（overlay/scale）或 T（geq）。 */
export function ffmpegInterp(keys: AnimKey[] | undefined, durationS: number, fallback: number, timeVar = 't'): string {
  if (!keys?.length) return fallback.toFixed(4)
  const s = [...keys].sort((a, b) => a.t - b.t)
  const tv = timeVar
  let expr = s[s.length - 1].value.toFixed(4)
  for (let i = s.length - 2; i >= 0; i--) {
    const t0 = (s[i].t * durationS).toFixed(4)
    const t1 = (s[i + 1].t * durationS).toFixed(4)
    const span = Math.max(0.001, s[i + 1].t * durationS - s[i].t * durationS).toFixed(4)
    const u = `clip((${tv}-${t0})/${span}\\,0\\,1)`
    const e = easeExpr(u, s[i].ease || 'linear')
    const v = `${s[i].value.toFixed(4)}+(${s[i + 1].value.toFixed(4)}-${s[i].value.toFixed(4)})*(${e})`
    expr = `if(lt(${tv}\\,${t1})\\,${v}\\,${expr})`
  }
  const firstT = (s[0].t * durationS).toFixed(4)
  expr = `if(lt(${tv}\\,${firstT})\\,${s[0].value.toFixed(4)}\\,${expr})`
  return expr
}

export function upsertKey(keys: AnimKey[] | undefined, t: number, value: number, ease: EaseKind, seed?: number): AnimKey[] {
  const track = [...(keys ?? [])]
  const tt = Math.min(1, Math.max(0, t))
  if (!track.length && tt > 0.008 && seed != null) {
    track.push({ t: 0, value: seed, ease })
  }
  const i = track.findIndex((k) => Math.abs(k.t - tt) < 0.012)
  const next: AnimKey = { t: tt, value, ease }
  if (i >= 0) track[i] = next
  else track.push(next)
  track.sort((a, b) => a.t - b.t)
  return track
}
