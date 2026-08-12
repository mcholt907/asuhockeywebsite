import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import Recruiting from '../Recruiting';
import { renderWithQueryClient } from '../../test-utils/renderWithQueryClient';

jest.mock('../../services/api', () => ({
  getRecruits: jest.fn(),
  getTransfers: jest.fn(),
}));

import { getRecruits, getTransfers } from '../../services/api';

const renderRecruiting = () => renderWithQueryClient(
  <HelmetProvider>
    <Recruiting />
  </HelmetProvider>
);

describe('Recruiting page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRecruits.mockResolvedValue({
      '2026-2027': [
        { name: 'Chase Hamm', position: 'G', player_link: 'https://example.com/hamm' },
        { name: 'Shared Future Player', position: 'F', player_link: 'https://example.com/shared' },
      ],
      '2027-2028': [
        { name: 'Marko Bilic', position: 'G', player_link: 'https://example.com/bilic' },
        { name: 'Jimmy Egan', position: 'F', player_link: 'https://example.com/egan' },
        { name: 'Shared Future Player', position: 'F', player_link: 'https://example.com/shared' },
      ],
      '2028-2029': [
        { name: 'Rian Marquardt', position: 'D', player_link: 'https://example.com/marquardt' },
      ],
    });
    getTransfers.mockResolvedValue({ incoming: [], outgoing: [] });
  });

  it('labels season tabs as teams and renders only the selected 2027-2028 EP roster', async () => {
    renderRecruiting();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2026-2027 Team' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Projected Future Teams' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Class$/ })).not.toBeInTheDocument();
    expect(screen.getByText('Chase Hamm')).toBeInTheDocument();
    expect(screen.getByText('Shared Future Player')).toBeInTheDocument();
    expect(screen.queryByText('Marko Bilic')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2027-2028 Team' }));

    expect(screen.getByText('Marko Bilic')).toBeInTheDocument();
    expect(screen.getByText('Jimmy Egan')).toBeInTheDocument();
    expect(screen.getByText('Shared Future Player')).toBeInTheDocument();
    expect(screen.queryByText('Chase Hamm')).not.toBeInTheDocument();
    expect(screen.queryByText('Rian Marquardt')).not.toBeInTheDocument();
  });

  it('uses team language when the selected projected roster is empty', async () => {
    getRecruits.mockResolvedValue({
      '2026-2027': [],
      '2027-2028': [
        { name: 'Marko Bilic', position: 'G', player_link: 'https://example.com/bilic' },
      ],
      '2028-2029': [],
    });

    renderRecruiting();

    await waitFor(() => {
      expect(screen.getByText('No players listed for the 2026-2027 team yet.')).toBeInTheDocument();
    });
  });
});
