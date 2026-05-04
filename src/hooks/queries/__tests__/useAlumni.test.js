import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getAlumni } from '../../../services/api';
import { useAlumni } from '../useAlumni';

const wrapper = ({ children }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useAlumni', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns alumni on success', async () => {
    getAlumni.mockResolvedValue({ skaters: [], goalies: [] });
    const { result } = renderHook(() => useAlumni(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('surfaces isError on throw', async () => {
    getAlumni.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAlumni(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
