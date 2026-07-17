// Tests for the shared scrape pipeline (server-side Jest)
// Run: npx jest --config jest.server.config.js

jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/node", () => ({
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const { createCachedScraper } = require("../server/scrapers/create-cached-scraper");

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockResolvedValue(undefined);
});

function makeScraper(overrides = {}) {
  return createCachedScraper({
    name: "test",
    cacheKey: "test_key",
    ttl: 1000,
    scrape: jest.fn().mockResolvedValue(["fresh"]),
    validate: (d) => d.length > 0,
    ...overrides,
  });
}

describe("createCachedScraper", () => {
  test("returns fresh cache without scraping", async () => {
    const scrape = jest.fn();
    getFromCache.mockReturnValueOnce(["cached"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["cached"]);
    expect(scrape).not.toHaveBeenCalled();
  });

  test("applies normalizeCached to fresh cache", async () => {
    getFromCache.mockReturnValueOnce({ data: ["wrapped"] });
    const fetchData = makeScraper({
      normalizeCached: (c) => (Array.isArray(c) ? c : c.data),
    });
    await expect(fetchData()).resolves.toEqual(["wrapped"]);
  });

  test("SWR: serves stale immediately and refreshes in background", async () => {
    const scrape = jest.fn().mockResolvedValue(["new"]);
    // 1st call: fresh miss; 2nd call: stale hit
    getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(["stale"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["stale"]);
    await flush();
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(saveToCache).toHaveBeenCalledWith(["new"], "test_key", 1000);
  });

  test("force skips fresh cache but still serves stale via SWR", async () => {
    const scrape = jest.fn().mockResolvedValue(["new"]);
    getFromCache.mockReturnValueOnce(["stale"]); // first read is the stale read (fresh check skipped)
    const fetchData = makeScraper({ scrape });
    await expect(fetchData({ force: true })).resolves.toEqual(["stale"]);
    await flush();
    expect(scrape).toHaveBeenCalledTimes(1);
    // fresh-cache read (ignoreExpiration omitted) never happened
    expect(getFromCache).toHaveBeenCalledWith("test_key", true);
    expect(getFromCache).not.toHaveBeenCalledWith("test_key");
  });

  test("no cache at all: blocks on scrape, validates, saves", async () => {
    getFromCache.mockReturnValue(null);
    const fetchData = makeScraper();
    await expect(fetchData()).resolves.toEqual(["fresh"]);
    expect(saveToCache).toHaveBeenCalledWith(["fresh"], "test_key", 1000);
  });

  test("coalesces concurrent blocking scrapes into one", async () => {
    getFromCache.mockReturnValue(null);
    let release;
    const scrape = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(["fresh"]);
        }),
    );
    const fetchData = makeScraper({ scrape });
    const p1 = fetchData();
    const p2 = fetchData();
    await flush();
    release();
    await expect(p1).resolves.toEqual(["fresh"]);
    await expect(p2).resolves.toEqual(["fresh"]);
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  test("validation failure: does not cache; returns stale if present, else raw result", async () => {
    const scrape = jest.fn().mockResolvedValue([]);
    // fresh miss, swr-stale miss, recovery-stale hit
    getFromCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(["stale"]);
    const fetchData = makeScraper({ scrape });
    await expect(fetchData()).resolves.toEqual(["stale"]);
    expect(saveToCache).not.toHaveBeenCalled();

    getFromCache.mockReturnValue(null);
    await expect(fetchData()).resolves.toEqual([]);
  });

  test("scrape error: stale, then fallback, then onScrapeError, then rethrow", async () => {
    getFromCache.mockReturnValue(null);
    const boom = jest.fn().mockRejectedValue(new Error("boom"));

    const withHandler = makeScraper({ scrape: boom, onScrapeError: () => ["empty"] });
    await expect(withHandler()).resolves.toEqual(["empty"]);

    const withFallback = makeScraper({ scrape: boom, fallback: () => ["fb"] });
    await expect(withFallback()).resolves.toEqual(["fb"]);

    const bare = makeScraper({ scrape: boom });
    await expect(bare()).rejects.toThrow("boom");
  });

  test("fallbackOnly short-circuits before scraping", async () => {
    getFromCache.mockReturnValue(null);
    const scrape = jest.fn();
    const fetchData = makeScraper({
      scrape,
      swr: false,
      fallbackOnly: () => true,
      fallback: () => ["bundled"],
    });
    await expect(fetchData()).resolves.toEqual(["bundled"]);
    expect(scrape).not.toHaveBeenCalled();
  });

  test("swr: false blocks on scrape when cache is expired", async () => {
    getFromCache.mockReturnValue(null);
    const scrape = jest.fn().mockResolvedValue(["live"]);
    const fetchData = makeScraper({ scrape, swr: false });
    await expect(fetchData()).resolves.toEqual(["live"]);
    // only the fresh read happened before scraping — no stale (true) read pre-scrape
    expect(getFromCache).toHaveBeenCalledWith("test_key");
  });

  test("bypassCache skips all cache reads and passes scrapeArgs", async () => {
    const scrape = jest.fn().mockResolvedValue(["photos"]);
    const fetchData = makeScraper({ scrape });
    await expect(
      fetchData({ bypassCache: true, scrapeArgs: { includePhotos: true } }),
    ).resolves.toEqual(["photos"]);
    expect(scrape).toHaveBeenCalledWith({ includePhotos: true });
    // no plain fresh-cache read occurred
    expect(getFromCache).not.toHaveBeenCalledWith("test_key");
  });

  test("cacheKey function is resolved per call", async () => {
    let season = 2025;
    getFromCache.mockReturnValue(null);
    const fetchData = makeScraper({ cacheKey: () => `key_${season}` });
    await fetchData();
    expect(saveToCache).toHaveBeenCalledWith(expect.anything(), "key_2025", 1000);
    season = 2026;
    await fetchData();
    expect(saveToCache).toHaveBeenCalledWith(expect.anything(), "key_2026", 1000);
  });
});
