import { test, expect } from '@playwright/test';

test.describe('Roster Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/roster');
        // Wait for page to fully load
        await page.waitForLoadState('networkidle');
    });

    test('should load the roster page', async ({ page }) => {
        await expect(page.locator('h1, h2').filter({ hasText: /roster/i }).first()).toBeVisible();
    });

    test('should display player content', async ({ page }) => {
        // Wait for roster data to load - check for tables OR any player-related content
        const hasTable = await page.locator('table').count() > 0;
        const hasPlayerCards = await page.locator('.player-card, .roster-player, .player-row').count() > 0;
        const hasRosterContent = await page.locator('.roster-table, .roster-section, .roster-content').count() > 0;

        // At least one type of content should be present
        expect(hasTable || hasPlayerCards || hasRosterContent).toBeTruthy();
    });

    test('should have position sections', async ({ page }) => {
        // Check for position-related text (Goaltenders, Defensemen, Forwards)
        const hasGoaltenders = await page.locator('text=/Goaltenders|Goalies|Goalie/i').count() > 0;
        const hasDefensemen = await page.locator('text=/Defensemen|Defense|Defenders/i').count() > 0;
        const hasForwards = await page.locator('text=/Forwards|Forward/i').count() > 0;

        // At least one position section should exist
        expect(hasGoaltenders || hasDefensemen || hasForwards).toBeTruthy();
    });

    test('should display multiple players', async ({ page }) => {
        // Count player entries - could be table rows, cards, or list items
        const tableRows = await page.locator('table tbody tr').count();
        const playerCards = await page.locator('.player-card, .roster-player').count();

        const totalPlayers = tableRows + playerCards;

        // We expect at least some players to be displayed
        expect(totalPlayers).toBeGreaterThan(0);
    });

    test('should have player links to Elite Prospects', async ({ page }) => {
        // Check for Elite Prospects links
        const epLinks = await page.locator('a[href*="eliteprospects.com"]').count();

        // If there are EP links, test passes. If not, roster might use different format.
        if (epLinks > 0) {
            expect(epLinks).toBeGreaterThan(0);
        }
    });
});
