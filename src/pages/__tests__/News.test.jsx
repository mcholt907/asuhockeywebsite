import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import News from '../News';

// Mock the API service
jest.mock('../../services/api', () => ({
  getNews: jest.fn(),
}));

import { getNews } from '../../services/api';

describe('News Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    getNews.mockImplementation(() => new Promise(() => {}));
    
    render(<News />);
    
    expect(screen.getByText(/loading news/i)).toBeInTheDocument();
  });

  it('should render news articles when data is loaded', async () => {
    const mockNewsData = {
      data: [
        { 
          title: 'ASU Hockey Wins Championship', 
          link: 'http://test.com/article1', 
          source: 'TheSunDevils.com', 
          date: '2024-01-15' 
        }
      ],
      source: 'api',
      timestamp: '2024-01-15T00:00:00Z'
    };

    getNews.mockResolvedValue(mockNewsData);

    render(<News />);

    await waitFor(() => {
      expect(screen.getByText('Hockey News')).toBeInTheDocument();
      expect(screen.getByText('ASU Hockey Wins Championship')).toBeInTheDocument();
    });
  });

  it('should render error message when API call fails', async () => {
    getNews.mockResolvedValue({
      data: [],
      source: 'error',
      error: 'Failed to fetch news'
    });

    render(<News />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch news/i)).toBeInTheDocument();
    });
  });

  it('should render no news message when no articles are available', async () => {
    getNews.mockResolvedValue({
      data: [],
      source: 'api'
    });

    render(<News />);

    await waitFor(() => {
      expect(screen.getByText(/no news articles found/i)).toBeInTheDocument();
    });
  });
});

