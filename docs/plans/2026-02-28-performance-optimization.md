# Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve mobile PageSpeed score from 71 to ~88–92 by converting a 530 KiB PNG header image to WebP, removing unused preconnect hints, promoting the LCP image to a first-class `<img>` element, and narrowing the browserslist polyfill target.

**Architecture:** Four independent source-file changes — no ejecting CRA, no new build pipeline. Image conversion uses a one-off Node script with `sharp`. The hero background is moved from a CSS `::before` pseudo-element to an explicit `<img>` in JSX so `fetchpriority="high"` can be applied.

**Tech Stack:** React (CRA), Node.js `sharp` for image conversion, CSS mask-image for vignette effect.

---

### Task 1: Convert `header-stripe.png` → WebP

**Files:**
- Create: `scripts/convert-header-stripe.js`
- Modify: `src/App.css:100`

**Step 1: Install sharp as a devDependency**

```bash
npm install --save-dev sharp
```

Expected output: `added 1 package` (sharp installs quickly, it uses prebuilt binaries).

**Step 2: Create the conversion script**

Create `scripts/convert-header-stripe.js`:

```js
const sharp = require('sharp');
const path = require('path');

const input  = path.join(__dirname, '../src/assets/header-stripe.png');
const output = path.join(__dirname, '../src/assets/header-stripe.webp');

sharp(input)
  .webp({ quality: 80 })
  .toFile(output, (err, info) => {
    if (err) { console.error('Conversion failed:', err); process.exit(1); }
    console.log('Done:', info);
  });
```

**Step 3: Run the script**

```bash
node scripts/convert-header-stripe.js
```

Expected output (values approximate):
```
Done: { format: 'webp', width: ..., height: ..., size: 38000, ... }
```

Verify the output file exists and is under 50 KiB:
```bash
node -e "const fs=require('fs'); const s=fs.statSync('src/assets/header-stripe.webp'); console.log((s.size/1024).toFixed(1)+' KiB');"
```
Expected: under 50 KiB (was 530 KiB).

**Step 4: Update `src/App.css` line 100**

Change:
```css
background-image: url('./assets/header-stripe.png');
```
To:
```css
background-image: url('./assets/header-stripe.webp');
```

**Step 5: Verify visually**

Run `npm start`, open http://localhost:3000. The header should look identical — same diagonal stripe texture, same maroon background.

**Step 6: Commit**

```bash
git add src/assets/header-stripe.webp src/App.css scripts/convert-header-stripe.js package.json package-lock.json
git commit -m "perf: convert header-stripe to WebP, saves ~490 KiB"
```

---

### Task 2: Remove unused Google Fonts preconnect hints

**Files:**
- Modify: `public/index.html:7-8`

**Step 1: Delete the two preconnect lines**

In `public/index.html`, remove these two lines (lines 7–8):
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

The file should go from 60 lines to 58 lines. No other changes.

**Step 2: Verify fonts still render correctly**

Run `npm start`, check every page. Inter (the body font) is loaded via the system font stack in CSS — it does not use Google Fonts. Text should look identical.

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "perf: remove unused Google Fonts preconnect hints"
```

---

### Task 3: Promote LCP hero image to `<img fetchpriority="high">`

**Context:** The LCP element is the arena photo behind the home page hero. It's currently applied as `background-image` on `.hero-left::before` in `Home.css`. CSS background images can't receive `fetchpriority`. The fix is to replace the `::before` background with a positioned `<img>` element in JSX — keeping all the same mask/vignette CSS — and add `fetchpriority="high"` to the `<img>`.

**Files:**
- Modify: `src/pages/Home.jsx` (add `import` + `<img>` inside `.hero-left`)
- Modify: `src/pages/Home.css` (remove `background-image` from `::before`, add `.hero-left-bg` styles)

**Step 1: Add the image import to `Home.jsx`**

At the top of `src/pages/Home.jsx`, with the other imports, add:
```js
import heroArenaImage from '../assets/ASU-Hockey-at-Mullett-Arena.jpg';
```

**Step 2: Add the `<img>` element inside `.hero-left`**

In `Home.jsx`, find the `<div className="hero-left">` block (around line 119). Insert the `<img>` as the **first child**:

```jsx
<div className="hero-left">
  <img
    src={heroArenaImage}
    alt=""
    aria-hidden="true"
    fetchpriority="high"
    className="hero-left-bg"
  />
  <div className="hero-overlay" />
  <div className="hero-left-content">
    {/* ... existing content unchanged ... */}
  </div>
</div>
```

**Step 3: Update `Home.css`**

Remove `background-image` from `.hero-left::before`. The `::before` block currently (lines 48–69) is:

```css
.hero-left::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('../assets/ASU-Hockey-at-Mullett-Arena.jpg');
  background-size: cover;
  background-position: center;
  mask-image: ...;
  mask-composite: intersect;
  -webkit-mask-image: ...;
  -webkit-mask-composite: source-in;
  z-index: 0;
}
```

Replace with (remove `background-image`, `background-size`, `background-position`):

```css
.hero-left::before {
  content: '';
  position: absolute;
  inset: 0;
  mask-image:
    linear-gradient(to right,  black 70%, transparent 98%),
    linear-gradient(to bottom, black 88%, transparent 100%),
    linear-gradient(to top,    black 94%, transparent 100%),
    linear-gradient(to left,   black 94%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(to right,  black 70%, transparent 98%),
    linear-gradient(to bottom, black 88%, transparent 100%),
    linear-gradient(to top,    black 94%, transparent 100%),
    linear-gradient(to left,   black 94%, transparent 100%);
  -webkit-mask-composite: source-in;
  z-index: 0;
}
```

Add the new `.hero-left-bg` rule immediately after `.hero-left::before`:

```css
.hero-left-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 0;
}
```

**Step 4: Verify visually**

Run `npm start`. The home page hero should look identical — same arena photo, same vignette/mask effect, same overlaid text and buttons. Check on both desktop and mobile viewport widths.

**Step 5: Commit**

```bash
git add src/pages/Home.jsx src/pages/Home.css
git commit -m "perf: promote hero image to img with fetchpriority=high for LCP"
```

---

### Task 4: Narrow `browserslist` production targets

**Files:**
- Modify: `package.json:54-58`

**Step 1: Update browserslist in `package.json`**

Find the `"browserslist"` key. Change the `"production"` array from:
```json
"production": [
  ">0.2%",
  "not dead",
  "not op_mini all"
]
```
To:
```json
"production": [
  "last 2 Chrome versions",
  "last 2 Firefox versions",
  "last 2 Safari versions",
  "last 2 Edge versions"
]
```

**Step 2: Run a production build and verify**

```bash
npm run build
```

Expected: build succeeds, no errors. The JS bundle at `build/static/js/main.*.js` should be slightly smaller than before (~10 KiB less gzipped).

**Step 3: Smoke-test the build locally**

```bash
node server.js
```

Open http://localhost:5000 and verify the home page loads correctly. Check the browser console for any errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "perf: narrow browserslist to modern browsers, remove legacy polyfills"
```

---

### Final: Push all changes

```bash
git push origin main
```
