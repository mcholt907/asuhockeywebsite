const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../server/scrapers/recruiting", () => ({
  scrapeAllRecruitingSeasons: jest.fn(),
}));

const { scrapeAllRecruitingSeasons } = require("../server/scrapers/recruiting");
const { refreshRecruitingSnapshot } = require("../scripts/refresh-recruiting");
const {
  assertAutomatedRecruitingSnapshot,
} = require("../server/services/recruiting-refresh-health");
const { FUTURE_SEASONS } = require("../config/scraper-config");

const valid = {
  "2027-2028": [
    {
      name: "Jane",
      position: "F",
      player_link: "https://www.eliteprospects.com/player/1/jane",
    },
  ],
  "2028-2029": [],
};

function createTemporarySnapshotFile() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "refresh-recruiting-"),
  );
  return { directory, file: path.join(directory, "fallback.json") };
}

beforeEach(() => {
  scrapeAllRecruitingSeasons.mockReset();
});

test("bundled recruiting fallback passes automated publish health", () => {
  const fallback = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../data/asu_recruiting_fallback.json"),
      "utf8",
    ),
  );

  expect(() =>
    assertAutomatedRecruitingSnapshot(fallback, FUTURE_SEASONS),
  ).not.toThrow();
});

test("writes a complete valid recruiting snapshot", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  fs.writeFileSync(file, JSON.stringify(valid));

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

test("publishes every supported source-faithful hockey position", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const positions = [
    "F",
    "C",
    "LW",
    "RW",
    "W",
    "D",
    "LD",
    "RD",
    "G",
    "C/RW",
    "LW/RW",
    "LD/RD",
  ];
  const snapshot = {
    "2027-2028": positions.map((position, index) => ({
      name: `Player ${index}`,
      position,
      player_link: `https://www.eliteprospects.com/player/${index + 10}/player-${index}`,
    })),
    "2028-2029": [],
  };
  fs.writeFileSync(file, JSON.stringify(valid));

  try {
    await expect(
      refreshRecruitingSnapshot({
        fetchData: async () => snapshot,
        fallbackFile: file,
      }),
    ).resolves.toEqual(snapshot);

    expect(
      JSON.parse(fs.readFileSync(file, "utf8"))["2027-2028"].map(
        ({ position }) => position,
      ),
    ).toEqual(positions);
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

test("preserves prior profile fields by normalized player link when enrichment is blank", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previous = {
    ...valid,
    "2027-2028": [
      {
        ...valid["2027-2028"][0],
        player_photo:
          "https://files.eliteprospects.com/layout/players/jane.jpg",
        current_team: "Previous Team",
      },
    ],
  };
  const refreshed = {
    ...valid,
    "2027-2028": [
      {
        ...valid["2027-2028"][0],
        player_link:
          "https://www.eliteprospects.com/player/1/jane/?utm_source=refresh",
        player_photo: " ",
        current_team: "",
      },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(previous));

  try {
    await refreshRecruitingSnapshot({
      fetchData: async () => refreshed,
      fallbackFile: file,
    });

    expect(
      JSON.parse(fs.readFileSync(file, "utf8"))["2027-2028"][0],
    ).toMatchObject({
      player_link:
        "https://www.eliteprospects.com/player/1/jane/?utm_source=refresh",
      player_photo: "https://files.eliteprospects.com/layout/players/jane.jpg",
      current_team: "Previous Team",
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves every prior profile when all new enrichment is blank", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previous = {
    ...valid,
    "2027-2028": [
      {
        ...valid["2027-2028"][0],
        player_photo:
          "https://files.eliteprospects.com/layout/players/jane.jpg",
        current_team: "Jane's Previous Team",
      },
      {
        name: "Bob",
        position: "G",
        player_link: "https://www.eliteprospects.com/player/2/bob",
        player_photo: "https://files.eliteprospects.com/layout/players/bob.jpg",
        current_team: "Bob's Previous Team",
      },
    ],
  };
  const refreshed = {
    ...valid,
    "2027-2028": previous["2027-2028"].map((player) => ({
      ...player,
      player_link: `${player.player_link}/?source=refresh`,
      player_photo: "",
      current_team: "",
    })),
  };
  fs.writeFileSync(file, JSON.stringify(previous));

  try {
    const published = await refreshRecruitingSnapshot({
      fetchData: async () => refreshed,
      fallbackFile: file,
    });

    expect(
      published["2027-2028"].map(({ player_photo, current_team }) => ({
        player_photo,
        current_team,
      })),
    ).toEqual([
      {
        player_photo:
          "https://files.eliteprospects.com/layout/players/jane.jpg",
        current_team: "Jane's Previous Team",
      },
      {
        player_photo: "https://files.eliteprospects.com/layout/players/bob.jpg",
        current_team: "Bob's Previous Team",
      },
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves complementary profile fields from every prior occurrence of a player", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previous = {
    "2027-2028": [
      {
        ...valid["2027-2028"][0],
        player_photo:
          "https://files.eliteprospects.com/layout/players/jane.jpg",
        current_team: "",
      },
    ],
    "2028-2029": [
      {
        ...valid["2027-2028"][0],
        player_link:
          "https://www.eliteprospects.com/player/1/jane/?season=2028",
        player_photo: "",
        current_team: "Jane's Previous Team",
      },
    ],
  };
  const refreshed = {
    ...valid,
    "2027-2028": [
      {
        ...valid["2027-2028"][0],
        player_photo: "",
        current_team: "",
      },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(previous));

  try {
    const published = await refreshRecruitingSnapshot({
      fetchData: async () => refreshed,
      fallbackFile: file,
    });

    expect(published["2027-2028"][0]).toMatchObject({
      player_photo: "https://files.eliteprospects.com/layout/players/jane.jpg",
      current_team: "Jane's Previous Team",
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("health-validates the final merged payload before starting the atomic write", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
  fs.writeFileSync(file, previousContents);
  let positionReads = 0;
  const changingPlayer = {
    ...valid["2027-2028"][0],
    player_photo: "",
    current_team: "",
  };
  Object.defineProperty(changingPlayer, "position", {
    enumerable: true,
    get() {
      positionReads += 1;
      return positionReads === 1 ? "F" : "X";
    },
  });
  const changingSnapshot = {
    ...valid,
    "2027-2028": [changingPlayer],
  };

  try {
    await expect(
      refreshRecruitingSnapshot({
        fetchData: async () => changingSnapshot,
        fallbackFile: file,
      }),
    ).rejects.toThrow("automated health validation failed");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("allows a formerly nonempty far-future season to become empty when the overall snapshot remains valid", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previous = {
    ...valid,
    "2028-2029": [
      {
        name: "Future Player",
        position: "D",
        player_link: "https://www.eliteprospects.com/player/2/future-player",
      },
    ],
  };
  const previousContents = JSON.stringify(previous);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshRecruitingSnapshot({
        fetchData: async () => valid,
        fallbackFile: file,
      }),
    ).resolves.toEqual(valid);

    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(valid);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [
    "an unsupported position",
    {
      ...valid,
      "2027-2028": [{ ...valid["2027-2028"][0], position: "X" }],
    },
  ],
  [
    "a mixed forward and defense position",
    {
      ...valid,
      "2027-2028": [{ ...valid["2027-2028"][0], position: "F/D" }],
    },
  ],
  [
    "a compound position containing an unknown role",
    {
      ...valid,
      "2027-2028": [{ ...valid["2027-2028"][0], position: "C/X" }],
    },
  ],
  [
    "a non-HTTPS Elite Prospects player link",
    {
      ...valid,
      "2027-2028": [
        {
          ...valid["2027-2028"][0],
          player_link: "http://www.eliteprospects.com/player/1/jane",
        },
      ],
    },
  ],
  [
    "duplicate normalized player links in one season",
    {
      ...valid,
      "2027-2028": [
        valid["2027-2028"][0],
        {
          name: "Duplicate Jane",
          position: "F",
          player_link:
            "https://www.eliteprospects.com/player/1/jane/?utm_source=duplicate",
        },
      ],
    },
  ],
])("rejects automated data with %s", async (_, invalidData) => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
  fs.writeFileSync(file, previousContents);

  try {
    await expect(
      refreshRecruitingSnapshot({
        fetchData: async () => invalidData,
        fallbackFile: file,
      }),
    ).rejects.toThrow("automated health validation failed");

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
])(
  "rejects a %s refresh before fetching or writing",
  async (_, environment) => {
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
      ).rejects.toThrow(
        "live refresh is disabled in production and prerender environments",
      );

      expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
      expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("default refresh propagates a direct later-season scrape failure and preserves the fallback", async () => {
  const { directory, file } = createTemporarySnapshotFile();
  const previousContents = JSON.stringify(valid);
  fs.writeFileSync(file, previousContents);
  scrapeAllRecruitingSeasons.mockRejectedValueOnce(
    new Error("later season unavailable"),
  );

  try {
    await expect(
      refreshRecruitingSnapshot({ fallbackFile: file }),
    ).rejects.toThrow("later season unavailable");

    expect(fs.readFileSync(file, "utf8")).toBe(previousContents);
    expect(fs.readdirSync(directory)).toEqual(["fallback.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
