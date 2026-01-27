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
import { getNews, getRoster, getRecruits, getSchedule } from '../api';

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNews', () => {
    it('should return news data when API call succeeds', async () => {
      const mockData = {
        data: {
          data: [
            { title: 'Test Article', link: 'http://test.com', source: 'Test Source', date: '2024-01-01' }
          ],
          source: 'api',
          timestamp: '2024-01-01T00:00:00Z'
        }
      };

      axios.get.mockResolvedValue(mockData);

      const result = await getNews();

      expect(result).toEqual(mockData.data);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/news'));
    });

    it('should return error object when API call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await getNews();

      expect(result).toEqual({
        data: [],
        source: 'error',
        error: 'Network error'
      });
    });

    it('should return error object when data format is invalid', async () => {
      const mockData = { data: { invalid: 'format' } };
      axios.get.mockResolvedValue(mockData);

      const result = await getNews();

      expect(result).toEqual({
        data: [],
        source: 'error',
        error: 'Invalid data format from API'
      });
    });
  });

  describe('getRoster', () => {
    it('should return roster data when API call succeeds', async () => {
      const mockRoster = [
        { name: 'Player 1', position: 'F', number: '1' },
        { name: 'Player 2', position: 'D', number: '2' }
      ];

      axios.get.mockResolvedValue({ data: mockRoster });

      const result = await getRoster();

      expect(result).toEqual(mockRoster);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/roster'));
    });

    it('should return empty array when API call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await getRoster();

      expect(result).toEqual([]);
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

    it('should return error object when API call fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await getSchedule();

      expect(result).toEqual({
        data: [],
        source: 'error',
        error: 'Network error'
      });
    });
  });
});

