const axios = require('axios');
const cheerio = require('cheerio');

async function testPhotoScraping() {
    const url = 'https://www.eliteprospects.com/player/597734/jonas-woo';
    console.log(`Fetching: ${url}\n`);

    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const $ = cheerio.load(data);

    console.log('=== All IMG tags found ===');
    $('img').each((i, el) => {
        const src = $(el).attr('src');
        const alt = $(el).attr('alt');
        const className = $(el).attr('class');
        if (src) {
            console.log(`${i + 1}. SRC: ${src}`);
            if (alt) console.log(`   ALT: ${alt}`);
            if (className) console.log(`   CLASS: ${className}`);
            console.log('');
        }
    });
}

testPhotoScraping().catch(console.error);
