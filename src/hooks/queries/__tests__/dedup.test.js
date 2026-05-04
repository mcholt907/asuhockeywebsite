import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/api');

import { getSchedule } from '../../../services/api';
import { useSchedule } from '../useSchedule';

const ConsumerA = () => {
  const { data } = useSchedule();
  return <div data-testid="a">{data ? 'A loaded' : 'A loading'}</div>;
};

const ConsumerB = () => {
  const { data } = useSchedule();
  return <div data-testid="b">{data ? 'B loaded' : 'B loading'}</div>;
};

describe('useSchedule deduplication', () => {
  it('two components calling useSchedule share one network request', async () => {
    getSchedule.mockResolvedValue({ data: [], source: 'api' });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const { getByTestId } = render(
      <QueryClientProvider client={client}>
        <ConsumerA />
        <ConsumerB />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(getByTestId('a').textContent).toBe('A loaded');
      expect(getByTestId('b').textContent).toBe('B loaded');
    });

    expect(getSchedule).toHaveBeenCalledTimes(1);
  });
});
