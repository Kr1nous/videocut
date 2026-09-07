import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { ClipMask, MediaAsset, ProjectSettings, SubtitleStyle, Timeline, TimelineClip } from '@shared/types'
import { fxAt } from '@shared/anim'
import { clipAtTime, clipFx, playbackPath, subtitleAtTime } from '@shared/types'
import { canvasComposite, layersAt, type CompLayer } from '@shared/compose'
import { applyEffectsCanvas, clipEffects, makeLut, type CubeLut } from '@shared/effects'
import { applyKeyCanvas } from '@shared/key'
import { applyCanvasMask, clampMask, layerBox, pathMask } from '@shared/mask'
import { clipText, visibleText } from '@shared/text'
import { volumeAt } from '@shared/audio'
import { videoFilterCss } from '@shared/fx'
import { formatTimecode, mediaUrl } from '../lib/format'

type VisualEl = HTMLVideoElement | HTMLImageElement

let layerScratch: HTMLCanvasElement | null = null
function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!layerScratch) layerScratch = document.createElement('canvas')
  if (layerScratch.width !== w || layerScratch.height !== h) {
    layerScratch.width = w
    layerScratch.height = h
  }
  const ctx = layerScratch.getContext('2d')
  ctx?.clearRect(0, 0, w, h)
  return layerScratch
}

function sourceSize(el: VisualEl): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight }
  return { w: el.naturalWidth, h: el.naturalHeight }
}

function lutFor(fx: ReturnType<typeof fxAt>): CubeLut | null {
  const e = clipEffects(fx).find((x) => x.type === 'lut')
  if (!e) return null
  const name = String(e.params.name || '')
  if (name === 'warm' || name === 'cool' || name === 'contrast' || name === 'green') return makeLut(name)
  return null
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  el: VisualEl,
  opacity: number,
  canvasW: number,
  canvasH: number,
  clip: TimelineClip,
  blend: CompLayer['blend'],
  timeMs: number,
  slide = 0
) {
  const fx = fxAt(clip, timeMs)
  const { w: sw, h: sh } = sourceSize(el)
  if (!sw || !sh) return
  let sx = 0
  let sy = 0
  let cw = sw
  let ch = sh
  if (fx.crop) {
    sx = fx.crop.x * sw
    sy = fx.crop.y * sh
    cw = Math.max(1, fx.crop.w * sw)
    ch = Math.max(1, fx.crop.h * sh)
  }
  const scale = Math.min(4, Math.max(0.05, fx.scale || 1))
  const boxW = Math.max(2, Math.round(canvasW * scale))
  const boxH = Math.max(2, Math.round(canvasH * scale))
  const buf = scratchCanvas(boxW, boxH)
  const bctx = buf.getContext('2d')
  if (!bctx) return
  bctx.filter = videoFilterCss(fx) || 'none'
  const cover = Math.max(boxW / cw, boxH / ch)
  const dw = cw * cover
  const dh = ch * cover
  bctx.drawImage(el, sx, sy, cw, ch, (boxW - dw) / 2, (boxH - dh) / 2, dw, dh)
  bctx.filter = 'none'
  applyEffectsCanvas(bctx, boxW, boxH, fx, lutFor(fx))
  const link = fx.audioLink
  if (link && (link.prop === 'glow' || link.prop === 'both')) {
    const base = Math.max(0.05, clipFx(clip).scale || 1)
    const pulse = Math.min(1, Math.max(0, fx.scale / base - 1) / Math.max(0.08, link.amount))
    if (pulse > 0.02) {
      const copy = document.createElement('canvas')
      copy.width = boxW
      copy.height = boxH
      copy.getContext('2d')?.drawImage(buf, 0, 0)
      bctx.save()
      bctx.filter = `blur(${6 + pulse * 10}px)`
      bctx.globalCompositeOperation = 'lighter'
      bctx.globalAlpha = 0.35 * pulse
      bctx.drawImage(copy, 0, 0)
      bctx.restore()
    }
  }
  applyKeyCanvas(bctx, boxW, boxH, fx)
  applyCanvasMask(bctx, boxW, boxH, fx.masks)
  ctx.save()
  ctx.globalCompositeOperation = canvasComposite(blend)
  ctx.globalAlpha = opacity
  ctx.translate(fx.posX * canvasW + slide * canvasW, fx.posY * canvasH)
  if (fx.rotate) ctx.rotate((fx.rotate * Math.PI) / 180)
  ctx.scale(fx.flipX ? -1 : 1, fx.flipY ? -1 : 1)
  ctx.drawImage(buf, -boxW / 2, -boxH / 2)
  ctx.restore()
}

function drawSolid(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  canvasW: number,
  canvasH: number,
  clip: TimelineClip,
  blend: CompLayer['blend'],
  timeMs: number
) {
  const fx = fxAt(clip, timeMs)
  const scale = Math.min(4, Math.max(0.05, fx.scale || 1))
  const boxW = Math.max(2, Math.round(canvasW * scale))
  const boxH = Math.max(2, Math.round(canvasH * scale))
  const buf = scratchCanvas(boxW, boxH)
  const bctx = buf.getContext('2d')
  if (!bctx) return
  bctx.fillStyle = clip.solidColor || '#000'
  bctx.fillRect(0, 0, boxW, boxH)
  const css = videoFilterCss(fx)
  if (css) {
    const tmp = document.createElement('canvas')
    tmp.width = boxW
    tmp.height = boxH
    tmp.getContext('2d')?.drawImage(buf, 0, 0)
    bctx.filter = css
    bctx.clearRect(0, 0, boxW, boxH)
    bctx.drawImage(tmp, 0, 0)
    bctx.filter = 'none'
  }
  applyEffectsCanvas(bctx, boxW, boxH, fx, lutFor(fx))
  applyKeyCanvas(bctx, boxW, boxH, fx)
  applyCanvasMask(bctx, boxW, boxH, fx.masks)
  ctx.save()
  ctx.globalCompositeOperation = canvasComposite(blend)
  ctx.globalAlpha = opacity
  ctx.translate(fx.posX * canvasW, fx.posY * canvasH)
  if (fx.rotate) ctx.rotate((fx.rotate * Math.PI) / 180)
  ctx.drawImage(buf, -boxW / 2, -boxH / 2)
  ctx.restore()
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  canvasW: number,
  canvasH: number,
  clip: TimelineClip,
  blend: CompLayer['blend'],
  timeMs: number
) {
  const fx = fxAt(clip, timeMs)
  const sh = clip.shape ?? { shape: 'rect' as const, fill: '#e0a93a', width: 0.42, height: 0.22 }
  const w = Math.max(2, (sh.width || 0.42) * canvasW * (fx.scale || 1))
  const h = Math.max(2, (sh.height || 0.22) * canvasH * (fx.scale || 1))
  ctx.save()
  ctx.globalCompositeOperation = canvasComposite(blend)
  ctx.globalAlpha = opacity
  ctx.translate(fx.posX * canvasW, fx.posY * canvasH)
  if (fx.rotate) ctx.rotate((fx.rotate * Math.PI) / 180)
  ctx.fillStyle = sh.fill || '#e0a93a'
  if (sh.shape === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  canvasW: number,
  canvasH: number,
  clip: TimelineClip,
  blend: CompLayer['blend'],
  timeMs: number
) {
  const fx = fxAt(clip, timeMs)
  const t = clipText(clip)
  const text = visibleText(clip, timeMs)
  if (!text) return
  const size = Math.round((t.fontSize || 72) * (canvasW / 1920) * (fx.scale || 1))
  ctx.save()
  ctx.globalCompositeOperation = canvasComposite(blend)
  ctx.globalAlpha = opacity
  ctx.font = `600 ${size}px "${t.font || 'PingFang SC'}", "Hiragino Sans GB", sans-serif`
  ctx.textAlign = t.align === 'left' ? 'left' : t.align === 'right' ? 'right' : 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, (t.strokeWidth ?? 3) * (canvasW / 1920))
  ctx.strokeStyle = t.stroke || '#000'
  ctx.fillStyle = t.color || '#fff'
  const x = fx.posX * canvasW
  const y = fx.posY * canvasH
  if ((t.strokeWidth ?? 3) > 0) ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function Viewer({
  assets,
  timeline,
  playheadMs,
  playing,
  onToggle,
  onSeek,
  subtitleStyle,
  settings,
  selectedClip = null,
  onAction
}: {
  assets: MediaAsset[]
  timeline: Timeline
  playheadMs: number
  playing: boolean
  onToggle: () => void
  onSeek: (ms: number) => void
  subtitleStyle?: SubtitleStyle
  settings: ProjectSettings
  selectedClip?: TimelineClip | null
  onAction?: (name: string, args?: Record<string, unknown>) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adjRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<null | { maskId: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: ClipMask }>(null)
  const liveRef = useRef<ClipMask[] | null>(null)
  const [liveMasks, setLiveMasks] = useState<ClipMask[] | null>(null)
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null)
  const nodesRef = useRef<Map<string, VisualEl | HTMLAudioElement>>(new Map())
  const layersRef = useRef<CompLayer[]>([])
  const width = settings.width || 1920
  const height = settings.height || 1080
  const layers = useMemo(() => layersAt(timeline, playheadMs), [timeline, playheadMs])
  layersRef.current = layers
  const cue = subtitleAtTime(timeline.subtitles, playheadMs)
  const music = clipAtTime(timeline.audio, playheadMs)
  const story = clipAtTime(timeline.storyline, playheadMs)

  const visualAssets = useMemo(() => {
    const ids = new Set<string>()
    const list: MediaAsset[] = []
    for (const layer of layers) {
      const asset = assets.find((a) => a.id === layer.clip.assetId)
      if (asset && asset.kind !== 'audio' && !ids.has(asset.id)) {
        ids.add(asset.id)
        list.push(asset)
      }
    }
    return list
  }, [layers, assets])

  const musicAsset = music ? assets.find((a) => a.id === music.assetId) : null

  function paint() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const layer of layersRef.current) {
      if (layer.kind === 'adjustment') {
        let off = adjRef.current
        if (!off || off.width !== canvas.width || off.height !== canvas.height) {
          off = document.createElement('canvas')
          off.width = canvas.width
          off.height = canvas.height
          adjRef.current = off
        }
        const octx = off.getContext('2d')
        if (!octx) continue
        octx.clearRect(0, 0, off.width, off.height)
        octx.filter = videoFilterCss(clipFx(layer.clip)) || 'none'
        octx.drawImage(canvas, 0, 0)
        octx.filter = 'none'
        applyEffectsCanvas(octx, off.width, off.height, clipFx(layer.clip), lutFor(clipFx(layer.clip)))
        ctx.save()
        ctx.globalAlpha = layer.opacity
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(off, 0, 0)
        ctx.restore()
        continue
      }
      const blend = layer.track === 'overlay' ? layer.blend : 'normal'
      const clipForDraw =
        selectedClip && layer.clip.id === selectedClip.id && liveMasks
          ? { ...layer.clip, fx: { ...layer.clip.fx, masks: liveMasks } }
          : layer.clip
      if (layer.kind === 'text') {
        drawTextLayer(ctx, layer.opacity, canvas.width, canvas.height, clipForDraw, blend, playheadMs)
        continue
      }
      if (layer.kind === 'shape') {
        drawShape(ctx, layer.opacity, canvas.width, canvas.height, clipForDraw, blend, playheadMs)
        continue
      }
      if (layer.kind === 'solid') {
        drawSolid(ctx, layer.opacity, canvas.width, canvas.height, clipForDraw, blend, playheadMs)
        continue
      }
      const el = nodesRef.current.get(layer.clip.assetId)
      if (!el || el instanceof HTMLAudioElement) continue
      drawLayer(ctx, el, layer.opacity, canvas.width, canvas.height, clipForDraw, blend, playheadMs, layer.slide ?? 0)
    }
    const fadeWhite = Math.max(0, ...layersRef.current.map((l) => l.fadeWhite ?? 0))
    if (fadeWhite > 0) {
      ctx.save()
      ctx.fillStyle = `rgba(255,255,255,${fadeWhite})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    if (cue) {
      const style = subtitleStyle
      const size = Math.round((style?.fontSize ?? 42) * (canvas.width / 1920))
      ctx.save()
      ctx.font = `600 ${size}px "PingFang SC", "Hiragino Sans GB", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(2, size / 16)
      ctx.strokeStyle = style?.stroke ?? '#000'
      ctx.fillStyle = style?.color ?? '#fff'
      const x = canvas.width / 2
      const y =
        style?.position === 'top'
          ? canvas.height * 0.1
          : style?.position === 'center'
            ? canvas.height / 2
            : canvas.height * 0.9
      ctx.strokeText(cue.text, x, y)
      ctx.fillText(cue.text, x, y)
      ctx.restore()
    }
    if (selectedClip) {
      const fx = fxAt(selectedClip, playheadMs)
      const masks = liveMasks ?? fx.masks
      if (masks.length) {
        const box = layerBox(fx, canvas.width, canvas.height)
        ctx.save()
        ctx.strokeStyle = 'rgba(255,220,80,0.95)'
        ctx.lineWidth = Math.max(2, canvas.width / 700)
        for (const mask of masks) {
          ctx.save()
          ctx.translate(box.x, box.y)
          pathMask(ctx, mask, box.w, box.h)
          ctx.stroke()
          const x = mask.x * box.w
          const y = mask.y * box.h
          const mw = mask.w * box.w
          const mh = mask.h * box.h
          const hs = Math.max(6, canvas.width / 160)
          ctx.fillStyle = mask.id === activeMaskId ? '#fff' : 'rgba(255,220,80,0.9)'
          for (const [hx, hy] of [
            [x, y],
            [x + mw, y],
            [x, y + mh],
            [x + mw, y + mh]
          ] as const) {
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
          }
          ctx.restore()
        }
        ctx.restore()
      }
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const nodes = nodesRef.current
    const keep = new Set<string>()
    for (const asset of visualAssets) {
      keep.add(asset.id)
      let el = nodes.get(asset.id)
      const url = mediaUrl(playbackPath(asset))
      if (asset.kind === 'image') {
        if (!(el instanceof HTMLImageElement)) {
          el?.remove()
          el = document.createElement('img')
          host.appendChild(el)
          nodes.set(asset.id, el)
        }
        if (el.src !== url) el.src = url
        el.onload = () => paint()
      } else {
        if (!(el instanceof HTMLVideoElement)) {
          el?.remove()
          const v = document.createElement('video')
          v.playsInline = true
          v.preload = 'auto'
          host.appendChild(v)
          el = v
          nodes.set(asset.id, el)
        }
        const v = el as HTMLVideoElement
        if (v.dataset.src !== url) {
          v.src = url
          v.dataset.src = url
        }
      }
    }
    if (musicAsset) {
      keep.add(musicAsset.id)
      let el = nodes.get(musicAsset.id)
      if (!(el instanceof HTMLAudioElement) && !(el instanceof HTMLVideoElement)) {
        el?.remove()
        el = document.createElement('audio')
        host.appendChild(el)
        nodes.set(musicAsset.id, el)
      }
      const url = mediaUrl(musicAsset.path)
      if (el && 'src' in el && (el as HTMLMediaElement).dataset.src !== url) {
        ;(el as HTMLMediaElement).src = url
        ;(el as HTMLMediaElement).dataset.src = url
      }
    }
    for (const [id, el] of nodes) {
      if (!keep.has(id)) {
        el.remove()
        nodes.delete(id)
      }
    }
  }, [visualAssets, musicAsset])

  useEffect(() => {
    for (const layer of layers) {
      const el = nodesRef.current.get(layer.clip.assetId)
      if (!(el instanceof HTMLVideoElement)) continue
      const local = Math.max(0, layer.sourceTimeMs / 1000)
      const fx = clipFx(layer.clip)
      if (fx.reverse || fx.freeze) {
        el.pause()
        if (Math.abs(el.currentTime - local) > 0.04) el.currentTime = local
      } else {
        if (Math.abs(el.currentTime - local) > 0.12) el.currentTime = local
        el.playbackRate = fx.speed || 1
        if (playing) void el.play().catch(() => undefined)
        else el.pause()
      }
      el.muted = layer.track === 'overlay'
      if (layer.track === 'storyline') el.volume = Math.min(1, Math.max(0, volumeAt(layer.clip, playheadMs)))
    }
    if (music && musicAsset) {
      const el = nodesRef.current.get(musicAsset.id)
      if (el instanceof HTMLMediaElement) {
        const fx = clipFx(music)
        const local = ((playheadMs - music.startMs) * (fx.speed || 1)) / 1000 + music.inMs / 1000
        if (Math.abs(el.currentTime - local) > 0.12) el.currentTime = Math.max(0, local)
        const duck = timeline.duck?.enabled && story ? timeline.duck.ratio : 1
        el.volume = Math.min(1, volumeAt(music, playheadMs) * duck)
        if (playing) void el.play().catch(() => undefined)
        else el.pause()
      }
    }
    paint()
  }, [layers, playheadMs, playing, music, musicAsset, story, timeline.duck, cue, subtitleStyle, width, height, selectedClip, liveMasks, activeMaskId])

  useEffect(() => {
    if (!playing) {
      paint()
      return
    }
    let id = 0
    const loop = () => {
      paint()
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [playing])

  useEffect(() => {
    setLiveMasks(null)
  }, [selectedClip?.id, selectedClip?.fx?.masks])

  function canvasPos(e: ReactMouseEvent) {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height
    }
  }

  function onMaskPointerDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!selectedClip) {
      onToggle()
      return
    }
    const fx = fxAt(selectedClip, playheadMs)
    const masks = liveMasks ?? fx.masks
    if (!masks.length) {
      onToggle()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const p = canvasPos(e)
    const box = layerBox(fx, canvas.width, canvas.height)
    const hs = Math.max(8, canvas.width / 140)
    let hit: { maskId: string; mode: 'move' | 'resize' } | null = null
    for (let i = masks.length - 1; i >= 0; i--) {
      const mask = masks[i]
      const x = box.x + mask.x * box.w
      const y = box.y + mask.y * box.h
      const mw = mask.w * box.w
      const mh = mask.h * box.h
      const corners = [
        [x, y],
        [x + mw, y],
        [x, y + mh],
        [x + mw, y + mh]
      ]
      if (corners.some(([hx, hy]) => Math.abs(p.x - hx) <= hs && Math.abs(p.y - hy) <= hs)) {
        hit = { maskId: mask.id, mode: 'resize' }
        break
      }
      if (p.x >= x && p.x <= x + mw && p.y >= y && p.y <= y + mh) {
        hit = { maskId: mask.id, mode: 'move' }
        break
      }
    }
    if (!hit) {
      onToggle()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setActiveMaskId(hit.maskId)
    const orig = masks.find((m) => m.id === hit!.maskId)!
    dragRef.current = { maskId: hit.maskId, mode: hit.mode, startX: p.x, startY: p.y, orig: { ...orig } }
    function move(ev: MouseEvent) {
      const drag = dragRef.current
      const c = canvasRef.current
      if (!drag || !c) return
      const r = c.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * c.width
      const y = ((ev.clientY - r.top) / r.height) * c.height
      const boxNow = layerBox(clipFx(selectedClip!), c.width, c.height)
      const dx = (x - drag.startX) / boxNow.w
      const dy = (y - drag.startY) / boxNow.h
      let next = { ...drag.orig }
      if (drag.mode === 'move') next = { ...next, x: drag.orig.x + dx, y: drag.orig.y + dy }
      else next = { ...next, w: drag.orig.w + dx, h: drag.orig.h + dy }
      next = clampMask(next)
      const nextMasks = masks.map((m) => (m.id === drag.maskId ? next : m))
      liveRef.current = nextMasks
      setLiveMasks(nextMasks)
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const drag = dragRef.current
      dragRef.current = null
      const edited = liveRef.current?.find((m) => m.id === drag?.maskId)
      if (drag && edited && onAction) {
        onAction('set_mask', {
          clipId: selectedClip!.id,
          maskId: drag.maskId,
          x: edited.x,
          y: edited.y,
          w: edited.w,
          h: edited.h
        })
      }
      liveRef.current = null
      setLiveMasks(null)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <section className="panel viewer">
      <div className="panel-h">
        <span>预览</span>
        <span>
          {width}×{height}
        </span>
      </div>
      <div className="viewer-stage">
        {timeline.storyline.length || timeline.overlays.length ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={selectedClip && clipFx(selectedClip).masks.length ? 'has-mask' : undefined}
            onMouseDown={onMaskPointerDown}
          />
        ) : (
          <div className="viewer-empty" onClick={onToggle}>
            导入素材或让 AI 生成时间线
          </div>
        )}
        <div ref={hostRef} className="comp-media" aria-hidden />
      </div>
      <div className="transport">
        <button className="btn ghost" onClick={() => onSeek(Math.max(0, playheadMs - 1000))}>
          −1s
        </button>
        <button className="btn primary" onClick={onToggle}>
          {playing ? '暂停' : '播放'}
        </button>
        <span className="tc">{formatTimecode(playheadMs, true)}</span>
      </div>
    </section>
  )
}
