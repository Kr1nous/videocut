import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fxAt, sampleKeys } from '../../shared/anim'
import { beatScaleKeys, denoiseFfmpeg, downsamplePeaks, envelopeAt, volumeAt } from '../../shared/audio'
import { packStorylineClips, dissolveOverlapMs, layersAt, opacityAt, overlayLanes } from '../../shared/compose'
import { cubeFileText, makeLut, simpleEffectFfmpeg, xfadeName } from '../../shared/effects'
import { keyFfmpeg, stabilizeFfmpeg } from '../../shared/key'
import {
  type MediaAsset,
  type Project,
  type TimelineClip,
  DEFAULT_CLIP_FX,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_SUBTITLE_STYLE,
  emptyTimeline
} from '../../shared/types'
import { findFfmpeg, findFfprobe, runFfmpeg } from './ffmpeg'
import { maskFfmpeg } from '../../shared/mask'
import { FADE_IN_KEYS } from '../../shared/text'
import { buildGraph } from './graph'
import { evenHalf, exportExt, normalizePreset, renderTimeline, videoEncodeArgs, writeProxyFile } from './export'
import { renderFrame } from './frame'

function clip(partial: Partial<TimelineClip> & Pick<TimelineClip, 'id' | 'assetId'>): TimelineClip {
  return {
    startMs: 0,
    durationMs: 2000,
    inMs: 0,
    outMs: 2000,
    volume: 1,
    source: 'human',
    ...partial
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function unitTests(): void {
  const a = clip({
    id: 'a',
    assetId: 'red',
    durationMs: 2000,
    fx: { transitionOut: { type: 'cross_dissolve', durationMs: 400 } }
  })
  const b = clip({ id: 'b', assetId: 'blue', durationMs: 2000 })
  const clips = [a, b]
  packStorylineClips(clips)
  assert(a.startMs === 0, 'a starts at 0')
  assert(b.startMs === 1600, `dissolve overlap packs b at 1600, got ${b.startMs}`)

  const faded = clip({ id: 'f', assetId: 'red', durationMs: 1000, fx: { opacity: 1, fadeOutMs: 1000 } })
  assert(Math.abs(opacityAt(faded, 0) - 1) < 0.01, 'fade start')
  assert(Math.abs(opacityAt(faded, 500) - 0.5) < 0.02, 'fade mid')
  assert(opacityAt(faded, 999) < 0.05, 'fade end')

  const tl = emptyTimeline()
  tl.storyline = clips
  const mid = layersAt(tl, 1800)
  assert(mid.length === 2, `dissolve should expose two layers, got ${mid.length}`)
  assert(mid[0].opacity > 0 && mid[0].opacity < 1, 'outgoing dissolve opacity')
  assert(mid[1].opacity > 0 && mid[1].opacity < 1, 'incoming dissolve opacity')

  const ov = [
    clip({ id: 'o1', assetId: 'a', startMs: 0, durationMs: 2000 }),
    clip({ id: 'o2', assetId: 'b', startMs: 500, durationMs: 2000 }),
    clip({ id: 'o3', assetId: 'c', startMs: 3000, durationMs: 500 })
  ]
  const lanes = overlayLanes(ov)
  assert(lanes[0] === 0 && lanes[1] === 1 && lanes[2] === 0, `lanes ${lanes.join(',')}`)
  const stacked = emptyTimeline()
  stacked.storyline = [clip({ id: 'base', assetId: 'red', durationMs: 2000 })]
  stacked.overlays = [
    clip({ id: 'top', assetId: 'blue', durationMs: 2000, blend: 'screen' }),
    clip({ id: 'adj', assetId: '', durationMs: 2000, kind: 'adjustment', fx: { filter: 'bw' } })
  ]
  const at = layersAt(stacked, 400)
  assert(at.length === 3, `stack should be base+layer+adj, got ${at.length}`)
  assert(at[1].blend === 'screen' && at[2].kind === 'adjustment', 'blend/adjustment in compose')
  const mf = maskFfmpeg({
    ...DEFAULT_CLIP_FX,
    masks: [{ id: 'mask1', shape: 'ellipse', mode: 'add', x: 0.2, y: 0.1, w: 0.6, h: 0.8, feather: 0.04 }]
  })
  assert(mf && mf.includes('geq'), 'mask ffmpeg geq')
  const fadeKeys = [
    { t: 0, value: 0, ease: 'linear' as const },
    { t: 0.5, value: 1, ease: 'linear' as const },
    { t: 1, value: 0, ease: 'linear' as const }
  ]
  assert(Math.abs(sampleKeys(fadeKeys, 0, 1) - 0) < 0.001, 'key 0')
  assert(Math.abs(sampleKeys(fadeKeys, 0.5, 1) - 1) < 0.001, 'key mid')
  assert(Math.abs(sampleKeys(fadeKeys, 1, 1) - 0) < 0.001, 'key end')
  assert(Math.abs(sampleKeys(fadeKeys, 0.25, 1) - 0.5) < 0.02, 'key quarter')
  const fw = clip({
    id: 'fw',
    assetId: 'red',
    durationMs: 2000,
    fx: { transitionOut: { type: 'fade_white', durationMs: 400 } }
  })
  const fw2 = clip({ id: 'fw2', assetId: 'blue', durationMs: 2000 })
  const packedWhite = [fw, fw2]
  packStorylineClips(packedWhite)
  assert(dissolveOverlapMs(fw) === 400, 'fade_white overlap ms')
  assert(fw2.startMs === 1600, `fade_white packs at 1600, got ${fw2.startMs}`)
  assert(xfadeName('fade_white') === 'fadewhite' && xfadeName('push') === 'slideright', 'xfade names')
  const blurFx = {
    ...DEFAULT_CLIP_FX,
    effects: [{ id: 'e', type: 'blur' as const, enabled: true, params: { amount: 6 } }]
  }
  assert(simpleEffectFfmpeg(blurFx).some((s) => s.includes('gblur')), 'blur ffmpeg gblur')
  const stabFx = { ...DEFAULT_CLIP_FX, stabilize: { enabled: true, amount: 0.6 } }
  assert(stabilizeFfmpeg(stabFx).some((s) => s.includes('deshake')), 'stabilize deshake')
  const keyedFx = {
    ...DEFAULT_CLIP_FX,
    key: { color: '#00ff00', tolerance: 0.3, spill: 0, edge: 0.08 }
  }
  assert(keyFfmpeg(keyedFx).some((s) => s.includes('colorkey')), 'key colorkey')
  assert(Math.abs(envelopeAt([0, 1, 0], 1000, 500) - 1) < 0.01, 'envelope mid')
  assert(downsamplePeaks([0, 2, 0, 2], 2).length === 2, 'downsample bins')
  const volClip = clip({
    id: 'vol',
    assetId: 'red',
    durationMs: 1000,
    volume: 1,
    fx: {
      keys: {
        volume: [
          { t: 0, value: 0.2, ease: 'linear' },
          { t: 1, value: 1, ease: 'linear' }
        ]
      }
    }
  })
  assert(Math.abs(volumeAt(volClip, 0) - 0.2) < 0.02, 'volume key start')
  assert(Math.abs(volumeAt(volClip, 1000) - 1) < 0.02, 'volume key end')
  const denFx = { ...DEFAULT_CLIP_FX, denoise: { enabled: true, amount: 0.5 } }
  assert(denoiseFfmpeg(denFx).some((s) => s.includes('afftdn')), 'denoise afftdn')
  const beats = beatScaleKeys([0, 500], clip({ id: 'a', assetId: 'red', durationMs: 1000 }), clip({ id: 'v', assetId: 'red', durationMs: 1000, fx: { scale: 0.4 } }), 0.5, 0.4)
  assert(beats.some((k) => k.value > 0.5), 'beat scale pulses')
  assert(normalizePreset('nope') === '1080p' && normalizePreset('alpha') === 'alpha', 'export preset')
  assert(exportExt('alpha') === 'mov' && exportExt('1080p') === 'mp4', 'export ext')
  assert(evenHalf(640) === 320 && evenHalf(360) === 180, 'proxy half size')
  assert(videoEncodeArgs('1080p').includes('libx264'), 'h264 args')
  assert(videoEncodeArgs('alpha').some((s) => s.includes('yuva') || s === '4444'), 'alpha args')
  assert(videoEncodeArgs('prores').includes('yuv422p10le'), 'prores args')
  console.log('unit: pack / opacity / dissolve / overlay lanes / mask / keys / effects / key-stab / audio / export ok')
}

function dummyProject(red: string, blue: string): Project {
  const assets: MediaAsset[] = [
    {
      id: 'red',
      name: 'red.mp4',
      path: red,
      kind: 'video',
      durationMs: 3000,
      width: 640,
      height: 360,
      fps: 30,
      importedAt: new Date().toISOString()
    },
    {
      id: 'blue',
      name: 'blue.mp4',
      path: blue,
      kind: 'video',
      durationMs: 2000,
      width: 640,
      height: 360,
      fps: 30,
      importedAt: new Date().toISOString()
    }
  ]
  const storyline: TimelineClip[] = [
    clip({
      id: 'c1',
      assetId: 'red',
      inMs: 0,
      outMs: 3000,
      durationMs: 2000,
      fx: {
        opacity: 0.5,
        filter: 'vivid',
        speed: 1.5,
        transitionOut: { type: 'cross_dissolve', durationMs: 400 }
      }
    }),
    clip({
      id: 'c2',
      assetId: 'blue',
      inMs: 0,
      outMs: 2000,
      durationMs: 2000,
      fx: { fadeOutMs: 800, transitionOut: { type: 'fade_black', durationMs: 800 } }
    })
  ]
  packStorylineClips(storyline)
  return {
    version: 1,
    name: 'verify',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: { ...DEFAULT_PROJECT_SETTINGS, width: 640, height: 360, fps: 30 },
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    assets,
    timeline: { ...emptyTimeline(), storyline },
    transcript: [],
    markers: [],
    snapshots: [],
    review: []
  }
}

async function ffmpegTests(): Promise<void> {
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) throw new Error('没有 ffmpeg，无法做导出对照')
  const ffprobe = await findFfprobe(ffmpeg)
  const dir = await mkdtemp(join(tmpdir(), 'cut-compose-'))
  try {
    const red = join(dir, 'red.mp4')
    const blue = join(dir, 'blue.mp4')
    const mk = async (path: string, color: string, d: number) => {
      const r = await runFfmpeg(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=640x360:d=${d}:r=30`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${color === 'red' ? 440 : 220}:duration=${d}`,
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        path
      ])
      if (r.code !== 0) throw new Error(r.stderr.slice(-400))
    }
    await mk(red, 'red', 3)
    await mk(blue, 'blue', 2)
    const project = dummyProject(red, blue)
    const streams = new Map([
      [red, { hasVideo: true, hasAudio: true }],
      [blue, { hasVideo: true, hasAudio: true }]
    ])
    const graph = buildGraph(project, {
      width: 640,
      height: 360,
      fps: 30,
      alpha: false,
      streams
    })
    assert(graph.filter.includes('eq=saturation=1.35'), 'vivid eq in graph')
    assert(graph.filter.includes('setpts=PTS/1.5'), 'speed in graph')
    assert(graph.filter.includes('colorchannelmixer=aa=0.5'), 'opacity in graph')
    assert(graph.filter.includes('xfade=transition=fade'), 'dissolve in graph')
    assert(graph.filter.includes('fade=t=out') || graph.filter.includes('c=black'), 'fade black in graph')
    console.log('unit: filter graph contains opacity / vivid / speed / dissolve / fade-black')

    const out = join(dir, 'out.mp4')
    await renderTimeline(project, out, '1080p')
    const probe = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      out
    ])
    const dur = Number(probe.stdout.toString().trim())
    // 2.0 + 2.0 - 0.4 dissolve = 3.6s
    assert(dur > 3.3 && dur < 3.9, `expected ~3.6s export, got ${dur}`)

    const sizeProbe = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      out
    ])
    const [ow, oh] = sizeProbe.stdout.toString().trim().split(',').map(Number)
    const cx = Math.max(0, Math.floor(ow / 2))
    const cy = Math.max(0, Math.floor(oh / 2))
    async function sample(t: number): Promise<[number, number, number]> {
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        out,
        '-ss',
        t.toFixed(2),
        '-vf',
        `format=rgb24,crop=1:1:${cx}:${cy}`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1'
      ])
      if (r.stdout.length < 3) throw new Error(`no pixel at ${t}s (${ow}x${oh}): ${r.stderr.slice(-300)}`)
      return [r.stdout[0], r.stdout[1], r.stdout[2]]
    }
    const [r0, g0, b0] = await sample(0.4)
    assert(r0 > 40 && r0 < 220, `opacity 0.5 red should be mid red, got rgb(${r0},${g0},${b0})`)
    assert(g0 < 80 && b0 < 80, `vivid red should not be gray, got rgb(${r0},${g0},${b0})`)
    const [r1, g1, b1] = await sample(3.5)
    const lum = (r1 + g1 + b1) / 3
    assert(lum < 40, `fade-to-black end should be dark, got rgb(${r1},${g1},${b1}) lum=${lum}`)
    console.log(`ffmpeg: exported ${dur.toFixed(2)}s; mid-red ${r0},${g0},${b0}; fade-black ${r1},${g1},${b1}`)

    const png = await renderFrame(project, 400)
    assert(png[0] === 0x89 && png[1] === 0x50, 'compose frame should be PNG')
    assert(png.length > 200, 'compose frame too small')
    console.log(`ffmpeg: compose frame ${png.length} bytes`)

    const layered: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'base',
            assetId: 'red',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000
          })
        ],
        overlays: [
          clip({
            id: 'top',
            assetId: 'blue',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            blend: 'screen',
            fx: { scale: 1, posX: 0.5, posY: 0.5, opacity: 1 }
          }),
          clip({
            id: 'adj',
            assetId: '',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            kind: 'adjustment',
            fx: { filter: 'bw', opacity: 1 }
          })
        ]
      }
    }
    const g2 = buildGraph(layered, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(g2.filter.includes('all_mode=screen'), 'screen blend in graph')
    assert(g2.filter.includes('hue=s=0') || g2.filter.includes('split=2'), 'adjustment in graph')
    const out2 = join(dir, 'layers.mp4')
    await renderTimeline(layered, out2, '1080p')
    const pix = await runFfmpeg(ffmpeg, [
      '-i',
      out2,
      '-ss',
      '0.40',
      '-vf',
      'format=rgb24,crop=1:1:320:180',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ])
    assert(pix.stdout.length >= 3, `layer pixel missing: ${pix.stderr.slice(-300)}`)
    const [lr, lg, lb] = [pix.stdout[0], pix.stdout[1], pix.stdout[2]]
    const spread = Math.max(lr, lg, lb) - Math.min(lr, lg, lb)
    assert(spread < 40, `adjustment desaturate should be gray, got rgb(${lr},${lg},${lb})`)
    console.log(`ffmpeg: screen + adj-bw rgb ${lr},${lg},${lb}`)

    const masked: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [clip({ id: 'base', assetId: 'red', inMs: 0, outMs: 2000, durationMs: 2000 })],
        overlays: [
          clip({
            id: 'top',
            assetId: 'blue',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: {
              scale: 1,
              posX: 0.5,
              posY: 0.5,
              opacity: 1,
              masks: [{ id: 'mask1', shape: 'ellipse', mode: 'add', x: 0.2, y: 0.1, w: 0.6, h: 0.8, feather: 0.05 }]
            }
          })
        ]
      }
    }
    const g3 = buildGraph(masked, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(g3.filter.includes('geq'), 'ellipse mask in graph')
    const out3 = join(dir, 'mask.mp4')
    await renderTimeline(masked, out3, '1080p')
    async function sampleAt(file: string, px: number, py: number): Promise<[number, number, number]> {
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        file,
        '-ss',
        '0.40',
        '-vf',
        `format=rgb24,crop=1:1:${px}:${py}`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1'
      ])
      if (r.stdout.length < 3) throw new Error(`mask pixel ${px},${py}: ${r.stderr.slice(-300)}`)
      return [r.stdout[0], r.stdout[1], r.stdout[2]]
    }
    const [cr, cg, cb] = await sampleAt(out3, 320, 180)
    const [er, eg, eb] = await sampleAt(out3, 8, 8)
    assert(cb > 80 && cb > cr, `ellipse center should be blue overlay, got rgb(${cr},${cg},${cb})`)
    assert(er > 80 && eb < 80, `ellipse outside should show red below, got rgb(${er},${eg},${eb})`)
    console.log(`ffmpeg: mask center rgb ${cr},${cg},${cb}; corner ${er},${eg},${eb}`)

    const keyed: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'fade',
            assetId: 'red',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: {
              keys: {
                opacity: [
                  { t: 0, value: 0, ease: 'linear' },
                  { t: 0.5, value: 1, ease: 'linear' },
                  { t: 1, value: 0, ease: 'linear' }
                ]
              }
            }
          })
        ]
      }
    }
    const g4 = buildGraph(keyed, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(g4.filter.includes('geq') || g4.filter.includes('alpha'), 'opacity keys in graph')
    const live0 = fxAt(keyed.timeline.storyline[0], 0).opacity
    const liveM = fxAt(keyed.timeline.storyline[0], 1000).opacity
    const live1 = fxAt(keyed.timeline.storyline[0], 2000 - 1).opacity
    assert(live0 < 0.05 && liveM > 0.95 && live1 < 0.05, `fxAt opacity 0-1-0 got ${live0},${liveM},${live1}`)
    const out4 = join(dir, 'keys.mp4')
    await renderTimeline(keyed, out4, '1080p')
    const start = await runFfmpeg(ffmpeg, [
      '-i',
      out4,
      '-ss',
      '0.20',
      '-vf',
      'format=rgb24,crop=1:1:320:180',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ])
    const k0 = start.stdout[0]
    const mid = await runFfmpeg(ffmpeg, [
      '-i',
      out4,
      '-ss',
      '1.00',
      '-vf',
      'format=rgb24,crop=1:1:320:180',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ])
    const end = await runFfmpeg(ffmpeg, [
      '-i',
      out4,
      '-ss',
      '1.90',
      '-vf',
      'format=rgb24,crop=1:1:320:180',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ])
    const rMid = mid.stdout[0]
    const rEnd = end.stdout[0]
    assert(k0 < 80, `opacity rise at 0.4s should be dim, got R=${k0}`)
    assert(rMid > 200, `opacity peak at 1s should be bright red, got R=${rMid}`)
    assert(rEnd < 80, `opacity fall at 1.9s should be dim, got R=${rEnd}`)
    console.log(`ffmpeg: opacity 0→1→0 R ${k0} → ${rMid} → ${rEnd}`)

    const title: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        overlays: [
          clip({
            id: 'title',
            assetId: '',
            inMs: 0,
            outMs: 3000,
            durationMs: 3000,
            kind: 'text',
            textAnim: 'fade',
            text: {
              text: '标题',
              font: 'PingFang SC',
              fontSize: 72,
              color: '#ffffff',
              stroke: '#000000',
              strokeWidth: 3,
              align: 'center'
            },
            fx: { posX: 0.5, posY: 0.45, keys: { opacity: FADE_IN_KEYS } }
          })
        ]
      }
    }
    const out5 = join(dir, 'title.mp4')
    await renderTimeline(title, out5, '1080p')
    const tprobe = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      out5
    ])
    const tdur = Number(tprobe.stdout.toString().trim())
    assert(tdur > 2.7 && tdur < 3.4, `title should be ~3s, got ${tdur}`)
    const tmid = await runFfmpeg(ffmpeg, [
      '-i',
      out5,
      '-ss',
      '1.50',
      '-vf',
      'format=rgb24,crop=80:40:280:160',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ])
    let sum = 0
    for (let i = 0; i < tmid.stdout.length; i++) sum += tmid.stdout[i]
    const avg = tmid.stdout.length ? sum / tmid.stdout.length : 0
    assert(avg > 10, `fade title at 1.5s should be visible, avg=${avg}`)
    console.log(`ffmpeg: animate_text fade ${tdur.toFixed(2)}s, center avg ${avg.toFixed(0)}`)

    const split = join(dir, 'split.mp4')
    const hs = await runFfmpeg(ffmpeg, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=320x360:d=2:r=30',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x360:d=2:r=30',
      '-filter_complex',
      '[0:v][1:v]hstack=inputs=2,format=yuv420p',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      split
    ])
    if (hs.code !== 0) throw new Error(`split source: ${hs.stderr.slice(-400)}`)
    const splitProject: Project = {
      ...project,
      assets: [
        ...project.assets,
        {
          id: 'split',
          name: 'split.mp4',
          path: split,
          kind: 'video',
          durationMs: 2000,
          width: 640,
          height: 360,
          fps: 30,
          importedAt: new Date().toISOString()
        }
      ],
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'blur',
            assetId: 'split',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: {
              effects: [{ id: 'fx1', type: 'blur', enabled: true, params: { amount: 16 } }]
            }
          })
        ]
      }
    }
    const gBlur = buildGraph(splitProject, { width: 640, height: 360, fps: 30, alpha: false, streams: new Map([[split, { hasVideo: true, hasAudio: false }]]) })
    assert(gBlur.filter.includes('gblur'), 'blur in graph')
    const outBlur = join(dir, 'blur.mp4')
    await renderTimeline(splitProject, outBlur, '1080p')
    async function sampleFile(file: string, px: number, py: number, t = 0.4): Promise<[number, number, number]> {
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        file,
        '-ss',
        t.toFixed(2),
        '-vf',
        `format=rgb24,crop=1:1:${px}:${py}`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1'
      ])
      if (r.stdout.length < 3) throw new Error(`pixel ${file} ${px},${py}: ${r.stderr.slice(-300)}`)
      return [r.stdout[0], r.stdout[1], r.stdout[2]]
    }
    async function samplePng(buf: Buffer, px: number, py: number): Promise<[number, number, number]> {
      const tmp = join(dir, `frame-${px}-${py}.png`)
      await writeFile(tmp, buf)
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        tmp,
        '-vf',
        `format=rgb24,crop=1:1:${px}:${py}`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1'
      ])
      if (r.stdout.length < 3) throw new Error(`png pixel ${px},${py}: ${r.stderr.slice(-300)}`)
      return [r.stdout[0], r.stdout[1], r.stdout[2]]
    }
    const [br] = await sampleFile(outBlur, 320, 180)
    const [leftR] = await sampleFile(outBlur, 8, 180)
    const [rightR] = await sampleFile(outBlur, 632, 180)
    assert(br > 40 && br < 220, `blur seam should mix, got R=${br}`)
    assert(leftR > 160, `blur far-left should stay red, got R=${leftR}`)
    assert(rightR < 80, `blur far-right should stay dark, got R=${rightR}`)
    const blurFrame = await renderFrame(splitProject, 400)
    const [pr] = await samplePng(blurFrame, 320, 180)
    assert(Math.abs(pr - br) < 40, `blur preview vs export seam R ${pr} vs ${br}`)
    console.log(`ffmpeg: blur seam R ${br} (preview ${pr}); left ${leftR} right ${rightR}`)

    const cube = join(dir, 'green.cube')
    await writeFile(cube, cubeFileText(makeLut('green')), 'utf8')
    const lutProject: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'lut',
            assetId: 'red',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: {
              effects: [{ id: 'lut1', type: 'lut', enabled: true, params: { name: 'green', path: cube } }]
            }
          })
        ]
      }
    }
    const gLut = buildGraph(lutProject, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(gLut.filter.includes('lut3d'), 'lut3d in graph')
    const outLut = join(dir, 'lut.mp4')
    await renderTimeline(lutProject, outLut, '1080p')
    const [lutR, lutG, lutB] = await sampleFile(outLut, 320, 180)
    assert(lutG > 150 && lutG > lutR, `green LUT should swap red→green, got rgb(${lutR},${lutG},${lutB})`)
    assert(lutR < 80, `green LUT red channel should drop, got rgb(${lutR},${lutG},${lutB})`)
    const lutFrame = await renderFrame(lutProject, 400)
    const [preR, preG, preB] = await samplePng(lutFrame, 320, 180)
    assert(
      Math.abs(preR - lutR) < 35 && Math.abs(preG - lutG) < 35 && Math.abs(preB - lutB) < 35,
      `lut preview vs export rgb(${preR},${preG},${preB}) vs rgb(${lutR},${lutG},${lutB})`
    )
    console.log(`ffmpeg: green LUT rgb ${lutR},${lutG},${lutB}; preview ${preR},${preG},${preB}`)

    const gs = join(dir, 'gs.mp4')
    const gsMk = await runFfmpeg(ffmpeg, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x00FF00:s=640x360:d=2:r=30',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=220x140:d=2:r=30',
      '-filter_complex',
      '[0:v][1:v]overlay=210:110,format=yuv420p',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      gs
    ])
    if (gsMk.code !== 0) throw new Error(`gs source: ${gsMk.stderr.slice(-400)}`)
    const keyProject: Project = {
      ...project,
      assets: [
        ...project.assets,
        {
          id: 'gs',
          name: 'gs.mp4',
          path: gs,
          kind: 'video',
          durationMs: 2000,
          width: 640,
          height: 360,
          fps: 30,
          importedAt: new Date().toISOString()
        }
      ],
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'base',
            assetId: 'blue',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000
          })
        ],
        overlays: [
          clip({
            id: 'fg',
            assetId: 'gs',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: {
              scale: 1,
              posX: 0.5,
              posY: 0.5,
              opacity: 1,
              key: { color: '#00ff00', tolerance: 0.35, spill: 0, edge: 0.08 }
            }
          })
        ]
      }
    }
    const keyStreams = new Map([...streams, [gs, { hasVideo: true, hasAudio: false }]])
    const gKey = buildGraph(keyProject, { width: 640, height: 360, fps: 30, alpha: false, streams: keyStreams })
    assert(gKey.filter.includes('colorkey'), 'colorkey in graph')
    const outKey = join(dir, 'key.mp4')
    await renderTimeline(keyProject, outKey, '1080p')
    const [kcR, kcG, kcB] = await sampleFile(outKey, 320, 180)
    const [koR, koG, koB] = await sampleFile(outKey, 8, 8)
    assert(kcR > 150 && kcR > kcB, `keyed center should stay red subject, got rgb(${kcR},${kcG},${kcB})`)
    assert(koB > 80 && koB > koR, `keyed corner should show blue below, got rgb(${koR},${koG},${koB})`)
    const keyFrame = await renderFrame(keyProject, 400)
    const [pkR, pkG, pkB] = await samplePng(keyFrame, 320, 180)
    assert(
      Math.abs(pkR - kcR) < 40 && Math.abs(pkG - kcG) < 40 && Math.abs(pkB - kcB) < 40,
      `key preview vs export center rgb(${pkR},${pkG},${pkB}) vs rgb(${kcR},${kcG},${kcB})`
    )
    console.log(`ffmpeg: key center rgb ${kcR},${kcG},${kcB} (preview ${pkR},${pkG},${pkB}); corner ${koR},${koG},${koB}`)

    const shake = join(dir, 'shake.mp4')
    const shMk = await runFfmpeg(ffmpeg, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=800x450:d=2:r=30',
      '-vf',
      `drawbox=x=200:y=120:w=120:h=80:c=red:t=fill,drawbox=x=500:y=200:w=80:h=120:c=blue:t=fill,drawbox=x=350:y=80:w=40:h=40:c=yellow:t=fill,crop=640:360:x='80+24*sin(2*PI*n/30)':y=45,format=yuv420p`,
      '-c:v',
      'libx264',
      '-crf',
      '0',
      '-g',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-an',
      shake
    ])
    if (shMk.code !== 0) throw new Error(`shake source: ${shMk.stderr.slice(-400)}`)
    const shakeAsset = {
      id: 'shake',
      name: 'shake.mp4',
      path: shake,
      kind: 'video' as const,
      durationMs: 2000,
      width: 640,
      height: 360,
      fps: 30,
      importedAt: new Date().toISOString()
    }
    function shakeProject(on: boolean): Project {
      return {
        ...project,
        assets: [...project.assets, shakeAsset],
        timeline: {
          ...emptyTimeline(),
          storyline: [
            clip({
              id: 'sh',
              assetId: 'shake',
              inMs: 0,
              outMs: 2000,
              durationMs: 2000,
              fx: { stabilize: { enabled: on, amount: 0.5 } }
            })
          ]
        }
      }
    }
    const rawShake = shakeProject(false)
    const stabShake = shakeProject(true)
    const gStab = buildGraph(stabShake, {
      width: 640,
      height: 360,
      fps: 30,
      alpha: false,
      streams: new Map([[shake, { hasVideo: true, hasAudio: false }]])
    })
    assert(gStab.filter.includes('deshake'), 'deshake in graph')
    const outRaw = join(dir, 'shake-raw.mp4')
    const outStab = join(dir, 'shake-stab.mp4')
    await renderTimeline(rawShake, outRaw, '1080p')
    await renderTimeline(stabShake, outStab, '1080p')
    async function redCentroidX(file: string, n: number): Promise<number> {
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        file,
        '-vf',
        `select=eq(n\\,${n}),format=rgb24`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1'
      ])
      const buf = r.stdout
      const w = 640
      const h = 360
      if (buf.length < w * h * 3) throw new Error(`stab frame ${file} n=${n} len=${buf.length}: ${r.stderr.slice(-300)}`)
      let sx = 0
      let c = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3
          if (buf[i] > 180 && buf[i + 1] < 80 && buf[i + 2] < 80) {
            sx += x
            c++
          }
        }
      }
      if (!c) throw new Error(`no red blob in ${file} n=${n}`)
      return sx / c
    }
    const ns = [1, 8, 15, 22]
    const rawXs = []
    const stXs = []
    for (const n of ns) {
      rawXs.push(await redCentroidX(outRaw, n))
      stXs.push(await redCentroidX(outStab, n))
    }
    const rawSpan = Math.max(...rawXs) - Math.min(...rawXs)
    const stSpan = Math.max(...stXs) - Math.min(...stXs)
    assert(rawSpan > 24, `unsteady clip should swing, span=${rawSpan.toFixed(1)}`)
    assert(stSpan < rawSpan * 0.8, `stabilize should reduce motion ${rawSpan.toFixed(1)} → ${stSpan.toFixed(1)}`)
    console.log(`ffmpeg: stabilize x-span ${rawSpan.toFixed(1)} → ${stSpan.toFixed(1)}`)

    const volP: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'vol',
            assetId: 'red',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            volume: 1,
            fx: {
              keys: {
                volume: [
                  { t: 0, value: 0.12, ease: 'linear' },
                  { t: 1, value: 1, ease: 'linear' }
                ]
              }
            }
          })
        ]
      }
    }
    const gVol = buildGraph(volP, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(gVol.filter.includes('eval=frame'), 'volume keys in graph')
    const outVol = join(dir, 'vol.mp4')
    await renderTimeline(volP, outVol, '1080p')
    async function meanDb(file: string, ss: number, len: number): Promise<number> {
      const r = await runFfmpeg(ffmpeg, [
        '-i',
        file,
        '-ss',
        ss.toFixed(2),
        '-t',
        len.toFixed(2),
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-'
      ])
      const m = /mean_volume:\s*([-0-9.]+)/.exec(r.stderr)
      if (!m) throw new Error(`volumedetect failed: ${r.stderr.slice(-300)}`)
      return Number(m[1])
    }
    const quiet = await meanDb(outVol, 0.12, 0.3)
    const loud = await meanDb(outVol, 1.55, 0.3)
    assert(loud > quiet + 6, `volume keys should rise, ${quiet.toFixed(1)}dB → ${loud.toFixed(1)}dB`)
    console.log(`ffmpeg: volume keys ${quiet.toFixed(1)}dB → ${loud.toFixed(1)}dB`)

    const audioClip = clip({ id: 'aud', assetId: 'red', inMs: 0, outMs: 2000, durationMs: 2000, startMs: 0 })
    const vis = clip({
      id: 'pulse',
      assetId: 'red',
      inMs: 0,
      outMs: 2000,
      durationMs: 2000,
      startMs: 0,
      fx: {
        scale: 0.35,
        posX: 0.5,
        posY: 0.5,
        audioLink: { prop: 'scale', amount: 0.7 },
        keys: { scale: beatScaleKeys([0, 500, 1000, 1500], audioClip, clip({ id: 'pulse', assetId: 'red', durationMs: 2000, startMs: 0 }), 0.7, 0.35) }
      }
    })
    const beatP: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [clip({ id: 'base', assetId: 'blue', inMs: 0, outMs: 2000, durationMs: 2000 })],
        overlays: [vis]
      }
    }
    const liveBeat = fxAt(vis, 40).scale
    const liveOff = fxAt(vis, 280).scale
    assert(liveBeat > liveOff + 0.08, `beat scale preview ${liveBeat.toFixed(2)} vs ${liveOff.toFixed(2)}`)
    const outBeat = join(dir, 'beat.mp4')
    await renderTimeline(beatP, outBeat, '1080p')
    const onPx = await sampleFile(outBeat, 180, 180, 0.04)
    const offPx = await sampleFile(outBeat, 180, 180, 0.28)
    assert(onPx[0] > 120 && onPx[0] > onPx[2], `beat-on pixel should be red, got ${onPx}`)
    assert(offPx[2] > 80 && offPx[2] > offPx[0], `beat-off pixel should be blue, got ${offPx}`)
    console.log(`ffmpeg: beat-follow on ${onPx} off ${offPx}; preview scale ${liveBeat.toFixed(2)}→${liveOff.toFixed(2)}`)

    const denP: Project = {
      ...project,
      timeline: {
        ...emptyTimeline(),
        storyline: [
          clip({
            id: 'dn',
            assetId: 'red',
            inMs: 0,
            outMs: 2000,
            durationMs: 2000,
            fx: { denoise: { enabled: true, amount: 0.6 } }
          })
        ]
      }
    }
    const gDen = buildGraph(denP, { width: 640, height: 360, fps: 30, alpha: false, streams })
    assert(gDen.filter.includes('afftdn'), 'afftdn in graph')
    const outDen = join(dir, 'denoise.mp4')
    await renderTimeline(denP, outDen, '1080p')
    const denDur = await runFfmpeg(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      outDen
    ])
    const ddur = Number(denDur.stdout.toString().trim())
    assert(ddur > 1.5 && ddur < 2.4, `denoise export duration ${ddur}`)
    console.log(`ffmpeg: denoise afftdn ${ddur.toFixed(2)}s`)

    async function probeStream(file: string, entries: string): Promise<string> {
      const r = await runFfmpeg(ffprobe, [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        entries,
        '-of',
        'default=nw=1:nk=1',
        file
      ])
      return r.stdout.toString().trim()
    }
    const outH264 = join(dir, 'h264.mp4')
    await renderTimeline(project, outH264, '1080p')
    const codec = await probeStream(outH264, 'stream=codec_name')
    const h264Pix = await probeStream(outH264, 'stream=pix_fmt')
    assert(codec === 'h264', `1080p should be h264, got ${codec}`)
    assert(h264Pix === 'yuv420p', `h264 pix_fmt ${h264Pix}`)
    console.log(`ffmpeg: h264 ${codec} ${h264Pix}`)

    const outAlpha = join(dir, 'alpha.mov')
    await renderTimeline(project, outAlpha, 'alpha')
    const apix = await probeStream(outAlpha, 'stream=pix_fmt')
    assert(/yuva|argb|rgba|gbrap/i.test(apix), `alpha should keep transparency, pix_fmt=${apix}`)
    console.log(`ffmpeg: alpha pix_fmt ${apix}`)

    const outPro = join(dir, 'prores.mov')
    await renderTimeline(project, outPro, 'prores')
    const pcodec = await probeStream(outPro, 'stream=codec_name')
    assert(pcodec === 'prores', `prores codec ${pcodec}`)
    console.log(`ffmpeg: prores ${pcodec}`)

    const proxy = join(dir, 'proxy.mp4')
    const pz = await writeProxyFile(ffmpeg, red, proxy, 640, 360)
    assert(pz.width === 320 && pz.height === 180, `proxy size ${pz.width}x${pz.height}`)
    const pw = await probeStream(proxy, 'stream=width')
    const ph = await probeStream(proxy, 'stream=height')
    assert(Number(pw) === 320 && Number(ph) === 180, `proxy probe ${pw}x${ph}`)
    console.log(`ffmpeg: proxy ${pw}x${ph}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  unitTests()
  await ffmpegTests()
  console.log('compose verify ok (phase 1–9)')
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
