const fs = require('fs');
const { scrapePlayerProfile } = require('./recruiting-scraper');

async function addCurrentTeamToRecruits() {
    console.log('Starting to scrape current team data...');

    const data = JSON.parse(fs.readFileSync('asu_hockey_data.json', 'utf8'));

    let found = 0;
    let totalPlayers = 0;

    for (const season in data.recruiting) {
        console.log(`\n=== Processing ${season} (${data.recruiting[season].length} players) ===`);

        for (let i = 0; i < data.recruiting[season].length; i++) {
            const player = data.recruiting[season][i];
            totalPlayers++;

            if (player.player_link) {
                console.log(`[${i + 1}/${data.recruiting[season].length}] Scraping profile for ${player.name}...`);

                const profile = await scrapePlayerProfile(player.player_link);

                player.current_team = profile.current_team || '';

                if (profile.current_team) {
                    found++;
                    console.log(`  ✓ Current team: ${profile.current_team}`);
                } else {
                    console.log(`  ✗ No current team found`);
                }

                await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
                console.log(`[${i + 1}/${data.recruiting[season].length}] ${player.name} - No player link`);
                player.current_team = '';
            }
        }
    }

    fs.writeFileSync('asu_hockey_data.json', JSON.stringify(data, null, 2), 'utf8');

    console.log('\n=== Summary ===');
    console.log(`Total players processed: ${totalPlayers}`);
    console.log(`Current teams found: ${found}`);
    console.log(`Missing: ${totalPlayers - found}`);
    console.log('\ncurrent_team has been written to asu_hockey_data.json');
}

addCurrentTeamToRecruits().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
