jest.mock('../scraper', () => ({
  scrapeCHNRoster: jest.fn(),
}));

const { scrapeCHNRoster } = require('../scraper');
const { determineNationality, getRoster } = require('../services/roster-service');

beforeEach(() => jest.clearAllMocks());

describe('determineNationality', () => {
  test('defaults to USA for US city/state', () => {
    expect(determineNationality('Scottsdale, AZ')).toBe('USA');
  });

  test('detects Canada from province abbreviation', () => {
    expect(determineNationality('Winnipeg, MB, CAN')).toBe('CAN');
  });

  test('detects Slovakia', () => {
    expect(determineNationality('Bratislava, SVK')).toBe('SVK');
  });

  test('returns USA for empty or dash', () => {
    expect(determineNationality('')).toBe('USA');
    expect(determineNationality('-')).toBe('USA');
  });

  // Regressions guarded by audit item #16 — token-based match should not be
  // tricked by country codes that appear as substrings of unrelated city names.
  test('Geraldton, ON resolves to CAN (not GER)', () => {
    expect(determineNationality('Geraldton, ON')).toBe('CAN');
  });

  test('Latrobe, PA resolves to USA (not LAT)', () => {
    expect(determineNationality('Latrobe, PA')).toBe('USA');
  });

  test('Mansfield, MA resolves to USA (not CAN via MAN substring)', () => {
    expect(determineNationality('Mansfield, MA')).toBe('USA');
  });
});

describe('getRoster', () => {
  test('maps CHN player fields to API format', async () => {
    scrapeCHNRoster.mockResolvedValue([
      {
        '#': '30',
        Player: 'Chase Hamm',
        Pos: 'G',
        'S/C': 'L',
        Ht: '5-10',
        Wt: '168',
        DOB: '05/07/2000',
        Hometown: 'Saskatoon, SK CAN',
      },
    ]);

    const result = await getRoster();

    expect(result).toHaveLength(1);
    const player = result[0];
    expect(player.number).toBe('30');
    expect(player.name).toBe('Chase Hamm (G)');
    expect(player.position).toBe('G');
    expect(player.shoots).toBe('L');
    expect(player.height).toBe('5-10');
    expect(player.weight).toBe('168');
    expect(player.nationality).toBe('CAN');
    expect(player.player_link).toContain('eliteprospects.com');
  });

  test('returns empty array when scraper returns nothing', async () => {
    scrapeCHNRoster.mockResolvedValue([]);
    const result = await getRoster();
    expect(result).toEqual([]);
  });

  test('filters out rows missing the Player field', async () => {
    scrapeCHNRoster.mockResolvedValue([
      { '#': '7',  Player: 'Real Player', Pos: 'F' },
      { '#': '8',  Player: '',            Pos: 'F' },
      { '#': '9',  /* no Player key */    Pos: 'D' },
    ]);

    const result = await getRoster();
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe('7');
  });

  test('falls back to "-" placeholders when fields are missing', async () => {
    scrapeCHNRoster.mockResolvedValue([
      { Player: 'No Data Guy' }, // no #, Pos, Ht, Wt, DOB, S/C, Hometown
    ]);

    const result = await getRoster();
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.number).toBe('');
    expect(p.name).toBe('No Data Guy'); // no "(pos)" suffix when pos is empty
    expect(p.position).toBe('');
    expect(p.height).toBe('-');
    expect(p.weight).toBe('-');
    expect(p.shoots).toBe('-');
    expect(p.born).toBe('-');
    expect(p.birthplace).toBe('-');
    expect(p.nationality).toBe('USA'); // determineNationality default for empty hometown
  });

  test('falls back to static-data shoots when CHN drops the S/C column', async () => {
    // #30 Chase Hamm has shoots: 'L' in asu_hockey_data.json static roster.
    // CHN occasionally drops the S/C column entirely; static data covers the gap.
    scrapeCHNRoster.mockResolvedValue([
      { '#': '30', Player: 'Chase Hamm', Pos: 'G', Hometown: 'Saskatoon, SK CAN' },
    ]);

    const result = await getRoster();
    expect(result[0].shoots).toBe('L');
  });

  test('uses CHN S/C value over the static fallback when both exist', async () => {
    scrapeCHNRoster.mockResolvedValue([
      { '#': '30', Player: 'Chase Hamm', Pos: 'G', 'S/C': 'R', Hometown: 'Saskatoon, SK CAN' },
    ]);

    const result = await getRoster();
    expect(result[0].shoots).toBe('R'); // not the static 'L'
  });

  test('strips position parentheses from the player_link search query', async () => {
    scrapeCHNRoster.mockResolvedValue([
      { '#': '15', Player: 'Sam Smith (D)', Pos: 'D', Hometown: 'Phoenix, AZ' },
    ]);

    const result = await getRoster();
    // Display name still has "(D)", but the EP search URL should not.
    expect(result[0].name).toBe('Sam Smith (D) (D)');
    expect(result[0].player_link).toContain('q=Sam%20Smith');
    expect(result[0].player_link).not.toContain('%28D%29');
  });
});
