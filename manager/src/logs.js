"use strict";
const fs = require("node:fs");
const path = require("node:path");

// One log file per process per manager launch; the previous launch's file
// survives as `<name>.old` (spec §6).
function openLogStream(logsDir, name) {
  fs.mkdirSync(logsDir, { recursive: true });
  const file = path.join(logsDir, name);
  if (fs.existsSync(file)) fs.renameSync(file, `${file}.old`);
  return fs.createWriteStream(file, { flags: "a" });
}

module.exports = { openLogStream };
