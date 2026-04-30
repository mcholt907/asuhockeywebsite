# Phase 1 Quick Wins Design

**Date:** 2026-04-30
**Status:** Draft
**Source:** `2026-04-30-technical-audit.md` items 1–7

---

## Problem

The 2026-04-30 audit identified seven low-effort, high-leverage fixes spanning security, ops, performance, and a11y. None individually warrants its own design doc, but they bundle naturally into a single PR because they touch different files and carry no cross-dependencies.

## Goal

Ship items 1–7 as one bundled PR. Each is reversible on its own, but bundling minimizes review-and-deploy overhead. Total estimated work: a half-day.

---

## Items & Design Decisions

### 1. `npm audit fix` (audit O1)

Run `npm audit fix` and accept the dependency resolutions it produces. Axios will move from `^1.6.8` to whatever current minor patches the SSRF / DoS / metadata-exfiltration CVEs (likely `^1.7.x` or `^1.8.x`).

**Verification:** `npm audit --audit-level=high` returns clean. Run full `npm test` + `npm run test:e2e:chromium` after.

**Out of scope:** Manual major-version bumps. If `npm audit fix` proposes a breaking change (`--force`), defer to Phase 3.

### 2. Dedicated `/healthz` endpoint (audit O3)

| Property | Value |
| --- | --- |
| Path | `/healthz` (top-level, **not** `/api/healthz`) |
| Why top-level | Bypasses the `/api/` rate limiter; healthchecks fire frequently and shouldn't compete with user traffic for the bucket |
| Response | `{ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() }` |
| Status code | 200 always — this is a liveness probe, not a readiness probe |
| Side effects | None — no DB, no scrape, no cache touch |
| `render.yaml` | Change `healthCheckPath: /api/news` → `healthCheckPath: /healthz` |

**Why not readiness-style** (e.g., "scrapers responding"): Render's healthcheck failing pulls the instance from the pool and triggers re-deploys. Coupling that to upstream scraper availability is exactly the bug the audit flagged.

### 3. In-memory cache for `asu_hockey_data.json` (audit B3)

Currently `server.js` calls `fs.readFileSync('asu_hockey_data.json')` on every `/api/news` and `/api/recruits` request.

**Design:** New module `services/static-data.js` exposing `getStaticData()`:

- On first call, `readFileSync` + `JSON.parse`, cache the parsed object and the file's `mtimeMs`.
- On subsequent calls, `fs.statSync(file).mtimeMs` is cheap; if unchanged, return cached object. If changed, re-read and re-cache.
- **No async** — the file is local, small (21 KB), and already being read sync today. Switching to `fs.promises` would cascade through `server.js` route handlers without meaningful benefit.

**Why mtime check (not "read once at startup"):** the file is hand-edited via the `add-photos.js` / `add-new-recruits.js` utility scripts. mtime invalidation lets edits take effect without a server restart, preserving the current dev ergonomics.

**Replaces:** the `readFileSync` calls at `server.js:118` and `server.js:168`.

### 4. Harden `saveToCache` against write failures (audit B2)

**Correction from initial audit:** `saveToCache` in [src/scripts/caching-system.js:10–29](src/scripts/caching-system.js) is fully synchronous — it does not return a promise, so the originally proposed "add `await`" fix would be a no-op. The real bug is that `fs.writeFileSync` on line 27 can throw (disk full, permission denied) with no surrounding `try/catch`. From an async caller, that surfaces as an unhandled promise rejection.

**Fix:** wrap the body of `saveToCache` in `try/catch`, log to console + Sentry on failure, return silently. Sentry is already imported on line 4.

```js
function saveToCache(data, filename, duration = DEFAULT_CACHE_DURATION) {
  if (!filename) {
    console.error('Filename not provided to saveToCache');
    return;
  }
  try {
    const cacheFilePath = path.join(CACHE_DIR, filename);
    const cacheData = {
      timestamp: new Date().toISOString(),
      data: data,
      cacheDuration: duration,
    };
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
    console.log(`Data saved to cache at ${cacheFilePath}`);
  } catch (error) {
    console.error(`[Cache System] Failed to save cache for ${filename}:`, error.message);
    Sentry.captureException(error, { tags: { component: 'caching-system', filename } });
  }
}
```

No call-site changes needed. Atomic-write hardening (write-temp + rename) is a separate audit item (B4) deferred to Phase 2.

### 5. Sentry trace sample rate (audit B8)

`server.js:12` and `src/index.js` Sentry init both pass `tracesSampleRate: 1.0`.

**Design:**

- Backend (`server.js`): `tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0`
- Frontend (`src/index.js`): same expression. CRA inlines `process.env.NODE_ENV` at build time, so this works without a custom env var.
- Profiling sample (backend): `profilesSampleRate: 0.1` in prod (currently 1.0).
- Replays (frontend): keep `replaysSessionSampleRate: 0.1` (already 0.1) and `replaysOnErrorSampleRate: 1.0` unchanged — error replays are the highest signal-to-cost ratio.

**Why 0.1, not 0.01:** Site traffic is low (single-digit RPS at peak); a 1% sample would lose meaningful trace coverage. 10% balances cost and observability.

### 6. Accessibility: focus styles + missing aria-label (audit F8, F9)

**Two changes in `src/App.css`:**

```css
:focus-visible {
  outline: 2px solid var(--asu-gold);
  outline-offset: 2px;
  border-radius: 2px;
}

.skip-to-main {
  position: absolute;
  left: -9999px;
}
.skip-to-main:focus {
  left: 1rem;
  top: 1rem;
  z-index: 10000;
  background: var(--asu-maroon);
  color: var(--asu-gold);
  padding: 0.5rem 1rem;
}
```

**`src/App.js`:** Add `<a href="#main-content" className="skip-to-main">Skip to main content</a>` as the first child of the layout, and `id="main-content"` on the existing `<main>` element.

**`src/components/GlobalNotificationBanner.jsx`:** Add `aria-label="Dismiss notification"` to the close button.

**Out of scope for Phase 1:** WCAG AA contrast audit of gold-on-maroon (item F8 partial). Tracked separately if it fails — likely needs a slightly lighter gold for body text, not the brand gold for accents.

### 7. `.env` git-history audit (audit O1 follow-up)

**Resolved 2026-04-30, before implementation.** Three commands run:

- `git log --all --full-history -- .env` → empty
- `git log --all --full-history --diff-filter=A -- .env .env.local .env.production .env.development` → empty
- `git ls-files --error-unmatch .env` → "did not match any file(s) known to git"

`.env` has never been committed on any branch. Sentry DSN rotation is not needed. No implementation work for this item.

---

## Files to Modify

| File | Change |
| --- | --- |
| `package.json` / `package-lock.json` | `npm audit fix` output |
| `server.js` | Add `/healthz` route; replace two `readFileSync` calls with `getStaticData()`; lower Sentry sample rate |
| `services/static-data.js` | **New** — mtime-based in-memory cache for `asu_hockey_data.json` |
| `recruiting-scraper.js` | `await` the `saveToCache` call (~line 230) |
| `render.yaml` | `healthCheckPath: /healthz` |
| `src/index.js` | Lower Sentry sample rate |
| `src/App.js` | Skip-to-main link + `id="main-content"` |
| `src/App.css` | `:focus-visible` + `.skip-to-main` styles |
| `src/components/GlobalNotificationBanner.jsx` | `aria-label` on close button |

No frontend bundle changes (no new deps), no test framework changes.

---

## Testing

1. `npm audit --audit-level=high` → 0 results.
2. Local: `node server.js` → `curl localhost:5000/healthz` returns `{ status: "ok", ... }`.
3. Local: `curl localhost:5000/api/news` and `/api/recruits` still return data; modify `asu_hockey_data.json` (e.g. add a `manual_news` entry) — next request reflects the change without restart.
4. `npm run test:e2e:chromium` → all green.
5. Manual: tab through the site with keyboard; gold focus ring visible on every interactive element. Activate skip-to-main; focus jumps to `<main>`.
6. Sentry dashboard after deploy: prod traces sampled at ~10%.

---

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| `npm audit fix` introduces a breaking change | Run full E2E + manual smoke before pushing. If breaking, isolate to its own commit so it can be reverted without dropping the other six fixes. |
| mtime cache returns stale data due to clock skew | Local-file mtime is monotonic from the OS clock; not a real risk on Render. |
| Skip link CSS conflicts with existing layout | The `position: absolute; left: -9999px` pattern is well-established and will not affect layout when not focused. |

---

## Out of Scope (deferred to later phases)

- TanStack Query / data layer overhaul (Phase 2 #8)
- CI workflow (Phase 2 #10)
- CSP tightening (Phase 2 #14)
- Atomic cache writes (Phase 2 #12)
- CRA → Vite (Phase 3 #17)
