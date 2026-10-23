import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import * as api from '../../../services/api';
import { useAlumni } from '../useAlumni';
import { useTransfers } from '../useTransfers';
import { useRoster } from '../useRoster';

// Other hooks are exercised through page tests with the real hooks and mocked API.
// Keep direct wiring coverage for pages without that component-level coverage.
// Recruiting page tests use empty transfers, so retain populated transfer coverage.
const cases = [
  ['useAlumni', useAlumni, api.getAlumni, { skaters: [{ name: 'Alumnus' }], goalies: [] }],
  ['useTransfers', useTransfers, api.getTransfers, { incoming: [{ name: 'Transfer' }], outgoing: [], lastUpdated: null }],
  ['useRoster', useRoster, api.getRoster, [{ name: 'Roster Player' }]],
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
