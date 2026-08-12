const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("package scripts include the standings snapshot in refresh-data", () => {
  const scripts = require("../package.json").scripts;
  expect(scripts["refresh-standings"]).toBe("node scripts/refresh-standings.js");
  expect(scripts["refresh-data"]).toContain("npm run refresh-standings");
});

test("scheduled refresh detects and stages the standings fallback", () => {
  const command = read("scripts/refresh-and-push.cmd");
  const tracked = "data\\nchc_standings_fallback.json";
  const lines = command.split(/\r?\n/).map((line) => line.trim());
  expect(lines.find((line) => line.startsWith("git diff --quiet --"))).toContain(tracked);
  expect(lines.find((line) => line.startsWith("git add "))).toContain(tracked);
  expect(command).toContain("data: refresh bundled fallbacks (automated)");
});

test("Task Scheduler and README describe the standings refresh", () => {
  expect(read("scripts/RefreshDataTask.xml")).toMatch(/standings/i);
  expect(read("README.md")).toContain("npm run refresh-standings");
  expect(read("README.md")).toContain("first completed game");
});
