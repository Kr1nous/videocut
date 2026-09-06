import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { store } from './core'

interface Session {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

let session: Session | null = null
let attached: BrowserWindow | null = null

function cliBinDir(): string {
  const candidates = [
    join(app.getAppPath(), 'src/cli'),
    join(process.cwd(), 'src/cli'),
    join(__dirname, '../../src/cli')
  ]
  return candidates.find((p) => existsSync(join(p, 'cutstudio.mjs'))) ?? candidates[0]
}

function zdotDir(): string {
  const dir = join(app.getPath('userData'), 'terminal-zdot')
  mkdirSync(dir, { recursive: true })
  const bin = cliBinDir()
  writeFileSync(
    join(dir, '.zshrc'),
    `# 剪辑台内置终端
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"
export PATH="${bin}:$PATH"
export CUT_STUDIO_MCP_URL="\${CUT_STUDIO_MCP_URL:-http://127.0.0.1:4877/mcp}"
alias cs=cutstudio
echo ""
echo "剪辑台终端 · 带 CLI 的 AI 可在此接管剪辑"
echo "  cutstudio prompt   给 AI 看的完整说明（先运行）"
echo "  cutstudio help     命令列表"
echo "  grok / claude / codex 等可直接运行，用 cutstudio 改时间线"
echo ""
`,
    'utf8'
  )
  return dir
}

function shellEnv(): NodeJS.ProcessEnv {
  const bin = cliBinDir()
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    CUT_STUDIO_MCP_URL: `http://127.0.0.1:${store.settings.mcpPort || 4877}/mcp`,
    CUT_STUDIO_PROJECT: store.projectPath ?? '',
    ZDOTDIR: zdotDir(),
    LANG: process.env.LANG || 'zh_CN.UTF-8'
  }
}

function send(channel: string, payload: unknown): void {
  if (attached && !attached.isDestroyed()) attached.webContents.send(channel, payload)
}

async function spawnPty(cols: number, rows: number, cwd: string): Promise<Session> {
  try {
    const ptyMod = await import('node-pty')
    const pty = (ptyMod as { default?: typeof ptyMod }).default ?? ptyMod
    const p = pty.spawn(process.env.SHELL || '/bin/zsh', ['-il'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: shellEnv() as Record<string, string>
    })
    p.onData((data) => send('terminal:data', data))
    p.onExit(({ exitCode }) => {
      send('terminal:exit', exitCode)
      session = null
    })
    return {
      write: (data) => p.write(data),
      resize: (c, r) => p.resize(c, r),
      kill: () => p.kill()
    }
  } catch (err) {
    console.warn('node-pty 不可用，改用 script', err)
    return spawnScript(cols, rows, cwd)
  }
}

function spawnScript(_cols: number, _rows: number, cwd: string): Session {
  const child: ChildProcessWithoutNullStreams = spawn(
    '/usr/bin/script',
    ['-q', '/dev/null', process.env.SHELL || '/bin/zsh', '-il'],
    {
      cwd,
      env: shellEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  child.stdout.on('data', (buf: Buffer) => send('terminal:data', buf.toString('utf8')))
  child.stderr.on('data', (buf: Buffer) => send('terminal:data', buf.toString('utf8')))
  child.on('exit', (code) => {
    send('terminal:exit', code ?? 0)
    session = null
  })
  return {
    write: (data) => child.stdin.write(data),
    resize: () => undefined,
    kill: () => child.kill()
  }
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:start', async (e, cols: number, rows: number) => {
    attached = BrowserWindow.fromWebContents(e.sender)
    if (session) return { ok: true, reused: true }
    const cwd = store.projectPath || homedir()
    session = await spawnPty(Math.max(40, cols || 80), Math.max(10, rows || 24), cwd)
    return { ok: true, reused: false, cwd, cli: cliBinDir() }
  })

  ipcMain.on('terminal:write', (_e, data: string) => {
    session?.write(data)
  })

  ipcMain.on('terminal:resize', (_e, cols: number, rows: number) => {
    session?.resize(Math.max(20, cols), Math.max(8, rows))
  })

  ipcMain.handle('terminal:restart', async (e, cols: number, rows: number) => {
    session?.kill()
    session = null
    attached = BrowserWindow.fromWebContents(e.sender)
    const cwd = store.projectPath || homedir()
    session = await spawnPty(Math.max(40, cols || 80), Math.max(10, rows || 24), cwd)
    return { ok: true, cwd }
  })
}

export function stopTerminal(): void {
  session?.kill()
  session = null
}
