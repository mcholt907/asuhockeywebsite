// services/static-data.js
// In-memory cache for asu_hockey_data.json with mtime-based invalidation.
// Re-reads the file only when its mtime changes, so hand-edits via add-photos.js /
// add-new-recruits.js take effect without restarting the server.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'asu_hockey_data.json');

let cached = null;
let cachedMtimeMs = 0;

function getStaticData() {
  let stat;
  try {
    stat = fs.statSync(DATA_FILE);
  } catch (err) {
    console.error('[static-data] Cannot stat asu_hockey_data.json:', err.message);
    return cached || {};
  }

  if (!cached || stat.mtimeMs !== cachedMtimeMs) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      cached = JSON.parse(raw);
      cachedMtimeMs = stat.mtimeMs;
      console.log('[static-data] Loaded asu_hockey_data.json (mtime changed)');
    } catch (err) {
      console.error('[static-data] Failed to read/parse asu_hockey_data.json:', err.message);
      return cached || {};
    }
  }

  return cached;
}

module.exports = { getStaticData };
