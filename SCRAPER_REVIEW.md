# Scraper Code Review & Improvement Recommendations

## Overview
Review of `scraper.js` (Node.js) and `scraper.py` (Python) for the ASU Hockey website data scraping functionality.

---

## 🔴 Critical Issues

### 1. Hardcoded Values
**scraper.js:**
- Line 344: Hardcoded season year `2025`
- Line 460: Hardcoded season in URL `20252026`
- Lines 15, 58, 202, 465: Repeated User-Agent strings

**scraper.py:**
- Line 122: Hardcoded season `"2025-2026"`
- Line 133: Hardcoded User-Agent
- Lines 127-129: Hardcoded future season URLs

**Recommendation:** Move to environment variables or config file.

### 2. Regex Escaping Issues
**scraper.js:**
- Lines 287, 290, 298: Double-escaped regex patterns
  ```javascript
  .replace(/^vs\\.\\s*/i, '')  // Should be: /^vs\.\s*/i
  .replace(/^at\\s*/i, '')      // Should be: /^at\s*/i
  .replace(/\\s*\\(exhibition\\)/i, '')  // Should be: /\s*\(exhibition\)/i
  ```

**Recommendation:** Fix regex patterns - remove double escaping.

### 3. No Request Timeout Configuration
**scraper.js:**
- Axios requests have no explicit timeout
- Could hang indefinitely on slow/unresponsive servers

**scraper.py:**
- Has `timeout=15` in one place but inconsistent

**Recommendation:** Add consistent timeout configuration.

### 4. No Retry Logic
Both scrapers fail immediately on network errors.

**Recommendation:** Implement exponential backoff retry logic.

---

## 🟡 High Priority Issues

### 5. No Rate Limiting/Delays
Multiple concurrent requests could trigger rate limiting or IP bans.

**Recommendation:** Add delays between requests and respect robots.txt.

### 6. Inconsistent Error Handling
**scraper.js:**
- Some functions return empty arrays on error
- Some throw errors
- Inconsistent logging

**Recommendation:** Standardize error handling pattern.

### 7. Magic Numbers
**scraper.js:**
- Line 377: `3 * 60 * 1000` (cache duration)
- Line 261: `monthIndex < 7` (season boundary logic)

**scraper.py:**
- Line 17: `timeout=15` (hardcoded timeout)

**Recommendation:** Extract to named constants.

### 8. No Data Validation
Scraped data is not validated before caching/returning.

**Recommendation:** Add schema validation for scraped data.

### 9. Test Code in Production File
**scraper.js:**
- Lines 518-550: Test code at bottom of production file

**Recommendation:** Move to separate test file.

---

## 🟢 Medium Priority Issues

### 10. Duplicate Code
**scraper.js:**
- URL construction logic repeated
- User-Agent string repeated 4+ times
- Similar error handling patterns

**Recommendation:** Extract to helper functions.

### 11. Console.log Instead of Structured Logging
Both files use `console.log`/`print` instead of proper logging.

**Recommendation:** Use structured logging (Winston/Pino for JS, logging module for Python).

### 12. No Request Configuration Centralization
Each axios/requests call has its own configuration.

**Recommendation:** Create shared request configuration.

### 13. Hardcoded URLs
URLs are scattered throughout the code.

**Recommendation:** Centralize in a configuration object/file.

### 14. No Monitoring/Metrics
No tracking of success rates, errors, or performance.

**Recommendation:** Add metrics collection.

---

## 📋 Detailed Recommendations

### For scraper.js

#### 1. Create Configuration Module
```javascript
// config/scraper-config.js
module.exports = {
  seasons: {
    current: process.env.CURRENT_SEASON || 2025,
    stats: process.env.STATS_SEASON || '20252026'
  },
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0...',
  timeouts: {
    request: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
    retry: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000
    }
  },
  rateLimiting: {
    delayBetweenRequests: parseInt(process.env.REQUEST_DELAY_MS) || 1000
  },
  urls: {
    sunDevilsNews: 'https://thesundevils.com/sports/ice-hockey/news?view=list',
    sunDevilsRSS: 'http://thesundevils.com/rss.aspx?path=mhockey',
    sunDevilsSchedule: (year) => `https://thesundevils.com/sports/ice-hockey/schedule/season/${year}-${String(parseInt(year) + 1).substring(2)}`,
    chnNews: 'https://www.collegehockeynews.com/reports/team/Arizona-State/61',
    chnStats: (season) => `https://www.collegehockeynews.com/stats/team/Arizona-State/61/overall,${season}`,
    uscho: 'https://www.uscho.com/team/arizona-state/mens-hockey/'
  }
};
```

#### 2. Create Request Helper with Retry Logic
```javascript
// utils/request-helper.js
const axios = require('axios');
const config = require('../config/scraper-config');

async function requestWithRetry(url, options = {}, retries = config.timeouts.retry.maxRetries) {
  const timeout = options.timeout || config.timeouts.request;
  const defaultOptions = {
    timeout,
    headers: {
      'User-Agent': config.userAgent,
      ...options.headers
    }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, { ...defaultOptions, ...options });
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      
      const delay = Math.min(
        config.timeouts.retry.initialDelay * Math.pow(2, attempt),
        config.timeouts.retry.maxDelay
      );
      
      console.warn(`[Request] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### 3. Fix Regex Patterns
```javascript
// Line 287
game.opponent = fullOpponentText.replace(/^vs\.\s*/i, '').trim();

// Line 290
game.opponent = fullOpponentText.replace(/^at\s*/i, '').trim();

// Line 298
game.opponent = game.opponent.replace(/\s*\(exhibition\)/i, '').trim();
```

#### 4. Add Data Validation
```javascript
// utils/validators.js
function validateArticle(article) {
  return article && 
         typeof article.title === 'string' && article.title.trim().length > 0 &&
         typeof article.link === 'string' && article.link.trim().length > 0 &&
         typeof article.source === 'string';
}

function validateGame(game) {
  return game &&
         game.opponent && game.opponent !== 'TBD' &&
         game.date && game.date !== 'TBD';
}
```

#### 5. Extract Constants
```javascript
// constants.js
const CACHE_DURATIONS = {
  NEWS: 3 * 60 * 1000, // 3 minutes
  SCHEDULE: 24 * 60 * 60 * 1000, // 24 hours
  STATS: 6 * 60 * 60 * 1000 // 6 hours
};

const SEASON_BOUNDARY_MONTH = 7; // July (0-indexed)
```

### For scraper.py

#### 1. Create Configuration File
```python
# config.py
import os
from typing import List

CURRENT_SEASON = os.getenv('CURRENT_SEASON', '2025-2026')
BASE_URL = "https://www.eliteprospects.com/team/18066/arizona-state-univ."
FUTURE_SEASONS = [
    "2026-2027",
    "2027-2028"
]

USER_AGENT = os.getenv('USER_AGENT', 
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', 15))
MAX_RETRIES = int(os.getenv('MAX_RETRIES', 3))
RETRY_DELAY = int(os.getenv('RETRY_DELAY_MS', 1000))
```

#### 2. Add Retry Logic
```python
# utils/request_helper.py
import time
import requests
from typing import Optional

def request_with_retry(url: str, headers: dict, max_retries: int = 3, 
                       timeout: int = 15) -> Optional[requests.Response]:
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise
            delay = (2 ** attempt) * 1  # Exponential backoff
            time.sleep(delay)
            print(f"Retry {attempt + 1}/{max_retries} for {url}")
    return None
```

#### 3. Use Proper Logging
```python
# Replace print statements with logging
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Use logger.info() instead of print()
```

#### 4. Add Data Validation
```python
# utils/validators.py
def validate_player_data(player: dict) -> bool:
    required_fields = ['name', 'number']
    return all(field in player and player[field] for field in required_fields)
```

---

## 🎯 Priority Implementation Order

### Phase 1 (Critical - Do First)
1. ✅ Fix regex escaping issues in scraper.js
2. ✅ Add timeout configuration to all requests
3. ✅ Extract hardcoded values to config/environment variables
4. ✅ Add retry logic for network requests

### Phase 2 (High Priority)
5. ✅ Add rate limiting/delays between requests
6. ✅ Standardize error handling
7. ✅ Extract magic numbers to constants
8. ✅ Add data validation

### Phase 3 (Medium Priority)
9. ✅ Refactor duplicate code
10. ✅ Implement structured logging
11. ✅ Centralize request configuration
12. ✅ Move test code to separate file

---

## 📊 Code Quality Metrics

### scraper.js
- **Lines of Code:** 551
- **Functions:** 8
- **Cyclomatic Complexity:** Medium-High (nested conditionals)
- **Duplication:** High (User-Agent, URL construction)
- **Error Handling:** Inconsistent

### scraper.py
- **Lines of Code:** 164
- **Functions:** 4
- **Cyclomatic Complexity:** Low-Medium
- **Duplication:** Low
- **Error Handling:** Basic

---

## 🔧 Quick Wins (Easy Fixes)

1. **Fix regex patterns** (5 minutes)
2. **Extract User-Agent to constant** (2 minutes)
3. **Add timeout to axios requests** (5 minutes)
4. **Extract magic numbers** (10 minutes)
5. **Move test code to separate file** (5 minutes)

**Total: ~30 minutes for quick improvements**

---

## 📝 Additional Recommendations

### Security
- Consider adding request signing/authentication if needed
- Validate all URLs before making requests
- Sanitize scraped data before storing

### Performance
- Consider parallel requests with Promise.all() (with rate limiting)
- Implement request queuing for better control
- Cache responses more aggressively

### Maintainability
- Add JSDoc/Python docstrings
- Create unit tests for parsing logic
- Add integration tests for full scraping flow
- Document expected HTML structure changes

### Monitoring
- Add metrics: success rate, error rate, response times
- Log scraping statistics
- Alert on consecutive failures

---

## Conclusion

Both scrapers are functional but need refactoring for:
- **Maintainability:** Reduce duplication, extract configuration
- **Reliability:** Add retries, timeouts, validation
- **Observability:** Better logging and error handling
- **Flexibility:** Configuration-driven instead of hardcoded

**Estimated Refactoring Time:** 4-6 hours for comprehensive improvements.

