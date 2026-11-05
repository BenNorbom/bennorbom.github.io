const { execFile } = require('node:child_process')
const path = require('node:path')

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

// Windows only accepts a still image for the lock screen. SetImageFileAsync is per-user and needs no elevation.
const applyScript = file => `
$ErrorActionPreference = 'Stop'
[void][Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asOperation = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
$asAction = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
$open = $asOperation.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @([Windows.Storage.StorageFile]::GetFileFromPathAsync('${file.replace(/'/g, "''")}')))
$open.Wait(-1) | Out-Null
$apply = $asAction.Invoke($null, @([Windows.System.UserProfile.LockScreen]::SetImageFileAsync($open.Result)))
$apply.Wait(-1) | Out-Null
`

/** Sets the Windows lock screen background to the given image. Resolves false when Windows declines. */
function setLockScreenImage(file) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(false)
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(applyScript(file), 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30_000 }, (error, _stdout, stderr) => {
        if (error) console.error('Lock screen update failed:', String(stderr).trim() || error.message)
        resolve(!error)
      })
  })
}

module.exports = { setLockScreenImage }
