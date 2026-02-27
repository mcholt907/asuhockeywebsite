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
  try {
    const response = await axios.get(`${API_BASE_URL}/news`);
    // The backend /api/news returns an object like { data: articles[], source: 'live'/'cache', timestamp }
    // We want to return this whole object so the component can access the source.
    if (response.data && typeof response.data === 'object' && response.data.data !== undefined) {
      return response.data;
    }
    console.error('News data received from API is not in the expected format:', response.data);
    return { data: [], source: 'error', error: 'Invalid data format from API' }; // Return error state
  } catch (error) {
    console.error('Error fetching news:', error);
    return { data: [], source: 'error', error: error.message || 'Failed to fetch news' }; // Return error state
  }
};

/**
 * Fetches the team roster.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of player objects.
 *                                   Returns empty array on error.
 */
export const getRoster = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/roster`);
    return response.data; // Expects an array of player objects
  } catch (error) {
    console.error('Error fetching roster:', error);
    return [];
  }
};

/**
 * Fetches recruiting data.
 * @returns {Promise<Object>} A promise that resolves to an object with seasons as keys
 *                            and arrays of recruit objects as values (e.g., {"2026-2027": [...]}).
 *                            Returns empty object on error.
 */
export const getRecruits = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/recruits`);
    return response.data; // Expects an object like { "YYYY-YYYY": [recruits] }
  } catch (error) {
    console.error('Error fetching recruits:', error);
    return {};
  }
};

/**
 * Fetches transfer/transaction data.
 * @returns {Promise<Object>} A promise that resolves to an object with incoming and outgoing transfers.
 *                            Returns empty object on error.
 */
export const getTransfers = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/transfers`);
    return response.data; // Expects { incoming: [...], outgoing: [...], lastUpdated: ... }
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return { incoming: [], outgoing: [], lastUpdated: null };
  }
};

/**
 * Fetches alumni data (Where Are They Now?).
 * @returns {Promise<Object>} A promise that resolves to an object with skaters, goalies, and lastUpdated.
 *                            Returns empty object on error.
 */
export const getAlumni = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/alumni`);
    return response.data; // Expects { skaters: [...], goalies: [...], lastUpdated: ... }
  } catch (error) {
    console.error('Error fetching alumni:', error);
    return { skaters: [], goalies: [], lastUpdated: null };
  }
};


/**
 * Fetches NCHC conference standings.
 * @returns {Promise<Object>} A promise that resolves to { data: standings[] }.
 */
export const getStandings = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/standings`);
    return response.data;
  } catch (error) {
    console.error('Error fetching standings:', error);
    return { data: [] };
  }
};

/**
 * Fetches the game schedule.
 * @returns {Promise<Object>} A promise that resolves to an object containing the game schedule.
 *                                   The object should have { data, source, timestamp }
 *                                   Returns error object on error or if data is not in expected format.
 */
export const getSchedule = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/schedule`);
    // The backend /api/schedule returns { data: schedule_array, source: 'live'/'cache', timestamp }
    // We want to return this whole object so the component can access the source.
    if (response.data && typeof response.data === 'object' && response.data.data !== undefined) {
      return response.data; // Return the whole object
    }
    console.error('Schedule data received from API is not in the expected format:', response.data);
    return { data: [], source: 'error', error: 'Invalid data format from API' }; // Return error state
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return { data: [], source: 'error', error: error.message || 'Failed to fetch schedule' }; // Return error state
  }
}; 