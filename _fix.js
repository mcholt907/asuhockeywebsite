const fs = require('fs');
const content = fs.readFileSync('scraper.js', 'utf8');
const lines = content.split('\n');

const slash = '/';
const bs = '\\';
const regexp = slash + bs + slash + 'box' + bs + slash + 'final' + bs + slash + '(' + bs + 'd{4})(' + bs + 'd{2})(' + bs + 'd{2})' + bs + slash + slash;
const newLine = '        const match = box_href.match(' + regexp + ');';

console.log('Here:', newLine);
