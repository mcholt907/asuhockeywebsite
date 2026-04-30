// scripts/refresh-transfers.js
// Runs the transfer scraper with the live flag and writes a validated result
// to data/asu_transfers_fallback.json. Must be run from a residential IP.

process.env.TRANSFER_SCRAPE_LIVE = 'true';

const fs = require('fs');
const path = require('path');
const { scrapeTransferData } = require('../transfer-scraper');

const FALLBACK_FILE = path.join(__dirname, '..', 'data', 'asu_transfers_fallback.json');

(async () => {
  console.log('[refresh-transfers] Running live scrape...');
  let data;
  try {
    data = await scrapeTransferData();
  } catch (err) {
    console.error('[refresh-transfers] Scrape threw:', err.message);
    process.exit(1);
  }

  if (
    !data ||
    !Array.isArray(data.incoming) ||
    !Array.isArray(data.outgoing) ||
    (data.incoming.length === 0 && data.outgoing.length === 0)
  ) {
    console.error(
      `[refresh-transfers] Validation failed — refusing to overwrite fallback. ` +
      `incoming=${data?.incoming?.length ?? 'n/a'}, outgoing=${data?.outgoing?.length ?? 'n/a'}`
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2));
  console.log(
    `[refresh-transfers] Wrote ${FALLBACK_FILE} ` +
    `(${data.incoming.length} incoming, ${data.outgoing.length} outgoing)`
  );
})();
