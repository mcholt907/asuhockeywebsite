const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
  delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
}));

jest.setTimeout(15000);

const semanticProfile = fs.readFileSync(
  path.join(__dirname, "fixtures", "recruiting-profile-marko-semantic.html"),
  "utf8",
);
const originalWorkingDirectory = process.cwd();

async function runUtility(script, player, profileHtml) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "recruiting-utility-"),
  );
  const dataFile = path.join(directory, "asu_hockey_data.json");
  fs.writeFileSync(
    dataFile,
    JSON.stringify({ recruiting: { "2027-2028": [player] } }),
  );

  jest.useFakeTimers();
  jest.resetModules();
  const { requestWithRetry } = require("../server/lib/request-helper");
  requestWithRetry.mockResolvedValue({ data: profileHtml });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  try {
    process.chdir(directory);
    require(script);
    await jest.runAllTimersAsync();
    return JSON.parse(fs.readFileSync(dataFile, "utf8")).recruiting[
      "2027-2028"
    ][0];
  } finally {
    process.chdir(originalWorkingDirectory);
    jest.useRealTimers();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("add-photos enriches a semantic-only profile using the player's name", async () => {
  const player = await runUtility(
    "../add-photos",
    {
      name: "Marko Bilic",
      player_link: "https://www.eliteprospects.com/player/709864/marko-bilic",
      player_photo: "https://example.test/old-photo.jpg",
    },
    semanticProfile,
  );

  expect(player.player_photo).toBe(
    "https://files.eliteprospects.com/layout/players/marko-bilic.jpg",
  );
});

test("add-photos keeps an existing photo when optional enrichment is blank", async () => {
  const player = await runUtility(
    "../add-photos",
    {
      name: "Marko Bilic",
      player_link: "https://www.eliteprospects.com/player/709864/marko-bilic",
      player_photo: "https://example.test/existing-photo.jpg",
    },
    "<html><body>profile unavailable</body></html>",
  );

  expect(player.player_photo).toBe("https://example.test/existing-photo.jpg");
});

test("add-current-team enriches a semantic-only profile using the player's name", async () => {
  const player = await runUtility(
    "../add-current-team",
    {
      name: "Marko Bilic",
      player_link: "https://www.eliteprospects.com/player/709864/marko-bilic",
      current_team: "Previous Team",
    },
    semanticProfile,
  );

  expect(player.current_team).toBe("Chicago Steel");
});

test("add-current-team keeps an existing team when optional enrichment is blank", async () => {
  const player = await runUtility(
    "../add-current-team",
    {
      name: "Marko Bilic",
      player_link: "https://www.eliteprospects.com/player/709864/marko-bilic",
      current_team: "Previous Team",
    },
    "<html><body>profile unavailable</body></html>",
  );

  expect(player.current_team).toBe("Previous Team");
});
