---
name: add-line-chart
description: Add game-day line chart image(s) so the matching Schedule page game cards show a "Lines" link. Usage: /add-line-chart (attach one or more line chart images) [YYYY-MM-DD "Opponent"]
---

You are adding ASU's game-day line chart graphics (the lineup sheets posted on
game day) to the Schedule page.

How it works: `src/data/lineCharts.json` maps a game date (`YYYY-MM-DD`) to an
image under `public/assets/line-charts/<season>/`. The Schedule page looks up
each game card's `date` in that map and, when found, shows a **Lines** pill
next to Box/Metrics. The pill shows even before a result exists. The match is
by exact date, so the date must be the game date shown on the schedule.

`npm run add-line-chart` does all file work: it auto-orients the image, caps
it at 1600px wide, re-encodes it as WebP (which strips EXIF/location data),
writes `public/assets/line-charts/<season>/<date>-<opponent>.webp`, and updates
the manifest (sorted). Re-running for a date replaces that date's chart. Never
edit the manifest or the image folder by hand.

---

## Steps

1. **Identify each game.** For every attached image, read the header: it says
   `ASU vs <Opponent>` and `GAME N - <MONTH D, YYYY>`. If the user passed a
   date and opponent, use those instead. If the header is unreadable or
   ambiguous, ask rather than guess. Keep track of which upload path belongs
   to which game; when several images arrive at once, build a small contact
   sheet of the cropped headers and view it to confirm the mapping before
   writing anything.

2. **Make sure dependencies are installed** (the script needs `sharp`). If
   `node -e "require('sharp')"` fails, run `npm ci`; in a cloud session whose
   Node version differs from `.node-version`, use
   `npm ci --ignore-scripts` instead.

3. **Add each chart:**
   ```bash
   npm run add-line-chart -- "<image path>" <YYYY-MM-DD> "<Opponent>"
   ```
   Poll rankings such as `#5` are dropped from the filename automatically.
   Confirm each output line shows the expected date and opponent.

4. **Verify:**
   ```bash
   npx jest --config jest.server.config.js __tests__/line-charts.test.js
   npm test -- --testPathPattern="Schedule"
   ```
   The first test fails if the manifest and the image folder drift apart.

5. **Commit only** `src/data/lineCharts.json` and the new or changed files
   under `public/assets/line-charts/`, with a message such as
   `content: add line chart for Nov 21 at Minnesota Duluth`, then follow the
   repository's push/PR workflow. Do not commit the original uploads.

6. **Report** each game you added (date, opponent, file path) and anything
   you replaced.
