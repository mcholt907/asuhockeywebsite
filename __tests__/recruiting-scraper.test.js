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
    {
      name: "Jane Smith",
      player_link: "https://www.eliteprospects.com/player/111/x",
    },
  ],
  "2027-2028": [
    {
      name: "Bob Jones",
      player_link: "https://www.eliteprospects.com/player/222/x",
    },
  ],
};

jest.mock("../server/services/recruiting-snapshot", () => ({
  ...jest.requireActual("../server/services/recruiting-snapshot"),
  readRecruitingSnapshot: jest.fn(() => snapshotData),
}));

const fs = require("fs");
const path = require("path");
const { getFromCache, saveToCache } = require("../server/cache/caching-system");
const { requestWithRetry } = require("../server/lib/request-helper");
const {
  readRecruitingSnapshot,
} = require("../server/services/recruiting-snapshot");
const {
  fetchRecruitingData,
  scrapeAllRecruitingSeasons,
  scrapeEliteProspectsRecruiting,
  scrapePlayerProfile,
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
  requestWithRetry.mockReset().mockResolvedValue({ data: "<html></html>" });
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
      "2026-2027": [
        { name: "Jane Smith", player_link: "https://example.test/1" },
      ],
    });
    jest.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: 1 });

    await expect(fetchRecruitingData()).resolves.toEqual(snapshotData);
  });
});

describe("scrapeEliteProspectsRecruiting â€” HTML parsing", () => {
  const readFixture = (name) =>
    fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

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

  const singlePlayerFixtureForSeason = (
    season,
    row = rosterRow(
      "17",
      "Jane Smith",
      "F",
      "111",
      "18",
      "2008",
      "Phoenix, AZ",
      "180 cm",
      "172 lbs",
      "L",
    ),
  ) => `
    <section>
      <h3>${season.replace("-", "–")} Arizona State Univ. Roster</h3>
      <table>
        <thead><tr><th></th><th>#</th><th></th><th>Player</th><th>Age</th><th>Born</th><th>Birthplace</th><th>Height</th><th>Weight</th><th>Shoots</th></tr></thead>
        <tbody>${row}</tbody>
      </table>
    </section>`;

  const truncatedPlayerFixture = fixtureHtml.replace(
    /<tr>\s*<td><\/td><td>30<\/td>[\s\S]*?<\/tr>/,
    `
      <tr>
        <td></td><td>30</td><td><img /></td>
        <td><a href="/player/222/x">Bob Jones (G)</a></td><td>19</td>
      </tr>`,
  );

  const movedPlayerLinkFixture = fixtureHtml.replace(
    /<tr>\s*<td><\/td><td>30<\/td>[\s\S]*?<\/tr>/,
    `
      <tr>
        <td><a href="/player/222/x">Bob Jones (G)</a></td><td>30</td><td><img /></td>
        <td></td><td>19</td><td><span title="2007-01-01">2007</span></td>
        <td><a href="/place">Calgary, AB</a></td><td>188 cm</td><td>190 lbs</td><td>L</td>
      </tr>`,
  );

  test("requests the default Elite Prospects season roster route", async () => {
    requestWithRetry.mockResolvedValue({ data: fixtureForSeason("2027-2028") });

    await scrapeEliteProspectsRecruiting("2027-2028", false);

    expect(requestWithRetry).toHaveBeenCalledWith(
      "https://www.eliteprospects.com/team/18066/arizona-state-univ/2027-2028",
    );
  });

  test("direct all-season scrape requests every configured season without cache or fallback recovery", async () => {
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureForSeason("2026-2027") })
      .mockResolvedValueOnce({ data: fixtureForSeason("2027-2028") });

    const result = await scrapeAllRecruitingSeasons({ includePhotos: false });

    expect(Object.keys(result)).toEqual(["2026-2027", "2027-2028"]);
    expect(requestWithRetry.mock.calls.map(([url]) => url)).toEqual([
      "https://www.eliteprospects.com/team/18066/arizona-state-univ/2026-2027",
      "https://www.eliteprospects.com/team/18066/arizona-state-univ/2027-2028",
    ]);
    expect(getFromCache).not.toHaveBeenCalled();
    expect(readRecruitingSnapshot).not.toHaveBeenCalled();
    expect(saveToCache).not.toHaveBeenCalled();
  });

  test("direct all-season scrape rejects when a later configured season fails", async () => {
    requestWithRetry
      .mockResolvedValueOnce({ data: fixtureForSeason("2026-2027") })
      .mockRejectedValueOnce(new Error("later season unavailable"));

    await expect(
      scrapeAllRecruitingSeasons({ includePhotos: false }),
    ).rejects.toThrow("later season unavailable");
    expect(getFromCache).not.toHaveBeenCalled();
    expect(readRecruitingSnapshot).not.toHaveBeenCalled();
    expect(saveToCache).not.toHaveBeenCalled();
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

  test("discovers a semantically headed classless roster with an en dash season", async () => {
    requestWithRetry.mockResolvedValue({
      data: singlePlayerFixtureForSeason("2026-2027"),
    });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).resolves.toEqual([
      expect.objectContaining({
        name: "Jane Smith",
        position: "F",
      }),
    ]);
  });

  test.each([
    ["F", "F"],
    ["C", "C"],
    ["LW", "LW"],
    ["RW", "RW"],
    ["W", "W"],
    ["D", "D"],
    ["LD", "LD"],
    ["RD", "RD"],
    ["G", "G"],
    ["C/RW", "C/RW"],
    ["LW/RW", "LW/RW"],
    ["LD/RD", "LD/RD"],
    [" c / rw ", "C/RW"],
    ["lw", "LW"],
  ])(
    "preserves and normalizes source hockey position %s",
    async (source, expected) => {
      requestWithRetry.mockResolvedValue({
        data: singlePlayerFixtureForSeason(
          "2026-2027",
          rosterRow(
            "17",
            "Jane Smith",
            source,
            "111",
            "18",
            "2008",
            "Phoenix, AZ",
            "180 cm",
            "172 lbs",
            "L",
          ),
        ),
      });

      const [player] = await scrapeEliteProspectsRecruiting("2026-2027", false);

      expect(player.position).toBe(expected);
    },
  );

  test.each([
    [
      "an unsupported player position",
      rosterRow(
        "17",
        "Jane Smith",
        "X",
        "111",
        "18",
        "2008",
        "Phoenix, AZ",
        "180 cm",
        "172 lbs",
        "L",
      ),
    ],
    [
      "a player link outside Elite Prospects",
      rosterRow(
        "17",
        "Jane Smith",
        "F",
        "111",
        "18",
        "2008",
        "Phoenix, AZ",
        "180 cm",
        "172 lbs",
        "L",
      ).replace(
        'href="/player/111/x"',
        'href="https://example.com/player/111/x"',
      ),
    ],
    [
      "duplicate normalized player links",
      `${rosterRow(
        "17",
        "Jane Smith",
        "F",
        "111",
        "18",
        "2008",
        "Phoenix, AZ",
        "180 cm",
        "172 lbs",
        "L",
      )}${rosterRow(
        "18",
        "Duplicate Jane",
        "F",
        "111/x/?source=duplicate",
        "18",
        "2008",
        "Phoenix, AZ",
        "180 cm",
        "172 lbs",
        "L",
      )}`,
    ],
  ])("rejects direct scrape output with %s", async (_, row) => {
    requestWithRetry.mockResolvedValue({
      data: singlePlayerFixtureForSeason("2026-2027", row),
    });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("automated health validation failed");
  });

  test("does not take profile fields from unrelated page-global content", async () => {
    requestWithRetry.mockResolvedValue({
      data: `
        <main>
          <section class="PlayerHeader_root__hash">
            <h1>Jane Smith</h1>
            <img src="https://files.eliteprospects.com/layout/teams/unrelated-logo.png" />
          </section>
          <aside class="PlayerInfo_related__hash">
            <img alt="player promotion" src="https://files.eliteprospects.com/layout/players/unrelated.jpg" />
            <a href="/team/999/unrelated">Unrelated Team</a>
          </aside>
        </main>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test.each([
    [
      "credentials",
      "https://user:credential-secret@www.eliteprospects.com/player/111/jane-smith",
      "credential-secret",
    ],
    [
      "a port",
      "https://www.eliteprospects.com:443/player/111/jane-smith",
      ":443",
    ],
    [
      "a query",
      "https://www.eliteprospects.com/player/111/jane-smith?token=query-secret",
      "query-secret",
    ],
    [
      "a fragment",
      "https://www.eliteprospects.com/player/111/jane-smith#fragment-secret",
      "fragment-secret",
    ],
    [
      "a noncanonical player path",
      "https://www.eliteprospects.com/player/111",
      "/player/111",
    ],
  ])(
    "rejects a profile URL containing %s before logging or requesting it",
    async (_, unsafeUrl, secret) => {
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const error = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(scrapePlayerProfile(unsafeUrl)).resolves.toEqual({
        player_photo: "",
        current_team: "",
      });

      expect(requestWithRetry).not.toHaveBeenCalled();
      const allLogs = [log, warn, error]
        .flatMap((spy) => spy.mock.calls.flat())
        .join(" ");
      expect(allLogs).not.toContain(secret);
    },
  );

  test("fetches a canonical profile URL and logs only its player ID", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    requestWithRetry.mockResolvedValue({ data: "<html><body></body></html>" });

    await scrapePlayerProfile(
      "https://eliteprospects.com/player/111/jane-smith/",
    );

    expect(requestWithRetry).toHaveBeenCalledWith(
      "https://www.eliteprospects.com/player/111/jane-smith",
    );
    expect(log.mock.calls).toEqual([
      ["[Profile Scraper] Fetching profile: playerId=111"],
    ]);
  });

  test.each([
    [
      "a username",
      "https://userinfo-secret@files.eliteprospects.com/layout/players/jane.jpg",
      "userinfo-secret",
    ],
    [
      "a password",
      "https://user:password-secret@files.eliteprospects.com/layout/players/jane.jpg",
      "password-secret",
    ],
    [
      "an explicit port",
      "https://files.eliteprospects.com:443/layout/players/jane.jpg",
      ":443",
    ],
    [
      "a query",
      "https://files.eliteprospects.com/layout/players/jane.jpg?token=query-secret",
      "query-secret",
    ],
    [
      "a fragment",
      "https://files.eliteprospects.com/layout/players/jane.jpg#fragment-secret",
      "fragment-secret",
    ],
  ])(
    "rejects a player image URL containing %s without logging it",
    async (_, unsafeImage, secret) => {
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      requestWithRetry.mockResolvedValue({
        data: `<script type="application/ld+json">
        ${JSON.stringify({
          "@type": "Person",
          "@id": "https://www.eliteprospects.com/player/111/jane-smith",
          name: "Jane Smith",
          image: unsafeImage,
          currentTeam: { name: "Moorhead Spuds" },
        })}
      </script>`,
      });

      await expect(
        scrapePlayerProfile(
          "https://www.eliteprospects.com/player/111/jane-smith",
        ),
      ).resolves.toEqual({
        player_photo: "",
        current_team: "Moorhead Spuds",
      });
      const allLogs = [log, warn, error]
        .flatMap((spy) => spy.mock.calls.flat())
        .join(" ");
      expect(allLogs).not.toContain(secret);
    },
  );

  test("canonicalizes an accepted HTTPS Elite Prospects player image URL", async () => {
    requestWithRetry.mockResolvedValue({
      data: `<script type="application/ld+json">
        ${JSON.stringify({
          "@type": "Person",
          "@id": "https://www.eliteprospects.com/player/111/jane-smith",
          name: "Jane Smith",
          image: "HTTPS://FILES.ELITEPROSPECTS.COM/layout/players/./jane.jpg",
          currentTeam: { name: "Moorhead Spuds" },
        })}
      </script>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({
      player_photo: "https://files.eliteprospects.com/layout/players/jane.jpg",
      current_team: "Moorhead Spuds",
    });
  });

  test("extracts identity-scoped enrichment from current semantic Profile markup", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-marko-semantic.html"),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/709864/marko-bilic",
        { expectedPlayerName: "  MARKO   BILIC " },
      ),
    ).resolves.toEqual({
      player_photo:
        "https://files.eliteprospects.com/layout/players/marko-bilic.jpg",
      current_team: "Chicago Steel",
    });
  });

  test("passes the roster player name into semantic profile identity checks", async () => {
    const roster = singlePlayerFixtureForSeason(
      "2026-2027",
      rosterRow(
        "18",
        "Jane Smith",
        "F",
        "111",
        "18",
        "2008",
        "Phoenix, AZ",
        "180 cm",
        "172 lbs",
        "L",
      ),
    );
    const profile = readFixture("recruiting-profile-marko-semantic.html")
      .replaceAll("709864", "111")
      .replaceAll("marko-bilic", "jane-smith")
      .replaceAll("Marko Bilic", "Jane Smith");
    requestWithRetry.mockImplementation(async (url) => ({
      data: url.includes("/team/18066/") ? roster : profile,
    }));

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", true),
    ).resolves.toEqual([
      expect.objectContaining({
        name: "Jane Smith",
        player_photo:
          "https://files.eliteprospects.com/layout/players/jane-smith.jpg",
        current_team: "Chicago Steel",
      }),
    ]);
  });

  test("rejects semantic enrichment when the unique profile heading is another player", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-marko-semantic.html").replace(
        "<h1>Marko Bilic</h1>",
        "<h1>Wrong Player</h1>",
      ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/709864/marko-bilic",
        { expectedPlayerName: "Marko Bilic" },
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("rejects semantic enrichment when two headers repeat the matching player heading", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-marko-semantic.html").replace(
        "</body>",
        `<header class="Profile_root__duplicateHash">
           <h1>Marko Bilic</h1>
         </header></body>`,
      ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/709864/marko-bilic",
        { expectedPlayerName: "Marko Bilic" },
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("leaves ambiguous identity-compatible semantic candidates blank", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-marko-semantic.html")
        .replace(
          '<div class="ProfileImage_root__currentHash">',
          `<img
             src="https://files.eliteprospects.com/layout/players/marko-second.jpg"
             alt="Marko Bilic"
           />
           <div class="ProfileImage_root__currentHash">`,
        )
        .replace(
          '<a href="/team/3559/chicago-steel">',
          `<a href="/team/1234/another-valid-team">Another Valid Team</a>
           <a href="/team/3559/chicago-steel">`,
        ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/709864/marko-bilic",
        { expectedPlayerName: "Marko Bilic" },
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("prefers explicit JSON-LD currentTeam over conflicting relationship fields", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-jsonld.html"),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({
      player_photo:
        "https://cdn.eliteprospects-assets.com/players/jane-smith.webp",
      current_team: "Moorhead Spuds",
    });
  });

  test("falls through conflicting same-ID JSON-LD People to the next safe profile source", async () => {
    requestWithRetry.mockResolvedValue({
      data: `
        <script type="application/ld+json">
          ${JSON.stringify([
            {
              "@type": "Person",
              "@id": "https://www.eliteprospects.com/player/111/jane-smith",
              name: "Jane Smith",
              image:
                "https://files.eliteprospects.com/layout/players/first-wrong.jpg",
              currentTeam: { name: "First Wrong Team" },
            },
            {
              "@type": "Person",
              "@id": "https://www.eliteprospects.com/player/111/jane-smith",
              name: "Jane Smith",
              image:
                "https://files.eliteprospects.com/layout/players/second-wrong.jpg",
              currentTeam: { name: "Second Wrong Team" },
            },
          ])}
        </script>
        <script id="__NEXT_DATA__" type="application/json">
          ${JSON.stringify({
            props: {
              pageProps: {
                player: {
                  id: 111,
                  name: "Jane Smith",
                  imageUrl:
                    "https://files.eliteprospects.com/layout/players/next-safe.jpg",
                  currentTeam: { name: "Next Safe Team" },
                },
              },
            },
          })}
        </script>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({
      player_photo:
        "https://files.eliteprospects.com/layout/players/next-safe.jpg",
      current_team: "Next Safe Team",
    });
  });

  test("normalizes equivalent nonblank fields across same-ID JSON-LD People", async () => {
    requestWithRetry.mockResolvedValue({
      data: `<script type="application/ld+json">
        ${JSON.stringify([
          {
            "@type": "Person",
            "@id": "https://www.eliteprospects.com/player/111/jane-smith",
            name: "Jane Smith",
            image: "HTTPS://FILES.ELITEPROSPECTS.COM/layout/players/./jane.jpg",
            currentTeam: { name: " Moorhead   Spuds " },
          },
          {
            "@type": "Person",
            "@id": "https://www.eliteprospects.com/player/111/jane-smith",
            name: "Jane Smith",
            image: "https://files.eliteprospects.com/layout/players/jane.jpg",
            currentTeam: { name: "Moorhead Spuds" },
          },
        ])}
      </script>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({
      player_photo: "https://files.eliteprospects.com/layout/players/jane.jpg",
      current_team: "Moorhead Spuds",
    });
  });

  test("accepts memberOf only when it contains one typed SportsTeam", async () => {
    requestWithRetry.mockResolvedValue({
      data: `<script type="application/ld+json">
        ${JSON.stringify({
          "@type": "Person",
          "@id": "https://www.eliteprospects.com/player/111/jane-smith",
          name: "Jane Smith",
          memberOf: [
            { "@type": "Organization", name: "Generic Organization" },
            { "@type": "SportsTeam", name: "Moorhead Spuds" },
          ],
        })}
      </script>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "Moorhead Spuds" });
  });

  test.each([
    [
      "multiple typed memberOf teams",
      {
        memberOf: [
          { "@type": "SportsTeam", name: "First Team" },
          { "@type": "SportsTeam", name: "First Team" },
        ],
      },
    ],
    [
      "a generic affiliation",
      { affiliation: { "@type": "Organization", name: "Generic Org" } },
    ],
    [
      "a worksFor relationship",
      { worksFor: { "@type": "Organization", name: "Employer" } },
    ],
  ])("rejects JSON-LD team enrichment from %s", async (_, relationship) => {
    requestWithRetry.mockResolvedValue({
      data: `<script type="application/ld+json">
        ${JSON.stringify({
          "@type": "Person",
          "@id": "https://www.eliteprospects.com/player/111/jane-smith",
          name: "Jane Smith",
          ...relationship,
        })}
      </script>`,
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("rejects schema.org Person enrichment with a mismatched player ID", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-jsonld.html")
        .replace("/player/111/jane-smith", "/player/999/other-player")
        .replace(
          "</body>",
          `<section class="PlayerHeader_root__legacyHash">
             <img src="https://files.eliteprospects.com/layout/players/wrong-player.jpg" />
             <a href="/team/999/wrong-team">Wrong Team</a>
           </section></body>`,
        ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("uses the authoritative __NEXT_DATA__ page player instead of a preceding historical same-ID player", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-next-data.html"),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/222/bob-jones",
      ),
    ).resolves.toEqual({
      player_photo:
        "https://files.eliteprospects.com/layout/players/bob-jones.jpg",
      current_team: "Calgary Hitmen",
    });
  });

  test("rejects __NEXT_DATA__ enrichment with a mismatched player ID", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-next-data.html").replace(
        '"id": 222,\n              "name": "Bob Jones"',
        '"id": 999,\n              "name": "Bob Jones"',
      ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/222/bob-jones",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
  });

  test("continues the full roster after one classified profile request failure", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    let failedFirstProfile = false;
    requestWithRetry.mockImplementation(async (url) => {
      if (url.includes("/team/18066/")) {
        const season = url.match(/(20\d{2}-20\d{2})$/)[1];
        return { data: fixtureForSeason(season) };
      }
      if (url.includes("/player/111/") && !failedFirstProfile) {
        failedFirstProfile = true;
        throw new Error("profile unavailable secret-response-body");
      }
      return {
        data: url.includes("/player/111/")
          ? readFixture("recruiting-profile-jsonld.html")
          : readFixture("recruiting-profile-next-data.html"),
      };
    });

    const result = await scrapeAllRecruitingSeasons({ includePhotos: true });

    expect(result["2026-2027"].map(({ name }) => name)).toEqual([
      "Jane Smith",
      "Bob Jones",
    ]);
    expect(result["2027-2028"].map(({ name }) => name)).toEqual([
      "Jane Smith",
      "Bob Jones",
    ]);
    expect(result["2026-2027"][1]).toMatchObject({
      player_photo:
        "https://files.eliteprospects.com/layout/players/bob-jones.jpg",
      current_team: "Calgary Hitmen",
    });
    expect(result["2027-2028"][0]).toMatchObject({
      player_photo:
        "https://cdn.eliteprospects-assets.com/players/jane-smith.webp",
      current_team: "Moorhead Spuds",
    });
    const warningText = warning.mock.calls.flat().join(" ");
    const summary = warning.mock.calls
      .map((call) => call.join(" "))
      .find((message) => message.includes("Profile enrichment summary"));
    const enrichmentFailureCount = Number(
      summary?.match(/(?:^|\s)enrichmentFailures=(\d+)(?:\s|$)/)?.[1],
    );
    expect(warningText).toContain("classification=request_error");
    expect(enrichmentFailureCount).toBe(1);
    const allLogs = [log, warning, error]
      .flatMap((spy) => spy.mock.calls.flat())
      .join(" ");
    expect(allLogs).not.toContain("secret-response-body");
  });

  test("classifies unrecognized profile pages and keeps the roster", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    requestWithRetry.mockImplementation(async (url) => {
      if (url.includes("/team/18066/")) {
        const season = url.match(/(20\d{2}-20\d{2})$/)[1];
        return { data: fixtureForSeason(season) };
      }
      return { data: "<html><body><div>not a profile</div></body></html>" };
    });

    const result = await scrapeAllRecruitingSeasons({ includePhotos: true });

    expect(result["2026-2027"]).toHaveLength(2);
    expect(result["2027-2028"]).toHaveLength(2);
    expect(warning.mock.calls.flat().join(" ")).toContain(
      "classification=unrecognized_layout",
    );
  });

  test("classifies a challenge page as a soft profile failure", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    requestWithRetry.mockResolvedValue({
      data: "<html><head><title>Just a moment...</title></head><body>Verify you are human</body></html>",
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({ player_photo: "", current_team: "" });
    expect(warning.mock.calls.flat().join(" ")).toContain(
      "classification=challenge_page",
    );
  });

  test("does not classify incidental captcha text in a script as a challenge page", async () => {
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-jsonld.html").replace(
        "</body>",
        '<script>window.telemetryLabel = "captcha";</script></body>',
      ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/111/jane-smith",
      ),
    ).resolves.toEqual({
      player_photo:
        "https://cdn.eliteprospects-assets.com/players/jane-smith.webp",
      current_team: "Moorhead Spuds",
    });
  });

  test("keeps identity-matched fields while classifying a missing optional photo", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    requestWithRetry.mockResolvedValue({
      data: readFixture("recruiting-profile-marko-semantic.html").replace(
        /<div class="ProfileImage[\s\S]*?<\/div>/,
        "",
      ),
    });

    await expect(
      scrapePlayerProfile(
        "https://www.eliteprospects.com/player/709864/marko-bilic",
        { expectedPlayerName: "Marko Bilic" },
      ),
    ).resolves.toEqual({
      player_photo: "",
      current_team: "Chicago Steel",
    });
    expect(warning.mock.calls.flat().join(" ")).toContain(
      "classification=missing_optional_fields",
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

  test("rejects a full-width row when its player link moved outside the Player cell", async () => {
    requestWithRetry.mockResolvedValue({ data: movedPlayerLinkFixture });

    await expect(
      scrapeEliteProspectsRecruiting("2026-2027", false),
    ).rejects.toThrow("missing a valid player name or link");
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
    readRecruitingSnapshot.mockReturnValueOnce(null);
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
    readRecruitingSnapshot.mockReturnValueOnce(null);
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
    readRecruitingSnapshot.mockReturnValueOnce(null);
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

    expect(result).toEqual(
      expect.objectContaining({
        "2027-2028": expect.any(Array),
      }),
    );
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
