const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateRecruitingSnapshot,
  readRecruitingSnapshot,
} = require("../server/services/recruiting-snapshot");
const { FUTURE_SEASONS } = require("../config/scraper-config");

const seasons = ["2027-2028", "2028-2029"];
const player = (name) => ({
  name,
  player_link: `https://www.eliteprospects.com/player/1/${name.toLowerCase()}`,
});

test("tracks only projected 2027-28 and 2028-29 seasons", () => {
  expect(FUTURE_SEASONS).toEqual(["2027-2028", "2028-2029"]);
});

test("accepts both tracked seasons when one projected roster is empty", () => {
  expect(validateRecruitingSnapshot({
    "2027-2028": [player("Shared Player")],
    "2028-2029": [],
  }, seasons)).toBe(true);
});

test("rejects a partial snapshot", () => {
  expect(validateRecruitingSnapshot({ "2027-2028": [player("A")] }, seasons)).toBe(false);
});

test("rejects an all-empty snapshot", () => {
  expect(validateRecruitingSnapshot({ "2027-2028": [], "2028-2029": [] }, seasons)).toBe(false);
});

test("rejects a malformed player", () => {
  expect(validateRecruitingSnapshot({
    "2027-2028": [{ name: "No Link" }],
    "2028-2029": [],
  }, seasons)).toBe(false);
});

test("rejects a snapshot with an extra season key", () => {
  expect(validateRecruitingSnapshot({
    "2027-2028": [player("A")],
    "2028-2029": [],
    "2026-2027": [player("Current Team Player")],
  }, seasons)).toBe(false);
});

test("reads a valid snapshot and rejects an invalid file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-snapshot-"));
  const file = path.join(dir, "snapshot.json");
  const valid = {
    "2027-2028": [player("One")],
    "2028-2029": [],
  };
  fs.writeFileSync(file, JSON.stringify(valid));
  expect(readRecruitingSnapshot(file, seasons)).toEqual(valid);
  fs.writeFileSync(file, JSON.stringify({ "2027-2028": [] }));
  expect(readRecruitingSnapshot(file, seasons)).toBeNull();
  fs.rmSync(dir, { recursive: true, force: true });
});
