jest.mock("../server/scrapers", () => ({
  scrapeAlumniData: jest.fn(),
  fetchRecruitingData: jest.fn(),
}));
jest.mock("../server/services/roster-service", () => ({
  getRoster: jest.fn(),
}));
jest.mock("../server/cache/data-status", () => ({
  getDataStatus: jest.fn(),
  getCooldownStatus: jest.fn(),
}));

const { scrapeAlumniData, fetchRecruitingData } = require("../server/scrapers");
const router = require("../server/routes/api");
const handler = router.stack.find((layer) => layer.route?.path === "/alumni")
  .route.stack[0].handle;
const alumni = {
  skaters: [
    { name: "Alumnus", playerId: "1" },
    { name: "Recruit", playerId: "2" },
  ],
  goalies: [],
  lastUpdated: "2026-11-02",
};

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function response() {
  return {
    statusCode: 200,
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
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("alumni loads its recruit filter while alumni is pending", async () => {
  const data = deferred();
  const recruiting = deferred();
  scrapeAlumniData.mockReturnValue(data.promise);
  fetchRecruitingData.mockReturnValue(recruiting.promise);
  const res = response();
  const pending = handler({}, res);
  const filterStarted = fetchRecruitingData.mock.calls.length;
  recruiting.resolve({
    "2027-2028": [
      { player_link: "https://www.eliteprospects.com/player/2/recruit" },
    ],
  });
  data.resolve(alumni);
  await pending;
  expect(filterStarted).toBe(1);
  expect(res.payload).toEqual({
    ...alumni,
    skaters: [{ name: "Alumnus", playerId: "1" }],
  });
});

test("a rejected recruit filter still serves unfiltered alumni", async () => {
  const data = deferred();
  scrapeAlumniData.mockReturnValue(data.promise);
  fetchRecruitingData.mockRejectedValue(new Error("recruiting offline"));
  const res = response();
  const pending = handler({}, res);
  await new Promise(setImmediate);
  data.resolve(alumni);
  await pending;
  expect(res.statusCode).toBe(200);
  expect(res.payload).toEqual(alumni);
});

test("alumni failure responds without waiting for a pending recruit filter", async () => {
  const recruiting = deferred();
  scrapeAlumniData.mockRejectedValue(new Error("alumni offline"));
  fetchRecruitingData.mockReturnValue(recruiting.promise);
  const res = response();
  await handler({}, res);
  recruiting.reject(new Error("late filter failure"));
  await new Promise(setImmediate);
  expect(res.statusCode).toBe(500);
  expect(res.payload).toEqual({
    error: "Failed to fetch alumni data",
    message: "alumni offline",
  });
});
