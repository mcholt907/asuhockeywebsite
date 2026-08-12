jest.mock("@sentry/node", () => ({
  metrics: { distribution: jest.fn() },
}));
jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
}));
jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
}));
jest.mock("../server/services/standings-snapshot", () => {
  const actual = jest.requireActual("../server/services/standings-snapshot");
  return { ...actual, readStandingsFallback: jest.fn() };
});

function uschoHtml(rows) {
  const page = { props: { content: { data: { nt: rows } } } };
  const encoded = JSON.stringify(page)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<div id="app" data-page="${encoded}"></div>`;
}

const fallbackSnapshot = require("../data/nchc_standings_fallback.json");
const config = require("../config/scraper-config");
const { requestWithRetry } = require("../server/lib/request-helper");
const {
  getFromCache,
  saveToCache,
} = require("../server/cache/caching-system");
const {
  readStandingsFallback,
} = require("../server/services/standings-snapshot");
const {
  StandingsNotPublishedError,
  parseUSCHOStandings,
  scrapeNCHCStandings,
} = require("../server/scrapers/standings");

function validRows(overallRecord = "1-0-0") {
  return fallbackSnapshot.teams.map((team) => ({
    team: team.team,
    pts: 3,
    "conf-w-l-t": "1-0-0",
    "w-l-t": overallRecord,
  }));
}

function currentSeasonSnapshot(overallRecord = "1-0-0") {
  return {
    season: config.CURRENT_SEASON,
    lastUpdated: "2026-10-01T00:00:00.000Z",
    teams: fallbackSnapshot.teams.map((team) => ({
      ...team,
      confRecord: overallRecord,
      overallRecord,
    })),
  };
}

function invalidLiveRows(kind) {
  const rows = validRows();
  if (kind === "truncated table") rows.pop();
  if (kind === "duplicate normalized team") {
    rows[1].team = "  NORTH   DAKOTA ";
  }
  if (kind === "missing ASU row") rows[8].team = "Bemidji State";
  if (kind === "duplicate ASU row") rows[0].team = "Arizona State University";
  return rows;
}

function invalidCacheSnapshot(kind) {
  if (kind === "malformed") return { season: config.CURRENT_SEASON, teams: [] };
  if (kind === "all-zero") return currentSeasonSnapshot("0-0-0");
  if (kind === "season-mismatched") {
    return { ...currentSeasonSnapshot(), season: "2025-2026" };
  }
  const snapshot = currentSeasonSnapshot();
  if (kind === "truncated table") snapshot.teams.pop();
  if (kind === "duplicate normalized team") {
    snapshot.teams[1].team = "  NORTH   DAKOTA ";
  }
  if (kind === "duplicate rank") snapshot.teams[1].rank = "1";
  if (kind === "missing ASU row") snapshot.teams[8].isASU = false;
  if (kind === "duplicate ASU row") snapshot.teams[0].isASU = true;
  if (
    [
      "truncated table",
      "duplicate normalized team",
      "duplicate rank",
      "missing ASU row",
      "duplicate ASU row",
    ].includes(kind)
  ) {
    return snapshot;
  }
  throw new Error(`Unknown cache fixture: ${kind}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  getFromCache.mockReturnValue(null);
  saveToCache.mockResolvedValue(undefined);
  readStandingsFallback.mockReturnValue(fallbackSnapshot);
});

test("parses a complete NCHC table without treating all-zero rows as played", () => {
  const teams = parseUSCHOStandings(uschoHtml(validRows("0-0-0")));
  expect(teams).toHaveLength(9);
  expect(teams[8]).toEqual(
    expect.objectContaining({
      team: "Arizona State",
      overallRecord: "0-0-0",
      isASU: true,
    }),
  );
});

test("throws a typed error when the NCHC dataset is missing", () => {
  expect(() => parseUSCHOStandings(uschoHtml(undefined))).toThrow(
    "No NCHC data found in USCHO response",
  );
  try {
    parseUSCHOStandings(uschoHtml(undefined));
  } catch (error) {
    expect(error).toBeInstanceOf(StandingsNotPublishedError);
    expect(error.code).toBe("STANDINGS_NOT_PUBLISHED");
  }
});

test("returns the prior-season fallback without caching unpublished all-zero standings", async () => {
  requestWithRetry.mockResolvedValue({ data: uschoHtml(validRows("0-0-0")) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
  expect(saveToCache).not.toHaveBeenCalled();
});

test.each([
  "truncated table",
  "duplicate normalized team",
  "missing ASU row",
  "duplicate ASU row",
])("does not cache an incomplete live %s and recovers the fallback", async (kind) => {
  requestWithRetry.mockResolvedValue({ data: uschoHtml(invalidLiveRows(kind)) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
  expect(saveToCache).not.toHaveBeenCalled();
  expect(readStandingsFallback).toHaveBeenCalledTimes(1);
});

test("caches a season-tagged snapshot after the first current-season game", async () => {
  requestWithRetry.mockResolvedValue({ data: uschoHtml(validRows()) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(
    expect.objectContaining({ season: config.CURRENT_SEASON }),
  );
  expect(saveToCache).toHaveBeenCalledWith(
    expect.objectContaining({ teams: expect.any(Array) }),
    `nchc_standings_${config.CURRENT_SEASON}`,
    expect.any(Number),
  );
});

test.each(["malformed", "all-zero", "season-mismatched"])(
  "ignores a %s fresh cache candidate and recovers the fallback after live failure",
  async (kind) => {
    getFromCache
      .mockReturnValueOnce(invalidCacheSnapshot(kind))
      .mockReturnValue(null);
    requestWithRetry.mockRejectedValue(new Error("network down"));

    await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
    expect(requestWithRetry).toHaveBeenCalledTimes(1);
    expect(readStandingsFallback).toHaveBeenCalledTimes(1);
  },
);

test.each([
  "truncated table",
  "duplicate normalized team",
  "duplicate rank",
  "missing ASU row",
  "duplicate ASU row",
])("ignores a fresh cache with a %s and recovers the fallback", async (kind) => {
  getFromCache
    .mockReturnValueOnce(invalidCacheSnapshot(kind))
    .mockReturnValue(null);
  requestWithRetry.mockRejectedValue(new Error("network down"));

  await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
  expect(requestWithRetry).toHaveBeenCalledTimes(1);
  expect(readStandingsFallback).toHaveBeenCalledTimes(1);
});

test.each(["malformed", "all-zero", "season-mismatched"])(
  "ignores a %s stale cache candidate and recovers the fallback after live failure",
  async (kind) => {
    const invalid = invalidCacheSnapshot(kind);
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(invalid)
      .mockReturnValueOnce(invalid);
    requestWithRetry.mockRejectedValue(new Error("network down"));

    await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
    expect(readStandingsFallback).toHaveBeenCalledTimes(1);
  },
);

test("returns a valid current-season fresh cache without scraping", async () => {
  const cached = currentSeasonSnapshot();
  getFromCache.mockReturnValueOnce(cached);

  await expect(scrapeNCHCStandings()).resolves.toEqual(cached);
  expect(requestWithRetry).not.toHaveBeenCalled();
  expect(readStandingsFallback).not.toHaveBeenCalled();
});

test("preserves valid stale current-season cache priority over fallback", async () => {
  const stale = currentSeasonSnapshot();
  getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(stale);
  requestWithRetry.mockResolvedValue({ data: uschoHtml(validRows("2-0-0")) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(stale);
  expect(readStandingsFallback).not.toHaveBeenCalled();
});

test("recovers from a network failure with a valid stale current-season snapshot", async () => {
  const staleSnapshot = currentSeasonSnapshot();
  requestWithRetry.mockRejectedValue(new Error("network down"));
  getFromCache.mockReturnValue(staleSnapshot);

  await expect(
    scrapeNCHCStandings(false, { bypassCache: true }),
  ).resolves.toEqual(staleSnapshot);
  expect(readStandingsFallback).not.toHaveBeenCalled();
});

test("recovers from a cold-cache network failure with the bundled fallback", async () => {
  requestWithRetry.mockRejectedValue(new Error("network down"));

  await expect(
    scrapeNCHCStandings(false, { bypassCache: true }),
  ).resolves.toEqual(fallbackSnapshot);
  expect(readStandingsFallback).toHaveBeenCalledTimes(1);
});
