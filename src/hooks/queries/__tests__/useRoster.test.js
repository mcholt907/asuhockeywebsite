import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getRoster } from '../../../services/api';
import { useRoster } from '../useRoster';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useRoster', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns roster on success', async () => {
    getRoster.mockResolvedValue([{ name: 'X' }]);
    const { result } = renderHook(() => useRoster(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ name: 'X' }]);
  });

  it('surfaces isError on throw', async () => {
    getRoster.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRoster(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
