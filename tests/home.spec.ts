import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the home page with news, upcoming games, and standings", async ({ page }) => {
    await expect(page).toHaveTitle(/ASU Hockey|Forks Up Pucks/i);
    await expect(page.getByRole("heading", { name: "Trending News" })).toBeVisible();
    // The widget renders either a list of upcoming games or the explicit
    // "no upcoming games" empty state; the error state has neither.
    const widget = page.locator(".upcoming-games-widget").first();
    await expect(widget).toBeVisible();
    await expect(widget.locator("ul li, p.no-games").first()).toBeVisible();
    await expect(page.getByRole("heading", {
      name: /^\d{4}-\d{2} NCHC Standings$/,
    })).toBeVisible();
    await expect(page.locator(".standings-widget-table tbody tr").first()).toBeVisible();
  });

  test("navigates to roster and schedule through the visible navigation", async ({ page }) => {
    const navigationLinks = page.locator("nav a:visible, header a:visible");
    await navigationLinks.filter({ hasText: /^roster$/i }).first().click();
    await expect(page).toHaveURL(/\/roster\/?$/);
    await expect(page.getByRole("heading", { name: /ASU Hockey Roster/i })).toBeVisible();

    await navigationLinks.filter({ hasText: /^schedule$/i }).first().click();
    await expect(page).toHaveURL(/\/schedule\/?$/);
    await expect(page.getByRole("heading", { name: /ASU Hockey Schedule/i })).toBeVisible();
  });
});
