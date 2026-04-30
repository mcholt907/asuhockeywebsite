// scripts/refresh-alumni.js
// Runs the alumni scraper with the live flag and writes a validated result
// to data/asu_alumni_fallback.json. Must be run from a residential IP.

process.env.ALUMNI_SCRAPE_LIVE = 'true';

const fs = require('fs');
const path = require('path');
const { scrapeAlumniData } = require('../alumni-scraper');

const FALLBACK_FILE = path.join(__dirname, '..', 'data', 'asu_alumni_fallback.json');

(async () => {
  console.log('[refresh-alumni] Running live scrape...');
  let data;
  try {
    data = await scrapeAlumniData();
  } catch (err) {
    console.error('[refresh-alumni] Scrape threw:', err.message);
    process.exit(1);
  }

  if (
    !data ||
    !Array.isArray(data.skaters) ||
    !Array.isArray(data.goalies) ||
    data.skaters.length === 0 ||
    data.goalies.length === 0
  ) {
    console.error(
      `[refresh-alumni] Validation failed — refusing to overwrite fallback. ` +
      `skaters=${data?.skaters?.length ?? 'n/a'}, goalies=${data?.goalies?.length ?? 'n/a'}`
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2));
  console.log(
    `[refresh-alumni] Wrote ${FALLBACK_FILE} ` +
    `(${data.skaters.length} skater entries, ${data.goalies.length} goalie entries)`
  );
})();
