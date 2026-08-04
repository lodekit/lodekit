import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("dashboard renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  // The engine serves a static "building" page until the dashboard build
  // finishes, and that page does not self-refresh — poll with fresh gotos.
  await expect(async () => {
    await page.goto("/_dashboard/");
    await expect(page.getByRole("link", { name: "Lodekit home" })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 120_000 });
  assertClean();
});
