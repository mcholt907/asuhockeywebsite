# Remove the 2026-27 Projected Recruiting Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the set 2026-27 roster from the Projected Future Teams data contract and UI.

**Architecture:** Narrow the centralized `FUTURE_SEASONS` contract to 2027-28 and 2028-29 so scraping, validation, refreshes, the API, and React consume the same season set. Remove the obsolete bundled season and assert at both API and UI boundaries that it cannot reappear.

**Tech Stack:** Node.js, Express, React, Jest, Testing Library, Playwright, Elite Prospects bundled JSON.

## Global Constraints

- Configured projected seasons are exactly `2027-2028` and `2028-2029`.
- Do not change `CURRENT_SEASON`, the roster page, transfer data, or Recruiting CSS/layout.
- Production and prerender remain fallback-only.
- Snapshot validation must reject extra top-level season keys.
- Use test-first red-green cycles before production/data changes.

---

### Task 1: Narrow the recruiting data contract

**Files:**
- Modify: `config/scraper-config.js`
- Modify: `data/asu_recruiting_fallback.json`
- Modify: `__tests__/recruiting-snapshot.test.js`
- Modify: `__tests__/refresh-recruiting.test.js`
- Modify: `__tests__/api-recruits.test.js`
- Modify: `tests/api.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `validateRecruitingSnapshot(data, config.FUTURE_SEASONS)` and the existing atomic refresh pipeline.
- Produces: an exact two-key recruiting snapshot containing `2027-2028` and `2028-2029` only.

- [ ] **Step 1: Write failing contract tests**

Update fixtures to the two-season map and add assertions that `2026-2027` is absent from the configured seasons, bundled snapshot, and API response. Preserve malformed, partial, and extra-key rejection cases.

- [ ] **Step 2: Run focused tests and verify RED**

Run:
`npx jest --config jest.server.config.js --runInBand --roots __tests__ --testMatch '**/recruiting-snapshot.test.js' --testMatch '**/refresh-recruiting.test.js' --testMatch '**/api-recruits.test.js'`

Expected: failures because config and bundled data still include `2026-2027`.

- [ ] **Step 3: Implement the minimal two-season contract**

Set `FUTURE_SEASONS` to `['2027-2028', '2028-2029']`, remove the `2026-2027` JSON property and players, update server/API fixtures, and change README tracked-season copy to `2027-28` and `2028-29`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 5: Commit**

Commit message: `fix(recruiting): remove set 2026 team from projections`

---

### Task 2: Lock the Recruiting UI to future teams

**Files:**
- Modify: `src/pages/__tests__/Recruiting.test.jsx`
- Verify unchanged: `src/pages/Recruiting.jsx`

**Interfaces:**
- Consumes: the exact two-season map returned by `/api/recruits`.
- Produces: UI regression coverage proving 2027-28 is the default projected team and no 2026-27 tab/player is rendered.

- [ ] **Step 1: Write the failing UI regression**

Provide API fixture keys `2027-2028` and `2028-2029`, include a sentinel current-roster player nowhere in that response, and assert `2026-2027 Team` and the sentinel are absent. Assert `2027-2028 Team` is active by default and its players are visible; retain selected-season isolation and empty-team language coverage.

- [ ] **Step 2: Run the Recruiting test and verify RED against the old fixture/expectations**

Run:
`$env:CI='true'; npx jest --config jest.config.js --runInBand --roots src --testMatch '**/Recruiting.test.jsx'`

Expected: the updated absence/default assertions fail until obsolete fixture expectations are removed.

- [ ] **Step 3: Make the minimal test/behavior update**

Remove obsolete 2026-27 fixture data and expectations. The existing earliest-season default logic should require no production JSX change; change it only if the red test demonstrates otherwise.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all Recruiting page tests pass.

- [ ] **Step 5: Commit**

Commit message: `test(recruiting): keep current roster out of projections`

---

### Task 3: Integrated verification and review

**Files:**
- Verify all branch changes.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: reviewed, publishable branch evidence.

- [ ] **Step 1: Run full server and React suites**

Run the repository server Jest suite and React Jest suite with explicit roots/test matches.

- [ ] **Step 2: Run typecheck, build, and diff validation**

Run `npm run typecheck`, `npm run build`, and `git diff --check`.

- [ ] **Step 3: Verify API and UI in Chromium**

Run `npx playwright test tests/api.spec.ts --project=chromium` and a Recruiting page check asserting only 2027-28/2028-29 tabs appear.

- [ ] **Step 4: Complete final code review and publish**

Resolve all Critical/Important findings, push the branch, open a ready PR to `main`, and enable auto-merge.
