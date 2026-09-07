import { spawn } from 'node:child_process'

export function runFfmpeg(cmd: string, args: string[]): Promise<{ code: number; stderr: string; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => stdout.push(d))
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stderr, stdout: Buffer.concat(stdout) }))
  })
}

export async function findFfmpeg(): Promise<string | null> {
  const home = process.env.HOME || ''
  const candidates = [
    'ffmpeg',
    `${home}/homebrew/bin/ffmpeg`,
    '/opt/homebrew/bin/ffmpeg',
    '/opt/local/bin/ffmpeg',
    '/usr/local/bin/ffmpeg'
  ]
  for (const c of candidates) {
    try {
      const r = await runFfmpeg(c, ['-version'])
      if (r.code === 0) return c
    } catch {
      /* next */
    }
  }
  return null
}

export async function findFfprobe(ffmpeg: string): Promise<string> {
  const probe = ffmpeg.replace(/ffmpeg$/, 'ffprobe')
  try {
    const r = await runFfmpeg(probe, ['-version'])
    if (r.code === 0) return probe
  } catch {
    /* fall through */
  }
  return probe
}

export async function probeHasAudio(ffprobe: string, path: string): Promise<boolean> {
  try {
    const r = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      path
    ])
    return r.stdout.toString().includes('audio')
  } catch {
    return false
  }
}

export async function probeHasVideo(ffprobe: string, path: string): Promise<boolean> {
  try {
    const r = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      path
    ])
    return r.stdout.toString().includes('video')
  } catch {
    return false
  }
}
