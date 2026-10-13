/** @jest-environment node */

jest.mock('axios');

import axios from 'axios';
import { getNews, getRoster, getRecruits, getSchedule, getStandings, getTransfers, getAlumni, getStats } from '../api';

const endpoints = [
  ['getNews', getNews, '/api/news', {
    data: [{ title: 'Test', link: 'http://t.com', source: 'X', date: '2024-01-01' }],
    source: 'api', timestamp: '2024-01-01T00:00:00Z',
  }],
  ['getRoster', getRoster, '/api/roster', [{ name: 'Player 1', position: 'F', number: '1' }]],
  ['getRecruits', getRecruits, '/api/recruits', { '2024-2025': [{ name: 'R1', position: 'F' }] }],
  ['getTransfers', getTransfers, '/api/transfers', { incoming: [], outgoing: [], lastUpdated: '2024-01-01' }],
  ['getSchedule', getSchedule, '/api/schedule', {
    data: [{ date: '2024-01-01', opponent: 'Team A', status: 'Home' }],
    source: 'api', timestamp: '2024-01-01T00:00:00Z',
  }],
  ['getStandings', getStandings, '/api/standings', { data: [{ team: 'ASU', rank: 1 }] }],
  ['getAlumni', getAlumni, '/api/alumni', { skaters: [], goalies: [], lastUpdated: '2024-01-01' }],
  ['getStats', getStats, '/api/stats', { skaters: [], goalies: [] }],
];

describe('API Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each(endpoints)('%s', (_name, getData, url, data) => {
    it('returns the response data from its endpoint', async () => {
      axios.get.mockResolvedValue({ data });

      expect(await getData()).toEqual(data);
      expect(axios.get).toHaveBeenCalledWith(url);
    });

    it('propagates network failures', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(getData()).rejects.toThrow('Network error');
    });
  });

  it.each([
    ['getNews', getNews],
    ['getSchedule', getSchedule],
  ])('%s rejects an invalid response shape', async (_name, getData) => {
    axios.get.mockResolvedValue({ data: { invalid: 'format' } });

    await expect(getData()).rejects.toThrow(/Invalid data format/i);
  });
});
