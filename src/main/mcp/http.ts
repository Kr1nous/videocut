import http from 'node:http'
import { handleMcp, mcpConfigSnippet } from './protocol'

let server: http.Server | null = null
let port = 4877

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function cors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Session-Id')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
}

export function startMcpHttp(listenPort: number): Promise<{ port: number; url: string }> {
  port = listenPort
  return new Promise((resolve, reject) => {
    if (server) {
      resolve({ port, url: `http://127.0.0.1:${port}/mcp` })
      return
    }
    server = http.createServer(async (req, res) => {
      cors(res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      try {
        if (url.pathname === '/health') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, app: '剪辑台' }))
          return
        }
        if (url.pathname === '/mcp.json' && req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(mcpConfigSnippet(port), null, 2))
          return
        }
        if (url.pathname === '/mcp' && req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          res.write('event: endpoint\ndata: /mcp\n\n')
          return
        }
        if (url.pathname === '/mcp' && req.method === 'POST') {
          const raw = await readBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const result = await handleMcp(body)
          if (result == null) {
            res.writeHead(202)
            res.end()
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
          return
        }
        res.writeHead(404)
        res.end('not found')
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
      }
    })
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({ port, url: `http://127.0.0.1:${port}/mcp` })
    })
  })
}

export function mcpStatus() {
  return {
    running: Boolean(server?.listening),
    port,
    url: `http://127.0.0.1:${port}/mcp`
  }
}
