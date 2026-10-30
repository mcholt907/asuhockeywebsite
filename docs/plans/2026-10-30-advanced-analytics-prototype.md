# Advanced analytics prototype

## Scope and design

Build a reviewable React prototype at `/analytics`, in the existing Vite app. Use Barlow Condensed, maroon and gold, readable white chart panels, and an ice-rink motif. Four button-switched views cover team territorial control, game performance, individual offense, and methodology. Default to a completed 2025–26 season snapshot; label it throughout as historical and manually verified on October 30, 2026. No new scraping or live-data claims.

## Research and metric choices

Primary sources checked October 30, 2026:

- [CHN team totals and situational attempts](https://www.collegehockeynews.com/stats/index.php?season=20252026): Corsi and Fenwick measure shot volume and territorial control. They do not measure possession time or shot quality. Use all situations, even strength, and close-game splits. Even strength must not be labeled 5-on-5. A 50% reference is equal event share, not an unweighted league average.
- [CHN ASU advanced metrics](https://www.collegehockeynews.com/stats/team/Arizona-State/61/advanced,20252026): individual attempts and provider xG support shot creation and finishing above expected. Individual attempts must not be called player Corsi. Select eight skaters, explicitly a subset, including forwards and defensemen.
- [CHN ASU overall stats](https://www.collegehockeynews.com/stats/team/Arizona-State/61/overall,20252026): games played, goals and shots permit shots/game and shooting percentage. Keep player and team season labels attached to the snapshot.
- [CHN game log](https://www.collegehockeynews.com/stats/team/Arizona-State/61/gamebygame,20252026): show the final eight games with goals, shots and provider xG; filter home/away and select a game. This sample is not the full season and must never drive season-wide summaries.
- [CHN glossary and coverage](https://www.collegehockeynews.com/info/?d=stats-glossary): xG uses national rolling three-year shooting rates across six locations. It is a coarse provider model, not a calibrated ASU model. Shot location coverage starts in 2023–24 and TOI in 2024–25; those start dates do not guarantee game completeness.
- [ASU Athletics media central](https://thesundevils.com/sun-devil-hockey-media-central): official season PDFs and box scores are an independent validation source, not a confirmed advanced-data API.

Priorities: CF%, FF%, shot share, goal differential, game xG differential, individual attempts/game and goals minus xG. Power play and penalty kill provide familiar context. Defer goalie GSAx, on-ice player metrics, zone entries, pass tracking, per-60 rates and spatial shot maps until event coverage, TOI alignment and methodology are validated. CHN goalie advanced and overall totals showed differences during research; do not merge them or infer GSAx.

## Implementation steps

- [x] Add a source-linked snapshot module and pure metric calculations. Test aggregation, zero denominators and missing values before implementation.
- [x] Build four responsive views with functional filters, sorting, accessible labels, chart alternatives, provenance and glossary. No new dependencies.
- [x] Add desktop/footer navigation, mobile navigation, prerender route, and a Stats-page link.
- [x] Verify calculations and interactions with Jest; run frontend suite, typecheck and production build. Inspect desktop/mobile with Playwright, including navigation and overflow.
- [ ] Review diff independently, commit only task files, push, open PR, attach it, and enable auto-merge after checks according to repository guidance.

## Live integration follow-up

Before turning this prototype into a production data product, confirm provider permission/licensing and access terms for redistribution and automated collection. Public HTML is evidence of availability, not permission or a supported API contract. No documented public CHN API was confirmed. Add adapters through `createCachedScraper`, configuration in `config/scraper-config.js`, validation of team/season/situation and event coverage, provenance timestamps and missing-data handling. Preserve a last-known-good snapshot. Validate a representative sample of games against official ASU box scores before computing season aggregates. Expected goals, player on-ice shares and goalie GSAx require separate coverage and model audits.

## Decisions made for the prototype

Use historical verified numbers rather than invented examples or an unvalidated live adapter. Use existing React and CSS with CSS bar charts and semantic HTML tables. Keep automation, new backend endpoints and vendor procurement outside this prototype. No external dependencies or architectural changes.

## Verification results

- Frontend Jest: 14 suites, 57 tests passed (7 new analytics tests).
- `npm run typecheck`: passed.
- `npm run build`: passed including all eight prerendered routes.
- Local Playwright/Chrome: all four views checked at 320, 700, 780, 900 and 1100px; additional team checks at 390, 800, 1024 and 1440px. No page overflow or runtime errors. Mobile navigation remains horizontally scrollable at 320px and Analytics is reachable.
- Browser interactions: venue filter, selected-game fallback and selection, player position/search, and mobile Analytics navigation passed. Sorting verified in Jest.
- Independent read-only review verified the source figures and calculations, and reviewed the tablet navigation correction. No remaining material findings.
- Layout correction: constrain header transitions to colors/opacity and reserve logo space with compact links at 780–1100px. Before/after measurements verified no logo overlap.
