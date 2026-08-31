Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$LogPath = Join-Path $RepositoryRoot '.refresh-log.txt'
$AllowedPaths = @(
  'data/asu_alumni_fallback.json'
  'data/asu_transfers_fallback.json'
  'data/asu_recruiting_fallback.json'
  'data/nchc_standings_fallback.json'
)

function Write-RefreshLog([string]$Message) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} - {1}' -f (Get-Date), $Message
  Write-Host $line
  Add-Content -LiteralPath $LogPath -Value $line
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  Write-RefreshLog ("Running: {0} {1}" -f $FilePath, ($Arguments -join ' '))
  Get-Command -Name $FilePath -ErrorAction Stop | Out-Null
  $previousErrorActionPreference = $ErrorActionPreference
  $outputLines = @()
  $errorLines = @()
  $stdoutPath = $null
  $stderrPath = $null
  $primaryError = $null
  $cleanupError = $null
  $nativeFailureMessage = $null

  try {
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments 1> $stdoutPath 2> $stderrPath
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      $nativeFailureMessage = "$FilePath exited with code $exitCode"
    }

    try {
      $outputLines = @(Get-Content -LiteralPath $stdoutPath -ErrorAction Stop)
    } catch {
      $primaryError = $_
    }

    try {
      $errorLines = @(Get-Content -LiteralPath $stderrPath -ErrorAction Stop)
    } catch {
      if ($null -eq $primaryError) {
        $primaryError = $_
      }
    }
  } catch {
    $primaryError = $_
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    foreach ($capturePath in @($stdoutPath, $stderrPath)) {
      if ($null -eq $capturePath) {
        continue
      }

      try {
        [System.IO.File]::Delete($capturePath)
      } catch {
        if ($null -eq $cleanupError) {
          $cleanupError = $_
        }
      }
    }
  }

  foreach ($line in @($outputLines) + @($errorLines)) {
    Write-RefreshLog $line
  }

  if ($null -ne $nativeFailureMessage) {
    throw $nativeFailureMessage
  }

  if ($null -ne $primaryError) {
    throw $primaryError
  }

  if ($null -ne $cleanupError) {
    throw $cleanupError
  }

  return $outputLines
}

function Assert-AllowedChanges([string[]]$Paths) {
  $arguments = @('scripts/validate-refresh-changes.js') + @($Paths)
  Invoke-Native 'node.exe' $arguments | Out-Null
}

function Assert-GeneratedJsonFiles([string]$Root = $RepositoryRoot) {
  foreach ($relativePath in $AllowedPaths) {
    $filePath = Join-Path $Root $relativePath
    try {
      Get-Content -Raw -LiteralPath $filePath |
        ConvertFrom-Json -ErrorAction Stop | Out-Null
    } catch {
      throw "Generated JSON file is invalid: $relativePath ($($_.Exception.Message))"
    }
  }
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

function Sync-RemoteRefreshBranch {
  $branchRef = 'refs/heads/auto/data-refresh'
  $trackingRef = 'refs/remotes/origin/auto/data-refresh'
  $remoteLines = @(
    Invoke-Native 'git.exe' @(
      'ls-remote'
      '--refs'
      'origin'
      $branchRef
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )

  if ($remoteLines.Count -eq 0) {
    Invoke-Native 'git.exe' @('update-ref', '-d', $trackingRef) | Out-Null
    return ''
  }

  $remoteMatch = [regex]::Match(
    $remoteLines[0],
    '^(?<oid>[0-9a-fA-F]{40,64})\s+refs/heads/auto/data-refresh$'
  )
  if (-not $remoteMatch.Success) {
    throw "Unable to parse remote refresh branch: $($remoteLines[0])"
  }

  Invoke-Native 'git.exe' @(
    'fetch'
    '--prune'
    'origin'
    "+${branchRef}:${trackingRef}"
  ) | Out-Null

  $fetchedOid = @(
    Invoke-Native 'git.exe' @('rev-parse', '--verify', $trackingRef) |
      Where-Object { $_ -match '^[0-9a-fA-F]{40,64}$' }
  ) | Select-Object -Last 1
  if ([string]::IsNullOrWhiteSpace($fetchedOid)) {
    throw "Unable to resolve fetched refresh branch: $trackingRef"
  }

  return $fetchedOid
}

if ($MyInvocation.InvocationName -eq '.') {
  return
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
  $expectedRefreshOid = Sync-RemoteRefreshBranch
  Invoke-Native 'git.exe' @(
    'switch'
    '--force-create'
    'auto/data-refresh'
    'origin/main'
  ) | Out-Null

  Invoke-Native 'node.exe' @('scripts/verify-node-runtime.js') | Out-Null
  Invoke-Native 'npm.cmd' @('ci') | Out-Null
  Invoke-Native 'npm.cmd' @('run', 'refresh-data') | Out-Null

  Invoke-Native 'npx.cmd' @(
    'jest'
    '--config'
    'jest.server.config.js'
    '__tests__/recruiting-scraper.test.js'
    '__tests__/refresh-recruiting.test.js'
    '__tests__/refresh-standings.test.js'
    '--runInBand'
  ) | Out-Null
  Invoke-Native 'npx.cmd' @(
    'jest'
    '--config'
    'jest.server.config.js'
    '--runInBand'
  ) | Out-Null

  Assert-GeneratedJsonFiles
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
    "--force-with-lease=refs/heads/auto/data-refresh:$expectedRefreshOid"
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
