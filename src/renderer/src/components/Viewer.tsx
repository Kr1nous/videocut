import { useEffect, useRef } from 'react'
import type { MediaAsset, SubtitleStyle, Timeline } from '@shared/types'
import { clipAtTime, clipFx, subtitleAtTime } from '@shared/types'
import { videoFilterCss, videoTransformCss } from '@shared/fx'
import { formatTimecode, mediaUrl } from '../lib/format'

export function Viewer({
  assets,
  timeline,
  playheadMs,
  playing,
  onToggle,
  onSeek,
  subtitleStyle
}: {
  assets: MediaAsset[]
  timeline: Timeline
  playheadMs: number
  playing: boolean
  onToggle: () => void
  onSeek: (ms: number) => void
  subtitleStyle?: SubtitleStyle
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const clip = clipAtTime(timeline.storyline, playheadMs)
  const asset = clip ? assets.find((a) => a.id === clip.assetId) : null
  const cue = subtitleAtTime(timeline.subtitles, playheadMs)
  const overlay = clipAtTime(timeline.overlays, playheadMs)
  const overlayAsset = overlay ? assets.find((a) => a.id === overlay.assetId) : null
  const fx = clip ? clipFx(clip) : null
  const music = clipAtTime(timeline.audio, playheadMs)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !clip || !asset || !fx) return
    const wanted = mediaUrl(asset.path)
    if (v.dataset.clip !== clip.id) {
      v.src = wanted
      v.dataset.clip = clip.id
    }
    const speed = fx.speed || 1
    const local = ((playheadMs - clip.startMs) * speed) / 1000 + clip.inMs / 1000
    if (Math.abs(v.currentTime - local) > 0.12) v.currentTime = Math.max(0, local)
    v.playbackRate = speed
    const duck = timeline.duck?.enabled && music ? timeline.duck.ratio : 1
    v.volume = Math.min(1, clip.volume * (music ? 1 : 1))
    void duck
    if (playing) void v.play().catch(() => undefined)
    else v.pause()
  }, [clip, asset, playheadMs, playing, fx, music, timeline.duck])

  return (
    <section className="panel viewer">
      <div className="panel-h">
        <span>预览</span>
        <span>{clip ? asset?.name : '成片'}</span>
      </div>
      <div className="viewer-stage" onClick={onToggle}>
        {asset && fx ? (
          <video
            ref={videoRef}
            style={{
              filter: videoFilterCss(fx),
              transform: videoTransformCss(fx),
              opacity: fx.opacity
            }}
          />
        ) : (
          <div className="viewer-empty">导入素材或让 AI 生成时间线</div>
        )}
        {overlayAsset ? (
          <video
            className="overlay-pip"
            src={mediaUrl(overlayAsset.path)}
            muted
            style={{ opacity: overlay ? clipFx(overlay).opacity : 1 }}
          />
        ) : null}
        {cue ? (
          <div
            className={'subtitle-overlay pos-' + (subtitleStyle?.position ?? 'bottom')}
            style={{
              fontSize: subtitleStyle?.fontSize ?? 42,
              color: subtitleStyle?.color ?? '#fff',
              WebkitTextStroke: `0.6px ${subtitleStyle?.stroke ?? '#000'}`
            }}
          >
            {cue.text}
          </div>
        ) : null}
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
