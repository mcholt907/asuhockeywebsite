# Automated Recruiting Refresh Design

## Purpose

Keep the recruiting section of `asu_hockey_data.json` current without a
recurring manual command, while preserving curated player details and refusing
to publish suspicious EliteProspects scrapes.

The refresh runs once per day at 6:00 AM America/Phoenix. A one-time runner and
Windows Scheduled Task installation is acceptable; normal operation after that
must not require a person to start, review, merge, or deploy a refresh.

## Constraints

- EliteProspects blocks Render and other common cloud-hosted IPs, so production
  request-time scraping and ordinary GitHub-hosted Actions are not dependable.
- EliteProspects also blocks the plain Axios TLS fingerprint from residential
  IPs, so the existing Puppeteer fallback remains required.
- `asu_hockey_data.json` remains the production source of truth for recruits.
  `/api/recruits` continues to read its `recruiting` property.
- The refresh may modify only the `recruiting` property. Roster, manual news,
  photos outside recruiting, and all other top-level data must remain unchanged.
- Scraper failures, malformed responses, or suspicious count reductions must
  preserve the last known-good production data.
- The automation must not use or switch the developer's active checkout.

## Chosen Architecture

A dedicated local clone runs the existing scraper from a residential Windows
machine. Windows Task Scheduler starts the job daily. The job pulls the latest
`main`, scrapes each season in `config.FUTURE_SEASONS`, validates and safely
merges the result, then publishes changes through the existing
`auto/data-refresh` pull-request workflow.

```text
Windows Task Scheduler (daily 06:00 Arizona)
  -> dedicated refresh clone
  -> Puppeteer-backed EliteProspects scrape
  -> validate complete snapshot
  -> merge recruiting records into asu_hockey_data.json
  -> tests and diff guard
  -> auto/data-refresh PR
  -> CI and auto-merge
  -> Render deploy
  -> /api/recruits reads the new static data
```

The dedicated clone isolates automation from uncommitted development work. The
task is configured with `WakeToRun=true`, `StartWhenAvailable=true`, network
availability required, a single-instance policy, and a bounded execution time.
If the computer is asleep at 6:00 AM, it wakes; if it was unavailable, the task
runs when Windows next has an opportunity.

## Alternatives Considered

### Production request-time scraping

Rejected because Render is already known to receive EliteProspects 403
responses. It would also make page availability depend on an upstream scrape.

### GitHub-hosted scheduled workflow

Rejected because GitHub-hosted runners use cloud IPs and are likely to encounter
the same block. A self-hosted GitHub runner could work, but it adds a persistent
service and credential surface without improving this single-machine workflow.

### Paid residential proxy or scraping service

Viable if the Windows runner proves unreliable, but deferred. It adds cost,
secret management, and a third-party operational dependency that are not needed
for a daily, low-volume dataset.

## Components

### Direct live scraper entry point

`server/scrapers/recruiting.js` exposes a direct all-season scrape function in
addition to the existing cached `fetchRecruitingData()` API. The automation
calls the direct function with player-profile enrichment enabled, so a stale
cache can never be mistaken for a successful live run. The existing cached API
and production `/api/recruits` behavior remain unchanged.

The result has this interface:

```js
{
  "2027-2028": [RecruitRecord],
  "2028-2029": [RecruitRecord],
  "2029-2030": [RecruitRecord]
}
```

### Refresh and merge script

A new `scripts/refresh-recruiting.js` command owns the file update. It:

1. Enables the Puppeteer fallback and performs a direct live scrape.
2. Reads the current `asu_hockey_data.json` only after scraping succeeds.
3. Validates the full snapshot.
4. Merges configured future seasons by stable player identity.
5. Writes through a temporary sibling file and atomically replaces the source
   file only after the serialized result parses successfully.
6. Exits nonzero without changing the source file on any failure.

Player identity uses the normalized EliteProspects player URL. A missing player
URL fails validation rather than falling back to a mutable or ambiguous name.

For players present in both snapshots, nonblank scraped values update the
standard scraper-owned fields: `number`, `name`, `position`, `age`,
`birth_year`, `birthplace`, `height`, `weight`, `shoots`, `player_link`,
`player_photo`, and `current_team`. A blank scraped value never overwrites a
nonblank existing value. Unknown properties on an existing record are retained
so future curated annotations are not discarded.

Newly discovered players are added immediately. Seasons not listed in
`config.FUTURE_SEASONS` are preserved unchanged because current-season recruit
records are also used as a roster fallback.

### Removal confirmation

A recruit missing from one valid daily scrape is retained. The automation
records one miss in `data/asu_recruiting_refresh_state.json`. If the same player
is absent from the next valid daily scrape, the player is removed and the miss
record is cleared. Reappearance clears the miss immediately.

The state file contains only active misses and changes only when a player first
disappears, reappears, or is confirmed removed. This prevents daily no-op
commits while protecting against a transient partial upstream response.

### Validation and safety gates

The refresh is rejected before writing when any of these conditions is true:

- The result is not an object with every configured future-season key.
- Any season value is not an array.
- The combined result contains no recruits.
- A record lacks a nonblank name, position, or EliteProspects player URL.
- A season contains duplicate normalized player URLs.
- A season that previously contained recruits unexpectedly returns zero.
- The combined scraped count falls by more than 35 percent versus the existing
  configured-season count.

After merging, the script parses the generated JSON and asserts that every
top-level property other than `recruiting` is deeply equal to the original.
The orchestration layer then runs the recruiting refresh tests and a JSON
validation check before it is allowed to commit.

The 35-percent guard catches broad selector or pagination failures while still
allowing ordinary commitment changes. The two-run removal rule protects
smaller transient omissions that remain below that threshold.

## Scheduling and Delivery

`npm run refresh-recruiting` runs only the recruiting refresh. The existing
`npm run refresh-data` command is expanded to refresh alumni, transfers, and
recruiting in sequence.

`scripts/refresh-and-push.cmd` operates from the dedicated clone and includes
`asu_hockey_data.json` plus `data/asu_recruiting_refresh_state.json` in its
change detection, staging, commit, and PR scope. It refuses to commit any path
outside the explicit generated-data allowlist.

If allowed files changed, the script creates or resets `auto/data-refresh` from
the latest `origin/main`, commits the generated changes, force-pushes that
automation-owned branch, opens or reuses its pull request, and enables
auto-merge. Branch protection and CI remain the final publication gate. If
nothing changed, the run records success and exits without a commit or deploy.

The automated commit and PR copy expands from “alumni and transfer fallbacks”
to “automated hockey data refresh” so it accurately describes all three
datasets.

## Monitoring and Recovery

The existing Sentry Cron Monitor becomes a daily monitor scheduled for 6:00 AM
America/Phoenix with a grace period long enough for a missed task to run after
startup. Every successful no-op or publishing run sends `ok`; scrape,
validation, test, Git, push, or PR failures send `error` and exit nonzero.
Monitoring delivery failure remains nonfatal because the missing check-in is
itself the dead-man signal.

The local log includes timestamps, per-season counts, added/updated/retained/
removed totals, validation failures, the resulting commit SHA when applicable,
and the pull-request URL. It must not log environment variables or credentials.

Routine runs require no intervention. An alert may require repair of a broken
selector, authentication, network access, or the runner machine; automation
must continue serving the last known-good committed data until repaired.

## Testing Strategy

Server-side Jest tests cover:

- Direct all-season scraping bypasses cache reads.
- Valid all-season results are returned with configured keys.
- Malformed or empty season results fail validation.
- Duplicate player identities fail validation.
- A count reduction greater than 35 percent fails validation.
- New players are added.
- Existing records receive nonblank scraped updates.
- Blank scraped values and unknown curated fields are preserved.
- An absent player is retained after one valid miss.
- An absent player is removed after two consecutive valid misses.
- Reappearance clears pending removal state.
- Unconfigured seasons and unrelated top-level JSON properties are unchanged.
- Failed validation leaves both production data and removal state untouched.

Script-level tests run against temporary fixture files rather than the real
`asu_hockey_data.json`. The existing scraper HTML fixtures continue protecting
the EliteProspects table parsing contract.

Manual acceptance verification runs the refresh script against fixtures, then
runs the server Jest suite, React unit suite, production build, and
`git diff --check`. Installation verification queries the Scheduled Task and
confirms the daily trigger, wake behavior, missed-run behavior, network gate,
working directory, and execution limit.

## Documentation and Operations

Repository documentation will describe:

- The daily automated recruiting cadence.
- The dedicated runner clone and its one-time installation.
- `npm run refresh-recruiting` as a diagnostic/manual override, not a required
  operational step.
- The files the automation may change.
- The two-run removal behavior and validation thresholds.
- How to inspect `.refresh-log.txt`, the automation PR, Task Scheduler history,
  and the Sentry monitor when alerted.
- The need to update `config.FUTURE_SEASONS` during season rollover.

## Acceptance Criteria

- With the Windows machine available, recruiting is checked once per day with
  no human action.
- Sleep or a missed scheduled time does not permanently skip the run.
- A valid new recruit reaches production through PR, CI, auto-merge, and Render
  without manual review or deployment.
- Valid field changes reach production while blank upstream values do not erase
  existing curated data.
- A recruit is removed only after two consecutive valid snapshots omit them.
- Invalid, empty, or suspicious scrapes do not alter production data.
- The automation never switches or commits from the developer's active
  checkout and never commits files outside its allowlist.
- No-change runs create no commit or deployment and still report success.
- Failed or missed runs raise a Sentry alert while the site continues serving
  the last known-good recruiting data.
