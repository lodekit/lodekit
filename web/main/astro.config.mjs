import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // @lodekit/engine ships raw .ts (buildless); bundle it instead of
    // externalizing so the static build can compile marks.ts.
    ssr: { noExternal: ["@lodekit/engine"] },
  },
});
