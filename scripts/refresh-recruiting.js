const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

process.env.RECRUITING_SCRAPE_LIVE = "true";
process.env.SCRAPER_PUPPETEER_FALLBACK ??= "true";

const config = require("../config/scraper-config");
const { validateRecruitingSnapshot } = require("../server/services/recruiting-snapshot");

const FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "data",
  "asu_recruiting_fallback.json",
);

function fetchLiveRecruitingData() {
  const { fetchRecruitingData } = require("../server/scrapers/recruiting");
  return fetchRecruitingData(true, { bypassCache: true });
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

  const data = await fetchData();
  if (!validateRecruitingSnapshot(data, config.FUTURE_SEASONS)) {
    throw new Error("[refresh-recruiting] validation failed; fallback preserved");
  }

  const fallbackDirectory = path.dirname(fallbackFile);
  const tempFile = path.join(
    fallbackDirectory,
    `.${path.basename(fallbackFile)}.${process.pid}.${randomUUID()}.tmp`,
  );

  fileSystem.mkdirSync(fallbackDirectory, { recursive: true });
  try {
    fileSystem.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fileSystem.renameSync(tempFile, fallbackFile);
  } catch (error) {
    try {
      fileSystem.rmSync(tempFile, { force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
  return data;
}

if (require.main === module) {
  refreshRecruitingSnapshot().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { refreshRecruitingSnapshot };
