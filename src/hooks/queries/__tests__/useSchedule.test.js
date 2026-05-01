import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getSchedule } from '../../../services/api';
import { useSchedule } from '../useSchedule';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns schedule data on success', async () => {
    const mock = { data: [{ date: '2024-01-01', opponent: 'Team A' }], source: 'api' };
    getSchedule.mockResolvedValue(mock);

    const { result } = renderHook(() => useSchedule(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mock);
  });

  it('surfaces isError when getSchedule throws', async () => {
    getSchedule.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSchedule(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe('boom');
  });
});
