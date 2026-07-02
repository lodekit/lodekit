#!/usr/bin/env node
// Builds the packaged manager's bundle inputs (spec §3):
//   build/platform/{runtime,mcp,skill} — relocatable payload (pnpm deploy)
//   build/node                         — pinned Lodekit-local Node (darwin-arm64)
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The one place the Lodekit-local Node version is pinned (spec §3).
const NODE_VERSION = "24.12.0";
const NODE_DIST = `node-v${NODE_VERSION}-darwin-arm64`;

const managerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(managerDir, "..");
const buildDir = path.join(managerDir, "build");
const platformDir = path.join(buildDir, "platform");
const nodeDir = path.join(buildDir, "node");
const cacheDir = path.join(managerDir, ".node-cache");

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: repoRoot, ...opts });

// The payload's node_modules are whatever the last `pnpm install` built —
// native modules (better-sqlite3) must match the bundled Node's ABI.
function assertNodeVersion() {
  if (process.version !== `v${NODE_VERSION}`) {
    throw new Error(
      `Bundle with Node v${NODE_VERSION} (found ${process.version}) so native modules ` +
        `match the bundled Node's ABI. Switch Node, then pnpm install (or ` +
        `pnpm rebuild better-sqlite3) and re-run.`
    );
  }
}

async function fetchNode() {
  const marker = path.join(nodeDir, ".lodekit-node-version");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === NODE_VERSION) return;
  fs.rmSync(nodeDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const tarball = path.join(cacheDir, `${NODE_DIST}.tar.gz`);
  if (!fs.existsSync(tarball)) {
    console.log(`Downloading ${NODE_DIST}…`);
    const res = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.gz`);
    if (!res.ok) throw new Error(`Node download failed: HTTP ${res.status}`);
    fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  }
  const shasums = await (
    await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)
  ).text();
  const expected = shasums
    .split("\n")
    .find((l) => l.trim().endsWith(`${NODE_DIST}.tar.gz`))
    ?.split(/\s+/)[0];
  const actual = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
  if (!expected || actual !== expected) {
    fs.rmSync(tarball, { force: true });
    throw new Error("Node tarball checksum mismatch — deleted; re-run to re-download.");
  }
  fs.rmSync(path.join(cacheDir, NODE_DIST), { recursive: true, force: true });
  run(`tar -xzf "${tarball}" -C "${cacheDir}"`);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.renameSync(path.join(cacheDir, NODE_DIST), nodeDir);
  fs.writeFileSync(marker, NODE_VERSION);
}

function buildPayload() {
  fs.rmSync(platformDir, { recursive: true, force: true });
  fs.mkdirSync(platformDir, { recursive: true });
  // --config.hoist=false: without it, pnpm's default hoist pattern ("*") hoists every
  // importer in the shared workspace lockfile — including the deployed package's own
  // self-entry — into node_modules/.pnpm/node_modules/, and that self-entry symlinks back
  // to the monorepo source (packages/runtime), which trips assertNoEscapingSymlinks below
  // (and would break relocatability, spec §3). Scoped to this command only; installs and
  // the root .npmrc's legacy-deploy opt-in are unaffected.
  run(
    `pnpm --filter @lodekit/runtime --prod --config.hoist=false deploy "${path.join(platformDir, "runtime")}"`
  );
  run(
    `pnpm --filter @lodekit/mcp --prod --config.hoist=false deploy "${path.join(platformDir, "mcp")}"`
  );
  fs.cpSync(path.join(repoRoot, "packages", "skill"), path.join(platformDir, "skill"), {
    recursive: true,
    filter: (src) => !src.includes("node_modules"),
  });
}

// Relocatable means no symlink may resolve outside the payload (spec §3);
// internal relative links (node_modules/.bin) are fine.
function assertNoEscapingSymlinks() {
  const links = execSync(`find "${platformDir}" -type l`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const root = fs.realpathSync(platformDir) + path.sep;
  for (const link of links) {
    const target = fs.realpathSync(link);
    if (!target.startsWith(root)) {
      throw new Error(`Payload symlink escapes the bundle: ${link} -> ${target}`);
    }
  }
}

// The bundled Node must load the payload's native module — proves the ABI match.
function assertNativeModule() {
  run(`"${path.join(nodeDir, "bin", "node")}" -e "require('better-sqlite3')"`, {
    cwd: path.join(platformDir, "runtime"),
  });
}

assertNodeVersion();
await fetchNode();
buildPayload();
assertNoEscapingSymlinks();
assertNativeModule();
console.log(`Bundle inputs ready: ${buildDir} (Node v${NODE_VERSION} + platform payload)`);
