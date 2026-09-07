import { readFile } from 'node:fs/promises'
import { store } from '../core'
import { chatWithTools, type ChatMessage } from './providers'
import { ALL_TOOLS, executeTool } from './tools'

const SYSTEM = `你是「剪辑台」的剪辑导演。软件用于剪已经录制好的成片素材。

工作原则：
- 你完全接管剪辑，人类只做微调。不要问「要不要我剪」，直接调用工具。
- 优先用高层工具省 token：remove_silence、keep_speech、fit_duration、captions_from_transcript、remove_filler、split_on_scenes、normalize_loudness、set_transition、reframe、auto_enhance、add_title、animate_text、add_effect、apply_lut、stabilize、key_color、link_to_audio、denoise_audio、export、render_queue_add、make_proxy。不要自己用 trim_clip 去静音。标题用 animate_text（fade/typewriter/lower_third），不要写进字幕轨。模糊/发光/颗粒/马赛克用 add_effect，LUT 用 apply_lut（warm|cool|contrast）。手抖用 stabilize，绿/蓝幕用 key_color。画面跟鼓点用 link_to_audio，音量动画用 set_keyframe prop=volume。成片用 export 或 render_queue_add（1080p/alpha/prores）；预览卡顿用 make_proxy。
- 字幕必须走独立字幕轨（captions_from_transcript / add_subtitle），不要烧进画面。
- 时间单位毫秒。apply_ops 只作兜底。
- 改完用一句中文说明，方便人类审查。
- 没有素材时让用户导入，不要虚构 assetId。`

export async function runAgent(userPrompt: string, frames: { mime: string; data: string }[] = []) {
  const provider = store.activeProvider()
  if (!provider) throw new Error('没有可用的 AI 提供方')
  if (!provider.apiKey && !provider.baseUrl.includes('11434')) {
    throw new Error(`请先在设置中填写 ${provider.name} 的 API Key`)
  }
  store.requireProject()

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `当前项目摘要：\n${JSON.stringify(store.compactForAi(), null, 2)}\n\n用户指令：\n${userPrompt}`
    }
  ]

  const images = store.settings.allowMediaUpload ? frames.slice(0, 8) : []
  let lastText = ''

  for (let step = 0; step < 8; step++) {
    const result = await chatWithTools(provider, messages, ALL_TOOLS, step === 0 ? images : [])
    lastText = result.text
    if (!result.toolCalls.length) break
    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.toolCalls
    })
    for (const call of result.toolCalls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(call.arguments || '{}')
      } catch {
        parsed = {}
      }
      let toolResult: unknown
      try {
        toolResult = await executeTool(call.name, parsed, 'ai')
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : String(err) }
      }
      messages.push({
        role: 'tool',
        name: call.name,
        tool_call_id: call.id,
        content: JSON.stringify(toolResult)
      })
    }
  }

  return {
    text: lastText || '已完成剪辑，请在时间线和右侧审查记录里查看。',
    provider: provider.name,
    model: provider.model
  }
}

export async function loadFrameBase64(filePath: string): Promise<{ mime: string; data: string } | null> {
  try {
    const buf = await readFile(filePath)
    const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    return { mime, data: buf.toString('base64') }
  } catch {
    return null
  }
}
