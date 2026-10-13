import { test, expect } from '@playwright/test';

test('roster page shows player rows grouped by position', async ({ page }) => {
    await page.goto('/roster');

    await expect(page.getByRole('heading', { name: /ASU Hockey Roster/i })).toBeVisible();
    await expect(page.locator('.roster-table tbody tr').first()).toBeVisible();
    await expect(page.locator('.position-group').getByRole('heading').first()).toHaveText(
        /^(Goaltenders|Defensemen|Forwards)$/,
    );
});
