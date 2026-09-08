import { effectCss } from './effects'
import type { ClipFx, FilterName } from './types'

export type FilterLook = {
  css: string
  ffmpeg: string[]
}

export const FILTER_LOOK: Record<FilterName, FilterLook> = {
  none: { css: '', ffmpeg: [] },
  vivid: { css: 'saturate(1.35) contrast(1.08)', ffmpeg: ['eq=saturation=1.35:contrast=1.08'] },
  cinema: {
    css: 'contrast(1.12) saturate(0.86) brightness(0.96)',
    ffmpeg: ['eq=contrast=1.12:saturation=0.86:brightness=-0.04']
  },
  bw: { css: 'grayscale(1)', ffmpeg: ['hue=s=0'] },
  vintage: {
    css: 'sepia(0.4) contrast(1.05) saturate(0.82)',
    ffmpeg: ['eq=contrast=1.05:saturation=0.82', 'colorbalance=rs=0.12:gs=0.04:bs=-0.08']
  }
}

export function colorCss(fx: ClipFx): string {
  const c = fx.color
  const bits: string[] = []
  if (Math.abs(c.exposure) > 0.001) bits.push(`brightness(${1 + c.exposure * 0.4})`)
  if (Math.abs(c.contrast) > 0.001) bits.push(`contrast(${1 + c.contrast * 0.4})`)
  if (Math.abs(c.saturation) > 0.001) bits.push(`saturate(${1 + c.saturation * 0.5})`)
  if (Math.abs(c.warmth) > 0.001) bits.push(`hue-rotate(${c.warmth * 18}deg)`)
  return bits.join(' ')
}

export function colorFfmpeg(fx: ClipFx): string[] {
  const c = fx.color
  const bits: string[] = []
  const brightness = c.exposure * 0.4
  const contrast = 1 + c.contrast * 0.4
  const saturation = 1 + c.saturation * 0.5
  if (Math.abs(brightness) > 0.001 || Math.abs(contrast - 1) > 0.001 || Math.abs(saturation - 1) > 0.001) {
    bits.push(
      `eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`
    )
  }
  if (Math.abs(c.warmth) > 0.001) bits.push(`hue=h=${(c.warmth * 18).toFixed(2)}`)
  return bits
}

export function videoFilterCss(fx: ClipFx): string {
  return [FILTER_LOOK[fx.filter]?.css, colorCss(fx), effectCss(fx)].filter(Boolean).join(' ')
}

export function videoFilterFfmpeg(fx: ClipFx): string[] {
  return [...(FILTER_LOOK[fx.filter]?.ffmpeg ?? []), ...colorFfmpeg(fx)]
}

export function videoTransformCss(fx: ClipFx): string {
  const bits: string[] = []
  if (fx.rotate) bits.push(`rotate(${fx.rotate}deg)`)
  if (fx.flipX) bits.push('scaleX(-1)')
  if (fx.flipY) bits.push('scaleY(-1)')
  if (fx.scale && fx.scale !== 1) bits.push(`scale(${fx.scale})`)
  return bits.join(' ')
}
