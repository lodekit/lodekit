# Open-Source Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Put the codebase in a state where making `github.com/lodekit/lodekit` public is a settings change and nothing more.

**Architecture:** A machine-readable licensing boundary (`REUSE.toml` path globs, AGPL-3.0-only default with Apache-2.0 carve-outs) enforced by a `reuse lint` CI job; five launch prose files; a packaging fix that carries Electron's license files into the app bundle; and a sweep that genericises local paths.

**Tech Stack:** REUSE 3.3 (`REUSE.toml` + `LICENSES/`), `fsfe/reuse-action@v6` in GitHub Actions, electron-builder `afterPack` hook (Node/CommonJS), vitest.

**Spec:** `docs/specs/2026-07-28-open-source-release-readiness-design.md`

**Beads:** epic `lk-oh1w`. Tasks 1–8 → `lk-0ps7`, `lk-306j`, `lk-lkal`, `lk-kviy`, `lk-7mco`, `lk-kpib`, `lk-6ulo`, `lk-bf7u`. Unblocked at the start: Tasks 1, 3, 6, 7.

## Global Constraints

- **Copyright holder string, everywhere:** `The Lodekit Authors`. Never a personal name, never a company.
- **Copyright year:** `2026`.
- **Default license:** `AGPL-3.0-only` (never `-or-later`).
- **Permissive license:** `Apache-2.0`.
- **Boundary rule:** anything a user's own app imports, or copies as a starting point, is permissive. Never move `packages/sdk`, `packages/ui`, `packages/mcp`, `packages/skill`, or `root/**` under AGPL.
- **REUSE.toml ordering is load-bearing:** when several `[[annotations]]` match one file, **the last matching table wins** (REUSE spec 3.3). Order the file broad → specific. Reordering it silently changes the licensing of real files.
- **Files ignored by git are not linted** and need no annotation (`.beads/`, `.agents/internal/`, `node_modules/`, `.codebase-memory/`).
- **All manifests stay `private: true`.** npm publication is explicitly not intended.
- No `Co-Authored-By` trailers in commits; no "Generated with Claude Code" in PR bodies.
- Prose files are written per the `write-documentation` skill and consult `docs/PRODUCT.md` for voice.
- Commit after every task. Bead ID in every commit message.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `LICENSE` | Full AGPL-3.0 text. GitHub's license detector reads this path. |
| `LICENSES/AGPL-3.0-only.txt` | Canonical text, REUSE-conventional location. |
| `LICENSES/Apache-2.0.txt` | Canonical text. |
| `LICENSES/MIT.txt` | Canonical text, for the vendored upstreams. |
| `REUSE.toml` | The whole licensing boundary, machine-readable. |
| `NOTICE` | Copyright line, Apache §4(d) mechanics, trademark paragraph. |
| `LICENSING.md` | The split explained for humans; Electron/ffmpeg source pointer. |
| `README.md` | Repo front door. Does not exist today. |
| `SECURITY.md` | Alpha framing + private vulnerability reporting. |
| `CONTRIBUTING.md` | Closed-contributions posture; agent workflow as documentation. |
| `.github/workflows/reuse.yml` | `reuse lint` gate. |

**Modified:**

| Path | Change |
|---|---|
| 10 × `package.json` | Add SPDX `license` field. |
| `manager/scripts/assert-pack.cjs` | Copy + assert Electron and Node license files. |
| `manager/tests/` (new file) | Test for the license-copy helper. |
| 13 × `docs/plans/*.md`, `docs/specs/*.md` | Genericise `/Users/<user>/…` paths. |
| `docs/PRODUCT.md` | One line in §3. |
| `docs/changelog.md` | One `## New` entry. |

---

## Task 1: REUSE skeleton — license texts, boundary, and lint gate

**Files:**
- Create: `LICENSES/AGPL-3.0-only.txt`, `LICENSES/Apache-2.0.txt`, `LICENSES/MIT.txt`
- Create: `LICENSE`
- Create: `REUSE.toml`
- Create: `.github/workflows/reuse.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where `reuse lint` exits 0. Task 2 relies on `REUSE.toml` existing at the root; Task 8's final verification re-runs the same lint.

**Acceptance Criteria:**
- `reuse lint` exits 0 with "Congratulations! Your project is compliant with version 3.3 of the REUSE Specification".
- Every path in the spec's §3.1 boundary table resolves to the SPDX identifier that table specifies, verified by spot-check with `reuse lint --json`.
- `.github/workflows/reuse.yml` runs `fsfe/reuse-action@v6` on push and pull_request.

- [ ] **Step 1: Install the `reuse` tool in a throwaway venv**

There is no `pipx` or `uv` on this machine (verified). Use a venv under the scratchpad so nothing pollutes the repo:

```bash
python3 -m venv /tmp/reuse-venv
/tmp/reuse-venv/bin/pip install --quiet reuse
/tmp/reuse-venv/bin/reuse --version
```

Expected: `reuse 5.x.x` (any 5.x is fine; it implements spec 3.3).

- [ ] **Step 2: Run the lint to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)"
/tmp/reuse-venv/bin/reuse lint 2>&1 | tail -20
```

Expected: FAIL — a long list under `MISSING COPYRIGHT AND LICENSING INFORMATION`, and a summary reporting 0 files with copyright and licensing information. This is the failing test.

- [ ] **Step 3: Download the canonical license texts**

Do not hand-write these — `reuse download` fetches the exact SPDX texts the linter expects:

```bash
/tmp/reuse-venv/bin/reuse download AGPL-3.0-only Apache-2.0 MIT
ls LICENSES/
```

Expected: `AGPL-3.0-only.txt  Apache-2.0.txt  MIT.txt`

- [ ] **Step 4: Create the root `LICENSE`**

GitHub's license detector reads the root `LICENSE` path and will report the repo as unlicensed without it, regardless of `LICENSES/`. The duplication is intentional.

```bash
cp LICENSES/AGPL-3.0-only.txt LICENSE
```

- [ ] **Step 5: Write `REUSE.toml`**

Order is broad → specific because the **last** matching annotation wins. Create `REUSE.toml` at the repo root with exactly this content:

```toml
version = 1

# Lodekit's licensing boundary. ORDERING IS LOAD-BEARING: when several
# annotations match one file, the LAST matching table wins (REUSE spec 3.3).
# Broad defaults first, carve-outs after, vendored third-party code last.

# ---------------------------------------------------------------- default
[[annotations]]
path = "**"
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 The Lodekit Authors"
SPDX-License-Identifier = "AGPL-3.0-only"

# ------------------------------------------------- permissive carve-outs
# Anything a user's own app imports, or copies as a starting point.
[[annotations]]
path = [
  "packages/sdk/**",
  "packages/ui/**",
  "packages/mcp/**",
  "packages/skill/**",
  "root/**",
  "docs/**",
  "web/docs/**",
]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 The Lodekit Authors"
SPDX-License-Identifier = "Apache-2.0"

# --------------------------------------------- vendored: dev-process skills
# Provenance ledger: .agents/SOURCES.md
[[annotations]]
path = [".agents/skills/**", ".agents/hooks/**"]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 Dillon Frawley"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = ".agents/skills/writing-skills/**"
precedence = "aggregate"
SPDX-FileCopyrightText = "2025 Jesse Vincent"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = [
  ".agents/skills/ponytail/**",
  ".agents/skills/ponytail-audit/**",
  ".agents/skills/ponytail-debt/**",
  ".agents/skills/ponytail-review/**",
]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 DietrichGebert"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = [
  ".agents/skills/codebase-design/**",
  ".agents/skills/domain-modeling/**",
]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 Matt Pocock"
SPDX-License-Identifier = "MIT"

# Lodekit's own skills — no upstream (.agents/SOURCES.md, "ours").
[[annotations]]
path = [
  ".agents/skills/session/**",
  ".agents/skills/drain-deferrals/**",
  ".agents/skills/release/**",
]
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 The Lodekit Authors"
SPDX-License-Identifier = "Apache-2.0"

# ------------------------------------------------ vendored: UI and themes
[[annotations]]
path = ["packages/ui/shadcn-tailwind.css", "packages/ui/src/components/**"]
precedence = "aggregate"
SPDX-FileCopyrightText = ["2023 shadcn", "2026 The Lodekit Authors"]
SPDX-License-Identifier = "MIT"

[[annotations]]
path = "web/main/src/components/demo/prompt-kit/**"
precedence = "aggregate"
SPDX-FileCopyrightText = "2025 Julien Thibeaut"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = "packages/engine/themes/catppuccin.css"
precedence = "aggregate"
SPDX-FileCopyrightText = "2021 Catppuccin"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = "packages/engine/themes/dracula.css"
precedence = "aggregate"
SPDX-FileCopyrightText = "2023 Dracula Theme"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = "packages/engine/themes/nord.css"
precedence = "aggregate"
SPDX-FileCopyrightText = "2016-present Sven Greb"
SPDX-License-Identifier = "MIT"

[[annotations]]
path = "packages/engine/themes/rose-pine.css"
precedence = "aggregate"
SPDX-FileCopyrightText = "2023 Rosé Pine"
SPDX-License-Identifier = "MIT"
```

- [ ] **Step 6: Run the lint to verify it passes**

```bash
/tmp/reuse-venv/bin/reuse lint 2>&1 | tail -15
```

Expected: PASS — `Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)`

If it still reports missing information, the reported paths fall outside every glob. Add them to the `**` default's coverage — do **not** add a second catch-all at the end of the file, which would override every carve-out above it.

- [ ] **Step 7: Spot-check the boundary resolved correctly**

The lint passing only proves every file has *some* license. Verify the boundary is the one the spec specifies:

Write this to `/tmp/check-boundary.py` — Task 8 re-runs it:

```bash
cat > /tmp/check-boundary.py <<'EOF'
import json, os, subprocess, sys

# reuse lint --json reports each file's license under "spdx_expressions" (NOT
# "licenses"), and each entry is a dict {"value": ..., "source": ...}. Paths are
# absolute, so relativise with os.path.relpath — never str.split on a directory
# name, which corrupts any path containing it (e.g. packages/engine/...).
WANT = {
    "packages/engine/src/server.ts": "AGPL-3.0-only",
    "packages/sdk/src/secrets.ts": "Apache-2.0",
    "packages/ui/src/components/accordion.tsx": "MIT",
    "packages/mcp/client.ts": "Apache-2.0",
    "packages/skill/package.json": "Apache-2.0",
    "root/apps/greenhouse/src/db.ts": "Apache-2.0",
    "manager/src/main.js": "AGPL-3.0-only",
    "web/main/src/pages/index.astro": "AGPL-3.0-only",
    "web/main/src/components/demo/prompt-kit/message.tsx": "MIT",
    "packages/engine/themes/nord.css": "MIT",
    "docs/PRODUCT.md": "Apache-2.0",
    ".agents/skills/ponytail/SKILL.md": "MIT",
    ".agents/skills/writing-skills/SKILL.md": "MIT",
    ".agents/skills/session/SKILL.md": "Apache-2.0",
}

raw = subprocess.run(
    ["/tmp/reuse-venv/bin/reuse", "lint", "--json"],
    capture_output=True, text=True,
).stdout
data = json.loads(raw)
root = os.getcwd()

def values(f):
    return [e["value"] if isinstance(e, dict) else e
            for e in f.get("spdx_expressions", [])]

got = {os.path.relpath(f["path"], root): values(f) for f in data["files"]}

bad = 0
for path, expected in WANT.items():
    ids = got.get(path)
    ok = ids is not None and expected in ids
    print(("OK  " if ok else "BAD "), path, "->", ids, "(want", expected + ")")
    bad += 0 if ok else 1

print("MISMATCHES:", bad)
sys.exit(1 if bad else 0)
EOF
python3 /tmp/check-boundary.py
```

Expected: every line `OK`, exit 0. Any `BAD` line means an annotation glob is wrong or mis-ordered — fix `REUSE.toml`, re-run.

If a listed path no longer exists (files move), substitute a sibling from the same tree rather than deleting the check — the point is one probe per boundary region.

- [ ] **Step 8: Confirm how the lint treats the `.claude/skills` symlinks**

`.claude/skills/*` are git mode-120000 symlinks into `.agents/skills/*` (verified). REUSE skips symlinks, so they should not appear at all — but the spec records this as confirm-don't-assume, because if they *were* linted the `**` default would label them `AGPL-3.0-only` while their targets are MIT.

```bash
/tmp/reuse-venv/bin/reuse lint --json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
print([f['path'] for f in d['files'] if '.claude/skills' in f['path']] or 'symlinks skipped — nothing to do')"
```

Expected: `symlinks skipped — nothing to do`.

If instead paths are listed, append this annotation to `REUSE.toml` — it must go **last**, since the last matching table wins:

```toml
[[annotations]]
path = ".claude/skills/**"
precedence = "aggregate"
SPDX-FileCopyrightText = "NONE"
SPDX-License-Identifier = "MIT"
```

- [ ] **Step 9: Add the CI gate**

Create `.github/workflows/reuse.yml`:

```yaml
name: reuse

# REUSE.toml uses path globs, so a file added outside every glob falls into
# no-license limbo silently. This job is what notices.
on:
  push:
    branches: [master]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fsfe/reuse-action@v6
```

- [ ] **Step 10: Commit**

```bash
git add LICENSE LICENSES REUSE.toml .github/workflows/reuse.yml
git commit -m "feat: AGPL-3.0-only/Apache-2.0 licensing boundary via REUSE (<bead-id>)"
```

---

## Task 2: SPDX license fields on all ten manifests

**Files:**
- Modify: `package.json`, `packages/engine/package.json`, `packages/integration-tests/package.json`, `packages/mcp/package.json`, `packages/sdk/package.json`, `packages/skill/package.json`, `packages/ui/package.json`, `web/docs/package.json`, `web/main/package.json`, `manager/package.json`

**Interfaces:**
- Consumes: the boundary defined in Task 1's `REUSE.toml`.
- Produces: nothing later tasks import.

**Acceptance Criteria:**
- All ten manifests carry a `license` field matching the table below.
- All ten still carry `private: true`.
- `pnpm install --frozen-lockfile` still succeeds (manifest edits can invalidate the lockfile if made carelessly).

- [ ] **Step 1: Write the failing check**

npm and GitHub both read a missing `license` as proprietary. This check is the test — write it to `/tmp/check-licenses.py`, because Step 3 and Task 8 both re-run it:

```bash
cd "$(git rev-parse --show-toplevel)"
cat > /tmp/check-licenses.py <<'EOF'
import json, sys
want = {
    "package.json": "AGPL-3.0-only",
    "packages/engine/package.json": "AGPL-3.0-only",
    "packages/integration-tests/package.json": "AGPL-3.0-only",
    "manager/package.json": "AGPL-3.0-only",
    "web/main/package.json": "AGPL-3.0-only",
    "packages/sdk/package.json": "Apache-2.0",
    "packages/ui/package.json": "Apache-2.0",
    "packages/mcp/package.json": "Apache-2.0",
    "packages/skill/package.json": "Apache-2.0",
    "web/docs/package.json": "Apache-2.0",
}
bad = 0
for path, expected in want.items():
    d = json.load(open(path))
    lic, priv = d.get("license"), d.get("private")
    ok = lic == expected and priv is True
    print(("OK  " if ok else "BAD "), path, "license=", lic, "private=", priv)
    bad += 0 if ok else 1
sys.exit(1 if bad else 0)
EOF
python3 /tmp/check-licenses.py
```

Expected: FAIL — every line `BAD`, `license= None`.

- [ ] **Step 2: Add the fields**

In each manifest, insert `"license"` immediately after the `"version"` line so the diff stays readable and the ordering is conventional. For example, `packages/sdk/package.json`:

```json
{
  "name": "@lodekit/sdk",
  "version": "0.1.0",
  "license": "Apache-2.0",
  "private": true,
```

Apply per the table in Step 1. The root `package.json` is `lodekit-monorepo` and takes `AGPL-3.0-only`.

- [ ] **Step 3: Re-run the check to verify it passes**

```bash
python3 /tmp/check-licenses.py
```

Expected: PASS — every line `OK`, exit 0.

- [ ] **Step 4: Verify the lockfile is unaffected**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -5
```

Expected: completes without `ERR_PNPM_OUTDATED_LOCKFILE`. The `license` field is metadata and does not affect resolution; if the lockfile is reported outdated, something else in the manifest was changed by mistake — revert and redo.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/*/package.json web/*/package.json manager/package.json
git commit -m "feat: SPDX license fields on all workspace manifests (<bead-id>)"
```

---

## Task 3: Carry Electron's license files into the app bundle

**Files:**
- Modify: `manager/scripts/assert-pack.cjs`
- Create: `manager/tests/pack-licenses.test.js`

**Background:** `Lodekit.app` redistributes Node and Electron. Node is already covered — `electron-builder.yml` declares `extraResources: build/node → node` and the Node tarball carries its aggregate `LICENSE` at the root, so it ships at `Resources/node/LICENSE`. Electron is not: electron-builder does not copy `LICENSE` or `LICENSES.chromium.html` into macOS output.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `collectLicenses(context)` exported from `assert-pack.cjs` alongside the existing default export, so the test can drive it without running a full electron-builder pack.

**Acceptance Criteria:**
- A packed `Lodekit.app` contains `Contents/Resources/LICENSE.electron` and `Contents/Resources/LICENSES.chromium.html`.
- A packed `Lodekit.app` contains `Contents/Resources/node/LICENSE`.
- The afterPack hook throws a clear error if any of the three is absent.
- `pnpm --filter @lodekit/manager test` passes.

- [ ] **Step 1: Confirm the Node claim before building on it**

The spec records this as confirm-don't-assume. Run the bundle step and look:

```bash
cd "$(git rev-parse --show-toplevel)"
pnpm --filter @lodekit/manager bundle 2>&1 | tail -3
ls manager/build/node/LICENSE && echo "NODE LICENSE PRESENT"
```

Expected: `NODE LICENSE PRESENT`.

If it is absent, the spec's §4.3 assumption is wrong: add a copy step for it in Step 4 alongside Electron's, sourcing it from `manager/build/node/`.

- [ ] **Step 2: Locate Electron's license files in the dist**

```bash
cd "$(git rev-parse --show-toplevel)"
find node_modules/.pnpm -maxdepth 6 -path '*electron/dist*' \
  \( -name 'LICENSE' -o -name 'LICENSES.chromium.html' \) 2>/dev/null | head
```

Expected: two paths ending `electron/dist/LICENSE` and `electron/dist/LICENSES.chromium.html`.

These are also reachable at pack time from electron-builder's `context.packager.info.framework.distMacOsAppName` neighbourhood, but the robust source is the `electron` package itself — resolved in Step 4 via `require.resolve`.

- [ ] **Step 3: Write the failing test**

Create `manager/tests/pack-licenses.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Default import, then destructure. assert-pack.cjs sets `module.exports` to a
// function and hangs `collectLicenses` off it as a property — cjs-module-lexer
// does not reliably detect that shape as a named export, unlike the
// object-literal `module.exports = { … }` in src/paths.js.
import assertPack from "../scripts/assert-pack.cjs";

const { collectLicenses } = assertPack;

function fakeContext(appOutDir) {
  return {
    appOutDir,
    packager: { appInfo: { productFilename: "Lodekit" } },
  };
}

function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-pack-"));
  const resources = path.join(dir, "Lodekit.app", "Contents", "Resources");
  fs.mkdirSync(path.join(resources, "node"), { recursive: true });
  fs.writeFileSync(path.join(resources, "node", "LICENSE"), "node license");
  return { dir, resources };
}

describe("collectLicenses", () => {
  it("copies Electron's LICENSE and LICENSES.chromium.html into Resources", () => {
    const { dir, resources } = scaffold();
    collectLicenses(fakeContext(dir));
    expect(fs.existsSync(path.join(resources, "LICENSE.electron"))).toBe(true);
    expect(fs.existsSync(path.join(resources, "LICENSES.chromium.html"))).toBe(true);
  });

  it("throws when Node's aggregate LICENSE is missing from the bundle", () => {
    const { dir, resources } = scaffold();
    fs.rmSync(path.join(resources, "node", "LICENSE"));
    expect(() => collectLicenses(fakeContext(dir))).toThrow(/node[/\\]LICENSE/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm --filter @lodekit/manager test pack-licenses 2>&1 | tail -15
```

Expected: FAIL with `does not provide an export named 'collectLicenses'`.

- [ ] **Step 5: Implement `collectLicenses`**

Modify `manager/scripts/assert-pack.cjs`. Keep the existing default export exactly as it is and add the new function plus a call to it. The full file after the change:

```javascript
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Electron ships LICENSE and LICENSES.chromium.html in its dist, but
// electron-builder does not copy them into macOS output — so the packaged app
// would redistribute Chromium with no notice. Node's aggregate LICENSE already
// rides along inside extraResources (build/node → node); this asserts it stayed.
function collectLicenses(context) {
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources"
  );

  const electronDist = path.dirname(require.resolve("electron/package.json"));
  const copies = [
    [path.join(electronDist, "dist", "LICENSE"), path.join(resources, "LICENSE.electron")],
    [
      path.join(electronDist, "dist", "LICENSES.chromium.html"),
      path.join(resources, "LICENSES.chromium.html"),
    ],
  ];
  for (const [from, to] of copies) {
    if (!fs.existsSync(from)) {
      throw new Error(`Electron license file missing from its dist: ${from}`);
    }
    fs.copyFileSync(from, to);
  }

  const required = [
    path.join(resources, "LICENSE.electron"),
    path.join(resources, "LICENSES.chromium.html"),
    path.join(resources, "node", "LICENSE"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`Packed app is missing a redistribution notice: ${p}`);
    }
  }
}

// afterPack guard: the files whitelist in electron-builder.yml must ship every
// runtime-read path. Forge's ignore-regex shipped assets/ implicitly; a whitelist
// drops it silently and the tray renders an empty (invisible) icon.
module.exports = async function assertPack(context) {
  const appDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
    "app"
  );
  const iconsDir = path.join(appDir, "assets", "menubar-icons");
  const ok =
    fs.existsSync(iconsDir) &&
    fs.readdirSync(iconsDir).some((f) => f.endsWith("-18.png"));
  if (!ok) {
    throw new Error(`Packed app is missing the menubar icons: ${iconsDir}`);
  }
  collectLicenses(context);
};

module.exports.collectLicenses = collectLicenses;
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @lodekit/manager test pack-licenses 2>&1 | tail -15
```

Expected: PASS — 2 passed.

- [ ] **Step 7: Run the full manager suite for regressions**

```bash
pnpm --filter @lodekit/manager test 2>&1 | tail -10
```

Expected: all pass. The default export's signature is unchanged, so `assert-pack`'s existing behaviour is untouched.

- [ ] **Step 8: Commit**

```bash
git add manager/scripts/assert-pack.cjs manager/tests/pack-licenses.test.js
git commit -m "fix(manager): ship Electron and Node license notices in the app bundle (<bead-id>)"
```

**Note for the reviewer:** a real `pnpm --filter @lodekit/manager make` is the only true end-to-end proof, and it requires Node 24.12.0 exactly (`prepare-bundle.mjs` hard-asserts it). Run it if that Node is available; otherwise the unit test plus the afterPack assertion is the gate, and bead `lk-qnh` already tracks a pending packaged rebuild.

---

## Task 4: `NOTICE` and `LICENSING.md`

**Files:**
- Create: `NOTICE`
- Create: `LICENSING.md`

**Interfaces:**
- Consumes: the boundary from Task 1.
- Produces: `LICENSING.md`, which Task 5's README links to.

**Acceptance Criteria:**
- `NOTICE` states the copyright holder, the Apache-2.0 §4(d) role of the file, and the unregistered-trademark paragraph.
- `LICENSING.md` states the split, names which tree is which license, and carries the Electron/ffmpeg source pointer.
- `reuse lint` still exits 0 (both new files are covered by the `**` default).

- [ ] **Step 1: Write `NOTICE`**

```
Lodekit
Copyright (c) 2026 The Lodekit Authors

This product includes software developed by The Lodekit Authors and by third
parties. See LICENSING.md for how the repository is licensed, and REUSE.toml
for the authoritative, machine-readable per-path licensing.

This NOTICE file is provided for the purposes of section 4(d) of the Apache
License, Version 2.0, which applies to the permissively licensed parts of this
repository.

Trademark Notice
----------------

The licenses covering the code in this repository do not grant permission to
use the "Lodekit" name, Lodekit logos, or other Lodekit marks.

"Lodekit" and the Lodekit logos are marks and trade names of the Lodekit
project. They are not registered trademarks at this time.

Truthful, referential use is expressly welcome — describing your work as
"based on Lodekit" or "forked from Lodekit" is fine and needs no permission.
Using the marks in a way that suggests your project is official, endorsed, or
affiliated is not.
```

- [ ] **Step 2: Write `LICENSING.md`**

```markdown
# Licensing

Lodekit is licensed in two halves.

**The product is copyleft.** The engine, the manager, and the marketing site are
`AGPL-3.0-only`. If you run a modified Lodekit as a network service, the AGPL
asks you to publish your source.

**Everything your own apps touch is permissive.** The SDK, the UI library, the
MCP server, the Claude skill, the example apps, and the documentation are
`Apache-2.0`. Apps you build on Lodekit are yours, under whatever license you
choose — nothing here reaches into them.

| Tree | License |
| --- | --- |
| `packages/engine/`, `packages/integration-tests/` | `AGPL-3.0-only` |
| `manager/` | `AGPL-3.0-only` |
| `web/main/` | `AGPL-3.0-only` |
| `packages/sdk/`, `packages/ui/`, `packages/mcp/`, `packages/skill/` | `Apache-2.0` |
| `root/` (example apps, gateways, themes) | `Apache-2.0` |
| `docs/`, `web/docs/` | `Apache-2.0` |
| `.agents/skills/` (vendored dev process) | `MIT`, per upstream |

`REUSE.toml` is the authoritative source, and it is machine-readable — it
records the license and copyright holder of every path, including vendored
third-party files that differ from the tree they sit in. CI runs `reuse lint`
on every push.

## Third-party code

Vendored code keeps its own license and copyright notice; `REUSE.toml` names
each holder. `.agents/SOURCES.md` records where the vendored development
process came from and how it diverges.

Dependencies keep their own licenses, which travel with them inside
`node_modules` in the packaged app.

## The packaged app

`Lodekit.app` redistributes two third-party binaries:

- **Node.js**, whose aggregate `LICENSE` (covering Node, OpenSSL, V8, ICU, zlib
  and others) ships at `Contents/Resources/node/LICENSE`.
- **Electron**, whose `LICENSE` and `LICENSES.chromium.html` ship at
  `Contents/Resources/LICENSE.electron` and
  `Contents/Resources/LICENSES.chromium.html`.

Electron bundles an ffmpeg build under LGPL-2.1. Corresponding source for the
exact version used is published with that Electron release at
https://github.com/electron/electron/releases — find the tag matching the
Electron version in `manager/package.json`.

## Trademarks

The name and the logos are not covered by these licenses. See `NOTICE`.
```

- [ ] **Step 3: Verify the lint still passes**

```bash
/tmp/reuse-venv/bin/reuse lint 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add NOTICE LICENSING.md
git commit -m "docs: NOTICE with trademark notice, and LICENSING.md (<bead-id>)"
```

---

## Task 5: `README.md`

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `LICENSING.md` (Task 4), `SECURITY.md` and `CONTRIBUTING.md` (Task 6 — link to them; they land in the same branch).
- Produces: the repo front door.

**Acceptance Criteria:**
- Contains the status-and-disclaimer block with all seven bullets from the spec §5.3, verbatim where given below.
- Quickstart points at `https://docs.lodekit.com` rather than inlining steps.
- Links to `LICENSING.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- No pricing language, no claims of cloud sync, sharing, or non-macOS support (`docs/PRODUCT.md` §3 constraints).

- [ ] **Step 1: Read the voice guide before writing**

```bash
sed -n '194,292p' docs/PRODUCT.md
```

This is §5 Brand narrative, §6 Messaging, and §7 Voice & tone. The README's opening paragraph is a compression of the narrative; match its register. Invoke the `write-documentation` skill for the prose.

- [ ] **Step 2: Write `README.md`**

Structure, in order. Sections 1 and 4–6 are prose to draft; section 2 is verbatim.

1. **Title and one-paragraph statement of what Lodekit is.** Derived from `docs/PRODUCT.md` §1 Product statement. Name the three facts a reader needs: it runs on your own computer, an AI agent builds the apps, the platform keeps them running.

2. **Status and disclaimer** — verbatim:

```markdown
## Status and disclaimer

Lodekit is free, open-source software supplied outside the course of any
commercial activity, in the hope that it is useful but WITHOUT ANY WARRANTY —
see the LICENSE file.

You should also know how it was built and what it does not yet do:

- The codebase was written almost entirely by AI coding agents, directed,
  curated, and reviewed by a human maintainer.
- It has not been independently reviewed or security-audited.
- **App isolation is cooperative, not enforced.** Apps run in worker threads
  with your full user privileges and unrestricted access to the filesystem,
  the network, and child processes. An app can do anything you can do.
- macOS binaries are currently ad-hoc signed and NOT notarized by Apple.
  macOS will warn you, and you must explicitly allow the app under
  System Settings → Privacy & Security → "Open Anyway".
- It is macOS-only today.
- It stores your data locally in SQLite. Take your own backups.

Do not run Lodekit for anything where a defect would cause real damage you
can't absorb. Report vulnerabilities via SECURITY.md.
```

3. **Install.** The packaged app from GitHub Releases, plus the "Open Anyway" step. Do not promise a Homebrew cask or an installer that does not exist.

4. **Quickstart.** One short paragraph pointing at `https://docs.lodekit.com`. Note inline that the docs site is not published yet, so the reader is not misled by a dead link — one clause, not an apology.

5. **How it works.** Three or four sentences: engine, apps, agent via MCP. Link to `docs/CONTEXT.md` for the domain language and `docs/specs/` for design detail.

6. **Development.** `pnpm install`, `pnpm dev`, `pnpm test`. Link `AGENTS.md` as the working agreement.

7. **Licensing.** Two sentences — copyleft product, permissive SDK — and a link to `LICENSING.md`.

8. **Contributing.** One sentence: contributions are closed for now. Link `CONTRIBUTING.md`.

9. **Security.** One sentence. Link `SECURITY.md`.

- [ ] **Step 3: Verify the claim set**

```bash
grep -inE 'notariz|sync|share|windows|linux|price|pricing|subscription|free trial' README.md
```

Expected: hits only where the README is *denying* the capability (not notarized, macOS-only). Any positive claim of cloud sync, sharing, Windows/Linux support, or pricing is a defect — `docs/PRODUCT.md` §3 lists these as claims that must stay honest.

- [ ] **Step 4: Verify links resolve**

```bash
for f in LICENSING.md CONTRIBUTING.md SECURITY.md LICENSE AGENTS.md docs/CONTEXT.md; do
  [ -e "$f" ] && echo "OK   $f" || echo "MISS $f"
done
```

Expected: `CONTRIBUTING.md` and `SECURITY.md` may report `MISS` if Task 6 has not run yet — that is fine within the branch, but both must exist before the PR is raised. Everything else must be `OK`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: repository README with status and disclaimer (<bead-id>)"
```

---

## Task 6: `SECURITY.md` and `CONTRIBUTING.md`

**Files:**
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the two files Task 5's README links to.

**Acceptance Criteria:**
- `SECURITY.md` sets alpha expectations, directs reporters to GitHub private vulnerability reporting, states scope, and offers no bug bounty.
- `CONTRIBUTING.md` states contributions are closed, explains why, frames the agent workflow files as documentation, and records human editorial control over the codebase.
- Neither file promises an email address (none exists yet — spec §9).

- [ ] **Step 1: Write `SECURITY.md`**

```markdown
# Security

## Status

Lodekit is alpha software. It has not been independently reviewed or
security-audited, and it does not yet offer stability or security-support
guarantees. Known security work in progress is tracked in the public issue
tracker.

Two properties are worth knowing before you run it:

- **Apps are not sandboxed.** App code runs in worker threads with your full
  user privileges and unrestricted access to the filesystem, the network, and
  child processes. Treat installing an app the way you would treat running any
  program on your machine.
- **Everything is local.** Lodekit stores data in SQLite on your own disk and
  does not send it anywhere.

## Reporting a vulnerability

Report privately through GitHub: go to the **Security** tab and choose
**Report a vulnerability**. This opens a private advisory visible only to the
maintainers.

Please do not open a public issue for a security problem.

Include what you need to make the problem reproducible: affected version,
platform, steps, and what an attacker gains. A proof of concept helps.

## What to expect

A single maintainer reads these. Expect an acknowledgement within a week. Fixes
are prioritised by what an attacker actually gains and how reachable the flaw is
in a default install.

There is no bug bounty, and none is planned.

## Scope

In scope: the engine, the manager, the MCP server, the SDK, and the UI library
in this repository.

Out of scope: apps you or your agent write on top of Lodekit; the documented
absence of app sandboxing described above; vulnerabilities in dependencies that
have no exploitable path through Lodekit (report those upstream).
```

- [ ] **Step 2: Write `CONTRIBUTING.md`**

```markdown
# Contributing

## Contributions are closed for now

Lodekit does not accept outside pull requests at this time. This is a
deliberate choice for the alpha, not a judgement about anyone's code, and it
will change as the project and the maintainer's review capacity mature.

Issues and pull requests are restricted to collaborators while this holds. If
you have found a bug or have an idea, forking and exploring is welcome — the
whole point of the license is that you can.

## The development process is public on purpose

`AGENTS.md`, `.agents/skills/`, `docs/specs/`, `docs/plans/`, and
`docs/decisions/` are not incidental artifacts. They are the engineering
documentation: the coding conventions, the review habits, the design reasoning,
and the workflow the agents working on this codebase are expected to follow.

If you want to understand how a decision was reached, the spec and plan for it
are in the repository. If you fork Lodekit and work on it with an agent of your
own, that process is yours to reuse — `.agents/skills/` is vendored from
upstream projects under their own licenses, recorded in `.agents/SOURCES.md`.

## How this codebase is written

Lodekit is written almost entirely by AI coding agents. Every change is
directed, reviewed, and accepted by a human maintainer, who holds editorial
control over the codebase and is accountable for what lands in it. The
specification and plan documents in `docs/` are the record of that direction.

We say this plainly because it is true and because it sets the right
expectations — see the disclaimer in the README.
```

- [ ] **Step 3: Verify no email is promised**

```bash
grep -inE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' SECURITY.md CONTRIBUTING.md
```

Expected: no output. No project address exists yet (spec §9); promising one would create a channel that bounces.

- [ ] **Step 4: Verify the lint still passes**

```bash
/tmp/reuse-venv/bin/reuse lint 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add SECURITY.md CONTRIBUTING.md
git commit -m "docs: SECURITY.md and CONTRIBUTING.md (<bead-id>)"
```

---

## Task 7: Sweep — genericise local paths

**Files:**
- Modify: `docs/plans/2026-07-02-manager-v0.1.md`, `docs/plans/2026-07-03-tanstack-start-host.md`, `docs/plans/2026-07-06-docs-site-v1.md`, `docs/plans/2026-07-07-tasks-change-bus-migration.md`, `docs/plans/2026-07-09-db-store.md`, `docs/plans/2026-07-10-release-pipeline.md`, `docs/plans/2026-07-12-docs-content-v1.md`, `docs/plans/2026-07-14-data-explorer.md`, `docs/plans/2026-07-14-ui-charts-data-table.md`, `docs/plans/2026-07-15-dev-flow-v2.md`, `docs/plans/2026-07-16-worktree-disk-usage.md`, `docs/plans/2026-07-17-engine-package-rename.md`, `docs/specs/2026-07-06-file-store-design.md`, `docs/specs/2026-07-15-dev-flow-v2-design.md`
- Modify: `docs/PRODUCT.md`

**Background:** 27 lines leak the maintainer's macOS username. Every one is prose in a completed plan or spec — historical execution context. No code reads them, no test asserts them. `manager/tests/paths.test.js` already uses a generic `/Users/someone` and is **not** touched. The three `/Users/jesse/…` hits under `.agents/skills/` are the upstream author's username in vendored files and are **not** touched — editing them would add an `SOURCES.md` divergence entry for no benefit.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Acceptance Criteria:**
- `git grep -nE "/Users/$(id -un)|Users-$(id -un)"` returns no hits in tracked files. Note the bare username is the wrong probe — it also matches the public GitHub handle `ulyssesv`; the leak is the home-directory path and its slug form.
- `.agents/skills/` is unmodified.
- `manager/tests/paths.test.js` is unmodified and `pnpm --filter @lodekit/manager test` still passes.
- `docs/PRODUCT.md` §3 no longer says OSS positioning is open.
- The open issue backlog has been skimmed and the outcome recorded for the PR body.

- [ ] **Step 1: Write the failing check**

```bash
cd "$(git rev-parse --show-toplevel)"
U=$(id -un)
git grep -cE "/Users/$U|Users-$U" -- . | sort -t: -k2 -rn
git grep -lE "/Users/$U|Users-$U" -- . | wc -l
```

Expected: FAIL — 13 files listed.

- [ ] **Step 2: Apply the three substitutions**

Three distinct shapes, in this order:

```bash
U=$(id -un)   # derived, so this file never quotes the home path it is removing

# 1 — worktree paths (20 occurrences)
git grep -l "/Users/$U/Code/worktrees/lodekit" -- docs \
  | xargs sed -i '' "s#/Users/$U/Code/worktrees/lodekit#~/Code/worktrees/lodekit#g"

# 2 — dead session scratchpad paths (3 occurrences, all in one file)
sed -i '' "s#/private/tmp/claude-501/-Users-$U-Code-worktrees-lodekit-docs/[0-9a-f-]*/scratchpad#<scratchpad>#g" \
  docs/plans/2026-07-12-docs-content-v1.md

# 3 — Claude project-directory slug (2 occurrences)
git grep -l "Users-$U-Code-github-lodekit" -- docs \
  | xargs sed -i '' "s#-Users-$U-Code-github-lodekit#<project-slug>#g"
```

**Exclude this plan and its spec** from the sweep — both quote the path shapes in
order to describe the work, and a literal pass over them corrupts their own
examples (the substitution turns an illustrative command into a no-op and
collapses an audit table's before/after columns). They are redacted by hand
instead, using `<user>` in prose and `$(id -un)` in commands.

`~/Code/worktrees/lodekit/` is a safe replacement: these are historical records of how *this* project was worked, so the convention is accurate, the paths were in fact under a home directory, and nothing resolves them at runtime.

Note the BSD `sed -i ''` form — this is macOS.

- [ ] **Step 3: Re-run the check to verify it passes**

```bash
git grep -nE "/Users/$(id -un)|Users-$(id -un)" -- . ; echo "exit=$?"
```

Expected: PASS — no output, `exit=1` (grep's no-match code).

- [ ] **Step 4: Verify nothing outside `docs/` was touched**

```bash
git status --short
```

Expected: only `docs/plans/*.md` and `docs/specs/*.md` modified. If `.agents/` or `manager/` appears, revert those files:

```bash
git checkout -- .agents manager
```

- [ ] **Step 5: Update the one stale line in `docs/PRODUCT.md`**

In §3 `Key assumptions & open questions`, replace:

```
  - OSS/community positioning is open.
```

with:

```
  - OSS positioning is settled: AGPL-3.0-only product, Apache-2.0 for
    everything a user's app touches; contributions closed through alpha.
    See `LICENSING.md` and `CONTRIBUTING.md`.
```

`AGENTS.md` designates PRODUCT.md a steering doc to be consulted before any outward-facing prose, and this work is exactly that — leaving the line stale would misdirect the next agent writing public copy.

- [ ] **Step 6: Skim the public issue backlog**

Spec §6.4. The 54 non-security open issues become publicly readable at the flip. A visible known-gaps list reads as honesty, so this is a skim for anything careless — not a rewrite.

```bash
gh issue list --state open --limit 100 --json number,title \
  --jq '.[] | "\(.number)\t\(.title)"'
```

Read the titles. Flag to the person — do not edit unilaterally — any issue whose **title** contains a customer or third-party name, an internal-only judgement about a person or company, or a credential-shaped string. Titles are what a visitor scans; bodies are a second pass only if a title is suspicious.

Record the outcome (`skimmed, N flagged`) in the PR body's Notes. Editing issue text is the person's call.

- [ ] **Step 7: Verify the manager suite still passes**

```bash
pnpm --filter @lodekit/manager test 2>&1 | tail -5
```

Expected: all pass — `paths.test.js` was not touched.

- [ ] **Step 8: Commit**

```bash
git add docs
git commit -m "docs: genericise local worktree paths; settle OSS positioning in PRODUCT.md (<bead-id>)"
```

---

## Task 8: Changelog and full verification

**Files:**
- Modify: `docs/changelog.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence the PR body cites.

**Acceptance Criteria:**
- `docs/changelog.md` has one appended `## New` entry describing the licensing, in user-facing terms.
- Every check in the table below passes, with output captured for the PR's test plan.

- [ ] **Step 1: Append the changelog entry**

`docs/changelog.md` is append-only for agents. Add under `## New`:

```markdown
- Lodekit is open source. The engine and manager are AGPL-3.0-only; the SDK, UI
  library, MCP server, Claude skill, and example apps are Apache-2.0, so apps
  you build on Lodekit stay yours. See `LICENSING.md`.
```

- [ ] **Step 2: Run every check**

```bash
cd "$(git rev-parse --show-toplevel)"

echo "=== reuse lint ==="
/tmp/reuse-venv/bin/reuse lint 2>&1 | tail -3

echo "=== licensing boundary still correct ==="
python3 /tmp/check-boundary.py

echo "=== manifest license fields ==="
python3 /tmp/check-licenses.py

echo "=== no leaked home path ==="
git grep -nE "/Users/$(id -un)|Users-$(id -un)" -- . && echo "FAIL: home path present" || echo "OK: clean"

echo "=== launch files present ==="
for f in LICENSE NOTICE LICENSING.md README.md SECURITY.md CONTRIBUTING.md REUSE.toml \
         LICENSES/AGPL-3.0-only.txt LICENSES/Apache-2.0.txt LICENSES/MIT.txt \
         .github/workflows/reuse.yml; do
  [ -e "$f" ] && echo "OK   $f" || echo "MISS $f"
done

echo "=== full test suite ==="
pnpm test 2>&1 | tail -15
```

Expected: reuse lint compliant; every manifest `OK`; `OK: clean`; every launch file `OK`; `pnpm test` green.

- [ ] **Step 3: Commit**

```bash
git add docs/changelog.md
git commit -m "docs: changelog entry for open-source licensing (<bead-id>)"
```

- [ ] **Step 4: Raise the PR**

Push the branch and open a PR titled `feat: open-source release readiness`. Body carries **Summary** (the licensing split and why the boundary sits where it does), **Notes** (what was deliberately not created — `THIRD-PARTY-NOTICES`, `CODE_OF_CONDUCT.md`, PR/issue templates — and why; plus the launch-gate items in spec §8 that remain open), and **Test plan** (the Step 2 output).

**Do not merge.** Merging is the person's call.

---

## Launch gate — not part of this plan

Recorded here so the PR body can reference it. Ticked by the person, after this work merges:

- [ ] Security findings #87–#97 resolved.
- [ ] Repo description and homepage set.
- [ ] Private vulnerability reporting enabled (Settings → Security) — `SECURITY.md` directs reporters there, so this must be on before the flip or the instruction is dead.
- [ ] Flip visibility to public.
- [ ] **Post-flip:** interaction limit → "Collaborators only". GitHub rejects this on private repos (HTTP 405, verified), so it cannot be done earlier. It expires after at most 6 months and silently reopens — put the renewal on a calendar.
- [ ] **Post-flip:** confirm GitHub's license detector reads `AGPL-3.0-only`.
