import type { AssetIndex, MediaAsset } from '@shared/types'

/** Waveform / silence index is produced by the sidecar (ffmpeg), not in the WebView. */
export async function analyzeAsset(_asset: MediaAsset): Promise<AssetIndex> {
  return { silence: [], speech: [], scenes: [], peakRms: 0 }
}
