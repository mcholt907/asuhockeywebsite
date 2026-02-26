// services/roster-service.js
const { scrapeCHNRoster } = require('../scraper');
const staticData = require('../asu_hockey_data.json');

// Build a lookup of shoots by jersey number from static data (fallback for when CHN drops the column)
const staticByNumber = {};
const staticPlayers = Array.isArray(staticData) ? staticData : (staticData.roster || staticData.players || []);
staticPlayers.forEach(p => {
  const num = String(p.number || '').replace('#', '').trim();
  if (num) staticByNumber[num] = p;
});

function determineNationality(hometown) {
  if (!hometown || hometown === '-') return 'USA';
  const h = hometown.toUpperCase();

  const europeMap = {
    'SVK': 'SVK', 'SLOVAKIA': 'SVK',
    'CZE': 'CZE', 'CZECH': 'CZE',
    'SWE': 'SWE', 'SWEDEN': 'SWE',
    'FIN': 'FIN', 'FINLAND': 'FIN',
    'RUS': 'RUS', 'RUSSIA': 'RUS',
    'GER': 'GER', 'GERMANY': 'GER',
    'LAT': 'LAT', 'LATVIA': 'LAT',
    'BLR': 'BLR', 'BELARUS': 'BLR',
    'SUI': 'SUI', 'SWITZERLAND': 'SUI',
    'AUT': 'AUT', 'AUSTRIA': 'AUT',
    'GBR': 'GBR', 'UK': 'GBR',
  };

  for (const [key, code] of Object.entries(europeMap)) {
    if (h.includes(key)) return code;
  }

  if (
    h.includes('CAN') || h.includes('CANADA') ||
    h.includes(' ON') || h.includes('QUE') || h.includes(' BC') || h.includes(' AB') || h.includes(' MB') ||
    h.includes(' SK') || h.includes(' NS') || h.includes(' NB') || h.includes(' PE') || h.includes(' NL') ||
    h.includes('ONT') || h.includes('MAN') || h.includes('ALB') || h.includes('SASK')
  ) {
    return 'CAN';
  }

  return 'USA';
}

async function getRoster() {
  const chnPlayers = await scrapeCHNRoster();

  return chnPlayers
    .filter(p => p.Player)
    .map(p => {
      const name = p.Player.trim();
      const pos = p.Pos || '';
      const hometown = p.Hometown || '';
      const cleanName = name.replace(/\s*\([A-Z]+\)\s*/i, '').trim();

      return {
        number: p['#'] || '',
        name: pos ? `${name} (${pos})` : name,
        position: pos,
        height: p.Ht || '-',
        weight: p.Wt || '-',
        shoots: p['S/C'] || staticByNumber[String(p['#'] || '').trim()]?.shoots || '-',
        born: p.DOB || '-',
        birthplace: hometown || '-',
        nationality: determineNationality(hometown),
        player_link: `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(cleanName)}`,
      };
    });
}

module.exports = { determineNationality, getRoster };
