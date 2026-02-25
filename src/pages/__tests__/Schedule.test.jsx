import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Schedule from '../Schedule';

// Mock the API service
jest.mock('../../services/api', () => ({
  getSchedule: jest.fn(),
}));

import { getSchedule } from '../../services/api';

describe('Schedule Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    getSchedule.mockImplementation(() => new Promise(() => {}));
    
    render(<Schedule />);
    
    expect(screen.getByText(/loading schedule/i)).toBeInTheDocument();
  });

  it('should render schedule games when data is loaded', async () => {
    const mockScheduleData = {
      data: [
        { 
          date: '2024-01-15', 
          opponent: 'University of Arizona', 
          status: 'Home',
          time: '7:00 PM',
          location: 'Mullett Arena'
        },
        { 
          date: '2024-01-20', 
          opponent: 'Boston University', 
          status: 'Away',
          time: '6:00 PM',
          location: 'Agganis Arena'
        }
      ],
      source: 'api',
      timestamp: '2024-01-15T00:00:00Z'
    };

    getSchedule.mockResolvedValue(mockScheduleData);

    render(<Schedule />);

    await waitFor(() => {
      expect(screen.getByText('Team Schedule (2025-2026)')).toBeInTheDocument();
      expect(screen.getByText(/University of Arizona/i)).toBeInTheDocument();
      expect(screen.getByText(/Boston University/i)).toBeInTheDocument();
    });
  });

  it('should render error message when API call fails', async () => {
    getSchedule.mockResolvedValue({
      data: [],
      source: 'error',
      error: 'Failed to fetch schedule'
    });

    render(<Schedule />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch schedule/i)).toBeInTheDocument();
    });
  });

  it('should render Box and Metrics links for completed games', async () => {
    const mockScheduleData = {
      data: [
        {
          date: '2024-01-15',
          opponent: 'Penn State',
          status: 'Home',
          time: '7:00 PM',
          location: 'Mullett Arena',
          result: 'W 4-1',
          box_link: 'https://www.collegehockeynews.com/box/final/20240115/psu/asu/',
          metrics_link: 'https://www.collegehockeynews.com/box/metrics.php?gd=12345',
        },
      ],
      source: 'api',
      timestamp: '2024-01-15T00:00:00Z',
    };

    getSchedule.mockResolvedValue(mockScheduleData);
    render(<Schedule />);

    await waitFor(() => {
      const boxLink = screen.getByRole('link', { name: /box/i });
      const metricsLink = screen.getByRole('link', { name: /metrics/i });
      expect(boxLink).toHaveAttribute('href', 'https://www.collegehockeynews.com/box/final/20240115/psu/asu/');
      expect(boxLink).toHaveAttribute('target', '_blank');
      expect(metricsLink).toHaveAttribute('href', 'https://www.collegehockeynews.com/box/metrics.php?gd=12345');
      expect(metricsLink).toHaveAttribute('target', '_blank');
    });
  });

  it('should not render Box/Metrics links when fields are absent', async () => {
    const mockScheduleData = {
      data: [
        {
          date: '2024-02-01',
          opponent: 'Denver',
          status: 'Away',
          time: '7:00 PM',
          location: 'Magness Arena',
          result: 'L 1-3',
        },
      ],
      source: 'api',
      timestamp: '2024-02-01T00:00:00Z',
    };

    getSchedule.mockResolvedValue(mockScheduleData);
    render(<Schedule />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /box/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /metrics/i })).not.toBeInTheDocument();
    });
  });

  it('should render 4-row record widget when team_record is provided', async () => {
    const mockScheduleData = {
      data: [
        { date: '2024-01-15', opponent: 'Denver', status: 'Home', time: '7:00 PM', location: 'Mullett Arena' }
      ],
      team_record: {
        overall: { wins: 14, losses: 19, ties: 1 },
        conf:    { wins: 7,  losses: 14, ties: 1 },
        home:    { wins: 9,  losses: 10, ties: 1 },
        away:    { wins: 5,  losses: 9,  ties: 0 },
      },
      source: 'api',
      timestamp: '2024-01-15T00:00:00Z',
    };

    getSchedule.mockResolvedValue(mockScheduleData);
    render(<Schedule />);

    await waitFor(() => {
      expect(screen.getByText('Overall')).toBeInTheDocument();
      expect(screen.getByText('NCHC')).toBeInTheDocument();
      expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Away').length).toBeGreaterThan(0);
      expect(screen.getByText('14-19-1')).toBeInTheDocument();
      expect(screen.getByText('7-14-1')).toBeInTheDocument();
      expect(screen.getByText('9-10-1')).toBeInTheDocument();
      expect(screen.getByText('5-9')).toBeInTheDocument(); // ties=0 omitted
    });
  });

  it('should render single-row overall record fallback when team_record is absent', async () => {
    const mockScheduleData = {
      data: [
        { date: '2024-01-15', opponent: 'Denver', status: 'Home', time: '7:00 PM', location: 'Mullett Arena', result: 'W 3-1' }
      ],
      source: 'api',
      timestamp: '2024-01-15T00:00:00Z',
    };

    getSchedule.mockResolvedValue(mockScheduleData);
    render(<Schedule />);

    await waitFor(() => {
      expect(screen.getByText('Overall')).toBeInTheDocument();
      expect(screen.queryByText('NCHC')).not.toBeInTheDocument();
    });
  });
});