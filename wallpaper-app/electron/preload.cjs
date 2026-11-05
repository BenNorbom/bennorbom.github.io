const { contextBridge, ipcRenderer } = require('electron')

let wallpaperPaused = false
const pauseListeners = new Set()
ipcRenderer.on('bhwallpaper:paused', (_event, paused) => {
  if (typeof paused !== 'boolean') return
  wallpaperPaused = paused
  for (const listener of pauseListeners) listener(paused)
})

contextBridge.exposeInMainWorld('bhWallpaperDesktop', {
  onWallpaperPause: listener => {
    pauseListeners.add(listener)
    listener(wallpaperPaused)
    return () => pauseListeners.delete(listener)
  },
})
