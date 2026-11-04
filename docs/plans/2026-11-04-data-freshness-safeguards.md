# Data freshness safeguards

Approved scope: flag overdue daily datasets after 48 hours, alert independently of the Windows runner, enable runner check-ins, and show affected visitors a warning while retaining last good data.

Implementation choices: keep the existing Express/React architecture and Sentry project; GitHub Actions checks production hourly. No scraping is moved to cloud infrastructure. Existing 24-hour thresholds for frequently refreshed datasets remain; roster and daily bundled datasets use 48 hours. Status must describe the source actually served and use durable refresh timestamps rather than deployment file times. Unknown/missing timestamps are unhealthy. No automatic repair writes from the monitor.

## Task 1: Reliable backend freshness
- Update server/cache/data-status.js and tests: daily alumni/transfers/recruiting/roster 48-hour threshold; production source matches scraper selection; malformed/missing/future timestamps cannot look fresh.
- Persist recruiting refresh time in a backwards-compatible on-disk envelope, unwrapping for existing API consumers; do not use deployment mtime as proof of a scrape. Test preservation and round-trip behavior.
- Ensure transfers refresh also requires direct live data, since a successful cached response is not a new refresh.
- Keep /api/status JSON compatible; add no-store and include unknown status in Sentry staleness checks.

## Task 2: Visitor warning
- Add a shared route-aware DataFreshnessBanner inside main using /api/status via React Query.
- Only warn for relevant stale/missing/unknown datasets; map home to its widgets, individual routes to their datasets, recruiting to recruiting+transfers. Exclude the static analytics prototype.
- Reuse DataStatusBanner.css and established typography; preserve the last good page data. Report actual last-checked time when available. Status polling must not block page loading or claim freshness on errors.
- Component tests cover route relevance, healthy silence, unknown/missing data, and check failure. Verify stale desktop/mobile UI in Playwright by intercepting status responses.

## Task 3: Independent checks and Sentry
- Create scripts/check-data-freshness.js (Node builtins only), hourly scheduled + manual GitHub workflow. Validate expected datasets/timestamps/thresholds with strict upper bounds so old production code cannot silently pass. Read deployed /api/status; fail on stale/missing/unknown/incomplete responses or network errors.
- Configure Sentry runner Cron Monitor for daily 06:00 America/Phoenix with existing authorized project access. Configure production freshness monitor or report failing checks to Sentry; preserve GitHub job failures as a second signal.
- Replace legacy URL-only ping with supported Sentry SDK check-in using existing DSN where appropriate, retaining legacy configuration compatibility. Test observable success/failure without leaking secrets.
- Configure notification routing using existing project defaults; verify real check-ins and run production workflow after deployment.

## Verification and delivery
Run targeted regressions red then green, server and frontend suites, production build, Playwright stale UI checks, independent production check. Review branch; commit, push, PR, auto-merge after CI. Update dedicated runner cleanly after merge and verify real monitoring check-in and deployed freshness. Document any external account permission that remains unavailable explicitly.
