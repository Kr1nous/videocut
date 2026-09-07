import { useState } from 'react'
import type { BlendMode, EaseKind, FilterName, MaskMode, Project, TimelineClip } from '@shared/types'
import { DEFAULT_SUBTITLE_STYLE, clipBlend, clipFx, clipKind } from '@shared/types'
import { fxAt, hasAnim } from '@shared/anim'
import { volumeAt } from '@shared/audio'
import { effectSpec } from '@shared/effects'

export function Inspector({
  project,
  clip,
  playheadMs,
  onAction,
  onDeleteClip
}: {
  project: Project
  clip: TimelineClip | null
  playheadMs: number
  onAction: (name: string, args?: Record<string, unknown>) => void
  onDeleteClip?: (clipId: string) => void
}) {
  const fx = clip ? clipFx(clip) : null
  const live = clip ? fxAt(clip, playheadMs) : null
  const kind = clip ? clipKind(clip) : 'footage'
  const [ease, setEase] = useState<EaseKind>('ease_in_out')
  return (
    <div className="inspector">
      {clip && fx ? (
        <>
          {kind === 'text' && clip.text ? (
            <>
              <button
                className="btn ghost"
                onClick={() => {
                  const next = window.prompt('文字', clip.text?.text || '')
                  if (next != null) onAction('set_text', { clipId: clip.id, text: next })
                }}
              >
                改文字
              </button>
              <label>
                字号
                <input
                  type="range"
                  min={24}
                  max={120}
                  value={clip.text.fontSize}
                  onChange={(e) => onAction('set_text', { clipId: clip.id, fontSize: Number(e.target.value) })}
                />
                <span>{clip.text.fontSize}</span>
              </label>
            </>
          ) : null}
          {kind !== 'footage' ? (
            <span className="muted">
              {kind === 'solid' ? '纯色层' : kind === 'text' ? '文字层' : kind === 'shape' ? '形状' : '调整层'}
            </span>
          ) : null}
          <label>
            混合
            <select
              value={clipBlend(clip)}
              onChange={(e) => onAction('set_blend', { clipId: clip.id, mode: e.target.value as BlendMode })}
            >
              <option value="normal">正常</option>
              <option value="add">相加</option>
              <option value="screen">滤色</option>
              <option value="multiply">正片叠底</option>
            </select>
          </label>
          <label>
            音量{hasAnim(fx, 'volume') ? ' ◆' : ''}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={hasAnim(fx, 'volume') ? volumeAt(clip, playheadMs) : clip.volume}
              onChange={(e) => {
                const value = Number(e.target.value)
                if (hasAnim(fx, 'volume')) onAction('set_keyframe', { clipId: clip.id, prop: 'volume', atMs: playheadMs, value, ease })
                else onAction('set_volume', { clipId: clip.id, volume: value })
              }}
            />
            <span>{Math.round((hasAnim(fx, 'volume') ? volumeAt(clip, playheadMs) : clip.volume) * 100)}%</span>
            <button
              className="btn ghost"
              onClick={() =>
                onAction('set_keyframe', {
                  clipId: clip.id,
                  prop: 'volume',
                  atMs: playheadMs,
                  value: hasAnim(fx, 'volume') ? volumeAt(clip, playheadMs) : clip.volume,
                  ease
                })
              }
            >
              关键帧
            </button>
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
          {fx.effects
            .filter((e) => e.enabled !== false)
            .map((e) => {
              const spec = effectSpec(e.type)
              if (!spec) return null
              return (
                <div key={e.id} className="inspector-fx">
                  <span>{spec.label}</span>
                  {spec.params.map((p) => (
                    <label key={p.key}>
                      {p.label}
                      <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={Number(e.params[p.key] ?? p.default)}
                        onChange={(ev) =>
                          onAction('add_effect', { clipId: clip.id, type: e.type, [p.key]: Number(ev.target.value) })
                        }
                      />
                      <span>{e.params[p.key] ?? p.default}</span>
                    </label>
                  ))}
                  {e.type === 'lut' ? (
                    <label>
                      LUT
                      <select
                        value={String(e.params.name || 'warm')}
                        onChange={(ev) => onAction('apply_lut', { clipId: clip.id, name: ev.target.value })}
                      >
                        <option value="warm">暖色</option>
                        <option value="cool">冷色</option>
                        <option value="contrast">对比</option>
                      </select>
                    </label>
                  ) : null}
                  <button
                    className="btn ghost"
                    onClick={() => onAction('add_effect', { clipId: clip.id, type: e.type, remove: true })}
                  >
                    去掉
                  </button>
                </div>
              )
            })}
          <label>
            透明{hasAnim(fx, 'opacity') ? ' ◆' : ''}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={live?.opacity ?? fx.opacity}
              onChange={(e) => {
                const value = Number(e.target.value)
                if (hasAnim(fx, 'opacity')) onAction('set_keyframe', { clipId: clip.id, prop: 'opacity', atMs: playheadMs, value, ease })
                else onAction('set_opacity', { clipId: clip.id, opacity: value })
              }}
            />
            <span>{Math.round((live?.opacity ?? fx.opacity) * 100)}%</span>
            <button
              className="btn ghost"
              onClick={() =>
                onAction('set_keyframe', { clipId: clip.id, prop: 'opacity', atMs: playheadMs, value: live?.opacity ?? fx.opacity, ease })
              }
            >
              关键帧
            </button>
          </label>
          <label>
            缩放{hasAnim(fx, 'scale') ? ' ◆' : ''}
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={live?.scale ?? fx.scale}
              onChange={(e) => {
                const value = Number(e.target.value)
                if (hasAnim(fx, 'scale')) onAction('set_keyframe', { clipId: clip.id, prop: 'scale', atMs: playheadMs, value, ease })
                else onAction('set_transform', { clipId: clip.id, scale: value })
              }}
            />
            <span>{(live?.scale ?? fx.scale).toFixed(2)}×</span>
            <button
              className="btn ghost"
              onClick={() =>
                onAction('set_keyframe', { clipId: clip.id, prop: 'scale', atMs: playheadMs, value: live?.scale ?? fx.scale, ease })
              }
            >
              关键帧
            </button>
          </label>
          <label>
            缓动
            <select value={ease} onChange={(e) => setEase(e.target.value as EaseKind)}>
              <option value="linear">线性</option>
              <option value="ease_in">缓入</option>
              <option value="ease_out">缓出</option>
              <option value="ease_in_out">缓入缓出</option>
            </select>
          </label>
          <button className="btn ghost" onClick={() => onAction('freeze_frame', { clipId: clip.id, atMs: playheadMs })}>
            {fx.freeze ? '取消冻结' : '冻结'}
          </button>
          <button className="btn ghost" onClick={() => onAction('reverse_clip', { clipId: clip.id })}>
            {fx.reverse ? '正放' : '倒放'}
          </button>
          {fx.audioLink ? (
            <button className="btn ghost" onClick={() => onAction('link_to_audio', { clipId: clip.id, remove: true })}>
              取消跟鼓点
            </button>
          ) : null}
          {fx.denoise?.enabled ? (
            <>
              <label>
                降噪
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fx.denoise.amount}
                  onChange={(e) =>
                    onAction('denoise_audio', { clipId: clip.id, enabled: true, amount: Number(e.target.value) })
                  }
                />
              </label>
              <button className="btn ghost" onClick={() => onAction('denoise_audio', { clipId: clip.id, enabled: false })}>
                取消降噪
              </button>
            </>
          ) : null}
          {fx.stabilize?.enabled ? (
            <>
              <label>
                稳像
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fx.stabilize.amount}
                  onChange={(e) =>
                    onAction('stabilize', { clipId: clip.id, enabled: true, amount: Number(e.target.value) })
                  }
                />
                <span>{Math.round(fx.stabilize.amount * 100)}%</span>
              </label>
              <button className="btn ghost" onClick={() => onAction('stabilize', { clipId: clip.id, enabled: false })}>
                取消稳像
              </button>
            </>
          ) : null}
          {fx.key ? (
            <>
              <label>
                抠像
                <select
                  value={fx.key.color === '#0000ff' ? 'blue' : 'green'}
                  onChange={(e) => onAction('key_color', { clipId: clip.id, color: e.target.value })}
                >
                  <option value="green">绿幕</option>
                  <option value="blue">蓝幕</option>
                </select>
              </label>
              <label>
                容差
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  value={fx.key.tolerance}
                  onChange={(e) =>
                    onAction('key_color', { clipId: clip.id, tolerance: Number(e.target.value) })
                  }
                />
                <span>{fx.key.tolerance.toFixed(2)}</span>
              </label>
              <label>
                溢色
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fx.key.spill}
                  onChange={(e) => onAction('key_color', { clipId: clip.id, spill: Number(e.target.value) })}
                />
              </label>
              <label>
                边缘
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.01}
                  value={fx.key.edge}
                  onChange={(e) => onAction('key_color', { clipId: clip.id, edge: Number(e.target.value) })}
                />
              </label>
              <button className="btn ghost" onClick={() => onAction('key_color', { clipId: clip.id, remove: true })}>
                去掉抠像
              </button>
            </>
          ) : null}
          {fx.masks.length ? (
            <>
              <label>
                蒙版
                <select
                  value={fx.masks[0].mode}
                  onChange={(e) =>
                    onAction('set_mask', { clipId: clip.id, maskId: fx.masks[0].id, mode: e.target.value as MaskMode })
                  }
                >
                  <option value="add">加</option>
                  <option value="subtract">减</option>
                </select>
              </label>
              <label>
                羽化
                <input
                  type="range"
                  min={0}
                  max={0.25}
                  step={0.01}
                  value={fx.masks[0].feather}
                  onChange={(e) =>
                    onAction('set_mask', { clipId: clip.id, maskId: fx.masks[0].id, feather: Number(e.target.value) })
                  }
                />
              </label>
              <button className="btn ghost" onClick={() => onAction('remove_mask', { clipId: clip.id })}>
                清除蒙版
              </button>
            </>
          ) : null}
          <button className="btn ghost" onClick={() => onAction('rotate', { clipId: clip.id, degrees: (fx.rotate + 90) % 360 })}>
            旋转
          </button>
          <button className="btn ghost" onClick={() => onDeleteClip?.(clip.id)}>
            删除片段
          </button>
        </>
      ) : (
        <span className="muted">选中片段后可调混合、滤镜、特效、抠像、透明、缩放、蒙版</span>
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
