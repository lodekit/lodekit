import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("dashboard html", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public", "dashboard", "index.html"),
    "utf8"
  );
  it("links the design system and fetches the app list", () => {
    expect(html).toContain("/_lodekit/design-system.css");
    expect(html).toContain("/api/apps");
  });
  it("subscribes to live updates and has an empty state", () => {
    expect(html).toContain("/api/events");
    expect(html).toContain("Ask Claude to build a tool with Lodekit");
  });
});
