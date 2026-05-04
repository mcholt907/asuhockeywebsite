import axios from 'axios';

// Use environment variable for API URL, fallback to relative path for production or localhost for dev
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * Fetches news articles.
 * @returns {Promise<Object>} A promise that resolves to an object containing news articles.
 *                                   The object should have { data, source, timestamp }
 *                                   Returns error object on error or if data is not in expected format.
 */
export const getNews = async () => {
  const response = await axios.get(`${API_BASE_URL}/news`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/news');
  }
  return response.data;
};

/**
 * Fetches the team roster.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of player objects.
 *                                   Throws on network error.
 */
export const getRoster = async () => {
  const response = await axios.get(`${API_BASE_URL}/roster`);
  return response.data;
};

/**
 * Fetches recruiting data.
 * @returns {Promise<Object>} Object keyed by season (e.g., {"2026-2027": [...]}). Throws on network error.
 */
export const getRecruits = async () => {
  const response = await axios.get(`${API_BASE_URL}/recruits`);
  return response.data;
};

/**
 * Fetches transfer/transaction data.
 * @returns {Promise<Object>} { incoming: [...], outgoing: [...], lastUpdated: ... }. Throws on network error.
 */
export const getTransfers = async () => {
  const response = await axios.get(`${API_BASE_URL}/transfers`);
  return response.data;
};

/**
 * Fetches alumni data (Where Are They Now?).
 * @returns {Promise<Object>} { skaters: [...], goalies: [...], lastUpdated: ... }. Throws on network error.
 */
export const getAlumni = async () => {
  const response = await axios.get(`${API_BASE_URL}/alumni`);
  return response.data;
};


/**
 * Fetches NCHC conference standings.
 * @returns {Promise<Object>} A promise that resolves to { data: standings[] }.
 *                            Throws on network or shape errors.
 */
export const getStandings = async () => {
  const response = await axios.get(`${API_BASE_URL}/standings`);
  return response.data;
};

/**
 * Fetches the game schedule.
 * @returns {Promise<Object>} A promise that resolves to an object containing the game schedule.
 *                                   The object should have { data, source, timestamp }
 *                                   Returns error object on error or if data is not in expected format.
 */
export const getSchedule = async () => {
  const response = await axios.get(`${API_BASE_URL}/schedule`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/schedule');
  }
  return response.data;
}; 