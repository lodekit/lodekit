#!/usr/bin/env node
// Deletes known-disposable build outputs in the current worktree, or in all
// registered worktrees with --all. Fixed allowlist only — node_modules and
// manager/.node-cache are never touched.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DISPOSABLE = [
  'manager/out', // dead Electron Forge output — never regenerates
  'manager/dist',
  'manager/build',
  'web/main/dist',
  'web/main/.astro',
  'web/docs/dist',
  'web/docs/.astro',
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function worktreeRoots(all) {
  if (!all) return [git(['rev-parse', '--show-toplevel'])];
  return git(['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

function dirKb(path) {
  try {
    return Number(execFileSync('du', ['-sk', path], { encoding: 'utf8' }).split('\t')[0]);
  } catch {
    return 0;
  }
}

const fmt = (kb) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)}G` : `${Math.round(kb / 1024)}M`);

let totalKb = 0;
for (const root of worktreeRoots(process.argv.includes('--all'))) {
  let reclaimedKb = 0;
  for (const rel of DISPOSABLE) {
    const target = join(root, rel);
    if (!existsSync(target)) continue;
    const kb = dirKb(target);
    rmSync(target, { recursive: true, force: true });
    console.log(`  removed ${target} (${fmt(kb)})`);
    reclaimedKb += kb;
  }
  console.log(`${root}: reclaimed ${fmt(reclaimedKb)}`);
  totalKb += reclaimedKb;
}
console.log(`total: reclaimed ${fmt(totalKb)}`);
