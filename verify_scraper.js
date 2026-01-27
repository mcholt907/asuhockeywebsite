
const { fetchScheduleData } = require('./scraper');
const fs = require('fs');
const path = require('path');

// Try to clear cache if possible, or we'll just see what happens
const cacheFile = path.join(__dirname, 'src/scripts/cache/asu_hockey_schedule_2025.json'); // Corrected path
if (fs.existsSync(cacheFile)) {
    try { fs.unlinkSync(cacheFile); console.log('Deleted cache file.'); } catch (e) { }
}

async function verify() {
    try {
        console.log('Fetching schedule data...');
        const data = await fetchScheduleData();
        console.log(`Fetched ${data.length} games.`);
        if (data.length > 0) {
            fs.writeFileSync('verification_result.json', JSON.stringify(data[0], null, 2));
            console.log('Saved first game to verification_result.json');

            // Look for a game with a result
            const gameWithResult = data.find(g => g.result);
            if (gameWithResult) {
                console.log('Found game with result:', JSON.stringify(gameWithResult, null, 2));
            } else {
                console.log('No game with result found (might be all upcoming).');
            }

        } else {
            console.log('No games found.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

verify();
