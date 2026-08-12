const fs = require("fs");
const os = require("os");
const path = require("path");
const { refreshRecruitingSnapshot } = require("../scripts/refresh-recruiting");

const valid = {
  "2026-2027": [],
  "2027-2028": [
    {
      name: "Jane",
      player_link: "https://www.eliteprospects.com/player/1/jane",
    },
  ],
  "2028-2029": [],
};

function createTemporarySnapshotFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-recruiting-"));
  return { directory, file: path.join(directory, "fallback.json") };
}

test("writes a complete valid recruiting snapshot", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  fs.writeFileSync(file, "previous snapshot bytes");

  try {
    await refreshRecruitingSnapshot({
      fetchData: async () => valid,
      fallbackFile: file,
    });

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(valid);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot when refresh data is partial", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshRecruitingSnapshot({
        fetchData: async () => ({ "2027-2028": [] }),
        fallbackFile: file,
      }),
    ).rejects.toThrow("validation failed");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot and cleans the temp file when writing fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
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
      refreshRecruitingSnapshot({
        fetchData: async () => valid,
        fallbackFile: file,
        fileSystem,
      }),
    ).rejects.toThrow("simulated write failure");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves the previous snapshot and cleans the same-directory temp file when renaming fails", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
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
      refreshRecruitingSnapshot({
        fetchData: async () => valid,
        fallbackFile: file,
        fileSystem,
      }),
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
  const previousContents = JSON.stringify(valid);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshRecruitingSnapshot({
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
