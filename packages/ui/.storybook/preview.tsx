import React from "react";
import type { Preview } from "@storybook/react-vite";
import "../theme.css";

const preview: Preview = {
  initialGlobals: { themeApp: "" },
  decorators: [
    (Story, ctx) => {
      const link = document.getElementById("lodekit-theme") as HTMLLinkElement | null;
      if (link) {
        const app = typeof ctx.globals.themeApp === "string" ? ctx.globals.themeApp : "";
        const href = app ? `theme.css?app=${encodeURIComponent(app)}` : "theme.css";
        if (link.getAttribute("href") !== href) link.setAttribute("href", href);
      }
      return <Story />;
    },
  ],
};
export default preview;
