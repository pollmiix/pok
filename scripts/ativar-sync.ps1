param([switch]$InstallStartup)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$state = Join-Path $repo '.automation'
New-Item -ItemType Directory -Path $state -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $state 'stop') -Force -ErrorAction SilentlyContinue
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$worker = Join-Path $PSScriptRoot 'auto-sync.ps1'

if ($InstallStartup) {
    $startup = [Environment]::GetFolderPath('Startup')
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $startup 'Walk Cards - GitHub automatico.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
    $shortcut.WorkingDirectory = $repo
    $shortcut.WindowStyle = 7
    $shortcut.Save()
}

Start-Process -FilePath $powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$worker`"" -WorkingDirectory $repo -WindowStyle Hidden
Write-Output "Sincronizacao automatica ativada. Registro: $state\sync.log"
