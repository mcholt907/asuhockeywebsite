import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import * as api from '../../../services/api';
import { useAlumni } from '../useAlumni';
import { useTransfers } from '../useTransfers';
import { useStats } from '../useStats';
import { useStandings } from '../useStandings';
import { useSchedule } from '../useSchedule';
import { useRoster } from '../useRoster';
import { useRecruits } from '../useRecruits';

const cases = [
  ['useAlumni', useAlumni, api.getAlumni, { skaters: [{ name: 'Alumnus' }], goalies: [] }],
  ['useTransfers', useTransfers, api.getTransfers, { incoming: [{ name: 'Transfer' }], outgoing: [], lastUpdated: null }],
  ['useStats', useStats, api.getStats, { skaters: [{ Player: 'Skater', G: '10' }], goalies: [] }],
  ['useStandings', useStandings, api.getStandings, { data: [{ team: 'ASU' }] }],
  ['useSchedule', useSchedule, api.getSchedule, { data: [{ date: '2024-01-01', opponent: 'Team A' }], source: 'api' }],
  ['useRoster', useRoster, api.getRoster, [{ name: 'Roster Player' }]],
  ['useRecruits', useRecruits, api.getRecruits, { '2026-2027': [{ name: 'Recruit' }] }],
];

describe('query hook API wiring', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each(cases)('%s returns data from its API function', async (_name, useHook, getData, data) => {
    getData.mockResolvedValue(data);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useHook(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(data));
    expect(getData).toHaveBeenCalledTimes(1);
  });
});
