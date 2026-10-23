import { installPreloadRecovery } from '../preloadRecovery';

function browserWindow() {
  return Object.assign(new EventTarget(), {
    sessionStorage: window.sessionStorage,
    location: { reload: jest.fn() },
  });
}

function preloadError(target) {
  const event = new Event('vite:preloadError', { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  window.sessionStorage.clear();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-23T18:00:00Z'));
});

afterEach(() => jest.useRealTimers());

test('reloads the current URL when a route asset cannot load', () => {
  const target = browserWindow();
  installPreloadRecovery('/assets/index-build-a.js', target);

  expect(preloadError(target).defaultPrevented).toBe(true);
  expect(target.location.reload).toHaveBeenCalledTimes(1);
});

test('keeps repeated failures visible instead of looping across page reloads', () => {
  const original = browserWindow();
  installPreloadRecovery('/assets/index-build-a.js', original);
  preloadError(original);
  // A request can take longer than a minute to time out after the reload.
  jest.advanceTimersByTime(120_000);

  const reloaded = browserWindow();
  installPreloadRecovery('/assets/index-build-a.js', reloaded);
  expect(preloadError(reloaded).defaultPrevented).toBe(false);
  expect(reloaded.location.reload).not.toHaveBeenCalled();
});

test('can recover from a later deployment in the same tab', () => {
  const target = browserWindow();
  installPreloadRecovery('/assets/index-build-a.js', target);
  preloadError(target);
  jest.advanceTimersByTime(61_000);

  const later = browserWindow();
  installPreloadRecovery('/assets/index-build-b.js', later);
  expect(preloadError(later).defaultPrevented).toBe(true);
  expect(later.location.reload).toHaveBeenCalledTimes(1);
});

test('coalesces CSS and JavaScript failures while a refresh is pending', () => {
  const target = browserWindow();
  installPreloadRecovery('/assets/index-build-a.js', target);

  expect(preloadError(target).defaultPrevented).toBe(true);
  expect(preloadError(target).defaultPrevented).toBe(true);
  expect(target.location.reload).toHaveBeenCalledTimes(1);
});

test('leaves the error visible when storage cannot persist the reload guard', () => {
  const target = browserWindow();
  Object.defineProperty(target, 'sessionStorage', {
    get() { throw new Error('Storage blocked'); },
  });
  installPreloadRecovery('/assets/index-build-a.js', target);

  expect(preloadError(target).defaultPrevented).toBe(false);
  expect(target.location.reload).not.toHaveBeenCalled();
});
