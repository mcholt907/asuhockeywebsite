# Image Optimization Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert hero and logo images to WebP at correct dimensions, move hero to `public/assets/` for a fixed URL, and add a `<link rel="preload">` in `index.html` so the LCP image is discoverable before JavaScript runs.

**Architecture:** The hero image is currently webpack-bundled (`import` in JSX) which gives it a content-hash URL — making a static preload impossible. Moving it to `public/assets/` gives it a fixed URL. A `<link rel="preload" imagesrcset>` in `index.html` then tells the browser about both the desktop and mobile variants before React runs. The logo stays in `public/assets/` (already there) and just gets a WebP sibling at the correct display size.

**Tech Stack:** React 19 (CRA / react-scripts 5), sharp (devDep, already installed), `public/` folder for static assets served at fixed URLs.

---

### Task 1: Create conversion script and produce WebP files

**Files:**
- Create: `scripts/convert-images-round2.js`
- Produces: `public/assets/hero-arena.webp`, `public/assets/hero-arena-mobile.webp`, `public/assets/asu-hockey-logo.webp`

**Step 1: Create the conversion script**

Create `scripts/convert-images-round2.js` with this exact content:

```js
const sharp = require('sharp');
const path = require('path');

const root = path.join(__dirname, '..');

const jobs = [
  {
    input:  path.join(root, 'src/assets/ASU-Hockey-at-Mullett-Arena.jpg'),
    output: path.join(root, 'public/assets/hero-arena.webp'),
    transform: s => s.resize(1400, 933).webp({ quality: 85 }),
    label: 'hero-arena.webp (1400×933 q85)',
  },
  {
    input:  path.join(root, 'src/assets/ASU-Hockey-at-Mullett-Arena.jpg'),
    output: path.join(root, 'public/assets/hero-arena-mobile.webp'),
    transform: s => s.resize(600, 400).webp({ quality: 85 }),
    label: 'hero-arena-mobile.webp (600×400 q85)',
  },
  {
    input:  path.join(root, 'public/assets/asu-hockey-logo.png'),
    output: path.join(root, 'public/assets/asu-hockey-logo.webp'),
    transform: s => s.resize(67, 130).webp({ lossless: true }),
    label: 'asu-hockey-logo.webp (67×130 lossless)',
  },
];

let pending = jobs.length;
let failed = false;

jobs.forEach(({ input, output, transform, label }) => {
  transform(sharp(input)).toFile(output, (err, info) => {
    if (err) {
      console.error(`FAILED ${label}:`, err.message);
      failed = true;
    } else {
      console.log(`OK     ${label} — ${(info.size / 1024).toFixed(1)} KiB`);
    }
    if (--pending === 0 && failed) process.exit(1);
  });
});
```

**Step 2: Run the script**

```bash
node scripts/convert-images-round2.js
```

Expected output (sizes are approximate):
```
OK     hero-arena.webp (1400×933 q85) — 65.3 KiB
OK     hero-arena-mobile.webp (600×400 q85) — 18.7 KiB
OK     asu-hockey-logo.webp (67×130 lossless) — 2.9 KiB
```

All three lines must say `OK`. If any say `FAILED`, fix before continuing.

**Step 3: Verify the three output files exist and are smaller than their sources**

```bash
node -e "
const fs = require('fs');
[
  ['public/assets/hero-arena.webp',        100],
  ['public/assets/hero-arena-mobile.webp',  40],
  ['public/assets/asu-hockey-logo.webp',    10],
].forEach(([f, maxKiB]) => {
  const kb = fs.statSync(f).size / 1024;
  const ok = kb < maxKiB;
  console.log((ok ? 'PASS' : 'FAIL'), f, kb.toFixed(1) + ' KiB', ok ? '' : '(expected < ' + maxKiB + ' KiB)');
});
"
```

Expected: all three lines say `PASS`.

**Step 4: Commit**

```bash
git add scripts/convert-images-round2.js public/assets/hero-arena.webp public/assets/hero-arena-mobile.webp public/assets/asu-hockey-logo.webp
git commit -m "perf: add WebP hero (1400px + 600px mobile) and logo images"
```

---

### Task 2: Add LCP preload hint to index.html

**Files:**
- Modify: `public/index.html:5` (after `<meta charset>` line)

**Step 1: Read the current file**

Read `public/index.html` to confirm its current state (should be 60 lines after Round 1 removals).

**Step 2: Insert the preload link**

Add this block immediately after line 5 (`<meta charset="utf-8" />`):

```html
  <link rel="preload" as="image"
    href="%PUBLIC_URL%/assets/hero-arena.webp"
    imagesrcset="%PUBLIC_URL%/assets/hero-arena-mobile.webp 600w, %PUBLIC_URL%/assets/hero-arena.webp 1400w"
    imagesizes="(max-width: 900px) 100vw, 60vw" />
```

The `%PUBLIC_URL%` token is replaced by CRA's build step with the correct base URL. `imagesrcset` + `imagesizes` match the `srcSet`/`sizes` on the `<img>` element (added in Task 3) — this is required for the browser to correctly match the preload to the image request.

**Step 3: Read the file again and verify**

Read `public/index.html` and confirm:
- The preload `<link>` is present on lines 6–9
- `imagesrcset` contains both `hero-arena-mobile.webp 600w` and `hero-arena.webp 1400w`
- `imagesizes` is `(max-width: 900px) 100vw, 60vw`
- No other lines were changed

**Step 4: Commit**

```bash
git add public/index.html
git commit -m "perf: add LCP preload hint for hero-arena WebP with imagesrcset"
```

---

### Task 3: Update Home.jsx hero img and App.js logo img

**Files:**
- Modify: `src/pages/Home.jsx:5` (remove import) and `src/pages/Home.jsx:121-127` (update img element)
- Modify: `src/App.js:49` (update logo img)

#### Part A — Home.jsx

**Step 1: Remove the heroArenaImage import**

In `src/pages/Home.jsx`, remove line 5:
```js
import heroArenaImage from '../assets/ASU-Hockey-at-Mullett-Arena.jpg';
```

**Step 2: Update the img element**

The current `<img>` block (lines 121–127 after the import removal shifts lines by −1, so now around lines 120–126) is:
```jsx
<img
  src={heroArenaImage}
  alt=""
  aria-hidden="true"
  fetchpriority="high"
  className="hero-left-bg"
/>
```

Replace it with:
```jsx
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

Key points:
- `src` is now a plain string `/assets/hero-arena.webp` (no JS import, no curly braces)
- `srcSet` and `sizes` values **must exactly match** the `imagesrcset` and `imagesizes` in the preload tag added in Task 2 — otherwise the browser loads the image twice (preload miss)
- All other attributes (`alt`, `aria-hidden`, `fetchpriority`, `className`) are unchanged

**Step 3: Verify Home.jsx**

Read the modified section of `src/pages/Home.jsx` and confirm:
- No `import heroArenaImage` line exists anywhere in the file
- The `<img>` has `src="/assets/hero-arena.webp"`, `srcSet`, and `sizes` as specified
- All other JSX is untouched

#### Part B — App.js logo

**Step 4: Update logo img in App.js**

In `src/App.js` line 49, change:
```jsx
<img src="/assets/asu-hockey-logo.png" alt="ASU Hockey" width="253" height="500" />
```
to:
```jsx
<img src="/assets/asu-hockey-logo.webp" alt="ASU Hockey" width="67" height="130" />
```

Three things change: `src` extension `.png` → `.webp`, `width` 253 → 67, `height` 500 → 130. The `width`/`height` are the intrinsic dimensions of the new file (prevents CLS). CSS still controls display size (`height: 65px; width: auto` in App.css — untouched).

**Step 5: Verify App.js**

Read the relevant section of `src/App.js` and confirm:
- Line 49 has `src="/assets/asu-hockey-logo.webp"`, `width="67"`, `height="130"`
- No other lines changed

**Step 6: Commit**

```bash
git add src/pages/Home.jsx src/App.js
git commit -m "perf: use WebP hero with srcset in Home.jsx, WebP logo in App.js"
```

---

### Task 4: Push

```bash
git push origin main
```

Confirm output shows `main -> main` with no errors.

---

## Verification Checklist (run after all tasks)

```bash
# 1. All three WebP files exist
node -e "['public/assets/hero-arena.webp','public/assets/hero-arena-mobile.webp','public/assets/asu-hockey-logo.webp'].forEach(f => { require('fs').statSync(f); console.log('EXISTS', f); })"

# 2. No remaining reference to the old import in Home.jsx
grep -n "heroArenaImage\|Mullett-Arena.jpg" src/pages/Home.jsx && echo "FAIL: old reference found" || echo "PASS: no old reference"

# 3. logo.png reference gone from App.js
grep -n "asu-hockey-logo.png" src/App.js && echo "FAIL: png ref found" || echo "PASS: no png ref"

# 4. preload present in index.html
grep -n "imagesrcset" public/index.html && echo "PASS: preload found" || echo "FAIL: preload missing"
```

All four checks must pass before pushing.
