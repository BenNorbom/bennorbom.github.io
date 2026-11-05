; Cleanup per-user scheduled logon task on uninstall.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.bennorbom.blackhole.wallpaper"
  nsExec::ExecToLog 'schtasks /Delete /TN "Black Hole Wallpaper" /F'
!macroend
