# Deployment maintenance — 2026-10-23

Goal: address the prioritized deployment review authorized in chat: vulnerable dependencies, oversized entry bundle, and inconsistent Render build settings.

1. Update Vite to 8.3.5 and @vitejs/plugin-react to 6.1.2; update the compatible indirect qs dependency to a patched release. Preserve Node 24.22.1, build/ output, source maps, and API proxy. Verify the installed tree and audit.
2. Build and measure chunks. If the entry still exceeds 500 kB, inspect source maps and split substantial independent vendor code using Vite 8 supported chunk configuration. Preserve telemetry initialization and route loading. Verify with full production prerender and browser tests.
3. Set Render buildCommand to npm ci && npm run build; Chrome is installed once by postinstall. Align documentation. Tighten CI audit gate if the full audit supports it.
4. Verify clean install, production build/prerender, frontend/server tests, typecheck, and Chromium/API E2E. Review diff, commit, push, open PR with auto-merge.

Review focus: React plugin compatibility; runtime chunk ordering; all seven routes render; Chrome available with production-only install; Express query parsing with patched qs. Dependency/config maintenance uses existing integration tests rather than implementation-mirroring new tests.

## Verification results

- Clean npm ci installed Chrome successfully; full npm audit: zero vulnerabilities.
- Production build and all seven prerender routes passed. Entry: 273.25 kB; Sentry: 277.12 kB; no oversized-chunk warning. Total startup JavaScript is largely unchanged; separate bundles improve cache granularity.
- Frontend: 56 tests passed. Server: 276 tests passed; 26 freshness tests rechecked after clock correction. Chromium/API: 12 passed. TypeScript: passed with bundler resolution.
- Additional audit fix: sharp 0.35.5; tiny WebP encode smoke test passed.
- Existing freshness tests now anchor the clock to recruiting snapshot mtime; this snapshot has no embedded lastUpdated. TypeScript 7 requires bundler resolution instead of removed node10 resolution.
- Independent code review found no actionable issues.
