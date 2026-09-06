import OpenAI from 'openai'
import type { AiProvider } from '../../shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatResult {
  text: string
  toolCalls: ToolCall[]
}

export async function chatWithTools(
  provider: AiProvider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  images: { mime: string; data: string }[] = []
): Promise<ChatResult> {
  if (!provider.apiKey && provider.kind !== 'openai-compatible') {
    throw new Error(`请先在设置里填写 ${provider.name} 的 API Key`)
  }
  if (provider.kind === 'anthropic') {
    return chatAnthropic(provider, messages, tools, images)
  }
  return chatOpenAiCompatible(provider, messages, tools, images)
}

async function chatOpenAiCompatible(
  provider: AiProvider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  images: { mime: string; data: string }[]
): Promise<ChatResult> {
  const client = new OpenAI({
    apiKey: provider.apiKey || 'no-key',
    baseURL: provider.baseUrl
  })

  const oaMessages = messages.map((m, idx) => {
    if (m.role === 'user' && idx === lastUserIndex(messages) && images.length > 0) {
      return {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: m.content },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mime};base64,${img.data}` }
          }))
        ]
      }
    }
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: m.tool_call_id ?? '',
        content: m.content
      }
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.arguments }
        }))
      }
    }
    return { role: m.role, content: m.content }
  })

  const response = await client.chat.completions.create({
    model: provider.model,
    messages: oaMessages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters }
    })),
    tool_choice: 'auto'
  })

  const msg = response.choices[0]?.message
  const toolCalls: ToolCall[] =
    msg?.tool_calls?.map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: c.function.arguments
    })) ?? []

  return { text: msg?.content ?? '', toolCalls }
}

async function chatAnthropic(
  provider: AiProvider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  images: { mime: string; data: string }[]
): Promise<ChatResult> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const rest = messages.filter((m) => m.role !== 'system')
  const anthMessages = []
  for (const m of rest) {
    if (m.role === 'tool') {
      anthMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }]
      })
    } else if (m.role === 'assistant') {
      anthMessages.push({ role: 'assistant', content: m.content })
    } else {
      const content: unknown[] = [{ type: 'text', text: m.content }]
      if (m === rest[rest.length - 1] && images.length) {
        for (const img of images) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mime, data: img.data }
          })
        }
      }
      anthMessages.push({ role: 'user', content })
    }
  }

  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 4096,
      system,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      })),
      messages: anthMessages
    })
  })
  if (!res.ok) {
    throw new Error(`Anthropic 错误 ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
  }
  const toolCalls: ToolCall[] = []
  const texts: string[] = []
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) texts.push(block.text)
    if (block.type === 'tool_use' && block.name && block.id) {
      toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) })
    }
  }
  return { text: texts.join('\n'), toolCalls }
}

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}
