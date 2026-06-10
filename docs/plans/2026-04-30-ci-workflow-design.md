# CI Workflow Design

**Date:** 2026-04-30
**Status:** Draft
**Source:** `2026-04-30-technical-audit.md` item #10 (audit O2)

---

## Problem

The repo has no `.github/workflows/`. Every regression — broken tests, build failures, new vulnerabilities, dependency drift — only surfaces at deploy time on Render, or never. Phase 1 already exposed two such regressions sitting on `main` for many commits (the `Latest News` E2E text and the unused `About`/`Contact` imports breaking `CI=true` builds).

## Goal

Stand up a GitHub Actions workflow that runs on push to `main` and on pull requests, executes the existing test commands, and surfaces failures before they reach Render. Pair with Dependabot so transitive dep upgrades (the recurring source of vulns) flow in as auditable PRs instead of accumulating silently.

The workflow should be **green on its first run** — not introduced as red and fixed later. That means a small prerequisite cleanup before the workflow lands.

---

## Prerequisite: fix the 9 pre-existing unit-test failures

`npm test` returns 9 failures across 3 files on `main` today. Until they're fixed, adding CI either ships a red badge from day one or requires `continue-on-error` (which defeats the point). The failures fall into three groups:

| File | Failing tests | Likely cause |
| --- | --- | --- |
| `src/App.test.js` | 3 — navigation links, footer copyright, social media | Footer is hidden on the home route (`{!isHome && <footer>}`); tests render at `/` and look for footer elements that aren't there. |
| `src/pages/__tests__/News.test.jsx` | 2 — render articles when data loaded, render no-news message | Likely lost touch with current News.jsx structure (hero card, magazine row, etc. were redesigned). |
| `src/pages/__tests__/Schedule.test.jsx` | 4 — render games, Box/Metrics links, 4-row record widget, single-row fallback | Likely lost touch with current Schedule.jsx structure (record widget was redesigned in `2026-02-25-team-record-widget.md`). |

**Approach:** investigate each test in a separate small commit. The fix is usually a one-line selector change (matching `Trending News` instead of `Latest News`) or rendering the test with a non-`/` route so the footer mounts. If a test is genuinely obsolete, mark it `it.skip` with a `TODO` comment and a tracking note rather than rewriting it from scratch.

This prerequisite ships **before** the workflow file lands, in its own PR or as the first commit of the same PR.

---

## Workflow Design

### Triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

`push` to `main` so direct pushes (the current workflow) still get CI signal. `pull_request` to `main` so future PR-based work is gated. `workflow_dispatch` for manual reruns.

### Concurrency

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

A second push to the same branch cancels the in-flight run. Saves Actions minutes and gives the latest commit fast feedback.

### Jobs

Two jobs in parallel — the unit-test/lint job is fast (~2 min), the E2E job is the bottleneck (~3–5 min). Splitting saves ~3 min on the critical path vs. running everything sequentially.

```
ci.yml
├── lint-and-unit (~2 min)
│   ├── checkout
│   ├── setup-node 20.x with npm cache
│   ├── npm ci
│   ├── CI=true npm run build       # build + ESLint warnings-as-errors + prerender
│   ├── npm audit --audit-level=critical
│   └── CI=true npm test -- --watchAll=false
└── e2e (~3–5 min)
    ├── checkout
    ├── setup-node 20.x with npm cache
    ├── npm ci
    ├── cache Playwright browsers (key: playwright-${{ hashFiles('package-lock.json') }})
    ├── npx playwright install --with-deps chromium  (skipped on cache hit)
    └── npx playwright test --project=chromium
```

### Decision: Node 20 LTS

The project doesn't pin a Node version (`package.json` has no `engines`, no `.nvmrc`). Local dev is on 22.15.0. CI should pin a single version to avoid drift surprises. **Node 20 LTS** is the right call:

- Active LTS through April 2026, maintenance LTS through April 2028.
- All deps in `package.json` are 20-compatible.
- Render's default Node runtime is 20.

If you'd rather track Node 22 (which is also active LTS as of late 2025), that's a one-line change. **Suggest also adding `.nvmrc` and `engines.node` in this same PR** so local dev, CI, and Render all converge on the same major.

### Decision: `npm audit --audit-level=critical` (for now)

Confirmed exit codes today:

| Threshold | Exit code | Why |
| --- | --- | --- |
| `--audit-level=critical` | 0 | 0 critical vulns remain after Phase 1 #1 |
| `--audit-level=high` | 1 | 17 high vulns remain — all CRA-bundled (jsonpath/bfj/underscore + webpack-dev-server/sockjs/uuid). Require `npm audit fix --force` which downgrades `react-scripts` to 0.0.0. |
| `--audit-level=moderate` | 1 | Same chain plus moderate ones. |

**`critical` is the only threshold that's green today.** The TODO is to tighten to `high` after Phase 3 #17 (Vite migration) removes CRA's transitive deps. Comment in the workflow file should call that out so the next person doesn't relax it permanently.

### Decision: ESLint via `CI=true npm run build` instead of standalone `npm run lint`

The project doesn't have a `lint` script in `package.json` and ESLint is wired through CRA's webpack pipeline. Adding a separate `npm run lint` would require a parallel ESLint config file. Cheapest path: piggyback on the build step — `CI=true` makes react-scripts treat warnings as errors, so a single command covers lint + build + prerender. Once Phase 3 #17 (Vite) lands, this collapses naturally into a real `lint` script.

### Decision: server-side Jest skipped (for now)

`jest.server.config.js` exists but the audit found no real tests in `__tests__/` — only a manual smoke runner in `scraper.test.js`. Including `npx jest --config jest.server.config.js` in CI today would either pass trivially (no tests) or fail (smoke runner not Jest-formatted). **Defer until Phase 3 #20** ("backend test suite"), at which point this command is added to the same job.

### Caching strategy

Two caches:

1. **npm cache** via `actions/setup-node@v4` with `cache: 'npm'`. Cache key auto-derives from `package-lock.json`. ~30s saved per run.
2. **Playwright browsers** via `actions/cache@v4` with key `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}`. ~60s saved per run on hits. Cache lives in `~/.cache/ms-playwright`.

Skip caching the `build/` output — it's tiny and CRA + prerender takes ~30s; not worth the cache overhead.

### Failure artifacts

On E2E failure, upload the `playwright-report/` and `test-results/` directories with `actions/upload-artifact@v4`, retention 7 days. This gives traces/videos/screenshots for debugging without mailing them in chat.

---

## Files to Create

| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | The workflow described above |
| `.github/dependabot.yml` | Weekly npm + GitHub-Actions dependency updates |
| `.nvmrc` | `20` — pins local Node major to match CI |
| `package.json` | Add `"engines": { "node": ">=20" }` — same purpose, different audience |

### Dependabot config

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      sentry:
        patterns: ["@sentry/*"]
      react:
        patterns: ["react", "react-dom", "react-router-dom", "react-helmet-async"]
      types:
        patterns: ["@types/*"]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Grouping reduces PR noise: a single Sentry bump touches `@sentry/node`, `@sentry/react`, and `@sentry/profiling-node` — those flow as one PR instead of three.

---

## Branch protection (separate, GitHub UI only)

The workflow runs on PRs but does not by itself **block** merging — that's a GitHub repository setting outside the workflow file. Once CI is reliably green for ~1 week, recommend toggling on:

- Settings → Branches → Add rule for `main` → Require status checks to pass before merging → tick `lint-and-unit` and `e2e`.
- Optional: require PRs (no direct push to `main`).

This is mentioned here for completeness but is **out of scope for the implementation PR** — settings changes are manual and reversible, and forcing a PR-only workflow is a process decision worth its own conversation.

---

## Out of Scope (deferred)

- **CodeQL / SAST scanning** — useful but doesn't help with the day-one regression problem; revisit after Phase 3 #18 (TypeScript adoption).
- **Type checking (`tsc --noEmit`)** — meaningless until app code is `.ts` (Phase 3 #18).
- **Multi-browser Playwright** — chromium covers ~95% of regressions; firefox/webkit add 6+ min per run for marginal value at this stage.
- **Render deploy automation** — Render already auto-deploys on push to `main`; CI runs in parallel, doesn't gate the deploy. Branch protection (above) is the only knob that would gate it, and that's an explicit user decision.
- **Coverage reporting** — adds value once test coverage is meaningful (Phase 3 #20).
- **Lockfile-only audits / npm-audit-resolver** — premature; Dependabot's weekly cadence covers this.

---

## Verification (when implementing)

The implementation PR is verified by these checks, in order:

1. **Prerequisite step**: `CI=true npm test -- --watchAll=false` exits 0 locally (means the 9 fixed/skipped tests are actually fixed/skipped).
2. **Workflow syntax**: `npx --yes @action-validator/cli@latest --verbose .github/workflows/ci.yml` exits 0. (Catches YAML mistakes before pushing.)
3. **Dry run on a branch**: open a PR from a feature branch with the workflow file. Both jobs should go green.
4. **Failure path**: introduce a deliberate test failure on the same branch, push, confirm the workflow goes red and PR shows blocking checks.
5. **Cache validation**: second run on the same branch should show "Cache hit" for both npm and Playwright in the logs.

---

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| The 9 pre-existing test fixes turn out to be more involved than one-liners. | Allow `it.skip` with a TODO + tracking issue for any test that needs more than a 5-minute fix. The point of CI is to catch *new* regressions, not to retroactively gain coverage. |
| Playwright on GitHub-hosted runners is slower than local. | Already accounted for — split into a parallel job and cache browsers. If runs exceed 10 min, drop to a smoke-only Playwright subset (home + roster). |
| `npm audit --audit-level=critical` lets new high-severity vulns slip in. | Dependabot's weekly cadence is the second line of defense; tightening to `high` after Vite is on the roadmap (Phase 3 follow-up). |
| Direct push to `main` bypasses CI gating. | Acknowledged — branch protection is explicitly out of scope for this PR and called out as a separate user decision. |
| Render deploy fires before CI completes. | True today and not changed by this PR. If CI fails, the user revisits manually. Future enhancement: gate deploys via Render's "deploy hooks" tied to CI status — defer until Phase 3. |
