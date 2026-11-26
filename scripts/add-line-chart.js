// add-line-chart.js
// Adds a game-day line chart image to the Schedule page.
//
// Usage:
//   npm run add-line-chart -- <image> <YYYY-MM-DD> <Opponent name>
//   npm run add-line-chart -- ~/Downloads/lines.jpg 2026-11-21 "Minnesota Duluth"
//
// The image is auto-oriented, capped at MAX_WIDTH, re-encoded as WebP (which
// also strips EXIF/location metadata), and written to
// public/assets/line-charts/<season>/<date>-<opponent>.webp. The game date is
// then mapped to that path in src/data/lineCharts.json, which the Schedule
// page reads to show a "Lines" link on the matching game card. Re-running for
// the same date replaces the earlier chart.

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = "src/data/lineCharts.json";
const PUBLIC_DIR = "public";
const ASSET_DIR = "assets/line-charts";
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;

const USAGE =
  'Usage: npm run add-line-chart -- <image> <YYYY-MM-DD> "<Opponent name>"';

function parseGameDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) {
    throw new Error(`Game date must be YYYY-MM-DD; got "${value}"`);
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Game date is not a real calendar date: "${value}"`);
  }
  return { year, month };
}

// College hockey seasons start in the fall: August-December games belong to
// the season that begins that year, January-July games to the one before.
function seasonForDate(gameDate) {
  const { year, month } = parseGameDate(gameDate);
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function slugifyOpponent(opponent) {
  const slug = String(opponent ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#\d+\s*/g, "") // drop poll rankings such as "#5"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Opponent name is required");
  return slug;
}

function lineChartPublicPath(gameDate, opponent) {
  return `/${ASSET_DIR}/${seasonForDate(gameDate)}/${gameDate}-${slugifyOpponent(opponent)}.webp`;
}

function readManifest(rootDir) {
  const manifestFile = path.join(rootDir, MANIFEST_PATH);
  if (!fs.existsSync(manifestFile)) return {};
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${MANIFEST_PATH} must contain a JSON object`);
  }
  return manifest;
}

function writeManifest(rootDir, manifest) {
  const manifestFile = path.join(rootDir, MANIFEST_PATH);
  const sorted = Object.fromEntries(
    Object.keys(manifest)
      .sort()
      .map((date) => [date, manifest[date]]),
  );
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  const tempFile = `${manifestFile}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(sorted, null, 2)}\n`);
  fs.renameSync(tempFile, manifestFile);
}

async function addLineChart({ image, date, opponent, rootDir = ROOT_DIR }) {
  if (!image || !fs.existsSync(image)) {
    throw new Error(`Image not found: ${image}`);
  }
  const publicPath = lineChartPublicPath(date, opponent);
  const assetRoot = path.join(rootDir, PUBLIC_DIR, ASSET_DIR);
  const outputFile = path.join(rootDir, PUBLIC_DIR, publicPath);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });

  const sharp = require("sharp");
  // libvips' operation cache keeps input and output files open, and Windows
  // refuses to rename or delete an open file. This one-shot conversion gains
  // nothing from the cache, so turn it off.
  sharp.cache(false);
  const tempFile = `${outputFile}.tmp`;
  let info;
  try {
    info = await sharp(image)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(tempFile);
    fs.renameSync(tempFile, outputFile);
  } finally {
    fs.rmSync(tempFile, { force: true });
  }

  const manifest = readManifest(rootDir);
  const replaced = manifest[date] || null;
  manifest[date] = publicPath;
  writeManifest(rootDir, manifest);

  // A corrected opponent name changes the filename; drop the orphaned file.
  if (replaced && replaced !== publicPath) {
    const replacedFile = path.join(rootDir, PUBLIC_DIR, replaced);
    if (replacedFile.startsWith(assetRoot + path.sep)) {
      fs.rmSync(replacedFile, { force: true });
    }
  }

  return {
    publicPath,
    outputFile,
    replaced,
    width: info.width,
    height: info.height,
    bytes: fs.statSync(outputFile).size,
  };
}

async function main(argv) {
  const [image, date, ...opponentWords] = argv;
  const opponent = opponentWords.join(" ").trim();
  if (!image || !date || !opponent) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const result = await addLineChart({
    image: path.resolve(image),
    date,
    opponent,
  });
  console.log(
    `[line-chart] ${date} -> ${result.publicPath} ` +
      `(${result.width}x${result.height}, ${Math.round(result.bytes / 1024)} KB)` +
      (result.replaced ? `; replaced ${result.replaced}` : ""),
  );
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[line-chart] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  addLineChart,
  lineChartPublicPath,
  seasonForDate,
  slugifyOpponent,
  MANIFEST_PATH,
  PUBLIC_DIR,
  ASSET_DIR,
  MAX_WIDTH,
};
