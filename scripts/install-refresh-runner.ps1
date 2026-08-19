param(
  [string]$RunnerPath = (Join-Path $env:USERPROFILE 'asuhockeywebsite-refresh-runner'),
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentFile,
  [string]$TaskName = 'ASU Hockey Data Refresh'
)

function ConvertTo-NormalizedAbsolutePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw 'Path must not be empty.'
  }

  return [System.IO.Path]::GetFullPath($Path)
}

function Assert-PathHasNoReparsePoints {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $currentPath = ConvertTo-NormalizedAbsolutePath -Path $Path
  while ($null -ne $currentPath) {
    if (Test-Path -LiteralPath $currentPath) {
      $item = Get-Item -LiteralPath $currentPath -Force
      $isReparsePoint = (
        $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint
      ) -eq [System.IO.FileAttributes]::ReparsePoint
      if ($isReparsePoint) {
        throw "RunnerPath must not use a reparse point or junction: $currentPath"
      }
    }

    $parent = [System.IO.Directory]::GetParent($currentPath)
    $currentPath = if ($null -eq $parent) { $null } else { $parent.FullName }
  }
}

function Resolve-RefreshInstallerPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RunnerPath,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentFile,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot
  )

  $resolvedRunnerPath = ConvertTo-NormalizedAbsolutePath -Path $RunnerPath
  $resolvedRepositoryRoot = ConvertTo-NormalizedAbsolutePath -Path $RepositoryRoot
  $resolvedEnvironmentFile = ConvertTo-NormalizedAbsolutePath -Path $EnvironmentFile

  Assert-PathHasNoReparsePoints -Path $resolvedRunnerPath

  if (-not [System.IO.Path]::IsPathRooted($resolvedRunnerPath) -or
      -not [System.IO.Path]::IsPathRooted($resolvedEnvironmentFile)) {
    throw 'RunnerPath and EnvironmentFile must resolve to absolute paths.'
  }

  $runnerForComparison = $resolvedRunnerPath.TrimEnd('\', '/')
  $repositoryForComparison = $resolvedRepositoryRoot.TrimEnd('\', '/')
  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $runnerIsRepository = $runnerForComparison.Equals($repositoryForComparison, $comparison)
  $runnerIsRepositoryAncestor = $repositoryForComparison.StartsWith(
    $runnerForComparison + [System.IO.Path]::DirectorySeparatorChar,
    $comparison
  )
  $runnerIsRepositoryDescendant = $runnerForComparison.StartsWith(
    $repositoryForComparison + [System.IO.Path]::DirectorySeparatorChar,
    $comparison
  )

  if ($runnerIsRepository -or $runnerIsRepositoryAncestor -or $runnerIsRepositoryDescendant) {
    throw "RunnerPath must not be the repository root or overlap it as an ancestor or descendant: $resolvedRunnerPath"
  }

  if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile -PathType Leaf)) {
    throw "EnvironmentFile does not exist or is not a file: $resolvedEnvironmentFile"
  }

  $environmentStream = $null
  try {
    $environmentStream = [System.IO.File]::Open(
      $resolvedEnvironmentFile,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )
  } catch {
    throw "EnvironmentFile is not readable: $resolvedEnvironmentFile"
  } finally {
    if ($null -ne $environmentStream) {
      $environmentStream.Dispose()
    }
  }

  return [PSCustomObject]@{
    RunnerPath = $resolvedRunnerPath
    EnvironmentFile = $resolvedEnvironmentFile
    RepositoryRoot = $resolvedRepositoryRoot
  }
}

function Get-RefreshTaskDefinition {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RunnerPath,
    [Parameter(Mandatory = $true)]
    [string]$TaskName
  )

  $resolvedRunnerPath = ConvertTo-NormalizedAbsolutePath -Path $RunnerPath

  return [PSCustomObject]@{
    TaskName = $TaskName
    Description = 'Daily validated ASU Hockey data refresh and automated PR'
    Action = [PSCustomObject]@{
      Execute = Join-Path $resolvedRunnerPath 'scripts\refresh-and-push.cmd'
      WorkingDirectory = $resolvedRunnerPath
    }
    Trigger = [PSCustomObject]@{
      Frequency = 'Daily'
      At = '06:00'
    }
    Settings = [PSCustomObject]@{
      MultipleInstances = 'IgnoreNew'
      AllowStartIfOnBatteries = $true
      DontStopIfGoingOnBatteries = $true
      StartWhenAvailable = $true
      WakeToRun = $true
      RunOnlyIfNetworkAvailable = $true
      ExecutionTimeLimitMinutes = 30
    }
  }
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [switch]$CaptureOutput
  )

  if ($CaptureOutput) {
    $output = @(& $FilePath @ArgumentList 2>&1)
  } else {
    & $FilePath @ArgumentList
  }

  if ($LASTEXITCODE -ne 0) {
    $commandDescription = "$FilePath $($ArgumentList -join ' ')"
    if ($CaptureOutput -and $output.Count -gt 0) {
      throw "$commandDescription exited with code $LASTEXITCODE`: $($output -join [Environment]::NewLine)"
    }
    throw "$commandDescription exited with code $LASTEXITCODE"
  }

  if ($CaptureOutput) {
    return $output
  }
}

function Get-GitRepositoryIdentity {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryPath
  )

  $gitDirOutput = @(
    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @(
        '-C',
        $RepositoryPath,
        'rev-parse',
        '--path-format=absolute',
        '--git-dir'
      ) `
      -CaptureOutput
  )
  $gitCommonDirOutput = @(
    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @(
        '-C',
        $RepositoryPath,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir'
      ) `
      -CaptureOutput
  )

  if ($gitDirOutput.Count -ne 1 -or $gitCommonDirOutput.Count -ne 1) {
    throw "Unable to determine an unambiguous Git repository identity for: $RepositoryPath"
  }

  return [PSCustomObject]@{
    GitDir = ConvertTo-NormalizedAbsolutePath -Path $gitDirOutput[0].ToString().Trim()
    GitCommonDir = ConvertTo-NormalizedAbsolutePath -Path $gitCommonDirOutput[0].ToString().Trim()
  }
}

function Assert-ExistingRefreshRunner {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RunnerPath,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedOriginUrl,
    [Parameter(Mandatory = $true)]
    [string]$SourceRepositoryRoot
  )

  $runnerGitDirectory = Join-Path $RunnerPath '.git'
  if (-not (Test-Path -LiteralPath $runnerGitDirectory -PathType Container)) {
    throw "Existing runner .git must be a real directory, not a file: $runnerGitDirectory"
  }

  $gitDirectoryItem = Get-Item -LiteralPath $runnerGitDirectory -Force
  $gitDirectoryIsReparsePoint = (
    $gitDirectoryItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  ) -eq [System.IO.FileAttributes]::ReparsePoint
  if ($gitDirectoryIsReparsePoint) {
    throw "Existing runner .git must be a real directory, not a reparse point: $runnerGitDirectory"
  }

  $runnerIdentity = Get-GitRepositoryIdentity -RepositoryPath $RunnerPath
  $sourceIdentity = Get-GitRepositoryIdentity -RepositoryPath $SourceRepositoryRoot
  $expectedRunnerGitDirectory = ConvertTo-NormalizedAbsolutePath -Path $runnerGitDirectory
  $comparison = [System.StringComparison]::OrdinalIgnoreCase

  $runnerUsesItsOwnGitDirectory = $runnerIdentity.GitDir.Equals(
    $expectedRunnerGitDirectory,
    $comparison
  )
  $runnerGitDirectoriesMatch = $runnerIdentity.GitDir.Equals(
    $runnerIdentity.GitCommonDir,
    $comparison
  )
  if (-not $runnerUsesItsOwnGitDirectory -or -not $runnerGitDirectoriesMatch) {
    throw "Existing runner must be a standalone clone with its own .git directory: $RunnerPath"
  }

  if ($runnerIdentity.GitCommonDir.Equals($sourceIdentity.GitCommonDir, $comparison)) {
    throw "Existing runner must not share Git storage with the source repository: $RunnerPath"
  }

  $runnerOriginUrl = @(
    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @('-C', $RunnerPath, 'remote', 'get-url', 'origin') `
      -CaptureOutput
  )[-1].ToString().Trim()
  if ($runnerOriginUrl -cne $ExpectedOriginUrl) {
    throw 'Existing runner origin does not match the current repository origin.'
  }

  $trackedChanges = @(
    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @('-C', $RunnerPath, 'status', '--porcelain', '--untracked-files=no') `
      -CaptureOutput
  )
  if ($trackedChanges.Count -gt 0) {
    throw 'Existing runner has unexpected tracked changes; refusing to overwrite them.'
  }
}

function Register-RefreshScheduledTask {
  param(
    [Parameter(Mandatory = $true)]
    [PSCustomObject]$Definition
  )

  $action = New-ScheduledTaskAction `
    -Execute $Definition.Action.Execute `
    -WorkingDirectory $Definition.Action.WorkingDirectory
  $trigger = New-ScheduledTaskTrigger -Daily -At $Definition.Trigger.At
  $settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances $Definition.Settings.MultipleInstances `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $Definition.Settings.ExecutionTimeLimitMinutes)

  Register-ScheduledTask `
    -TaskName $Definition.TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description $Definition.Description `
    -Force
}

function Install-RefreshRunner {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RunnerPath,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentFile,
    [Parameter(Mandatory = $true)]
    [string]$TaskName,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Stop'
  try {
    $paths = Resolve-RefreshInstallerPaths `
      -RunnerPath $RunnerPath `
      -EnvironmentFile $EnvironmentFile `
      -RepositoryRoot $RepositoryRoot

    if ([string]::IsNullOrWhiteSpace($TaskName) -or $TaskName.Contains('\') -or $TaskName.Contains('/')) {
      throw 'TaskName must be a non-empty task name, not a task folder path.'
    }

    foreach ($command in @('git', 'node', 'npm.cmd', 'gh')) {
      if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command is not available: $command"
      }
    }

    Invoke-NativeCommand -FilePath 'git' -ArgumentList @('--version')
    Invoke-NativeCommand -FilePath 'node' -ArgumentList @('--version')
    Invoke-NativeCommand -FilePath 'npm.cmd' -ArgumentList @('--version')
    Invoke-NativeCommand -FilePath 'gh' -ArgumentList @('auth', 'status')

    $originUrl = @(
      Invoke-NativeCommand `
        -FilePath 'git' `
        -ArgumentList @('-C', $paths.RepositoryRoot, 'remote', 'get-url', 'origin') `
        -CaptureOutput
    )[-1].ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($originUrl)) {
      throw 'The current repository does not have a usable origin URL.'
    }

    if (Test-Path -LiteralPath $paths.RunnerPath) {
      Assert-ExistingRefreshRunner `
        -RunnerPath $paths.RunnerPath `
        -ExpectedOriginUrl $originUrl `
        -SourceRepositoryRoot $paths.RepositoryRoot
    } else {
      Invoke-NativeCommand `
        -FilePath 'git' `
        -ArgumentList @('clone', '--branch', 'main', '--single-branch', $originUrl, $paths.RunnerPath)
    }

    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @('-C', $paths.RunnerPath, 'fetch', '--prune', 'origin')
    Invoke-NativeCommand `
      -FilePath 'git' `
      -ArgumentList @('-C', $paths.RunnerPath, 'checkout', '-B', 'main', 'origin/main')
    Push-Location -LiteralPath $paths.RunnerPath
    try {
      Invoke-NativeCommand `
        -FilePath 'npm.cmd' `
        -ArgumentList @('ci')
    } finally {
      Pop-Location
    }

    Copy-Item `
      -LiteralPath $paths.EnvironmentFile `
      -Destination (Join-Path $paths.RunnerPath '.env') `
      -Force
    Set-Content `
      -LiteralPath (Join-Path $paths.RunnerPath '.refresh-runner') `
      -Value '1' `
      -Encoding Ascii `
      -NoNewline

    $definition = Get-RefreshTaskDefinition `
      -RunnerPath $paths.RunnerPath `
      -TaskName $TaskName
    Register-RefreshScheduledTask -Definition $definition | Out-Null

    Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Output "Refresh runner: $($paths.RunnerPath)"
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  $repositoryRoot = Split-Path -Parent $PSScriptRoot
  Install-RefreshRunner `
    -RunnerPath $RunnerPath `
    -EnvironmentFile $EnvironmentFile `
    -TaskName $TaskName `
    -RepositoryRoot $repositoryRoot
}
