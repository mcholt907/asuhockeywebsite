const RELOAD_KEY = 'fup:preload-reloaded-build';

// A tab opened before a deploy can still reference deleted route chunks.
// Persist the guard across reloads so an outage cannot cause a refresh loop.
export function installPreloadRecovery(buildUrl, browserWindow = window) {
  let reloading = false;

  browserWindow.addEventListener('vite:preloadError', (event) => {
    if (reloading) {
      event.preventDefault();
      return;
    }

    try {
      if (browserWindow.sessionStorage.getItem(RELOAD_KEY) === buildUrl) return;

      browserWindow.sessionStorage.setItem(RELOAD_KEY, buildUrl);
      browserWindow.location.reload();
      reloading = true;
      event.preventDefault();
    } catch {
      // Without a persistent guard, let the original error reach monitoring.
    }
  });
}
