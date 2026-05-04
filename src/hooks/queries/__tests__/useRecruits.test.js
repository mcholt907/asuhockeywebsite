import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getRecruits } from '../../../services/api';
import { useRecruits } from '../useRecruits';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRecruits', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns recruits on success', async () => {
    getRecruits.mockResolvedValue({ '2026-2027': [] });
    const { result } = renderHook(() => useRecruits(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('surfaces isError on throw', async () => {
    getRecruits.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRecruits(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
