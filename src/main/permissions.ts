import { app, dialog, shell, systemPreferences, session, BrowserWindow } from 'electron'
import { store } from './core'

function folderPath(name: 'home' | 'documents' | 'desktop' | 'downloads' | 'videos'): string {
  try {
    return app.getPath(name)
  } catch {
    return app.getPath('home')
  }
}

export async function requestFullAccess(win?: BrowserWindow): Promise<void> {
  const target = win && !win.isDestroyed() ? win : undefined
  const intro = await dialog.showMessageBox(target, {
    type: 'info',
    title: '剪辑台需要完整文件权限',
    message: '首次启动需要授权，避免系统隐私设置拦住终端里的 AI 改工程和素材。',
    detail:
      '接下来会：\n1. 打开「完全磁盘访问」设置，请把剪辑台或 Electron 打开并勾选。\n2. 依次授权影片、文稿、桌面、下载文件夹。\n3. 如弹出辅助功能权限，请允许。\n\n授权完成后，终端中的 grok / claude 等才能用 cutstudio 读写当前项目。',
    buttons: ['开始授权', '以后再说'],
    defaultId: 0,
    cancelId: 1
  })
  if (intro.response !== 0) return

  const fdaUrls = [
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
  ]
  for (const url of fdaUrls) {
    try {
      await shell.openExternal(url)
      break
    } catch {
      /* try next */
    }
  }

  await dialog.showMessageBox(target, {
    type: 'info',
    message: '请在系统设置中勾选剪辑台（或 Electron）的「完全磁盘访问」，然后回到本窗口点继续。',
    buttons: ['已勾选，继续']
  })

  const folders: { title: string; path: string }[] = [
    { title: '授权访问「影片」文件夹', path: folderPath('videos') },
    { title: '授权访问「文稿」文件夹', path: folderPath('documents') },
    { title: '授权访问「桌面」文件夹', path: folderPath('desktop') },
    { title: '授权访问「下载」文件夹', path: folderPath('downloads') }
  ]
  for (const folder of folders) {
    await dialog.showOpenDialog(target, {
      title: folder.title,
      message: folder.title + '（选中后点打开即可，终端 AI 才能读写这里的成片）',
      defaultPath: folder.path,
      properties: ['openDirectory', 'createDirectory']
    })
  }

  try {
    systemPreferences.isTrustedAccessibilityClient(true)
  } catch {
    /* ignore */
  }

  store.settings.firstRunComplete = true
  await store.saveSettings()
  store.broadcast()
}

export function allowAllWebPermissions(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  ses.setPermissionCheckHandler(() => true)
}
