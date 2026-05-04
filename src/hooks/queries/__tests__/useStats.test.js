import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getStats } from '../../../services/api';
import { useStats } from '../useStats';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns stats on success', async () => {
    getStats.mockResolvedValue({ skaters: [], goalies: [] });
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('surfaces isError on throw', async () => {
    getStats.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
