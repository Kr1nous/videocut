import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, TimelineOp } from '../shared/types'

const api = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb: (state: unknown) => void) => {
    const listener = (_e: unknown, state: unknown) => cb(state)
    ipcRenderer.on('state:changed', listener)
    return () => ipcRenderer.removeListener('state:changed', listener)
  },
  getTheme: () => ipcRenderer.invoke('theme:get') as Promise<{ dark: boolean }>,
  onTheme: (cb: (theme: { dark: boolean }) => void) => {
    const listener = (_e: unknown, theme: { dark: boolean }) => cb(theme)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  },
  onMenu: (cb: (action: string) => void) => {
    const events = ['menu:new', 'menu:open', 'menu:import', 'menu:terminal']
    const listeners = events.map((ev) => {
      const fn = () => cb(ev)
      ipcRenderer.on(ev, fn)
      return [ev, fn] as const
    })
    return () => listeners.forEach(([ev, fn]) => ipcRenderer.removeListener(ev, fn))
  },
  createProject: (name?: string) =>
    name ? ipcRenderer.invoke('project:createNamed', name) : ipcRenderer.invoke('project:create'),
  openProject: () => ipcRenderer.invoke('project:open'),
  renameProject: (name: string) => ipcRenderer.invoke('project:rename', name),
  importMedia: () => ipcRenderer.invoke('media:import'),
  importPaths: (paths: string[]) => ipcRenderer.invoke('media:importPaths', paths),
  deleteAsset: (assetId: string) => ipcRenderer.invoke('media:delete', String(assetId)),
  updateAssetMeta: (assetId: string, meta: object) => ipcRenderer.invoke('media:updateMeta', assetId, meta),
  saveThumb: (assetId: string, dataUrl: string) => ipcRenderer.invoke('media:thumb', assetId, dataUrl),
  exportTimeline: (preset?: string) => ipcRenderer.invoke('media:export', preset),
  runAction: (name: string, args: Record<string, unknown> = {}) => ipcRenderer.invoke('action:run', name, args),
  applyOps: (ops: TimelineOp[], summary?: string) => ipcRenderer.invoke('timeline:ops', ops, summary),
  undo: () => ipcRenderer.invoke('timeline:undo'),
  redo: () => ipcRenderer.invoke('timeline:redo'),
  restore: (id: string) => ipcRenderer.invoke('timeline:restore', id),
  runAi: (prompt: string, frames: { mime: string; data: string }[] = []) =>
    ipcRenderer.invoke('ai:run', prompt, frames),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  mcpStatus: () => ipcRenderer.invoke('mcp:status'),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:show', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  requestPermissions: () => ipcRenderer.invoke('permissions:request'),
  terminalStart: (cols: number, rows: number) => ipcRenderer.invoke('terminal:start', cols, rows),
  terminalRestart: (cols: number, rows: number) => ipcRenderer.invoke('terminal:restart', cols, rows),
  terminalWrite: (data: string) => ipcRenderer.send('terminal:write', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
  onTerminalData: (cb: (data: string) => void) => {
    const listener = (_e: unknown, data: string) => cb(data)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (cb: (code: number) => void) => {
    const listener = (_e: unknown, code: number) => cb(code)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  }
}

contextBridge.exposeInMainWorld('cut', api)

export type CutApi = typeof api
