# Phase 1 Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Source design doc:** `2026-04-30-phase1-quick-wins-design.md`
**Goal:** Ship audit items 1–6 as a single bundled PR. Item 7 (`.env` history audit) is already resolved — never committed.
**Tech stack:** Node.js 18+, Express, React 19, Sentry, Render

---

### Task 1: Run `npm audit fix`

**Files:**

- Modify: `package.json`, `package-lock.json`

**Step 1: Baseline the current state**

```bash
npm audit --audit-level=high
```

Record the count of high/critical findings — this is the "before" number for the PR description.

**Step 2: Apply non-breaking fixes**

```bash
npm audit fix
```

Do **not** pass `--force`. If npm reports remaining vulnerabilities that need `--force`, leave them — they're out of scope for Phase 1.

**Step 3: Verify**

```bash
npm audit --audit-level=high
npm test -- --watchAll=false
```

Expected: 0 high/critical findings. All unit tests still pass.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): npm audit fix to patch axios + transitive CVEs"
```

---

### Task 2: Add `/healthz` endpoint and switch the Render healthcheck

**Files:**

- Modify: `server.js` (insert route)
- Modify: `render.yaml` (line 19)

**Step 1: Add the `/healthz` route in `server.js`**

The endpoint must:

- Live at top-level (not under `/api/`) so it bypasses the rate limiter
- Be defined *before* the static-file serving block but *after* security middleware

Insert immediately after the rate-limit application (currently line 108, `app.use('/api/', apiLimiter);`):

```js
// Liveness probe — top-level, bypasses /api/ rate limiter and does no work
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

**Step 2: Update `render.yaml`**

Change line 19 from:

```yaml
    healthCheckPath: /api/news
```

to:

```yaml
    healthCheckPath: /healthz
```

**Step 3: Verify locally**

```bash
node server.js
```

In another terminal:

```bash
curl -s http://localhost:5000/healthz | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d)"
```

Expected: `{ status: 'ok', uptime: <number>, timestamp: '...' }`. Uptime increases on subsequent calls.

Confirm the endpoint is **not** rate-limited by hitting it 150 times in a row:

```bash
for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/healthz; done | sort | uniq -c
```

Expected: `150 200`. (The `/api/` limiter would have started returning 429 by request 101.)

**Step 4: Commit**

```bash
git add server.js render.yaml
git commit -m "feat(ops): add /healthz endpoint and use it for Render healthcheck"
```

---

### Task 3: In-memory cache for `asu_hockey_data.json`

**Files:**

- Create: `services/static-data.js`
- Modify: `server.js` (replace two `readFileSync` calls)

**Step 1: Create `services/static-data.js`**

```js
// services/static-data.js
// In-memory cache for asu_hockey_data.json with mtime-based invalidation.
// Re-reads the file only when its mtime changes, so hand-edits via add-photos.js /
// add-new-recruits.js take effect without restarting the server.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'asu_hockey_data.json');

let cached = null;
let cachedMtimeMs = 0;

function getStaticData() {
  let stat;
  try {
    stat = fs.statSync(DATA_FILE);
  } catch (err) {
    console.error('[static-data] Cannot stat asu_hockey_data.json:', err.message);
    return cached || {};
  }

  if (!cached || stat.mtimeMs !== cachedMtimeMs) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      cached = JSON.parse(raw);
      cachedMtimeMs = stat.mtimeMs;
      console.log('[static-data] Loaded asu_hockey_data.json (mtime changed)');
    } catch (err) {
      console.error('[static-data] Failed to read/parse asu_hockey_data.json:', err.message);
      return cached || {};
    }
  }

  return cached;
}

module.exports = { getStaticData };
```

**Step 2: Wire it into `server.js`**

Add the import near the other service imports (after line 25, `const { getRoster } = ...`):

```js
const { getStaticData } = require('./services/static-data');
```

Replace the `/api/news` manual-news block (currently lines 116–122):

```js
// before
let manualNews = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'asu_hockey_data.json'), 'utf8');
  manualNews = JSON.parse(raw).manual_news || [];
} catch (e) {
  console.error('[API /news] Failed to read manual_news:', e.message);
}
```

```js
// after
const manualNews = getStaticData().manual_news || [];
```

Replace the `/api/recruits` handler body (currently lines 167–174):

```js
// before
app.get('/api/recruits', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'asu_hockey_data.json'), 'utf8');
    const data = JSON.parse(raw);
    res.json(data.recruiting || {});
  } catch (error) {
    console.error('[API /recruits] Error reading recruiting data:', error.message);
    res.status(500).json({ error: 'Failed to fetch recruiting data' });
  }
});
```

```js
// after
app.get('/api/recruits', (req, res) => {
  res.json(getStaticData().recruiting || {});
});
```

**Step 3: Verify**

```bash
node server.js
```

```bash
curl -s http://localhost:5000/api/recruits | node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))))"
curl -s http://localhost:5000/api/news    | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('count:', d.data?.length)"
```

Expected: recruits returns season keys (e.g. `[ '2026-2027', '2027-2028', '2028-2029' ]`); news returns a populated count.

In the server log, you should see exactly **one** `[static-data] Loaded asu_hockey_data.json (mtime changed)` line — on the first request.

**Step 4: Verify hot reload still works**

With the server still running, append a harmless top-level key to `asu_hockey_data.json`:

```bash
node -e "const fs=require('fs'); const f='asu_hockey_data.json'; const j=JSON.parse(fs.readFileSync(f)); j._hot_reload_test=Date.now(); fs.writeFileSync(f, JSON.stringify(j,null,2));"
```

Hit `/api/recruits` again. The server log should show a second `[static-data] Loaded asu_hockey_data.json (mtime changed)` line. Then revert:

```bash
node -e "const fs=require('fs'); const f='asu_hockey_data.json'; const j=JSON.parse(fs.readFileSync(f)); delete j._hot_reload_test; fs.writeFileSync(f, JSON.stringify(j,null,2));"
```

**Step 5: Commit**

```bash
git add services/static-data.js server.js
git commit -m "perf(server): cache asu_hockey_data.json in memory with mtime invalidation"
```

---

### Task 4: Harden `saveToCache` against write failures

**Files:**

- Modify: `src/scripts/caching-system.js` lines 10–29

**Step 1: Wrap the body in `try/catch`**

Replace the existing `saveToCache` function:

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

    // Ensure cache directory exists
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

`Sentry` is already imported on line 4 — no new imports.

**Step 2: Verify**

```bash
node -e "const c=require('./src/scripts/caching-system'); c.saveToCache({hello:'world'}, 'test-cache.json'); console.log('ok');"
ls src/scripts/cache/test-cache.json
node -e "const c=require('./src/scripts/caching-system'); console.log(c.getFromCache('test-cache.json'));"
rm src/scripts/cache/test-cache.json
```

Expected: file is created, retrieval returns `{ hello: 'world' }`, no errors.

Simulate a failure by passing an unwritable filename:

```bash
node -e "const c=require('./src/scripts/caching-system'); c.saveToCache({}, '/dev/null/cannot-write.json'); console.log('did not crash');"
```

Expected: error is logged but the process does not exit. (Sentry will only fire if `REACT_APP_SENTRY_DSN` is set; that's fine.)

**Step 3: Commit**

```bash
git add src/scripts/caching-system.js
git commit -m "fix(cache): wrap saveToCache in try/catch and report failures to Sentry"
```

---

### Task 5: Lower Sentry sample rates in production

**Files:**

- Modify: `server.js` lines 6–15
- Modify: `src/index.js` lines 10–27

**Step 1: Update `server.js` Sentry init**

Replace lines 6–15:

```js
const isProductionForSentry = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: isProductionForSentry ? 0.1 : 1.0,
  profilesSampleRate: isProductionForSentry ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,
});
```

(The `isProduction` const at line 31 is declared too late to use here — Sentry.init runs before it. Hence the local `isProductionForSentry`.)

**Step 2: Update `src/index.js` Sentry init**

Replace lines 10–27:

```js
const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: isProd ? 0.1 : 1.0,
  tracePropagationTargets: ["localhost", /^\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});
```

CRA inlines `process.env.NODE_ENV` at build time — the production build will get `0.1` baked in.

**Step 3: Verify**

```bash
NODE_ENV=production node -e "process.env.REACT_APP_SENTRY_DSN='https://example.com/1'; require('./server.js');" &
sleep 3
kill %1 2>/dev/null
```

Skip if it's noisy. The cleaner check: read the file and confirm both expressions are present:

```bash
grep -n 'tracesSampleRate' server.js src/index.js
```

Expected: both files show the conditional expression.

**Step 4: Commit**

```bash
git add server.js src/index.js
git commit -m "chore(sentry): sample 10% of traces and profiles in production"
```

---

### Task 6: Accessibility — skip-link, focus styles, notification aria-label

**Files:**

- Modify: `src/App.js` (skip link + `id="main-content"`)
- Modify: `src/App.css` (focus + skip-link styles)
- Modify: `src/components/GlobalNotificationBanner.jsx` (close-button aria-label)

**Step 1: Add the skip link to `src/App.js`**

In the `AppInner` return, change the opening of `<div className="app">` so the skip link is its very first child, and add `id="main-content"` to the existing `<main>`:

```jsx
<div className="app">
  <a href="#main-content" className="skip-to-main">Skip to main content</a>

  <header>
    {/* ... unchanged ... */}
  </header>

  <main id="main-content">
    {/* ... unchanged ... */}
  </main>

  {/* footer, GlobalNotificationBanner, MobileBottomNav unchanged */}
</div>
```

**Step 2: Add focus + skip-link styles to `src/App.css`**

Append at the end of the file:

```css
/* Accessibility: visible keyboard focus indicator */
:focus-visible {
  outline: 2px solid var(--asu-gold);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Accessibility: skip-to-main link, hidden until focused */
.skip-to-main {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 10000;
}

.skip-to-main:focus {
  left: 1rem;
  top: 1rem;
  background: var(--asu-maroon);
  color: var(--asu-gold);
  padding: 0.5rem 1rem;
  text-decoration: none;
  border: 2px solid var(--asu-gold);
}
```

**Step 3: Add `aria-label` to the notification close button**

In `src/components/GlobalNotificationBanner.jsx`, change line 38 from:

```jsx
<button onClick={hideNotification} className="close-banner-button">
```

to:

```jsx
<button onClick={hideNotification} className="close-banner-button" aria-label="Dismiss notification">
```

**Step 4: Verify**

Start the dev server (`npm start`) and load `http://localhost:3000`.

- Press `Tab` from the URL bar — the first focused element should be the "Skip to main content" link, which appears in the top-left corner against a maroon background with gold border.
- Press `Enter` while the skip link is focused — focus jumps to the main content area, and a gold focus ring appears on the next focusable element.
- Continue tabbing — every interactive element (nav links, buttons) shows a gold 2px outline.
- Trigger any notification (e.g. a stale-cache banner from the news page) and inspect the close button: DevTools should show `aria-label="Dismiss notification"`.

Run the unit tests:

```bash
npm test -- --watchAll=false
```

Expected: existing snapshot tests for `App` may need an update if any snapshot captures the layout — review the diff carefully before accepting; the only changes should be the new `<a className="skip-to-main">` element and `id="main-content"` on `<main>`.

**Step 5: Commit**

```bash
git add src/App.js src/App.css src/components/GlobalNotificationBanner.jsx
git commit -m "feat(a11y): add skip-to-main link, focus-visible outlines, dismiss aria-label"
```

---

## Final Verification (before opening the PR)

Run from a fresh terminal:

```bash
# Audit clean
npm audit --audit-level=high

# Unit tests
npm test -- --watchAll=false

# Server-side tests (if any pass currently — sparse coverage today)
npx jest --config jest.server.config.js || echo "(server-side suite empty / smoke only)"

# E2E smoke
npm run test:e2e:chromium
```

Expected:

- 0 high/critical npm-audit findings
- All unit tests green
- E2E suite green

Manual smoke (server running):

```bash
curl -s http://localhost:5000/healthz
curl -s http://localhost:5000/api/news    | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('news count:', d.data?.length)"
curl -s http://localhost:5000/api/recruits | node -e "console.log('recruit seasons:', Object.keys(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))))"
```

Manual a11y:

- Tab from page top — skip-link visible, gold focus rings on every interactive element
- DevTools Network panel: `/healthz` returns 200 in <5ms

---

## PR Description Template

```
## Phase 1 Quick Wins (audit items 1–6)

Bundles six independent, low-risk improvements from `docs/plans/2026-04-30-technical-audit.md`.

### Changes
- chore(deps): npm audit fix — high/critical findings: <BEFORE> → 0
- feat(ops): /healthz liveness probe; Render healthCheckPath switched off /api/news
- perf(server): in-memory mtime-based cache for asu_hockey_data.json (removes sync I/O from /api/news and /api/recruits hot path)
- fix(cache): saveToCache wrapped in try/catch; failures captured by Sentry instead of bubbling as unhandled rejections
- chore(sentry): traces + profiles sampled at 10% in prod (was 100%)
- feat(a11y): skip-to-main link, global :focus-visible outlines, aria-label on notification close button

### Out of scope (deferred to Phase 2)
- TanStack Query data layer (audit #8)
- Atomic cache writes (#12)
- CI workflow (#10)
- CSP tightening (#14)

### Risks
- npm audit fix may pull a minor axios bump (~1.6 → 1.7/1.8). Verified by full test run.
- Render healthcheck change requires the next deploy to apply.

### Test
- `npm audit --audit-level=high` → 0
- `npm test`, `npm run test:e2e:chromium` → green
- Manual: `/healthz` returns 200, news/recruits unchanged, skip-link + focus-ring visible
```
