jest.mock('../server/scrapers', () => ({}));
jest.mock('../server/services/roster-service', () => ({}));
jest.mock('../server/cache/data-status', () => ({ getDataStatus: jest.fn(() => []), getCooldownStatus: jest.fn(() => []) }));
const router = require('../server/routes/api');

test('/api/status prevents cached healthy responses from masking outages', () => {
  const handler = router.stack.find(layer => layer.route?.path === '/status').route.stack[0].handle;
  const headers = {};
  let payload;
  const res = { set(name, value) { headers[name] = value; return this; }, json(value) { payload = value; return this; } };
  handler({}, res);
  expect(headers['Cache-Control']).toBe('no-store');
  expect(payload).toMatchObject({ datasets: [], cooldowns: [] });
});
