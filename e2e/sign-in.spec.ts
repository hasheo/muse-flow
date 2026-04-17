import { expect, test } from "@playwright/test";

// These tests run without stored auth — they verify the public sign-in page.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Sign-in page", () => {
  test("renders sign-in form for unauthenticated users", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("shows error message for invalid credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByPlaceholder("Email").fill("wrong@example.com");
    await page.getByPlaceholder("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Invalid credentials")).toBeVisible({ timeout: 8_000 });
  });

  test("shows client-side validation for malformed email", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByPlaceholder("Email").fill("not-an-email");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/invalid email/i)).toBeVisible({ timeout: 3_000 });
  });

  test("redirects to /quiz on successful sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByPlaceholder("Email").fill(process.env.E2E_EMAIL ?? "demo@music.dev");
    await page.getByPlaceholder("Password").fill(process.env.E2E_PASSWORD ?? "password123");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/quiz/, { timeout: 10_000 });
  });
});
