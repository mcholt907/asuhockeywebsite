Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$LogPath = Join-Path $RepositoryRoot '.refresh-log.txt'
$AllowedPaths = @(
  'asu_hockey_data.json'
  'data/asu_recruiting_refresh_state.json'
  'data/asu_alumni_fallback.json'
  'data/asu_transfers_fallback.json'
)

function Write-RefreshLog([string]$Message) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} - {1}' -f (Get-Date), $Message
  Write-Host $line
  Add-Content -LiteralPath $LogPath -Value $line
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  Write-RefreshLog ("Running: {0} {1}" -f $FilePath, ($Arguments -join ' '))
  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $outputLines = @($output | ForEach-Object { "$_" })

  foreach ($line in $outputLines) {
    Write-RefreshLog $line
  }

  if ($exitCode -ne 0) {
    throw "$FilePath exited with code $exitCode"
  }

  return $outputLines
}

function Assert-AllowedChanges([string[]]$Paths) {
  $arguments = @('scripts/validate-refresh-changes.js') + @($Paths)
  Invoke-Native 'node.exe' $arguments | Out-Null
}

function Send-MonitorStatus(
  [ValidateSet('ok', 'error')]
  [string]$Status
) {
  try {
    Invoke-Native 'node.exe' @('scripts/ping-refresh-monitor.js', $Status) |
      Out-Null
  } catch {
    Write-RefreshLog (
      "Monitoring check-in failed nonfatally: {0}" -f $_.Exception.Message
    )
  }
}

function Get-TrackedWorkingPaths {
  return @(
    Invoke-Native 'git.exe' @('diff', '--name-only', '--') |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Get-StagedPaths {
  return @(
    Invoke-Native 'git.exe' @('diff', '--cached', '--name-only', '--') |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

try {
  Write-RefreshLog 'Refresh starting'
  Set-Location -LiteralPath $RepositoryRoot

  $markerPath = Join-Path $RepositoryRoot '.refresh-runner'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw "Dedicated refresh clone marker is missing: $markerPath"
  }

  $leftoverPaths = @(
    @(
      (Get-TrackedWorkingPaths)
      (Get-StagedPaths)
    ) | Sort-Object -Unique
  )
  Assert-AllowedChanges $leftoverPaths

  if ($leftoverPaths.Count -gt 0) {
    Write-RefreshLog 'Restoring allowlisted leftovers from a prior failed run'
    $restoreArguments = @(
      'restore'
      '--source=HEAD'
      '--staged'
      '--worktree'
      '--'
    ) + $leftoverPaths
    Invoke-Native 'git.exe' $restoreArguments | Out-Null
  }

  Invoke-Native 'git.exe' @('fetch', 'origin') | Out-Null
  Invoke-Native 'git.exe' @(
    'switch'
    '--force-create'
    'auto/data-refresh'
    'origin/main'
  ) | Out-Null

  Invoke-Native 'npm.cmd' @('run', 'refresh-data') | Out-Null

  Invoke-Native 'npx.cmd' @(
    'jest'
    '--config'
    'jest.server.config.js'
    '__tests__/recruiting-scraper.test.js'
    '__tests__/recruiting-refresh-service.test.js'
    '__tests__/refresh-recruiting-script.test.js'
    '--runInBand'
  ) | Out-Null
  Invoke-Native 'npx.cmd' @(
    'jest'
    '--config'
    'jest.server.config.js'
    '--runInBand'
  ) | Out-Null

  Get-Content -Raw -LiteralPath 'asu_hockey_data.json' |
    ConvertFrom-Json | Out-Null
  Get-Content -Raw -LiteralPath 'data/asu_recruiting_refresh_state.json' |
    ConvertFrom-Json | Out-Null
  Write-RefreshLog 'Generated JSON files parsed successfully'

  $workingPaths = @(Get-TrackedWorkingPaths)
  Assert-AllowedChanges $workingPaths

  if ($workingPaths.Count -eq 0) {
    Write-RefreshLog 'No data changes'
    Send-MonitorStatus 'ok'
    exit 0
  }

  $addArguments = @('add', '--') + $AllowedPaths
  Invoke-Native 'git.exe' $addArguments | Out-Null

  $stagedPaths = @(Get-StagedPaths)
  Assert-AllowedChanges $stagedPaths
  if ($stagedPaths.Count -eq 0) {
    throw 'Refresh produced changes, but no allowlisted paths were staged'
  }

  Invoke-Native 'git.exe' @(
    'commit'
    '-m'
    'data: refresh hockey datasets (automated)'
  ) | Out-Null
  Invoke-Native 'git.exe' @(
    'push'
    '--force-with-lease=auto/data-refresh'
    'origin'
    'auto/data-refresh:auto/data-refresh'
  ) | Out-Null

  $prUrl = @(
    Invoke-Native 'gh.exe' @(
      'pr'
      'list'
      '--head'
      'auto/data-refresh'
      '--base'
      'main'
      '--state'
      'open'
      '--json'
      'url'
      '--jq'
      '.[0].url'
    ) | Where-Object { $_ -match '^https://' }
  ) | Select-Object -First 1

  if ([string]::IsNullOrWhiteSpace($prUrl)) {
    $prUrl = @(
      Invoke-Native 'gh.exe' @(
        'pr'
        'create'
        '--head'
        'auto/data-refresh'
        '--base'
        'main'
        '--title'
        'data: refresh hockey datasets (automated)'
        '--body'
        'Automated hockey data refresh from the dedicated Windows runner.'
      ) | Where-Object { $_ -match '^https://' }
    ) | Select-Object -Last 1
  }

  if ([string]::IsNullOrWhiteSpace($prUrl)) {
    throw 'Unable to determine the refresh pull request URL'
  }

  Write-RefreshLog ("Refresh pull request: $prUrl")
  Invoke-Native 'gh.exe' @('pr', 'merge', $prUrl, '--auto', '--merge') |
    Out-Null

  Write-RefreshLog 'Refresh published and auto-merge enabled'
  Send-MonitorStatus 'ok'
  exit 0
} catch {
  Write-RefreshLog ("Refresh failed: {0}" -f $_.Exception.Message)
  Send-MonitorStatus 'error'
  exit 1
}
