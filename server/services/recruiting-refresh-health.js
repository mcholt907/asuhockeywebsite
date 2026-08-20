const POSITION_FAMILIES = [
  new Set(["F", "C", "LW", "RW", "W"]),
  new Set(["D", "LD", "RD"]),
  new Set(["G"]),
];

function normalizeRecruitingPosition(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const roles = value.split("/").map((role) => role.trim().toUpperCase());
  if (roles.some((role) => !/^[A-Z]+$/.test(role))) return null;
  return roles.join("/");
}

function isValidRecruitingPosition(value) {
  const normalized = normalizeRecruitingPosition(value);
  if (!normalized || normalized !== value) return false;

  const roles = normalized.split("/");
  return POSITION_FAMILIES.some((family) =>
    roles.every((role) => family.has(role)),
  );
}

function normalizeRecruitingPlayerLink(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "eliteprospects.com" &&
        hostname !== "www.eliteprospects.com") ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/player\/\d+\/[^/]+\/?$/.test(url.pathname)
    ) {
      return null;
    }

    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `https://www.eliteprospects.com${pathname}`;
  } catch {
    return null;
  }
}

function getAutomatedRecruitingHealth(data, seasons) {
  const issues = [];
  const counts = {};

  for (const season of seasons) {
    const roster = data?.[season];
    if (!Array.isArray(roster)) {
      counts[season] = 0;
      issues.push(`${season} is not an array`);
      continue;
    }

    counts[season] = roster.length;
    const seenLinks = new Set();
    for (const player of roster) {
      const playerName =
        typeof player?.name === "string" && player.name.trim()
          ? player.name.trim()
          : "unknown player";
      if (!isValidRecruitingPosition(player?.position)) {
        issues.push(`${season} ${playerName} has invalid position`);
      }

      const normalizedLink = normalizeRecruitingPlayerLink(player?.player_link);
      if (!normalizedLink) {
        issues.push(`${season} ${playerName} has invalid player link`);
      } else if (seenLinks.has(normalizedLink)) {
        issues.push(`${season} has duplicate player link ${normalizedLink}`);
      } else {
        seenLinks.add(normalizedLink);
      }
    }
  }

  return { healthy: issues.length === 0, issues, counts };
}

function assertAutomatedRecruitingSnapshot(data, seasons) {
  const health = getAutomatedRecruitingHealth(data, seasons);
  if (!health.healthy) {
    throw new Error(
      `[Recruiting Refresh] automated health validation failed: ${health.issues.join("; ")}`,
    );
  }
  return health;
}

module.exports = {
  assertAutomatedRecruitingSnapshot,
  getAutomatedRecruitingHealth,
  normalizeRecruitingPosition,
  normalizeRecruitingPlayerLink,
};
