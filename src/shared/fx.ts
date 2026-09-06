import type { ClipFx } from './types'

export function videoFilterCss(fx: ClipFx): string {
  const f =
    fx.filter === 'vivid'
      ? 'saturate(1.35) contrast(1.08)'
      : fx.filter === 'cinema'
        ? 'contrast(1.12) saturate(0.86) brightness(0.96)'
        : fx.filter === 'bw'
          ? 'grayscale(1)'
          : fx.filter === 'vintage'
            ? 'sepia(0.4) contrast(1.05) saturate(0.82)'
            : ''
  const c = fx.color
  return [
    f,
    `brightness(${1 + c.exposure * 0.4})`,
    `contrast(${1 + c.contrast * 0.4})`,
    `saturate(${1 + c.saturation * 0.5})`,
    `hue-rotate(${c.warmth * 18}deg)`
  ]
    .filter(Boolean)
    .join(' ')
}

export function videoTransformCss(fx: ClipFx): string {
  const bits: string[] = []
  if (fx.rotate) bits.push(`rotate(${fx.rotate}deg)`)
  if (fx.flipX) bits.push('scaleX(-1)')
  if (fx.flipY) bits.push('scaleY(-1)')
  return bits.join(' ')
}
