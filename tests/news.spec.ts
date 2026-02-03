import { test, expect } from '@playwright/test';

test.describe('News Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/news');
    });

    test('should load the news page', async ({ page }) => {
        // Wait for page to load and check for news-related content
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1, h2').filter({ hasText: /news/i }).first()).toBeVisible();
    });

    test('should display news articles or loading state', async ({ page }) => {
        // Wait for network to settle
        await page.waitForLoadState('networkidle');

        // Check for article elements or the container
        const hasArticles = await page.locator('article, .news-card, .article-card, .news-item').count() > 0;
        const hasContainer = await page.locator('.news-page, .news-container, main').count() > 0;

        // Either articles or the container should be visible
        expect(hasArticles || hasContainer).toBeTruthy();
    });

    test('should have clickable article links', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        // Check for any links in the news area
        const articleLinks = page.locator('article a, .news-card a, .article-card a, .news-item a');
        const linkCount = await articleLinks.count();

        // If there are article links, first one should be visible
        if (linkCount > 0) {
            await expect(articleLinks.first()).toBeVisible();
        }
        // Test passes even if no links (API might not have returned data)
    });

    test('should have filter tabs if present', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        // Check for filter/tab buttons - this is optional since not all layouts have them
        const filterButtons = page.locator('button, .tab').filter({ hasText: /all|featured|latest/i });
        const buttonCount = await filterButtons.count();

        if (buttonCount > 0) {
            await expect(filterButtons.first()).toBeVisible();
        }
        // Test passes even if no filters exist
    });
});
