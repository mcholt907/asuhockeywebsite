const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseRecordGames,
  hasPlayedGame,
  validateStandingsSnapshot,
  readStandingsFallback,
} = require("../server/services/standings-snapshot");

const TEAM_NAMES = [
  "North Dakota",
  "Denver",
  "Western Michigan",
  "Minnesota Duluth",
  "St. Cloud State",
  "Colorado College",
  "Miami",
  "Omaha",
  "Arizona State",
];

function completeTeams(overallRecord = "1-0-0") {
  return TEAM_NAMES.map((team, index) => ({
    rank: String(index + 1),
    team,
    pts: "3",
    confRecord: "1-0-0",
    overallRecord,
    isASU: team === "Arizona State",
  }));
}

function snapshot(overallRecord = "1-0-0") {
  return {
    season: "2025-2026",
    lastUpdated: "2026-07-17T20:09:00.364Z",
    teams: completeTeams(overallRecord),
  };
}

function invalidSnapshot(kind) {
  const value = snapshot();
  if (kind === "truncated table") value.teams.pop();
  if (kind === "duplicate normalized team") {
    value.teams[1].team = "  NORTH   DAKOTA ";
  }
  if (kind === "duplicate rank") value.teams[1].rank = "1";
  if (kind === "missing ASU row") value.teams[8].isASU = false;
  if (kind === "duplicate ASU row") value.teams[0].isASU = true;
  return value;
}

test("counts wins, losses, and ties from a strict record", () => {
  expect(parseRecordGames("14-21-1")).toBe(36);
  expect(parseRecordGames("14-21")).toBeNull();
});

test("treats an all-zero table as not started", () => {
  expect(hasPlayedGame(completeTeams("0-0-0"))).toBe(false);
  expect(hasPlayedGame(completeTeams("1-0-0"))).toBe(true);
});

test("rejects malformed and unplayed snapshots", () => {
  expect(validateStandingsSnapshot(snapshot("not-a-record"))).toBe(false);
  expect(validateStandingsSnapshot(snapshot("0-0-0"))).toBe(false);
  expect(
    validateStandingsSnapshot(snapshot("0-0-0"), {
      requirePlayedGame: false,
    }),
  ).toBe(true);
});

test.each([
  "truncated table",
  "duplicate normalized team",
  "duplicate rank",
  "missing ASU row",
  "duplicate ASU row",
])("rejects a complete-table contract violation: %s", (kind) => {
  expect(validateStandingsSnapshot(invalidSnapshot(kind))).toBe(false);
});

test("loads a valid fallback and throws for invalid bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "standings-snapshot-"));
  const fallbackFile = path.join(directory, "fallback.json");
  fs.writeFileSync(fallbackFile, JSON.stringify(snapshot()));
  expect(readStandingsFallback({ fallbackFile })).toEqual(snapshot());
  fs.writeFileSync(fallbackFile, JSON.stringify(snapshot("0-0-0")));
  expect(() => readStandingsFallback({ fallbackFile })).toThrow(
    "Standings fallback is incomplete or malformed",
  );
  fs.rmSync(directory, { recursive: true, force: true });
});
