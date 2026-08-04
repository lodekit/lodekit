import { defineConfig } from "@playwright/test";

const reuse = !process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 150_000, // dashboard's first hit may wait out a cold dashboard build
  reporter: "list",
  use: { screenshot: "only-on-failure" },
  projects: [
    {
      name: "dashboard",
      testMatch: /dashboard\.spec\.ts/,
      use: { baseURL: "http://lodekit.localhost:7777" },
    },
    {
      name: "web-main",
      testMatch: /web-main\.spec\.ts/,
      use: { baseURL: "http://localhost:4381" },
    },
    {
      name: "web-docs",
      testMatch: /web-docs\.spec\.ts/,
      use: { baseURL: "http://localhost:4382" },
    },
  ],
  webServer: [
    {
      // Engine against the checked-in root, same as `pnpm dev`.
      command: "pnpm dev",
      // Health-check via 127.0.0.1 (deterministic in Node); the browser
      // itself uses lodekit.localhost, which Chromium resolves natively.
      // The /_dashboard/ building page answers 200 immediately; the spec
      // polls until the real shell renders.
      url: "http://127.0.0.1:7777/_dashboard/",
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
    {
      // ASTRO_DEV_BACKGROUND=0: Astro 7 auto-daemonizes `astro dev` when it
      // detects an AI-agent environment, which detaches the process Playwright
      // supervises ("exited early"). The env var is Astro's documented opt-out.
      command: "ASTRO_DEV_BACKGROUND=0 pnpm exec astro dev --port 4381",
      cwd: "web/main",
      url: "http://localhost:4381",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: "ASTRO_DEV_BACKGROUND=0 pnpm exec astro dev --port 4382",
      cwd: "web/docs",
      url: "http://localhost:4382",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
