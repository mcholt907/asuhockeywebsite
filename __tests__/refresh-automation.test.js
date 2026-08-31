const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const validatorPath = path.resolve(
  __dirname,
  "../scripts/validate-refresh-changes.js",
);
const runnerPath = path.resolve(__dirname, "../scripts/refresh-and-push.ps1");
const installerPath = path.resolve(
  __dirname,
  "../scripts/install-refresh-runner.ps1",
);
const runtimeFixturePaths = [
  ".node-version",
  ".nvmrc",
  "package.json",
  "render.yaml",
  ".github/workflows/ci.yml",
  "scripts/verify-node-runtime.js",
];

const windowsTest = process.platform === "win32" ? test : test.skip;

function runNativeHarness(mode, childSource) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-native-"));
  const harnessPath = path.join(directory, "invoke-native-harness.ps1");
  const logPath = path.join(directory, "refresh.log");

  fs.writeFileSync(
    harnessPath,
    `param(
  [string]$RunnerPath,
  [string]$TestLogPath,
  [string]$NodePath,
  [string]$Mode,
  [string]$ChildSource
)

. $RunnerPath
$LogPath = $TestLogPath
$script:CapturePaths = @()

if ($Mode -eq 'read-failure') {
  function Get-Content {
    [CmdletBinding()]
    param(
      [Parameter(Mandatory = $true)]
      [string]$LiteralPath
    )

    $script:CapturePaths += $LiteralPath
    if ($script:CapturePaths.Count -eq 2) {
      Write-Error 'simulated capture read failure'
      return
    }

    Microsoft.PowerShell.Management\\Get-Content -LiteralPath $LiteralPath
  }
}

if ($Mode -eq 'success') {
  $captured = @(Invoke-Native $NodePath @('-e', $ChildSource))
  if ($captured.Count -ne 0) {
    throw "Invoke-Native returned native stderr: $($captured -join '|')"
  }
  if ($ErrorActionPreference -ne 'Stop') {
    throw 'Invoke-Native did not restore ErrorActionPreference'
  }
  Write-Output 'HARNESS_OK'
  exit 0
}

try {
  Invoke-Native $NodePath @('-e', $ChildSource) | Out-Null
  [Console]::Error.WriteLine('Invoke-Native did not throw')
  exit 10
} catch {
  if ($ErrorActionPreference -ne 'Stop') {
    [Console]::Error.WriteLine('Invoke-Native did not restore ErrorActionPreference')
    exit 24
  }
  foreach ($capturePath in $script:CapturePaths) {
    if (Test-Path -LiteralPath $capturePath) {
      [Console]::Error.WriteLine("Invoke-Native left a capture file behind: $capturePath")
      exit 25
    }
  }
  [Console]::Error.WriteLine("CAUGHT: $($_.Exception.Message)")
  exit 23
}
`,
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      harnessPath,
      runnerPath,
      logPath,
      process.execPath,
      mode,
      childSource,
    ],
    { encoding: "utf8" },
  );
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  fs.rmSync(directory, { recursive: true, force: true });

  return { ...result, log };
}

function runNativeStdoutSeparationHarness() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-native-stdout-"),
  );
  const harnessPath = path.join(directory, "native-stdout-harness.ps1");
  const nativeShimPath = path.join(directory, "native-path-shim.cmd");
  const logPath = path.join(directory, "refresh.log");

  fs.writeFileSync(
    nativeShimPath,
    "@echo off\r\necho data/asu_alumni_fallback.json\r\necho warning: unable to access global Git ignore 1>&2\r\nexit /b 0\r\n",
  );
  fs.writeFileSync(
    harnessPath,
    `param(
  [string]$RunnerPath,
  [string]$TestLogPath,
  [string]$NativeShimPath
)

. $RunnerPath
$LogPath = $TestLogPath

try {
  $captured = @(Invoke-Native $NativeShimPath @())
  Assert-AllowedChanges $captured
  if ($captured.Count -ne 1 -or $captured[0] -ne 'data/asu_alumni_fallback.json') {
    throw "Unexpected captured native output: $($captured -join '|')"
  }
  if ($ErrorActionPreference -ne 'Stop') {
    throw 'Invoke-Native did not restore ErrorActionPreference'
  }
  Write-Output 'HARNESS_OK'
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 23
}
`,
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      harnessPath,
      runnerPath,
      logPath,
      nativeShimPath,
    ],
    { encoding: "utf8", cwd: path.resolve(__dirname, "..") },
  );
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  fs.rmSync(directory, { recursive: true, force: true });

  return { ...result, log };
}

function runGeneratedJsonHarness({ invalidPath } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-json-"));
  const harnessPath = path.join(directory, "generated-json-harness.ps1");
  const generatedPaths = [
    "data/asu_alumni_fallback.json",
    "data/asu_transfers_fallback.json",
    "data/asu_recruiting_fallback.json",
    "data/nchc_standings_fallback.json",
  ];

  for (const relativePath of generatedPaths) {
    const file = path.join(directory, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relativePath === invalidPath ? "{" : "{}");
  }

  fs.writeFileSync(
    harnessPath,
    `param([string]$RunnerPath, [string]$FixtureRoot)
. $RunnerPath
try {
  Assert-GeneratedJsonFiles -Root $FixtureRoot
  Write-Output 'HARNESS_OK'
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 23
}
`,
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      harnessPath,
      runnerPath,
      directory,
    ],
    { encoding: "utf8" },
  );

  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

function runInstallerHarness(
  mode,
  candidatePath,
  {
    repositoryRoot = path.resolve(__dirname, ".."),
    expectedOrigin = "https://example.invalid/asu-hockey.git",
  } = {},
) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-installer-"),
  );
  const harnessPath = path.join(directory, "invoke-installer-harness.ps1");
  const environmentFile = path.join(directory, "source.env");
  const gitGlobalConfig = path.join(directory, "empty.gitconfig");
  const resolvedCandidatePath =
    candidatePath || path.join(directory, "developer-repository-alias");

  fs.writeFileSync(environmentFile, "TEST_VALUE=not-printed\n");
  fs.writeFileSync(gitGlobalConfig, "");
  fs.writeFileSync(
    harnessPath,
    `param(
  [string]$InstallerPath,
  [string]$Mode,
  [string]$CandidatePath,
  [string]$EnvironmentFile,
  [string]$RepositoryRoot,
  [string]$ExpectedOrigin
)

. $InstallerPath -EnvironmentFile $EnvironmentFile

if ($Mode -eq 'definition') {
  Get-RefreshTaskDefinition -RunnerPath $CandidatePath -TaskName 'ASU Hockey Data Refresh' |
    ConvertTo-Json -Depth 5 -Compress
  exit 0
}

if ($Mode -eq 'status') {
  & git -C $CandidatePath status --porcelain --untracked-files=no
  exit $LASTEXITCODE
}

try {
  if ($Mode -eq 'junction') {
    New-Item -ItemType Junction -Path $CandidatePath -Target $RepositoryRoot | Out-Null
    try {
      Resolve-RefreshInstallerPaths -RunnerPath $CandidatePath -EnvironmentFile $EnvironmentFile -RepositoryRoot $RepositoryRoot |
        ConvertTo-Json -Depth 3 -Compress
    } finally {
      if (Test-Path -LiteralPath $CandidatePath) {
        [System.IO.Directory]::Delete($CandidatePath)
      }
    }
    exit 0
  }

  if ($Mode -eq 'existing') {
    Assert-ExistingRefreshRunner -RunnerPath $CandidatePath -ExpectedOriginUrl $ExpectedOrigin -SourceRepositoryRoot $RepositoryRoot
    Write-Output 'EXISTING_RUNNER_OK'
    exit 0
  }

  Resolve-RefreshInstallerPaths -RunnerPath $CandidatePath -EnvironmentFile $EnvironmentFile -RepositoryRoot $RepositoryRoot |
    ConvertTo-Json -Depth 3 -Compress
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 23
}
`,
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      harnessPath,
      installerPath,
      mode,
      resolvedCandidatePath,
      environmentFile,
      repositoryRoot,
      expectedOrigin,
    ],
    {
      encoding: "utf8",
      cwd: directory,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: gitGlobalConfig,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.excludesFile",
        GIT_CONFIG_VALUE_0: "NUL",
      },
    },
  );

  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

function runInstallerNativeHarness(mode, childSource) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-installer-native-"),
  );
  const harnessPath = path.join(directory, "invoke-installer-native.ps1");
  const environmentFile = path.join(directory, "source.env");

  fs.writeFileSync(environmentFile, "TEST_VALUE=not-printed\n");
  fs.writeFileSync(
    harnessPath,
    `param(
  [string]$InstallerPath,
  [string]$EnvironmentFile,
  [string]$NodePath,
  [string]$Mode,
  [string]$ChildSource
)

. $InstallerPath -EnvironmentFile $EnvironmentFile
$ErrorActionPreference = 'Stop'

if ($Mode -eq 'success') {
  $captured = @(
    Invoke-NativeCommand -FilePath $NodePath -ArgumentList @('-e', $ChildSource) -CaptureOutput
  )
  if ($captured.Count -ne 1 -or $captured[0] -ne 'native-stdout-success') {
    throw "Unexpected captured stdout: $($captured -join '|')"
  }
  if ($ErrorActionPreference -ne 'Stop') {
    throw 'Invoke-NativeCommand did not restore ErrorActionPreference'
  }
  Write-Output 'HARNESS_OK'
  exit 0
}

try {
  Invoke-NativeCommand -FilePath $NodePath -ArgumentList @('-e', $ChildSource) -CaptureOutput | Out-Null
  [Console]::Error.WriteLine('Invoke-NativeCommand did not throw')
  exit 10
} catch {
  if ($ErrorActionPreference -ne 'Stop') {
    [Console]::Error.WriteLine('Invoke-NativeCommand did not restore ErrorActionPreference')
    exit 24
  }
  [Console]::Error.WriteLine("CAUGHT: $($_.Exception.Message)")
  exit 23
}
`,
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      harnessPath,
      installerPath,
      environmentFile,
      process.execPath,
      mode,
      childSource,
    ],
    { encoding: "utf8" },
  );

  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function expectRunnerSuccess(result) {
  if (result.status !== 0) {
    throw new Error(
      `refresh runner exited ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
}

function createRefreshRunnerFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-runner-integration-"),
  );
  const remote = path.join(directory, "remote.git");
  const runner = path.join(directory, "runner");
  const shims = path.join(directory, "shims");
  const tracePath = path.join(directory, "npm-trace.txt");
  const statePath = path.join(directory, "refresh-count.txt");
  const gitGlobalConfig = path.join(directory, "empty.gitconfig");
  const repositoryRoot = path.resolve(__dirname, "..");

  runGit(["-c", "safe.directory=*", "clone", "--bare", repositoryRoot, remote]);
  const sourceHead = runGit(
    ["rev-parse", "HEAD"],
    repositoryRoot,
  ).stdout.trim();
  runGit(["--git-dir", remote, "update-ref", "refs/heads/main", sourceHead]);
  runGit(["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  runGit([
    "--git-dir",
    remote,
    "update-ref",
    "-d",
    "refs/heads/auto/data-refresh",
  ]);
  runGit(["clone", "--single-branch", "--branch", "main", remote, runner]);
  runGit(["config", "user.name", "Refresh Test"], runner);
  runGit(["config", "user.email", "refresh@example.invalid"], runner);
  runGit(["config", "core.autocrlf", "false"], runner);
  runGit(["reset", "--hard", "HEAD"], runner);
  fs.copyFileSync(
    runnerPath,
    path.join(runner, "scripts", "refresh-and-push.ps1"),
  );
  for (const relativePath of runtimeFixturePaths) {
    const destination = path.join(runner, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, "..", relativePath), destination);
  }
  runGit(
    ["add", "scripts/refresh-and-push.ps1", ...runtimeFixturePaths],
    runner,
  );
  const runnerChanged = spawnSync(
    "git",
    ["diff", "--cached", "--quiet", "--exit-code"],
    { cwd: runner, encoding: "utf8" },
  );
  if (runnerChanged.status === 1) {
    runGit(["commit", "-m", "test runner script"], runner);
    runGit(["push", "origin", "main"], runner);
  } else if (runnerChanged.status !== 0) {
    throw new Error(
      `unable to inspect runner fixture: ${runnerChanged.stderr}`,
    );
  }
  fs.writeFileSync(path.join(runner, ".refresh-runner"), "test runner\n");
  fs.writeFileSync(gitGlobalConfig, "");

  fs.mkdirSync(shims);
  const npmShimPath = path.join(shims, "npm-shim.js");
  fs.writeFileSync(
    npmShimPath,
    `const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REFRESH_TEST_TRACE, args.join(" ") + "\\n");
if (args[0] === "run" && args[1] === "refresh-data") {
  for (const fallbackPath of [
    "data/asu_alumni_fallback.json",
    "data/asu_transfers_fallback.json",
  ]) {
    if (fs.readFileSync(path.join(process.cwd(), fallbackPath), "utf8").includes('"leftover"')) {
      throw new Error("allowlisted leftover reached refresh-data: " + fallbackPath);
    }
  }
  const statePath = process.env.REFRESH_TEST_STATE;
  const count = fs.existsSync(statePath)
    ? Number(fs.readFileSync(statePath, "utf8")) + 1
    : 1;
  fs.writeFileSync(statePath, String(count));
  fs.writeFileSync(
    path.join(process.cwd(), "data", "nchc_standings_fallback.json"),
    JSON.stringify({ refresh_test_run: count }, null, 2),
  );
}
`,
  );
  fs.writeFileSync(
    path.join(shims, "npm.cmd"),
    `@echo off\r\n"${process.execPath}" "${npmShimPath}" %*\r\nexit /b %errorlevel%\r\n`,
  );
  fs.writeFileSync(path.join(shims, "npx.cmd"), "@echo off\r\nexit /b 0\r\n");

  const systemPowerShell = path.join(
    process.env.SystemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  fs.copyFileSync(systemPowerShell, path.join(shims, "gh.exe"));
  fs.writeFileSync(
    path.join(shims, "pr.ps1"),
    "if ($args[0] -eq 'list') { Write-Output 'https://example.invalid/pr/1' }\nexit 0\n",
  );

  const environment = {
    ...process.env,
    PATH: `${shims};${process.env.PATH}`,
    REFRESH_TEST_TRACE: tracePath,
    REFRESH_TEST_STATE: statePath,
    SENTRY_CRON_MONITOR_URL: "",
    GIT_CONFIG_GLOBAL: gitGlobalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.excludesFile",
    GIT_CONFIG_VALUE_0: "NUL",
  };

  return {
    remote,
    runner,
    tracePath,
    run() {
      return spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(runner, "scripts", "refresh-and-push.ps1"),
        ],
        { cwd: runner, encoding: "utf8", env: environment },
      );
    },
    remoteRefreshOid() {
      return runGit([
        "--git-dir",
        remote,
        "rev-parse",
        "refs/heads/auto/data-refresh",
      ]).stdout.trim();
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function createLinkedWorktreeFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-linked-worktree-"),
  );
  const source = path.join(directory, "source");
  const linkedRunner = path.join(directory, "linked-runner");
  const sharedCommonDirRunner = path.join(directory, "shared-common-runner");
  const redirectedWorktreeRunner = path.join(
    directory,
    "redirected-worktree-runner",
  );
  const origin = "https://example.invalid/asu-hockey.git";

  runGit(["init", source]);
  runGit(["-C", source, "config", "user.name", "Refresh Test"]);
  runGit(["-C", source, "config", "user.email", "refresh@example.invalid"]);
  runGit(["-C", source, "config", "core.autocrlf", "false"]);
  fs.writeFileSync(path.join(source, "fixture.txt"), "fixture\n");
  runGit(["-C", source, "add", "fixture.txt"]);
  runGit(["-C", source, "commit", "-m", "fixture"]);
  runGit(["-C", source, "remote", "add", "origin", origin]);
  runGit(["-C", source, "worktree", "add", "--detach", linkedRunner]);
  runGit(["clone", source, sharedCommonDirRunner]);
  fs.writeFileSync(
    path.join(sharedCommonDirRunner, ".git", "commondir"),
    `${path.join(source, ".git").replace(/\\/g, "/")}\n`,
  );
  runGit(["clone", source, redirectedWorktreeRunner]);
  runGit([
    "-C",
    redirectedWorktreeRunner,
    "remote",
    "set-url",
    "origin",
    origin,
  ]);
  runGit(["-C", redirectedWorktreeRunner, "config", "core.autocrlf", "false"]);
  runGit(["-C", redirectedWorktreeRunner, "config", "core.worktree", source]);
  runGit(["-C", redirectedWorktreeRunner, "reset", "--hard", "HEAD"]);

  return {
    source,
    linkedRunner,
    sharedCommonDirRunner,
    redirectedWorktreeRunner,
    origin,
    cleanup() {
      runGit(["-C", source, "worktree", "remove", "--force", linkedRunner]);
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

describe("refresh change allowlist", () => {
  test("accepts the generated data files and normalizes Windows separators", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(
      validateRefreshChanges([
        "data/asu_alumni_fallback.json",
        "data\\asu_transfers_fallback.json",
        "data/asu_recruiting_fallback.json",
        "data\\nchc_standings_fallback.json",
      ]),
    ).toEqual([
      "data/asu_alumni_fallback.json",
      "data/asu_transfers_fallback.json",
      "data/asu_recruiting_fallback.json",
      "data/nchc_standings_fallback.json",
    ]);
  });

  test("rejects every path outside the exact generated-file allowlist", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(() =>
      validateRefreshChanges([
        "asu_hockey_data.json",
        "data/asu_recruiting_refresh_state.json",
        "data/asu_alumni_fallback.json.bak",
      ]),
    ).toThrow(
      "Refresh automation rejected unexpected paths: asu_hockey_data.json, data/asu_recruiting_refresh_state.json, data/asu_alumni_fallback.json.bak",
    );
  });

  test("CLI exits successfully for allowlisted paths", () => {
    const result = spawnSync(
      process.execPath,
      [
        validatorPath,
        "data/asu_recruiting_fallback.json",
        "data\\nchc_standings_fallback.json",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("CLI exits nonzero and reports disallowed paths", () => {
    const result = spawnSync(
      process.execPath,
      [validatorPath, "data/asu_transfers_fallback.json", "package.json"],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refresh automation rejected unexpected path: package.json",
    );
  });
});

describe("generated fallback parsing", () => {
  windowsTest("parses all four generated fallback documents", () => {
    const result = runGeneratedJsonHarness();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("HARNESS_OK");
    expect(result.stderr).toBe("");
  });

  windowsTest("rejects a malformed recruiting fallback document", () => {
    const result = runGeneratedJsonHarness({
      invalidPath: "data/asu_recruiting_fallback.json",
    });

    expect(result.status).toBe(23);
    expect(result.stderr).toContain("asu_recruiting_fallback.json");
  });
});

describe("PowerShell native command execution", () => {
  windowsTest(
    "passes only native stdout to the exact refresh-change allowlist while logging stderr",
    () => {
      const result = runNativeStdoutSeparationHarness();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("HARNESS_OK");
      expect(result.log).toContain("data/asu_alumni_fallback.json");
      expect(result.log).toContain(
        "warning: unable to access global Git ignore",
      );
    },
  );

  windowsTest(
    "logs stderr without returning it when the native command succeeds",
    () => {
      const result = runNativeHarness(
        "success",
        "process.stderr.write(Buffer.from([110,97,116,105,118,101,45,115,116,100,101,114,114,45,115,117,99,99,101,115,115,10]));process.exit(0)",
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("HARNESS_OK");
      expect(result.log).toContain("native-stderr-success");
    },
  );

  windowsTest("throws when the native command exits nonzero", () => {
    const result = runNativeHarness(
      "failure",
      "process.stderr.write(Buffer.from([110,97,116,105,118,101,45,115,116,100,101,114,114,45,102,97,105,108,117,114,101,10]));process.exit(7)",
    );

    expect(result.status).toBe(23);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "exited with code 7",
    );
    expect(result.log).toContain("native-stderr-failure");
  });

  windowsTest(
    "fails closed and removes both captures when reading a stream fails",
    () => {
      const result = runNativeHarness(
        "read-failure",
        "process.stdout.write('native-stdout-before-read-failure\\n');process.stderr.write('native-stderr-before-read-failure\\n');process.exit(0)",
      );

      expect(result.status).toBe(23);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "simulated capture read failure",
      );
    },
  );

  windowsTest(
    "preserves a native exit failure when reading a capture also fails",
    () => {
      const result = runNativeHarness(
        "read-failure",
        "process.stdout.write('native-stdout-before-read-failure\\n');process.stderr.write('native-stderr-before-read-failure\\n');process.exit(7)",
      );

      expect(result.status).toBe(23);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "exited with code 7",
      );
    },
  );
});

describe("daily refresh runner integration", () => {
  windowsTest(
    "installs lockfile dependencies before refreshing after updating main",
    () => {
      const fixture = createRefreshRunnerFixture();
      try {
        const result = fixture.run();

        expectRunnerSuccess(result);
        expect(
          fs.readFileSync(fixture.tracePath, "utf8").trim().split(/\r?\n/),
        ).toEqual(["ci", "run refresh-data"]);
      } finally {
        fixture.cleanup();
      }
    },
  );

  windowsTest(
    "publishes two successive refreshes from a single-branch clone with a lease",
    () => {
      const fixture = createRefreshRunnerFixture();
      try {
        const firstRun = fixture.run();
        expectRunnerSuccess(firstRun);
        const firstOid = fixture.remoteRefreshOid();

        fs.writeFileSync(
          path.join(fixture.runner, "data", "asu_alumni_fallback.json"),
          '{"leftover":"working-tree"}\n',
        );
        fs.writeFileSync(
          path.join(fixture.runner, "data", "asu_transfers_fallback.json"),
          '{"leftover":"staged"}\n',
        );
        runGit(["add", "data/asu_transfers_fallback.json"], fixture.runner);

        const secondRun = fixture.run();
        expectRunnerSuccess(secondRun);
        expect(secondRun.stdout).toContain(
          "Restoring allowlisted leftovers from a prior failed run",
        );
        expect(
          runGit(
            ["status", "--short", "--", "data/asu_alumni_fallback.json"],
            fixture.runner,
          ).stdout,
        ).toBe("");
        expect(
          runGit(
            ["status", "--short", "--", "data/asu_transfers_fallback.json"],
            fixture.runner,
          ).stdout,
        ).toBe("");
        expect(fixture.remoteRefreshOid()).not.toBe(firstOid);
      } finally {
        fixture.cleanup();
      }
    },
  );
});

describe("isolated refresh runner installer", () => {
  windowsTest(
    "keeps successful native stdout parseable while preserving stderr diagnostics",
    () => {
      const result = runInstallerNativeHarness(
        "success",
        "process.stdout.write('native-stdout-success\\n');process.stderr.write('native-stderr-success\\n');process.exit(0)",
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("HARNESS_OK");
      expect(result.stderr).toContain("native-stderr-success");
      expect(result.stdout).not.toContain("native-stderr-success");
    },
  );

  windowsTest(
    "reports native stderr and exit code when a captured command fails",
    () => {
      const result = runInstallerNativeHarness(
        "failure",
        "process.stdout.write('native-stdout-failure\\n');process.stderr.write('native-stderr-failure\\n');process.exit(7)",
      );

      expect(result.status).toBe(23);
      expect(result.stderr).toContain("native-stderr-failure");
      expect(result.stderr).toContain("exited with code 7");
    },
  );

  windowsTest("rejects every path that overlaps the live repository", () => {
    const repositoryRoot = path.resolve(__dirname, "..");

    for (const unsafePath of [
      repositoryRoot,
      path.dirname(repositoryRoot),
      path.join(repositoryRoot, "nested-runner"),
    ]) {
      const result = runInstallerHarness("paths", unsafePath);

      expect(result.status).toBe(23);
      expect(result.stderr).toContain("must not be the repository root");
    }
  });

  windowsTest("resolves safe runner and environment paths", () => {
    const result = runInstallerHarness("paths", ".\\daily-runner");

    expect(result.status).toBe(0);
    const resolved = JSON.parse(result.stdout.trim());
    expect(path.isAbsolute(resolved.RunnerPath)).toBe(true);
    expect(path.isAbsolute(resolved.EnvironmentFile)).toBe(true);
    expect(resolved.RunnerPath).toMatch(/[\\/]daily-runner$/);
  });

  windowsTest("rejects a junction alias to the developer checkout", () => {
    const result = runInstallerHarness("junction");

    expect(result.status).toBe(23);
    expect(result.stderr).toContain("reparse point");
  });

  windowsTest("rejects a linked worktree as an existing runner", () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      const result = runInstallerHarness("existing", fixture.linkedRunner, {
        repositoryRoot: fixture.source,
        expectedOrigin: fixture.origin,
      });

      expect(result.status).toBe(23);
      expect(result.stderr).toContain(".git must be a real directory");
    } finally {
      fixture.cleanup();
    }
  });

  windowsTest("rejects a .git directory that shares source Git storage", () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      const result = runInstallerHarness(
        "existing",
        fixture.sharedCommonDirRunner,
        {
          repositoryRoot: fixture.source,
          expectedOrigin: fixture.origin,
        },
      );

      expect(result.status).toBe(23);
      expect(result.stderr).toContain("standalone clone");
    } finally {
      fixture.cleanup();
    }
  });

  windowsTest("rejects core.worktree redirected to the source checkout", () => {
    const fixture = createLinkedWorktreeFixture();
    try {
      const status = runInstallerHarness(
        "status",
        fixture.redirectedWorktreeRunner,
        {
          repositoryRoot: fixture.source,
          expectedOrigin: fixture.origin,
        },
      );
      expect(status.status).toBe(0);
      expect(status.stdout.trim()).toBe("");
      expect(status.stderr.trim()).toBe("");

      const result = runInstallerHarness(
        "existing",
        fixture.redirectedWorktreeRunner,
        {
          repositoryRoot: fixture.source,
          expectedOrigin: fixture.origin,
        },
      );

      expect(result.status).toBe(23);
      expect(result.stderr).toContain("worktree root");
    } finally {
      fixture.cleanup();
    }
  });

  windowsTest("defines the exact daily task without registering it", () => {
    const runner = path.resolve(os.tmpdir(), "asu-refresh-runner-spec");
    const result = runInstallerHarness("definition", runner);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      TaskName: "ASU Hockey Data Refresh",
      Description: "Daily validated ASU Hockey data refresh and automated PR",
      Action: {
        Execute: path.join(runner, "scripts", "refresh-and-push.cmd"),
        WorkingDirectory: runner,
      },
      Trigger: { Frequency: "Daily", At: "06:00" },
      Settings: {
        MultipleInstances: "IgnoreNew",
        AllowStartIfOnBatteries: true,
        DontStopIfGoingOnBatteries: true,
        StartWhenAvailable: true,
        WakeToRun: true,
        RunOnlyIfNetworkAvailable: true,
        ExecutionTimeLimitMinutes: 30,
      },
    });
  });
});
