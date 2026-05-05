// Tests for src/scripts/caching-system.js (server-side Jest)
// Run: npx jest --config jest.server.config.js
//
// Strategy: point CACHE_DIR at an os.tmpdir() mkdtemp before requiring the
// module (the module reads process.env.CACHE_DIR at load time). Each test
// uses real filesystem I/O against an isolated temp dir.

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  metrics: { count: jest.fn() },
}));

let tmpDir;
let cachingSystem;
let Sentry;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-cache-test-'));
  process.env.CACHE_DIR = tmpDir;
  // Reset Jest's module registry so caching-system re-reads CACHE_DIR fresh.
  // Re-bind Sentry from the same registry so the mock instance the test
  // asserts on is the same one caching-system calls into.
  jest.resetModules();
  jest.clearAllMocks();
  Sentry = require('@sentry/node');
  cachingSystem = require('../src/scripts/caching-system');
});

afterEach(() => {
  delete process.env.CACHE_DIR;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('saveToCache', () => {
  test('writes data with timestamp + duration wrapper', () => {
    cachingSystem.saveToCache({ a: 1, b: 'two' }, 'test.json', 60000);

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'test.json'), 'utf8'));
    expect(written.data).toEqual({ a: 1, b: 'two' });
    expect(written.cacheDuration).toBe(60000);
    expect(typeof written.timestamp).toBe('string');
    expect(Number.isFinite(new Date(written.timestamp).getTime())).toBe(true);
  });

  test('uses default 24h duration when none supplied', () => {
    cachingSystem.saveToCache({ x: 1 }, 'default.json');

    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'default.json'), 'utf8'));
    expect(written.cacheDuration).toBe(24 * 60 * 60 * 1000);
  });

  test('creates the cache directory if missing', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    expect(fs.existsSync(tmpDir)).toBe(false);

    cachingSystem.saveToCache({ ok: true }, 'mkdir.json');

    expect(fs.existsSync(path.join(tmpDir, 'mkdir.json'))).toBe(true);
  });

  test('atomic-write: no .tmp file remains after a successful write', () => {
    cachingSystem.saveToCache({ a: 1 }, 'atomic.json');

    const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    expect(leftovers).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'atomic.json'))).toBe(true);
  });

  test('cleans up tmp file and reports to Sentry when rename fails', () => {
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('boom');
    });

    cachingSystem.saveToCache({ a: 1 }, 'rename-fail.json');

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][1]).toEqual({
      tags: { component: 'caching-system', filename: 'rename-fail.json' },
    });
    // Final file must NOT exist (rename failed)
    expect(fs.existsSync(path.join(tmpDir, 'rename-fail.json'))).toBe(false);
    // Tmp file must be cleaned up
    const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    expect(leftovers).toEqual([]);

    renameSpy.mockRestore();
  });

  test('returns early without writing when filename is missing', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    cachingSystem.saveToCache({ x: 1 }, undefined);

    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('getFromCache', () => {
  test('returns null when the cache file does not exist', () => {
    expect(cachingSystem.getFromCache('missing.json')).toBeNull();
  });

  test('returns null when the cache file is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'empty.json'), '');
    expect(cachingSystem.getFromCache('empty.json')).toBeNull();
  });

  test('returns data when cache is fresh', () => {
    cachingSystem.saveToCache({ greeting: 'hi' }, 'fresh.json', 60000);
    expect(cachingSystem.getFromCache('fresh.json')).toEqual({ greeting: 'hi' });
  });

  test('returns null when cache is expired (default behavior)', () => {
    const expired = {
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      data: { stale: true },
      cacheDuration: 60 * 1000, // 1 min — already past
    };
    fs.writeFileSync(path.join(tmpDir, 'expired.json'), JSON.stringify(expired));

    expect(cachingSystem.getFromCache('expired.json')).toBeNull();
    // Crucially: we DO NOT delete the expired file — SWR needs to serve it later.
    expect(fs.existsSync(path.join(tmpDir, 'expired.json'))).toBe(true);
  });

  test('returns expired data when ignoreExpiration=true', () => {
    const expired = {
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      data: { stale: 'value' },
      cacheDuration: 60 * 1000,
    };
    fs.writeFileSync(path.join(tmpDir, 'expired.json'), JSON.stringify(expired));

    expect(cachingSystem.getFromCache('expired.json', true)).toEqual({ stale: 'value' });
  });

  test('honors stored cacheDuration over the default', () => {
    // Wrote 23 hours ago with a 22-hour duration → expired.
    const aging = {
      timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      data: { x: 1 },
      cacheDuration: 22 * 60 * 60 * 1000,
    };
    fs.writeFileSync(path.join(tmpDir, 'aging.json'), JSON.stringify(aging));
    expect(cachingSystem.getFromCache('aging.json')).toBeNull();
  });

  test('deletes a corrupted cache file and returns null', () => {
    const file = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(file, '{ not valid json');

    expect(cachingSystem.getFromCache('corrupt.json')).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  test('returns null without throwing when filename is missing', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(cachingSystem.getFromCache(undefined)).toBeNull();
    errSpy.mockRestore();
  });
});
