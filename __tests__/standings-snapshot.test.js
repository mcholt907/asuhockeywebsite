const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseRecordGames,
  hasPlayedGame,
  validateStandingsSnapshot,
  readStandingsFallback,
} = require("../server/services/standings-snapshot");

const team = (overallRecord = "0-0-0") => ({
  rank: "1",
  team: "Arizona State",
  pts: "0",
  confRecord: "0-0-0",
  overallRecord,
  isASU: true,
});

const snapshot = (overallRecord = "14-21-1") => ({
  season: "2025-2026",
  lastUpdated: "2026-07-17T20:09:00.364Z",
  teams: [team(overallRecord)],
});

test("counts wins, losses, and ties from a strict record", () => {
  expect(parseRecordGames("14-21-1")).toBe(36);
  expect(parseRecordGames("14-21")).toBeNull();
});

test("treats an all-zero table as not started", () => {
  expect(hasPlayedGame([team("0-0-0"), team("0-0-0")])).toBe(false);
  expect(hasPlayedGame([team("1-0-0"), team("0-1-0")])).toBe(true);
});

test("rejects malformed and unplayed snapshots", () => {
  expect(validateStandingsSnapshot(snapshot("not-a-record"))).toBe(false);
  expect(validateStandingsSnapshot(snapshot("0-0-0"))).toBe(false);
  expect(
    validateStandingsSnapshot(snapshot("0-0-0"), { requirePlayedGame: false }),
  ).toBe(true);
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
