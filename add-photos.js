const fs = require('fs');
const { scrapePlayerPhoto } = require('./recruiting-scraper');

async function addPhotosToRecruits() {
    console.log('Starting to scrape player photos...');

    // Read the current data
    const data = JSON.parse(fs.readFileSync('asu_hockey_data.json', 'utf8'));

    let totalPhotos = 0;
    let totalPlayers = 0;

    // Iterate through each season
    for (const season in data.recruiting) {
        console.log(`\n=== Processing ${season} (${data.recruiting[season].length} players) ===`);

        for (let i = 0; i < data.recruiting[season].length; i++) {
            const player = data.recruiting[season][i];
            totalPlayers++;

            if (player.player_link) {
                console.log(`[${i + 1}/${data.recruiting[season].length}] Scraping photo for ${player.name}...`);

                // Scrape the photo
                const photoUrl = await scrapePlayerPhoto(player.player_link);

                if (photoUrl) {
                    player.player_photo = photoUrl;
                    totalPhotos++;
                    console.log(`  ✓ Found photo: ${photoUrl.substring(0, 60)}...`);
                } else {
                    player.player_photo = '';
                    console.log(`  ✗ No photo found`);
                }

                // Add a delay between requests to be respectful to Elite Prospects
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log(`[${i + 1}/${data.recruiting[season].length}] ${player.name} - No player link`);
                player.player_photo = '';
            }
        }
    }

    // Write back to file
    fs.writeFileSync('asu_hockey_data.json', JSON.stringify(data, null, 2), 'utf8');

    console.log('\n=== Summary ===');
    console.log(`Total players processed: ${totalPlayers}`);
    console.log(`Photos found: ${totalPhotos}`);
    console.log(`Photos missing: ${totalPlayers - totalPhotos}`);
    console.log('\nPlayer photos have been added to asu_hockey_data.json!');
}

addPhotosToRecruits().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
