import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import Stats from '../Stats';
import { renderWithQueryClient } from '../../test-utils/renderWithQueryClient';

// Mock the API service
jest.mock('../../services/api', () => ({
  getStats: jest.fn(),
}));

import { getStats } from '../../services/api';

const renderStats = () => renderWithQueryClient(
  <HelmetProvider>
    <Stats />
  </HelmetProvider>
);

const mockSkaters = [
  { 'Player': 'Jane Doe', 'G': '10', 'A': '20', 'Pts.': '30' },
  { 'Player': 'John Smith', 'G': '8', 'A': '12', 'Pts.': '20' },
];

describe('Stats Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    getStats.mockImplementation(() => new Promise(() => {}));

    renderStats();

    expect(screen.getByText(/loading player stats/i)).toBeInTheDocument();
  });

  it('should render stats tables when data is loaded', async () => {
    getStats.mockResolvedValue({ skaters: mockSkaters, goalies: [] });

    renderStats();

    await waitFor(() => {
      expect(screen.getByText('ASU Hockey Player Stats')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /skaters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /goalies/i })).toBeInTheDocument();
  });

  it('should show an empty-state message instead of blank tables when no stats exist', async () => {
    getStats.mockResolvedValue({
      skaters: [],
      goalies: [],
      season: '2026-27',
      isPriorSeason: false,
    });

    renderStats();

    await waitFor(() => {
      expect(
        screen.getByText(/no player stats are available yet/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /skaters/i })).not.toBeInTheDocument();
  });

  it('should show a prior-season note when serving last season\'s stats', async () => {
    getStats.mockResolvedValue({
      skaters: mockSkaters,
      goalies: [],
      season: '2025-26',
      isPriorSeason: true,
    });

    renderStats();

    await waitFor(() => {
      expect(
        screen.getByText(/final stats from the 2025-26 season/i)
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
  });

  it('should not show the prior-season note for current-season stats', async () => {
    getStats.mockResolvedValue({
      skaters: mockSkaters,
      goalies: [],
      season: '2026-27',
      isPriorSeason: false,
    });

    renderStats();

    await waitFor(() => {
      expect(screen.getByText('ASU Hockey Player Stats')).toBeInTheDocument();
    });

    expect(screen.queryByText(/final stats from the/i)).not.toBeInTheDocument();
  });

  it('should render error state when the request fails', async () => {
    getStats.mockRejectedValue(new Error('boom'));

    renderStats();

    await waitFor(() => {
      expect(screen.getByText(/failed to load stats data/i)).toBeInTheDocument();
    });
  });
});
