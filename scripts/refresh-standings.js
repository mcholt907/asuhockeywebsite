const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  DEFAULT_FALLBACK_FILE,
  hasPlayedGame,
  validateStandingsSnapshot,
} = require("../server/services/standings-snapshot");

function fetchLiveStandings() {
  const {
    scrapeLiveNCHCStandings,
    StandingsNotPublishedError,
  } = require("../server/scrapers/standings");
  return scrapeLiveNCHCStandings().catch((error) => {
    if (error instanceof StandingsNotPublishedError) return null;
    throw error;
  });
}

async function refreshStandingsSnapshot({
  fetchData = fetchLiveStandings,
  fallbackFile = DEFAULT_FALLBACK_FILE,
  fileSystem = fs,
  environment = process.env,
} = {}) {
  if (environment.NODE_ENV === "production" || environment.IS_PRERENDER === "true") {
    throw new Error(
      "[refresh-standings] live refresh is disabled in production and prerender environments",
    );
  }

  const snapshot = await fetchData();
  if (snapshot === null) return null;

  if (!validateStandingsSnapshot(snapshot, { requirePlayedGame: false })) {
    throw new Error("[refresh-standings] validation failed; fallback preserved");
  }

  if (!hasPlayedGame(snapshot.teams)) return null;

  const directory = path.dirname(fallbackFile);
  const tempFile = path.join(
    directory,
    `.${path.basename(fallbackFile)}.${process.pid}.${randomUUID()}.tmp`,
  );
  fileSystem.mkdirSync(directory, { recursive: true });

  try {
    fileSystem.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
    fileSystem.renameSync(tempFile, fallbackFile);
  } catch (error) {
    try {
      fileSystem.rmSync(tempFile, { force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }

  return snapshot;
}

if (require.main === module) {
  refreshStandingsSnapshot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { refreshStandingsSnapshot };
