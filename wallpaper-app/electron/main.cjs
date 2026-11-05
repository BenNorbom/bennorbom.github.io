const { app, BrowserWindow, Menu, Tray, nativeImage, net, powerMonitor, protocol, screen, session } = require('electron')
const path = require('node:path')
const { writeFile } = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const { attachToDesktop, watchDesktopVisibility } = require('./wallpaper.cjs')
const { setLockScreenImage } = require('./lockScreen.cjs')
const { enableLogonStartup, disableLogonStartup, logonStartupEnabled } = require('./startup.cjs')

protocol.registerSchemesAsPrivileged([
  { scheme: 'bhwallpaper', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const smoke = process.argv.includes('--smoke')
if (smoke && process.env.BH_SMOKE_USER_DATA) {
  app.setPath('userData', process.env.BH_SMOKE_USER_DATA)
}

const securityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'"
const iconFile = path.join(app.getAppPath(), 'build', 'icon.png')
const pageUrl = query => `bhwallpaper://app/index.html${query}`
const webPreferences = {
  preload: path.join(__dirname, 'preload.cjs'),
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  backgroundThrottling: false,
}

// Wallpaper window sits behind desktop icons (permanently occluded to Chromium), so disable background throttling.
for (const flag of [
  'disable-background-timer-throttling',
  'disable-renderer-backgrounding',
  'disable-backgrounding-occluded-windows',
  'high-dpi-support=1',
]) {
  app.commandLine.appendSwitch(flag)
}
app.setAppUserModelId('com.bennorbom.blackhole.wallpaper')

let wallpaperWindow = null
let tray = null
let startupOn = false

function serveApplication() {
  const root = path.join(app.getAppPath(), 'dist')
  protocol.handle('bhwallpaper', async request => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 })
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 })
      const response = await net.fetch(pathToFileURL(target).toString())
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', securityPolicy)
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  )
}

function harden(window) {
  window.removeMenu()
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
}

function openWallpaperWindow() {
  if (wallpaperWindow && !wallpaperWindow.isDestroyed()) return wallpaperWindow
  const bounds = screen.getPrimaryDisplay().bounds
  wallpaperWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'Black Hole Wallpaper',
    backgroundColor: '#040507',
    show: false,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    icon: iconFile,
    webPreferences,
  })
  harden(wallpaperWindow)
  wallpaperWindow.setIgnoreMouseEvents(true)
  const window = wallpaperWindow
  let covered = !smoke
  let stopWatching = () => {}
  const publishVisibility = () => {
    if (!window.isDestroyed()) window.webContents.send('bhwallpaper:paused', covered)
  }
  window.webContents.on('did-finish-load', publishVisibility)
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed() && !smoke) {
      setTimeout(() => {
        if (!window.isDestroyed()) window.loadURL(pageUrl(''))
      }, 1500)
    }
  })
  wallpaperWindow.once('ready-to-show', async () => {
    wallpaperWindow.showInactive()
    if (smoke) return
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!wallpaperWindow || wallpaperWindow.isDestroyed()) return
      if (await attachToDesktop(window, attempt === 19)) {
        if (window.isDestroyed()) return
        stopWatching = watchDesktopVisibility(window, paused => {
          covered = paused
          publishVisibility()
        })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    console.error('Desktop wallpaper layer unavailable; exiting.')
    app.quit()
  })
  wallpaperWindow.on('closed', () => {
    stopWatching()
    wallpaperWindow = null
  })
  wallpaperWindow.loadURL(pageUrl(smoke ? '?test=1' : ''))
  return wallpaperWindow
}

function refitWallpaper() {
  if (!wallpaperWindow || wallpaperWindow.isDestroyed() || smoke) return
  try {
    const bounds = screen.getPrimaryDisplay().bounds
    wallpaperWindow.setBounds(bounds)
  } catch {}
  void attachToDesktop(wallpaperWindow)
}

async function waitForRenderer(contents) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await contents.executeJavaScript('!!window.__bhWallpaperReady')) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('renderer did not start')
}

async function refreshLockScreen() {
  if (process.platform !== 'win32') return false
  const bounds = screen.getPrimaryDisplay().bounds
  const still = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    thickFrame: false,
    backgroundColor: '#040507',
    webPreferences,
  })
  try {
    harden(still)
    const loaded = new Promise((resolve, reject) => {
      still.webContents.once('did-finish-load', resolve)
      still.webContents.once('did-fail-load', (_e, _c, desc) => reject(new Error(desc)))
    })
    still.loadURL(pageUrl('?test=1&time=100'))
    await loaded
    await waitForRenderer(still.webContents)
    const image = await still.webContents.capturePage()
    if (image.isEmpty()) throw new Error('captured frame was empty')
    const file = path.join(app.getPath('userData'), 'lock-screen.jpg')
    await writeFile(file, image.toJPEG(92))
    return await setLockScreenImage(file)
  } catch (error) {
    console.error('Lock screen update failed:', error.message)
    return false
  } finally {
    if (!still.isDestroyed()) still.destroy()
  }
}

async function setStartup(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return
  startupOn = enabled ? await enableLogonStartup(process.execPath) : !(await disableLogonStartup())
  app.setLoginItemSettings({ openAtLogin: false, path: process.execPath })
  refreshTray()
}

function refreshTray() {
  if (!tray) return
  tray.setToolTip('Black Hole Wallpaper — Asterion Kerr Passage')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Black Hole Wallpaper (Active)', enabled: false },
      { type: 'separator' },
      { label: 'Refresh lock screen image', click: () => void refreshLockScreen() },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: startupOn,
        enabled: app.isPackaged,
        click: item => void setStartup(item.checked),
      },
      { type: 'separator' },
      { label: 'Stop wallpaper', click: () => app.quit() },
    ]),
  )
}

function createTray() {
  const image = nativeImage.createFromPath(iconFile)
  if (image.isEmpty()) return
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.on('click', () => tray.popUpContextMenu())
  refreshTray()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    openWallpaperWindow()
    refitWallpaper()
  })
  app.whenReady().then(() => {
    serveApplication()
    openWallpaperWindow()
    if (!smoke) {
      createTray()
      void logonStartupEnabled().then(enabled => {
        startupOn = enabled
        refreshTray()
        if (!enabled) void setStartup(true)
      })
      void refreshLockScreen()
    }
    screen.on('display-metrics-changed', refitWallpaper)
    screen.on('display-added', refitWallpaper)
    screen.on('display-removed', refitWallpaper)
    powerMonitor.on('resume', refitWallpaper)
    powerMonitor.on('unlock-screen', refitWallpaper)
  })
  app.on('window-all-closed', () => app.quit())
}
