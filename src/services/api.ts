import axios from 'axios';
import type {
  NewsResponse,
  Player,
  RecruitsResponse,
  TransfersResponse,
  AlumniResponse,
  StandingsResponse,
  StatsResponse,
  ScheduleResponse,
} from '../types/api';

// `process.env.REACT_APP_API_URL` was the CRA-era reader; this is the
// Vite-era equivalent. Falls back to the relative path which is what
// production uses (Express serves both bundle and API on the same
// origin) and what the dev proxy resolves transparently.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetches news articles. Throws on shape mismatch so the caller
 * (TanStack Query) can drive an error UI instead of silently returning
 * an empty list.
 */
export const getNews = async (): Promise<NewsResponse> => {
  const response = await axios.get<NewsResponse>(`${API_BASE_URL}/news`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/news');
  }
  return response.data;
};

export const getRoster = async (): Promise<Player[]> => {
  const response = await axios.get<Player[]>(`${API_BASE_URL}/roster`);
  return response.data;
};

export const getRecruits = async (): Promise<RecruitsResponse> => {
  const response = await axios.get<RecruitsResponse>(`${API_BASE_URL}/recruits`);
  return response.data;
};

export const getTransfers = async (): Promise<TransfersResponse> => {
  const response = await axios.get<TransfersResponse>(`${API_BASE_URL}/transfers`);
  return response.data;
};

export const getAlumni = async (): Promise<AlumniResponse> => {
  const response = await axios.get<AlumniResponse>(`${API_BASE_URL}/alumni`);
  return response.data;
};

export const getStandings = async (): Promise<StandingsResponse> => {
  const response = await axios.get<StandingsResponse>(`${API_BASE_URL}/standings`);
  return response.data;
};

export const getStats = async (): Promise<StatsResponse> => {
  const response = await axios.get<StatsResponse>(`${API_BASE_URL}/stats`);
  return response.data;
};

/**
 * Fetches the game schedule. Like getNews, throws on shape mismatch.
 */
export const getSchedule = async (): Promise<ScheduleResponse> => {
  const response = await axios.get<ScheduleResponse>(`${API_BASE_URL}/schedule`);
  if (!response.data || typeof response.data !== 'object' || response.data.data === undefined) {
    throw new Error('Invalid data format from /api/schedule');
  }
  return response.data;
};
