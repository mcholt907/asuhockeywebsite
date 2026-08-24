const fs = require("fs");
const path = require("path");

describe("roster nationality flag assets", () => {
  test("provides the Russian flag used for Russian roster players", () => {
    const flagPath = path.join(
      __dirname,
      "..",
      "public",
      "assets",
      "flags",
      "rus.svg",
    );

    expect(fs.existsSync(flagPath)).toBe(true);
  });
});
