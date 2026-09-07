import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src-tauri/resources')

rmSync(join(dest, 'sidecar'), { recursive: true, force: true })
rmSync(join(dest, 'cli'), { recursive: true, force: true })
mkdirSync(join(dest, 'sidecar/node_modules'), { recursive: true })

cpSync(join(root, 'out/sidecar/index.js'), join(dest, 'sidecar/index.js'))
cpSync(join(root, 'src/cli'), join(dest, 'cli'), { recursive: true })

for (const pkg of ['node-pty', 'node-addon-api']) {
  const src = join(root, 'node_modules', pkg)
  if (existsSync(src)) cpSync(src, join(dest, 'sidecar/node_modules', pkg), { recursive: true })
}

const nodeCandidates = [
  process.execPath,
  '/usr/local/bin/node',
  join(homedir(), 'homebrew/bin/node'),
  '/opt/homebrew/bin/node'
]
const nodeSrc = nodeCandidates.find((p) => existsSync(p))
if (nodeSrc) {
  cpSync(nodeSrc, join(dest, 'node'))
  try {
    execFileSync('chmod', ['+x', join(dest, 'node')])
  } catch {
    /* ignore */
  }
  console.log('bundled node from', nodeSrc)
} else {
  console.warn('no node binary to bundle; production app will look up node on PATH')
}
