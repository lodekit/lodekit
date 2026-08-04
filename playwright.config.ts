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
      use: { baseURL: "http://localhost:4321" },
    },
    {
      name: "web-docs",
      testMatch: /web-docs\.spec\.ts/,
      use: { baseURL: "http://localhost:4322" },
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
      command: "pnpm --filter @lodekit/web-main dev -- --port 4321",
      url: "http://localhost:4321",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @lodekit/web-docs dev -- --port 4322",
      url: "http://localhost:4322",
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
