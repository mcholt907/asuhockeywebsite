import { test, expect } from '@playwright/test';

test('news page shows loaded articles and its category controls', async ({ page }) => {
    await page.goto('/news');

    await expect(page.getByRole('heading', { name: 'ASU Hockey News', exact: true })).toBeVisible();
    const articleLink = page.locator('.news-layout a').first();
    await expect(articleLink).toBeVisible();
    await expect(articleLink).toHaveAttribute('href', /^https?:\/\//);
    await expect(page.getByRole('button', { name: 'All News', exact: true })).toBeVisible();
});
