# Scraper Configuration for Python
# Centralized configuration for scraper.py

import os
from typing import List

# Season configuration
CURRENT_SEASON = os.getenv('CURRENT_SEASON', '2025-2026')
FUTURE_SEASONS: List[str] = [
    "2026-2027",
    "2027-2028",
    "2028-2029"
]

# Base URL
BASE_URL = "https://www.eliteprospects.com/team/18066/arizona-state-univ."

# HTTP Configuration
USER_AGENT = os.getenv('USER_AGENT', 
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36')
REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', 15))
MAX_RETRIES = int(os.getenv('MAX_RETRIES', 3))
RETRY_INITIAL_DELAY = float(os.getenv('RETRY_INITIAL_DELAY_MS', 1000)) / 1000  # Convert to seconds
RETRY_MAX_DELAY = float(os.getenv('RETRY_MAX_DELAY_MS', 10000)) / 1000
REQUEST_DELAY = float(os.getenv('REQUEST_DELAY_MS', 1000)) / 1000  # Delay between requests

