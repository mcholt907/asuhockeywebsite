const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Exercise the actual CLI with a network boundary that can return old data
// through the serving API, while the live scrape succeeds or fails separately.
function runRefresh(liveSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-alumni-"));
  for (const directory of ["scripts", "server/scrapers", "data"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  const file = path.join(root, "data/asu_alumni_fallback.json");
  fs.writeFileSync(file, "previous snapshot bytes");
  fs.copyFileSync(
    path.resolve(__dirname, "../scripts/refresh-alumni.js"),
    path.join(root, "scripts/refresh-alumni.js"),
  );
  fs.writeFileSync(
    path.join(root, "server/scrapers/alumni.js"),
    `exports.scrapeAlumniData = async () => ({ skaters: [{name: 'old'}], goalies: [{name: 'old'}], lastUpdated: '2026-10-19T13:02:55.267Z' });
     exports.scrapeAlumniLive = async () => { ${liveSource} };`,
  );
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/refresh-alumni.js")],
      { encoding: "utf8" },
    );
    return { ...result, contents: fs.readFileSync(file, "utf8") };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("fails and preserves the snapshot when live scraping fails despite available fallback data", () => {
  const result = runRefresh("throw new Error('upstream blocked');");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("upstream blocked");
  expect(result.contents).toBe("previous snapshot bytes");
});

test("rejects an empty live scrape instead of republishing cached data", () => {
  const result = runRefresh("return {skaters: [], goalies: []};");
  expect(result.status).toBe(1);
  expect(result.contents).toBe("previous snapshot bytes");
});

test("publishes the live result even when a cached serving result exists", () => {
  const result = runRefresh(
    "return {skaters: [{name: 'fresh skater'}], goalies: [{name: 'fresh goalie'}], lastUpdated: '2026-11-04T15:00:00.000Z'};",
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.contents)).toEqual({
    skaters: [{ name: "fresh skater" }],
    goalies: [{ name: "fresh goalie" }],
    lastUpdated: "2026-11-04T15:00:00.000Z",
  });
});
