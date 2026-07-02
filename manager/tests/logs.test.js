import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openLogStream } from "../src/logs.js";

describe("openLogStream", () => {
  it("rotates the previous log to .old and opens a fresh stream", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-logs-"));
    fs.writeFileSync(path.join(dir, "runtime.log"), "previous launch");
    const stream = openLogStream(dir, "runtime.log");
    stream.write("this launch");
    await new Promise((r) => stream.end(r));
    expect(fs.readFileSync(path.join(dir, "runtime.log.old"), "utf8")).toBe("previous launch");
    expect(fs.readFileSync(path.join(dir, "runtime.log"), "utf8")).toBe("this launch");
  });

  it("creates the log directory when missing", async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-logs-")), "nested");
    const stream = openLogStream(dir, "manager.log");
    await new Promise((r) => stream.end(r));
    expect(fs.existsSync(path.join(dir, "manager.log"))).toBe(true);
  });
});
