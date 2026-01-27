
const axios = require('axios');
const cheerio = require('cheerio');

async function debugRoster() {
    const url = 'https://www.collegehockeynews.com/reports/roster/Arizona-State/61';
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);

        $('table').each((i, table) => {
            const headers = [];
            $(table).find('thead th').each((j, th) => {
                headers.push($(th).text().trim());
            });
            console.log(`Table ${i} Headers:`, headers);

            // Test the logic
            const hasPlayer = headers.some(h => h.includes('Player'));
            console.log(`Table ${i} hasPlayer: ${hasPlayer}`);
        });

    } catch (error) {
        console.error(error);
    }
}

debugRoster();
