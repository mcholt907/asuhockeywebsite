# Test suite cleanup

The full audit covers 307 server tests, 69 frontend tests, and 25 Playwright definitions (75 executions across three projects). Before changes, the Windows server suite took 64.4 seconds, including 58.6 seconds in refresh automation; frontend Jest took 8.1 seconds.

## Scope and retention rules

- Keep distinct parser failures, security boundaries, data preservation, season selection, actual HTTP endpoints, and browser navigation/rendering.
- Validate shared cache and snapshot rules at their owning modules. Keep caller tests for wiring, recovery, and caller-specific season policies rather than repeating the complete validator matrix.
- Consolidate hook API wiring and page shell/success scenarios; remove React Query's repeated generic error transitions and assertions that pass on a loading screen.
- Replace conditional browser checks with actual loaded content. Combine repeated page loads into four UI journeys; run request-only API checks once, while retaining desktop Chromium, Firefox, and mobile UI projects.
- Keep publishing and installer safeguards in real Windows subprocess tests, but use a minimal standalone Git fixture and fold the dependency-order assertion into the existing two-refresh journey.
- Run the full server suite once in the daily refresh instead of repeating three files immediately beforehand.

## Verification

Compare passing test counts and runtimes before and after. Verify the refresh command sequence rejects the old duplicate invocation, all retained Windows publishing/installer scenarios pass, and Chromium/API plus Firefox/mobile checks run. Run frontend and server suites, formatting/diff checks, and the production build. Review the final diff before opening an auto-merging PR.

No product behavior or scraping policy changes are intended. Test-count reduction is a consequence of removing overlap, not a target that overrides distinct coverage.

## Results

| Area | Before | After |
| --- | --- | --- |
| Server Jest | 307 cases / 22 suites / 64.4 seconds | 276 cases / 22 suites / 30.9 seconds |
| Frontend Jest | 69 cases / 17 suites / 8.1 seconds | 56 cases / 11 suites / 6.1 seconds |
| Playwright definitions | 25 | 12 |
| Default Playwright executions | 75 (API repeated in each browser) | 20 (8 API + 4 UI across 3 browsers) |
| CI Playwright executions | 25 | 12 (API + Chromium) |

Times are observed local wall times, not promised CI savings. All retained tests passed, including Firefox and mobile Chrome; the production build/prerender passed. Independent review found no actionable coverage loss.

The snapshot validator suites retain the full invalid-table matrices. Scraper, refresh and status callers retain validator-wiring, recovery and season-policy cases rather than reproducing those matrices. URL/image identity and security, malformed roster markup, atomic writes, stale/fallback recovery, runtime pinning and installer isolation remain covered.

The automation command trace failed with the old duplicate test invocation and passed after removal. The two-publication journey still verifies dependency installation order, a single-branch clone, lease-protected publishing, and restoration of both staged and unstaged allowlisted leftovers. Its fixture uses a real small Git remote; installer metadata guards share an immutable fixture.
