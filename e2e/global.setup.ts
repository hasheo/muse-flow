import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

const authFile = path.join(import.meta.dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL ?? "demo@music.dev";
  const password = process.env.E2E_PASSWORD ?? "password123";

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/sign-in");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});
