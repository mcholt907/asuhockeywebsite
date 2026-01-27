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
});

