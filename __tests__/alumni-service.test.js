// Tests for filtering committed recruits out of the alumni list
// Run: npx jest --config jest.server.config.js

const { excludeCommittedRecruits } = require("../server/services/alumni-service");

const row = (name, playerId, extra = {}) => ({
  name,
  playerId,
  playerUrl: `https://www.eliteprospects.com/player/${playerId}/${name.toLowerCase().replace(/ /g, "-")}`,
  team: "Some Team",
  isTotals: false,
  ...extra,
});

const recruiting = {
  "2027-2028": [
    {
      name: "Dylan Krayer",
      player_link: "https://www.eliteprospects.com/player/576997/dylan-krayer",
    },
  ],
  "2028-2029": [
    {
      name: "Rian Marquardt",
      player_link: "https://www.eliteprospects.com/player/951201/rian-marquardt",
    },
  ],
};

describe("excludeCommittedRecruits", () => {
  test("drops alumni rows for players committed to a future ASU class", () => {
    const alumni = {
      skaters: [
        row("Dylan Jackson", "418528"),
        row("Dylan Krayer", "576997"),
        row("Rian Marquardt", "951201", { isTotals: true }),
      ],
      goalies: [row("Some Goalie", "111111")],
      lastUpdated: "2026-09-29T13:29:41.581Z",
    };

    const result = excludeCommittedRecruits(alumni, recruiting);

    expect(result.skaters.map((p) => p.name)).toEqual(["Dylan Jackson"]);
    expect(result.goalies.map((p) => p.name)).toEqual(["Some Goalie"]);
    expect(result.lastUpdated).toBe(alumni.lastUpdated);
  });

  test("matches on EliteProspects ID, not name", () => {
    const alumni = {
      skaters: [row("Dylan Krayer", "999999")], // same name, different player
      goalies: [],
    };

    expect(excludeCommittedRecruits(alumni, recruiting).skaters).toHaveLength(1);
  });

  test("returns alumni unchanged when recruiting data is missing", () => {
    const alumni = { skaters: [row("Dylan Krayer", "576997")], goalies: [] };

    expect(excludeCommittedRecruits(alumni, null)).toBe(alumni);
    expect(excludeCommittedRecruits(alumni, {})).toEqual(alumni);
  });
});
