const fs = require('fs');
const cheerio = require('cheerio');
const { requestWithRetry } = require('./utils/request-helper');

// New players from CSV — not yet in asu_hockey_data.json
const NEW_PLAYERS = [
  { name: 'Henry Chmiel', season: '2027-2028', position: 'D', player_link: 'https://www.eliteprospects.com/player/863782/henry-chmiel' },
];

async function scrapeEPProfile(url) {
  console.log(`  Fetching: ${url}`);
  const { data } = await requestWithRetry(url);
  const $ = cheerio.load(data);

  // Photo
  let player_photo = '';
  const photoSrc =
    $('img[src*="files.eliteprospects.com/layout/players"]').first().attr('src') ||
    $('[class*="ProfileImage"] img').first().attr('src');
  if (photoSrc) {
    player_photo = photoSrc.startsWith('http') ? photoSrc : `https://www.eliteprospects.com${photoSrc}`;
  }

  // Current team
  let current_team = '';
  const teamLink = $('[class*="PlayerInfo"] a[href*="/team/"]').first();
  if (teamLink.length) {
    current_team = teamLink.text().trim();
  }
  if (!current_team) {
    $('a[href*="/team/"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 2) { current_team = text; return false; }
    });
  }

  // Bio fields — EP renders these in a definition list / info panel
  const bio = {};
  $('[class*="PlayerInfo"] [class*="InfoItem"], .ep-list__item, dl dt, dl dd').each((_, el) => {
    const text = $(el).text().trim();
    const label = $(el).prev().text().trim().toLowerCase();
    if (label.includes('height')) bio.height = text;
    if (label.includes('weight')) bio.weight = text;
    if (label.includes('shoots') || label.includes('catches')) bio.shoots = text;
    if (label.includes('born') || label.includes('date of birth')) {
      const yearMatch = text.match(/(\d{4})/);
      if (yearMatch) bio.birth_year = yearMatch[1];
      // Age is often in parens: "Feb 14, 2007 (18)"
      const ageMatch = text.match(/\((\d+)\)/);
      if (ageMatch) bio.age = ageMatch[1];
    }
    if (label.includes('birthplace') || label.includes('place of birth')) {
      bio.birthplace = text;
    }
  });

  // Fallback: scrape the structured info table EP uses
  $('table tr, [class*="PlayerInfo"] li, [class*="ep-td"]').each((_, el) => {
    const cells = $(el).find('td, span, div');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().toLowerCase();
      const val = $(cells[1]).text().trim();
      if (key.includes('height') && val) bio.height = val;
      if (key.includes('weight') && val) bio.weight = val;
      if ((key.includes('shoots') || key.includes('catches')) && val) bio.shoots = val;
      if ((key.includes('born') || key.includes('date of birth')) && val) {
        const yearMatch = val.match(/(\d{4})/);
        if (yearMatch) bio.birth_year = yearMatch[1];
        const ageMatch = val.match(/\((\d+)\)/);
        if (ageMatch) bio.age = ageMatch[1];
      }
      if ((key.includes('birthplace') || key.includes('place of birth')) && val) bio.birthplace = val;
    }
  });

  return { player_photo, current_team, ...bio };
}

async function main() {
  console.log('Adding new recruits to asu_hockey_data.json...\n');
  const data = JSON.parse(fs.readFileSync('asu_hockey_data.json', 'utf8'));

  for (const player of NEW_PLAYERS) {
    console.log(`[${player.name}]`);
    let profile = {};
    try {
      profile = await scrapeEPProfile(player.player_link);
      console.log(`  photo: ${profile.player_photo ? 'found' : 'missing'}`);
      console.log(`  current_team: ${profile.current_team || 'not found'}`);
      console.log(`  height: ${profile.height || '?'}, weight: ${profile.weight || '?'}, shoots: ${profile.shoots || '?'}`);
      console.log(`  birth_year: ${profile.birth_year || '?'}, age: ${profile.age || '?'}, birthplace: ${profile.birthplace || '?'}`);
    } catch (e) {
      console.error(`  ERROR scraping profile: ${e.message}`);
    }

    const entry = {
      number: '',
      name: player.name,
      position: player.position,
      age: profile.age || '',
      birth_year: profile.birth_year || '',
      birthplace: profile.birthplace || '',
      height: profile.height || '',
      weight: profile.weight || '',
      shoots: profile.shoots || '',
      player_link: player.player_link,
      player_photo: profile.player_photo || '',
      current_team: profile.current_team || '',
    };

    if (!data.recruiting[player.season]) {
      data.recruiting[player.season] = [];
    }
    data.recruiting[player.season].push(entry);
    console.log(`  Added to ${player.season}\n`);

    await new Promise(r => setTimeout(r, 1500));
  }

  fs.writeFileSync('asu_hockey_data.json', JSON.stringify(data, null, 2), 'utf8');
  console.log('Done. asu_hockey_data.json updated.');
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
