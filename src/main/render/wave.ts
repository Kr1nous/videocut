import { downsamplePeaks } from '../../shared/audio'
import { runFfmpeg } from './ffmpeg'

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
