import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, net, nativeTheme, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { store } from './core'
import { runAgent } from './ai/agent'
import { runAction } from './actions'
import { saveThumbDataUrl, exportTimeline } from './media'
import { startMcpHttp, mcpStatus } from './mcp/http'
import { mcpConfigSnippet } from './mcp/protocol'
import { registerTerminalIpc, stopTerminal } from './terminal'
import { allowAllWebPermissions, requestFullAccess } from './permissions'
import type { AppSettings, TimelineOp } from '../shared/types'

app.commandLine.appendSwitch('allow-file-access-from-files')
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cutmedia',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: '剪辑台',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#e7e9ee',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })
  store.attach(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function setupMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建项目…',
          accelerator: 'CmdOrCtrl+N',
          click: () => BrowserWindow.getFocusedWebContents()?.send('menu:new')
        },
        {
          label: '打开项目…',
          accelerator: 'CmdOrCtrl+O',
          click: () => BrowserWindow.getFocusedWebContents()?.send('menu:open')
        },
        { type: 'separator' },
        {
          label: '导入素材…',
          accelerator: 'CmdOrCtrl+I',
          click: () => BrowserWindow.getFocusedWebContents()?.send('menu:import')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => store.undoLast() },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', click: () => store.redoLast() },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: '显示',
      submenu: [
        {
          label: '终端',
          accelerator: 'CmdOrCtrl+`',
          click: () => BrowserWindow.getFocusedWebContents()?.send('menu:terminal')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  protocol.handle('cutmedia', (request) => {
    const u = new URL(request.url)
    const filePath = decodeURIComponent(u.pathname)
    return net.fetch(pathToFileURL(filePath).href)
  })

  nativeTheme.themeSource = 'system'
  allowAllWebPermissions()
  await store.loadSettings(app.getPath('userData'))
  try {
    await startMcpHttp(store.settings.mcpPort)
  } catch (e) {
    console.error('MCP 端口占用', e)
  }

  setupMenu()
  registerTerminalIpc()
  const win = createWindow()
  win.webContents.once('did-finish-load', () => {
    if (!store.settings.firstRunComplete) {
      setTimeout(() => void requestFullAccess(win), 500)
    }
  })
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors
    const bg = dark ? '#1c1c1e' : '#e7e9ee'
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.setBackgroundColor(bg)
      win.webContents.send('theme:changed', { dark })
    }
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTerminal()
  if (process.platform !== 'darwin') app.quit()
})

function senderWindow(e: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(e.sender) ?? undefined
}

function defaultProjectDir(): string {
  for (const key of ['videos', 'documents', 'desktop', 'home'] as const) {
    try {
      return app.getPath(key)
    } catch {
      /* next */
    }
  }
  return app.getPath('userData')
}

function handleIpc(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, fn)
}

handleIpc('state:get', () => store.getState())
ipcMain.handle('theme:get', () => ({ dark: nativeTheme.shouldUseDarkColors }))

ipcMain.handle('project:create', async (e) => createProjectDialog(e, '未命名项目'))
ipcMain.handle('project:createNamed', async (e, name: string) => createProjectDialog(e, name))

async function createProjectDialog(e: Electron.IpcMainInvokeEvent, name: string) {
  const win = senderWindow(e)
  const safeName = (name || '未命名项目').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名项目'
  const opts: Electron.SaveDialogOptions = {
    title: '新建项目',
    defaultPath: join(defaultProjectDir(), `${safeName}.cutproj`),
    buttonLabel: '创建',
    nameFieldLabel: '项目名称',
    filters: [{ name: '剪辑台项目', extensions: ['cutproj'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  }
  const pick = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (pick.canceled || !pick.filePath) return null
  let dest = pick.filePath
  if (!dest.endsWith('.cutproj')) dest += '.cutproj'
  await store.createProject(dirname(dest), basename(dest, '.cutproj'))
  return store.getState()
}

ipcMain.handle('project:open', async (e) => {
  const win = senderWindow(e)
  const opts: Electron.OpenDialogOptions = {
    title: '打开 .cutproj 项目',
    properties: ['openDirectory'],
    defaultPath: defaultProjectDir()
  }
  const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (pick.canceled || !pick.filePaths[0]) return null
  await store.openProject(pick.filePaths[0])
  return store.getState()
})

ipcMain.handle('project:rename', async (_e, name: string) => {
  const p = store.requireProject()
  p.name = name
  await store.save()
  store.broadcast()
  return store.getState()
})

ipcMain.handle('media:import', async (e) => {
  const win = senderWindow(e)
  const opts: Electron.OpenDialogOptions = {
    title: '导入已录制的影片',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '媒体', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'png', 'jpg', 'jpeg'] }
    ]
  }
  const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (pick.canceled) return []
  return store.importFiles(pick.filePaths)
})

ipcMain.handle('media:importPaths', async (_e, paths: string[]) => store.importFiles(paths))
handleIpc('media:delete', async (_e, assetId) => store.deleteAsset(String(assetId)))
ipcMain.handle('media:updateMeta', async (_e, assetId: string, meta: object) => {
  await store.updateAssetMeta(assetId, meta)
})
ipcMain.handle('media:thumb', async (_e, assetId: string, dataUrl: string) => saveThumbDataUrl(assetId, dataUrl))
ipcMain.handle('media:export', async (_e, preset?: string) => exportTimeline(preset))
ipcMain.handle('action:run', async (_e, name: string, args: Record<string, unknown>) => {
  return runAction(name, args ?? {}, 'human')
})

ipcMain.handle('timeline:ops', async (_e, ops: TimelineOp[], summary?: string) => {
  return store.applyOps(ops, 'human', summary)
})
ipcMain.handle('timeline:undo', async () => store.undoLast())
ipcMain.handle('timeline:redo', async () => store.redoLast())
ipcMain.handle('timeline:restore', async (_e, snapshotId: string) => store.restoreSnapshot(snapshotId))

ipcMain.handle('ai:run', async (_e, prompt: string, frames: { mime: string; data: string }[]) => {
  return runAgent(prompt, frames ?? [])
})

ipcMain.handle('settings:update', async (_e, patch: Partial<AppSettings>) => {
  await store.updateSettings(patch)
  return store.getState()
})

ipcMain.handle('mcp:status', () => ({
  ...mcpStatus(),
  snippet: mcpConfigSnippet(mcpStatus().port)
}))

ipcMain.handle('shell:show', async (_e, filePath: string) => {
  shell.showItemInFolder(filePath)
})
ipcMain.handle('permissions:request', async (e) => {
  await requestFullAccess(senderWindow(e))
  return store.getState()
})
