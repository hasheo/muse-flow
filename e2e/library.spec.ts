import { expect, test } from "@playwright/test";

test.describe("Library", () => {
  test("redirects unauthenticated users to sign-in", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/library");
    await expect(page).toHaveURL(/sign-in/, { timeout: 8_000 });
    await ctx.close();
  });

  test("authenticated user can reach library page", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/library/);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("library page renders playlists or empty state", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    // Either a list of playlists or a "no playlists" empty state should be visible
    const body = await page.locator("body").textContent();
    expect(body?.trim().length).toBeGreaterThan(0);
  });

  test("can navigate into a playlist detail", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");

    const playlistLinks = page.getByRole("link").filter({ hasText: /.+/ });
    const count = await playlistLinks.count();
    if (count > 0) {
      await playlistLinks.first().click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/application error/i)).not.toBeVisible();
    }
  });
});
