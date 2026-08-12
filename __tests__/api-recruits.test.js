jest.mock('../server/scrapers', () => ({
  fetchRecruitingData: jest.fn(),
}));
jest.mock('../server/services/roster-service', () => ({ getRoster: jest.fn() }));
jest.mock('../server/services/static-data', () => ({
  getStaticData: jest.fn(() => ({ recruiting: { legacy: [{ name: 'Legacy Recruit' }] } })),
}));
jest.mock('../server/cache/data-status', () => ({
  getDataStatus: jest.fn(),
  getCooldownStatus: jest.fn(),
}));

const { fetchRecruitingData } = require('../server/scrapers');
const router = require('../server/routes/api');

function recruitsHandler() {
  return router.stack.find((layer) => layer.route?.path === '/recruits')
    .route.stack[0].handle;
}

function responseRecorder() {
  const res = {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return res;
}

describe('/api/recruits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns the nonempty season map supplied by the recruiting scraper', async () => {
    const roster = {
      '2027-2028': [{
        name: 'Future Team Player',
        player_link: 'https://www.eliteprospects.com/player/1/current-team-player',
      }],
      '2028-2029': [],
    };
    fetchRecruitingData.mockResolvedValue(roster);
    const res = responseRecorder();

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(roster);
  });

  test('returns a controlled error when the recruiting scraper returns all-empty rosters', async () => {
    fetchRecruitingData.mockResolvedValue({
      '2027-2028': [],
      '2028-2029': [],
    });
    const res = responseRecorder();

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Recruiting roster data unavailable.' });
  });

  test('returns a controlled error when the recruiting scraper omits a configured season', async () => {
    fetchRecruitingData.mockResolvedValue({
      '2027-2028': [{
        name: 'Future Team Player',
        player_link: 'https://www.eliteprospects.com/player/1/current-team-player',
      }],
    });
    const res = responseRecorder();

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Recruiting roster data unavailable.' });
  });

  test('returns a controlled error when the recruiting scraper returns a malformed player', async () => {
    fetchRecruitingData.mockResolvedValue({
      '2027-2028': [{ name: 'Future Team Player' }],
      '2028-2029': [],
    });
    const res = responseRecorder();

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Recruiting roster data unavailable.' });
  });

  test('returns a controlled error when the recruiting scraper includes a current-team season', async () => {
    fetchRecruitingData.mockResolvedValue({
      '2026-2027': [{
        name: 'Current Team Player',
        player_link: 'https://www.eliteprospects.com/player/1/current-team-player',
      }],
      '2027-2028': [{
        name: 'Future Team Player',
        player_link: 'https://www.eliteprospects.com/player/2/future-team-player',
      }],
      '2028-2029': [],
    });
    const res = responseRecorder();

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Recruiting roster data unavailable.' });
  });

  test('returns a controlled error when the recruiting scraper throws', async () => {
    fetchRecruitingData.mockRejectedValue(new Error('fallback unavailable'));
    const res = responseRecorder();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await recruitsHandler()({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({
      error: 'Internal server error while fetching recruiting rosters.',
    });
  });
});
