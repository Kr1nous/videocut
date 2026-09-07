import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { store } from './core'

export { exportTimeline, renderTimeline, makeProxy, addRenderJob } from './render/export'
export { renderFrame } from './render/frame'
export { findFfmpeg } from './render/ffmpeg'

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
