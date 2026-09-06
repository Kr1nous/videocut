import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { MediaAsset, SubtitleCue, Timeline, TimelineClip, TimelineOp } from '@shared/types'
import { clipFx, timelineDurationMs } from '@shared/types'
import { formatTimecode } from '../lib/format'

const PPS = 64
const HEIGHT_KEY = 'cut-studio-track-heights'
const PANEL_KEY = 'cut-studio-timeline-height'

type TrackKey = 'video' | 'overlay' | 'audio' | 'sub'

function loadHeights(): Record<TrackKey, number> {
  try {
    return { video: 88, overlay: 28, audio: 40, sub: 40, ...JSON.parse(localStorage.getItem(HEIGHT_KEY) || '{}') }
  } catch {
    return { video: 88, overlay: 28, audio: 40, sub: 40 }
  }
}

export function TimelineView({
  assets,
  timeline,
  playheadMs,
  selectedClipId,
  selectedCueId,
  onSeek,
  onSelectClip,
  onSelectCue,
  onOps,
  onDeleteClip
}: {
  assets: MediaAsset[]
  timeline: Timeline
  playheadMs: number
  selectedClipId: string | null
  selectedCueId: string | null
  onSeek: (ms: number) => void
  onSelectClip: (id: string | null) => void
  onSelectCue: (id: string | null) => void
  onOps: (ops: TimelineOp[], summary?: string) => void
  onDeleteClip?: (clipId: string) => void
}) {
  const duration = Math.max(10_000, timelineDurationMs(timeline) + 4000)
  const width = Math.max(800, (duration / 1000) * PPS)
  const laneRef = useRef<HTMLDivElement>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const [heights, setHeights] = useState(loadHeights)
  const [panelH, setPanelH] = useState(() => {
    const n = Number(localStorage.getItem(PANEL_KEY) || 300)
    return Number.isFinite(n) ? Math.max(180, n) : 300
  })

  function dragHeight(key: TrackKey, startY: number, startH: number) {
    function move(ev: MouseEvent) {
      const next = Math.max(36, Math.min(240, startH + ev.clientY - startY))
      setHeights((s) => {
        const n = { ...s, [key]: next }
        localStorage.setItem(HEIGHT_KEY, JSON.stringify(n))
        return n
      })
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function dragPanel(startY: number, startH: number) {
    function move(ev: MouseEvent) {
      const next = Math.max(180, Math.min(window.innerHeight * 0.7, startH + startY - ev.clientY))
      setPanelH(next)
      localStorage.setItem(PANEL_KEY, String(next))
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const ticks = useMemo(() => {
    const out: number[] = []
    for (let t = 0; t <= duration; t += 2000) out.push(t)
    return out
  }, [duration])

  function msFromEvent(e: ReactMouseEvent) {
    const lane = laneRef.current
    if (!lane) return 0
    const x = e.clientX - lane.getBoundingClientRect().left + lane.parentElement!.scrollLeft - 76
    return Math.max(0, (x / PPS) * 1000)
  }

  return (
    <div className="timeline-wrap" style={{ height: panelH }}>
      <div
        className="tl-grip"
        title="拖动改变时间线高度"
        onMouseDown={(e) => {
          e.preventDefault()
          dragPanel(e.clientY, panelH)
        }}
      />
      <div className="ruler" style={{ width: width + 76 }} onMouseDown={(e) => onSeek(msFromEvent(e))}>
        {ticks.map((t) => (
          <span key={t} style={{ left: 76 + (t / 1000) * PPS }}>
            {formatTimecode(t)}
          </span>
        ))}
      </div>
      <div className="tracks" onMouseMove={(e) => setHoverMs(msFromEvent(e))}>
        <div className="playhead" style={{ left: 76 + (playheadMs / 1000) * PPS }} />
        <div className="video-group" style={{ height: heights.video + heights.overlay }}>
          <div className="track-label video-group-label">
            视频
            <span
              className="track-resize"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dragHeight('video', e.clientY, heights.video)
              }}
            />
          </div>
          <div className="video-lanes">
            <div
              className="lane"
              ref={laneRef}
              style={{ width, height: heights.video }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  onSelectClip(null)
                  onSeek(msFromEvent(e))
                }
              }}
            >
              {timeline.storyline.map((clip) => (
                <ClipBlock
                  key={clip.id}
                  clip={clip}
                  name={assets.find((a) => a.id === clip.assetId)?.name ?? '片段'}
                  selected={selectedClipId === clip.id}
                  onSelect={() => {
                    onSelectClip(clip.id)
                    onSelectCue(null)
                  }}
                  onSeek={onSeek}
                  onTrim={(inMs, outMs) => onOps([{ op: 'trim_clip', clipId: clip.id, inMs, outMs }], '修剪片段')}
                  onDelete={() => onDeleteClip?.(clip.id)}
                />
              ))}
            </div>
            <div className="lane fx-lane" style={{ width, height: heights.overlay }}>
              {timeline.storyline.map((clip) => {
                const tags = fxTags(clip)
                if (!tags.length) return null
                return (
                  <div
                    key={'fx-' + clip.id}
                    className="fx-bar"
                    style={{
                      left: (clip.startMs / 1000) * PPS,
                      width: Math.max(8, (clip.durationMs / 1000) * PPS)
                    }}
                    title={tags.join(' · ')}
                  >
                    {tags.join(' · ')}
                  </div>
                )
              })}
              {timeline.overlays.map((clip) => (
                <ClipBlock
                  key={clip.id}
                  clip={clip}
                  name={assets.find((a) => a.id === clip.assetId)?.name ?? '效果'}
                  selected={selectedClipId === clip.id}
                  onSelect={() => {
                    onSelectClip(clip.id)
                    onSelectCue(null)
                  }}
                  onSeek={onSeek}
                  onTrim={(inMs, outMs) => onOps([{ op: 'trim_clip', clipId: clip.id, inMs, outMs }], '修剪效果')}
                  onDelete={() => onDeleteClip?.(clip.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="track sub narrow" style={{ height: heights.audio }}>
          <div className="track-label">
            音频
            <span
              className="track-resize"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dragHeight('audio', e.clientY, heights.audio)
              }}
            />
          </div>
          <div className="lane" style={{ width }}>
            {timeline.audio.map((clip) => (
              <ClipBlock
                key={clip.id}
                clip={clip}
                name={assets.find((a) => a.id === clip.assetId)?.name ?? '音乐'}
                selected={selectedClipId === clip.id}
                onSelect={() => {
                  onSelectClip(clip.id)
                  onSelectCue(null)
                }}
                onSeek={onSeek}
                onTrim={(inMs, outMs) => onOps([{ op: 'trim_clip', clipId: clip.id, inMs, outMs }], '修剪音频')}
                onDelete={() => onDeleteClip?.(clip.id)}
              />
            ))}
          </div>
        </div>
        <div className="track sub narrow" style={{ height: heights.sub }}>
          <div className="track-label">
            字幕
            <span
              className="track-resize"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dragHeight('sub', e.clientY, heights.sub)
              }}
            />
          </div>
          <div
            className="lane"
            style={{ width }}
            onDoubleClick={(e) => {
              const start = msFromEvent(e)
              const text = window.prompt('字幕内容', '')
              if (!text) return
              onOps([{ op: 'add_subtitle', startMs: start, endMs: start + 2000, text }], '手写字幕')
            }}
          >
            {timeline.subtitles.map((cue) => (
              <CueBlock
                key={cue.id}
                cue={cue}
                selected={selectedCueId === cue.id}
                onSelect={() => {
                  onSelectCue(cue.id)
                  onSelectClip(null)
                }}
                onEdit={(text) => onOps([{ op: 'update_subtitle', id: cue.id, text }], '改字幕')}
                onRemove={() => onOps([{ op: 'remove_subtitle', id: cue.id }], '删字幕')}
              />
            ))}
          </div>
        </div>
        {hoverMs != null ? (
          <div className="playhead" style={{ left: 76 + (hoverMs / 1000) * PPS, opacity: 0.25 }} />
        ) : null}
      </div>
    </div>
  )
}

function ClipBlock({
  clip,
  name,
  selected,
  onSelect,
  onSeek,
  onTrim,
  onDelete
}: {
  clip: TimelineClip
  name: string
  selected: boolean
  onSelect: () => void
  onSeek: (ms: number) => void
  onTrim: (inMs: number, outMs: number) => void
  onDelete?: () => void
}) {
  const left = (clip.startMs / 1000) * PPS
  const width = Math.max(8, (clip.durationMs / 1000) * PPS)
  return (
    <div
      className={'clip' + (clip.source !== 'human' ? ' ai' : '') + (selected ? ' selected' : '')}
      style={{ left, width }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect()
        onSeek(clip.startMs)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect()
        onDelete?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault()
          e.stopPropagation()
          onDelete?.()
        }
      }}
    >
      <span className="handle l" onMouseDown={(e) => startTrim(e, clip, 'l', onTrim)} />
      <span className="clip-name">{name}</span>
      {selected ? (
        <button
          type="button"
          className="clip-del"
          title="删除"
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.()
          }}
        >
          ×
        </button>
      ) : null}
      <span className="handle r" onMouseDown={(e) => startTrim(e, clip, 'r', onTrim)} />
    </div>
  )
}

function fxTags(clip: TimelineClip): string[] {
  const fx = clipFx(clip)
  const tags: string[] = []
  if (fx.filter === 'vivid') tags.push('鲜艳')
  if (fx.filter === 'cinema') tags.push('电影')
  if (fx.filter === 'bw') tags.push('黑白')
  if (fx.filter === 'vintage') tags.push('复古')
  if (Math.abs(fx.speed - 1) > 0.01) tags.push(`${fx.speed.toFixed(2)}x`)
  if (fx.transitionOut.type === 'cross_dissolve') tags.push('溶解')
  if (fx.transitionOut.type === 'fade_black') tags.push('淡出黑')
  if (fx.rotate) tags.push(`${fx.rotate}°`)
  if (fx.flipX) tags.push('翻转')
  if (fx.crop) tags.push('裁切')
  if (fx.fadeInMs || fx.fadeOutMs) tags.push('淡化')
  const c = fx.color
  if (c.exposure || c.contrast || c.saturation || c.warmth) tags.push('调色')
  return tags
}

function CueBlock({
  cue,
  selected,
  onSelect,
  onEdit,
  onRemove
}: {
  cue: SubtitleCue
  selected: boolean
  onSelect: () => void
  onEdit: (text: string) => void
  onRemove: () => void
}) {
  const left = (cue.startMs / 1000) * PPS
  const width = Math.max(8, ((cue.endMs - cue.startMs) / 1000) * PPS)
  return (
    <div
      className={'cue' + (selected ? ' selected' : '')}
      style={{ left, width }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        const next = window.prompt('编辑字幕', cue.text)
        if (next == null) return
        if (!next.trim()) onRemove()
        else onEdit(next)
      }}
    >
      {cue.text}
    </div>
  )
}

function startTrim(
  e: ReactMouseEvent,
  clip: TimelineClip,
  edge: 'l' | 'r',
  onTrim: (inMs: number, outMs: number) => void
) {
  e.stopPropagation()
  e.preventDefault()
  const startX = e.clientX
  const origIn = clip.inMs
  const origOut = clip.outMs
  let lastIn = origIn
  let lastOut = origOut
  function move(ev: MouseEvent) {
    const deltaMs = ((ev.clientX - startX) / PPS) * 1000
    if (edge === 'l') {
      lastIn = Math.max(0, origIn + deltaMs)
      lastOut = origOut
    } else {
      lastIn = origIn
      lastOut = Math.max(origIn + 200, origOut + deltaMs)
    }
  }
  function up() {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (lastIn !== origIn || lastOut !== origOut) onTrim(lastIn, lastOut)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
