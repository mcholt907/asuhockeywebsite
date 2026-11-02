jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
}));
jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@sentry/node", () => ({
  metrics: { distribution: jest.fn(), count: jest.fn() },
}));

const config = require("../config/scraper-config");
const { getFromCache } = require("../server/cache/caching-system");
const { requestWithRetry } = require("../server/lib/request-helper");
const { fetchNewsData } = require("../server/scrapers/news");
const { fetchScheduleData } = require("../server/scrapers/schedule");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("news starts both hosts before either responds and merges by date", async () => {
  const sun = deferred();
  const chn = deferred();
  const started = [];
  requestWithRetry.mockImplementation((url) => {
    started.push(url);
    if (url === config.urls.sunDevilsArticles) return sun.promise;
    if (url === config.urls.chnNews) return chn.promise;
    throw new Error(`Unexpected URL: ${url}`);
  });
  const pending = fetchNewsData();
  const initial = [...started];
  sun.resolve({
    data: {
      data: [
        {
          title: "Older",
          permalink: "https://sun/older",
          published_at: "2026-10-01T12:00:00Z",
        },
      ],
    },
  });
  chn.resolve({
    data: '<div class="newslist"><ul><li>Oct. 02 — <a href="/news/2026/10/02_Newer.php">Newer</a></li></ul></div>',
  });
  const articles = await pending;
  expect(initial).toEqual([config.urls.sunDevilsArticles, config.urls.chnNews]);
  expect(articles.map((a) => a.title)).toEqual(["Newer", "Older"]);
});

test.each([config.urls.sunDevilsArticles, config.urls.chnNews])(
  "news still serves the other source when %s fails",
  async (failedUrl) => {
    requestWithRetry.mockImplementation((url) => {
      if (url === failedUrl) return Promise.reject(new Error("offline"));
      return Promise.resolve({
        data:
          url === config.urls.sunDevilsArticles
            ? {
                data: [
                  {
                    title: "Available",
                    permalink: "https://sun/story",
                    published_at: "2026-10-01T12:00:00Z",
                  },
                ],
              }
            : '<div class="newslist"><ul><li>Oct. 02 — <a href="/news/2026/10/02_Story.php">Available</a></li></ul></div>',
      });
    });
    expect((await fetchNewsData()).map((a) => a.title)).toEqual(["Available"]);
  },
);

function scheduleSources() {
  const sources = new Map([
    [config.urls.sunDevilsSchedules, deferred()],
    [config.urls.sunDevilsScheduleEvents(223), deferred()],
    [config.urls.chnSchedule, deferred()],
    [config.urls.uscho, deferred()],
  ]);
  const started = [];
  requestWithRetry.mockImplementation((url) => {
    started.push(url);
    if (!sources.has(url)) throw new Error(`Unexpected URL: ${url}`);
    return sources.get(url).promise;
  });
  return { sources, started };
}

function resolveSchedule(
  sources,
  events = [
    {
      opponent_name: "Notre Dame",
      datetime: "2026-10-11T02:00:00Z",
      venue_type: "home",
    },
  ],
) {
  sources.get(config.urls.sunDevilsSchedules).resolve({
    data: {
      data: [
        {
          id: 223,
          season: {
            slug: `${config.seasons.current}-${String(config.seasons.current + 1).slice(-2)}`,
          },
        },
      ],
    },
  });
  sources
    .get(config.urls.sunDevilsScheduleEvents(223))
    .resolve({ data: { data: events } });
}

test("schedule overlaps all three hosts and joins links, rankings and record", async () => {
  const { sources, started } = scheduleSources();
  const pending = fetchScheduleData();
  const initial = [...started];
  resolveSchedule(sources);
  sources.get(config.urls.chnSchedule).resolve({
    data: '<h2 class="teamlabel"><small>NPI: 12 KRACH: 15</small></h2><table><tr><td><a href="/box/final/20261010/asu">Box</a><a href="/metrics/asu">Metrics</a></td></tr></table>',
  });
  sources.get(config.urls.uscho).resolve({
    data: `<div id="app" data-page='${JSON.stringify({
      props: {
        content: {
          record: {
            total: { wins: 3, losses: 1, ties: 0 },
            conf: { total: { wins: 1, losses: 0, ties: 0 } },
            home: { wins: 2, losses: 0, ties: 0 },
            road: { wins: 1, losses: 1, ties: 0 },
          },
        },
      },
    })}'></div>`,
  });
  const result = await pending;
  expect(initial).toEqual([
    config.urls.sunDevilsSchedules,
    config.urls.chnSchedule,
    config.urls.uscho,
  ]);
  expect(
    started.indexOf(config.urls.sunDevilsScheduleEvents(223)),
  ).toBeGreaterThan(started.indexOf(config.urls.sunDevilsSchedules));
  expect(result.games[0]).toMatchObject({
    date: "2026-10-10",
    box_link: "https://www.collegehockeynews.com/box/final/20261010/asu",
    metrics_link: "https://www.collegehockeynews.com/metrics/asu",
  });
  expect(result.team_record).toEqual({
    overall: { wins: 3, losses: 1, ties: 0 },
    conf: { wins: 1, losses: 0, ties: 0 },
    home: { wins: 2, losses: 0, ties: 0 },
    away: { wins: 1, losses: 1, ties: 0 },
    npi: 12,
    krach: 15,
  });
});

test("schedule survives both optional sources failing before the schedule responds", async () => {
  const { sources } = scheduleSources();
  const pending = fetchScheduleData();
  sources.get(config.urls.chnSchedule).reject(new Error("CHN offline"));
  sources.get(config.urls.uscho).reject(new Error("USCHO offline"));
  // Resolve in the same turn so even the sequential implementation can finish.
  resolveSchedule(sources);
  const result = await pending;
  expect(result.games).toHaveLength(1);
  expect(result.team_record).toEqual({ npi: null, krach: null });
});

test("empty schedules keep their empty response", async () => {
  const { sources } = scheduleSources();
  const pending = fetchScheduleData();
  resolveSchedule(sources, []);
  sources.get(config.urls.chnSchedule).resolve({ data: "" });
  sources.get(config.urls.uscho).resolve({ data: "" });
  await expect(pending).resolves.toEqual({ games: [], team_record: null });
});

test("a failed schedule keeps optional requests coalesced until they settle", async () => {
  const { sources, started } = scheduleSources();
  sources
    .get(config.urls.sunDevilsSchedules)
    .reject(new Error("schedule offline"));
  const first = fetchScheduleData();
  await new Promise(setImmediate);
  const second = fetchScheduleData();
  await new Promise(setImmediate);
  const optionalStarts = started.filter(
    (url) => url === config.urls.chnSchedule || url === config.urls.uscho,
  );
  sources.get(config.urls.chnSchedule).resolve({ data: "" });
  sources.get(config.urls.uscho).resolve({ data: "" });
  await expect(first).resolves.toEqual({ games: [], team_record: null });
  await expect(second).resolves.toEqual({ games: [], team_record: null });
  expect(optionalStarts).toEqual([config.urls.chnSchedule, config.urls.uscho]);
});

test.each([fetchNewsData, fetchScheduleData])(
  "cache hits skip live sources (%#)",
  async (fetchData) => {
    const cached =
      fetchData === fetchNewsData
        ? [{ title: "Cached" }]
        : { games: [{ opponent: "Cached" }], team_record: null };
    getFromCache.mockReturnValue(cached);
    await expect(fetchData()).resolves.toEqual(cached);
    expect(requestWithRetry).not.toHaveBeenCalled();
  },
);
