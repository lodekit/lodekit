import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStart } from "../src/build.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");

let appDir: string, outDir: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

beforeAll(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskbuild-app-"));
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-taskbuild-out-"));
  copyDir(fixture, appDir);
  fs.writeFileSync(
    path.join(appDir, "src", "tasks.ts"),
    `import { task, kv } from "@lodekit/sdk";

export const recordPing = task({ retries: 0, run: async (p: { key: string }) => {
  await kv.set(p.key, "ran");
} });

export const explode = task({ run: async () => { throw new Error("explode!"); } });
`
  );
});
afterAll(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe("buildStart tasks entry", () => {
  it("emits an importable server/tasks.js with marker-tagged exports", async () => {
    await buildStart({ rootDir: appDir, outDir, urlBase: "/tasky", appId: "tasky" });
    const tasksJs = path.join(outDir, "server", "tasks.js");
    expect(fs.existsSync(tasksJs)).toBe(true);
    expect(fs.existsSync(path.join(outDir, "server", "server.js"))).toBe(true); // main build intact
    const mod = await import(tasksJs);
    expect(mod.recordPing.__lodekitTask).toBe(true);
    expect(mod.recordPing.retries).toBe(0);
    expect(typeof mod.recordPing.run).toBe("function");
    expect(mod.explode.__lodekitTask).toBe(true);
  }, 120_000);
});
