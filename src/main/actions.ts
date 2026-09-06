import { id } from '../shared/ids'
import {
  type ActionResult,
  type AspectPreset,
  type ClipFx,
  type FilterName,
  type Project,
  type ReviewAction,
  type SubtitleCue,
  type TimeRange,
  type TimelineClip,
  type TranscriptCue,
  type TransitionType,
  clipFx,
  timelineDurationMs
} from '../shared/types'
import type { ToolSpec } from './ai/providers'
import { store } from './core'

export const ACTION_TOOLS: ToolSpec[] = [
  { name: 'get_index', description: '静音段、说话段、镜头切点、转写摘要。高层剪辑前可先看。', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'search_media', description: '按文件名搜素材。', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'search_transcript', description: '按台词搜索转写。', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'set_aspect', description: '项目画幅 16:9 / 9:16 / 1:1。', parameters: { type: 'object', properties: { aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] } }, required: ['aspect'] } },
  { name: 'remove_silence', description: '去掉静音。不要自己 trim。threshold 默认 0.02，minMs 默认 400，padMs 默认 120。', parameters: { type: 'object', properties: { minMs: { type: 'number' }, padMs: { type: 'number' } } } },
  { name: 'keep_speech', description: '只保留有人说话的部分（基于静音分析）。', parameters: { type: 'object', properties: {} } },
  { name: 'fit_duration', description: '把成片压到 targetMs。先去静音，不够再加速。', parameters: { type: 'object', properties: { targetMs: { type: 'number' } }, required: ['targetMs'] } },
  { name: 'captions_from_transcript', description: '按转写或说话段生成独立字幕轨。', parameters: { type: 'object', properties: { maxChars: { type: 'number' } } } },
  { name: 'set_subtitle_style', description: '字幕样式。position: bottom|top|center。', parameters: { type: 'object', properties: { fontSize: { type: 'number' }, color: { type: 'string' }, stroke: { type: 'string' }, position: { type: 'string' } } } },
  { name: 'set_volume', description: '片段音量 0–2。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, volume: { type: 'number' } }, required: ['clipId', 'volume'] } },
  { name: 'fade_audio', description: '音频淡入淡出毫秒。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, inMs: { type: 'number' }, outMs: { type: 'number' } } } },
  { name: 'normalize_loudness', description: '统一故事线音量。', parameters: { type: 'object', properties: {} } },
  { name: 'set_music', description: '铺背景音乐到全片。', parameters: { type: 'object', properties: { assetId: { type: 'string' }, volume: { type: 'number' } }, required: ['assetId'] } },
  { name: 'duck_music', description: '口播时压低音乐。enabled 默认 true，ratio 默认 0.28。', parameters: { type: 'object', properties: { enabled: { type: 'boolean' }, ratio: { type: 'number' } } } },
  { name: 'set_transition', description: '给片段出点设转场：none | cross_dissolve | fade_black。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, type: { type: 'string' }, durationMs: { type: 'number' } }, required: ['type'] } },
  { name: 'fade_to_black', description: '片尾淡出黑。', parameters: { type: 'object', properties: { durationMs: { type: 'number' } } } },
  { name: 'fade_from_black', description: '片头淡入。', parameters: { type: 'object', properties: { durationMs: { type: 'number' } } } },
  { name: 'set_speed', description: '变速 0.25–8。会改时间线时长。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, rate: { type: 'number' }, pitchPreserve: { type: 'boolean' } }, required: ['rate'] } },
  { name: 'crop', description: '裁切，x/y/w/h 为 0–1。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } } },
  { name: 'rotate', description: '旋转 0/90/180/270。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, degrees: { type: 'number' } }, required: ['degrees'] } },
  { name: 'apply_filter', description: '滤镜 none|vivid|cinema|bw|vintage。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, name: { type: 'string' } }, required: ['name'] } },
  { name: 'color_adjust', description: '曝光/对比/饱和/色温，范围大约 -1 到 1。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, exposure: { type: 'number' }, contrast: { type: 'number' }, saturation: { type: 'number' }, warmth: { type: 'number' } } } },
  { name: 'overlay_broll', description: 'B-roll 铺到叠加轨。', parameters: { type: 'object', properties: { assetId: { type: 'string' }, startMs: { type: 'number' }, durationMs: { type: 'number' } }, required: ['assetId'] } },
  { name: 'export', description: '导出预设 1080p | 4k | shorts。', parameters: { type: 'object', properties: { preset: { type: 'string' } } } },
  { name: 'duplicate_clip', description: '复制当前或指定片段并接到后面。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'detach_audio', description: '画面静音，声音单独放到音频轨。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'split_on_scenes', description: '按镜头检测切开故事线。', parameters: { type: 'object', properties: {} } },
  { name: 'remove_filler', description: '按转写去掉嗯、那个、就是等口头禅。', parameters: { type: 'object', properties: { words: { type: 'array', items: { type: 'string' } } } } },
  { name: 'auto_enhance', description: '自动提高一点曝光、对比和饱和。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'reframe', description: '竖屏构图：改 9:16 并居中裁切。', parameters: { type: 'object', properties: { aspect: { type: 'string' } } } },
  { name: 'add_title', description: '在独立字幕轨加标题卡。', parameters: { type: 'object', properties: { text: { type: 'string' }, startMs: { type: 'number' }, durationMs: { type: 'number' } }, required: ['text'] } },
  { name: 'flip', description: '水平翻转画面。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'set_opacity', description: '透明度 0–1。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, opacity: { type: 'number' } }, required: ['opacity'] } },
  { name: 'audio_preset', description: 'voice_boost 或 music。', parameters: { type: 'object', properties: { name: { type: 'string' }, clipId: { type: 'string' } }, required: ['name'] } },
  { name: 'add_marker', description: '在时间线上打标记。', parameters: { type: 'object', properties: { atMs: { type: 'number' }, label: { type: 'string' } }, required: ['atMs'] } },
  { name: 'slow_motion', description: '慢动作，默认 0.5x。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, rate: { type: 'number' } } } },
  { name: 'mute_clip', description: '静音片段。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'replace_clip', description: '用指定素材替换片段，尽量保持时长。', parameters: { type: 'object', properties: { clipId: { type: 'string' }, assetId: { type: 'string' } }, required: ['assetId'] } },
  { name: 'keep_head_tail', description: '只留片头 headMs 和片尾 tailMs。', parameters: { type: 'object', properties: { headMs: { type: 'number' }, tailMs: { type: 'number' } } } },
  { name: 'jump_cut', description: '更狠的跳剪，短静音也切。', parameters: { type: 'object', properties: {} } },
  { name: 'reset_fx', description: '清除片段滤镜、裁切、变速。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'zoom_in', description: '轻微放大裁切。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } },
  { name: 'lower_third', description: '底部人名条/下三分之一。', parameters: { type: 'object', properties: { text: { type: 'string' }, startMs: { type: 'number' } }, required: ['text'] } },
  { name: 'shift_subtitles', description: '整轨字幕平移毫秒，可负。', parameters: { type: 'object', properties: { deltaMs: { type: 'number' } }, required: ['deltaMs'] } },
  { name: 'export_srt', description: '把字幕轨导出为 SRT 文本。', parameters: { type: 'object', properties: {} } },
  { name: 'delete_asset', description: '从媒体库删除素材，并撤掉时间线上引用它的片段。', parameters: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] } },
  { name: 'remove_clip', description: '从时间线删除片段。', parameters: { type: 'object', properties: { clipId: { type: 'string' } } } }
]

function result(tool: string, summary: string, changedIds: string[] = []): ActionResult {
  const p = store.requireProject()
  return { ok: true, tool, summary, changedIds, durationMs: timelineDurationMs(p.timeline) }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export async function ensureStoryline(source: ReviewAction['source']): Promise<void> {
  const p = store.requireProject()
  if (p.timeline.storyline.length) return
  const videos = p.assets.filter((a) => a.kind === 'video' || a.kind === 'audio')
  if (!videos.length) throw new Error('没有可剪的视频或音频，请先导入')
  const ops = videos.map((a) => ({ op: 'add_clip' as const, assetId: a.id }))
  await store.applyOps(ops, source, '把素材排上故事线')
}

export async function runAction(
  name: string,
  args: Record<string, unknown>,
  source: ReviewAction['source']
): Promise<ActionResult> {
  const p = store.requireProject()

  switch (name) {
    case 'get_index':
      return {
        ok: true,
        tool: name,
        summary: '索引',
        changedIds: [],
        durationMs: timelineDurationMs(p.timeline),
        ...({
          transcript: p.transcript.slice(0, 80),
          assets: p.assets.map((a) => ({
            id: a.id,
            name: a.name,
            silence: a.index?.silence.length ?? 0,
            speech: a.index?.speech.length ?? 0,
            scenes: a.index?.scenes.length ?? 0
          }))
        } as unknown as ActionResult)
      }
    case 'search_media': {
      const q = String(args.q ?? '').toLowerCase()
      const hits = p.assets.filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({ id: a.id, name: a.name, kind: a.kind, durationMs: a.durationMs }))
      return { ...result(name, `${hits.length} 条素材`), hits } as ActionResult
    }
    case 'search_transcript': {
      const q = String(args.q ?? '')
      const hits = p.transcript.filter((t) => t.text.includes(q))
      return { ...result(name, `${hits.length} 句`), hits } as ActionResult
    }
    case 'set_aspect': {
      store.pushUndo()
      const aspect = String(args.aspect) as AspectPreset
      p.settings.aspect = aspect
      if (aspect === '16:9') {
        p.settings.width = 1920
        p.settings.height = 1080
      } else if (aspect === '9:16') {
        p.settings.width = 1080
        p.settings.height = 1920
      } else {
        p.settings.width = 1080
        p.settings.height = 1080
      }
      store.log({ tool: name, summary: `画幅 ${aspect}`, risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, `画幅 ${aspect}`)
    }
    case 'remove_silence':
      return punchSilence(source, num(args.minMs, 400), num(args.padMs, 120))
    case 'keep_speech':
      return punchSilence(source, 400, 120)
    case 'fit_duration':
      return fitDuration(source, num(args.targetMs, 60000))
    case 'captions_from_transcript':
      return captionsFromTranscript(source, num(args.maxChars, 22))
    case 'set_subtitle_style': {
      store.pushUndo()
      if (args.fontSize != null) p.subtitleStyle.fontSize = num(args.fontSize, p.subtitleStyle.fontSize)
      if (typeof args.color === 'string') p.subtitleStyle.color = args.color
      if (typeof args.stroke === 'string') p.subtitleStyle.stroke = args.stroke
      if (args.position === 'top' || args.position === 'bottom' || args.position === 'center') {
        p.subtitleStyle.position = args.position
      }
      store.log({ tool: name, summary: '改字幕样式', risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, '已改字幕样式')
    }
    case 'set_volume':
      await store.applyOps([{ op: 'set_volume', clipId: String(args.clipId), volume: num(args.volume, 1) }], source, '调音量')
      return result(name, '已调音量', [String(args.clipId)])
    case 'fade_audio': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps(
        [{ op: 'patch_clip', clipId, fx: { fadeInMs: num(args.inMs, 400), fadeOutMs: num(args.outMs, 400) } }],
        source,
        '音频淡化'
      )
      return result(name, '已设淡入淡出', [clipId])
    }
    case 'normalize_loudness': {
      store.pushUndo()
      for (const c of p.timeline.storyline) c.volume = 1
      store.log({ tool: name, summary: '统一响度', risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, '故事线音量已统一')
    }
    case 'set_music': {
      p.timeline.audio = []
      await store.applyOps(
        [{ op: 'add_audio', assetId: String(args.assetId), volume: num(args.volume, 0.32) }],
        source,
        '铺背景音乐'
      )
      return result(name, '已铺背景音乐')
    }
    case 'duck_music': {
      store.pushUndo()
      p.timeline.duck = {
        enabled: args.enabled === undefined ? true : Boolean(args.enabled),
        ratio: num(args.ratio, 0.28)
      }
      store.log({ tool: name, summary: p.timeline.duck.enabled ? '开启音乐闪避' : '关闭音乐闪避', risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, p.timeline.duck.enabled ? '口播时压低音乐' : '已关闭闪避')
    }
    case 'set_transition': {
      const type = String(args.type || 'cross_dissolve') as TransitionType
      const durationMs = num(args.durationMs, 400)
      const clipId = args.clipId ? String(args.clipId) : undefined
      store.pushUndo()
      const clips = clipId ? p.timeline.storyline.filter((c) => c.id === clipId) : p.timeline.storyline
      for (const c of clips) c.fx = { ...c.fx, transitionOut: { type, durationMs } }
      store.log({ tool: name, summary: `转场 ${type}`, risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, `转场 ${type}`, clips.map((c) => c.id))
    }
    case 'fade_to_black': {
      const last = p.timeline.storyline.at(-1)
      if (!last) throw new Error('时间线是空的')
      await store.applyOps(
        [{ op: 'patch_clip', clipId: last.id, fx: { fadeOutMs: num(args.durationMs, 800), transitionOut: { type: 'fade_black', durationMs: num(args.durationMs, 800) } } }],
        source,
        '片尾淡出黑'
      )
      return result(name, '片尾淡出黑', [last.id])
    }
    case 'fade_from_black': {
      const first = p.timeline.storyline[0]
      if (!first) throw new Error('时间线是空的')
      await store.applyOps(
        [{ op: 'patch_clip', clipId: first.id, fx: { fadeInMs: num(args.durationMs, 800) } }],
        source,
        '片头淡入'
      )
      return result(name, '片头淡入', [first.id])
    }
    case 'set_speed': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const rate = Math.min(8, Math.max(0.25, num(args.rate, 1)))
      await store.applyOps(
        [{ op: 'patch_clip', clipId, fx: { speed: rate, pitchPreserve: args.pitchPreserve !== false } }],
        source,
        `变速 ${rate}x`
      )
      return result(name, `变速 ${rate}x`, [clipId])
    }
    case 'crop': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps(
        [
          {
            op: 'patch_clip',
            clipId,
            fx: { crop: { x: num(args.x, 0), y: num(args.y, 0), w: num(args.w, 1), h: num(args.h, 1) } }
          }
        ],
        source,
        '裁切'
      )
      return result(name, '已裁切', [clipId])
    }
    case 'rotate': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const degrees = num(args.degrees, 90) as 0 | 90 | 180 | 270
      await store.applyOps([{ op: 'patch_clip', clipId, fx: { rotate: degrees } }], source, `旋转 ${degrees}°`)
      return result(name, `旋转 ${degrees}°`, [clipId])
    }
    case 'apply_filter': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const filter = String(args.name || 'none') as FilterName
      await store.applyOps([{ op: 'patch_clip', clipId, fx: { filter } }], source, `滤镜 ${filter}`)
      return result(name, `滤镜 ${filter}`, [clipId])
    }
    case 'color_adjust': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const cur = clipFx(p.timeline.storyline.find((c) => c.id === clipId) ?? p.timeline.storyline[0] ?? emptyClip())
      await store.applyOps(
        [
          {
            op: 'patch_clip',
            clipId,
            fx: {
              color: {
                exposure: num(args.exposure, cur.color.exposure),
                contrast: num(args.contrast, cur.color.contrast),
                saturation: num(args.saturation, cur.color.saturation),
                warmth: num(args.warmth, cur.color.warmth)
              }
            }
          }
        ],
        source,
        '调色'
      )
      return result(name, '已调色', [clipId])
    }
    case 'overlay_broll': {
      await store.applyOps(
        [
          {
            op: 'add_overlay',
            assetId: String(args.assetId),
            startMs: num(args.startMs, 0),
            outMs: num(args.durationMs, 3000)
          }
        ],
        source,
        '叠加 B-roll'
      )
      return result(name, '已加 B-roll')
    }
    case 'export': {
      const { exportTimeline } = await import('./media')
      const path = await exportTimeline(String(args.preset || '1080p'))
      return result(name, '已导出 ' + path)
    }
    case 'duplicate_clip': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const clip = findAny(p, clipId)
      if (!clip) throw new Error('找不到片段')
      const copy: TimelineClip = { ...clip, id: id('clip'), fx: { ...clip.fx }, startMs: clip.startMs + clip.durationMs }
      store.pushUndo()
      const list = listOf(p, clipId)
      const idx = list.findIndex((c) => c.id === clipId)
      list.splice(idx + 1, 0, copy)
      if (list === p.timeline.storyline) {
        let t = 0
        for (const c of list) {
          c.startMs = t
          t += c.durationMs
        }
      }
      store.log({ tool: name, summary: '复制片段', risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, '已复制片段', [copy.id])
    }
    case 'detach_audio': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const clip = p.timeline.storyline.find((c) => c.id === clipId)
      if (!clip) throw new Error('请先选中视频片段')
      await store.applyOps(
        [
          { op: 'set_volume', clipId, volume: 0 },
          { op: 'add_audio', assetId: clip.assetId, startMs: clip.startMs, volume: 1 }
        ],
        source,
        '分离音频'
      )
      return result(name, '画面已静音，声音在音频轨', [clipId])
    }
    case 'split_on_scenes': {
      await ensureStoryline(source)
      const proj = store.requireProject()
      const next: TimelineClip[] = []
      for (const clip of proj.timeline.storyline) {
        const asset = proj.assets.find((a) => a.id === clip.assetId)
        const cuts = (asset?.index?.scenes ?? []).filter((t) => t > clip.inMs + 200 && t < clip.outMs - 200)
        if (!cuts.length) {
          next.push(clip)
          continue
        }
        let inMs = clip.inMs
        for (const cut of cuts) {
          next.push({ ...clip, id: id('clip'), inMs, outMs: cut, durationMs: cut - inMs, fx: { ...clip.fx } })
          inMs = cut
        }
        next.push({ ...clip, id: id('clip'), inMs, outMs: clip.outMs, durationMs: clip.outMs - inMs, fx: { ...clip.fx } })
      }
      await store.applyOps([{ op: 'replace_storyline', clips: next }], source, '按镜头切开')
      return result(name, `按镜头切成 ${next.length} 段`)
    }
    case 'remove_filler': {
      await ensureStoryline(source)
      const words = (args.words as string[] | undefined) ?? ['嗯', '那个', '就是', '然后', '啊']
      const proj = store.requireProject()
      const ranges: TimeRange[] = proj.transcript
        .filter((t) => words.some((w) => t.text.includes(w) && t.text.replace(/\s/g, '').length <= w.length + 2))
        .map((t) => ({ startMs: t.startMs, endMs: t.endMs }))
      if (!ranges.length) throw new Error('转写里没找到口头禅。请先有转写，或用「去掉静音」。')
      const mapped: TimeRange[] = []
      for (const clip of proj.timeline.storyline) {
        for (const r of ranges) {
          mapped.push({
            startMs: clip.inMs + (r.startMs - clip.startMs),
            endMs: clip.inMs + (r.endMs - clip.startMs)
          })
        }
      }
      const next: TimelineClip[] = []
      for (const clip of proj.timeline.storyline) {
        const pieces = subtractRanges(clip.inMs, clip.outMs, mapped, 40)
        if (!pieces.length) continue
        for (const [inMs, outMs] of pieces) {
          next.push({ ...clip, id: id('clip'), inMs, outMs, durationMs: outMs - inMs, fx: { ...clip.fx } })
        }
      }
      if (!next.length) throw new Error('去掉口头禅后没有剩下的画面')
      await store.applyOps([{ op: 'replace_storyline', clips: next }], source, '去掉口头禅')
      return result(name, '已去掉口头禅')
    }
    case 'auto_enhance': {
      const clipId = args.clipId ? String(args.clipId) : undefined
      const clips = clipId ? p.timeline.storyline.filter((c) => c.id === clipId) : p.timeline.storyline
      if (!clips.length) throw new Error('时间线是空的')
      store.pushUndo()
      for (const c of clips) {
        c.fx = { ...c.fx, color: { exposure: 0.08, contrast: 0.14, saturation: 0.1, warmth: 0.04 } }
      }
      store.log({ tool: name, summary: '自动增强画面', risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, '已自动增强', clips.map((c) => c.id))
    }
    case 'reframe': {
      await runAction('set_aspect', { aspect: String(args.aspect || '9:16') }, source)
      const proj = store.requireProject()
      store.pushUndo()
      for (const c of proj.timeline.storyline) {
        c.fx = { ...c.fx, crop: { x: 0.18, y: 0, w: 0.64, h: 1 } }
      }
      store.log({ tool: name, summary: '竖屏居中裁切', risk: 'medium', source })
      await store.save()
      store.broadcast()
      return result(name, '已改为竖屏构图')
    }
    case 'add_title': {
      const startMs = num(args.startMs, 0)
      const durationMs = num(args.durationMs, 2500)
      const text = String(args.text)
      await store.applyOps(
        [{ op: 'add_subtitle', startMs, endMs: startMs + durationMs, text }],
        source,
        `标题：${text.slice(0, 16)}`
      )
      await runAction('set_subtitle_style', { position: 'center', fontSize: 56 }, source)
      return result(name, '已加标题卡')
    }
    case 'flip': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const clip = findAny(p, clipId)
      const flipX = !clipFx(clip ?? emptyClip()).flipX
      await store.applyOps([{ op: 'patch_clip', clipId, fx: { flipX } }], source, '水平翻转')
      return result(name, '已翻转', [clipId])
    }
    case 'set_opacity': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps([{ op: 'patch_clip', clipId, fx: { opacity: Math.min(1, Math.max(0, num(args.opacity, 1))) } }], source, '透明度')
      return result(name, '已改透明度', [clipId])
    }
    case 'audio_preset': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const preset = String(args.name)
      const volume = preset === 'voice_boost' ? 1.2 : preset === 'music' ? 0.32 : 1
      await store.applyOps([{ op: 'set_volume', clipId, volume }], source, `音频预设 ${preset}`)
      return result(name, `音频预设 ${preset}`, [clipId])
    }
    case 'add_marker': {
      store.pushUndo()
      p.markers = p.markers ?? []
      p.markers.push({ id: id('mk'), atMs: num(args.atMs, 0), label: String(args.label || '标记') })
      store.log({ tool: name, summary: `标记：${args.label || '标记'}`, risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, '已打标记')
    }
    case 'slow_motion': {
      return runAction('set_speed', { clipId: args.clipId, rate: num(args.rate, 0.5) }, source)
    }
    case 'mute_clip': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps([{ op: 'set_volume', clipId, volume: 0 }], source, '静音')
      return result(name, '已静音', [clipId])
    }
    case 'replace_clip': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      const assetId = String(args.assetId)
      const clip = findAny(p, clipId)
      const asset = p.assets.find((a) => a.id === assetId)
      if (!clip || !asset) throw new Error('找不到片段或素材')
      const dur = Math.min(clip.outMs - clip.inMs, asset.durationMs || clip.durationMs)
      store.pushUndo()
      clip.assetId = assetId
      clip.inMs = 0
      clip.outMs = dur
      clip.durationMs = dur / Math.max(0.25, clipFx(clip).speed)
      store.log({ tool: name, summary: `替换为 ${asset.name}`, risk: 'medium', source })
      await store.save()
      store.broadcast()
      return result(name, `已替换为 ${asset.name}`, [clipId])
    }
    case 'keep_head_tail': {
      await ensureStoryline(source)
      const proj = store.requireProject()
      const headMs = num(args.headMs, 3000)
      const tailMs = num(args.tailMs, 3000)
      const total = timelineDurationMs(proj.timeline)
      if (total <= headMs + tailMs) return result(name, '成片不够长，未裁')
      const keepEnd = total - tailMs
      const next = proj.timeline.storyline
        .map((c) => {
          const s = c.startMs
          const e = c.startMs + c.durationMs
          if (e <= headMs || s >= keepEnd) return [c]
          const parts: TimelineClip[] = []
          if (s < headMs) {
            const local = headMs - s
            parts.push({ ...c, id: id('clip'), durationMs: local, outMs: c.inMs + local * clipFx(c).speed })
          }
          if (e > keepEnd) {
            const cut = Math.max(0, keepEnd - s)
            const inMs = c.inMs + cut * clipFx(c).speed
            parts.push({ ...c, id: id('clip'), inMs, durationMs: e - keepEnd })
          }
          return parts
        })
        .flat()
      await store.applyOps([{ op: 'replace_storyline', clips: next }], source, '只留片头片尾')
      return result(name, `保留片头 ${headMs / 1000}s 和片尾 ${tailMs / 1000}s`)
    }
    case 'jump_cut':
      return runAction('remove_silence', { minMs: 220, padMs: 50 }, source)
    case 'reset_fx': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps(
        [{ op: 'patch_clip', clipId, fx: { speed: 1, filter: 'none', crop: null, rotate: 0, flipX: false, opacity: 1, color: { exposure: 0, contrast: 0, saturation: 0, warmth: 0 } } }],
        source,
        '重置效果'
      )
      return result(name, '已重置效果', [clipId])
    }
    case 'zoom_in': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps([{ op: 'patch_clip', clipId, fx: { crop: { x: 0.12, y: 0.12, w: 0.76, h: 0.76 } } }], source, '放大')
      return result(name, '已放大构图', [clipId])
    }
    case 'lower_third': {
      const startMs = num(args.startMs, 0)
      await store.applyOps(
        [{ op: 'add_subtitle', startMs, endMs: startMs + 3000, text: String(args.text) }],
        source,
        '下三分之一'
      )
      await runAction('set_subtitle_style', { position: 'bottom', fontSize: 36 }, source)
      return result(name, '已加底部条')
    }
    case 'shift_subtitles': {
      const delta = num(args.deltaMs, 0)
      store.pushUndo()
      for (const c of p.timeline.subtitles) {
        c.startMs = Math.max(0, c.startMs + delta)
        c.endMs = Math.max(c.startMs + 200, c.endMs + delta)
      }
      store.log({ tool: name, summary: `字幕平移 ${delta}ms`, risk: 'low', source })
      await store.save()
      store.broadcast()
      return result(name, `字幕平移 ${delta}ms`)
    }
    case 'export_srt': {
      const lines = p.timeline.subtitles.map((c, i) => {
        const fmt = (ms: number) => {
          const h = Math.floor(ms / 3600000)
          const m = Math.floor((ms % 3600000) / 60000)
          const s = Math.floor((ms % 60000) / 1000)
          const f = ms % 1000
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`
        }
        return `${i + 1}\n${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}\n`
      })
      return { ...result(name, `${p.timeline.subtitles.length} 条字幕`), srt: lines.join('\n') } as ActionResult
    }
    case 'delete_asset':
    case 'delete': {
      if (args.assetId) {
        await store.deleteAsset(String(args.assetId))
        return result('delete_asset', '已删除素材')
      }
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps([{ op: 'remove_clip', clipId }], source, '删除片段')
      return result('remove_clip', '已删除片段', [clipId])
    }
    case 'remove_clip':
    case 'delete_clip': {
      const clipId = String(args.clipId || selectedOrFirst(p))
      await store.applyOps([{ op: 'remove_clip', clipId }], source, '删除片段')
      return result('remove_clip', '已删除片段', [clipId])
    }
    default:
      throw new Error(`未知动作: ${name}`)
  }
}

function findAny(p: Project, clipId: string): TimelineClip | undefined {
  return (
    p.timeline.storyline.find((c) => c.id === clipId) ??
    p.timeline.overlays.find((c) => c.id === clipId) ??
    p.timeline.audio.find((c) => c.id === clipId)
  )
}

function listOf(p: Project, clipId: string): TimelineClip[] {
  if (p.timeline.storyline.some((c) => c.id === clipId)) return p.timeline.storyline
  if (p.timeline.overlays.some((c) => c.id === clipId)) return p.timeline.overlays
  return p.timeline.audio
}

function emptyClip(): TimelineClip {
  return { id: '', assetId: '', startMs: 0, durationMs: 1, inMs: 0, outMs: 1, volume: 1, source: 'human' }
}

function selectedOrFirst(p: Project): string {
  const c = p.timeline.storyline[0]
  if (!c) throw new Error('时间线是空的')
  return c.id
}

async function punchSilence(source: ReviewAction['source'], minMs: number, padMs: number): Promise<ActionResult> {
  await ensureStoryline(source)
  const p = store.requireProject()
  const next: TimelineClip[] = []
  let holes = 0
  for (const clip of p.timeline.storyline) {
    const asset = p.assets.find((a) => a.id === clip.assetId)
    const silence = (asset?.index?.silence ?? []).filter((s) => s.endMs - s.startMs >= minMs)
    if (!silence.length) {
      next.push(clip)
      continue
    }
    const pieces = subtractRanges(clip.inMs, clip.outMs, silence, padMs)
    if (!pieces.length) {
      holes++
      continue
    }
    for (const [inMs, outMs] of pieces) {
      holes++
      next.push({
        ...clip,
        id: id('clip'),
        inMs,
        outMs,
        durationMs: outMs - inMs
      })
    }
  }
  if (!next.length) throw new Error('去静音后没有剩下的画面，请降低阈值或先分析素材')
  await store.applyOps([{ op: 'replace_storyline', clips: next }], source, `去掉静音（${holes} 处）`)
  return result('remove_silence', `去掉静音，现 ${next.length} 段`)
}

function subtractRanges(inMs: number, outMs: number, silence: TimeRange[], padMs: number): [number, number][] {
  const cuts = silence
    .map((s) => [Math.max(inMs, s.startMs - padMs), Math.min(outMs, s.endMs + padMs)] as [number, number])
    .filter(([a, b]) => b - a > 80)
  const kept: [number, number][] = []
  let cursor = inMs
  for (const [a, b] of cuts.sort((x, y) => x[0] - y[0])) {
    if (a > cursor + 80) kept.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (outMs > cursor + 80) kept.push([cursor, outMs])
  return kept
}

async function fitDuration(source: ReviewAction['source'], targetMs: number): Promise<ActionResult> {
  await punchSilence(source, 350, 100)
  const p = store.requireProject()
  let dur = timelineDurationMs(p.timeline)
  if (dur <= targetMs) return result('fit_duration', `已是 ${Math.round(dur / 1000)} 秒，未再压缩`)
  const rate = Math.min(1.35, dur / targetMs)
  store.pushUndo()
  for (const c of p.timeline.storyline) {
    const fx = clipFx(c)
    c.fx = { ...c.fx, speed: fx.speed * rate }
    c.durationMs = Math.max(1, (c.outMs - c.inMs) / (c.fx.speed ?? 1))
  }
  let t = 0
  for (const c of p.timeline.storyline) {
    c.startMs = t
    t += c.durationMs
  }
  store.log({ tool: 'fit_duration', summary: `压到约 ${Math.round(targetMs / 1000)} 秒`, risk: 'medium', source })
  await store.save()
  store.broadcast()
  return result('fit_duration', `目标 ${Math.round(targetMs / 1000)} 秒，现 ${Math.round(timelineDurationMs(p.timeline) / 1000)} 秒`)
}

async function captionsFromTranscript(source: ReviewAction['source'], maxChars: number): Promise<ActionResult> {
  await ensureStoryline(source)
  const p = store.requireProject()
  let lines: TranscriptCue[] = p.transcript.filter((t) => t.text.trim())
  if (!lines.length) {
    lines = speechAsTranscript(p)
  }
  if (!lines.length) throw new Error('没有转写也没有说话段。请等素材分析完，或先导入有声音的影片。')
  const cues: SubtitleCue[] = []
  for (const line of lines) {
    const chunks = wrapText(line.text || '……', maxChars)
    const span = (line.endMs - line.startMs) / chunks.length
    chunks.forEach((text, i) => {
      cues.push({
        id: id('sub'),
        startMs: line.startMs + i * span,
        endMs: line.startMs + (i + 1) * span,
        text,
        source: source === 'human' ? 'human' : 'ai'
      })
    })
  }
  await store.applyOps([{ op: 'replace_subtitles', cues }], source, `生成 ${cues.length} 条字幕`)
  return result('captions_from_transcript', `字幕轨 ${cues.length} 条`)
}

function speechAsTranscript(p: Project): TranscriptCue[] {
  const out: TranscriptCue[] = []
  let n = 1
  for (const clip of p.timeline.storyline) {
    const asset = p.assets.find((a) => a.id === clip.assetId)
    const speech = asset?.index?.speech ?? []
    if (!speech.length) {
      out.push({ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, text: `口播 ${n++}` })
      continue
    }
    for (const s of speech) {
      if (s.endMs < clip.inMs || s.startMs > clip.outMs) continue
      const localStart = Math.max(clip.inMs, s.startMs) - clip.inMs
      const localEnd = Math.min(clip.outMs, s.endMs) - clip.inMs
      if (localEnd - localStart < 120) continue
      out.push({ startMs: clip.startMs + localStart, endMs: clip.startMs + localEnd, text: `口播 ${n++}` })
    }
  }
  return out
}

function wrapText(text: string, maxChars: number): string[] {
  const t = text.trim()
  if (t.length <= maxChars) return [t]
  const parts: string[] = []
  for (let i = 0; i < t.length; i += maxChars) parts.push(t.slice(i, i + maxChars))
  return parts
}

export function clipCssFilter(fx: ClipFx): string {
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
  const bits = [
    f,
    `brightness(${1 + c.exposure * 0.4})`,
    `contrast(${1 + c.contrast * 0.4})`,
    `saturate(${1 + c.saturation * 0.5})`,
    `hue-rotate(${c.warmth * 18}deg)`
  ].filter(Boolean)
  return bits.join(' ')
}
