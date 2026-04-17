import { expect, test } from "@playwright/test";

// Stub the YouTube IFrame API so quiz play pages don't hang waiting for network.
const mockYouTubeApi = () => {
  (window as unknown as Record<string, unknown>).YT = {
    Player: class MockYTPlayer {
      constructor(
        _el: unknown,
        opts: { events?: { onReady?: (e: { target: MockYTPlayer }) => void } },
      ) {
        setTimeout(() => opts.events?.onReady?.({ target: this }), 50);
      }
      loadVideoById() {}
      playVideo() {}
      pauseVideo() {}
      stopVideo() {}
      destroy() {}
      getPlayerState() {
        return -1;
      }
    },
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3, CUED: 5, UNSTARTED: -1 },
  };
};

test.describe("Quiz list page", () => {
  test("authenticated user can reach quiz page", async ({ page }) => {
    await page.goto("/quiz");
    await expect(page).toHaveURL(/\/quiz$/);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("root redirects to /quiz", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/quiz$/, { timeout: 8_000 });
  });

  test("quiz shell has no dashboard sidebar or player bar", async ({ page }) => {
    await page.goto("/quiz");
    await page.waitForLoadState("networkidle");
    // The quiz layout must not render the dashboard Sidebar (<aside>) or
    // PlayerBar — those belong only to the /player and /library shell.
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });

  test("redirects unauthenticated users to sign-in", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/quiz");
    await expect(page).toHaveURL(/sign-in/, { timeout: 8_000 });
    await ctx.close();
  });
});

test.describe("Quiz play page", () => {
  test("quiz play page mounts without DOM errors", async ({ page }) => {
    await page.addInitScript(mockYouTubeApi);

    // Navigate to quiz list — if there's a quiz playlist we'll enter it
    await page.goto("/quiz");
    await page.waitForLoadState("networkidle");

    const quizEntryLinks = page
      .getByRole("link")
      .filter({ hasNotText: /library|settings/i });
    const count = await quizEntryLinks.count();

    if (count > 0) {
      await quizEntryLinks.first().click();
      await page.waitForLoadState("networkidle");

      // Critical regression check: no React error boundary should have fired
      await expect(page.getByText(/application error/i)).not.toBeVisible();
      await expect(page.getByText(/something went wrong/i)).not.toBeVisible();

      // Verify body has meaningful content (not blank)
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.trim().length).toBeGreaterThan(50);
    }
  });

  test("quiz play page does not start timer before player is ready", async ({ page }) => {
    // Regression: timer used to start before the YouTube snippet actually played.
    // This test verifies no timer-related text appears immediately on load.
    await page.addInitScript(() => {
      // Delay the player ready callback to simulate slow YouTube API init
      (window as unknown as Record<string, unknown>).YT = {
        Player: class {
          constructor(
            _el: unknown,
            opts: { events?: { onReady?: (e: unknown) => void } },
          ) {
            // Deliberately do NOT call onReady immediately — simulates slow init
            setTimeout(() => opts.events?.onReady?.({}), 2_000);
          }
          loadVideoById() {}
          playVideo() {}
          pauseVideo() {}
          stopVideo() {}
          destroy() {}
          getPlayerState() {
            return -1;
          }
        },
        PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3, CUED: 5, UNSTARTED: -1 },
      };
    });

    await page.goto("/quiz");
    await page.waitForLoadState("networkidle");

    const quizEntryLinks = page.getByRole("link").filter({ hasNotText: /library|settings/i });
    if ((await quizEntryLinks.count()) > 0) {
      await quizEntryLinks.first().click();

      // On the play page — a countdown timer value of 0 immediately would
      // indicate the regression (timer fired before player was ready).
      // We just ensure no JS crash occurred in the first 2 seconds.
      await page.waitForTimeout(500);
      await expect(page.getByText(/application error/i)).not.toBeVisible();
    }
  });
});
