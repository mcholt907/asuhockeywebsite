
const axios = require('axios');

async function checkServerRoster() {
    const url = 'http://localhost:5000/api/roster';
    try {
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url);
        const players = res.data;
        console.log(`Total Players in Roster Response: ${players.length}`);

        const missingTargets = ['Sam Court', 'Justin Kipkie', 'Tucker Ness', 'Bennett Schimek'];

        missingTargets.forEach(target => {
            const found = players.find(p => p.name.toLowerCase().includes(target.toLowerCase()));
            if (found) {
                console.log(`[FOUND] ${target} -> Name: "${found.name}", Position Field: "${found.position}"`);
            } else {
                console.log(`[MISSING] ${target}`);
            }
        });

    } catch (error) {
        console.error('Error fetching roster API:', error.message);
    }
}

checkServerRoster();
