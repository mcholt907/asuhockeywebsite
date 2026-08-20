const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

process.env.SCRAPER_PUPPETEER_FALLBACK ??= "true";

const config = require("../config/scraper-config");
const {
  validateRecruitingSnapshot,
} = require("../server/services/recruiting-snapshot");
const {
  assertAutomatedRecruitingSnapshot,
  normalizeRecruitingPlayerLink,
} = require("../server/services/recruiting-refresh-health");

const FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "data",
  "asu_recruiting_fallback.json",
);

function fetchLiveRecruitingData() {
  const {
    scrapeAllRecruitingSeasons,
  } = require("../server/scrapers/recruiting");
  return scrapeAllRecruitingSeasons({ includePhotos: true });
}

function readExistingSnapshot(fallbackFile, fileSystem) {
  const readFileSync = fileSystem.readFileSync || fs.readFileSync;
  try {
    const parsed = JSON.parse(readFileSync(fallbackFile, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(
        `[refresh-recruiting] existing fallback could not be read: ${error.message}`,
      );
    }
    return null;
  }
}

function preserveProfileMetadata(data, previousData) {
  if (!previousData) return data;

  const previousByLink = new Map();
  for (const roster of Object.values(previousData)) {
    if (!Array.isArray(roster)) continue;
    for (const player of roster) {
      const normalizedLink = normalizeRecruitingPlayerLink(player?.player_link);
      if (normalizedLink) previousByLink.set(normalizedLink, player);
    }
  }

  return Object.fromEntries(
    Object.entries(data).map(([season, roster]) => [
      season,
      roster.map((player) => {
        const previous = previousByLink.get(
          normalizeRecruitingPlayerLink(player.player_link),
        );
        if (!previous) return player;

        const merged = { ...player };
        for (const field of ["player_photo", "current_team"]) {
          if (
            (typeof merged[field] !== "string" || !merged[field].trim()) &&
            typeof previous[field] === "string" &&
            previous[field].trim()
          ) {
            merged[field] = previous[field];
          }
        }
        return merged;
      }),
    ]),
  );
}

async function refreshRecruitingSnapshot({
  fetchData = fetchLiveRecruitingData,
  fallbackFile = FALLBACK_FILE,
  fileSystem = fs,
  environment = process.env,
} = {}) {
  if (
    environment.NODE_ENV === "production" ||
    environment.IS_PRERENDER === "true"
  ) {
    throw new Error(
      "[refresh-recruiting] live refresh is disabled in production and prerender environments",
    );
  }

  const previousData = readExistingSnapshot(fallbackFile, fileSystem);
  const data = await fetchData();
  if (!validateRecruitingSnapshot(data, config.FUTURE_SEASONS)) {
    throw new Error(
      "[refresh-recruiting] validation failed; fallback preserved",
    );
  }
  assertAutomatedRecruitingSnapshot(data, config.FUTURE_SEASONS);
  const publishData = preserveProfileMetadata(data, previousData);

  const fallbackDirectory = path.dirname(fallbackFile);
  const tempFile = path.join(
    fallbackDirectory,
    `.${path.basename(fallbackFile)}.${process.pid}.${randomUUID()}.tmp`,
  );

  fileSystem.mkdirSync(fallbackDirectory, { recursive: true });
  try {
    fileSystem.writeFileSync(tempFile, JSON.stringify(publishData, null, 2));
    fileSystem.renameSync(tempFile, fallbackFile);
  } catch (error) {
    try {
      fileSystem.rmSync(tempFile, { force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
  return publishData;
}

if (require.main === module) {
  refreshRecruitingSnapshot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { refreshRecruitingSnapshot };
