import { createInterface } from 'node:readline'

/**
 * Stdio 代理：把 MCP JSON-RPC 转到正在运行的剪辑台 App。
 * 必须先打开应用，默认 http://127.0.0.1:4877/mcp
 */
const proxyUrl = process.env.CUT_STUDIO_MCP_URL ?? 'http://127.0.0.1:4877/mcp'

async function proxy(body: unknown) {
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  })
  if (res.status === 202) return null
  return res.json()
}

const rl = createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    const req = JSON.parse(trimmed)
    const result = await proxy(req)
    if (result != null) process.stdout.write(JSON.stringify(result) + '\n')
  } catch (e) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: e instanceof Error ? e.message : String(e) }
      }) + '\n'
    )
  }
})
