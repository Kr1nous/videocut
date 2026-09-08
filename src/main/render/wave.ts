import { downsamplePeaks } from '../../shared/audio'
import type { AssetIndex, TimeRange } from '../../shared/types'
import { findFfmpeg, runFfmpeg } from './ffmpeg'

export async function readWaveform(ffmpeg: string, path: string, bins = 240): Promise<number[]> {
  const r = await runFfmpeg(ffmpeg, [
    '-i',
    path,
    '-ac',
    '1',
    '-ar',
    '4000',
    '-f',
    's16le',
    '-acodec',
    'pcm_s16le',
    'pipe:1'
  ])
  if (r.code !== 0 || r.stdout.length < 4) return []
  const buf = r.stdout
  const samples = Math.floor(buf.length / 2)
  const hop = Math.max(1, Math.floor(samples / Math.max(32, bins * 4)))
  const rms: number[] = []
  for (let i = 0; i < samples; i += hop) {
    let s = 0
    const n = Math.min(hop, samples - i)
    for (let j = 0; j < n; j++) {
      const v = buf.readInt16LE((i + j) * 2) / 32768
      s += v * v
    }
    rms.push(Math.sqrt(s / Math.max(1, n)))
  }
  return downsamplePeaks(rms, bins)
}

export function indexFromPeaks(peaks: number[], durationMs: number): AssetIndex {
  const silence: TimeRange[] = []
  const speech: TimeRange[] = []
  if (!peaks.length || durationMs <= 0) {
    return { silence, speech, scenes: [], peakRms: 0, waveform: peaks }
  }
  const thresh = 0.08
  const msAt = (i: number) => Math.round((i / Math.max(1, peaks.length)) * durationMs)
  let mode: 's' | 'v' | null = null
  let start = 0
  const flush = (end: number, silent: boolean) => {
    const range = { startMs: msAt(start), endMs: msAt(end) }
    if (range.endMs - range.startMs < 80) return
    if (silent) silence.push(range)
    else speech.push(range)
  }
  peaks.forEach((v, i) => {
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
  if (mode) flush(peaks.length, mode === 's')
  return { silence, speech, scenes: [], peakRms: Math.max(...peaks, 0), waveform: peaks }
}

export async function analyzeMediaFile(path: string, durationMs: number): Promise<AssetIndex> {
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) return { silence: [], speech: [], scenes: [], peakRms: 0 }
  try {
    const peaks = await readWaveform(ffmpeg, path)
    return indexFromPeaks(peaks, durationMs)
  } catch {
    return { silence: [], speech: [], scenes: [], peakRms: 0 }
  }
}
