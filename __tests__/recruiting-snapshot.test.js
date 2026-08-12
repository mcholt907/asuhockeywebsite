const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  validateRecruitingSnapshot,
  readRecruitingSnapshot,
} = require("../server/services/recruiting-snapshot");

const seasons = ["2027-2028", "2028-2029", "2029-2030"];
const player = (name) => ({
  name,
  player_link: `https://www.eliteprospects.com/player/1/${name.toLowerCase()}`,
});

test("accepts all configured seasons and a legitimately empty far-future roster", () => {
  expect(validateRecruitingSnapshot({
    "2027-2028": [player("Shared Player")],
    "2028-2029": [player("Shared Player")],
    "2029-2030": [],
  }, seasons)).toBe(true);
});

test.each([
  [{ "2027-2028": [player("A")], "2028-2029": [] }],
  [{ "2027-2028": [], "2028-2029": [], "2029-2030": [] }],
  [{ "2027-2028": [{ name: "No Link" }], "2028-2029": [], "2029-2030": [] }],
  [{
    "2027-2028": [player("A")],
    "2028-2029": [],
    "2029-2030": [],
    metadata: { source: "unexpected" },
  }],
])("rejects an incomplete, all-empty, or malformed snapshot", (candidate) => {
  expect(validateRecruitingSnapshot(candidate, seasons)).toBe(false);
});

test("reads a valid snapshot and rejects an invalid file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-snapshot-"));
  const file = path.join(dir, "snapshot.json");
  const valid = {
    "2027-2028": [player("One")],
    "2028-2029": [],
    "2029-2030": [],
  };
  fs.writeFileSync(file, JSON.stringify(valid));
  expect(readRecruitingSnapshot(file, seasons)).toEqual(valid);
  fs.writeFileSync(file, JSON.stringify({ "2027-2028": [] }));
  expect(readRecruitingSnapshot(file, seasons)).toBeNull();
  fs.rmSync(dir, { recursive: true, force: true });
});
