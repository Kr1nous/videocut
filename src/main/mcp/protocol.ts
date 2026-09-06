import { store } from '../core'
import { ALL_TOOLS, executeTool } from '../ai/tools'
import { timelineDurationMs } from '../../shared/types'

interface JsonRpcReq {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

function ok(id: JsonRpcReq['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result }
}

function err(id: JsonRpcReq['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

const SERVER_INFO = { name: 'cut-studio', title: '剪辑台', version: '0.1.0' }

function toolList() {
  return {
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters
    })).concat([
      {
        name: 'list_media',
        description: '列出项目里已导入的素材。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      },
      {
        name: 'get_timeline',
        description: '只读取故事线和独立字幕轨。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      },
      {
        name: 'import_media',
        description: '把本机已录制的影片/音频/图片导入当前项目。paths 为绝对路径。',
        inputSchema: {
          type: 'object',
          properties: { paths: { type: 'array', items: { type: 'string' } } },
          required: ['paths']
        }
      }
    ])
  }
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === 'list_media') {
    const project = store.requireProject()
    return project.assets
  }
  if (name === 'get_timeline') {
    const project = store.requireProject()
    return { timeline: project.timeline, durationMs: timelineDurationMs(project.timeline) }
  }
  if (name === 'import_media') {
    const paths = (args.paths as string[]) ?? []
    return store.importFiles(paths)
  }
  return executeTool(name, args, 'mcp')
}

export async function handleMcp(body: JsonRpcReq): Promise<unknown> {
  const { id, method, params } = body
  try {
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: true }, resources: {} },
          serverInfo: SERVER_INFO
        })
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null
      case 'ping':
        return ok(id, {})
      case 'tools/list':
        return ok(id, toolList())
      case 'tools/call': {
        const name = String(params?.name ?? '')
        const args = (params?.arguments as Record<string, unknown>) ?? {}
        const result = await callTool(name, args)
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        })
      }
      case 'resources/list':
        return ok(id, {
          resources: store.project
            ? [
                {
                  uri: 'cut://project',
                  name: store.project.name,
                  mimeType: 'application/json',
                  description: '当前剪辑工程（含独立字幕轨）'
                }
              ]
            : []
        })
      case 'resources/read': {
        const uri = String(params?.uri ?? '')
        if (uri !== 'cut://project') throw new Error('未知资源')
        return ok(id, {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(store.compactForAi(), null, 2)
            }
          ]
        })
      }
      case 'prompts/list':
        return ok(id, {
          prompts: [
            {
              name: 'cut_to_duration',
              description: '把已录制影片剪到指定秒数并写字幕',
              arguments: [{ name: 'seconds', description: '目标秒数', required: true }]
            }
          ]
        })
      default:
        if (method?.startsWith('notifications/')) return null
        return err(id, -32601, `Method not found: ${method}`)
    }
  } catch (e) {
    return err(id, -32000, e instanceof Error ? e.message : String(e))
  }
}

export function mcpConfigSnippet(port: number) {
  return {
    mcpServers: {
      'cut-studio': {
        url: `http://127.0.0.1:${port}/mcp`
      }
    }
  }
}
