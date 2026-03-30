const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const { data } = await axios.get('https://www.uscho.com/team/arizona-state/mens-hockey', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000
  });
  const $ = cheerio.load(data);
  const page = JSON.parse($('#app').attr('data-page'));

  // Print the full record object
  console.log('RECORD:', JSON.stringify(page.props.content.record, null, 2));
})().catch(e => console.error('ERR:', e.message));
