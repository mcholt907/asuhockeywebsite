const sharp = require('sharp');
const path = require('path');

const input  = path.join(__dirname, '../src/assets/header-stripe.png');
const output = path.join(__dirname, '../src/assets/header-stripe.webp');

sharp(input)
  .webp({ quality: 75 })
  .toFile(output, (err, info) => {
    if (err) { console.error('Conversion failed:', err); process.exit(1); }
    console.log('Done:', info);
  });
