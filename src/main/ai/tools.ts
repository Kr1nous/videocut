import type { TimelineOp } from '../../shared/types'
import { ACTION_TOOLS, runAction } from '../actions'
import { store } from '../core'
import type { ToolSpec } from './providers'

export const EDITOR_TOOLS: ToolSpec[] = [
  {
    name: 'get_project',
    description: '读取当前项目：素材列表、故事线、独立字幕轨、时长。剪辑前必须先调用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'apply_ops',
    description:
      '对时间线执行一组剪辑操作。这会立刻改正式时间线（AI 接管，人类随后微调）。字幕必须写到独立字幕轨，不要烧进画面。',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '给人类看的一句说明，例如：去掉片头黑场并写了口播字幕' },
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'add_clip',
                  'remove_clip',
                  'trim_clip',
                  'split_clip',
                  'move_clip',
                  'reorder_storyline',
                  'set_volume',
                  'replace_storyline',
                  'add_subtitle',
                  'update_subtitle',
                  'remove_subtitle',
                  'replace_subtitles',
                  'clear_timeline',
                  'patch_clip',
                  'add_overlay',
                  'add_layer',
                  'add_audio',
                  'delete_asset'
                ]
              },
              assetId: { type: 'string' },
              clipId: { type: 'string' },
              id: { type: 'string' },
              startMs: { type: 'number' },
              inMs: { type: 'number' },
              outMs: { type: 'number' },
              atMs: { type: 'number' },
              volume: { type: 'number' },
              text: { type: 'string' },
              endMs: { type: 'number' },
              clipIds: { type: 'array', items: { type: 'string' } },
              clips: { type: 'array' },
              cues: { type: 'array' }
            },
            required: ['op']
          }
        }
      },
      required: ['ops', 'summary']
    }
  },
  {
    name: 'undo',
    description: '撤销上一次时间线改动。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
]

export async function executeTool(name: string, args: Record<string, unknown>, source: 'ai' | 'mcp') {
  switch (name) {
    case 'get_project':
      return store.compactForAi()
    case 'apply_ops': {
      const ops = (args.ops ?? []) as TimelineOp[]
      const summary = String(args.summary ?? 'AI 剪辑')
      return store.applyOps(ops, source, summary)
    }
    case 'undo':
      await store.undoLast()
      return { ok: true }
    default:
      if (ACTION_TOOLS.some((t) => t.name === name)) return runAction(name, args, source)
      throw new Error(`未知工具: ${name}`)
  }
}

export const ALL_TOOLS: ToolSpec[] = [...EDITOR_TOOLS, ...ACTION_TOOLS]
