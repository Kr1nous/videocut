import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { store } from './core'
import { timelineDurationMs } from '../shared/types'

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

async function findFfmpeg(): Promise<string | null> {
  const candidates = ['ffmpeg', '/opt/local/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']
  for (const c of candidates) {
    try {
      const r = await run(c, ['-version'])
      if (r.code === 0) return c
    } catch {
      /* next */
    }
  }
  return null
}

export async function saveThumbDataUrl(assetId: string, dataUrl: string): Promise<string | null> {
  if (!store.projectPath) return null
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  const ext = m[1].includes('png') ? 'png' : 'jpg'
  const dest = join(store.projectPath, 'thumbs', `${assetId}.${ext}`)
  await writeFile(dest, Buffer.from(m[2], 'base64'))
  await store.updateAssetMeta(assetId, { thumbPath: dest })
  return dest
}

export async function exportTimeline(preset = '1080p'): Promise<string> {
  const project = store.requireProject()
  if (!store.projectPath) throw new Error('项目路径丢失')
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) {
    throw new Error('本机没有 ffmpeg。安装后再导出，或先用预览窗审查成片。')
  }
  if (project.timeline.storyline.length === 0) throw new Error('时间线是空的')
  const size =
    preset === 'shorts' || project.settings.aspect === '9:16'
      ? '1080x1920'
      : preset === '4k'
        ? '3840x2160'
        : project.settings.aspect === '1:1'
          ? '1080x1080'
          : '1920x1080'

  const listPath = join(store.projectPath, 'export', 'concat.txt')
  const lines: string[] = []
  for (const clip of project.timeline.storyline) {
    const asset = project.assets.find((a) => a.id === clip.assetId)
    if (!asset) continue
    const start = (clip.inMs / 1000).toFixed(3)
    const dur = (clip.durationMs / 1000).toFixed(3)
    lines.push(`file '${asset.path.replace(/'/g, "'\\''")}'`)
    lines.push(`inpoint ${start}`)
    lines.push(`outpoint ${(Number(start) + Number(dur)).toFixed(3)}`)
  }
  await writeFile(listPath, lines.join('\n'), 'utf8')

  const out = join(store.projectPath, 'export', `${Date.now()}.mp4`)
  const { code, stderr } = await run(ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    `scale=${size}:force_original_aspect_ratio=increase,crop=${size.replace('x', ':')}`,
    '-c:a',
    'aac',
    out
  ])
  if (code !== 0) throw new Error(stderr.slice(-800) || '导出失败')
  store.log({
    tool: 'export',
    summary: `导出 ${Math.round(timelineDurationMs(project.timeline) / 1000)} 秒成片`,
    risk: 'low',
    source: 'human',
    reversible: false
  })
  await store.save()
  store.broadcast()
  return out
}
