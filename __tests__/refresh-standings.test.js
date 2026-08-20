const fs = require("fs");
const os = require("os");
const path = require("path");
const { refreshStandingsSnapshot } = require("../scripts/refresh-standings");

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
    confRecord: overallRecord,
    overallRecord,
    isASU: team === "Arizona State",
  }));
}

const validSnapshot = {
  season: "2026-2027",
  lastUpdated: "2026-08-12T00:00:00.000Z",
  teams: completeTeams(),
};

function invalidSnapshot(kind) {
  const snapshot = {
    ...validSnapshot,
    teams: validSnapshot.teams.map((team) => ({ ...team })),
  };
  if (kind === "truncated table") snapshot.teams.pop();
  if (kind === "duplicate normalized team") {
    snapshot.teams[1].team = "  NORTH   DAKOTA ";
  }
  if (kind === "duplicate rank") snapshot.teams[1].rank = "1";
  if (kind === "missing ASU row") snapshot.teams[8].isASU = false;
  if (kind === "duplicate ASU row") snapshot.teams[0].isASU = true;
  return snapshot;
}

function createTemporarySnapshotFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-standings-"));
  return { directory, file: path.join(directory, "fallback.json") };
}

test("writes a complete valid standings snapshot", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  fs.writeFileSync(file, "previous snapshot bytes");

  try {
    await refreshStandingsSnapshot({
      fetchData: async () => validSnapshot,
      fallbackFile: file,
    });

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(validSnapshot);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot when all teams have zero games", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({
        fetchData: async () => ({
          ...validSnapshot,
          teams: completeTeams("0-0-0"),
        }),
        fallbackFile: file,
      }),
    ).resolves.toBeNull();

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot when standings are not published", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({ fetchData: async () => null, fallbackFile: file }),
    ).resolves.toBeNull();

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot when the live request fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({
        fetchData: async () => {
          throw new Error("simulated request failure");
        },
        fallbackFile: file,
      }),
    ).rejects.toThrow("simulated request failure");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot when standings validation fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({
        fetchData: async () => ({ ...validSnapshot, teams: [{ broken: true }] }),
        fallbackFile: file,
      }),
    ).rejects.toThrow("validation failed; fallback preserved");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  "truncated table",
  "duplicate normalized team",
  "duplicate rank",
  "missing ASU row",
  "duplicate ASU row",
])("refuses to overwrite the fallback for a %s", async (kind) => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({
        fetchData: async () => invalidSnapshot(kind),
        fallbackFile: file,
      }),
    ).rejects.toThrow("validation failed; fallback preserved");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot and cleans the temp file when writing fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);
  const fileSystem = {
    mkdirSync: fs.mkdirSync,
    renameSync: fs.renameSync,
    rmSync: fs.rmSync,
    writeFileSync(tempFile, contents) {
      fs.writeFileSync(tempFile, contents.slice(0, 10));
      throw new Error("simulated write failure");
    },
  };

  try {
    await expect(
      refreshStandingsSnapshot({ fetchData: async () => validSnapshot, fallbackFile: file, fileSystem }),
    ).rejects.toThrow("simulated write failure");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot and cleans the temp file when renaming fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);
  let renameSource;
  let renameDestination;
  const fileSystem = {
    mkdirSync: fs.mkdirSync,
    rmSync: fs.rmSync,
    writeFileSync: fs.writeFileSync,
    renameSync(source, destination) {
      renameSource = source;
      renameDestination = destination;
      throw new Error("simulated rename failure");
    },
  };

  try {
    await expect(
      refreshStandingsSnapshot({ fetchData: async () => validSnapshot, fallbackFile: file, fileSystem }),
    ).rejects.toThrow("simulated rename failure");

    expect(path.dirname(renameSource)).toBe(directory);
    expect(renameDestination).toBe(file);
    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  ["production", { NODE_ENV: "production" }],
  ["prerender", { NODE_ENV: "test", IS_PRERENDER: "true" }],
])("rejects a %s refresh before fetching or writing", async (_, environment) => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(validSnapshot);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshStandingsSnapshot({
        environment,
        fallbackFile: file,
        fetchData: async () => {
          throw new Error("fetch was attempted");
        },
      }),
    ).rejects.toThrow("live refresh is disabled in production and prerender environments");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
