import * as esbuild from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('out/sidecar', { recursive: true })

await esbuild.build({
  entryPoints: ['src/main/sidecar.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'out/sidecar/index.js',
  target: 'node20',
  external: ['node-pty'],
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"
  },
  logLevel: 'info'
})
