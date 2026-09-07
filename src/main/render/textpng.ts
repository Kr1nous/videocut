import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { clipFx } from '../../shared/types'
import { clipText, visibleText } from '../../shared/text'
import type { TimelineClip } from '../../shared/types'
import { findFfmpeg, runFfmpeg } from './ffmpeg'

const PY = `#!/usr/bin/env python3
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

def rgba(h):
    h = (h or "#ffffff").lstrip("#")
    if len(h) == 3:
        h = "".join(c*2 for c in h)
    if len(h) < 6:
        h = "ffffff"
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 255)

def font(size):
    cands = [
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()

def draw_frame(job, text, dest):
    W, H = int(job["width"]), int(job["height"])
    img = Image.new("RGBA", (W, H), (0,0,0,0))
    d = ImageDraw.Draw(img)
    size = max(12, int(job["fontSize"]))
    f = font(size)
    fill = rgba(job.get("color") or "#ffffff")
    stroke = rgba(job.get("stroke") or "#000000")
    sw = int(job.get("strokeWidth") or 3)
    x = float(job.get("posX") or 0.5) * W
    y = float(job.get("posY") or 0.45) * H
    align = job.get("align") or "center"
    anchor = "lm" if align == "left" else "rm" if align == "right" else "mm"
    d.text((x, y), text, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)
    img.save(dest)

job = json.loads(sys.argv[1])
mode = job.get("mode") or "png"
if mode == "png":
    draw_frame(job, job.get("text") or "", job["out"])
elif mode == "typewriter":
    os.makedirs(job["outDir"], exist_ok=True)
    chars = list(job.get("text") or "")
    fps = max(1, int(job.get("fps") or 30))
    dur = max(0.1, float(job.get("durationS") or 3))
    n = max(1, int(round(dur * fps)))
    for i in range(n):
        t01 = i / max(1, n - 1)
        reveal = min(1.0, t01 / 0.7)
        k = int(len(chars) * reveal + 1e-6)
        vis = "".join(chars[:k])
        draw_frame(job, vis, os.path.join(job["outDir"], f"{i:04d}.png"))
`

function runPython(job: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', PY, JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.slice(-600) || '文字渲染失败'))
    })
  })
}

export type BakedText = { path: string; seq?: boolean }

export async function bakeTextLayers(
  clips: TimelineClip[],
  dir: string,
  width: number,
  height: number,
  fps: number
): Promise<Map<string, BakedText>> {
  const map = new Map<string, BakedText>()
  for (const clip of clips) {
    if ((clip.kind ?? 'footage') !== 'text' || !clip.text?.text) continue
    const t = clipText(clip)
    const fx = clipFx(clip)
    const size = Math.round((t.fontSize || 72) * (width / 1920) * (fx.scale || 1))
    const base = {
      width,
      height,
      fontSize: size,
      color: t.color,
      stroke: t.stroke,
      strokeWidth: t.strokeWidth,
      posX: fx.posX,
      posY: fx.posY,
      align: t.align,
      text: t.text
    }
    if (clip.textAnim === 'typewriter') {
      const outDir = join(dir, `text_${clip.id}`)
      await mkdir(outDir, { recursive: true })
      await runPython({
        ...base,
        mode: 'typewriter',
        outDir,
        fps,
        durationS: clip.durationMs / 1000
      })
      const ffmpeg = await findFfmpeg()
      if (!ffmpeg) throw new Error('没有 ffmpeg')
      const mov = join(dir, `text_${clip.id}.mov`)
      const r = await runFfmpeg(ffmpeg, [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(outDir, '%04d.png'),
        '-c:v',
        'png',
        '-pix_fmt',
        'rgba',
        mov
      ])
      if (r.code !== 0) throw new Error(r.stderr.slice(-500) || '打字机序列失败')
      map.set(clip.id, { path: mov })
    } else {
      const png = join(dir, `text_${clip.id}.png`)
      await runPython({ ...base, mode: 'png', out: png })
      map.set(clip.id, { path: png })
    }
  }
  return map
}

export async function bakeTextFrame(clip: TimelineClip, width: number, height: number, timeMs: number, dest: string): Promise<void> {
  const t = clipText(clip)
  const fx = clipFx(clip)
  const size = Math.round((t.fontSize || 72) * (width / 1920) * (fx.scale || 1))
  await runPython({
    mode: 'png',
    out: dest,
    width,
    height,
    fontSize: size,
    color: t.color,
    stroke: t.stroke,
    strokeWidth: t.strokeWidth,
    posX: fx.posX,
    posY: fx.posY,
    align: t.align,
    text: visibleText(clip, timeMs)
  })
}
