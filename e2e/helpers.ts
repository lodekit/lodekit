import { expect, type Page } from "@playwright/test";

// Known-benign console noise. Empty on purpose — every addition is a reviewed line.
const ALLOWED: RegExp[] = [];

/**
 * Attach console/pageerror listeners. Call the returned function at the end of
 * the test to assert the page stayed clean (spec: zero pageerror, zero console.error).
 */
export function watchConsole(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ALLOWED.some((re) => re.test(msg.text()))) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return () => expect(errors, "page console must stay clean").toEqual([]);
}
