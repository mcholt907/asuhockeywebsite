
const axios = require('axios');
const cheerio = require('cheerio');

async function debugRow() {
    const url = 'https://www.collegehockeynews.com/reports/roster/Arizona-State/61';
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);

        $('table').each((i, table) => {
            const headers = [];
            $(table).find('thead th').each((j, th) => {
                headers.push($(th).text().trim());
            });
            console.log(`Table ${i} Headers (${headers.length}):`, headers);

            const firstRowCells = [];
            $(table).find('tbody tr').eq(0).find('td').each((j, td) => {
                firstRowCells.push($(td).text().trim());
            });
            console.log(`Table ${i} First Row Cells (${firstRowCells.length}):`, firstRowCells);

            // Check alignment
            firstRowCells.forEach((cell, idx) => {
                console.log(`  Index ${idx}: Header='${headers[idx]}' val='${cell}'`);
            });
        });

    } catch (error) {
        console.error(error);
    }
}

debugRow();
