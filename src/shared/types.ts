export type MediaKind = 'video' | 'audio' | 'image'
export type ClipSource = 'human' | 'ai' | 'ai-accepted'
export type ActionRisk = 'low' | 'medium' | 'high'

export interface MediaAsset {
  id: string
  name: string
  path: string
  kind: MediaKind
  durationMs: number
  width: number
  height: number
  fps: number
  thumbPath?: string
  importedAt: string
  index?: AssetIndex
}

export type FilterName = 'none' | 'vivid' | 'cinema' | 'bw' | 'vintage'
export type TransitionType = 'none' | 'cross_dissolve' | 'fade_black'
export type AspectPreset = '16:9' | '9:16' | '1:1'

export interface ClipFx {
  speed: number
  pitchPreserve: boolean
  fadeInMs: number
  fadeOutMs: number
  opacity: number
  rotate: 0 | 90 | 180 | 270
  flipX: boolean
  flipY: boolean
  crop: { x: number; y: number; w: number; h: number } | null
  filter: FilterName
  color: { exposure: number; contrast: number; saturation: number; warmth: number }
  transitionOut: { type: TransitionType; durationMs: number }
}

export const DEFAULT_CLIP_FX: ClipFx = {
  speed: 1,
  pitchPreserve: true,
  fadeInMs: 0,
  fadeOutMs: 0,
  opacity: 1,
  rotate: 0,
  flipX: false,
  flipY: false,
  crop: null,
  filter: 'none',
  color: { exposure: 0, contrast: 0, saturation: 0, warmth: 0 },
  transitionOut: { type: 'none', durationMs: 0 }
}

export interface TimelineClip {
  id: string
  assetId: string
  startMs: number
  durationMs: number
  inMs: number
  outMs: number
  volume: number
  source: ClipSource
  fx?: Partial<ClipFx>
}

export interface SubtitleStyle {
  fontSize: number
  color: string
  stroke: string
  position: 'bottom' | 'top' | 'center'
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 42,
  color: '#ffffff',
  stroke: '#000000',
  position: 'bottom'
}

export interface SubtitleCue {
  id: string
  startMs: number
  endMs: number
  text: string
  source: ClipSource
}

export interface TimeRange {
  startMs: number
  endMs: number
}

export interface TranscriptCue {
  startMs: number
  endMs: number
  text: string
}

export interface AssetIndex {
  silence: TimeRange[]
  speech: TimeRange[]
  scenes: number[]
  peakRms: number
}

export interface Timeline {
  storyline: TimelineClip[]
  overlays: TimelineClip[]
  audio: TimelineClip[]
  subtitles: SubtitleCue[]
  duck?: { enabled: boolean; ratio: number }
}

export interface ProjectSettings {
  width: number
  height: number
  fps: number
  sampleRate: number
  aspect?: AspectPreset
}

export interface ProjectSnapshot {
  id: string
  createdAt: string
  label: string
  timeline: Timeline
}

export interface ReviewAction {
  id: string
  at: string
  tool: string
  summary: string
  risk: ActionRisk
  source: 'ai' | 'human' | 'mcp'
  reversible: boolean
}

export interface TimelineMarker {
  id: string
  atMs: number
  label: string
}

export interface Project {
  version: 1
  name: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  subtitleStyle: SubtitleStyle
  assets: MediaAsset[]
  timeline: Timeline
  transcript: TranscriptCue[]
  markers: TimelineMarker[]
  snapshots: ProjectSnapshot[]
  review: ReviewAction[]
}

export type ProviderKind = 'openai-compatible' | 'anthropic'

export interface AiProvider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface AppSettings {
  activeProviderId: string
  allowMediaUpload: boolean
  mcpPort: number
  firstRunComplete: boolean
  providers: AiProvider[]
}

export type TimelineOp =
  | { op: 'add_clip'; assetId: string; startMs?: number; inMs?: number; outMs?: number }
  | { op: 'remove_clip'; clipId: string }
  | { op: 'trim_clip'; clipId: string; inMs: number; outMs: number }
  | { op: 'split_clip'; clipId: string; atMs: number }
  | { op: 'move_clip'; clipId: string; startMs: number }
  | { op: 'reorder_storyline'; clipIds: string[] }
  | { op: 'set_volume'; clipId: string; volume: number }
  | { op: 'replace_storyline'; clips: TimelineClip[] }
  | { op: 'add_subtitle'; startMs: number; endMs: number; text: string }
  | { op: 'update_subtitle'; id: string; startMs?: number; endMs?: number; text?: string }
  | { op: 'remove_subtitle'; id: string }
  | { op: 'replace_subtitles'; cues: SubtitleCue[] }
  | { op: 'clear_timeline' }
  | { op: 'patch_clip'; clipId: string; volume?: number; fx?: Partial<ClipFx> }
  | { op: 'add_overlay'; assetId: string; startMs: number; inMs?: number; outMs?: number }
  | { op: 'add_audio'; assetId: string; startMs?: number; volume?: number }
  | { op: 'delete_asset'; assetId: string }

export interface McpStatus {
  running: boolean
  port: number
  url: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProviderId: 'spacexai',
  allowMediaUpload: true,
  mcpPort: 4877,
  firstRunComplete: false,
  providers: [
    {
      id: 'spacexai',
      name: 'SpaceXAI',
      kind: 'openai-compatible',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: '',
      model: 'grok-4.6',
      enabled: true
    },
    {
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4.1',
      enabled: true
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: '',
      model: 'claude-sonnet-4-5',
      enabled: true
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      model: 'x-ai/grok-4.6',
      enabled: true
    },
    {
      id: 'ollama',
      name: 'Ollama（本地）',
      kind: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'ollama',
      model: 'llama3.2',
      enabled: true
    }
  ]
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000,
  aspect: '16:9'
}

export interface ActionResult {
  ok: boolean
  tool: string
  summary: string
  changedIds: string[]
  durationMs: number
}

export function emptyTimeline(): Timeline {
  return { storyline: [], overlays: [], audio: [], subtitles: [], duck: { enabled: false, ratio: 0.28 } }
}

export function clipFx(clip: TimelineClip): ClipFx {
  return { ...DEFAULT_CLIP_FX, ...clip.fx, color: { ...DEFAULT_CLIP_FX.color, ...clip.fx?.color }, transitionOut: { ...DEFAULT_CLIP_FX.transitionOut, ...clip.fx?.transitionOut } }
}

export function timelineDurationMs(timeline: Timeline): number {
  let max = 0
  for (const clip of [...timeline.storyline, ...timeline.overlays, ...timeline.audio]) {
    max = Math.max(max, clip.startMs + clip.durationMs)
  }
  for (const cue of timeline.subtitles) {
    max = Math.max(max, cue.endMs)
  }
  return max
}

export function clipAtTime(clips: TimelineClip[], timeMs: number): TimelineClip | null {
  return clips.find((c) => timeMs >= c.startMs && timeMs < c.startMs + c.durationMs) ?? null
}

export function subtitleAtTime(cues: SubtitleCue[], timeMs: number): SubtitleCue | null {
  return cues.find((c) => timeMs >= c.startMs && timeMs < c.endMs) ?? null
}
