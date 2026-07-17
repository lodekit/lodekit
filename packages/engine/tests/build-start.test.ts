import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let out: string;

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-start-build-"));
});
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

describe("buildStart", () => {
  it("builds client assets and a self-contained server bundle", async () => {
    await buildStart({ rootDir: fixture, outDir: out, urlBase: "/start-app", appId: "start-app" });

    const serverEntry = path.join(out, "server", "server.js");
    expect(fs.existsSync(serverEntry)).toBe(true);
    expect(fs.readdirSync(path.join(out, "client"), { recursive: true }).length).toBeGreaterThan(0);

    // Self-contained: no bare imports left (spec §3 noExternal decision).
    const src = fs.readFileSync(serverEntry, "utf8");
    expect(src).not.toMatch(/^import .* from ["'](react|@tanstack|seroval|h3)/m);

    // Default export is a fetch handler (spike-verified shape).
    const mod = await import(serverEntry);
    expect(typeof mod.default?.fetch).toBe("function");
  }, 120_000);
});
