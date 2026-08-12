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

const row = (overall = "0-0-0") => ({
  team: "Arizona State",
  pts: 0,
  "conf-w-l-t": "0-0-0",
  "w-l-t": overall,
});

const fallbackSnapshot = require("../data/nchc_standings_fallback.json");
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

beforeEach(() => {
  jest.clearAllMocks();
  getFromCache.mockReturnValue(null);
  saveToCache.mockResolvedValue(undefined);
  readStandingsFallback.mockReturnValue(fallbackSnapshot);
});

test("parses a valid NCHC table without treating all-zero rows as played", () => {
  const teams = parseUSCHOStandings(uschoHtml([row()]));
  expect(teams[0]).toEqual(
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
  requestWithRetry.mockResolvedValue({ data: uschoHtml([row("0-0-0")]) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(fallbackSnapshot);
  expect(saveToCache).not.toHaveBeenCalled();
});

test("caches a season-tagged snapshot after the first current-season game", async () => {
  requestWithRetry.mockResolvedValue({ data: uschoHtml([row("1-0-0")]) });

  await expect(scrapeNCHCStandings()).resolves.toEqual(
    expect.objectContaining({ season: "2026-2027" }),
  );
  expect(saveToCache).toHaveBeenCalledWith(
    expect.objectContaining({ teams: expect.any(Array) }),
    "nchc_standings_2026-2027",
    expect.any(Number),
  );
});

test("recovers from a network failure with a stale current-season snapshot", async () => {
  const staleSnapshot = {
    season: "2026-2027",
    lastUpdated: "2026-10-01T00:00:00.000Z",
    teams: [
      {
        rank: "1",
        team: "Arizona State",
        pts: "3",
        confRecord: "1-0-0",
        overallRecord: "1-0-0",
        isASU: true,
      },
    ],
  };
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
