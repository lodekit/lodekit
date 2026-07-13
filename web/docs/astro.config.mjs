// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";

export default defineConfig({
  site: "https://docs.lodekit.com",
  integrations: [
    starlight({
      title: "Lodekit",
      customCss: ["./src/styles/custom.css"],
      plugins: [starlightLinksValidator()],
      sidebar: [
        {
          label: "Start here",
          items: [
            "start/what-is-lodekit",
            "start/how-lodekit-works",
            "start/install",
            "start/connect-your-agent",
            "start/your-first-app",
          ],
        },
        {
          label: "Using Lodekit",
          items: [
            "guide/dashboard",
            "guide/your-lodekit-folder",
            "guide/manager",
            "guide/theming",
          ],
        },
        {
          label: "Services",
          items: [
            "services/overview",
            "services/db-store",
            "services/kv-store",
            "services/file-store",
            "services/event-store",
            "services/tasks",
            "services/log-store",
            "services/settings",
            "services/secret-store",
            "services/gateways",
          ],
        },
        {
          label: "Building apps",
          items: [
            "build/the-stack",
            "build/app-anatomy",
            "build/data-and-server-functions",
            "build/live-updates",
            "build/using-the-ui-library",
          ],
        },
        {
          label: "SDK reference",
          items: [
            "sdk/overview",
            "sdk/kv",
            "sdk/db",
            "sdk/files",
            "sdk/events",
            "sdk/tasks",
            "sdk/settings",
            "sdk/secrets",
            "sdk/logs",
            "sdk/gateways",
          ],
        },
        {
          label: "Reference",
          items: [
            "reference/mcp-tools",
            "reference/limits-and-retention",
            "reference/file-locations",
            "reference/manifest",
            "reference/glossary",
          ],
        },
      ],
    }),
  ],
});
