
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const filePath = path.join(__dirname, 'temp_schedule_results.html');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content);

    const items = $('div.schedule-event-item');
    console.log(`Found ${items.length} items.`);

    items.each((i, el) => {
        const item = $(el);
        const resultEl = item.find('div.schedule-event-grid-result');

        if (resultEl.length > 0) {
            console.log(`\n--- Item ${i} has result ---`);
            console.log(resultEl.html());

            // Try to parse it
            const resultLabel = resultEl.find('.schedule-event-grid-result__label');
            // Get text excluding children if possible, or just all text and clean it
            // The structure is roughly: <strong ...> W/L </strong> <span sr-only>...</span> SCORE

            // Let's try to get the full text and simple text
            const fullText = resultLabel.text().trim();
            console.log('Full Text:', fullText); // Likely "L Loss 3-6" or similar

            // Maybe we clone and remove children to get the score node?
            const clone = resultLabel.clone();
            clone.find('.sr-only').remove();
            const textWithoutSr = clone.text().trim();
            console.log('Text without sr-only:', textWithoutSr);

            const winLossMatch = textWithoutSr.match(/([WL])/);
            console.log('Win/Loss:', winLossMatch ? winLossMatch[1] : 'N/A');

            // Score might be the rest?
            // If text is "L  3-6", we can split or regex
        }
    });

} catch (err) {
    console.error(err);
}
