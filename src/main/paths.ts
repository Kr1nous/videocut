import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function userDataDir(): string {
  if (process.env.CUT_STUDIO_USER_DATA) return process.env.CUT_STUDIO_USER_DATA
  return join(homedir(), 'Library', 'Application Support', '剪辑台')
}

export function defaultProjectDir(): string {
  for (const dir of [join(homedir(), 'Movies'), join(homedir(), 'Documents'), join(homedir(), 'Desktop'), homedir()]) {
    if (existsSync(dir)) return dir
  }
  return homedir()
}

export function appRoot(): string {
  const candidates = [
    process.env.CUT_STUDIO_ROOT,
    process.cwd(),
    join(here, '../..'),
    join(here, '../../..')
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(join(p, 'src/cli/cutstudio.mjs')) || existsSync(join(p, 'cli/cutstudio.mjs'))) ?? process.cwd()
}

export function cliBinDir(): string {
  const candidates = [
    process.env.CUT_STUDIO_CLI,
    join(appRoot(), 'src/cli'),
    join(appRoot(), 'cli'),
    join(here, '../../src/cli'),
    join(process.cwd(), 'src/cli')
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(join(p, 'cutstudio.mjs'))) ?? candidates[0]!
}

export function extraBinPath(): string {
  return [
    join(homedir(), 'homebrew/bin'),
    '/opt/homebrew/bin',
    '/opt/local/bin',
    '/usr/local/bin'
  ].join(':')
}

export const API_PORT = Number(process.env.CUT_STUDIO_API_PORT || 4878)
export const MCP_PORT_DEFAULT = 4877
