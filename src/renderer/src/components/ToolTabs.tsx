import { useState, type ReactNode } from 'react'
import type { MediaAsset } from '@shared/types'

type Item = {
  label: string
  name: string
  args?: Record<string, unknown>
  needClip?: boolean
  needAsset?: boolean
}

const CATS: { id: string; label: string; items: Item[] }[] = [
  {
    id: 'edit',
    label: '剪辑',
    items: [
      { label: '去掉静音', name: 'remove_silence' },
      { label: '跳剪', name: 'jump_cut' },
      { label: '按镜头切', name: 'split_on_scenes' },
      { label: '复制', name: 'duplicate_clip', needClip: true },
      { label: '分离音频', name: 'detach_audio', needClip: true },
      { label: '替换镜头', name: 'replace_clip', needClip: true, needAsset: true },
      { label: '慢动作', name: 'slow_motion', args: { rate: 0.5 }, needClip: true },
      { label: '快放 2x', name: 'set_speed', args: { rate: 2 }, needClip: true },
      { label: '重置效果', name: 'reset_fx', needClip: true }
    ]
  },
  {
    id: 'trans',
    label: '转场',
    items: [
      { label: '硬切', name: 'set_transition', args: { type: 'none', durationMs: 0 } },
      { label: '交叉溶解', name: 'set_transition', args: { type: 'cross_dissolve', durationMs: 400 } },
      { label: '长溶解', name: 'set_transition', args: { type: 'cross_dissolve', durationMs: 900 } },
      { label: '淡出黑', name: 'fade_to_black', args: { durationMs: 800 } },
      { label: '淡入', name: 'fade_from_black', args: { durationMs: 800 } }
    ]
  },
  {
    id: 'text',
    label: '文字',
    items: [
      { label: '生成字幕', name: 'captions_from_transcript' },
      { label: '靠下', name: 'set_subtitle_style', args: { position: 'bottom' } },
      { label: '靠上', name: 'set_subtitle_style', args: { position: 'top' } },
      { label: '居中', name: 'set_subtitle_style', args: { position: 'center' } },
      { label: '大字', name: 'set_subtitle_style', args: { fontSize: 56 } },
      { label: '小字', name: 'set_subtitle_style', args: { fontSize: 32 } },
      { label: '后移 0.2s', name: 'shift_subtitles', args: { deltaMs: 200 } },
      { label: '前移 0.2s', name: 'shift_subtitles', args: { deltaMs: -200 } },
      { label: '导出 SRT', name: 'export_srt' }
    ]
  },
  {
    id: 'audio',
    label: '音频',
    items: [
      { label: '统一响度', name: 'normalize_loudness' },
      { label: '淡入淡出', name: 'fade_audio', args: { inMs: 400, outMs: 400 } },
      { label: '静音', name: 'mute_clip', needClip: true },
      { label: '音乐闪避', name: 'duck_music', args: { enabled: true } },
      { label: '人声增强', name: 'audio_preset', args: { name: 'voice_boost' } },
      { label: '铺选中音乐', name: 'set_music', needAsset: true }
    ]
  },
  {
    id: 'look',
    label: '画面',
    items: [
      { label: '16:9', name: 'set_aspect', args: { aspect: '16:9' } },
      { label: '9:16', name: 'reframe', args: { aspect: '9:16' } },
      { label: '1:1', name: 'set_aspect', args: { aspect: '1:1' } },
      { label: '旋转', name: 'rotate', args: { degrees: 90 }, needClip: true },
      { label: '翻转', name: 'flip', needClip: true },
      { label: '放大', name: 'zoom_in', needClip: true },
      { label: '自动增强', name: 'auto_enhance' },
      { label: '叠加 B-roll', name: 'overlay_broll', needAsset: true }
    ]
  },
  {
    id: 'filter',
    label: '滤镜',
    items: [
      { label: '无', name: 'apply_filter', args: { name: 'none' } },
      { label: '鲜艳', name: 'apply_filter', args: { name: 'vivid' } },
      { label: '电影', name: 'apply_filter', args: { name: 'cinema' } },
      { label: '黑白', name: 'apply_filter', args: { name: 'bw' } },
      { label: '复古', name: 'apply_filter', args: { name: 'vintage' } }
    ]
  }
]

export function ToolTabs({
  busy,
  clipId,
  assetId,
  assets,
  playheadMs,
  onRun,
  extra
}: {
  busy: boolean
  clipId: string | null
  assetId: string | null
  assets: MediaAsset[]
  playheadMs: number
  onRun: (name: string, args?: Record<string, unknown>) => void
  extra?: ReactNode
}) {
  const [tab, setTab] = useState('edit')
  const current = CATS.find((c) => c.id === tab) ?? CATS[0]

  function fire(item: Item) {
    const args = { ...(item.args ?? {}) }
    if (item.needClip && clipId) args.clipId = clipId
    if (item.name === 'overlay_broll') {
      const id = assetId ?? assets.find((a) => a.kind === 'video' || a.kind === 'image')?.id
      if (!id) return
      args.assetId = id
      args.startMs = playheadMs
    }
    if (item.name === 'set_music') {
      const id = assetId ?? assets.find((a) => a.kind === 'audio')?.id
      if (!id) return
      args.assetId = id
    }
    if (item.name === 'replace_clip') {
      if (!assetId) return
      args.assetId = assetId
      if (clipId) args.clipId = clipId
    }
    onRun(item.name, args)
  }

  return (
    <div className="ae-fxbar">
      <div className="ae-fx-cats">
        {CATS.map((c) => (
          <button key={c.id} className={'ae-fx-cat' + (c.id === tab ? ' on' : '')} onClick={() => setTab(c.id)}>
            {c.label}
          </button>
        ))}
        <span className="ae-fx-spacer" />
        {extra}
      </div>
      <div className="ae-fx-tools">
        {current.items.map((item) => (
          <button key={item.label} className="ae-fx-btn" disabled={busy} onClick={() => fire(item)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
