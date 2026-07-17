import { defineConfig } from "vitest/config";

export default defineConfig({
  // Only this package's tests — build/ holds the deployed platform payload,
  // which carries the engine's own test files.
  test: { include: ["tests/**/*.test.js"] },
});
