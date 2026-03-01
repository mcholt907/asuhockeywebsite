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
    if (--pending === 0) process.exit(failed ? 1 : 0);
  });
});
