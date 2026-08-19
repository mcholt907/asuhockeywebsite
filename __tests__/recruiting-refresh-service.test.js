const {
  emptyRemovalState,
  mergeRecruitingSnapshot,
  normalizePlayerUrl,
  validateRecruitingSnapshot,
  writeRecruitingFilesAtomically,
} = require("../server/services/recruiting-refresh-service");
const fs = require("fs");
const os = require("os");
const path = require("path");

const seasons = ["2027-2028", "2028-2029"];

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

describe("validateRecruitingSnapshot", () => {
  test("normalizes player URL identity without query, hash, casing, or trailing slash", () => {
    expect(
      normalizePlayerUrl(
        " HTTPS://www.EliteProspects.com/player/1/player-1/?tab=stats#bio ",
      ),
    ).toBe("https://www.eliteprospects.com/player/1/player-1");
  });

  test.each([
    ["missing configured season", { "2027-2028": [player(1)] }],
    ["non-array season", { "2027-2028": [player(1)], "2028-2029": {} }],
    ["all seasons empty", { "2027-2028": [], "2028-2029": [] }],
    [
      "missing player URL",
      { "2027-2028": [player(1, { player_link: "" })], "2028-2029": [] },
    ],
    [
      "duplicate player URL",
      { "2027-2028": [player(1), player(1)], "2028-2029": [] },
    ],
  ])("rejects %s", (_, snapshot) => {
    expect(() =>
      validateRecruitingSnapshot({
        snapshot,
        existingRecruiting: { "2027-2028": [], "2028-2029": [] },
        seasons,
      }),
    ).toThrow();
  });

  test("rejects a formerly nonempty season that is now empty", () => {
    expect(() =>
      validateRecruitingSnapshot({
        snapshot: { "2027-2028": [], "2028-2029": [player(2)] },
        existingRecruiting: { "2027-2028": [player(1)], "2028-2029": [] },
        seasons,
      }),
    ).toThrow();
  });

  test("rejects a 40 percent aggregate drop", () => {
    expect(() =>
      validateRecruitingSnapshot({
        snapshot: {
          "2027-2028": Array.from({ length: 12 }, (_, index) =>
            player(index + 1),
          ),
          "2028-2029": [],
        },
        existingRecruiting: {
          "2027-2028": Array.from({ length: 20 }, (_, index) =>
            player(index + 1),
          ),
          "2028-2029": [],
        },
        seasons,
      }),
    ).toThrow("Recruiting count dropped 40.0%; limit is 35%");
  });

  test("accepts a 35 percent aggregate drop", () => {
    expect(() =>
      validateRecruitingSnapshot({
        snapshot: {
          "2027-2028": Array.from({ length: 13 }, (_, index) =>
            player(index + 1),
          ),
          "2028-2029": [],
        },
        existingRecruiting: {
          "2027-2028": Array.from({ length: 20 }, (_, index) =>
            player(index + 1),
          ),
          "2028-2029": [],
        },
        seasons,
      }),
    ).not.toThrow();
  });

  test.each([
    ["null", null],
    ["false", false],
    ["zero", 0],
    ["an empty string", ""],
  ])(
    "rejects a present existing season containing %s instead of an array",
    (_, malformedSeason) => {
      expect(() =>
        validateRecruitingSnapshot({
          snapshot: { "2027-2028": [player(1)], "2028-2029": [player(2)] },
          existingRecruiting: { "2027-2028": [], "2028-2029": malformedSeason },
          seasons,
        }),
      ).toThrow("Existing recruiting season 2028-2029 must be an array");
    },
  );
});

describe("mergeRecruitingSnapshot", () => {
  const missKey = "2027-2028|https://www.eliteprospects.com/player/1/player-1";

  const documentWith = (recruiting) => ({
    roster: [{ name: "Protected Roster Player" }],
    recruiting,
    manual_news: [{ title: "Protected news" }],
  });

  test("creates the initial two-run removal state", () => {
    expect(emptyRemovalState()).toEqual({ version: 1, misses: {} });
  });

  test("appends a new URL to its configured season", () => {
    const sourceDocument = documentWith({ "2027-2028": [], "2028-2029": [] });

    const result = mergeRecruitingSnapshot({
      sourceDocument,
      snapshot: { "2027-2028": [player(1)], "2028-2029": [] },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"]).toEqual([player(1)]);
    expect(result.summary).toEqual({
      added: 1,
      updated: 0,
      retained: 0,
      removed: 0,
    });
  });

  test("updates nonblank scraper fields for a present URL", () => {
    const existing = player(1, { name: "Old Name", current_team: "Old Team" });
    const sourceDocument = documentWith({
      "2027-2028": [existing],
      "2028-2029": [],
    });

    const result = mergeRecruitingSnapshot({
      sourceDocument,
      snapshot: {
        "2027-2028": [
          player(1, { name: "New Name", current_team: "New Team" }),
        ],
        "2028-2029": [],
      },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"][0]).toMatchObject({
      name: "New Name",
      current_team: "New Team",
    });
    expect(result.summary).toEqual({
      added: 0,
      updated: 1,
      retained: 0,
      removed: 0,
    });
  });

  test("preserves nonblank photo and team when the scraper returns blanks", () => {
    const sourceDocument = documentWith({
      "2027-2028": [
        player(1, {
          player_photo: "https://photos.example/1.jpg",
          current_team: "Curated Team",
        }),
      ],
      "2028-2029": [],
    });

    const result = mergeRecruitingSnapshot({
      sourceDocument,
      snapshot: {
        "2027-2028": [player(1, { player_photo: "", current_team: "" })],
        "2028-2029": [],
      },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"][0]).toMatchObject({
      player_photo: "https://photos.example/1.jpg",
      current_team: "Curated Team",
    });
  });

  test("preserves unknown curated player properties", () => {
    const sourceDocument = documentWith({
      "2027-2028": [player(1, { editor_note: "verified" })],
      "2028-2029": [],
    });

    const result = mergeRecruitingSnapshot({
      sourceDocument,
      snapshot: { "2027-2028": [player(1)], "2028-2029": [] },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"][0].editor_note).toBe(
      "verified",
    );
  });

  test("leaves unconfigured seasons and every non-recruiting property unchanged", () => {
    const sourceDocument = documentWith({
      "2027-2028": [],
      "2028-2029": [],
      "2029-2030": [player(9, { editor_note: "future" })],
    });
    const original = JSON.parse(JSON.stringify(sourceDocument));

    const result = mergeRecruitingSnapshot({
      sourceDocument,
      snapshot: { "2027-2028": [player(1)], "2028-2029": [] },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2029-2030"]).toEqual(
      original.recruiting["2029-2030"],
    );
    expect({ ...result.document, recruiting: undefined }).toEqual({
      ...original,
      recruiting: undefined,
    });
    expect(sourceDocument).toEqual(original);
  });

  test("retains a missing recruit and records its first miss", () => {
    const result = mergeRecruitingSnapshot({
      sourceDocument: documentWith({
        "2027-2028": [player(1)],
        "2028-2029": [],
      }),
      snapshot: { "2027-2028": [], "2028-2029": [player(2)] },
      removalState: { version: 1, misses: {} },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"]).toEqual([player(1)]);
    expect(result.removalState).toEqual({
      version: 1,
      misses: { [missKey]: 1 },
    });
    expect(result.summary).toEqual({
      added: 1,
      updated: 0,
      retained: 1,
      removed: 0,
    });
  });

  test("removes a recruit on its second consecutive absence", () => {
    const result = mergeRecruitingSnapshot({
      sourceDocument: documentWith({
        "2027-2028": [player(1)],
        "2028-2029": [],
      }),
      snapshot: { "2027-2028": [], "2028-2029": [player(2)] },
      removalState: { version: 1, misses: { [missKey]: 1 } },
      seasons,
    });

    expect(result.document.recruiting["2027-2028"]).toEqual([]);
    expect(result.removalState).toEqual({ version: 1, misses: {} });
    expect(result.summary).toEqual({
      added: 1,
      updated: 0,
      retained: 0,
      removed: 1,
    });
  });

  test("clears a pending miss when the recruit reappears", () => {
    const removalState = { version: 1, misses: { [missKey]: 1 } };
    const result = mergeRecruitingSnapshot({
      sourceDocument: documentWith({
        "2027-2028": [player(1)],
        "2028-2029": [],
      }),
      snapshot: { "2027-2028": [player(1)], "2028-2029": [] },
      removalState,
      seasons,
    });

    expect(result.removalState).toEqual({ version: 1, misses: {} });
    expect(removalState).toEqual({ version: 1, misses: { [missKey]: 1 } });
    expect(result.summary).toEqual({
      added: 0,
      updated: 0,
      retained: 0,
      removed: 0,
    });
  });

  test("sorts configured seasons by case-insensitive last name then full name", () => {
    const result = mergeRecruitingSnapshot({
      sourceDocument: documentWith({ "2027-2028": [], "2028-2029": [] }),
      snapshot: {
        "2027-2028": [
          player(1, { name: "Zoe Adams" }),
          player(2, { name: "Bob Baker" }),
          player(3, { name: "Alice Baker" }),
        ],
        "2028-2029": [],
      },
      removalState: emptyRemovalState(),
      seasons,
    });

    expect(
      result.document.recruiting["2027-2028"].map(({ name }) => name),
    ).toEqual(["Zoe Adams", "Alice Baker", "Bob Baker"]);
  });

  test("sorts same-name recruits by normalized player URL regardless of snapshot order", () => {
    const first = player(1, { name: "Alex Same" });
    const second = player(2, { name: "Alex Same" });
    const merge = (players) =>
      mergeRecruitingSnapshot({
        sourceDocument: documentWith({ "2027-2028": [], "2028-2029": [] }),
        snapshot: { "2027-2028": players, "2028-2029": [] },
        removalState: emptyRemovalState(),
        seasons,
      });

    expect(
      merge([second, first]).document.recruiting["2027-2028"].map(
        ({ player_link }) => player_link,
      ),
    ).toEqual([
      "https://www.eliteprospects.com/player/1/player-1",
      "https://www.eliteprospects.com/player/2/player-2",
    ]);
    expect(
      merge([first, second]).document.recruiting["2027-2028"].map(
        ({ player_link }) => player_link,
      ),
    ).toEqual([
      "https://www.eliteprospects.com/player/1/player-1",
      "https://www.eliteprospects.com/player/2/player-2",
    ]);
  });
});

describe("writeRecruitingFilesAtomically", () => {
  let directory;
  let dataFile;
  let stateFile;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "recruiting-refresh-"));
    dataFile = path.join(directory, "asu_hockey_data.json");
    stateFile = path.join(directory, "recruiting-removal-state.json");
    fs.writeFileSync(dataFile, JSON.stringify({ prior: "data" }));
    fs.writeFileSync(stateFile, JSON.stringify({ prior: "state" }));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("writes both destinations as valid JSON", () => {
    const document = { recruiting: { "2027-2028": [player(1)] } };
    const removalState = { version: 1, misses: {} };

    writeRecruitingFilesAtomically({
      dataFile,
      stateFile,
      document,
      removalState,
    });

    expect(JSON.parse(fs.readFileSync(dataFile, "utf8"))).toEqual(document);
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual(
      removalState,
    );
  });

  test("does not change either destination when serialization validation fails", () => {
    const document = { recruiting: {} };
    document.circular = document;
    const originalData = fs.readFileSync(dataFile, "utf8");
    const originalState = fs.readFileSync(stateFile, "utf8");

    expect(() =>
      writeRecruitingFilesAtomically({
        dataFile,
        stateFile,
        document,
        removalState: { version: 1, misses: {} },
      }),
    ).toThrow();

    expect(fs.readFileSync(dataFile, "utf8")).toBe(originalData);
    expect(fs.readFileSync(stateFile, "utf8")).toBe(originalState);
  });

  test("restores both files and cleans sibling artifacts when second replacement fails", () => {
    const originalData = fs.readFileSync(dataFile, "utf8");
    const originalState = fs.readFileSync(stateFile, "utf8");
    let failedSecondReplacement = false;
    const fsAdapter = {
      ...fs,
      renameSync(from, to) {
        if (
          to === stateFile &&
          !failedSecondReplacement &&
          from.includes(".tmp-")
        ) {
          failedSecondReplacement = true;
          throw new Error("second replacement failed");
        }
        return fs.renameSync(from, to);
      },
    };

    expect(() =>
      writeRecruitingFilesAtomically({
        dataFile,
        stateFile,
        document: { recruiting: { "2027-2028": [player(1)] } },
        removalState: { version: 1, misses: {} },
        fsAdapter,
      }),
    ).toThrow("second replacement failed");

    expect(fs.readFileSync(dataFile, "utf8")).toBe(originalData);
    expect(fs.readFileSync(stateFile, "utf8")).toBe(originalState);
    expect(fs.readdirSync(directory).sort()).toEqual([
      "asu_hockey_data.json",
      "recruiting-removal-state.json",
    ]);
  });
});
