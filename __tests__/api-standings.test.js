jest.mock("../server/scrapers", () => ({
  fetchNewsData: jest.fn(),
  fetchScheduleData: jest.fn(),
  scrapeCHNStats: jest.fn(),
  scrapeNCHCStandings: jest.fn(),
  scrapeTransferData: jest.fn(),
  scrapeAlumniData: jest.fn(),
  fetchRecruitingData: jest.fn(),
}));
jest.mock("../server/services/roster-service", () => ({
  getRoster: jest.fn(),
}));
jest.mock("../server/services/static-data", () => ({
  getStaticData: jest.fn(),
}));
jest.mock("../server/cache/data-status", () => ({
  getDataStatus: jest.fn(),
  getCooldownStatus: jest.fn(),
}));

const { scrapeNCHCStandings } = require("../server/scrapers");
const router = require("../server/routes/api");

const standingsHandler = () =>
  router.stack.find((layer) => layer.route?.path === "/standings").route
    .stack[0].handle;

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

const teams = require("../data/nchc_standings_fallback.json").teams;
// St. Thomas joined the NCHC for 2026-27, so the current season has 10 teams.
const currentSeasonTeams = [
  ...teams,
  {
    rank: "10",
    team: "St. Thomas",
    pts: "0",
    confRecord: "0-0-0",
    overallRecord: "1-0-0",
    isASU: false,
  },
];

describe("/api/standings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns prior-season standings in the compatible API envelope", async () => {
    scrapeNCHCStandings.mockResolvedValue({
      season: "2025-2026",
      lastUpdated: "2026-07-17T20:09:00.364Z",
      teams,
    });
    const res = responseRecorder();

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        data: teams,
        season: "2025-2026",
        isPriorSeason: true,
        timestamp: expect.any(String),
      }),
    );
  });

  test("marks the configured current-season standings as current", async () => {
    scrapeNCHCStandings.mockResolvedValue({
      season: "2026-2027",
      lastUpdated: "2026-08-12T18:00:00.000Z",
      teams: currentSeasonTeams,
    });
    const res = responseRecorder();

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        data: currentSeasonTeams,
        season: "2026-2027",
        isPriorSeason: false,
      }),
    );
  });

  test("returns a controlled error for an empty snapshot", async () => {
    scrapeNCHCStandings.mockResolvedValue({
      season: "2025-2026",
      lastUpdated: "2026-07-17T20:09:00.364Z",
      teams: [],
    });
    const res = responseRecorder();

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: "Failed to fetch standings data." });
  });

  test("returns the existing internal error when the scraper throws", async () => {
    scrapeNCHCStandings.mockRejectedValue(new Error("standings unavailable"));
    const res = responseRecorder();
    jest.spyOn(console, "error").mockImplementation(() => {});

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({
      error: "Internal server error while fetching standings.",
    });
  });
});
