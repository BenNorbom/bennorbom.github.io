const { execFile } = require('node:child_process')
const path = require('node:path')

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const taskName = 'Black Hole Wallpaper'
const single = value => value.replace(/'/g, "''")

const registerScript = executable => `
$ErrorActionPreference = 'Stop'
$user = "$env:USERDOMAIN\\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute '${single(executable)}'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = 'PT20S'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName '${taskName}' -Description 'Runs the Kerr Black Hole live desktop wallpaper.' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
`

const removeScript = `Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false -ErrorAction SilentlyContinue`
const queryScript = `if (Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue) { Write-Output 'enabled' }`

function run(script) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ ok: false, output: '' })
    execFile(
      powershell,
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) console.error('Startup task command failed:', String(stderr).trim() || error.message)
        resolve({ ok: !error, output: String(stdout).trim() })
      },
    )
  })
}

const enableLogonStartup = executable => run(registerScript(executable)).then(result => result.ok)
const disableLogonStartup = () => run(removeScript).then(result => result.ok)
const logonStartupEnabled = () => run(queryScript).then(result => result.output === 'enabled')

module.exports = { enableLogonStartup, disableLogonStartup, logonStartupEnabled }
