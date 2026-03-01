# Image Optimization Round 2 — Design

**Date:** 2026-02-28
**Status:** Approved
**Goal:** Fix remaining PageSpeed issues — LCP discoverability (❌ in initial document), hero JPG → WebP, logo PNG → WebP, responsive hero srcset.

## Context

After Round 1 (header-stripe WebP, fetchpriority=high, browserslist), PageSpeed still flags:

1. **LCP not discoverable in initial HTML** — hero image is webpack-bundled with a content-hash URL. Browser can't preload it until React runs. Fix: move to `public/assets/` (fixed URL) + add `<link rel="preload">` in `index.html`.
2. **Hero still JPG, oversized** — 397.5 KiB JPG at 1920×1278, displayed at ~1082×720. Est. savings 297 KiB.
3. **Logo PNG oversized** — 26.8 KiB, 253×500 source displayed at max 33×65 CSS px. Est. savings 26.5 KiB.

## Approach: Responsive WebP + Preload

### Hero Image

**Conversion** (via `scripts/convert-images-round2.js` using `sharp`):
- `hero-arena.webp` — resize to 1400×933, WebP quality 85 (~70 KiB estimated)
- `hero-arena-mobile.webp` — resize to 600×400, WebP quality 85 (~20 KiB estimated)

Quality 85 chosen: WebP q85 ≈ JPEG q95+ perceptually — no noticeable quality loss.

**Output:** `public/assets/` (fixed URL, no webpack content-hash → enables static preload)

**`public/index.html`** — add preload immediately after `<meta charset>`:
```html
<link rel="preload" as="image"
  href="%PUBLIC_URL%/assets/hero-arena.webp"
  imagesrcset="%PUBLIC_URL%/assets/hero-arena-mobile.webp 600w, %PUBLIC_URL%/assets/hero-arena.webp 1400w"
  imagesizes="(max-width: 900px) 100vw, 60vw" />
```
Fixes the "discoverable in initial document" ❌ — browser finds the image during HTML parse before any JS runs.

**`src/pages/Home.jsx`** — remove webpack import, use direct public URL with srcset:
```jsx
// Remove: import heroArenaImage from '../assets/ASU-Hockey-at-Mullett-Arena.jpg';

<img
  src="/assets/hero-arena.webp"
  srcSet="/assets/hero-arena-mobile.webp 600w, /assets/hero-arena.webp 1400w"
  sizes="(max-width: 900px) 100vw, 60vw"
  alt=""
  aria-hidden="true"
  fetchpriority="high"
  className="hero-left-bg"
/>
```

The source file `src/assets/ASU-Hockey-at-Mullett-Arena.jpg` is retained on disk as the conversion input; the webpack import is removed.

### Logo Image

**Conversion:**
- `asu-hockey-logo.webp` — resize to 67×130, **lossless WebP**
- Logo has sharp edges and solid colors → lossless preserves pixel-perfect quality (same as PNG), savings come entirely from resize (253×500 → 67×130 = 2× retina of CSS display size 33×65)

**`src/App.js` line 49:**
```jsx
<img src="/assets/asu-hockey-logo.webp" alt="ASU Hockey" width="67" height="130" />
```
Intrinsic dimensions updated to match new file (prevents layout shift). `asu-hockey-logo-small.png` (4.8 KiB, mobile menu) left unchanged — not worth the noise.

### Conversion Script

New file: `scripts/convert-images-round2.js`
- Reads `src/assets/ASU-Hockey-at-Mullett-Arena.jpg`
- Reads `public/assets/asu-hockey-logo.png`
- Writes 3 output files to `public/assets/`
- Logs each output size
- Exits with code 1 on any error

## Expected Outcomes

| Asset | Before | After | Savings |
|---|---|---|---|
| Hero (desktop fetch) | 397.5 KiB JPG | ~70 KiB WebP | ~327 KiB |
| Hero (mobile fetch) | 397.5 KiB JPG | ~20 KiB WebP | ~377 KiB |
| Logo | 26.8 KiB PNG | ~3 KiB WebP | ~24 KiB |
| LCP discoverability | ❌ not in initial doc | ✅ preload in HTML | — |

## Files Changed

| File | Change |
|---|---|
| `scripts/convert-images-round2.js` | New conversion script |
| `public/assets/hero-arena.webp` | New — 1400×933 WebP q85 |
| `public/assets/hero-arena-mobile.webp` | New — 600×400 WebP q85 |
| `public/assets/asu-hockey-logo.webp` | New — 67×130 lossless WebP |
| `public/index.html` | Add `<link rel="preload">` with imagesrcset |
| `src/pages/Home.jsx` | Remove import, update img src/srcSet/sizes |
| `src/App.js` | Update logo src + intrinsic dimensions |

## Out of Scope

- `asu-hockey-logo-small.png` (4.8 KiB) — negligible, left as-is
- Render-blocking `main.css` — requires CRA ejection, not worth the complexity
- Legacy JS (11 KiB) — react-scripts internals, not addressable without ejecting
