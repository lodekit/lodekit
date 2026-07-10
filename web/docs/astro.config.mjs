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
          label: "Services",
          items: [
            "services/overview",
            "services/db-store",
            "services/kv-store",
            "services/file-store",
            "services/event-store",
            "services/tasks",
            "services/gateways",
            "services/secret-store",
            "services/settings",
            "services/log-store",
          ],
        },
        {
          label: "Reference",
          items: [
            {
              label: "SDK",
              items: [
                "sdk/overview",
                "sdk/db",
                "sdk/kv",
                "sdk/files",
                "sdk/events",
                "sdk/tasks",
                "sdk/gateways",
                "sdk/secrets",
                "sdk/settings",
                "sdk/logs",
              ],
            },
            "reference/mcp-tools",
            "reference/limits-and-retention",
            "reference/file-locations",
            "reference/manifest",
            "reference/glossary",
          ],
        },
        { label: "Changelog", slug: "changelog" },
      ],
    }),
  ],
});
