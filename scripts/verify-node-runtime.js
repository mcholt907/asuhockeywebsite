const fs = require("fs");
const path = require("path");

const EXPECTED_NODE_VERSION = "24.20.0";
const EXPECTED_NODE_MAJOR = "24";

function readTrimmed(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").trim();
}

function requireValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} declares ${actual}; expected ${expected}`);
  }
}

function verifyNodeRuntime({ root, nodeVersion }) {
  const normalizedNodeVersion = String(nodeVersion).replace(/^v/, "");
  if (normalizedNodeVersion !== EXPECTED_NODE_VERSION) {
    throw new Error(
      `Node v${normalizedNodeVersion} is unsupported; install Node v${EXPECTED_NODE_VERSION}`,
    );
  }

  requireValue(
    readTrimmed(root, ".node-version"),
    EXPECTED_NODE_VERSION,
    ".node-version",
  );
  requireValue(
    readTrimmed(root, ".nvmrc"),
    EXPECTED_NODE_VERSION,
    ".nvmrc",
  );

  const packageJson = JSON.parse(readTrimmed(root, "package.json"));
  requireValue(
    packageJson.engines?.node,
    `${EXPECTED_NODE_MAJOR}.x`,
    "package.json engines.node",
  );

  const workflow = readTrimmed(root, ".github/workflows/ci.yml");
  const ciVersions = Array.from(
    workflow.matchAll(/node-version:\s*["']?([^\s"'#]+)/g),
    (match) => match[1],
  );
  if (ciVersions.length === 0) {
    throw new Error("CI does not declare a Node version");
  }
  for (const version of ciVersions) {
    requireValue(version, EXPECTED_NODE_VERSION, "CI node-version");
  }

  const renderConfig = readTrimmed(root, "render.yaml");
  const renderVersion = renderConfig.match(
    /-\s+key:\s*NODE_VERSION\s*\r?\n\s*value:\s*([^\s#]+)/,
  )?.[1];
  if (!renderVersion) {
    throw new Error("Render does not declare NODE_VERSION");
  }
  requireValue(renderVersion, EXPECTED_NODE_VERSION, "Render NODE_VERSION");

  const launcher = readTrimmed(root, "scripts/refresh-and-push.cmd");
  const launcherVersion = launcher.match(
    /node-v(\d+\.\d+\.\d+)-win-x64/,
  )?.[1];
  if (!launcherVersion) {
    throw new Error("Windows refresh launcher does not declare a Node version");
  }
  requireValue(
    launcherVersion,
    EXPECTED_NODE_VERSION,
    "Windows refresh launcher",
  );
}

function parseArguments(argv) {
  const values = {
    root: path.resolve(__dirname, ".."),
    nodeVersion: process.version,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--root", "--node-version"].includes(flag)) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    if (flag === "--root") values.root = path.resolve(value);
    if (flag === "--node-version") values.nodeVersion = value;
  }
  return values;
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    verifyNodeRuntime(options);
    console.log(`Node runtime verified: v${EXPECTED_NODE_VERSION}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { verifyNodeRuntime };
