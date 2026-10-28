$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$state = Join-Path $repo '.automation'
New-Item -ItemType Directory -Path $state -Force | Out-Null
Set-Content -LiteralPath (Join-Path $state 'stop') -Value 'stop'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Walk Cards - GitHub automatico.lnk'
Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
Write-Output 'Sincronizacao desativada. O processo encerra ao concluir a operacao atual.'
