
const axios = require('axios');
const cheerio = require('cheerio');

async function checkRosterPage() {
    const url = 'https://www.collegehockeynews.com/reports/roster/Arizona-State/61';
    try {
        console.log(`Fetching ${url}...`);
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);

        console.log('Page Title:', $('title').text());

        // Look for a roster table
        // Usually tables have class 'data' or similar in CHN
        const tables = $('table');
        console.log(`Found ${tables.length} tables.`);

        tables.each((i, table) => {
            console.log(`\nTable ${i}:`);
            const headers = [];
            $(table).find('thead th').each((j, th) => headers.push($(th).text().trim()));
            console.log('Headers:', headers.join(' | '));

            // Print first row
            const firstRow = [];
            $(table).find('tbody tr').first().find('td').each((j, td) => firstRow.push($(td).text().trim()));
            console.log('First Row:', firstRow.join(' | '));
        });

    } catch (error) {
        console.error('Error fetching roster page:', error.message);
    }
}

checkRosterPage();
