import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should load the home page', async ({ page }) => {
        // Check that the page title contains expected text
        await expect(page).toHaveTitle(/ASU Hockey|Forks Up Pucks/i);
    });

    test('should display navigation links', async ({ page }) => {
        // Check main navigation links exist (use first() for multiple matches)
        await expect(page.locator('nav a, header a').filter({ hasText: /roster/i }).first()).toBeVisible();
        await expect(page.locator('nav a, header a').filter({ hasText: /schedule/i }).first()).toBeVisible();
    });

    test('should navigate to roster page', async ({ page }) => {
        await page.locator('nav a, header a').filter({ hasText: /roster/i }).first().click();
        await expect(page).toHaveURL(/.*roster/);
    });

    test('should navigate to schedule page', async ({ page }) => {
        await page.locator('nav a, header a').filter({ hasText: /schedule/i }).first().click();
        await expect(page).toHaveURL(/.*schedule/);
    });

    test('should display news section', async ({ page }) => {
        // Check for the Latest News section
        const newsSection = page.locator('text=Latest News').first();
        await expect(newsSection).toBeVisible();
    });

    test('should display upcoming games section', async ({ page }) => {
        // Check for the Upcoming Games section
        const gamesSection = page.locator('text=Upcoming Games').first();
        await expect(gamesSection).toBeVisible();
    });
});
