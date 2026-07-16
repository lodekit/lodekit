#!/usr/bin/env node
// Lodekit agent-tooling bootstrap + doctor. Idempotent; safe to re-run.
// Wires what Codex cannot read from the repo, and verifies both harnesses.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, readdirSync, readlinkSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const results = [];
const ok = (name, detail = '') => results.push({ name, pass: true, detail });
const fail = (name, detail) => results.push({ name, pass: false, detail });
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

// 1. binaries
let bdPresent = false;
try {
  const v = run('bd', ['version']);
  const m = v.match(/(\d+)\.(\d+)\.\d+/);
  bdPresent = true;
  if (m && (+m[1] > 1 || (+m[1] === 1 && +m[2] >= 1))) ok('bd >= 1.1.0', v);
  else fail('bd >= 1.1.0', `${v} — brew upgrade beads`);
} catch {
  fail('bd >= 1.1.0', 'not found — brew install beads');
}
try {
  ok('codebase-memory-mcp', run('codebase-memory-mcp', ['--version']));
} catch {
  fail('codebase-memory-mcp', 'not found — see AGENTS.md (brew tap DeusData)');
}

// 2. repo wiring
try {
  const t = readlinkSync(join(repo, 'CLAUDE.md'));
  t === 'AGENTS.md' ? ok('CLAUDE.md -> AGENTS.md') : fail('CLAUDE.md symlink', `points at ${t}`);
} catch {
  fail('CLAUDE.md symlink', 'missing or not a symlink');
}
try {
  const canonical = readdirSync(join(repo, '.agents', 'skills'));
  const links = readdirSync(join(repo, '.claude', 'skills'));
  const missing = canonical.filter((s) => !links.includes(s));
  const broken = links.filter((l) => !existsSync(join(repo, '.claude', 'skills', l)));
  if (!missing.length && !broken.length) ok(`skill symlinks (${links.length})`);
  else fail('skill symlinks', `missing: ${missing.join(',') || '-'}; broken: ${broken.join(',') || '-'}`);
} catch (e) {
  fail('skill symlinks', String(e));
}

// 3. beads dolt remote (approved follow-up — bd dolt push/pull needs a remote configured)
if (bdPresent) {
  try {
    const out = run('bd', ['dolt', 'remote', 'list']);
    const hasOrigin = out.split('\n').some((line) => line.trim().split(/\s+/)[0] === 'origin');
    if (hasOrigin) ok('bd dolt remote', 'origin configured');
    else fail('bd dolt remote', 'bd dolt remote add origin <git origin URL> — required once per machine for bd dolt push/pull');
  } catch (e) {
    fail('bd dolt remote', `bd dolt remote list failed — ${String(e)}`);
  }
}

// 4. codex (user-global — the parts Codex cannot read from the repo)
const codexConfig = join(homedir(), '.codex', 'config.toml');
const marker = '[mcp_servers.codebase-memory-mcp]';
try {
  mkdirSync(dirname(codexConfig), { recursive: true });
  const current = existsSync(codexConfig) ? readFileSync(codexConfig, 'utf8') : '';
  if (current.includes(marker)) ok('codex mcp config', 'already present');
  else {
    appendFileSync(codexConfig, `\n# added by lodekit .agents/scripts/setup.mjs\n${marker}\ncommand = "codebase-memory-mcp"\nargs = []\n`);
    ok('codex mcp config', `appended to ${codexConfig}`);
  }
} catch (e) {
  fail('codex mcp config', String(e));
}
// bd setup codex is deliberately NOT run (person-approved spec §8 deviation, 2026-07-16):
// its project mode mutates the repo tree (tracked AGENTS.md append, .codex/, beads skill
// dir) and --stealth doesn't support codex. Codex sessions read bd conventions from
// AGENTS.md; automatic bd-prime injection for Codex is tracked as a defer bead.

// report
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
