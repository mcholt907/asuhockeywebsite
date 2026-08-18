const path = require("path");
const { spawnSync } = require("child_process");

const validatorPath = path.resolve(
  __dirname,
  "../scripts/validate-refresh-changes.js",
);

describe("refresh change allowlist", () => {
  test("accepts the generated data files and normalizes Windows separators", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(
      validateRefreshChanges([
        "asu_hockey_data.json",
        "data\\asu_recruiting_refresh_state.json",
        "data/asu_alumni_fallback.json",
        "data\\asu_transfers_fallback.json",
      ]),
    ).toEqual([
      "asu_hockey_data.json",
      "data/asu_recruiting_refresh_state.json",
      "data/asu_alumni_fallback.json",
      "data/asu_transfers_fallback.json",
    ]);
  });

  test("rejects every path outside the exact generated-file allowlist", () => {
    const { validateRefreshChanges } = require(validatorPath);

    expect(() =>
      validateRefreshChanges([
        "data/asu_alumni_fallback.json.bak",
        "src/App.js",
      ]),
    ).toThrow(
      "Refresh automation rejected unexpected paths: data/asu_alumni_fallback.json.bak, src/App.js",
    );
  });

  test("CLI exits successfully for allowlisted paths", () => {
    const result = spawnSync(
      process.execPath,
      [
        validatorPath,
        "asu_hockey_data.json",
        "data\\asu_recruiting_refresh_state.json",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("CLI exits nonzero and reports disallowed paths", () => {
    const result = spawnSync(
      process.execPath,
      [validatorPath, "data/asu_transfers_fallback.json", "package.json"],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refresh automation rejected unexpected path: package.json",
    );
  });
});
