import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/components/*.stories.tsx"],
  async viteFinal(cfg) {
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    // Stories import "@lodekit/ui" and theme.css imports
    // "@lodekit/ui/theme-overrides.css" — both resolve into this package.
    const existing = cfg.resolve?.alias;
    const added = [{ find: "@lodekit/ui", replacement: uiRoot }];
    cfg.resolve = {
      ...cfg.resolve,
      alias: Array.isArray(existing)
        ? [...added, ...existing]
        : existing
          ? [...added, ...Object.entries(existing).map(([find, replacement]) => ({ find, replacement: replacement as string }))]
          : added,
    };
    return cfg;
  },
};
export default config;
