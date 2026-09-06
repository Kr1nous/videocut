import type { FilterName, Project, TimelineClip } from '@shared/types'
import { DEFAULT_SUBTITLE_STYLE, clipFx } from '@shared/types'

export function Inspector({
  project,
  clip,
  onAction,
  onDeleteClip
}: {
  project: Project
  clip: TimelineClip | null
  onAction: (name: string, args?: Record<string, unknown>) => void
  onDeleteClip?: (clipId: string) => void
}) {
  const fx = clip ? clipFx(clip) : null
  return (
    <div className="inspector">
      {clip && fx ? (
        <>
          <label>
            音量
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.volume}
              onChange={(e) => onAction('set_volume', { clipId: clip.id, volume: Number(e.target.value) })}
            />
          </label>
          <label>
            速度
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={fx.speed}
              onChange={(e) => onAction('set_speed', { clipId: clip.id, rate: Number(e.target.value) })}
            />
            <span>{fx.speed.toFixed(2)}x</span>
          </label>
          <label>
            滤镜
            <select
              value={fx.filter}
              onChange={(e) => onAction('apply_filter', { clipId: clip.id, name: e.target.value as FilterName })}
            >
              <option value="none">无</option>
              <option value="vivid">鲜艳</option>
              <option value="cinema">电影</option>
              <option value="bw">黑白</option>
              <option value="vintage">复古</option>
            </select>
          </label>
          <button className="btn ghost" onClick={() => onAction('rotate', { clipId: clip.id, degrees: (fx.rotate + 90) % 360 })}>
            旋转
          </button>
          <button className="btn ghost" onClick={() => onDeleteClip?.(clip.id)}>
            删除片段
          </button>
        </>
      ) : (
        <span className="muted">选中片段后可调音量、速度、滤镜</span>
      )}
      <label>
        字幕字号
        <input
          type="range"
          min={24}
          max={72}
          value={(project.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE).fontSize}
          onChange={(e) => onAction('set_subtitle_style', { fontSize: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
