// caching-system.js
const fs = require('fs');
const path = require('path');

// Default cache duration, can be overridden if needed by specific scrapers
const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_DIR = path.join(__dirname, 'cache');

function saveToCache(data, filename, duration = DEFAULT_CACHE_DURATION) {
  if (!filename) {
    console.error('Filename not provided to saveToCache');
    return;
  }
  const cacheFilePath = path.join(CACHE_DIR, filename);
  const cacheData = {
    timestamp: new Date().toISOString(),
    data: data,
    cacheDuration: duration, // Store duration for potential future use
  };

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
  console.log(`Data saved to cache at ${cacheFilePath}`);
}

function getFromCache(filename) {
  if (!filename) {
    console.error('Filename not provided to getFromCache');
    return null;
  }
  const cacheFilePath = path.join(CACHE_DIR, filename);

  try {
    if (!fs.existsSync(cacheFilePath)) {
      console.log(`Cache file not found: ${cacheFilePath}`);
      return null;
    }

    const fileContents = fs.readFileSync(cacheFilePath, 'utf8');
    if (!fileContents) {
        console.log(`Cache file is empty: ${cacheFilePath}`);
        return null;
    }

    const cacheData = JSON.parse(fileContents);
    const cacheTime = new Date(cacheData.timestamp).getTime();
    const currentTime = new Date().getTime();
    const cacheDuration = cacheData.cacheDuration || DEFAULT_CACHE_DURATION;

    // Check if cache is still valid
    if (currentTime - cacheTime > cacheDuration) {
      console.log(`Cache expired for ${filename}`);
      fs.unlinkSync(cacheFilePath); // Optionally delete expired cache
      return null;
    }

    console.log(`Cache hit for ${filename}`);
    return cacheData.data; // Return only the data part, as scraper.js expects
  } catch (error) {
    console.error(`Error reading cache for ${filename}:`, error);
    // If there's an error (e.g., corrupted JSON), treat it as a cache miss
    if (fs.existsSync(cacheFilePath)) {
        try {
            fs.unlinkSync(cacheFilePath); // Attempt to delete corrupted cache file
            console.log(`Deleted corrupted cache file: ${cacheFilePath}`);
        } catch (delError) {
            console.error(`Error deleting corrupted cache file ${cacheFilePath}:`, delError);
        }
    }
    return null;
  }
}

module.exports = { saveToCache, getFromCache };
