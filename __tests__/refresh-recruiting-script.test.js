const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../server/scrapers/recruiting", () => ({
  scrapeAllRecruitingSeasons: jest.fn(),
}));

const { runRecruitingRefresh } = require("../scripts/refresh-recruiting");

const player = (id, overrides = {}) => ({
  number: "",
  name: `Player ${id}`,
  position: "F",
  age: "18",
  birth_year: "2008",
  birthplace: "Phoenix, AZ, USA",
  height: "6'0\"",
  weight: "180",
  shoots: "L",
  player_link: `https://www.eliteprospects.com/player/${id}/player-${id}`,
  player_photo: "",
  current_team: "Test Team",
  ...overrides,
});

describe("runRecruitingRefresh", () => {
  let directory;
  let dataFile;
  let stateFile;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-script-"));
    dataFile = path.join(directory, "asu_hockey_data.json");
    stateFile = path.join(directory, "asu_recruiting_refresh_state.json");
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ recruiting: { "2027-2028": [] } }),
    );
    fs.writeFileSync(stateFile, JSON.stringify({ version: 1, misses: {} }));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("persists a validated merged snapshot", async () => {
    const summary = await runRecruitingRefresh({
      dataFile,
      stateFile,
      seasons: ["2027-2028"],
      scrape: async () => ({ "2027-2028": [player(2)] }),
    });

    expect(summary.added).toBe(1);
    expect(
      JSON.parse(fs.readFileSync(dataFile, "utf8")).recruiting["2027-2028"],
    ).toEqual([player(2)]);
  });

  test("leaves both files byte-for-byte unchanged after an invalid snapshot", async () => {
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ recruiting: { "2027-2028": [player(1)] } }),
    );
    const originalData = fs.readFileSync(dataFile, "utf8");
    const originalState = fs.readFileSync(stateFile, "utf8");

    await expect(
      runRecruitingRefresh({
        dataFile,
        stateFile,
        seasons: ["2027-2028"],
        scrape: async () => ({ "2027-2028": [] }),
      }),
    ).rejects.toThrow(
      "Recruiting snapshot season 2027-2028 unexpectedly became empty",
    );

    expect(fs.readFileSync(dataFile, "utf8")).toBe(originalData);
    expect(fs.readFileSync(stateFile, "utf8")).toBe(originalState);
  });

  test("creates an empty removal state when the state file is absent", async () => {
    fs.unlinkSync(stateFile);

    await runRecruitingRefresh({
      dataFile,
      stateFile,
      seasons: ["2027-2028"],
      scrape: async () => ({ "2027-2028": [player(3)] }),
    });

    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual({
      version: 1,
      misses: {},
    });
  });
});
