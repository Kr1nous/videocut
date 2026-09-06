import type { AssetIndex, MediaAsset, TimeRange } from '@shared/types'
import { mediaUrl } from './format'

export async function analyzeAsset(asset: MediaAsset): Promise<AssetIndex> {
  const index: AssetIndex = { silence: [], speech: [], scenes: [], peakRms: 0 }
  if (asset.kind === 'video' || asset.kind === 'audio') {
    try {
      Object.assign(index, await analyzeAudio(asset))
    } catch {
      /* decode may fail for some codecs */
    }
  }
  if (asset.kind === 'video') {
    try {
      index.scenes = await analyzeScenes(asset)
    } catch {
      /* ignore */
    }
  }
  return index
}

async function analyzeAudio(asset: MediaAsset): Promise<Pick<AssetIndex, 'silence' | 'speech' | 'peakRms'>> {
  const res = await fetch(mediaUrl(asset.path))
  const buf = await res.arrayBuffer()
  const ctx = new AudioContext()
  const audio = await ctx.decodeAudioData(buf.slice(0))
  const ch = audio.getChannelData(0)
  const hop = Math.max(1, Math.floor(audio.sampleRate * 0.05))
  const rms: number[] = []
  for (let i = 0; i < ch.length; i += hop) {
    let s = 0
    const n = Math.min(hop, ch.length - i)
    for (let j = 0; j < n; j++) s += ch[i + j] * ch[i + j]
    rms.push(Math.sqrt(s / Math.max(1, n)))
  }
  const peak = Math.max(...rms, 0.0001)
  const thresh = Math.max(0.012, peak * 0.08)
  const silence: TimeRange[] = []
  const speech: TimeRange[] = []
  let mode: 's' | 'v' | null = null
  let start = 0
  const ms = (i: number) => Math.round((i * hop) / audio.sampleRate * 1000)
  const flush = (end: number, silent: boolean) => {
    const range = { startMs: ms(start), endMs: ms(end) }
    if (range.endMs - range.startMs < 80) return
    if (silent) silence.push(range)
    else speech.push(range)
  }
  rms.forEach((v, i) => {
    const silent = v < thresh
    const m: 's' | 'v' = silent ? 's' : 'v'
    if (mode == null) {
      mode = m
      start = i
      return
    }
    if (m !== mode) {
      flush(i, mode === 's')
      mode = m
      start = i
    }
  })
  if (mode) flush(rms.length, mode === 's')
  void ctx.close()
  return { silence, speech, peakRms: peak }
}

async function analyzeScenes(asset: MediaAsset): Promise<number[]> {
  const v = document.createElement('video')
  v.src = mediaUrl(asset.path)
  v.muted = true
  await new Promise<void>((resolve) => {
    v.onloadedmetadata = () => resolve()
    v.onerror = () => resolve()
  })
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 27
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g || !v.duration) return []
  const cuts: number[] = []
  let prev: number[] | null = null
  const step = Math.max(0.25, v.duration / 240)
  for (let t = 0; t < v.duration; t += step) {
    v.currentTime = t
    await new Promise<void>((resolve) => {
      v.onseeked = () => resolve()
    })
    g.drawImage(v, 0, 0, 48, 27)
    const data = g.getImageData(0, 0, 48, 27).data
    const hist = new Array(16).fill(0)
    for (let i = 0; i < data.length; i += 4) {
      const y = (data[i] + data[i + 1] + data[i + 2]) / 3
      hist[Math.min(15, Math.floor(y / 16))]++
    }
    if (prev) {
      let diff = 0
      for (let i = 0; i < 16; i++) diff += Math.abs(hist[i] - prev[i])
      if (diff > 900) cuts.push(Math.round(t * 1000))
    }
    prev = hist
  }
  return cuts
}
