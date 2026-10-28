param([switch]$Once)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$state = Join-Path $repo '.automation'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$log = Join-Path $state 'sync.log'
$lock = $null

function Write-Log([string]$Message) {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) {
        Move-Item -LiteralPath $log -Destination "$log.old" -Force
    }
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
}

function Invoke-Git([string[]]$GitArgs) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & git -C $repo @GitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $saved
    if ($code -ne 0) { throw "git $($GitArgs -join ' '): $($output -join ' ')" }
    return ($output -join "`n")
}

try {
    try {
        $lock = [System.IO.File]::Open((Join-Path $state 'sync.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch [System.IO.IOException] { exit 0 }
    Set-Content -LiteralPath (Join-Path $state 'sync.pid') -Value $PID
    Write-Log 'Sincronizacao iniciada. Destino: origin/main.'
    $previous = $null
    $lastPush = [datetime]::MinValue
    do {
        try {
            $branch = Invoke-Git @('branch', '--show-current')
            if ($branch -ne 'main') { throw 'Sincronizacao pausada: a branch atual precisa ser main.' }
            foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'index.lock')) {
                $markerPath = Invoke-Git @('rev-parse', '--git-path', $marker)
                if (-not [IO.Path]::IsPathRooted($markerPath)) { $markerPath = Join-Path $repo $markerPath }
                if (Test-Path -LiteralPath $markerPath) { throw "Git ocupado ($marker). Aguardando." }
            }
            $status = Invoke-Git @('status', '--porcelain=v1', '--untracked-files=all')
            # Wait for two matching snapshots so a save burst produces one commit.
            if ($status -and ($Once -or $status -eq $previous)) {
                Invoke-Git @('add', '--all') | Out-Null
                $staged = Invoke-Git @('diff', '--cached', '--name-only')
                if ($staged) {
                    Invoke-Git @('commit', '-m', "Atualizacao automatica $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')") | Out-Null
                    Write-Log 'Alteracoes salvas em commit.'
                    $lastPush = [datetime]::MinValue
                }
            }
            $previous = $status
            if (((Get-Date) - $lastPush).TotalSeconds -ge 60) {
                # Never force push or merge remote changes without review.
                $lastPush = Get-Date
                Invoke-Git @('push', 'origin', 'main') | Out-Null
                Write-Log 'GitHub sincronizado.'
            }
        } catch {
            Write-Log "Aguardando nova tentativa: $_"
            if ($Once) { throw }
        }
        if (-not $Once) { Start-Sleep -Seconds 5 }
    } while (-not $Once -and -not (Test-Path (Join-Path $state 'stop')))
} finally {
    if ($lock) {
        Remove-Item -LiteralPath (Join-Path $state 'sync.pid') -Force -ErrorAction SilentlyContinue
        $lock.Dispose()
    }
}
