// Request Helper with Retry Logic
const axios = require('axios');
const config = require('../config/scraper-config');

/**
 * Makes an HTTP GET request with retry logic and exponential backoff
 * @param {string} url - The URL to request
 * @param {object} options - Additional axios options
 * @param {number} retries - Number of retry attempts (defaults to config)
 * @returns {Promise} Axios response
 */
async function requestWithRetry(url, options = {}, retries = config.http.retry.maxRetries) {
  const timeout = options.timeout || config.http.timeout;
  const defaultOptions = {
    timeout,
    headers: {
      'User-Agent': config.http.userAgent,
      ...options.headers
    },
    ...options
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, defaultOptions);
      return response;
    } catch (error) {
      // Don't retry on 4xx errors (client errors)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
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
  delayBetweenRequests
};

