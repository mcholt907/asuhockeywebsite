jest.mock("../server/scrapers", () => ({
  fetchNewsData: jest.fn(),
  fetchScheduleData: jest.fn(),
  scrapeCHNStats: jest.fn(),
  scrapeNCHCStandings: jest.fn(),
  scrapeTransferData: jest.fn(),
  scrapeAlumniData: jest.fn(),
  fetchRecruitingData: jest.fn(),
}));
jest.mock("../server/services/roster-service", () => ({ getRoster: jest.fn() }));
jest.mock("../server/services/static-data", () => ({ getStaticData: jest.fn() }));
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

const team = {
  rank: "9",
  team: "Arizona State",
  pts: "22",
  confRecord: "7-16-1",
  overallRecord: "14-21-1",
  isASU: true,
};

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
      teams: [team],
    });
    const res = responseRecorder();

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        data: [team],
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
      teams: [team],
    });
    const res = responseRecorder();

    await standingsHandler()({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        data: [team],
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
