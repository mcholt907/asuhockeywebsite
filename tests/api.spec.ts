import { test, expect, request } from '@playwright/test';

const { FUTURE_SEASONS } = require('../config/scraper-config');

// Configure a request context for the API server directly
const API_BASE_URL = 'http://localhost:5000';

test.describe('API Endpoints', () => {
    let apiContext: Awaited<ReturnType<typeof request.newContext>>;

    test.beforeAll(async () => {
        apiContext = await request.newContext({
            baseURL: API_BASE_URL,
        });
    });

    test.afterAll(async () => {
        await apiContext.dispose();
    });

    test('GET /api/status should report per-dataset freshness', async () => {
        const response = await apiContext.get('/api/status');

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('generatedAt');
        expect(data).toHaveProperty('uptimeSeconds');
        expect(Array.isArray(data.datasets)).toBeTruthy();
        expect(Array.isArray(data.cooldowns)).toBeTruthy();

        const names = data.datasets.map((d: { name: string }) => d.name);
        for (const expected of ['news', 'schedule', 'stats', 'standings', 'roster', 'transfers', 'alumni']) {
            expect(names).toContain(expected);
        }
        for (const dataset of data.datasets) {
            expect(['ok', 'stale', 'missing', 'unknown']).toContain(dataset.status);
        }
    });

    test('GET /api/roster should return player data', async () => {
        const response = await apiContext.get('/api/roster');

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/json');

        const data = await response.json();
        expect(Array.isArray(data)).toBeTruthy();
        expect(data.length).toBeGreaterThan(0);

        // Check first player has expected fields
        const player = data[0];
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('number');
    });

    test('GET /api/news should return articles', async () => {
        const response = await apiContext.get('/api/news');

        expect(response.status()).toBe(200);

        const data = await response.json();
        // News API returns { data: [...], source, timestamp }
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBeTruthy();
    });

    test('GET /api/schedule should return games', async () => {
        const response = await apiContext.get('/api/schedule');

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBeTruthy();
    });

    test('GET /api/stats should return stats data', async () => {
        const response = await apiContext.get('/api/stats');

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(Array.isArray(data.skaters)).toBeTruthy();
        expect(Array.isArray(data.goalies)).toBeTruthy();
    });

    test("GET /api/standings should return a season-tagged played table", async () => {
        const response = await apiContext.get("/api/standings");
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.data)).toBeTruthy();
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.season).toMatch(/^\d{4}-\d{4}$/);
        expect(typeof body.isPriorSeason).toBe("boolean");
        expect(body.data.some((team: { overallRecord: string }) =>
            team.overallRecord !== "0-0-0",
        )).toBeTruthy();
    });

    test('GET /api/recruits should return recruiting data', async () => {
        const response = await apiContext.get('/api/recruits');

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(Object.keys(data).sort()).toEqual([...FUTURE_SEASONS].sort());
        for (const season of FUTURE_SEASONS) {
            expect(Array.isArray(data[season])).toBeTruthy();
        }
        expect(FUTURE_SEASONS.some((season: string) => data[season].length > 0)).toBeTruthy();
    });

    test('GET /api/alumni should return alumni data', async () => {
        const response = await apiContext.get('/api/alumni');

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('skaters');
        expect(data).toHaveProperty('goalies');
    });
});
