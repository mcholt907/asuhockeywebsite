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
});
