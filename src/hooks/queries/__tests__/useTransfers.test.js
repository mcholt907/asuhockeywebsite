import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getTransfers } from '../../../services/api';
import { useTransfers } from '../useTransfers';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useTransfers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns transfers on success', async () => {
    getTransfers.mockResolvedValue({ incoming: [], outgoing: [], lastUpdated: null });
    const { result } = renderHook(() => useTransfers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('surfaces isError on throw', async () => {
    getTransfers.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTransfers(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
