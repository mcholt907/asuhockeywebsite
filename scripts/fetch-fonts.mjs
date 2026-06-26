import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const OUT_DIR = process.argv[2]; // public/assets/fonts
const CSS_OUT = process.argv[3]; // src/styles/fonts.css

const families = [
  'Inter:wght@300;400;500;600;700;800',
  'Barlow+Condensed:wght@400;500;600;700;800;900',
];
const url = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`;
const WANT_SUBSETS = new Set(['latin', 'latin-ext']);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`CSS fetch failed: ${res.status}`);
const css = await res.text();

// fresh dir (delete existing woff2 files rather than rmdir — avoids Windows EBUSY)
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith('.woff2')) fs.rmSync(path.join(OUT_DIR, f), { force: true });
}

// Parse @font-face blocks (preceded by "/* subset */" comments)
const parts = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
const records = [];
for (let i = 0; i < parts.length; i += 2) {
  const subset = parts[i].trim();
  const block = parts[i + 1];
  if (!WANT_SUBSETS.has(subset)) continue;
  const family = (block.match(/font-family:\s*'([^']+)'/) || [])[1];
  const weight = +(block.match(/font-weight:\s*(\d+)/) || [])[1];
  const srcUrl = (block.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  const range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
  if (!family || !weight || !srcUrl) continue;
  records.push({ subset, family, weight, srcUrl, range: range?.trim() });
}

// Group by (family, subset, srcUrl). Variable fonts share one URL across weights.
const groups = new Map();
for (const r of records) {
  const key = `${r.family}|${r.subset}|${r.srcUrl}`;
  if (!groups.has(key)) groups.set(key, { ...r, weights: [] });
  groups.get(key).weights.push(r.weight);
}

const urlCache = new Map();
const faces = [];
for (const g of groups.values()) {
  const isVariable = g.weights.length > 1;
  const wMin = Math.min(...g.weights), wMax = Math.max(...g.weights);
  const fname = isVariable
    ? `${slug(g.family)}-var-${g.subset}.woff2`
    : `${slug(g.family)}-${g.weights[0]}-${g.subset}.woff2`;

  if (!urlCache.has(g.srcUrl)) {
    const fres = await fetch(g.srcUrl, { headers: { 'User-Agent': UA } });
    if (!fres.ok) throw new Error(`woff2 fetch failed ${g.srcUrl}: ${fres.status}`);
    const buf = Buffer.from(await fres.arrayBuffer());
    fs.writeFileSync(path.join(OUT_DIR, fname), buf);
    urlCache.set(g.srcUrl, fname);
    console.log(`saved ${fname} (${buf.length} bytes)`);
  }

  faces.push(
    `@font-face {\n` +
    `  font-family: '${g.family}';\n` +
    `  font-style: normal;\n` +
    `  font-weight: ${isVariable ? `${wMin} ${wMax}` : wMin};\n` +
    `  font-display: swap;\n` +
    `  src: url('/assets/fonts/${fname}') format('woff2');\n` +
    (g.range ? `  unicode-range: ${g.range};\n` : '') +
    `}`
  );
}

const header = `/* Self-hosted fonts — generated, do not edit by hand.\n` +
  `   Replaces the CSP-blocked Google Fonts import.\n` +
  `   Subsets: latin, latin-ext. Inter (variable 300-800), Barlow Condensed (600-900). */\n\n`;
fs.mkdirSync(path.dirname(CSS_OUT), { recursive: true });
fs.writeFileSync(CSS_OUT, header + faces.join('\n\n') + '\n');
console.log(`\nWrote ${faces.length} @font-face rules to ${CSS_OUT}`);
