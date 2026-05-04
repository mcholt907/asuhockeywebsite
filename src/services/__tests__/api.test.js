// Use the manual mock from __mocks__ directory
jest.mock('axios');

// Suppress console.error in tests (expected when testing error cases)
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

import axios from 'axios';
import { getNews, getRoster, getRecruits, getSchedule, getStandings } from '../api';

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNews', () => {
    it('returns news data when API call succeeds', async () => {
      const mockData = {
        data: {
          data: [{ title: 'Test', link: 'http://t.com', source: 'X', date: '2024-01-01' }],
          source: 'api',
          timestamp: '2024-01-01T00:00:00Z'
        }
      };
      axios.get.mockResolvedValue(mockData);

      const result = await getNews();

      expect(result).toEqual(mockData.data);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/news'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getNews()).rejects.toThrow('Network error');
    });

    it('throws when the response shape is invalid', async () => {
      axios.get.mockResolvedValue({ data: { invalid: 'format' } });
      await expect(getNews()).rejects.toThrow(/Invalid data format/i);
    });
  });

  describe('getRoster', () => {
    it('returns roster data on success', async () => {
      const mockRoster = [
        { name: 'Player 1', position: 'F', number: '1' },
      ];
      axios.get.mockResolvedValue({ data: mockRoster });

      const result = await getRoster();

      expect(result).toEqual(mockRoster);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/roster'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getRoster()).rejects.toThrow('Network error');
    });
  });

  describe('getRecruits', () => {
    it('should return recruits data when API call succeeds', async () => {
      const mockRecruits = {
        '2024-2025': [
          { name: 'Recruit 1', position: 'F' }
        ]
      };

      axios.get.mockResolvedValue({ data: mockRecruits });

      const result = await getRecruits();

      expect(result).toEqual(mockRecruits);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/recruits'));
    });

    it('should return empty object when API call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await getRecruits();

      expect(result).toEqual({});
    });
  });

  describe('getSchedule', () => {
    it('should return schedule data when API call succeeds', async () => {
      const mockSchedule = {
        data: {
          data: [
            { date: '2024-01-01', opponent: 'Team A', status: 'Home' }
          ],
          source: 'api',
          timestamp: '2024-01-01T00:00:00Z'
        }
      };

      axios.get.mockResolvedValue(mockSchedule);

      const result = await getSchedule();

      expect(result).toEqual(mockSchedule.data);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/schedule'));
    });

    it('should throw when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(getSchedule()).rejects.toThrow('Network error');
    });

    it('should throw when the response shape is invalid', async () => {
      axios.get.mockResolvedValue({ data: { invalid: 'format' } });

      await expect(getSchedule()).rejects.toThrow(/Invalid data format/i);
    });
  });

  describe('getStandings', () => {
    it('returns standings data on success', async () => {
      const mock = { data: [{ team: 'ASU', rank: 1 }] };
      axios.get.mockResolvedValue({ data: mock });

      const result = await getStandings();

      expect(result).toEqual(mock);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/standings'));
    });

    it('throws when the network call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));
      await expect(getStandings()).rejects.toThrow('Network error');
    });
  });
});

