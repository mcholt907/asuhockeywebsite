import { share, perGame, finishing, filterGames } from "../analytics";

test("calculates event share and keeps absent samples distinct from zero", () => {
  expect(share(1689, 1929)).toBeCloseTo(46.683, 2);
  expect(share(0, 0)).toBeNull();
  expect(share(null, 10)).toBeNull();
  expect(share(0, 10)).toBe(0);
});

test("normalizes volume by games and handles missing inputs", () => {
  expect(perGame(246, 36)).toBeCloseTo(6.833, 2);
  expect(perGame(10, 0)).toBeNull();
  expect(perGame(null, 36)).toBeNull();
  expect(finishing(15, 12.5)).toBe(2.5);
  expect(finishing(0, null)).toBeNull();
});

test("filters home and away games without mutating the snapshot", () => {
  const games = [
    { id: "a", venue: "Home" },
    { id: "b", venue: "Away" },
  ];
  expect(filterGames(games, "Home")).toEqual([games[0]]);
  expect(filterGames(games, "Away")).toEqual([games[1]]);
  expect(filterGames(games, "All")).toHaveLength(2);
  expect(games).toHaveLength(2);
});
