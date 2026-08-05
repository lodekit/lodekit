import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("landing page renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  await page.goto("/");
  // The hero headline (web/main/src/components/Hero.astro).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  assertClean();
});
