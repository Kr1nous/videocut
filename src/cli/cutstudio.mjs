#!/usr/bin/env node
/**
 * 剪辑台 CLI：给带终端的 AI（grok / claude / codex 等）接管当前打开的工程。
 * 通过本机 MCP 改时间线，不需要再走聊天框。
 */
const MCP = process.env.CUT_STUDIO_MCP_URL || 'http://127.0.0.1:4877/mcp'

const HELP = `剪辑台 CLI — 在软件终端里运行，直接接管当前项目

用法:
  cutstudio prompt              打印给 AI 的完整说明（先跑这个）
  cutstudio status              项目是否打开、时长、片段数
  cutstudio project             当前工程 JSON（素材 + 故事线 + 字幕轨）
  cutstudio timeline            只看时间线和字幕
  cutstudio media               素材列表
  cutstudio import <文件...>    导入已录制的影片
  cutstudio add-clip --asset <id> [--in 毫秒] [--out 毫秒]
  cutstudio add-subtitle --start 毫秒 --end 毫秒 --text "字幕"
  cutstudio apply --summary "说明" --ops '<json数组>'
  cutstudio undo
  cutstudio remove-silence [--min 400] [--pad 120]
  cutstudio keep-speech
  cutstudio fit-duration --ms 60000
  cutstudio captions-from-transcript
  cutstudio set-aspect 16:9|9:16|1:1
  cutstudio set-transition cross_dissolve|fade_black|fade_white|push|none
  cutstudio fade-to-black
  cutstudio normalize-loudness
  cutstudio duck-music
  cutstudio apply-filter vivid|cinema|bw|vintage|none
  cutstudio add-effect blur|radial_blur|glow|grain|mosaic [--amount 6] [--clip id]
  cutstudio apply-lut warm|cool|contrast|green [--clip id] [--path file.cube]
  cutstudio list-effects
  cutstudio set-speed --rate 1.25 [--clip id]
  cutstudio set-opacity --value 0.5 [--clip id]
  cutstudio set-transform [--scale 1] [--x 0.5] [--y 0.5] [--clip id]
  cutstudio add-layer --asset <id> [--start 毫秒] [--blend normal|add|screen|multiply]
  cutstudio set-blend normal|add|screen|multiply [--clip id]
  cutstudio add-solid [--color #000000] [--start 毫秒] [--ms 5000]
  cutstudio add-adjustment [--start 毫秒] [--ms 5000] [--filter bw]
  cutstudio add-mask ellipse|rect [--mode add|subtract] [--clip id]
  cutstudio remove-mask [--clip id]
  cutstudio set-keyframe opacity|scale|x|y|volume --value 0.5 [--at 毫秒] [--ease linear|ease_in|ease_out|ease_in_out] [--clip id]
  cutstudio freeze-frame [--clip id]
  cutstudio reverse-clip [--clip id]
  cutstudio stabilize [--amount 0.5] [--clip id]
  cutstudio key-color green|blue [--tolerance 0.3] [--spill 0.35] [--edge 0.08] [--clip id]
  cutstudio link-to-audio [--prop scale|glow|both] [--amount 0.45] [--clip id]
  cutstudio denoise-audio [--amount 0.5] [--clip id]
  cutstudio animate-text --text "标题" [--preset fade|typewriter|lower_third]
  cutstudio add-shape rect|ellipse [--color #e0a93a]
  cutstudio export [1080p|4k|shorts|alpha|prores]
  cutstudio render-queue-add [1080p|4k|shorts|alpha|prores]
  cutstudio make-proxy [--asset id]
  cutstudio split-on-scenes
  cutstudio remove-filler
  cutstudio duplicate-clip [--clip id]
  cutstudio detach-audio [--clip id]
  cutstudio auto-enhance
  cutstudio reframe
  cutstudio add-title --text "标题" [--start 毫秒]
  cutstudio flip
  cutstudio slow-motion [--rate 0.5]
  cutstudio mcp
  cutstudio help

apply 示例:
  cutstudio apply --summary "去片头" --ops '[{"op":"trim_clip","clipId":"clip_xxx","inMs":1200,"outMs":8000}]'
`

const PROMPT = `你在「剪辑台」软件的内置终端里。你的任务是完全接管剪辑，人类只做微调。

当前工程通过命令 cutstudio 读写，改动会立刻出现在软件时间线上。

必须遵守:
1. 先 cutstudio project 看素材、故事线和独立字幕轨。
2. 用 cutstudio apply / add-clip / add-subtitle 改时间线，不要只口头描述。
3. 字幕必须走独立字幕轨（add-subtitle 或 apply 里的 add_subtitle / replace_subtitles），不要烧进画面。
4. 时间单位是毫秒。
5. 改完用一句中文说明你做了什么。

常用:
  cutstudio status
  cutstudio project
  cutstudio media
  cutstudio import /绝对路径/成片.mp4
  cutstudio add-clip --asset asset_xxx
  cutstudio add-subtitle --start 0 --end 2500 --text "开场"
  cutstudio apply --summary "重写字幕" --ops '[{"op":"replace_subtitles","cues":[...]}]'
  cutstudio undo

apply 的 op:
  add_clip, remove_clip, trim_clip, split_clip, move_clip,
  reorder_storyline, set_volume, replace_storyline,
  add_subtitle, update_subtitle, remove_subtitle, replace_subtitles,
  clear_timeline
`

async function mcp(method, params) {
  let res
  try {
    res = await fetch(MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    })
  } catch (e) {
    throw new Error(`连不上剪辑台 MCP（${MCP}）。请先打开剪辑台软件。${e instanceof Error ? e.message : e}`)
  }
  if (res.status === 202) return null
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  return json.result
}

async function tool(name, args = {}) {
  const result = await mcp('tools/call', { name, arguments: args })
  if (result?.structuredContent != null) return result.structuredContent
  const text = result?.content?.[0]?.text
  if (!text) return result
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function print(data) {
  if (typeof data === 'string') process.stdout.write(data.endsWith('\n') ? data : data + '\n')
  else process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function arg(flag) {
  const i = process.argv.indexOf(flag)
  if (i < 0) return undefined
  return process.argv[i + 1]
}

function restFiles(after) {
  const i = process.argv.indexOf(after)
  return i < 0 ? [] : process.argv.slice(i + 1)
}

const cmd = process.argv[2] || 'help'

try {
  switch (cmd) {
    case 'help':
    case '-h':
    case '--help':
      print(HELP)
      break
    case 'prompt':
      print(PROMPT)
      break
    case 'mcp':
      print({ url: MCP })
      break
    case 'status': {
      const p = await tool('get_project')
      print({
        name: p.name,
        durationMs: p.durationMs,
        assets: p.assets?.length ?? 0,
        clips: p.storyline?.length ?? 0,
        subtitles: p.subtitles?.length ?? 0,
        mcp: MCP
      })
      break
    }
    case 'project':
      print(await tool('get_project'))
      break
    case 'timeline':
      print(await tool('get_timeline'))
      break
    case 'media':
      print(await tool('list_media'))
      break
    case 'import': {
      const paths = restFiles('import')
      if (!paths.length) throw new Error('用法: cutstudio import <文件...>')
      print(await tool('import_media', { paths }))
      break
    }
    case 'add-clip': {
      const assetId = arg('--asset')
      if (!assetId) throw new Error('用法: cutstudio add-clip --asset <id> [--in 毫秒] [--out 毫秒]')
      const inMs = arg('--in')
      const outMs = arg('--out')
      const op = { op: 'add_clip', assetId }
      if (inMs) op.inMs = Number(inMs)
      if (outMs) op.outMs = Number(outMs)
      print(await tool('apply_ops', { summary: '加入故事线', ops: [op] }))
      break
    }
    case 'add-subtitle': {
      const startMs = Number(arg('--start'))
      const endMs = Number(arg('--end'))
      const text = arg('--text')
      if (!text || Number.isNaN(startMs) || Number.isNaN(endMs)) {
        throw new Error('用法: cutstudio add-subtitle --start 毫秒 --end 毫秒 --text "内容"')
      }
      print(await tool('apply_ops', { summary: `加字幕：${text}`, ops: [{ op: 'add_subtitle', startMs, endMs, text }] }))
      break
    }
    case 'apply': {
      const summary = arg('--summary') || 'CLI 剪辑'
      const raw = arg('--ops')
      if (!raw) throw new Error('用法: cutstudio apply --summary "说明" --ops \'<json数组>\'')
      const ops = JSON.parse(raw)
      print(await tool('apply_ops', { summary, ops }))
      break
    }
    case 'undo':
      print(await tool('undo'))
      break
    case 'remove-silence':
      print(await tool('remove_silence', { minMs: Number(arg('--min') || 400), padMs: Number(arg('--pad') || 120) }))
      break
    case 'keep-speech':
      print(await tool('keep_speech'))
      break
    case 'fit-duration':
      print(await tool('fit_duration', { targetMs: Number(arg('--ms') || 60000) }))
      break
    case 'captions-from-transcript':
      print(await tool('captions_from_transcript'))
      break
    case 'set-aspect':
      print(await tool('set_aspect', { aspect: process.argv[3] || '16:9' }))
      break
    case 'set-transition':
      print(await tool('set_transition', { type: process.argv[3] || 'cross_dissolve', durationMs: 400 }))
      break
    case 'fade-to-black':
      print(await tool('fade_to_black'))
      break
    case 'normalize-loudness':
      print(await tool('normalize_loudness'))
      break
    case 'duck-music':
      print(await tool('duck_music', { enabled: true }))
      break
    case 'apply-filter':
      print(await tool('apply_filter', { name: process.argv[3] || 'vivid', ...(arg('--clip') ? { clipId: arg('--clip') } : {}) }))
      break
    case 'add-effect':
      print(await tool('add_effect', {
        type: process.argv[3] || 'blur',
        ...(arg('--amount') ? { amount: Number(arg('--amount')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'apply-lut':
      print(await tool('apply_lut', {
        name: process.argv[3] || 'warm',
        ...(arg('--path') ? { path: arg('--path') } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'list-effects':
      print(await tool('list_effects'))
      break
    case 'set-speed':
      print(await tool('set_speed', { rate: Number(arg('--rate') || 1), ...(arg('--clip') ? { clipId: arg('--clip') } : {}) }))
      break
    case 'set-opacity':
      print(await tool('set_opacity', { opacity: Number(arg('--value') || 1), ...(arg('--clip') ? { clipId: arg('--clip') } : {}) }))
      break
    case 'set-transform':
      print(await tool('set_transform', {
        ...(arg('--scale') ? { scale: Number(arg('--scale')) } : {}),
        ...(arg('--x') ? { x: Number(arg('--x')) } : {}),
        ...(arg('--y') ? { y: Number(arg('--y')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'add-layer':
      print(await tool('add_layer', {
        assetId: arg('--asset'),
        startMs: Number(arg('--start') || 0),
        ...(arg('--ms') ? { durationMs: Number(arg('--ms')) } : {}),
        blend: arg('--blend') || 'normal'
      }))
      break
    case 'set-blend':
      print(await tool('set_blend', { mode: process.argv[3] || 'normal', ...(arg('--clip') ? { clipId: arg('--clip') } : {}) }))
      break
    case 'add-solid':
      print(await tool('add_solid', {
        color: arg('--color') || '#000000',
        startMs: Number(arg('--start') || 0),
        durationMs: Number(arg('--ms') || 5000)
      }))
      break
    case 'add-adjustment':
      print(await tool('add_adjustment_layer', {
        startMs: Number(arg('--start') || 0),
        ...(arg('--ms') ? { durationMs: Number(arg('--ms')) } : {}),
        ...(process.argv[3] && !process.argv[3].startsWith('--') ? { filter: process.argv[3] } : {}),
        ...(arg('--filter') ? { filter: arg('--filter') } : {})
      }))
      break
    case 'add-mask':
      print(await tool('add_mask', {
        shape: process.argv[3] || 'ellipse',
        mode: arg('--mode') || 'add',
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'remove-mask':
      print(await tool('remove_mask', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'set-keyframe':
      print(await tool('set_keyframe', {
        prop: process.argv[3] || 'opacity',
        value: Number(arg('--value') ?? 1),
        ...(arg('--at') ? { atMs: Number(arg('--at')) } : {}),
        ease: arg('--ease') || 'ease_in_out',
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'freeze-frame':
      print(await tool('freeze_frame', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'reverse-clip':
      print(await tool('reverse_clip', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'stabilize':
      print(await tool('stabilize', {
        enabled: true,
        ...(arg('--amount') ? { amount: Number(arg('--amount')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'key-color':
      print(await tool('key_color', {
        color: process.argv[3] || 'green',
        ...(arg('--tolerance') ? { tolerance: Number(arg('--tolerance')) } : {}),
        ...(arg('--spill') ? { spill: Number(arg('--spill')) } : {}),
        ...(arg('--edge') ? { edge: Number(arg('--edge')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'link-to-audio':
      print(await tool('link_to_audio', {
        prop: arg('--prop') || 'both',
        ...(arg('--amount') ? { amount: Number(arg('--amount')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'denoise-audio':
      print(await tool('denoise_audio', {
        enabled: true,
        ...(arg('--amount') ? { amount: Number(arg('--amount')) } : {}),
        ...(arg('--clip') ? { clipId: arg('--clip') } : {})
      }))
      break
    case 'animate-text':
      print(await tool('animate_text', {
        text: arg('--text') || process.argv[3] || '标题',
        preset: arg('--preset') || 'fade',
        ...(arg('--start') ? { startMs: Number(arg('--start')) } : {}),
        ...(arg('--ms') ? { durationMs: Number(arg('--ms')) } : {})
      }))
      break
    case 'add-shape':
      print(await tool('add_shape', { shape: process.argv[3] || 'rect', color: arg('--color') || '#e0a93a' }))
      break
    case 'export':
      print(await tool('export', { preset: process.argv[3] || '1080p' }))
      break
    case 'render-queue-add':
      print(await tool('render_queue_add', { preset: process.argv[3] || '1080p' }))
      break
    case 'make-proxy':
      print(await tool('make_proxy', arg('--asset') ? { assetId: arg('--asset') } : {}))
      break
    case 'split-on-scenes':
      print(await tool('split_on_scenes'))
      break
    case 'remove-filler':
      print(await tool('remove_filler'))
      break
    case 'duplicate-clip':
      print(await tool('duplicate_clip', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'detach-audio':
      print(await tool('detach_audio', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'auto-enhance':
      print(await tool('auto_enhance'))
      break
    case 'reframe':
      print(await tool('reframe', { aspect: '9:16' }))
      break
    case 'add-title':
      print(await tool('add_title', { text: arg('--text') || '标题', startMs: Number(arg('--start') || 0) }))
      break
    case 'flip':
      print(await tool('flip', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'slow-motion':
      print(await tool('slow_motion', { rate: Number(arg('--rate') || 0.5), ...(arg('--clip') ? { clipId: arg('--clip') } : {}) }))
      break
    case 'jump-cut':
      print(await tool('jump_cut'))
      break
    case 'mute':
      print(await tool('mute_clip', arg('--clip') ? { clipId: arg('--clip') } : {}))
      break
    case 'delete-media': {
      const id = process.argv[3]
      if (!id) throw new Error('用法: cutstudio delete-media <assetId>')
      print(await tool('delete_asset', { assetId: id }))
      break
    }
    default:
      throw new Error(`未知命令: ${cmd}\n运行 cutstudio help`)
  }
} catch (e) {
  process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n')
  process.exit(1)
}
