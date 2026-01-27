
const { scrapeCHNStats } = require('./scraper');
const fs = require('fs');
const path = require('path');

async function compare() {
    try {
        // 1. Get Stats Players (The Source of Truth for "Active Players")
        console.log('Fetching Stats...');
        const statsData = await scrapeCHNStats();
        const statsPlayers = [];
        if (statsData.skaters) {
            statsData.skaters.forEach(p => {
                let name = p['Name, Yr'] || p.Player || p.Name;
                if (name) statsPlayers.push(name.split(',')[0].trim()); // Clean "Name, Pos, Yr"
            });
        }
        if (statsData.goalies) {
            statsData.goalies.forEach(p => {
                let name = p.Player || p.Name; // Goalies often just Name in some tables, or check keys
                // In previous verify, skaters had 'Name, Yr'. Goalies might be different. 
                // Let's assume standard scraping key or inspect.
                if (name) statsPlayers.push(name.split(',')[0].trim());
            });
        }

        // 2. Get Roster Players (From JSON)
        console.log('Reading Roster JSON...');
        const jsonPath = path.join(__dirname, 'asu_hockey_data.json');
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);
        const rosterPlayers = jsonData.roster.map(p => {
            // Clean "Name (Pos)" format
            return p.name.replace(/\s*\(.*?\)\s*/g, '').trim();
        });

        // 3. Compare
        console.log(`\nStats Count: ${statsPlayers.length}`);
        console.log(`Roster Count: ${rosterPlayers.length}`);

        const missingInRoster = statsPlayers.filter(p => !rosterPlayers.includes(p));

        console.log('\n--- Players in Stats but MISSING in Roster ---');
        missingInRoster.forEach(p => console.log(p));

    } catch (error) {
        console.error('Error during comparison:', error);
    }
}

compare();
