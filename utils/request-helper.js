// Request Helper with Retry Logic
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('../config/scraper-config');

const COOLDOWN_DIR = path.join(__dirname, '..', 'src', 'scripts', 'cache');
const COOLDOWN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cooldownPathFor(url) {
  try {
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    return path.join(COOLDOWN_DIR, `.403-cooldown-${host}`);
  } catch {
    return null;
  }
}

function isHostInCooldown(url) {
  const filePath = cooldownPathFor(url);
  if (!filePath) return false;
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < COOLDOWN_TTL_MS;
  } catch {
    return false;
  }
}

function markHostCooldown(url) {
  const filePath = cooldownPathFor(url);
  if (!filePath) return;
  try {
    fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
    fs.writeFileSync(filePath, new Date().toISOString());
    console.warn(`[Request Helper] Marked ${new URL(url).hostname} in 403 cooldown for 24h`);
  } catch (err) {
    console.error('[Request Helper] Failed to write cooldown marker:', err.message);
  }
}

class HostCooldownError extends Error {
  constructor(url) {
    super(`Host ${new URL(url).hostname} is in 403 cooldown — skipping request`);
    this.name = 'HostCooldownError';
    this.code = 'HOST_COOLDOWN';
  }
}

/**
 * Makes an HTTP GET request with retry logic and exponential backoff
 * @param {string} url - The URL to request
 * @param {object} options - Additional axios options
 * @param {number} retries - Number of retry attempts (defaults to config)
 * @returns {Promise} Axios response-like object { data: string }
 */
async function requestWithRetry(url, options = {}, retries = config.http.retry.maxRetries) {
  if (isHostInCooldown(url)) {
    throw new HostCooldownError(url);
  }
  const timeout = options.timeout || config.http.timeout;
  const defaultOptions = {
    timeout,
    headers: {
      'User-Agent': config.http.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      ...options.headers
    },
    ...options
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, defaultOptions);
      return response;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        markHostCooldown(url);

        if (process.env.SCRAPER_PUPPETEER_FALLBACK === 'true') {
          console.warn(`[Request Helper] Attempt ${attempt + 1}/${retries + 1} got 403, trying Puppeteer fallback for ${url}...`);
          try {
            const browser = await puppeteer.launch({
              headless: 'new',
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();
            await page.setUserAgent(config.http.userAgent);
            await page.setExtraHTTPHeaders({
              'Accept-Language': 'en-US,en;q=0.9',
            });
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
            const html = await page.content();
            await browser.close();
            return { data: html };
          } catch (pupError) {
            console.error('[Request Helper] Puppeteer fallback failed:', pupError.message);
          }
        } else {
          console.warn(`[Request Helper] 403 for ${url} — Puppeteer fallback disabled (set SCRAPER_PUPPETEER_FALLBACK=true to enable)`);
        }
      }

      // Don't retry on 4xx errors (client errors) other than 403 which we just tried to handle
      if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 403) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === retries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.http.retry.initialDelay * Math.pow(2, attempt),
        config.http.retry.maxDelay
      );

      console.warn(`[Request Helper] Attempt ${attempt + 1}/${retries + 1} failed for ${url}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Adds a delay between requests to respect rate limiting
 * @param {number} delayMs - Delay in milliseconds (defaults to config)
 */
async function delayBetweenRequests(delayMs = config.http.rateLimiting.delayBetweenRequests) {
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

module.exports = {
  requestWithRetry,
  delayBetweenRequests,
  HostCooldownError,
};
