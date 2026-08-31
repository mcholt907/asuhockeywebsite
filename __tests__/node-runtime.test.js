const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const verifierPath = path.resolve(
  __dirname,
  "../scripts/verify-node-runtime.js",
);
const launcherPath = path.resolve(
  __dirname,
  "../scripts/refresh-and-push.cmd",
);
const windowsTest = process.platform === "win32" ? test : test.skip;

function createRuntimeFixture({
  nvmVersion = "24.20.0",
  launcherVersion = "24.20.0",
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "node-runtime-"));
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ engines: { node: "24.x" } }),
  );
  fs.writeFileSync(path.join(root, ".node-version"), "24.20.0\n");
  fs.writeFileSync(path.join(root, ".nvmrc"), `${nvmVersion}\n`);
  fs.writeFileSync(
    path.join(root, ".github", "workflows", "ci.yml"),
    "node-version: 24.20.0\nnode-version: 24.20.0\n",
  );
  fs.writeFileSync(
    path.join(root, "render.yaml"),
    "- key: NODE_VERSION\n  value: 24.20.0\n",
  );
  fs.writeFileSync(
    path.join(root, "scripts", "refresh-and-push.cmd"),
    `set "NODE_RUNTIME=%LOCALAPPDATA%\\Programs\\node-v${launcherVersion}-win-x64"\n`,
  );
  return root;
}

function runVerifier(root, nodeVersion) {
  return spawnSync(
    process.execPath,
    [verifierPath, "--root", root, "--node-version", nodeVersion],
    { encoding: "utf8" },
  );
}

function runLauncher(
  nodeDirectory,
  { verifierSource = "process.exit(0);\n" } = {},
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "node-launcher-"));
  const fixtureLauncher = path.join(directory, "refresh-and-push.cmd");
  const fixtureScript = path.join(directory, "refresh-and-push.ps1");
  const fixtureVerifier = path.join(directory, "verify-node-runtime.js");
  fs.copyFileSync(launcherPath, fixtureLauncher);
  fs.writeFileSync(fixtureVerifier, verifierSource);
  fs.writeFileSync(
    fixtureScript,
    "(Get-Command node.exe).Source | Write-Output\n",
  );
  const result = spawnSync("cmd.exe", ["/d", "/c", fixtureLauncher], {
    encoding: "utf8",
    env: {
      ...process.env,
      ASU_REFRESH_NODE_DIR: nodeDirectory,
    },
  });
  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

describe("Node runtime contract", () => {
  test("accepts Node 24.20.0 when every runtime declaration agrees", () => {
    const root = createRuntimeFixture();
    try {
      const result = runVerifier(root, "v24.20.0");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Node runtime verified: v24.20.0");
      expect(result.stderr).toBe("");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an unsupported Node executable before project commands run", () => {
    const root = createRuntimeFixture();
    try {
      const result = runVerifier(root, "v22.15.0");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Node v22.15.0 is unsupported; install Node v24.20.0",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects drift between checked-in runtime declarations", () => {
    const root = createRuntimeFixture({ nvmVersion: "22.15.0" });
    try {
      const result = runVerifier(root, "v24.20.0");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        ".nvmrc declares 22.15.0; expected 24.20.0",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects drift in the Windows refresh launcher pin", () => {
    const root = createRuntimeFixture({ launcherVersion: "22.15.0" });
    try {
      const result = runVerifier(root, "v24.20.0");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Windows refresh launcher declares 22.15.0; expected 24.20.0",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Windows refresh launcher", () => {
  windowsTest("fails before PowerShell when the pinned runtime is missing", () => {
    const missingRuntime = path.join(os.tmpdir(), "missing-node-runtime");
    const result = runLauncher(missingRuntime);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Node v24.20.0 was not found at ${missingRuntime}`,
    );
  });

  windowsTest("places the pinned runtime first on PATH", () => {
    const runtime = path.dirname(process.execPath);
    const result = runLauncher(runtime);

    expect(result.status).toBe(0);
    expect(result.stdout.split(/\r?\n/)[0]).toBe(process.execPath);
  });

  windowsTest("runs the runtime verifier before PowerShell", () => {
    const result = runLauncher(path.dirname(process.execPath), {
      verifierSource:
        "console.error('simulated unsupported Node runtime'); process.exit(1);\n",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("simulated unsupported Node runtime");
    expect(result.stdout).not.toContain(process.execPath);
  });
});
