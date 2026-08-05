import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dateStamp, openDailyLogStream, stampLines, sweepLogs } from "../src/logs.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lodekit-logs-"));
const end = (s) => new Promise((r) => s.end(r));

describe("dated log files", () => {
  it("writes to <base>-YYYYMMDD.log and appends across launches (crash-loop evidence survives)", async () => {
    const dir = tmp();
    const now = () => new Date("2026-07-07T10:00:00Z");
    const first = openDailyLogStream(dir, "runtime", { now });
    first.write("launch one\n");
    await end(first);
    const second = openDailyLogStream(dir, "runtime", { now });
    second.write("launch two\n");
    await end(second);
    const file = path.join(dir, `runtime-${dateStamp(now())}.log`);
    expect(fs.readFileSync(file, "utf8")).toBe("launch one\nlaunch two\n");
  });

  it("creates log files user-only (0600)", async () => {
    const dir = tmp();
    const stream = openDailyLogStream(dir, "runtime", { now: () => new Date("2026-07-07T10:00:00Z") });
    stream.write("hello\n");
    await end(stream);
    expect(fs.statSync(path.join(dir, "runtime-20260707.log")).mode & 0o777).toBe(0o600);
  });

  it("creates the log directory user-only (0700)", async () => {
    const dir = path.join(tmp(), "nested");
    const stream = openDailyLogStream(dir, "manager", { now: () => new Date("2026-07-07T10:00:00Z") });
    await end(stream);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("rolls to a new file when the date changes mid-run", async () => {
    const dir = tmp();
    let today = new Date("2026-07-07T23:59:00Z");
    const stream = openDailyLogStream(dir, "runtime", { now: () => today });
    stream.write("before midnight\n");
    today = new Date("2026-07-08T00:01:00Z");
    stream.write("after midnight\n");
    await end(stream);
    expect(fs.readFileSync(path.join(dir, "runtime-20260707.log"), "utf8")).toBe("before midnight\n");
    expect(fs.readFileSync(path.join(dir, "runtime-20260708.log"), "utf8")).toBe("after midnight\n");
  });

  it("sweeps dated files older than 7 days and the legacy flat names", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "runtime-20260601.log"), "ancient");
    fs.writeFileSync(path.join(dir, "runtime-20260705.log"), "recent");
    fs.writeFileSync(path.join(dir, "runtime.log"), "legacy");
    fs.writeFileSync(path.join(dir, "runtime.log.old"), "legacy old");
    fs.writeFileSync(path.join(dir, "manager.log"), "legacy manager");
    fs.writeFileSync(path.join(dir, "unrelated.txt"), "keep me");
    sweepLogs(dir, { now: () => new Date("2026-07-07T12:00:00Z") });
    expect(fs.readdirSync(dir).sort()).toEqual(["runtime-20260705.log", "unrelated.txt"]);
  });

  it("creates the log directory when missing", async () => {
    const dir = path.join(tmp(), "nested");
    const stream = openDailyLogStream(dir, "manager", { now: () => new Date("2026-07-07T10:00:00Z") });
    await end(stream);
    expect(fs.existsSync(path.join(dir, "manager-20260707.log"))).toBe(true);
  });
});

describe("stampLines", () => {
  const collect = (stream) =>
    new Promise((resolve) => {
      let out = "";
      stream.on("data", (c) => (out += c.toString()));
      stream.on("end", () => resolve(out));
    });

  it("prefixes each complete line with an ISO timestamp", async () => {
    const now = () => new Date("2026-07-07T10:00:00.000Z");
    const s = stampLines({ now });
    const done = collect(s);
    s.write("Lodekit running at http://lodekit.localhost:7777\n[build:notes] build failed\n");
    s.end();
    expect(await done).toBe(
      "2026-07-07T10:00:00.000Z Lodekit running at http://lodekit.localhost:7777\n" +
        "2026-07-07T10:00:00.000Z [build:notes] build failed\n"
    );
  });

  it("buffers a line split across chunks and stamps it once", async () => {
    const now = () => new Date("2026-07-07T10:00:00.000Z");
    const s = stampLines({ now });
    const done = collect(s);
    s.write("partial ");
    s.write("line\nnext");
    s.end(); // trailing partial flushed with a stamp
    expect(await done).toBe(
      "2026-07-07T10:00:00.000Z partial line\n2026-07-07T10:00:00.000Z next\n"
    );
  });
});
