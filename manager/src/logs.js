"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Transform, Writable } = require("node:stream");

const DEFAULT_DAYS = 7;

// UTC date stamp — a stable, sortable YYYYMMDD used in filenames and sweep compares.
function dateStamp(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Deletes dated log files older than `days`, plus the pre-dated-scheme legacy
// names (one-time cleanup; logging spec §7). Lexicographic compare works because
// the stamp is fixed-width YYYYMMDD.
function sweepLogs(logsDir, { days = DEFAULT_DAYS, now = () => new Date() } = {}) {
  const cutoff = dateStamp(new Date(now().getTime() - days * 24 * 60 * 60 * 1000));
  let entries;
  try {
    entries = fs.readdirSync(logsDir);
  } catch {
    return;
  }
  for (const name of entries) {
    const dated = /^[a-z]+-(\d{8})\.log$/.exec(name);
    const legacy = /^(runtime|manager)\.log(\.old)?$/.test(name);
    if ((dated && dated[1] < cutoff) || legacy) {
      try {
        fs.unlinkSync(path.join(logsDir, name));
      } catch {
        // sweep is best-effort; a locked file waits for the next roll
      }
    }
  }
}

// A pipe-compatible Writable appending to <base>-YYYYMMDD.log. Same-day launches
// append (a crash loop must not destroy the launch that started it); the write
// path rolls to a new file when the date stamp changes; sweep runs at open and
// at each roll.
function openDailyLogStream(logsDir, base, { days = DEFAULT_DAYS, now = () => new Date() } = {}) {
  fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
  let current = null;
  let stamp = "";
  const roll = () => {
    const s = dateStamp(now());
    if (s !== stamp) {
      if (current) current.end();
      stamp = s;
      sweepLogs(logsDir, { days, now });
      current = fs.createWriteStream(path.join(logsDir, `${base}-${s}.log`), { flags: "a", mode: 0o600 });
    }
    return current;
  };
  roll();
  return new Writable({
    write(chunk, encoding, callback) {
      roll().write(chunk, encoding, callback);
    },
    final(callback) {
      current ? current.end(callback) : callback();
    },
  });
}

// Line-buffered Transform prefixing each line with an ISO timestamp — the system
// stream is forensic evidence, and evidence needs time. Sits between the engine
// child's stdout/stderr and the dated log file; one instance per source stream so
// chunks can't interleave mid-line. A trailing partial line is stamped on end.
function stampLines({ now = () => new Date() } = {}) {
  let buf = "";
  return new Transform({
    transform(chunk, encoding, callback) {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      callback(null, lines.map((l) => `${now().toISOString()} ${l}\n`).join(""));
    },
    flush(callback) {
      callback(null, buf ? `${now().toISOString()} ${buf}\n` : "");
    },
  });
}

module.exports = { dateStamp, openDailyLogStream, stampLines, sweepLogs };
