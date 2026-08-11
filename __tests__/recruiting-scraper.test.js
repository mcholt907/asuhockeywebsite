jest.mock("../server/cache/caching-system", () => ({
  getFromCache: jest.fn(),
  saveToCache: jest.fn(),
}));

jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  metrics: { distribution: jest.fn(), count: jest.fn() },
  captureMessage: jest.fn(),
}));

jest.mock("../config/scraper-config", () => ({
  CURRENT_SEASON: "2025-2026",
  FUTURE_SEASONS: ["2026-2027", "2027-2028"],
  seasons: { current: 2025, stats: "20252026" },
  http: {
    userAgent: "test-agent",
    timeout: 5000,
    retry: { maxRetries: 1, initialDelay: 0, maxDelay: 0 },
    rateLimiting: { delayBetweenRequests: 0 },
  },
  cache: { news: 60000, schedule: 86400000, stats: 21600000 },
  seasonBoundary: { boundaryMonth: 7 },
  urls: {
    chnStats: () => "http://test/stats",
    chnNews: "http://test/chn-news",
    sunDevilsNews: "http://test/sd-news",
    sunDevilsSchedule: () => "http://test/schedule",
  },
}));

const snapshotData = {
  "2026-2027": [
    { name: "Jane Smith", player_link: "https://www.eliteprospects.com/player/111/x" },
  ],
  "2027-2028": [
    { name: "Bob Jones", player_link: "https://www.eliteprospects.com/player/222/x" },
  ],
};

jest.mock("../server/services/recruiting-snapshot", () => ({
  ...jest.requireActual("../server/services/recruiting-snapshot"),
  readRecruitingSnapshot: jest.fn(() => snapshotData),
}));

const fs = require("fs");
const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const { requestWithRetry } = require("../server/lib/request-helper");
const {
  fetchRecruitingData,
  scrapeEliteProspectsRecruiting,
  shouldUseFallbackOnly,
} = require("../server/scrapers/recruiting");

const originalEnvironment = {
  RECRUITING_SCRAPE_LIVE: process.env.RECRUITING_SCRAPE_LIVE,
  NODE_ENV: process.env.NODE_ENV,
  IS_PRERENDER: process.env.IS_PRERENDER,
};

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockReturnValue(undefined);
  requestWithRetry.mockResolvedValue({ data: "<html></html>" });
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("fetchRecruitingData â€” SWR caching", () => {
  test("returns fresh cached data without hitting the network", async () => {
    const freshData = snapshotData;
    getFromCache.mockReturnValueOnce(freshData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(freshData);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("recovers with stale data when a blocking live scrape fails", async () => {
    const staleData = snapshotData;
    getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(staleData);
    requestWithRetry.mockRejectedValue(new Error("EP unavailable"));

    await expect(fetchRecruitingData()).resolves.toEqual(staleData);
  });

  test("ignores a partial cached snapshot in favor of the bundled fallback", async () => {
    getFromCache.mockReturnValue({
      "2026-2027": [{ name: "Jane Smith", player_link: "https://example.test/1" }],
    });
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    await expect(fetchRecruitingData()).resolves.toEqual(snapshotData);
  });
});

describe("scrapeEliteProspectsRecruiting â€” HTML parsing", () => {
  // Defines the semantic roster headers and the corresponding row values.
  const rosterRow = (num, name, pos, playerId, age, born, place, h, w, s) => `
    <tr>
      <td></td><td>${num}</td><td><img /></td>
      <td><div><a href="/player/${playerId}/x">${name} (${pos})</a></div></td>
      <td>${age}</td><td><span title="${born}-01-01">${born}</span></td>
      <td><a href="/place">${place}</a></td><td>${h}</td><td>${w}</td><td>${s}</td>
    </tr>`;

  const fixtureHtml = `
    <html><body>
      <!-- Decoy stats table: has player links but no Age header column -->
      <table>
        <thead><tr><th>#</th><th>Player</th><th>GP</th><th>G</th><th>A</th><th>TP</th><th>PIM</th><th>+/-</th><th>SOG</th><th>SH%</th></tr></thead>
        <tbody>
          <tr>
            <td></td><td>99</td><td></td>
            <td><a href="/player/999/decoy">Decoy Player (F)</a></td>
            <td>34</td><td>12</td><td>20</td><td>32</td><td>14</td><td>+8</td>
          </tr>
        </tbody>
      </table>
      <!-- Real roster table -->
      <div class="LineupCard_wrapper__liveHash">
        <h2>2026-2027 Arizona State Univ. Roster</h2>
      <table>
        <thead><tr><th></th><th>#</th><th></th><th>Player</th><th>Age</th><th>Born</th><th>Birthplace</th><th>Height</th><th>Weight</th><th>Shoots</th></tr></thead>
        <tbody>
          ${rosterRow("17", "Jane Smith", "F", "111", "18", "2008", "Phoenix, AZ", "180 cm", "172 lbs", "L")}
          ${rosterRow("30", "Bob Jones", "G", "222", "19", "2007", "Calgary, AB", "188 cm", "190 lbs", "L")}
          <tr>
            <td></td><td>NCAA</td><td></td><td>Totals</td>
            <td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>
        </tbody>
      </table>
      </div>
      <!-- Duplicate of Jane in a second roster-shaped table (e.g. a widget) -->
      <div class="LineupCard_wrapper__widgetHash">
        <h2>2026-2027 Arizona State Univ. Roster</h2>
      <table>
        <thead><tr><th></th><th>#</th><th></th><th>Player</th><th>Age</th><th>Born</th><th>Birthplace</th><th>Height</th><th>Weight</th><th>Shoots</th></tr></thead>
        <tbody>
          ${rosterRow("17", "Jane Smith", "F", "111", "18", "2008", "Phoenix, AZ", "180 cm", "172 lbs", "L")}
        </tbody>
      </table>
      </div>
    </body></html>`;

  const fixtureForSeason = (season) =>
    fixtureHtml.replaceAll(
      "2026-2027 Arizona State Univ. Roster",
      `${season} Arizona State Univ. Roster`,
    );

  const truncatedPlayerFixture = fixtureHtml.replace(
    /<tr>\s*<td><\/td><td>30<\/td>[\s\S]*?<\/tr>/,
    `
      <tr>
        <td></td><td>30</td><td><img /></td>
        <td><a href="/player/222/x">Bob Jones (G)</a></td><td>19</td>
      </tr>`,
  );

  test("requests the default Elite Prospects season roster route", async () => {
    requestWithRetry.mockResolvedValue({ data: fixtureForSeason("2027-2028") });

    await scrapeEliteProspectsRecruiting("2027-2028", false);

    expect(requestWithRetry).toHaveBeenCalledWith(
      "https://www.eliteprospects.com/team/18066/arizona-state-univ/2027-2028",
    );
  });

  test("parses roster rows by position, skips decoy stats tables, summary rows, and duplicates", async () => {
    requestWithRetry.mockResolvedValue({ data: fixtureHtml });

    const players = await scrapeEliteProspectsRecruiting("2026-2027", false);

    expect(players.map((p) => p.name)).toEqual(["Jane Smith", "Bob Jones"]);

    const jane = players[0];
    expect(jane.number).toBe("17");
    expect(jane.position).toBe("F");
    expect(jane.age).toBe("18");
    expect(jane.birth_year).toBe("2008");
    expect(jane.birthplace).toBe("Phoenix, AZ");
    expect(jane.height).toBe("180 cm");
    expect(jane.weight).toBe("172 lbs");
    expect(jane.shoots).toBe("L");
    expect(jane.player_link).toBe(
      "https://www.eliteprospects.com/player/111/x",
    );
  });

  test("parses the live abbreviated roster headers without accepting the stats decoy", async () => {
    const liveHeaderHtml = fixtureHtml.replaceAll(
      "<th></th><th>#</th><th></th><th>Player</th><th>Age</th><th>Born</th><th>Birthplace</th><th>Height</th><th>Weight</th><th>Shoots</th>",
      "<th></th><th>#</th><th>N</th><th>PLAYER</th><th>A</th><th>BORN</th><th>Birthplace</th><th>HT</th><th>WT</th><th>S</th>",
    );
    requestWithRetry.mockResolvedValue({ data: liveHeaderHtml });

    const players = await scrapeEliteProspectsRecruiting("2026-2027", false);

    expect(players.map((player) => player.name)).toEqual([
      "Jane Smith",
      "Bob Jones",
    ]);
    expect(players[0]).toMatchObject({
      age: "18",
      birth_year: "2008",
      birthplace: "Phoenix, AZ",
      height: "180 cm",
      weight: "172 lbs",
      shoots: "L",
    });
  });

  test("rejects an unrecognized page instead of treating it as an empty roster", async () => {
    requestWithRetry.mockResolvedValue({
      data: "<html><body><p>no tables</p></body></html>",
    });
    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("Unable to identify roster table");
  });

  test("rejects a roster card labeled for a different season", async () => {
    requestWithRetry.mockResolvedValue({
      data: fixtureHtml,
    });

    await expect(
      scrapeEliteProspectsRecruiting("2029-2030", false),
    ).rejects.toThrow("Unable to identify roster table");
  });

  test("rejects a combined-season roster card that mentions the requested season", async () => {
    requestWithRetry.mockResolvedValue({
      data: fixtureHtml.replaceAll(
        "2026-2027 Arizona State Univ. Roster",
        "2029-2030 / 2026-2027 Arizona State Univ. Roster",
      ),
    });

    await expect(
      scrapeEliteProspectsRecruiting("2029-2030", false),
    ).rejects.toThrow("Unable to identify roster table");
  });

  test("recognizes a renamed Age header using roster semantics", async () => {
    requestWithRetry.mockResolvedValue({
      data: fixtureHtml.replace("<th>Age</th>", "<th>Age on Sep. 15</th>"),
    });

    const players = await scrapeEliteProspectsRecruiting("2026-2027", false);

    expect(players.map((player) => player.name)).toEqual([
      "Jane Smith",
      "Bob Jones",
    ]);
  });

  test("maps roster values correctly after an inserted column", async () => {
    const insertedColumnHtml = fixtureHtml
      .replace(
        "<th>Age</th><th>Born</th>",
        "<th>Age</th><th>Status</th><th>Born</th>",
      )
      .replace(
        /<td>(18|19)<\/td><td><span/g,
        "<td>$1</td><td>Committed</td><td><span",
      );
    requestWithRetry.mockResolvedValue({ data: insertedColumnHtml });

    const [jane] = await scrapeEliteProspectsRecruiting("2026-2027", false);

    expect(jane).toMatchObject({
      age: "18",
      birth_year: "2008",
      birthplace: "Phoenix, AZ",
      height: "180 cm",
      weight: "172 lbs",
      shoots: "L",
    });
  });

  test("rejects a player-link decoy without roster headers", async () => {
    requestWithRetry.mockResolvedValue({
      data: `
        <table>
          <thead><tr><th>Player</th><th>GP</th><th>G</th></tr></thead>
          <tbody><tr><td><a href="/player/999/decoy">Decoy Player (F)</a></td><td>34</td><td>12</td></tr></tbody>
        </table>`,
    });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("Unable to identify roster table");
  });

  test("preserves Carson McGinley when Elite Prospects lists him", async () => {
    requestWithRetry.mockResolvedValue({
      data: fixtureHtml.replace("Bob Jones", "Carson McGinley"),
    });

    const players = await scrapeEliteProspectsRecruiting("2026-2027", false);

    expect(players.map((player) => player.name)).toContain("Carson McGinley");
  });

  test("rejects a player-like row without a profile link", async () => {
    requestWithRetry.mockResolvedValue({
      data: fixtureHtml.replace(
        '<a href="/player/222/x">Bob Jones (G)</a>',
        "Bob Jones (G)",
      ),
    });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("missing a valid player name or link");
  });

  test("rejects a truncated player row that still has an Elite Prospects link", async () => {
    requestWithRetry.mockResolvedValue({ data: truncatedPlayerFixture });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("truncated player-like row");
  });

  test("keeps the same player in every Elite Prospects season that lists them", async () => {
    getFromCache.mockReturnValue(null);
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureHtml })
      .mockResolvedValueOnce({ data: fixtureForSeason("2027-2028") });

    const result = await fetchRecruitingData(false, { bypassCache: true });

    expect(result["2026-2027"].map((p) => p.name)).toContain("Jane Smith");
    expect(result["2027-2028"].map((p) => p.name)).toContain("Jane Smith");
  });

  test("does not cache a partial snapshot when one season request fails", async () => {
    getFromCache.mockReturnValue(null);
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureHtml })
      .mockRejectedValueOnce(new Error("second season unavailable"));

    await expect(
      fetchRecruitingData(false, { bypassCache: true }),
    ).rejects.toMatchObject({ code: "RECRUITING_DATA_UNAVAILABLE" });
    expect(saveToCache).not.toHaveBeenCalled();
  });

  test("does not cache a season when a mixed roster contains an unparseable player row", async () => {
    getFromCache.mockReturnValue(null);
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureHtml })
      .mockResolvedValueOnce({
        data: fixtureForSeason("2027-2028").replace(
          '<a href="/player/222/x">Bob Jones (G)</a>',
          "Bob Jones (G)",
        ),
      });

    await expect(
      fetchRecruitingData(false, { bypassCache: true }),
    ).rejects.toMatchObject({ code: "RECRUITING_DATA_UNAVAILABLE" });
    expect(saveToCache).not.toHaveBeenCalled();
  });

  test("uses controlled recovery instead of saving a mixed roster with a truncated player row", async () => {
    getFromCache.mockReturnValue(null);
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureHtml })
      .mockResolvedValueOnce({
        data: truncatedPlayerFixture.replaceAll(
          "2026-2027 Arizona State Univ. Roster",
          "2027-2028 Arizona State Univ. Roster",
        ),
      });

    await expect(
      fetchRecruitingData(false, { bypassCache: true }),
    ).rejects.toMatchObject({ code: "RECRUITING_DATA_UNAVAILABLE" });
    expect(saveToCache).not.toHaveBeenCalled();
  });
});

describe("fallback-only mode", () => {
  test("uses the bundled snapshot without a network request in production", async () => {
    process.env.NODE_ENV = "production";
    getFromCache.mockReturnValue(null);
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    const result = await fetchRecruitingData();

    expect(result).toEqual(expect.objectContaining({
      "2027-2028": expect.any(Array),
    }));
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("throws controlled unavailable data without a network request when the snapshot is missing", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("snapshot missing");
    });

    await expect(fetchRecruitingData()).rejects.toMatchObject({
      code: "RECRUITING_DATA_UNAVAILABLE",
    });
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("does not bypass the production snapshot policy when profiles are requested", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    await expect(fetchRecruitingData(true)).resolves.toEqual(snapshotData);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("production remains fallback-only even when the live flag is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.RECRUITING_SCRAPE_LIVE = "true";
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    await expect(fetchRecruitingData()).resolves.toEqual(snapshotData);
    expect(shouldUseFallbackOnly()).toBe(true);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("prerendering remains fallback-only even when the live flag is set", async () => {
    process.env.IS_PRERENDER = "true";
    process.env.RECRUITING_SCRAPE_LIVE = "true";
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    await expect(fetchRecruitingData()).resolves.toEqual(snapshotData);
    expect(shouldUseFallbackOnly()).toBe(true);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });
});
