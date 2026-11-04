const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

// Execute the real CLI with controlled scraper and filesystem dependencies.
async function runRefresh({ liveData, liveError } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer-refresh-'));
  const fallback = path.join(directory, 'data/asu_transfers_fallback.json');
  fs.mkdirSync(path.dirname(fallback));
  fs.writeFileSync(fallback, 'previous snapshot');
  const scraper = {
    scrapeTransfersLive: async () => { if (liveError) throw liveError; return liveData; },
    scrapeTransferData: async () => ({ incoming: [{ playerName: 'Cached' }], outgoing: [] }),
  };
  let exitCode = 0;
  const code = fs.readFileSync(path.resolve(__dirname, '../scripts/refresh-transfers.js'), 'utf8');
  try {
    await vm.runInNewContext(code, {
      __dirname: path.join(directory, 'scripts'),
      console: { log() {}, error() {} },
      process: { env: {}, exit(code) { exitCode = code; throw new Error('exit'); } },
      require(name) { return name === '../server/scrapers/transfers' ? scraper : require(name); },
    }).catch(() => {});
    return { exitCode, contents: fs.readFileSync(fallback, 'utf8') };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('failed live transfer scrape cannot publish recovered cache as a refresh', async () => {
  expect(await runRefresh({ liveError: new Error('upstream blocked') })).toEqual({ exitCode: 1, contents: 'previous snapshot' });
});

test('successful live transfer scrape publishes the source timestamp', async () => {
  const liveData = { incoming: [{ playerName: 'New' }], outgoing: [], lastUpdated: '2026-11-04T15:33:33Z' };
  const result = await runRefresh({ liveData });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.contents)).toEqual(liveData);
});
