import { test, expect } from "@playwright/test";
import { watchConsole } from "./helpers";

test("docs splash renders clean", async ({ page }) => {
  const assertClean = watchConsole(page);
  await page.goto("/");
  // Starlight splash hero title "Lodekit" (web/docs/src/content/docs/index.mdx).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "What is Lodekit?" }).first(),
  ).toBeVisible();
  assertClean();
});
