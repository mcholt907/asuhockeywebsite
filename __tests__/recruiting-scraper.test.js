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
}));

jest.mock("../config/scraper-config", () => ({
  CURRENT_SEASON: "2025-2026",
  FUTURE_SEASONS: ["2026-2027"],
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

const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const { requestWithRetry } = require("../server/lib/request-helper");
const {
  fetchRecruitingData,
  scrapeEliteProspectsRecruiting,
} = require("../server/scrapers/recruiting");

beforeEach(() => {
  jest.clearAllMocks();
  saveToCache.mockReturnValue(undefined);
  requestWithRetry.mockResolvedValue({ data: "<html></html>" });
});

describe("fetchRecruitingData â€” SWR caching", () => {
  test("returns fresh cached data without hitting the network", async () => {
    const freshData = { "2026-2027": [{ name: "Jane Smith" }] };
    getFromCache.mockReturnValueOnce(freshData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(freshData);
    expect(requestWithRetry).not.toHaveBeenCalled();
  });

  test("returns stale data immediately when cache is expired", async () => {
    const staleData = { "2026-2027": [{ name: "John Doe" }] };
    getFromCache.mockReturnValueOnce(null).mockReturnValueOnce(staleData);

    const result = await fetchRecruitingData();

    expect(result).toEqual(staleData);
  });
});

describe("scrapeEliteProspectsRecruiting â€” HTML parsing", () => {
  // Pins the positional cell contract the parser relies on:
  // td[1]=number, td[3]=player link, td[4]=age, td[5]=birth year,
  // td[6]=birthplace, td[7]=height, td[8]=weight, td[9]=shoots.
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
      <!-- Duplicate of Jane in a second roster-shaped table (e.g. a widget) -->
      <table>
        <thead><tr><th></th><th>#</th><th></th><th>Player</th><th>Age</th><th>Born</th><th>Birthplace</th><th>Height</th><th>Weight</th><th>Shoots</th></tr></thead>
        <tbody>
          ${rosterRow("17", "Jane Smith", "F", "111", "18", "2008", "Phoenix, AZ", "180 cm", "172 lbs", "L")}
        </tbody>
      </table>
    </body></html>`;

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

  test("returns empty array when the page has no player tables", async () => {
    requestWithRetry.mockResolvedValue({
      data: "<html><body><p>no tables</p></body></html>",
    });
    const players = await scrapeEliteProspectsRecruiting("2026-2027", false);
    expect(players).toEqual([]);
  });
});
