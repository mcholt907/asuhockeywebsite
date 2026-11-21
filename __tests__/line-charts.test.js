const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const {
  addLineChart,
  lineChartPublicPath,
  seasonForDate,
  slugifyOpponent,
  MANIFEST_PATH,
  PUBLIC_DIR,
  MAX_WIDTH,
} = require("../scripts/add-line-chart");

const ROOT = path.join(__dirname, "..");

describe("line chart naming", () => {
  it("assigns fall games to the season starting that year", () => {
    expect(seasonForDate("2026-10-02")).toBe("2026-2027");
    expect(seasonForDate("2026-08-01")).toBe("2026-2027");
  });

  it("assigns winter and spring games to the season that began the prior fall", () => {
    expect(seasonForDate("2027-01-15")).toBe("2026-2027");
    expect(seasonForDate("2027-04-11")).toBe("2026-2027");
  });

  it("rejects malformed or impossible dates", () => {
    expect(() => seasonForDate("10/02/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => seasonForDate("2026-13-01")).toThrow(/calendar date/);
    expect(() => seasonForDate("2027-02-30")).toThrow(/calendar date/);
  });

  it("slugifies opponents and drops poll rankings", () => {
    expect(slugifyOpponent("#5 Minnesota Duluth")).toBe("minnesota-duluth");
    expect(slugifyOpponent("St. Cloud State")).toBe("st-cloud-state");
    expect(slugifyOpponent("UMass Lowell")).toBe("umass-lowell");
    expect(slugifyOpponent("Québec")).toBe("quebec");
    expect(() => slugifyOpponent("  ")).toThrow(/required/);
  });

  it("builds a season-scoped public path", () => {
    expect(lineChartPublicPath("2026-11-20", "#5 Minnesota Duluth")).toBe(
      "/assets/line-charts/2026-2027/2026-11-20-minnesota-duluth.webp",
    );
  });
});

describe("committed line chart manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8"),
  );

  it("maps each game date to its own season-scoped WebP that exists", () => {
    const entries = Object.entries(manifest);
    expect(entries.length).toBeGreaterThan(0);
    for (const [date, publicPath] of entries) {
      const prefix = `/assets/line-charts/${seasonForDate(date)}/${date}-`;
      expect(publicPath.startsWith(prefix)).toBe(true);
      expect(publicPath).toMatch(/^[a-z0-9/.-]+\.webp$/);
      expect(fs.existsSync(path.join(ROOT, PUBLIC_DIR, publicPath))).toBe(true);
    }
  });

  it("has no line chart image without a manifest entry", () => {
    const assetRoot = path.join(ROOT, PUBLIC_DIR, "assets", "line-charts");
    const files = fs
      .readdirSync(assetRoot, { recursive: true })
      .filter((file) => String(file).endsWith(".webp"))
      .map((file) => `/assets/line-charts/${String(file).split(path.sep).join("/")}`);
    expect(files.sort()).toEqual(Object.values(manifest).sort());
  });
});

describe("addLineChart", () => {
  let rootDir;
  let sourceImage;

  beforeEach(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "line-charts-"));
    sourceImage = path.join(rootDir, "source.png");
    await sharp({
      create: { width: 2000, height: 2600, channels: 3, background: "#8c1d40" },
    })
      .png()
      .toFile(sourceImage);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("writes a width-capped WebP and records it in the manifest", async () => {
    const result = await addLineChart({
      image: sourceImage,
      date: "2026-11-21",
      opponent: "#5 Minnesota Duluth",
      rootDir,
    });

    expect(result.publicPath).toBe(
      "/assets/line-charts/2026-2027/2026-11-21-minnesota-duluth.webp",
    );
    const metadata = await sharp(result.outputFile).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(MAX_WIDTH);
    expect(metadata.height).toBe(2080);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, MANIFEST_PATH), "utf8"),
    );
    expect(manifest).toEqual({ "2026-11-21": result.publicPath });
  });

  it("replaces a date's chart and removes the file it supersedes", async () => {
    const first = await addLineChart({
      image: sourceImage,
      date: "2026-11-21",
      opponent: "Duluth",
      rootDir,
    });
    const second = await addLineChart({
      image: sourceImage,
      date: "2026-11-21",
      opponent: "Minnesota Duluth",
      rootDir,
    });

    expect(second.replaced).toBe(first.publicPath);
    expect(fs.existsSync(first.outputFile)).toBe(false);
    expect(fs.existsSync(second.outputFile)).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, MANIFEST_PATH), "utf8"),
    );
    expect(manifest).toEqual({ "2026-11-21": second.publicPath });
  });

  it("keeps the manifest sorted by game date", async () => {
    for (const date of ["2026-11-21", "2026-10-02", "2027-01-08"]) {
      await addLineChart({ image: sourceImage, date, opponent: "Denver", rootDir });
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, MANIFEST_PATH), "utf8"),
    );
    expect(Object.keys(manifest)).toEqual([
      "2026-10-02",
      "2026-11-21",
      "2027-01-08",
    ]);
  });

  it("fails without touching the manifest when the image is missing", async () => {
    await expect(
      addLineChart({
        image: path.join(rootDir, "missing.jpg"),
        date: "2026-11-21",
        opponent: "Denver",
        rootDir,
      }),
    ).rejects.toThrow(/Image not found/);
    expect(fs.existsSync(path.join(rootDir, MANIFEST_PATH))).toBe(false);
  });
});
