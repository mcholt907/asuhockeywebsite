# Phase 3 Recovery Point — 2026-05-05

Session ran out of tokens after completing 4 of 6 Phase 3 items. This doc
captures status + the approved-but-not-started design for the next item
(#17 Vite migration) so the next session can resume without re-deriving.

## Status of Phase 3 items (from `2026-04-30-technical-audit.md`)

| # | Item | Status | Branch (local, unpushed) |
|---|------|--------|--------------------------|
| 22 | Render tier review | Done — user upgraded to Pro; render.yaml plan field updated | `feat/audit-phase3-backend-tests` |
| 20 | Backend test suite | Done — 41 tests pass, caching-system 0% → 98%, roster-service branches 55% → 87% | `feat/audit-phase3-backend-tests` |
| 21 | CSS audit (eliminate `!important`s) | Done — 11 → 0; build passes | `feat/audit-phase3-css-cleanup` |
| 19 | Page decomposition | **Partial** — Roster (339→112) + Recruiting (260→151) done. Home (263) deferred. | `feat/audit-phase3-page-decomp` |
| 17 | CRA → Vite migration | **Designed, not started** | (none yet) |
| 18 | TypeScript incremental adoption | Pending | — |

Phase 3 audit item F6 (move inline `backgroundImage` to CSS files) was
**intentionally skipped** in #21 — the project's webpack config requires
inline `process.env.PUBLIC_URL` for public-folder assets per CLAUDE.md.

## Local branches awaiting review/push

All three branches branch from `main` independently — they can be
reviewed and merged in any order.

- `feat/audit-phase3-backend-tests` — 2 commits (#22 chore + #20 tests)
- `feat/audit-phase3-css-cleanup` — 1 commit (#21 specificity refactor)
- `feat/audit-phase3-page-decomp` — 2 commits (Roster + Recruiting decomp)

The user's workflow is: review locally → push → open PR via web UI.

## #17 Approved Design — CRA → Vite migration

User approved this design before session ended. Resume by implementing it.

### Migration surface (small)

- Only **3** occurrences of `process.env.REACT_APP_*` / `PUBLIC_URL` in `src/`:
  - `src/index.js:13` → Sentry DSN
  - `src/services/api.js:4` → API base URL
  - `src/pages/News.jsx:116` → backgroundImage URL
- **5** occurrences of `%PUBLIC_URL%` in `public/index.html` (favicon, logo192,
  manifest, hero-arena preload).
- 15 React-side test files using Jest via react-scripts.

### Decisions

1. **Build output stays at `build/`** so `server.js` (lines 277, 286, 292, 296)
   and `scripts/prerender.js` (line 15) keep working unchanged.
2. **Test runner: keep Jest standalone, NOT Vitest.** User approved
   recommendation A. Rationale: Vitest is the right long-term answer but
   migrating 15 test files (with `jest.fn()` / `jest.mock()` / `__mocks__/`
   conversions) in the same PR multiplies risk. Land Vite first, then a
   follow-up migrates tests to Vitest.
3. `process.env.PUBLIC_URL` in News.jsx → drop entirely; use literal
   `/images/Ice-hockey-hero.webp` (Vite serves `public/` at site root).

### Concrete steps

1. **Add `vite.config.js`** at repo root:
   ```js
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   export default defineConfig({
     plugins: [react()],
     server: { port: 3000, proxy: { '/api': 'http://localhost:5000' } },
     build: { outDir: 'build', sourcemap: true },
   });
   ```

2. **Move `public/index.html` → `index.html`** (root). Strip all 5
   `%PUBLIC_URL%` (replace with `/...`). Add at end of `<head>` or before
   `</body>`:
   ```html
   <script type="module" src="/src/index.js"></script>
   ```

3. **Rename env vars** — 3 surgical edits:
   - `src/index.js:13`: `process.env.REACT_APP_SENTRY_DSN` → `import.meta.env.VITE_SENTRY_DSN`
   - `src/services/api.js:4`: `process.env.REACT_APP_API_URL` → `import.meta.env.VITE_API_URL`
   - `src/pages/News.jsx:116`: `${process.env.PUBLIC_URL}/images/Ice-hockey-hero.webp` → `/images/Ice-hockey-hero.webp`
   - `.env.example`: rename `REACT_APP_*` → `VITE_*`.

4. **`package.json` updates**:
   - Remove `react-scripts` from `dependencies`.
   - Add `vite` + `@vitejs/plugin-react` to `devDependencies`.
   - Add Jest standalone deps: `jest`, `babel-jest`, `@babel/preset-env`,
     `@babel/preset-react`, `jest-environment-jsdom`, `identity-obj-proxy`
     (for CSS module mocking).
   - `scripts.start`: `react-scripts start` → `vite`
   - `scripts.build`: `react-scripts build` → `vite build` (postbuild
     stays the same — prerender script unchanged).
   - `scripts.test`: `react-scripts test` → `jest --watch` (or just `jest`
     for CI).
   - Remove the `eject` script.
   - Remove top-level `proxy` field (moves to vite.config).
   - Remove `eslintConfig` field (CRA-specific). Add a standalone
     `.eslintrc` if needed; CI workflow at `.github/workflows/ci.yml`
     should be checked for `react-scripts build` references.

5. **`jest.config.js`** at repo root:
   ```js
   module.exports = {
     testEnvironment: 'jsdom',
     setupFilesAfterEach: ['<rootDir>/src/setupTests.js'],
     transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
     moduleNameMapper: {
       '\\.(css|less|scss)$': 'identity-obj-proxy',
       '\\.(png|jpg|svg|webp)$': '<rootDir>/src/__mocks__/fileMock.js',
     },
     testMatch: ['<rootDir>/src/**/*.{test,spec}.{js,jsx}'],
   };
   ```
   Plus `babel.config.json`:
   ```json
   { "presets": ["@babel/preset-env", ["@babel/preset-react", { "runtime": "automatic" }]] }
   ```
   Note the existing `jest.server.config.js` (used for `__tests__/`) is
   independent and unchanged.

6. **Verification (in order, stop at first failure)**:
   1. `npm install` clean (no react-scripts errors).
   2. `npm run build` produces `build/index.html` + hashed `build/assets/*`.
   3. `node scripts/prerender.js` succeeds on all 7 routes.
   4. Start Express on `:5000`, Vite on `:3000`. Visit `/api/news` (proxied)
      and `/` (Vite-served).
   5. `npm test -- --watchAll=false` — all 15 React unit-test files pass.
   6. `npx playwright test --project=chromium` — all 22 E2E tests pass.
   7. `npx jest --config jest.server.config.js` — 41 server-side tests
      still pass (independent, should be unaffected).

### Risk areas to watch

- **JSX in `.js` files**: Vite/esbuild is stricter than CRA. If any `.js`
  file fails to compile, either rename to `.jsx` or add `esbuild: { loader:
  { '.js': 'jsx' } }` to vite.config.js. Check `src/App.js`,
  `src/index.js`, `src/reportWebVitals.js` first.
- **react-router-dom mock**: `src/__mocks__/react-router-dom.js` needs
  to keep working under standalone Jest.
- **Sentry browser tracing**: confirm `import.meta.env.VITE_SENTRY_DSN`
  resolves both in dev (HMR) and after build.
- **Helmet meta tags during prerender**: prerender hydrates the page,
  so should be unchanged. But the loading-detection logic in
  `prerender.js:81` (looking for `.home-loading`, `.loading-message`)
  depends on initial render markup, which is React-driven, not build-tool-driven.

### Branch strategy

Same pattern as #20/#21/#19: create `feat/audit-phase3-vite-migration`
branched from `main`. Single PR. The user has been pushing/opening PRs
manually via web UI (no `gh` CLI installed).

## #18 — TypeScript incremental adoption (still pending)

Not yet designed. Audit recommendation: start with `services/api.js` +
shared types (`Player`, `Game`, `NewsArticle`). Should land **after**
#17 since Vite handles `.ts`/`.tsx` natively (CRA does too, but Vite is
cleaner). Will need a brainstorm + design before implementation.

## Pre-existing pristine-main state

The `main` branch is at commit `a7c6824` (Merge PR #17, the Phase 2
cleanup). All Phase 3 work is on the three local branches above. None
have been pushed yet.

## Carry-forward notes

- The `build/`, `playwright-report/`, `.cache/`, `.agent/skills/`,
  `.playwright-mcp/` directories show as dirty in `git status` but are
  pre-existing untracked/build artifacts — none are part of any commit
  in this session.
- Three older docs/plans/ files (`2026-04-30-ci-workflow-design.md`,
  `2026-04-30-phase1.5-scraper-resilience-design.md`,
  `2026-04-30-phase1.5-scraper-resilience.md`) are untracked from
  earlier sessions; not blocking anything.
