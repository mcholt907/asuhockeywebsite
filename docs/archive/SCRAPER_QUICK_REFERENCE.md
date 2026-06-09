# Scraper Quick Reference Guide

## 📁 File Structure

```
.
├── scraper.js              # Main Node.js scraper (refactored)
├── scraper.py              # Main Python scraper (refactored)
├── scraper.test.js         # Test file for scraper.js
├── config/
│   ├── scraper-config.js   # Node.js configuration
│   └── scraper-config.py   # Python configuration
└── utils/
    ├── request-helper.js   # Node.js request helper with retry
    └── request_helper.py   # Python request helper with retry
```

## 🚀 Quick Start

### Node.js Scraper
```bash
# Run with defaults
node scraper.js

# Run tests
node scraper.test.js

# With custom season
CURRENT_SEASON_YEAR=2026 node scraper.js
```

### Python Scraper
```bash
# Run with defaults
python scraper.py

# With custom season
CURRENT_SEASON=2026-2027 python scraper.py
```

## ⚙️ Configuration

### Key Environment Variables

**Node.js (scraper.js):**
- `CURRENT_SEASON_YEAR` - Season start year (default: 2025)
- `STATS_SEASON` - Stats season string (default: 20252026)
- `REQUEST_TIMEOUT_MS` - Request timeout (default: 30000)
- `MAX_RETRIES` - Max retry attempts (default: 3)
- `REQUEST_DELAY_MS` - Delay between requests (default: 1000)

**Python (scraper.py):**
- `CURRENT_SEASON` - Current season (default: 2025-2026)
- `REQUEST_TIMEOUT` - Request timeout in seconds (default: 15)
- `MAX_RETRIES` - Max retry attempts (default: 3)
- `REQUEST_DELAY_MS` - Delay between requests in ms (default: 1000)

## 🔧 What Was Improved

### ✅ Fixed Issues
1. **Regex bugs** - Fixed double-escaped patterns
2. **Hardcoded values** - Moved to configuration
3. **No retry logic** - Added exponential backoff retry
4. **No timeouts** - Added configurable timeouts
5. **No rate limiting** - Added delays between requests
6. **Test code in production** - Moved to separate file

### ✅ New Features
1. **Configuration files** - Centralized config management
2. **Request helpers** - Reusable retry logic
3. **Environment variable support** - Easy configuration
4. **Better error handling** - Consistent error patterns

## 📝 Usage Examples

### Update Season Year
```bash
# Node.js
CURRENT_SEASON_YEAR=2026 node scraper.js

# Python
CURRENT_SEASON=2026-2027 python scraper.py
```

### Adjust Retry Settings
```bash
# Node.js
MAX_RETRIES=5 RETRY_INITIAL_DELAY_MS=2000 node scraper.js

# Python
MAX_RETRIES=5 RETRY_INITIAL_DELAY_MS=2000 python scraper.py
```

### Increase Request Timeout
```bash
# Node.js
REQUEST_TIMEOUT_MS=60000 node scraper.js

# Python
REQUEST_TIMEOUT=60 python scraper.py
```

## 🐛 Troubleshooting

### Import Errors (Python)
If you see import errors for config files:
- The scraper has fallback defaults built-in
- Or create the config files manually
- Or adjust Python path if needed

### Module Not Found (Node.js)
If you see module errors:
```bash
npm install  # Ensure all dependencies are installed
```

### Retry Logic Not Working
- Check that `MAX_RETRIES` is set correctly
- Verify network connectivity
- Check server response times

## 📊 Performance Tips

1. **Adjust cache durations** - Longer cache = fewer requests
2. **Increase delays** - If getting rate limited, increase `REQUEST_DELAY_MS`
3. **Reduce retries** - If requests are consistently failing, reduce `MAX_RETRIES`
4. **Monitor logs** - Watch for retry messages indicating network issues

## 🔒 Security Notes

- User-Agent can be customized via environment variable
- Timeouts prevent hanging requests
- Retry logic respects 4xx errors (doesn't retry client errors)
- Rate limiting prevents overwhelming target servers

---

**For detailed information, see:**
- `SCRAPER_REVIEW.md` - Full analysis and recommendations
- `SCRAPER_IMPROVEMENTS_SUMMARY.md` - Implementation details

