import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("dashboard renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  // The engine serves a static "building" page until the dashboard build
  // finishes, and that page does not self-refresh — poll with fresh gotos.
  await expect(async () => {
    await page.goto("/_dashboard/");
    // Two home links since the app shell: the rail badge and the header
    // wordmark — assert the first visible one.
    await expect(page.getByRole("link", { name: "Lodekit home" }).first()).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 120_000 });
  assertClean();
});
