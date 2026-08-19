// Refreshes recruiting data from Elite Prospects while preserving curated fields.
// This command is intended for local scheduled refreshes, not production serving.

process.env.SCRAPER_PUPPETEER_FALLBACK =
  process.env.SCRAPER_PUPPETEER_FALLBACK || "true";

const fs = require("fs");
const path = require("path");
const config = require("../config/scraper-config");
const { scrapeAllRecruitingSeasons } = require("../server/scrapers/recruiting");
const {
  emptyRemovalState,
  mergeRecruitingSnapshot,
  validateRecruitingSnapshot,
  writeRecruitingFilesAtomically,
} = require("../server/services/recruiting-refresh-service");

const DEFAULT_DATA_FILE = path.join(__dirname, "..", "asu_hockey_data.json");
const DEFAULT_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "asu_recruiting_refresh_state.json",
);

async function runRecruitingRefresh({
  dataFile = DEFAULT_DATA_FILE,
  stateFile = DEFAULT_STATE_FILE,
  seasons = config.FUTURE_SEASONS,
  scrape = scrapeAllRecruitingSeasons,
} = {}) {
  const sourceDocument = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const removalState = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : emptyRemovalState();
  const snapshot = await scrape({ includePhotos: true });

  validateRecruitingSnapshot({
    snapshot,
    existingRecruiting: sourceDocument.recruiting || {},
    seasons,
  });

  for (const season of seasons) {
    console.log(
      `[refresh-recruiting] ${season}: ${snapshot[season].length} players`,
    );
  }

  const result = mergeRecruitingSnapshot({
    sourceDocument,
    snapshot,
    removalState,
    seasons,
  });

  writeRecruitingFilesAtomically({
    dataFile,
    stateFile,
    document: result.document,
    removalState: result.removalState,
  });

  const { added, updated, retained, removed } = result.summary;
  console.log(
    `[refresh-recruiting] added=${added}, updated=${updated}, retained=${retained}, removed=${removed}`,
  );
  return result.summary;
}

if (require.main === module) {
  runRecruitingRefresh().catch((error) => {
    console.error(`[refresh-recruiting] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runRecruitingRefresh };
