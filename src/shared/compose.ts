import { fxAt } from './anim'
import { clipBlend, clipFx, clipKind } from './types'
import type { BlendMode, ClipFx, Timeline, TimelineClip } from './types'

export function dissolveOverlapMs(clip: TimelineClip): number {
  const fx = clipFx(clip)
  const t = fx.transitionOut.type
  if (t !== 'cross_dissolve' && t !== 'fade_white' && t !== 'push') return 0
  return Math.max(0, fx.transitionOut.durationMs)
}

export function packStorylineClips(clips: TimelineClip[]): void {
  clips.sort((a, b) => a.startMs - b.startMs)
  let t = 0
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    clip.startMs = t
    const next = clips[i + 1]
    let overlap = 0
    if (next) {
      overlap = Math.min(
        dissolveOverlapMs(clip),
        Math.max(0, clip.durationMs - 1),
        Math.max(0, next.durationMs - 1)
      )
    }
    t += clip.durationMs - overlap
  }
}

export function sourceTimeMs(clip: TimelineClip, timeMs: number): number {
  const fx = clipFx(clip)
  const speed = fx.speed || 1
  if (fx.freeze) return Math.max(clip.inMs, Math.min(clip.outMs - 1, fx.freezeAtMs ?? clip.inMs))
  const local = timeMs - clip.startMs
  if (fx.reverse) return clip.outMs - local * speed
  return clip.inMs + local * speed
}

function fadeOutMs(fx: ClipFx): number {
  if (fx.transitionOut.type === 'fade_black') return Math.max(fx.transitionOut.durationMs, fx.fadeOutMs)
  return fx.fadeOutMs
}

export function opacityAt(clip: TimelineClip, timeMs: number, prev?: TimelineClip | null): number {
  const fx = clipFx(clip)
  const local = timeMs - clip.startMs
  if (local < 0 || local >= clip.durationMs) return 0
  let a = fxAt(clip, timeMs).opacity
  let fadeIn = fx.fadeInMs
  if (prev && clipFx(prev).transitionOut.type === 'fade_black') {
    fadeIn = Math.max(fadeIn, clipFx(prev).transitionOut.durationMs)
  }
  if (fadeIn > 0 && local < fadeIn) a *= local / fadeIn
  const outMs = fadeOutMs(fx)
  if (outMs > 0) {
    const outStart = clip.durationMs - outMs
    if (local > outStart) a *= Math.max(0, (clip.durationMs - local) / outMs)
  }
  return Math.min(1, Math.max(0, a))
}

export type CompLayer = {
  clip: TimelineClip
  track: 'storyline' | 'overlay'
  opacity: number
  sourceTimeMs: number
  blend: BlendMode
  kind: ReturnType<typeof clipKind>
  slide?: number
  fadeWhite?: number
}

export function canvasComposite(mode: BlendMode): 'source-over' | 'lighter' | 'screen' | 'multiply' {
  if (mode === 'add') return 'lighter'
  if (mode === 'screen') return 'screen'
  if (mode === 'multiply') return 'multiply'
  return 'source-over'
}

export function ffmpegBlendMode(mode: BlendMode): string | null {
  if (mode === 'add') return 'addition'
  if (mode === 'screen') return 'screen'
  if (mode === 'multiply') return 'multiply'
  return null
}

export function overlayLanes(clips: TimelineClip[]): number[] {
  const lanes: number[] = []
  for (let i = 0; i < clips.length; i++) {
    const used = new Set<number>()
    const c = clips[i]
    for (let j = 0; j < i; j++) {
      const o = clips[j]
      if (c.startMs < o.startMs + o.durationMs && o.startMs < c.startMs + c.durationMs) used.add(lanes[j])
    }
    let lane = 0
    while (used.has(lane)) lane++
    lanes.push(lane)
  }
  return lanes
}

export function layersAt(timeline: Timeline, timeMs: number): CompLayer[] {
  const layers: CompLayer[] = []
  const story = timeline.storyline
    .filter((c) => timeMs >= c.startMs && timeMs < c.startMs + c.durationMs)
    .sort((a, b) => a.startMs - b.startMs)

  if (story.length >= 2) {
    const first = story[0]
    const second = story[1]
    const overlap = dissolveOverlapMs(first)
    const p = overlap > 0 ? Math.min(1, Math.max(0, (timeMs - second.startMs) / overlap)) : 0.5
    const firstPrev = prevClip(timeline.storyline, first)
    const trans = clipFx(first).transitionOut.type
    const a0 = opacityAt(first, timeMs, firstPrev)
    const a1 = opacityAt(second, timeMs, first)
    if (trans === 'push') {
      layers.push({
        clip: first,
        track: 'storyline',
        opacity: a0,
        sourceTimeMs: sourceTimeMs(first, timeMs),
        blend: clipBlend(first),
        kind: clipKind(first),
        slide: -p
      })
      layers.push({
        clip: second,
        track: 'storyline',
        opacity: a1,
        sourceTimeMs: sourceTimeMs(second, timeMs),
        blend: clipBlend(second),
        kind: clipKind(second),
        slide: 1 - p
      })
    } else {
      layers.push({
        clip: first,
        track: 'storyline',
        opacity: a0 * (1 - p),
        sourceTimeMs: sourceTimeMs(first, timeMs),
        blend: clipBlend(first),
        kind: clipKind(first),
        fadeWhite: trans === 'fade_white' ? p : undefined
      })
      layers.push({
        clip: second,
        track: 'storyline',
        opacity: a1 * p,
        sourceTimeMs: sourceTimeMs(second, timeMs),
        blend: clipBlend(second),
        kind: clipKind(second),
        fadeWhite: trans === 'fade_white' ? p : undefined
      })
    }
  } else if (story.length === 1) {
    const clip = story[0]
    layers.push({
      clip,
      track: 'storyline',
      opacity: opacityAt(clip, timeMs, prevClip(timeline.storyline, clip)),
      sourceTimeMs: sourceTimeMs(clip, timeMs),
      blend: clipBlend(clip),
      kind: clipKind(clip)
    })
  }

  for (const clip of timeline.overlays) {
    if (timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs) {
      layers.push({
        clip,
        track: 'overlay',
        opacity: opacityAt(clip, timeMs),
        sourceTimeMs: sourceTimeMs(clip, timeMs),
        blend: clipBlend(clip),
        kind: clipKind(clip)
      })
    }
  }
  return layers
}

function prevClip(clips: TimelineClip[], clip: TimelineClip): TimelineClip | null {
  const i = clips.findIndex((c) => c.id === clip.id)
  return i > 0 ? clips[i - 1] : null
}

export function even(n: number): number {
  const x = Math.max(2, Math.round(n))
  return x % 2 === 0 ? x : x + 1
}
