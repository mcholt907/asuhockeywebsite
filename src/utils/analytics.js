const validCount = (value) => Number.isFinite(value) && value >= 0;

export function share(forCount, againstCount) {
  if (
    !validCount(forCount) ||
    !validCount(againstCount) ||
    forCount + againstCount === 0
  )
    return null;
  return (100 * forCount) / (forCount + againstCount);
}

export function perGame(count, games) {
  return validCount(count) && validCount(games) && games > 0
    ? count / games
    : null;
}

export function finishing(goals, expected) {
  return validCount(goals) && validCount(expected) ? goals - expected : null;
}

export function filterGames(games, venue) {
  return venue === "All"
    ? [...games]
    : games.filter((game) => game.venue === venue);
}
