import { test, expect, request } from '@playwright/test';

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

    test('GET /api/roster should return player data', async () => {
        const response = await apiContext.get('/api/roster');

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

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

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        // News API returns { data: [...], source, timestamp }
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBeTruthy();
    });

    test('GET /api/schedule should return games', async () => {
        const response = await apiContext.get('/api/schedule');

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBeTruthy();
    });

    test('GET /api/stats should return stats data', async () => {
        const response = await apiContext.get('/api/stats');

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toBeDefined();
    });

    test('GET /api/recruits should return recruiting data', async () => {
        const response = await apiContext.get('/api/recruits');

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toBeDefined();
    });

    test('GET /api/alumni should return alumni data', async () => {
        const response = await apiContext.get('/api/alumni');

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('skaters');
        expect(data).toHaveProperty('goalies');
    });

    test('API responses should have valid JSON content-type', async () => {
        const response = await apiContext.get('/api/roster');

        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
    });
});
