import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NewsFeed from '../NewsFeed';
import { NotificationProvider } from '../../context/NotificationContext';

// Mock the API service
jest.mock('../../services/api', () => ({
  getNews: jest.fn(),
}));

import { getNews } from '../../services/api';

const renderWithProvider = (component) => {
  return render(
    <NotificationProvider>
      {component}
    </NotificationProvider>
  );
};

describe('NewsFeed Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    getNews.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    renderWithProvider(<NewsFeed />);
    
    expect(screen.getByText(/loading news/i)).toBeInTheDocument();
  });

  it('should render news articles when data is loaded', async () => {
    const mockNewsData = {
      data: [
        { title: 'Test Article 1', link: 'http://test1.com', source: 'Test Source', date: '2024-01-01' },
        { title: 'Test Article 2', link: 'http://test2.com', source: 'Test Source', date: '2024-01-02' }
      ],
      source: 'api',
      timestamp: '2024-01-01T00:00:00Z'
    };

    getNews.mockResolvedValue(mockNewsData);

    renderWithProvider(<NewsFeed />);

    await waitFor(() => {
      expect(screen.getByText('Test Article 1')).toBeInTheDocument();
      expect(screen.getByText('Test Article 2')).toBeInTheDocument();
    });
  });

  it('should render error message when API call fails', async () => {
    getNews.mockResolvedValue({
      data: [],
      source: 'error',
      error: 'Failed to fetch news'
    });

    renderWithProvider(<NewsFeed />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch news/i)).toBeInTheDocument();
    });
  });

  it('should limit articles when limit prop is provided', async () => {
    const mockNewsData = {
      data: [
        { title: 'Article 1', link: 'http://test1.com', source: 'Test', date: '2024-01-01' },
        { title: 'Article 2', link: 'http://test2.com', source: 'Test', date: '2024-01-02' },
        { title: 'Article 3', link: 'http://test3.com', source: 'Test', date: '2024-01-03' }
      ],
      source: 'api'
    };

    getNews.mockResolvedValue(mockNewsData);

    renderWithProvider(<NewsFeed limit={2} />);

    await waitFor(() => {
      expect(screen.getByText('Article 1')).toBeInTheDocument();
      expect(screen.getByText('Article 2')).toBeInTheDocument();
      expect(screen.queryByText('Article 3')).not.toBeInTheDocument();
    });
  });
});

