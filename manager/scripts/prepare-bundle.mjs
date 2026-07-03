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
// sha256 of the tarball above, pinned with the version (verified against
// nodejs.org's SHASUMS256.txt when the pin was set).
const NODE_SHA256 = "319f221adc5e44ff0ed57e8a441b2284f02b8dc6fc87b8eb92a6a93643fd8080";

const managerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(managerDir, "..");
const buildDir = path.join(managerDir, "build");
const platformDir = path.join(buildDir, "platform");
const nodeDir = path.join(buildDir, "node");
const cacheDir = path.join(managerDir, ".node-cache");

// pnpm exports its resolved config to children as npm_config_* env vars. When this
// script runs nested under `pnpm --filter @lodekit/manager make`, the inner `pnpm bundle`
// has CWD manager/ and picks up manager/.npmrc's node-linker=hoisted — inherited by the
// deploys below, that made pnpm partially relink the workspace and silently break the
// runtime's Vite/Tailwind resolution. Strip the whole npm_config_* family so every child
// behaves as if invoked fresh from the repo root.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.toLowerCase().startsWith("npm_config_"))
);
const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: "inherit", cwd: repoRoot, env: cleanEnv, ...opts });

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
  const actual = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
  if (actual !== NODE_SHA256) {
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
  // Both deployed packages extend the workspace-root tsconfig.base.json, which
  // doesn't exist inside the bundle — vendor it into each package and point the
  // extends at the local copy so the payload is self-contained (the runtime's
  // dashboard build reads its tsconfig at runtime).
  for (const pkg of ["runtime", "mcp"]) {
    const pkgDir = path.join(platformDir, pkg);
    fs.copyFileSync(path.join(repoRoot, "tsconfig.base.json"), path.join(pkgDir, "tsconfig.base.json"));
    const tsconfigPath = path.join(pkgDir, "tsconfig.json");
    // tsconfig.json is JSONC (the runtime's has full-line `//` comments, added by the
    // tanstack-start-host slice) — strip those before JSON.parse.
    const tsconfigRaw = fs.readFileSync(tsconfigPath, "utf8").replace(/^\s*\/\/.*$/gm, "");
    const tsconfig = JSON.parse(tsconfigRaw);
    if (tsconfig.extends) tsconfig.extends = "./tsconfig.base.json";
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
  }
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

// Any tsconfig `extends` in the payload must resolve inside the payload —
// out-of-bundle extends broke the packaged dashboard build once already.
function assertSelfContainedTsconfigs() {
  const tsconfigs = execSync(
    `find "${platformDir}" -name tsconfig.json -not -path "*/node_modules/*"`,
    { encoding: "utf8" }
  ).trim().split("\n").filter(Boolean);
  for (const file of tsconfigs) {
    const { extends: ext } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!ext) continue;
    const target = path.resolve(path.dirname(file), ext);
    if (!fs.existsSync(target)) throw new Error(`Payload tsconfig extends outside the bundle: ${file} -> ${ext}`);
  }
}

assertNodeVersion();
await fetchNode();
buildPayload();
assertNoEscapingSymlinks();
assertNativeModule();
assertSelfContainedTsconfigs();
console.log(`Bundle inputs ready: ${buildDir} (Node v${NODE_VERSION} + platform payload)`);
