import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://lodekit.com",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // @lodekit/ui ships raw .ts (buildless); bundle it instead of
    // externalizing so the static build can compile marks.ts.
    ssr: { noExternal: ["@lodekit/ui"] },
  },
});
