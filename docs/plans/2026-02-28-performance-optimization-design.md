# Performance Optimization — Design

**Date:** 2026-02-28
**Baseline:** PageSpeed mobile score 71 — LCP 7.2s (poor), FCP 2.6s, Speed Index 4.0s

## Problem

The site scores 71/100 on mobile PageSpeed. The dominant issue is a 530 KiB PNG used as a CSS background image in the header, which is the LCP element and accounts for ~490 KiB of avoidable download. Three smaller issues compound this: unused preconnect hints waste early connection budget, the LCP image lacks fetch priority hints, and the CRA browserslist config forces legacy JS polyfills for modern browsers.

## Scope (Approach A)

Four targeted changes to source files only. No ejecting CRA, no build tooling changes, no new infrastructure.

---

## Task 1: Convert `header-stripe.png` → WebP

**Why:** `src/assets/header-stripe.png` is 530 KiB and loaded as a CSS `background-image` on every page. Converting to WebP at quality 80 reduces it to ~40 KiB — a 490 KiB saving that directly eliminates the LCP bottleneck.

**How:**
- Install `sharp` as a devDependency
- Run a one-off conversion script (`scripts/convert-images.js`) that reads `src/assets/header-stripe.png` and writes `src/assets/header-stripe.webp`
- Update `App.css` to reference `header-stripe.webp` instead of `header-stripe.png`
- The existing `background-color: var(--asu-maroon)` on the header element serves as the fallback for the <4% of browsers without WebP support
- Keep original PNG in repo but unref'd

---

## Task 2: Remove unused Google Fonts preconnect hints

**Why:** `public/index.html` has two `<link rel="preconnect">` tags pointing to `fonts.googleapis.com` and `fonts.gstatic.com`. The site does not load any Google Fonts — Inter is loaded via system font stack. These hints open TCP connections to origins that are never used, wasting ~150ms of early connection budget.

**How:** Delete both `<link rel="preconnect">` lines from `public/index.html`.

---

## Task 3: Add `fetchpriority="high"` to LCP hero image

**Why:** The LCP element is the hero game photo rendered by `Home.jsx`. Because it's injected by React JS (not in the initial HTML), the browser doesn't discover it until JS executes. Adding `fetchpriority="high"` tells the browser to fetch it at top priority the moment it's discovered, shaving time off LCP.

**How:** Add `fetchpriority="high"` attribute to the hero `<img>` tag in `Home.jsx`.

---

## Task 4: Narrow `browserslist` production targets

**Why:** The current config (`>0.2%, not dead, not op_mini all`) forces CRA/Babel to include ES5 polyfills for things like `Array.from`, `Promise`, and `Object.assign` — all of which are native in every browser released in the past 6+ years. This adds ~10 KiB to the JS bundle and was flagged by PageSpeed as "Legacy JavaScript."

**How:** Update `browserslist.production` in `package.json` to:
```json
"last 2 Chrome versions",
"last 2 Firefox versions",
"last 2 Safari versions",
"last 2 Edge versions"
```

---

## Expected Outcome

| Metric | Before | Expected After |
|---|---|---|
| Performance score (mobile) | 71 | ~88–92 |
| LCP | 7.2s (poor) | ~2.5–3.5s (needs improvement → good) |
| FCP | 2.6s | ~1.8–2.2s |
| Speed Index | 4.0s | ~2.5s |
