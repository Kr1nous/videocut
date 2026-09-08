import type { ClipFx, ClipMask, MaskMode, MaskShape } from './types'

export function defaultMask(shape: MaskShape, mode: MaskMode, id: string): ClipMask {
  if (mode === 'subtract') {
    return { id, shape, mode, x: 0.32, y: 0.32, w: 0.36, h: 0.36, feather: 0.04 }
  }
  return { id, shape, mode, x: 0.16, y: 0.1, w: 0.68, h: 0.8, feather: 0.04 }
}

function shapeCoverage(mask: ClipMask): string {
  const x0 = mask.x
  const y0 = mask.y
  const x1 = mask.x + mask.w
  const y1 = mask.y + mask.h
  const cx = mask.x + mask.w / 2
  const cy = mask.y + mask.h / 2
  const feather = Math.max(0.004, mask.feather || 0)
  if (mask.shape === 'ellipse') {
    const rd = `hypot((X-${cx}*W)/max(${(mask.w / 2).toFixed(4)}*W\\,1),(Y-${cy}*H)/max(${(mask.h / 2).toFixed(4)}*H\\,1))`
    return `clip((1-(${rd}))/${feather.toFixed(4)}\\,0\\,1)`
  }
  const d = `min(min(X-${x0.toFixed(4)}*W\\,${x1.toFixed(4)}*W-X)\\,min(Y-${y0.toFixed(4)}*H\\,${y1.toFixed(4)}*H-Y))`
  return `clip((${d})/(${feather.toFixed(4)}*min(W\\,H))\\,0\\,1)`
}

export function maskCoverageExpr(masks: ClipMask[]): string {
  if (!masks.length) return '1'
  const hasAdd = masks.some((m) => m.mode === 'add')
  let expr = hasAdd ? '0' : '1'
  for (const mask of masks) {
    const s = `(${shapeCoverage(mask)})`
    if (mask.mode === 'add') expr = `if(gt(${s}\\,${expr})\\,${s}\\,${expr})`
    else expr = `(${expr})*(1-${s})`
  }
  return expr
}

export function maskFfmpeg(fx: ClipFx): string | null {
  if (!fx.masks.length) return null
  const a = `alpha(X\\,Y)*(${maskCoverageExpr(fx.masks)})`
  return `format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='${a}'`
}

export function pathMask(ctx: CanvasRenderingContext2D, mask: ClipMask, w: number, h: number): void {
  const x = mask.x * w
  const y = mask.y * h
  const mw = Math.max(1, mask.w * w)
  const mh = Math.max(1, mask.h * h)
  ctx.beginPath()
  if (mask.shape === 'ellipse') ctx.ellipse(x + mw / 2, y + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2)
  else ctx.rect(x, y, mw, mh)
}

export function applyCanvasMask(ctx: CanvasRenderingContext2D, w: number, h: number, masks: ClipMask[]): void {
  if (!masks.length) return
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const m = off.getContext('2d')
  if (!m) return
  const hasAdd = masks.some((x) => x.mode === 'add')
  if (hasAdd) m.clearRect(0, 0, w, h)
  else {
    m.fillStyle = '#fff'
    m.fillRect(0, 0, w, h)
  }
  for (const mask of masks) {
    m.save()
    m.globalCompositeOperation = mask.mode === 'subtract' ? 'destination-out' : 'source-over'
    const feather = Math.max(0, mask.feather) * Math.min(w, h)
    if (feather > 0.5) m.filter = `blur(${feather}px)`
    m.fillStyle = '#fff'
    pathMask(m, mask, w, h)
    m.fill()
    m.restore()
  }
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(off, 0, 0)
  ctx.restore()
}

export function clampScale(n: number): number {
  return Math.min(8, Math.max(0.05, n))
}

export function axisScale(fx: ClipFx): { x: number; y: number } {
  const s = clampScale(fx.scale || 1)
  return { x: clampScale(fx.scaleX ?? s), y: clampScale(fx.scaleY ?? s) }
}

/** 源画面完整放入画布、不裁切时的尺寸。 */
export function containBase(
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number
): { w: number; h: number } {
  const sw = Math.max(1, srcW)
  const sh = Math.max(1, srcH)
  const fit = Math.min(canvasW / sw, canvasH / sh)
  return { w: sw * fit, h: sh * fit }
}

export function layerBox(
  fx: ClipFx,
  canvasW: number,
  canvasH: number,
  srcW = 0,
  srcH = 0
): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy } = axisScale(fx)
  let w: number
  let h: number
  if (srcW > 0 && srcH > 0) {
    const base = containBase(canvasW, canvasH, srcW, srcH)
    w = Math.max(2, base.w * sx)
    h = Math.max(2, base.h * sy)
  } else {
    w = Math.max(2, canvasW * sx)
    h = Math.max(2, canvasH * sy)
  }
  return { x: fx.posX * canvasW - w / 2, y: fx.posY * canvasH - h / 2, w, h }
}

export function clampMask(mask: ClipMask): ClipMask {
  const w = Math.min(1, Math.max(0.04, mask.w))
  const h = Math.min(1, Math.max(0.04, mask.h))
  return {
    ...mask,
    w,
    h,
    x: Math.min(1 - w, Math.max(0, mask.x)),
    y: Math.min(1 - h, Math.max(0, mask.y)),
    feather: Math.min(0.4, Math.max(0, mask.feather))
  }
}
