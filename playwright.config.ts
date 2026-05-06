import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Test Configuration for ASU Hockey Website
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    // Test directory
    testDir: './tests',

    // Run tests in parallel
    fullyParallel: true,

    // Fail the build on CI if you accidentally left test.only in the source code
    forbidOnly: !!process.env.CI,

    // Retry on CI only
    retries: process.env.CI ? 2 : 0,

    // Reporter configuration
    reporter: [
        ['html', { open: 'never' }],
        ['list']
    ],

    // Shared settings for all tests
    use: {
        // Base URL for all tests
        baseURL: 'http://localhost:3000',

        // Collect trace on first retry
        trace: 'on-first-retry',

        // Screenshot on failure
        screenshot: 'only-on-failure',

        // Video on failure
        video: 'on-first-retry',
    },

    // Configure projects for different browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },

        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },

        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],

    // Web server configuration - auto-start servers before tests.
    // IS_PRERENDER=true tells the EP-backed scrapers (alumni, transfers) to
    // serve bundled JSON from data/ instead of hitting Elite Prospects live.
    // Without this, every Playwright run that exercises /api/alumni or
    // /api/transfers eats into the 24h-cooldown budget on EP and can lock
    // out the next legitimate `npm run refresh-*`. Note: this env only
    // applies when Playwright spawns the server itself; if you're reusing
    // an already-running `node server.js`, set IS_PRERENDER=true on that
    // process too, or it'll still hit EP.
    webServer: [
        {
            command: 'node server.js',
            port: 5000,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
            env: { IS_PRERENDER: 'true' },
        },
        {
            command: 'npm start',
            port: 3000,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
        },
    ],

    // Global timeout for each test
    timeout: 30 * 1000,

    // Expect timeout - generous for API data loading
    expect: {
        timeout: 15000
    },
});
