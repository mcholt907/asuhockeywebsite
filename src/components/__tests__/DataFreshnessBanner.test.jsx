import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import axios from 'axios';
import { __setMockPathname } from 'react-router-dom';
import DataFreshnessBanner from '../DataFreshnessBanner';

jest.mock('axios');
jest.mock('react-router-dom');

const checkedAt = '2026-11-01T12:00:00.000Z';
const names = ['news', 'schedule', 'standings', 'roster', 'stats', 'alumni', 'recruiting', 'transfers'];
const statusResponse = (changes = {}) => ({
  generatedAt: '2026-11-04T12:00:00.000Z',
  datasets: names.map(name => ({
    name, status: 'ok', timestamp: checkedAt, staleAfterMs: 172800000,
    ageMs: 0, alert: false, source: 'cache', ...changes[name],
  })),
});

let client;
const showBanner = (path = '/news') => {
  __setMockPathname(path);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><DataFreshnessBanner /></QueryClientProvider>);
};
const finishedChecking = () => waitFor(() => {
  expect(client.getQueryCache().getAll()[0]?.state.status).toBe('success');
});

beforeEach(() => axios.get.mockReset());
afterEach(() => {
  client?.clear();
  focusManager.setFocused(undefined);
  jest.useRealTimers();
});

it('stays silent while checking and when all relevant information is current', async () => {
  let resolve;
  axios.get.mockReturnValue(new Promise(done => { resolve = done; }));
  showBanner();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => resolve({ data: statusResponse() }));
  await finishedChecking();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it.each([
  ['/', 'news', 'News'], ['/', 'schedule', 'Schedule'], ['/', 'standings', 'Standings'],
  ['/news', 'news', 'News'], ['/schedule', 'schedule', 'Schedule'],
  ['/roster', 'roster', 'Roster'], ['/stats', 'stats', 'Statistics'],
  ['/alumni', 'alumni', 'Alumni'], ['/recruiting', 'recruiting', 'Recruiting'],
  ['/recruiting', 'transfers', 'Transfers'],
])('warns on %s when %s is overdue and shows its real check date', async (route, name, label) => {
  axios.get.mockResolvedValue({ data: statusResponse({ [name]: { status: 'stale', alert: true } }) });
  const { container } = showBanner(route);
  const banner = await screen.findByRole('status');
  expect(banner).toHaveTextContent(/may be out of date/i);
  expect(banner).toHaveTextContent(label);
  expect(container.querySelector('time')).toHaveAttribute('dateTime', checkedAt);
  expect(banner).not.toHaveTextContent(/cache|scraper|fallback/i);
});

it('ignores overdue information unrelated to the current page', async () => {
  axios.get.mockResolvedValue({ data: statusResponse({ alumni: { status: 'stale', alert: true } }) });
  showBanner('/news');
  await finishedChecking();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not warn on the static analytics page', async () => {
  axios.get.mockResolvedValue({ data: statusResponse({ stats: { status: 'stale', alert: true } }) });
  showBanner('/analytics');
  await act(async () => {});
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it.each(['missing', 'unknown'])('warns when relevant freshness is %s without inventing a date', async status => {
  axios.get.mockResolvedValue({ data: statusResponse({ news: { status, timestamp: null, alert: true } }) });
  const { container } = showBanner();
  expect(await screen.findByRole('status')).toHaveTextContent(/last checked time unavailable/i);
  expect(container.querySelector('time')).toBeNull();
});

it('treats an omitted relevant dataset as unverified', async () => {
  const data = statusResponse();
  data.datasets = data.datasets.filter(dataset => dataset.name !== 'news');
  axios.get.mockResolvedValue({ data });
  showBanner();
  expect(await screen.findByRole('status')).toHaveTextContent(/last checked time unavailable/i);
});

it('reports a failed freshness check without blocking the page', async () => {
  axios.get.mockRejectedValue(new Error('offline'));
  showBanner();
  expect(await screen.findByRole('status')).toHaveTextContent(/Data freshness could not be verified/i);
});

it('reports malformed freshness responses as a check failure', async () => {
  axios.get.mockResolvedValue({ data: {} });
  showBanner();
  expect(await screen.findByRole('status')).toHaveTextContent(/Data freshness could not be verified/i);
});

it('keeps the last known warning when a subsequent check fails', async () => {
  axios.get.mockResolvedValueOnce({ data: statusResponse({ news: { status: 'stale', alert: true } }) })
    .mockRejectedValueOnce(new Error('offline'));
  const { container } = showBanner();
  await screen.findByRole('status');
  await act(async () => { await client.refetchQueries(); });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Data freshness could not be verified/i));
  expect(container.querySelector('time')).toHaveAttribute('dateTime', checkedAt);
});

it('checks again on focus even within the five-minute interval', async () => {
  axios.get.mockResolvedValueOnce({ data: statusResponse() })
    .mockResolvedValueOnce({ data: statusResponse({ news: { status: 'stale', alert: true } }) });
  showBanner();
  await finishedChecking();
  act(() => focusManager.setFocused(true));
  expect(await screen.findByRole('status')).toHaveTextContent(/may be out of date/i);
});

it('checks again after five minutes while the page remains open', async () => {
  jest.useFakeTimers();
  axios.get.mockResolvedValueOnce({ data: statusResponse() })
    .mockResolvedValueOnce({ data: statusResponse({ news: { status: 'stale', alert: true } }) });
  showBanner();
  await act(async () => { await jest.advanceTimersByTimeAsync(1); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => { await jest.advanceTimersByTimeAsync(300000); });
  expect(screen.getByRole('status')).toHaveTextContent(/may be out of date/i);
});
