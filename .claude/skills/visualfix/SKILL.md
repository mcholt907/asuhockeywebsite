---
name: visualfix
description: Use when fixing a visual or layout bug (uneven heights, misalignment, spacing, overflow, cards not uniform) in this site's CSS, before editing any CSS property.
---

# Visual Fix

## Overview

Diagnose the real layout culprit with a live browser before touching CSS. Guessing at properties like `align-items` produces "barely a difference" fixes and wasted round-trips.

**Core principle: no CSS edit until computed dimensions identify the culprit.**

## Workflow

1. **Screenshot the baseline.** Navigate to the affected page with Playwright (`mcp__playwright__browser_navigate` to `http://localhost:3000/...`) and take a screenshot (`mcp__playwright__browser_take_screenshot`). Check mobile too if relevant — bottom-nav breakpoint is <780px (`mcp__playwright__browser_resize`).
2. **Measure, don't guess.** Use `mcp__playwright__browser_evaluate` to read the computed styles of the affected elements and their containers: `height`, `padding`, `margin`, `flex`/`grid` properties, `line-height`, and content box sizes (`getBoundingClientRect`, `getComputedStyle`).
3. **Name the culprit.** State which element and which property actually causes the problem, with the measured numbers as evidence. If the numbers don't explain the symptom, keep measuring — don't edit yet.
4. **Apply the minimal CSS edit,** re-screenshot at the same viewport(s), and compare against the baseline. If the change is not clearly visible in the comparison, the diagnosis was wrong — return to step 2.

## Red Flags — STOP and Measure First

- Editing CSS before running any `browser_evaluate`
- "It's probably `align-items` / `flex` / `margin`" without numbers
- Declaring success from the code diff without an after-screenshot
- An after-screenshot that looks "barely different" from the baseline — that's a failed fix, not a subtle one

## Project Notes

- Dev servers: `npm start` (Vite, :3000) + `node server.js` (Express, :5000) must both be running
- Design tokens live in `src/App.css`; brand colors `--asu-maroon: #43141A`, `--asu-gold: #E8A833`
