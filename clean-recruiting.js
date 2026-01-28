const fs = require('fs');

// Read the JSON file
const data = JSON.parse(fs.readFileSync('asu_hockey_data.json', 'utf8'));

// Clean 2027-2028: Keep only valid players (not NCAA garbage rows)
if (data.recruiting['2027-2028']) {
    data.recruiting['2027-2028'] = data.recruiting['2027-2028'].filter(player => {
        return player.number !== 'NCAA' && player.name !== '' && !player.name.match(/^\d+$/);
    });

    // Fix Booker Toninato's incorrect data
    const booker = data.recruiting['2027-2028'].find(p => p.name === 'Booker Toninato');
    if (booker) {
        booker.weight = '165';
        booker.shoots = 'R';
        booker.player_link = 'https://www.eliteprospects.com/player/617647/booker-toninato';
    }
}

// Add 2028-2029 if not exists or clean it
data.recruiting['2028-2029'] = [
    {
        "number": "",
        "name": "Rian Marquardt",
        "position": "D",
        "age": "16",
        "birth_year": "2009",
        "birthplace": "Hugo, MN, USA",
        "height": "6'2\"",
        "weight": "190",
        "shoots": "L",
        "player_link": "https://www.eliteprospects.com/player/951201/rian-marquardt"
    }
];

// Write back to file
fs.writeFileSync('asu_hockey_data.json', JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully cleaned recruiting data!');
console.log('2027-2028 players:', data.recruiting['2027-2028'].map(p => p.name));
console.log('2028-2029 players:', data.recruiting['2028-2029'].map(p => p.name));
