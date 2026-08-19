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

if ($Mode -eq 'success') {
  $captured = @(Invoke-Native $NodePath @('-e', $ChildSource))
  if ($captured -notcontains 'native-stderr-success') {
    throw 'Invoke-Native did not return the native stderr line'
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

function runInstallerHarness(mode, candidatePath) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-installer-"),
  );
  const harnessPath = path.join(directory, "invoke-installer-harness.ps1");
  const environmentFile = path.join(directory, "source.env");

  fs.writeFileSync(environmentFile, "TEST_VALUE=not-printed\n");
  fs.writeFileSync(
    harnessPath,
    `param(
  [string]$InstallerPath,
  [string]$Mode,
  [string]$CandidatePath,
  [string]$EnvironmentFile,
  [string]$RepositoryRoot
)

. $InstallerPath -EnvironmentFile $EnvironmentFile

if ($Mode -eq 'definition') {
  Get-RefreshTaskDefinition -RunnerPath $CandidatePath -TaskName 'ASU Hockey Data Refresh' |
    ConvertTo-Json -Depth 5 -Compress
  exit 0
}

try {
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
      candidatePath,
      environmentFile,
      path.resolve(__dirname, ".."),
    ],
    { encoding: "utf8", cwd: directory },
  );

  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

describe("refresh change allowlist", () => {
  test("accepts the generated data files and normalizes Windows separators", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(
      validateRefreshChanges([
        "asu_hockey_data.json",
        "data\\asu_recruiting_refresh_state.json",
        "data/asu_alumni_fallback.json",
        "data\\asu_transfers_fallback.json",
      ]),
    ).toEqual([
      "asu_hockey_data.json",
      "data/asu_recruiting_refresh_state.json",
      "data/asu_alumni_fallback.json",
      "data/asu_transfers_fallback.json",
    ]);
  });

  test("rejects every path outside the exact generated-file allowlist", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(() =>
      validateRefreshChanges([
        "data/asu_alumni_fallback.json.bak",
        "src/App.js",
      ]),
    ).toThrow(
      "Refresh automation rejected unexpected paths: data/asu_alumni_fallback.json.bak, src/App.js",
    );
  });

  test("CLI exits successfully for allowlisted paths", () => {
    const result = spawnSync(
      process.execPath,
      [
        validatorPath,
        "asu_hockey_data.json",
        "data\\asu_recruiting_refresh_state.json",
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

describe("PowerShell native command execution", () => {
  windowsTest(
    "captures and logs stderr when the native command succeeds",
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
});

describe("isolated refresh runner installer", () => {
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
