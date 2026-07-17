import { describe, expect, it } from "vitest";
import path from "node:path";
import { getPaths } from "../src/paths.js";

const HOME = "/Users/someone";

describe("getPaths", () => {
  it("packaged mode targets the person's real dirs and the bundled platform", () => {
    const p = getPaths({
      packaged: true,
      homedir: HOME,
      resourcesPath: "/Applications/Lodekit.app/Contents/Resources",
      repoRoot: "/ignored",
    });
    expect(p.mode).toBe("default");
    expect(p.lodekitRoot).toBe(path.join(HOME, "Documents", "Lodekit"));
    expect(p.cacheDir).toBe(path.join(HOME, "Library", "Caches", "Lodekit"));
    expect(p.stateDir).toBe(path.join(HOME, "Library", "Application Support", "Lodekit"));
    expect(p.logsDir).toBe(path.join(HOME, "Library", "Logs", "Lodekit"));
    expect(p.pidFile).toBe(
      path.join(HOME, "Library", "Application Support", "Lodekit", "runtime.pid")
    );
    expect(p.nodeBin).toBe("/Applications/Lodekit.app/Contents/Resources/node/bin/node");
    expect(p.engineDir).toBe("/Applications/Lodekit.app/Contents/Resources/platform/engine");
    expect(p.engineEntry).toBe(
      "/Applications/Lodekit.app/Contents/Resources/platform/engine/src/index.ts"
    );
    expect(p.mcpEntry).toBe("/Applications/Lodekit.app/Contents/Resources/platform/mcp/index.ts");
    expect(p.showcaseAppsDir).toBe("/Applications/Lodekit.app/Contents/Resources/platform/root/apps");
    expect(p.showcaseGatewaysDir).toBe("/Applications/Lodekit.app/Contents/Resources/platform/root/gateways");
    expect(p.port).toBe(7777);
    expect(p.dashboardUrl).toBe("http://lodekit.localhost:7777");
  });

  it("dev mode runs the workspace engine against root/ on the system node", () => {
    const p = getPaths({ packaged: false, homedir: HOME, resourcesPath: "/ignored", repoRoot: "/repo" });
    expect(p.mode).toBe("dev");
    expect(p.lodekitRoot).toBe("/repo/root");
    expect(p.cacheDir).toBe("/repo/.cache");
    expect(p.stateDir).toBe("/repo/.cache/state");
    expect(p.nodeBin).toBe("node");
    expect(p.engineDir).toBe("/repo/packages/engine");
    expect(p.engineEntry).toBe("/repo/packages/engine/src/index.ts");
    expect(p.showcaseAppsDir).toBe(null);
    expect(p.showcaseGatewaysDir).toBe(null);
    // Logs and pid file use the same macOS locations in both modes.
    expect(p.logsDir).toBe(path.join(HOME, "Library", "Logs", "Lodekit"));
    expect(p.pidFile).toBe(
      path.join(HOME, "Library", "Application Support", "Lodekit", "runtime.pid")
    );
  });
});
