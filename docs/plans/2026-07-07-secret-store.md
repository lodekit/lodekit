# Secret-store v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The secret-store service per `docs/specs/2026-07-07-secret-store-design.md`: a person-owned encrypted secret catalog, app-declared slots, person-made links, and a worker-token-enforced server-only value read.

**Architecture:** A platform SQLite store (`data/_platform/secrets.sqlite`) holds AES-256-GCM-encrypted values (master key in the macOS Keychain via the `security` CLI; 0600 key file for tests/non-darwin). Apps declare slots in `src/secrets.ts` (built as an extra ssr entry, registered via the worker-boot manifest — the settings mechanism verbatim). Links `(appId, slot) → slug` are the grant. The only value-bearing route requires a per-spawn worker token injected into app-worker env.

**Tech Stack:** Node/Hono/tsx (buildless runtime), better-sqlite3, zod + `@hono/zod-validator`, Node `crypto` (AES-256-GCM), vitest, TanStack Start dashboard with `@lodekit/ui`.

## Global Constraints

- Catalog name **`secret-store`**, SDK handle **`secrets`** (context.md mapping). Change event type is **`secrets-change`** (spec §8 — NOT `secret-store-change`).
- Routes (spec §8): platform `/api/secrets`, per-app `/api/apps/:appId/secrets`. The ONLY route that ever returns a value is `GET /api/apps/:appId/secrets/:slot/value`.
- Secret values: strings, max **4096 bytes** (UTF-8), non-empty. Never in any list/GET payload, log record, or event payload.
- Crypto: **AES-256-GCM**, 12-byte random nonce per write, 16-byte auth tag appended to the ciphertext BLOB. Tamper → typed error, never garbage output.
- Keychain item: service **`Lodekit`**, account **`secret-store-master-key`**, value = 64-char hex (32 bytes). Provider failure → 503, **never** a plaintext fallback.
- Slot grammar: `/^[a-z0-9_]+$/`, max 64 (the settings app-key grammar). Slug grammar: file-store `slugify` output, `/^[a-z0-9][a-z0-9-]*$/`, max 128.
- HTTP error mapping: `SecretsUnavailableError` → 503, `SecretUnlinkedError` → 409, `SecretsNotFoundError` → 404, `SecretsError` → 400, worker-token failure → 401.
- Commit style: match repo (`feat(runtime): …`, `docs(specs): …`). **No `Co-Authored-By` trailers** (CLAUDE.md).
- Surgical changes only; match existing file style (2-space indent, comment style of neighbors).
- All work on the current `service` branch (already a worktree branch; per CLAUDE.md, never fold to master unattended).

---

### Task 1: Config — key-provider selection

**Files:**
- Modify: `packages/runtime/src/config.ts`
- Test: `packages/runtime/tests/config.test.ts`

**Interfaces:**
- Produces: `Config.secretsKeyProvider: "keychain" | "file"` — env `LODEKIT_SECRETS_KEY_PROVIDER` override; default `"keychain"` on darwin, `"file"` elsewhere. Consumed by Task 2's `getMasterKey(cfg)` and every test that must avoid the real Keychain.

- [ ] **Step 1: Write the failing tests** — append to `packages/runtime/tests/config.test.ts` inside its existing `describe` (match the file's env set/delete pattern, e.g. the `LODEKIT_STATE_DIR` cases at lines ~44–53):

```ts
it("defaults secretsKeyProvider by platform", () => {
  delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  const cfg = loadConfig();
  expect(cfg.secretsKeyProvider).toBe(process.platform === "darwin" ? "keychain" : "file");
});

it("honors LODEKIT_SECRETS_KEY_PROVIDER=file and ignores junk values", () => {
  process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";
  expect(loadConfig().secretsKeyProvider).toBe("file");
  process.env.LODEKIT_SECRETS_KEY_PROVIDER = "vault9000";
  expect(loadConfig().secretsKeyProvider).toBe(process.platform === "darwin" ? "keychain" : "file");
  delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/config.test.ts`
Expected: FAIL — `secretsKeyProvider` does not exist on `Config`.

- [ ] **Step 3: Implement** — in `packages/runtime/src/config.ts`, add to the `Config` interface after `baseUrl: string;`:

```ts
  secretsKeyProvider: "keychain" | "file";
```

In `loadConfig()`, before the `return`:

```ts
  // Secret-store master-key provider (secret-store spec §4): keychain on darwin,
  // 0600 key file elsewhere; tests force "file" to never touch the real Keychain.
  const envProvider = process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  const secretsKeyProvider: "keychain" | "file" =
    envProvider === "keychain" || envProvider === "file"
      ? envProvider
      : process.platform === "darwin" ? "keychain" : "file";
```

and add `secretsKeyProvider,` to the returned object.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/config.test.ts`
Expected: PASS (all cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/config.ts packages/runtime/tests/config.test.ts
git commit -m "feat(runtime): config gains secretsKeyProvider (keychain on darwin, file elsewhere)"
```

---

### Task 2: Master-key providers

**Files:**
- Create: `packages/runtime/src/keyProvider.ts`
- Test: `packages/runtime/tests/key-provider.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces: `getMasterKey(cfg: Config): Buffer` (32 bytes; creates on first use), `class SecretsUnavailableError extends Error`. The keychain path shells out to `/usr/bin/security`; the file path uses `<cfg.stateDir>/secrets.key` (hex, mode 0600). Any failure throws `SecretsUnavailableError` — callers map it to HTTP 503.

- [ ] **Step 1: Write the failing tests** — create `packages/runtime/tests/key-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getMasterKey, SecretsUnavailableError } from "../src/keyProvider.js";
import type { Config } from "../src/config.js";

function fileCfg(stateDir: string): Config {
  return {
    root: "/x", appsDir: "/x/apps", dataDir: "/x/data", cacheDir: "/x/cache",
    stateDir, port: 0, baseUrl: "http://localhost:0", secretsKeyProvider: "file",
  };
}

describe("file key provider", () => {
  it("creates a 32-byte key on first use, 0600, and returns the same key thereafter", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    const k1 = getMasterKey(fileCfg(stateDir));
    expect(k1.length).toBe(32);
    const mode = fs.statSync(path.join(stateDir, "secrets.key")).mode & 0o777;
    expect(mode).toBe(0o600);
    const k2 = getMasterKey(fileCfg(stateDir));
    expect(k2.equals(k1)).toBe(true);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it("creates the state dir if missing", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    const stateDir = path.join(base, "nested", "state");
    expect(getMasterKey(fileCfg(stateDir)).length).toBe(32);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("throws SecretsUnavailableError on a malformed key file", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-key-"));
    fs.writeFileSync(path.join(stateDir, "secrets.key"), "not-hex-at-all\n");
    expect(() => getMasterKey(fileCfg(stateDir))).toThrow(SecretsUnavailableError);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/key-provider.test.ts`
Expected: FAIL — module `../src/keyProvider.js` not found.

- [ ] **Step 3: Implement** — create `packages/runtime/src/keyProvider.ts`:

```ts
// Master-key providers for the secret-store (spec 2026-07-07-secret-store §4).
// "keychain" (darwin default): one generic-password item created via the
// security CLI — the item's ACL attaches to the CLI, so the dev-tsx vs
// packaged-app code-identity difference never causes prompts. "file"
// (tests, non-darwin): a 0600 hex file under the State dir. A provider
// failure throws SecretsUnavailableError (routes 503) — never a plaintext
// fallback, and losing the key is recoverable by re-entering values.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Config } from "./config.js";

export class SecretsUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? "secret store unavailable");
    this.name = "SecretsUnavailableError";
  }
}

const SERVICE = "Lodekit";
const ACCOUNT = "secret-store-master-key";
const KEY_BYTES = 32;

export function getMasterKey(cfg: Config): Buffer {
  try {
    return cfg.secretsKeyProvider === "keychain" ? keychainKey() : fileKey(cfg.stateDir);
  } catch (e) {
    if (e instanceof SecretsUnavailableError) throw e;
    throw new SecretsUnavailableError(
      `secret store unavailable: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function readKeychain(): string {
  return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function keychainKey(): Buffer {
  try {
    return parseKey(readKeychain());
  } catch {
    // Not found (first use) — create below; a lost race just means the
    // add fails and the re-read returns the winner's key.
  }
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", randomBytes(KEY_BYTES).toString("hex")],
      { stdio: "ignore" }
    );
  } catch {
    // raced or denied — the re-read decides
  }
  return parseKey(readKeychain());
}

function fileKey(stateDir: string): Buffer {
  const file = path.join(stateDir, "secrets.key");
  if (fs.existsSync(file)) return parseKey(fs.readFileSync(file, "utf8").trim());
  fs.mkdirSync(stateDir, { recursive: true });
  const hex = randomBytes(KEY_BYTES).toString("hex");
  fs.writeFileSync(file, `${hex}\n`, { mode: 0o600 });
  return parseKey(hex);
}

function parseKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) throw new SecretsUnavailableError("master key is malformed");
  return key;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/key-provider.test.ts`
Expected: PASS. (The keychain branch is covered by the Task 11 manual darwin smoke — CI never touches the real Keychain.)

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/keyProvider.ts packages/runtime/tests/key-provider.test.ts
git commit -m "feat(runtime): secret-store master-key providers (keychain via security CLI, 0600 file fallback)"
```

---

### Task 3: Encrypted platform store — catalog, links, crypto

**Files:**
- Create: `packages/runtime/src/secretsStore.ts`
- Test: `packages/runtime/tests/secrets-store.test.ts`

**Interfaces:**
- Consumes: `getMasterKey`, `SecretsUnavailableError` (Task 2); `slugify` from `./services/file-store.js` (already exported there).
- Produces (all consumed by Tasks 5–6):
  - `initSecretStore(cfg: Config): boolean` / `closeSecretStoreForTest(): void` (the settings-store singleton pattern)
  - `interface SecretMeta { slug: string; label: string; description: string | null; createdAt: number; updatedAt: number; links: { appId: string; slot: string }[] }`
  - `createSecret(input: { label: string; description?: string; value: string }): SecretMeta`
  - `updateSecret(slug: string, patch: { label?: string; description?: string; value?: string }): SecretMeta`
  - `deleteSecret(slug: string): { removedLinks: { appId: string; slot: string }[] }`
  - `listSecrets(): SecretMeta[]`, `getSecretMeta(slug: string): SecretMeta | undefined`
  - `setLink(appId: string, slot: string, slug: string): void`, `deleteLink(appId: string, slot: string): boolean`, `getLinkedSecret(appId: string, slot: string): { slug: string; label: string } | undefined`, `pruneLinks(appId: string, keptSlots: Set<string>): { appId: string; slot: string }[]`
  - `readValue(appId: string, slot: string): string` — throws `SecretUnlinkedError` when no link, `SecretsUnavailableError` on key/tamper trouble
  - `encryptValue(key: Buffer, plaintext: string): { ciphertext: Buffer; nonce: Buffer }`, `decryptValue(key: Buffer, ciphertext: Buffer, nonce: Buffer): string` (exported for tests)
  - Error classes: `SecretsError` (400), `SecretsNotFoundError extends SecretsError` (404), `SecretUnlinkedError` (409); re-export `SecretsUnavailableError` (503)
  - `VALUE_MAX_BYTES = 4096`

- [ ] **Step 1: Write the failing tests** — create `packages/runtime/tests/secrets-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Config } from "../src/config.js";
import {
  initSecretStore, closeSecretStoreForTest,
  createSecret, updateSecret, deleteSecret, listSecrets, getSecretMeta,
  setLink, deleteLink, getLinkedSecret, pruneLinks, readValue,
  encryptValue, decryptValue,
  SecretsError, SecretsNotFoundError, SecretUnlinkedError, SecretsUnavailableError,
} from "../src/secretsStore.js";

let root: string, state: string;
function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secstore-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secstate-"));
  expect(initSecretStore(cfg())).toBe(true);
});
afterEach(() => {
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

describe("crypto primitives", () => {
  it("round-trips and uses a fresh nonce per write", () => {
    const key = randomBytes(32);
    const a = encryptValue(key, "hunter2");
    const b = encryptValue(key, "hunter2");
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(decryptValue(key, a.ciphertext, a.nonce)).toBe("hunter2");
  });

  it("a tampered ciphertext throws a typed error, never garbage", () => {
    const key = randomBytes(32);
    const { ciphertext, nonce } = encryptValue(key, "hunter2");
    ciphertext[0] ^= 0xff;
    expect(() => decryptValue(key, ciphertext, nonce)).toThrow(SecretsUnavailableError);
  });
});

describe("catalog", () => {
  it("creates with a derived slug, uniquified on collision", () => {
    const a = createSecret({ label: "OpenWeather key", value: "v1" });
    expect(a.slug).toBe("openweather-key");
    const b = createSecret({ label: "OpenWeather key!", value: "v2" });
    expect(b.slug).toBe("openweather-key-2");
  });

  it("rejects empty/oversized values and unusable labels", () => {
    expect(() => createSecret({ label: "K", value: "" })).toThrow(SecretsError);
    expect(() => createSecret({ label: "K", value: "x".repeat(4097) })).toThrow(SecretsError);
    expect(() => createSecret({ label: "???", value: "v" })).toThrow(SecretsError);
  });

  it("list/get return metadata only — no value fields anywhere", () => {
    createSecret({ label: "K", description: "d", value: "super-plain" });
    const all = listSecrets();
    expect(all).toHaveLength(1);
    expect(JSON.stringify(all)).not.toContain("super-plain");
    expect(Object.keys(all[0]).sort()).toEqual(["createdAt", "description", "label", "links", "slug", "updatedAt"]);
    expect(getSecretMeta("k")?.label).toBe("K");
  });

  it("update replaces value and metadata; 404s on unknown slug", () => {
    createSecret({ label: "K", value: "old" });
    updateSecret("k", { value: "new", label: "K2" });
    setLink("app-a", "api_key", "k");
    expect(readValue("app-a", "api_key")).toBe("new");
    expect(getSecretMeta("k")?.label).toBe("K2");
    expect(() => updateSecret("nope", { value: "x" })).toThrow(SecretsNotFoundError);
  });

  it("plaintext never lands on disk (main db + wal)", () => {
    createSecret({ label: "K", value: "hunter2-plaintext-marker" });
    const dir = path.join(root, "data", "_platform");
    const bytes = Buffer.concat(
      fs.readdirSync(dir)
        .filter((f) => f.startsWith("secrets.sqlite"))
        .map((f) => fs.readFileSync(path.join(dir, f)))
    );
    expect(bytes.includes(Buffer.from("hunter2-plaintext-marker"))).toBe(false);
  });
});

describe("links and value reads", () => {
  it("link → read → unlink → SecretUnlinkedError", () => {
    createSecret({ label: "K", value: "v" });
    expect(() => readValue("app-a", "api_key")).toThrow(SecretUnlinkedError);
    setLink("app-a", "api_key", "k");
    expect(getLinkedSecret("app-a", "api_key")).toEqual({ slug: "k", label: "K" });
    expect(readValue("app-a", "api_key")).toBe("v");
    expect(deleteLink("app-a", "api_key")).toBe(true);
    expect(deleteLink("app-a", "api_key")).toBe(false);
    expect(() => readValue("app-a", "api_key")).toThrow(SecretUnlinkedError);
  });

  it("linking to an unknown slug 404s; deleting a secret cascades links", () => {
    expect(() => setLink("app-a", "api_key", "ghost")).toThrow(SecretsNotFoundError);
    createSecret({ label: "K", value: "v" });
    setLink("app-a", "api_key", "k");
    setLink("app-b", "other_key", "k");
    const { removedLinks } = deleteSecret("k");
    expect(removedLinks).toHaveLength(2);
    expect(() => readValue("app-a", "api_key")).toThrow(SecretUnlinkedError);
    expect(() => deleteSecret("k")).toThrow(SecretsNotFoundError);
  });

  it("pruneLinks drops links whose slot is gone and reports them", () => {
    createSecret({ label: "K", value: "v" });
    setLink("app-a", "api_key", "k");
    setLink("app-a", "kept_key", "k");
    const removed = pruneLinks("app-a", new Set(["kept_key"]));
    expect(removed).toEqual([{ appId: "app-a", slot: "api_key" }]);
    expect(readValue("app-a", "kept_key")).toBe("v");
  });

  it("degrades typed when the store is closed", () => {
    closeSecretStoreForTest();
    expect(() => listSecrets()).toThrow(SecretsUnavailableError);
    expect(() => createSecret({ label: "K", value: "v" })).toThrow(SecretsUnavailableError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `packages/runtime/src/secretsStore.ts`:

```ts
// The secret-store's platform store (spec 2026-07-07-secret-store §4): the
// person's secret catalog + links, in data/_platform/secrets.sqlite (settings'
// singleton pattern). Only values are encrypted (AES-256-GCM, master key from
// keyProvider, fetched lazily and held in memory); names/metadata/links stay
// plaintext so the dashboard and MCP render without touching the key.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import { getMasterKey, SecretsUnavailableError } from "./keyProvider.js";
import { slugify } from "./services/file-store.js";

export { SecretsUnavailableError };

/** Validation/semantic error — mapped to HTTP 400 by the router. */
export class SecretsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "SecretsError";
  }
}

/** Unknown slug/slot — mapped to HTTP 404 by the router. */
export class SecretsNotFoundError extends SecretsError {
  constructor(message?: string) {
    super(message);
    this.name = "SecretsNotFoundError";
  }
}

/** Declared slot with no link (or linked secret gone) — mapped to HTTP 409. */
export class SecretUnlinkedError extends Error {
  constructor(message?: string) {
    super(message ?? "slot is not linked to a secret");
    this.name = "SecretUnlinkedError";
  }
}

export const VALUE_MAX_BYTES = 4096;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface SecretMeta {
  slug: string;
  label: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  links: { appId: string; slot: string }[];
}

// ---------- crypto ----------

export function encryptValue(key: Buffer, plaintext: string): { ciphertext: Buffer; nonce: Buffer } {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce };
}

export function decryptValue(key: Buffer, ciphertext: Buffer, nonce: Buffer): string {
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // Failed integrity check — a typed refusal, never garbage bytes.
    throw new SecretsUnavailableError("secret value failed its integrity check");
  }
}

// ---------- singleton store (settings' platform-db pattern) ----------

let db: Database.Database | null = null;
let cfgRef: Config | null = null;
let masterKey: Buffer | null = null;

export function initSecretStore(cfg: Config): boolean {
  db?.close();
  db = null;
  masterKey = null;
  cfgRef = cfg;
  try {
    const dir = path.join(cfg.dataDir, "_platform");
    fs.mkdirSync(dir, { recursive: true });
    db = new BetterSqlite3(path.join(dir, "secrets.sqlite"));
    db.pragma("journal_mode = WAL");
    db.exec(
      `CREATE TABLE IF NOT EXISTS secrets (
        slug        TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        description TEXT,
        ciphertext  BLOB NOT NULL,   -- AES-256-GCM output, auth tag appended
        nonce       BLOB NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS links (
        app_id    TEXT NOT NULL,
        slot      TEXT NOT NULL,
        slug      TEXT NOT NULL,
        linked_at INTEGER NOT NULL,
        PRIMARY KEY (app_id, slot)
      );`
    );
    return true;
  } catch (e) {
    db = null;
    process.stderr.write(`[secrets] secrets.sqlite unavailable — secret store degraded: ${e}\n`);
    return false;
  }
}

export function closeSecretStoreForTest(): void {
  db?.close();
  db = null;
  cfgRef = null;
  masterKey = null;
}

function store(): Database.Database {
  if (!db) throw new SecretsUnavailableError();
  return db;
}

// Lazily fetched, held for the process (spec §4); a provider failure is 503.
function key(): Buffer {
  if (!masterKey) {
    if (!cfgRef) throw new SecretsUnavailableError();
    masterKey = getMasterKey(cfgRef);
  }
  return masterKey;
}

// ---------- catalog ----------

function assertValue(value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new SecretsError("value must be a non-empty string");
  if (Buffer.byteLength(value, "utf8") > VALUE_MAX_BYTES) throw new SecretsError(`value exceeds ${VALUE_MAX_BYTES} bytes`);
}

function uniqueSlug(label: string): string {
  const base = slugify(label).slice(0, 120);
  if (!base) throw new SecretsError("label must contain letters or numbers");
  const exists = store().prepare("SELECT 1 FROM secrets WHERE slug = ?");
  if (!exists.get(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists.get(candidate)) return candidate;
  }
}

interface SecretRow {
  slug: string;
  label: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

function toMeta(r: SecretRow): SecretMeta {
  const links = store()
    .prepare("SELECT app_id, slot FROM links WHERE slug = ? ORDER BY app_id, slot")
    .all(r.slug) as { app_id: string; slot: string }[];
  return {
    slug: r.slug,
    label: r.label,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    links: links.map((l) => ({ appId: l.app_id, slot: l.slot })),
  };
}

export function createSecret(input: { label: string; description?: string; value: string }): SecretMeta {
  if (typeof input.label !== "string" || !input.label.trim()) throw new SecretsError("label is required");
  assertValue(input.value);
  const { ciphertext, nonce } = encryptValue(key(), input.value);
  const now = Date.now();
  const slug = uniqueSlug(input.label);
  store()
    .prepare(
      `INSERT INTO secrets (slug, label, description, ciphertext, nonce, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(slug, input.label.trim(), input.description ?? null, ciphertext, nonce, now, now);
  return getSecretMeta(slug)!;
}

export function updateSecret(
  slug: string,
  patch: { label?: string; description?: string; value?: string }
): SecretMeta {
  const row = store().prepare("SELECT slug, label, description, created_at, updated_at FROM secrets WHERE slug = ?").get(slug) as SecretRow | undefined;
  if (!row) throw new SecretsNotFoundError(`unknown secret "${slug}"`);
  if (patch.label !== undefined && !patch.label.trim()) throw new SecretsError("label cannot be empty");
  const now = Date.now();
  if (patch.value !== undefined) {
    assertValue(patch.value);
    const { ciphertext, nonce } = encryptValue(key(), patch.value);
    store().prepare("UPDATE secrets SET ciphertext = ?, nonce = ?, updated_at = ? WHERE slug = ?").run(ciphertext, nonce, now, slug);
  }
  if (patch.label !== undefined || patch.description !== undefined) {
    store()
      .prepare("UPDATE secrets SET label = ?, description = ?, updated_at = ? WHERE slug = ?")
      .run(patch.label?.trim() ?? row.label, patch.description !== undefined ? patch.description : row.description, now, slug);
  }
  return getSecretMeta(slug)!;
}

export function deleteSecret(slug: string): { removedLinks: { appId: string; slot: string }[] } {
  const s = store();
  const removedLinks = (s.prepare("SELECT app_id, slot FROM links WHERE slug = ?").all(slug) as { app_id: string; slot: string }[])
    .map((l) => ({ appId: l.app_id, slot: l.slot }));
  const txn = s.transaction(() => {
    const gone = s.prepare("DELETE FROM secrets WHERE slug = ?").run(slug);
    if (gone.changes === 0) throw new SecretsNotFoundError(`unknown secret "${slug}"`);
    s.prepare("DELETE FROM links WHERE slug = ?").run(slug);
  });
  txn();
  return { removedLinks };
}

export function listSecrets(): SecretMeta[] {
  const rows = store()
    .prepare("SELECT slug, label, description, created_at, updated_at FROM secrets ORDER BY label")
    .all() as SecretRow[];
  return rows.map(toMeta);
}

export function getSecretMeta(slug: string): SecretMeta | undefined {
  const row = store().prepare("SELECT slug, label, description, created_at, updated_at FROM secrets WHERE slug = ?").get(slug) as SecretRow | undefined;
  return row ? toMeta(row) : undefined;
}

// ---------- links (the grant, spec §2) ----------

export function setLink(appId: string, slot: string, slug: string): void {
  const s = store();
  if (!s.prepare("SELECT 1 FROM secrets WHERE slug = ?").get(slug)) {
    throw new SecretsNotFoundError(`unknown secret "${slug}"`);
  }
  s.prepare(
    `INSERT INTO links (app_id, slot, slug, linked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(app_id, slot) DO UPDATE SET slug = excluded.slug, linked_at = excluded.linked_at`
  ).run(appId, slot, slug, Date.now());
}

export function deleteLink(appId: string, slot: string): boolean {
  return store().prepare("DELETE FROM links WHERE app_id = ? AND slot = ?").run(appId, slot).changes > 0;
}

export function getLinkedSecret(appId: string, slot: string): { slug: string; label: string } | undefined {
  return store()
    .prepare(
      `SELECT s.slug, s.label FROM links l JOIN secrets s ON s.slug = l.slug
       WHERE l.app_id = ? AND l.slot = ?`
    )
    .get(appId, slot) as { slug: string; label: string } | undefined;
}

/** Wholesale-registration cleanup: drop links whose slot the app no longer declares. */
export function pruneLinks(appId: string, keptSlots: Set<string>): { appId: string; slot: string }[] {
  const rows = store().prepare("SELECT slot FROM links WHERE app_id = ?").all(appId) as { slot: string }[];
  const removed: { appId: string; slot: string }[] = [];
  for (const { slot } of rows) {
    if (keptSlots.has(slot)) continue;
    store().prepare("DELETE FROM links WHERE app_id = ? AND slot = ?").run(appId, slot);
    removed.push({ appId, slot });
  }
  return removed;
}

// ---------- the value read (the only decrypt path) ----------

export function readValue(appId: string, slot: string): string {
  const row = store()
    .prepare(
      `SELECT s.ciphertext, s.nonce FROM links l JOIN secrets s ON s.slug = l.slug
       WHERE l.app_id = ? AND l.slot = ?`
    )
    .get(appId, slot) as { ciphertext: Buffer; nonce: Buffer } | undefined;
  if (!row) throw new SecretUnlinkedError(`slot "${slot}" is not linked to a secret`);
  return decryptValue(key(), row.ciphertext, row.nonce);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-store.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/secretsStore.ts packages/runtime/tests/secrets-store.test.ts
git commit -m "feat(runtime): encrypted secret catalog + links store (AES-256-GCM at rest)"
```

---

### Task 4: Worker tokens — the server-only door's credential

**Files:**
- Modify: `packages/runtime/src/appWorker.ts`
- Test: `packages/runtime/tests/worker-token.test.ts`

**Interfaces:**
- Produces: `verifyWorkerToken(appId: string, token: string | undefined): boolean` (timing-safe) and test hook `setWorkerTokenForTest(appId: string, token: string | null): void` — consumed by Task 6's value route and its tests. `spawn()` injects `LODEKIT_WORKER_TOKEN` into worker env (consumed by the SDK, Task 7). Tokens are per-spawn, in-memory only, never persisted or logged.

- [ ] **Step 1: Write the failing test** — create `packages/runtime/tests/worker-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verifyWorkerToken, setWorkerTokenForTest } from "../src/appWorker.js";

describe("worker tokens", () => {
  it("rejects unknown apps, missing tokens, and wrong tokens; accepts the exact token", () => {
    expect(verifyWorkerToken("ghost-app", "anything")).toBe(false);
    setWorkerTokenForTest("app-a", "tok-secret");
    expect(verifyWorkerToken("app-a", undefined)).toBe(false);
    expect(verifyWorkerToken("app-a", "wrong")).toBe(false);
    expect(verifyWorkerToken("app-a", "tok-secret-longer")).toBe(false);
    expect(verifyWorkerToken("app-a", "tok-secret")).toBe(true);
    expect(verifyWorkerToken("app-b", "tok-secret")).toBe(false);
    setWorkerTokenForTest("app-a", null);
    expect(verifyWorkerToken("app-a", "tok-secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/worker-token.test.ts`
Expected: FAIL — `verifyWorkerToken` is not exported.

- [ ] **Step 3: Implement** — in `packages/runtime/src/appWorker.ts`:

Add to the imports at the top:

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";
```

After the `managed` map declaration (`const managed = new Map<string, Managed>();`), add:

```ts
// Per-spawn worker tokens (secret-store spec §7): the server-only door's
// credential. In-memory only — never persisted, never logged.
const workerTokens = new Map<string, string>();

export function verifyWorkerToken(appId: string, token: string | undefined): boolean {
  const expected = workerTokens.get(appId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test hook — routes tests mint a token without spawning a real worker. */
export function setWorkerTokenForTest(appId: string, token: string | null): void {
  if (token === null) workerTokens.delete(appId);
  else workerTokens.set(appId, token);
}
```

In `spawn()`, replace the `const worker = new Worker(ENTRY, {` block's `env` line. Before the `new Worker` call add:

```ts
  const workerToken = randomBytes(32).toString("hex");
  workerTokens.set(appId, workerToken);
```

and change the env line from:

```ts
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl },
```

to:

```ts
    env: { ...process.env, LODEKIT_BASE_URL: baseUrl, LODEKIT_WORKER_TOKEN: workerToken },
```

In `stopAppWorker()`, after `states.delete(appId);` add:

```ts
  workerTokens.delete(appId);
```

- [ ] **Step 4: Run to verify pass, plus the existing worker suite**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/worker-token.test.ts tests/appWorker.test.ts`
Expected: PASS — new test green, no regression in the worker suite.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/appWorker.ts packages/runtime/tests/worker-token.test.ts
git commit -m "feat(runtime): per-spawn worker tokens for the server-only secrets door"
```

---

### Task 5: Slot declarations — registration pipeline

**Files:**
- Create: `packages/runtime/src/services/secret-store.ts` (slot half; routes arrive in Task 6)
- Modify: `packages/runtime/src/appWorkerEntry.mjs`, `packages/runtime/src/appWorker.ts`, `packages/runtime/src/build.ts`, `packages/runtime/src/server.ts`
- Test: `packages/runtime/tests/secrets-slots.test.ts`

**Interfaces:**
- Consumes: `getAppDb` (`../db.js`), `isValidAppId` (`../registry.js`), `emitEvent`/`PLATFORM_NS`/`CHANGE_FEED_TTL_S` (`../events.js`), `emitLog` (`../logger.js`), `pruneLinks` (Task 3), `initSecretStore` (Task 3).
- Produces:
  - `CATALOG_NAME = "secret-store"`, `SLOT_RE = /^[a-z0-9_]+$/`
  - `getSlotsDb(dataDir: string, appId: string): Database.Database` (ensures `_lodekit_secret_slots`)
  - `listSlots(db): { slot: string; def: { label: string; description: string } | null; error: string | null }[]`
  - `applySecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, now: number): void` (wholesale upsert + prune, incl. `pruneLinks`)
  - `registerSecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, loadError?: string): void`
  - `emitSecretsChange(ns: string, name: string): void` — platform ns → `{ slug: name }`, app ns → `{ slot: name }` payload
  - Worker protocol: `{ type: "secrets-manifest", slots: Record<string, {label, description}>, error? }`; `onSecretsManifest(cb)` hook on appWorker; `workerData.secretsEntry`; built bundle `server/secrets.js`.

- [ ] **Step 1: Write the failing tests** — create `packages/runtime/tests/secrets-slots.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import {
  getSlotsDb, listSlots, applySecretsManifest, registerSecretsManifest,
} from "../src/services/secret-store.js";
import {
  initSecretStore, closeSecretStoreForTest, createSecret, setLink, getLinkedSecret,
} from "../src/secretsStore.js";

let root: string, state: string;
function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
  };
}
const APP = "app-a";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-slots-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-slots-state-"));
  initSecretStore(cfg());
});
afterEach(() => {
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

describe("slot registration", () => {
  it("registers valid slots; a bad slot records its error without poisoning siblings", () => {
    applySecretsManifest(cfg(), APP, {
      api_key: { label: "API key", description: "For the external API." },
      broken: { label: "", description: "no label" },
      "Bad-Name": { label: "X", description: "bad key skipped entirely" },
    }, Date.now());
    const slots = listSlots(getSlotsDb(cfg().dataDir, APP));
    expect(slots.map((s) => s.slot).sort()).toEqual(["api_key", "broken"]);
    expect(slots.find((s) => s.slot === "api_key")?.def).toEqual({ label: "API key", description: "For the external API." });
    expect(slots.find((s) => s.slot === "broken")?.error).toBeTruthy();
    expect(slots.find((s) => s.slot === "broken")?.def).toBeNull();
  });

  it("wholesale re-registration prunes removed slots AND their links", () => {
    applySecretsManifest(cfg(), APP, {
      api_key: { label: "K", description: "d" },
      other_key: { label: "O", description: "d" },
    }, Date.now());
    createSecret({ label: "K", value: "v" });
    setLink(APP, "api_key", "k");
    setLink(APP, "other_key", "k");
    applySecretsManifest(cfg(), APP, { other_key: { label: "O", description: "d" } }, Date.now());
    expect(listSlots(getSlotsDb(cfg().dataDir, APP)).map((s) => s.slot)).toEqual(["other_key"]);
    expect(getLinkedSecret(APP, "api_key")).toBeUndefined();
    expect(getLinkedSecret(APP, "other_key")).toEqual({ slug: "k", label: "K" });
  });

  it("a load error keeps previous defs; an empty manifest for a data-less app materializes nothing", () => {
    applySecretsManifest(cfg(), APP, { api_key: { label: "K", description: "d" } }, Date.now());
    registerSecretsManifest(cfg(), APP, {}, "SyntaxError: boom");
    expect(listSlots(getSlotsDb(cfg().dataDir, APP)).map((s) => s.slot)).toEqual(["api_key"]);
    registerSecretsManifest(cfg(), "never-used-app", {});
    expect(fs.existsSync(path.join(cfg().dataDir, "never-used-app", "db.sqlite"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-slots.test.ts`
Expected: FAIL — module `../src/services/secret-store.js` not found.

- [ ] **Step 3: Implement the service's slot half** — create `packages/runtime/src/services/secret-store.ts`:

```ts
// The secret-store service (spec 2026-07-07-secret-store): the person's
// credentials. Person writes the catalog (dashboard/HTTP), apps declare slots
// (src/secrets.ts via the worker-boot manifest), the person links secrets to
// slots (the grant), and server-side app code reads values through the
// worker-token door. Catalog + links live in secretsStore; slot declarations
// live in the app's own db (settings' _lodekit_setting_defs pattern).
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getAppDb } from "../db.js";
import { isValidAppId } from "../registry.js";
import type { Config } from "../config.js";
import { emitEvent, PLATFORM_NS, CHANGE_FEED_TTL_S } from "../events.js";
import { emitLog } from "../logger.js";
import { pruneLinks, SecretsError } from "../secretsStore.js";

export const CATALOG_NAME = "secret-store";
// The change feed is named for the SDK handle (spec §8), not the catalog name.
const EVENT = "secrets-change";

export const SLOT_RE = /^[a-z0-9_]+$/;

export interface SlotDef {
  label: string;
  description: string;
}

// Identity-only change feed on the bus (settings' emit pattern): platform ns
// carries { slug }, app ns carries { slot } — names only, never values.
export function emitSecretsChange(ns: string, name: string): void {
  emitEvent({
    ns,
    source: PLATFORM_NS,
    type: EVENT,
    payload: ns === PLATFORM_NS ? { slug: name } : { slot: name },
    ttl: CHANGE_FEED_TTL_S,
  });
}

// ---------- slot declarations (per-app db) ----------

const ensured = new WeakSet<Database.Database>();

export function getSlotsDb(dataDir: string, appId: string): Database.Database {
  const db = getAppDb(dataDir, appId);
  if (!ensured.has(db)) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS _lodekit_secret_slots (
        slot          TEXT PRIMARY KEY,
        def           TEXT,          -- JSON SlotDef; NULL when the declaration failed
        error         TEXT,          -- per-slot declaration error (spec §5)
        registered_at INTEGER NOT NULL
      );`
    );
    ensured.add(db);
  }
  return db;
}

function validateSlotDef(slot: string, raw: unknown): SlotDef {
  const r = raw as Partial<SlotDef> | null;
  if (!r || typeof r !== "object") throw new SecretsError(`"${slot}" is not a slot definition`);
  if (typeof r.label !== "string" || !r.label.trim()) throw new SecretsError(`"${slot}" needs a label`);
  if (typeof r.description !== "string" || !r.description.trim()) throw new SecretsError(`"${slot}" needs a description`);
  return { label: r.label, description: r.description };
}

// Wholesale per successful boot (spec §5): slots absent from the manifest are
// removed and their links pruned; a bad slot registers with its error and
// never poisons siblings.
export function applySecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, now: number): void {
  const db = getSlotsDb(cfg.dataDir, appId);
  const kept = new Set<string>();
  const txn = db.transaction(() => {
    for (const [slot, raw] of Object.entries(slots)) {
      if (typeof slot !== "string" || !SLOT_RE.test(slot) || slot.length > 64) continue;
      kept.add(slot);
      let def: SlotDef | null = null, error: string | null = null;
      try {
        def = validateSlotDef(slot, raw);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      db.prepare(
        `INSERT INTO _lodekit_secret_slots (slot, def, error, registered_at)
         VALUES (@slot, @def, @error, @now)
         ON CONFLICT(slot) DO UPDATE SET def = excluded.def, error = excluded.error, registered_at = excluded.registered_at`
      ).run({ slot, def: def ? JSON.stringify(def) : null, error, now });
    }
    const existing = db.prepare("SELECT slot FROM _lodekit_secret_slots").all() as { slot: string }[];
    for (const { slot } of existing) {
      if (!kept.has(slot)) db.prepare("DELETE FROM _lodekit_secret_slots WHERE slot = ?").run(slot);
    }
  });
  txn();
  try {
    pruneLinks(appId, kept);
  } catch {
    // links live in the platform store — if it's degraded, stale links are
    // harmless (readValue is equally degraded) and re-pruned next boot
  }
}

// The onSecretsManifest callback: a worker booted and reported its declared
// slots. A load error is NOT an empty manifest — previous slots survive it.
export function registerSecretsManifest(cfg: Config, appId: string, slots: Record<string, unknown>, loadError?: string): void {
  if (!isValidAppId(appId)) return; // _dashboard sits outside the app-id grammar
  if (loadError) {
    emitLog("error", "secrets", "secrets module failed to load", { stack: loadError }, appId);
    emitSecretsChange(appId, "*");
    return;
  }
  // Never materialize a data dir for an app that has never used secrets.
  if (Object.keys(slots).length === 0 && !fs.existsSync(path.join(cfg.dataDir, appId, "db.sqlite"))) return;
  applySecretsManifest(cfg, appId, slots, Date.now());
  emitSecretsChange(appId, "*"); // slots changed — dashboard refetches
}

export function listSlots(db: Database.Database): { slot: string; def: SlotDef | null; error: string | null }[] {
  const rows = db.prepare("SELECT slot, def, error FROM _lodekit_secret_slots ORDER BY slot").all() as
    { slot: string; def: string | null; error: string | null }[];
  return rows.map((r) => ({ slot: r.slot, def: r.def ? (JSON.parse(r.def) as SlotDef) : null, error: r.error }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the worker pipeline** (no new unit test — the e2e in Task 10 covers it end to end; each edit mirrors the settings twin sitting beside it):

**`packages/runtime/src/appWorkerEntry.mjs`** — extend the protocol comment's worker→main line with `| { type:"secrets-manifest", slots:{...}, error? }`, and after the settings-manifest block (ends `parentPort.postMessage({ type: "settings-manifest", fields: {} });`), add:

```js
// Secrets manifest from the app's built src/secrets.ts (secret-store spec §5):
// the DEFAULT export tagged by defineSecrets(). Slots are plain data. An
// import failure is reported, never fatal — the runtime keeps previous slots.
if (workerData.secretsEntry) {
  try {
    const mod = await import(workerData.secretsEntry);
    const def = mod.default;
    if (def && def.__lodekitSecrets === true && def.slots && typeof def.slots === "object") {
      parentPort.postMessage({ type: "secrets-manifest", slots: { ...def.slots } });
    } else {
      parentPort.postMessage({
        type: "secrets-manifest", slots: {},
        error: "src/secrets.ts has no defineSecrets(...) default export",
      });
    }
  } catch (e) {
    parentPort.postMessage({ type: "secrets-manifest", slots: {}, error: e?.stack ?? String(e) });
  }
} else {
  parentPort.postMessage({ type: "secrets-manifest", slots: {} });
}
```

**`packages/runtime/src/appWorker.ts`** — mirror the settings-manifest plumbing exactly:

After the `onSettingsManifest` block add:

```ts
let secretsManifestCb: ((appId: string, slots: Record<string, unknown>, error?: string) => void) | undefined;

/** Secrets hook (single, last-wins): fired once per worker boot with the app's declared slots. */
export function onSecretsManifest(cb: (appId: string, slots: Record<string, unknown>, error?: string) => void): void {
  secretsManifestCb = cb;
}
```

In `spawn()`, after `const settingsEntry = …` add:

```ts
  const secretsEntry = path.join(cfg.cacheDir, appId, "server", "secrets.js");
```

and in the `workerData` object, after the `settingsEntry` line add:

```ts
      secretsEntry: fs.existsSync(secretsEntry) ? secretsEntry : null,
```

In the `worker.on("message", …)` handler, after the `settings-manifest` line add:

```ts
    if (msg.type === "secrets-manifest") { secretsManifestCb?.(appId, msg.slots ?? {}, msg.error); return; }
```

**`packages/runtime/src/build.ts`** — after the settings-entry build block (ends with its closing `}`), add a copy with the names swapped:

```ts
  // The secrets entry (secret-store spec §5): src/secrets.ts becomes a separate
  // self-contained ssr bundle beside server.js — same mechanism as settings.js.
  const secretsSource = path.join(fs.realpathSync(t.rootDir), "src", "secrets.ts");
  if (fs.existsSync(secretsSource)) {
    await build({
      configFile: false,
      root: fs.realpathSync(t.rootDir),
      logLevel: "silent",
      define: { __LODEKIT_APP_ID__: JSON.stringify(t.appId), ...t.defines },
      plugins: [deepImportResolver()],
      resolve: { alias: appAliases(themeOverridesFile) },
      ssr: { noExternal: true },
      build: {
        ssr: secretsSource,
        outDir: path.join(t.outDir, "server"),
        emptyOutDir: false,
        rollupOptions: {
          output: { entryFileNames: "secrets.js", chunkFileNames: "assets/secrets-[name]-[hash].js" },
        },
      },
    });
  }
```

**`packages/runtime/src/server.ts`** — import and wire beside the settings equivalents:

- Add `onSecretsManifest` to the existing `./appWorker.js` import.
- Add imports: `import { initSecretStore } from "./secretsStore.js";` and `import { registerSecretsManifest } from "./services/secret-store.js";`
- After `initSettingsStore(cfg.dataDir);` (line ~161) add: `initSecretStore(cfg);`
- After the `onSettingsManifest(…)` line (~175) add:

```ts
  onSecretsManifest((appId, slots, error) => registerSecretsManifest(cfg, appId, slots, error));
```

- [ ] **Step 6: Run the adjacent suites to catch wiring regressions**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-slots.test.ts tests/appWorker.test.ts tests/settings-api.test.ts`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/services/secret-store.ts packages/runtime/src/appWorkerEntry.mjs packages/runtime/src/appWorker.ts packages/runtime/src/build.ts packages/runtime/src/server.ts packages/runtime/tests/secrets-slots.test.ts
git commit -m "feat(runtime): secret slot declarations — src/secrets.ts build entry + worker-boot registration"
```

---

### Task 6: HTTP surface — catalog, links, and the value door

**Files:**
- Modify: `packages/runtime/src/services/secret-store.ts` (append the routers), `packages/runtime/src/routes.ts`
- Test: `packages/runtime/tests/secrets-api.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5; `verifyWorkerToken`/`setWorkerTokenForTest` (Task 4); `zValidator` + `validationHook` (existing).
- Produces:
  - `platformSecretsRoutes` mounted at `/api/secrets`: `GET /` → `{ secrets: SecretMeta[] }`; `POST /` `{ label, description?, value }` → 201 `SecretMeta`; `PUT /:slug` `{ label?, description?, value? }` → `SecretMeta`; `DELETE /:slug` → `{ ok: true }`.
  - `appSecretsRoutes` + `withSecrets(cfg)` mounted at `/api/apps/:appId/secrets`: `GET /` → `{ slots: [{ slot, label, description, error, status: "linked" | "pending", secret: { slug, label } | null }] }`; `PUT /:slot/link` `{ slug }` → `{ ok: true }`; `DELETE /:slot/link` → `{ ok: true }`; `GET /:slot/value` → `{ value }` (worker token required).
  - `export type SecretsRoutes = typeof appSecretsRoutes;` (SDK, Task 7 — though the SDK's value read uses plain `fetch` for the header, the type is exported for symmetry/future use).
  - Header name: **`x-lodekit-worker-token`**.

- [ ] **Step 1: Write the failing tests** — create `packages/runtime/tests/secrets-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Config } from "../src/config.js";
import { platformSecretsRoutes, appSecretsRoutes, withSecrets, applySecretsManifest } from "../src/services/secret-store.js";
import { initSecretStore, closeSecretStoreForTest } from "../src/secretsStore.js";
import { setWorkerTokenForTest } from "../src/appWorker.js";

let root: string, state: string, app: Hono;
const APP = "app-a";
const TOKEN = "test-worker-token";

function cfg(): Config {
  return {
    root, appsDir: path.join(root, "apps"), dataDir: path.join(root, "data"),
    cacheDir: path.join(root, "cache"), stateDir: state, port: 0,
    baseUrl: "http://localhost:0", secretsKeyProvider: "file",
  };
}
const req = (p: string, init?: RequestInit) => app.request(p, init);
const json = (body: unknown, method = "POST"): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secapi-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secapi-state-"));
  initSecretStore(cfg());
  applySecretsManifest(cfg(), APP, { api_key: { label: "API key", description: "d" } }, Date.now());
  setWorkerTokenForTest(APP, TOKEN);
  app = new Hono()
    .route("/api/secrets", platformSecretsRoutes)
    .use(`/api/apps/:appId/secrets/*`, withSecrets(cfg()))
    .route("/api/apps/:appId/secrets", appSecretsRoutes);
});
afterEach(() => {
  setWorkerTokenForTest(APP, null);
  closeSecretStoreForTest();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
});

async function createK(): Promise<string> {
  const r = await req("/api/secrets", json({ label: "OpenWeather key", description: "wx", value: "s3cr3t" }));
  expect(r.status).toBe(201);
  return (await r.json()).slug;
}

describe("platform catalog", () => {
  it("CRUD round-trips; no payload ever contains a value", async () => {
    const slug = await createK();
    expect(slug).toBe("openweather-key");
    const list = await (await req("/api/secrets")).json();
    expect(JSON.stringify(list)).not.toContain("s3cr3t");
    expect(list.secrets[0].label).toBe("OpenWeather key");
    const upd = await req(`/api/secrets/${slug}`, json({ value: "s3cr3t-2", label: "OW key" }, "PUT"));
    expect(upd.status).toBe(200);
    expect(JSON.stringify(await upd.json())).not.toContain("s3cr3t");
    expect((await req("/api/secrets/ghost", json({ value: "x" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/secrets/${slug}`, { method: "DELETE" })).status).toBe(200);
    expect((await req(`/api/secrets/${slug}`, { method: "DELETE" })).status).toBe(404);
  });

  it("validates create bodies (missing value 400, oversized value 400)", async () => {
    expect((await req("/api/secrets", json({ label: "K" }))).status).toBe(400);
    expect((await req("/api/secrets", json({ label: "K", value: "x".repeat(4097) }))).status).toBe(400);
  });
});

describe("app slots and links", () => {
  it("lists declared slots with link status; link/unlink round-trips", async () => {
    const slug = await createK();
    let doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots).toEqual([
      { slot: "api_key", label: "API key", description: "d", error: null, status: "pending", secret: null },
    ]);
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug }, "PUT"))).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots[0].status).toBe("linked");
    expect(doc.slots[0].secret).toEqual({ slug, label: "OpenWeather key" });
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, { method: "DELETE" })).status).toBe(200);
    doc = await (await req(`/api/apps/${APP}/secrets`)).json();
    expect(doc.slots[0].status).toBe("pending");
  });

  it("404s: undeclared slot link, unknown slug link, invalid app id 400", async () => {
    const slug = await createK();
    expect((await req(`/api/apps/${APP}/secrets/ghost_slot/link`, json({ slug }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug: "ghost" }, "PUT"))).status).toBe(404);
    expect((await req(`/api/apps/NOT!VALID/secrets`)).status).toBe(400);
  });
});

describe("the value door", () => {
  it("401 without/with a wrong token; 200 with the right one; 409 unlinked; 404 unknown slot", async () => {
    const slug = await createK();
    const value = (t?: string) =>
      req(`/api/apps/${APP}/secrets/api_key/value`, { headers: t ? { "x-lodekit-worker-token": t } : {} });
    expect((await value()).status).toBe(401);
    expect((await value("wrong")).status).toBe(401);
    expect((await value(TOKEN)).status).toBe(409); // declared but unlinked
    await req(`/api/apps/${APP}/secrets/api_key/link`, json({ slug }, "PUT"));
    const ok = await value(TOKEN);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ value: "s3cr3t" });
    const missing = await req(`/api/apps/${APP}/secrets/ghost_slot/value`, { headers: { "x-lodekit-worker-token": TOKEN } });
    expect(missing.status).toBe(404);
  });

  it("503 when the store is degraded", async () => {
    closeSecretStoreForTest();
    const r = await req(`/api/apps/${APP}/secrets/api_key/value`, { headers: { "x-lodekit-worker-token": TOKEN } });
    expect(r.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-api.test.ts`
Expected: FAIL — `platformSecretsRoutes` not exported.

- [ ] **Step 3: Implement the routers** — append to `packages/runtime/src/services/secret-store.ts`. Extend the imports at the top of the file: add `{ Hono, type MiddlewareHandler }` from `"hono"`, `{ zValidator }` from `"@hono/zod-validator"`, `{ z }` from `"zod"`, `{ validationHook }` from `"../validation.js"`, `{ verifyWorkerToken }` from `"../appWorker.js"`, and widen the `../secretsStore.js` import to:

```ts
import {
  pruneLinks, SecretsError, SecretsNotFoundError, SecretUnlinkedError, SecretsUnavailableError,
  createSecret, updateSecret, deleteSecret, listSecrets,
  setLink, deleteLink, getLinkedSecret, readValue, VALUE_MAX_BYTES,
} from "../secretsStore.js";
```

Then append:

```ts
// ---------- HTTP surface (spec §8) ----------

// Spec §8 error mapping, shared by both routers (settings' onError pattern).
function errStatus(err: unknown): 400 | 404 | 409 | 500 | 503 {
  if (err instanceof SecretsUnavailableError) return 503;
  if (err instanceof SecretUnlinkedError) return 409;
  if (err instanceof SecretsNotFoundError) return 404;
  if (err instanceof SecretsError) return 400;
  return 500;
}

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(128) });
const slotParam = z.object({ slot: z.string().regex(SLOT_RE).max(64) });
const createBody = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  value: z.string().min(1).max(VALUE_MAX_BYTES),
});
const updateBody = z
  .object({
    label: z.string().min(1).max(200).optional(),
    description: z.string().max(500).optional(),
    value: z.string().min(1).max(VALUE_MAX_BYTES).optional(),
  })
  .refine((b) => b.label !== undefined || b.description !== undefined || b.value !== undefined, {
    message: "nothing to update",
  });
const linkBody = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(128) });

export const platformSecretsRoutes = new Hono()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, errStatus(err)))
  .get("/", (c) => c.json({ secrets: listSecrets() }))
  .post("/", zValidator("json", createBody, validationHook), (c) => {
    const meta = createSecret(c.req.valid("json"));
    emitSecretsChange(PLATFORM_NS, meta.slug);
    return c.json(meta, 201);
  })
  .put("/:slug", zValidator("param", slugParam, validationHook), zValidator("json", updateBody, validationHook), (c) => {
    const { slug } = c.req.valid("param");
    const meta = updateSecret(slug, c.req.valid("json"));
    emitSecretsChange(PLATFORM_NS, slug);
    return c.json(meta);
  })
  .delete("/:slug", zValidator("param", slugParam, validationHook), (c) => {
    const { slug } = c.req.valid("param");
    const { removedLinks } = deleteSecret(slug);
    emitSecretsChange(PLATFORM_NS, slug);
    for (const l of removedLinks) emitSecretsChange(l.appId, l.slot); // cascaded → pending
    return c.json({ ok: true as const });
  });

export type PlatformSecretsRoutes = typeof platformSecretsRoutes;

export type SecretsEnv = { Variables: { slotsDb: Database.Database; appId: string } };

export function withSecrets(cfg: Config): MiddlewareHandler<SecretsEnv> {
  return async (c, next) => {
    const appId = c.req.param("appId");
    if (!appId || !isValidAppId(appId)) return c.json({ error: "invalid app id" }, 400);
    c.set("slotsDb", getSlotsDb(cfg.dataDir, appId));
    c.set("appId", appId);
    await next();
  };
}

// 404 gate shared by the slot routes: the slot must be declared.
function requireSlot(db: Database.Database, slot: string): void {
  if (!db.prepare("SELECT 1 FROM _lodekit_secret_slots WHERE slot = ?").get(slot)) {
    throw new SecretsNotFoundError(`unknown slot "${slot}"`);
  }
}

export const appSecretsRoutes = new Hono<SecretsEnv>()
  .onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, errStatus(err)))
  .get("/", (c) => {
    const slots = listSlots(c.var.slotsDb).map((s) => {
      const secret = s.def ? getLinkedSecret(c.var.appId, s.slot) ?? null : null;
      return {
        slot: s.slot,
        label: s.def?.label ?? null,
        description: s.def?.description ?? null,
        error: s.error,
        status: secret ? ("linked" as const) : ("pending" as const),
        secret,
      };
    });
    return c.json({ slots });
  })
  .put("/:slot/link", zValidator("param", slotParam, validationHook), zValidator("json", linkBody, validationHook), (c) => {
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    setLink(c.var.appId, slot, c.req.valid("json").slug);
    emitSecretsChange(c.var.appId, slot);
    return c.json({ ok: true as const });
  })
  .delete("/:slot/link", zValidator("param", slotParam, validationHook), (c) => {
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    deleteLink(c.var.appId, slot);
    emitSecretsChange(c.var.appId, slot);
    return c.json({ ok: true as const });
  })
  // The ONLY value-bearing route in the whole service (spec §8). Token first —
  // no oracle for probing link state without server-side standing (spec §7).
  .get("/:slot/value", zValidator("param", slotParam, validationHook), (c) => {
    if (!verifyWorkerToken(c.var.appId, c.req.header("x-lodekit-worker-token"))) {
      return c.json({ error: "secrets are server-only" }, 401);
    }
    const { slot } = c.req.valid("param");
    requireSlot(c.var.slotsDb, slot);
    return c.json({ value: readValue(c.var.appId, slot) });
  });

export type SecretsRoutes = typeof appSecretsRoutes;
```

Note: `getLinkedSecret` in the app `GET /` throws `SecretsUnavailableError` when the platform store is degraded — the whole listing 503s, which is the spec's degraded posture.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Mount in the API** — in `packages/runtime/src/routes.ts`, add to imports:

```ts
import { platformSecretsRoutes, appSecretsRoutes, withSecrets } from "./services/secret-store.js";
```

and in `apiRoutes()`, directly after the two settings mount lines (`.use(`/apps/:appId/${SETTINGS}/*`, …)` / `.route(…)`), add:

```ts
    .route("/secrets", platformSecretsRoutes)
    .use("/apps/:appId/secrets/*", withSecrets(cfg))
    .route("/apps/:appId/secrets", appSecretsRoutes)
```

(Values are ≤4 kb — the mounts sit after the global 100 kb `bodyLimit`, like settings.)

- [ ] **Step 6: Run the full runtime suite (fast tests only) to catch mount conflicts**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/api.test.ts tests/secrets-api.test.ts tests/settings-api.test.ts tests/kv-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/services/secret-store.ts packages/runtime/src/routes.ts packages/runtime/tests/secrets-api.test.ts
git commit -m "feat(runtime): secret-store HTTP surface — catalog, links, worker-token value door"
```

---

### Task 7: SDK — `defineSecrets` + the server-only `secrets.get`

**Files:**
- Create: `packages/sdk/src/secrets.ts`
- Modify: `packages/sdk/src/client.ts`, `packages/sdk/src/index.ts`
- Test: `packages/sdk/tests/secrets.test.ts`

**Interfaces:**
- Consumes: `GET /api/apps/:appId/secrets/:slot/value` with header `x-lodekit-worker-token` (Task 6); env `LODEKIT_WORKER_TOKEN` (Task 4) + `LODEKIT_BASE_URL` (existing).
- Produces:
  - `secret(cfg: { label: string; description: string }): SecretSlotDef` builder; `defineSecrets<S>(slots: S): DefinedSecrets<S>` with `__lodekitSecrets: true`, `slots`, typed `get(slot)` (the appWorkerEntry marker contract from Task 5).
  - `class SecretUnavailableError extends Error { reason: "unlinked" | "unavailable" }`.
  - `Secrets` interface on the client: `{ get(slot: string): Promise<string> }`; `LodekitClient.secrets`; singleton export `secrets` from the SDK index.
  - Browser/no-token call → plain `Error("secrets are server-only; call secrets.get() from a server function")` before any request.

- [ ] **Step 1: Write the failing tests** — create `packages/sdk/tests/secrets.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineSecrets, secret, SecretUnavailableError } from "../src/secrets.js";
import { createClient } from "../src/client.js";

describe("defineSecrets", () => {
  it("tags and validates", () => {
    const d = defineSecrets({ api_key: secret({ label: "API key", description: "For the API." }) });
    expect(d.__lodekitSecrets).toBe(true);
    expect(d.slots.api_key.label).toBe("API key");
  });

  it("rejects bad keys and missing label/description", () => {
    expect(() => defineSecrets({ "Bad-Key": secret({ label: "x", description: "y" }) })).toThrow(/invalid slot/);
    expect(() => defineSecrets({ ok: { label: "", description: "y" } })).toThrow(/label/);
    expect(() => defineSecrets({ ok: { label: "x", description: "" } })).toThrow(/description/);
  });
});

describe("secrets.get", () => {
  const client = () => createClient({ baseUrl: "http://runtime.test", appId: "app-a" }).secrets;

  beforeEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
  });
  afterEach(() => {
    delete process.env.LODEKIT_WORKER_TOKEN;
    vi.unstubAllGlobals();
  });

  it("fails fast without a worker token (browser / non-worker context)", async () => {
    await expect(client().get("api_key")).rejects.toThrow(/server-only/);
  });

  it("sends the token header and returns the value", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: "v" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await client().get("api_key")).toBe("v");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://runtime.test/api/apps/app-a/secrets/api_key/value");
    expect((init.headers as Record<string, string>)["x-lodekit-worker-token"]).toBe("tok");
  });

  it("maps 409 → unlinked and 503 → unavailable", async () => {
    process.env.LODEKIT_WORKER_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not linked" }), { status: 409 })));
    await expect(client().get("api_key")).rejects.toMatchObject({ name: "SecretUnavailableError", reason: "unlinked" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "degraded" }), { status: 503 })));
    await expect(client().get("api_key")).rejects.toMatchObject({ name: "SecretUnavailableError", reason: "unavailable" });
    expect(SecretUnavailableError.name).toBe("SecretUnavailableError");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/sdk exec vitest run tests/secrets.test.ts`
Expected: FAIL — `../src/secrets.js` not found.

- [ ] **Step 3: Implement.**

**Create `packages/sdk/src/secrets.ts`:**

```ts
// The declaration side of the secret-store (spec 2026-07-07-secret-store §5):
// slot builders + a thin validator/tagger, PLUS the typed read facade.
// appWorkerEntry scans the built src/secrets.ts DEFAULT export for the
// __lodekitSecrets marker and posts `slots` as the secrets manifest; full
// validation is runtime-side. get() delegates to the SDK singleton's
// `secrets` handle (bound by index.ts at module init) — server-only.
import type { Secrets } from "./client.js";

export interface SecretSlotDef {
  label: string;
  description: string;
}

export const secret = (cfg: SecretSlotDef): SecretSlotDef => ({ ...cfg });

export type SecretSlots = Record<string, SecretSlotDef>;

/** Thrown by secrets.get(): reason "unlinked" (link it in the dashboard) or
 * "unavailable" (secret store degraded). Render a "configure me" state. */
export class SecretUnavailableError extends Error {
  constructor(
    public readonly reason: "unlinked" | "unavailable",
    message?: string
  ) {
    super(message ?? `secret ${reason}`);
    this.name = "SecretUnavailableError";
  }
}

export interface DefinedSecrets<S extends SecretSlots> {
  __lodekitSecrets: true;
  slots: S;
  get<K extends keyof S & string>(slot: K): Promise<string>;
}

const SLOT_RE = /^[a-z0-9_]+$/;

let bound: Secrets | null = null;
/** @internal wired by index.ts to the SDK singleton */
export function _bindSecrets(s: Secrets): void { bound = s; }
function handle(): Secrets {
  if (!bound) throw new Error("secrets unavailable (no bound client — outside an app build?)");
  return bound;
}

export function defineSecrets<S extends SecretSlots>(slots: S): DefinedSecrets<S> {
  for (const [key, s] of Object.entries(slots)) {
    if (!SLOT_RE.test(key) || key.length > 64) throw new Error(`defineSecrets(): invalid slot "${key}" (snake_case, max 64)`);
    if (typeof s?.label !== "string" || !s.label) throw new Error(`defineSecrets(): "${key}" needs a label`);
    if (typeof s?.description !== "string" || !s.description) throw new Error(`defineSecrets(): "${key}" needs a description`);
  }
  return {
    __lodekitSecrets: true,
    slots,
    get: (slot) => handle().get(slot),
  };
}
```

**Modify `packages/sdk/src/client.ts`:**

Add the import at the top (beside the route-type imports):

```ts
import { SecretUnavailableError } from "./secrets.js";
```

Add the interface near the `Settings` interface:

```ts
export interface Secrets {
  /** Server-only: reads a linked secret's value. Throws SecretUnavailableError
   * ("unlinked" | "unavailable") or a plain Error outside server context. */
  get(slot: string): Promise<string>;
}
```

Add `secrets: Secrets;` to the `LodekitClient` interface (beside `settings`).

In `createClient`, before the final `return`, add:

```ts
  // The secret-store's server-only door (spec §7): the worker token exists only
  // in app-worker env — browser code fails fast before any request. Plain fetch
  // (not hc): the token header decides access, and values must never be typed
  // into any shared channel.
  const secrets: Secrets = {
    async get(slot: string): Promise<string> {
      const token =
        typeof window === "undefined" && typeof process !== "undefined"
          ? process.env?.LODEKIT_WORKER_TOKEN
          : undefined;
      if (!token) throw new Error("secrets are server-only; call secrets.get() from a server function");
      const r = await fetch(`${baseUrl}/api/apps/${appId}/secrets/${encodeURIComponent(slot)}/value`, {
        headers: { "x-lodekit-worker-token": token },
      });
      if (r.ok) return ((await r.json()) as { value: string }).value;
      const body = (await r.json().catch(() => null)) as { error?: string } | null;
      if (r.status === 409) throw new SecretUnavailableError("unlinked", body?.error);
      if (r.status === 503) throw new SecretUnavailableError("unavailable", body?.error);
      throw new Error(body?.error ?? `secrets.get("${slot}") failed: ${r.status}`);
    },
  };
```

and change the return to `return { kv, files, logs, tasks, events, settings, secrets };`.

**Modify `packages/sdk/src/index.ts`:**

Add `Secrets,` to the type re-exports from `./client.js`. After the settings export/bind block, add:

```ts
import { _bindSecrets } from "./secrets.js";
export const secrets = client.secrets;
_bindSecrets(client.secrets);
export { defineSecrets, secret, SecretUnavailableError } from "./secrets.js";
export type { DefinedSecrets, SecretSlots, SecretSlotDef } from "./secrets.js";
```

- [ ] **Step 4: Run to verify pass, plus the SDK suite**

Run: `pnpm --filter @lodekit/sdk test`
Expected: PASS — new secrets tests green, existing client/settings/task tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/secrets.ts packages/sdk/src/client.ts packages/sdk/src/index.ts packages/sdk/tests/secrets.test.ts
git commit -m "feat(sdk): defineSecrets + server-only secrets.get with typed unavailability"
```

---

### Task 8: MCP — `lodekit_secrets_list` (names and wiring, never values)

**Files:**
- Modify: `packages/mcp/client.ts`, `packages/mcp/index.ts`
- Test: `packages/runtime/tests/mcp.test.ts` (the existing runtime↔MCP integration home)

**Interfaces:**
- Consumes: `GET /api/secrets` and `GET /api/apps/:appId/secrets` (Task 6).
- Produces: `fetchSecrets(base: string, appId?: string)` in `client.ts`; MCP tool `lodekit_secrets_list` with optional `appId`. **No value-read tool exists** (spec §10).

- [ ] **Step 1: Write the failing test** — in `packages/runtime/tests/mcp.test.ts`, add inside the existing `describe` (the file already boots a real server with temp env; reuse its `base` and note it already imports helpers via the relative reach-in `../../mcp/client.js`):

```ts
it("fetchSecrets lists the catalog and app slots — never values", async () => {
  const { fetchSecrets } = await import("../../mcp/client.js");
  const created = await fetch(`${base}/api/secrets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "MCP probe key", value: "mcp-probe-plaintext" }),
  });
  expect(created.status).toBe(201);
  const catalog = await fetchSecrets(base);
  expect(JSON.stringify(catalog)).toContain("mcp-probe-key");
  expect(JSON.stringify(catalog)).not.toContain("mcp-probe-plaintext");
});
```

(Adapt the import line to match how the file already imports from `../../mcp/client.js` — if it uses a top-level static import, extend that import list instead. The runtime's test env must set `LODEKIT_SECRETS_KEY_PROVIDER=file` in this file's `beforeAll` env block, beside its existing `LODEKIT_STATE_DIR` line: `process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";`, deleted in teardown.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/mcp.test.ts`
Expected: FAIL — `fetchSecrets` is not exported.

- [ ] **Step 3: Implement.**

**`packages/mcp/client.ts`** — append (the `fetchSettings` pattern):

```ts
export async function fetchSecrets(base: string, appId?: string) {
  const url = appId ? `${base}/api/apps/${appId}/secrets` : `${base}/api/secrets`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`secrets fetch failed: ${r.status}`);
  return r.json();
}
```

**`packages/mcp/index.ts`** — add `fetchSecrets` to the `./client.js` import list, and after the `lodekit_settings_get` tool add:

```ts
// Existence and wiring only (spec §10): the catalog's slugs/labels/links, or an
// app's slots with link status. No value-read tool exists — values never reach
// the agent; the person enters and links them in the dashboard.
server.tool(
  "lodekit_secrets_list",
  { appId: z.string().optional().describe("an app's declared slots + link status; omit for the person's secret catalog") },
  async ({ appId }) => text(await fetchSecrets(BASE, appId))
);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/client.ts packages/mcp/index.ts packages/runtime/tests/mcp.test.ts
git commit -m "feat(mcp): lodekit_secrets_list — names and link status, never values"
```

---

### Task 9: Dashboard — Secrets catalog page, app slots panel, pending badge

**Files:**
- Create: `packages/runtime/dashboard/src/routes/secrets.tsx`
- Modify: `packages/runtime/dashboard/src/routes/settings.tsx`, `packages/runtime/dashboard/src/routes/index.tsx`

**Interfaces:**
- Consumes: all Task 6 routes; `secrets-change` SSE (`d.ns` = `_platform` for catalog, app id for links); `@lodekit/ui` components already imported by the settings page.
- Produces: `/secrets` dashboard route; a Secrets card inside the settings page's `AppSection`; a pending-slots badge on the home-grid app cards; "Secrets" nav links. Value inputs are `type="password"`, never pre-filled, cleared after submit.

- [ ] **Step 1: Create the catalog page** — `packages/runtime/dashboard/src/routes/secrets.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Skeleton,
} from "@lodekit/ui";

export const Route = createFileRoute("/secrets")({ component: SecretsView });

// Shapes mirror services/secret-store.ts route payloads exactly. No value field
// exists anywhere — the catalog API is write-only for values by design.
interface SecretMeta {
  slug: string; label: string; description: string | null;
  createdAt: number; updatedAt: number;
  links: { appId: string; slot: string }[];
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
}

function NewSecretForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await send("/api/secrets", "POST", { label, ...(description ? { description } : {}), value });
      setLabel(""); setDescription(""); setValue(""); setError(null);
      onDone();
    } catch (e) {
      setValue(""); // never keep a typed value around after a failed submit
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>New secret</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1">
          <Label>Label</Label>
          <Input value={label} placeholder="OpenWeather key" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Description (optional)</Label>
          <Input value={description} placeholder="What this credential is for" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Value</Label>
          <Input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button disabled={!label.trim() || !value} onClick={() => void submit()}>Save secret</Button>
      </CardContent>
    </Card>
  );
}

function SecretRow({ s, invalidate }: { s: SecretMeta; invalidate: () => void }) {
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>) => {
    try { await fn(); setError(null); setReplacing(false); setValue(""); invalidate(); }
    catch (e) { setValue(""); setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Label className="flex items-center gap-2">
            {s.label} <code className="text-xs text-muted-foreground">{s.slug}</code>
          </Label>
          {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {s.links.length === 0
              ? <span className="text-xs text-muted-foreground">Not linked to any app</span>
              : s.links.map((l) => (
                  <Badge key={`${l.appId}/${l.slot}`} variant="secondary">{l.appId} · {l.slot}</Badge>
                ))}
          </div>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {replacing ? (
            <>
              <Input type="password" autoComplete="off" className="w-44" placeholder="New value" value={value} onChange={(e) => setValue(e.target.value)} />
              <Button size="sm" disabled={!value} onClick={() => void act(() => send(`/api/secrets/${s.slug}`, "PUT", { value }))}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => { setReplacing(false); setValue(""); }}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>Replace value</Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  const warn = s.links.length ? ` ${s.links.length} linked slot(s) become pending.` : "";
                  if (confirm(`Delete "${s.label}"?${warn}`)) void act(() => send(`/api/secrets/${s.slug}`, "DELETE"));
                }}
              >Delete</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SecretsView() {
  const queryClient = useQueryClient();
  const q = useQuery<{ secrets: SecretMeta[] }>({
    queryKey: ["secrets", "_platform"],
    queryFn: async () => (await fetch("/api/secrets")).json(),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["secrets"] });

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("event", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { ns: string; type: string };
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
    });
    return () => es.close();
  }, [queryClient]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Secrets</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">Dashboard</Link>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Credentials for your apps — values are encrypted, shown to no one, and readable only
          by the server code of apps you link them to.
        </p>
        <Card>
          <CardHeader><CardTitle>Your secrets</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-16" />
            ) : (q.data?.secrets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No secrets yet.</p>
            ) : (
              (q.data?.secrets ?? []).map((s) => <SecretRow key={s.slug} s={s} invalidate={invalidate} />)
            )}
          </CardContent>
        </Card>
        <NewSecretForm onDone={invalidate} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: App slots panel in the settings page** — in `packages/runtime/dashboard/src/routes/settings.tsx`:

Add to the payload interfaces (near `OverrideEntry`):

```tsx
interface SlotEntry {
  slot: string; label: string | null; description: string | null; error: string | null;
  status: "linked" | "pending"; secret: { slug: string; label: string } | null;
}
```

Add the panel component (before `AppSection`):

```tsx
// The app's declared secret slots (secret-store spec §9): linked → which secret
// + Unlink; pending → link an existing secret or create one inline. Renders
// nothing when the app declares no slots.
function AppSecretsCard({ app }: { app: AppInfo }) {
  const queryClient = useQueryClient();
  const q = useQuery<{ slots: SlotEntry[] }>({
    queryKey: ["secrets", app.appId],
    queryFn: async () => (await fetch(`/api/apps/${app.appId}/secrets`)).json(),
  });
  const catalog = useQuery<{ secrets: { slug: string; label: string }[] }>({
    queryKey: ["secrets", "_platform"],
    queryFn: async () => (await fetch("/api/secrets")).json(),
  });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // slot being created-for
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["secrets", app.appId] });
    void queryClient.invalidateQueries({ queryKey: ["secrets", "_platform"] });
  };
  const act = async (fn: () => Promise<Response>) => {
    const res = await fn();
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    setError(null); setCreating(null); setNewLabel(""); setNewValue("");
    invalidate();
  };
  const link = (slot: string, slug: string) =>
    void act(() => fetch(`/api/apps/${app.appId}/secrets/${slot}/link`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
    }));
  const createAndLink = async (slot: string) => {
    const res = await fetch("/api/secrets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, value: newValue }),
    });
    setNewValue(""); // typed value never lingers, success or failure
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? res.statusText); return; }
    link(slot, (await res.json()).slug);
  };
  const slots = q.data?.slots ?? [];
  if (q.isLoading || slots.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Secrets</CardTitle></CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {slots.map((s) => (
          <div key={s.slot} className="flex items-start justify-between gap-6 border-b py-3 last:border-b-0">
            <div className="min-w-0">
              <Label className="flex items-center gap-2">
                {s.label ?? <code>{s.slot}</code>}
                {s.error && <Badge variant="destructive">declaration error</Badge>}
                {s.status === "pending" && !s.error && <Badge variant="outline">needs a secret</Badge>}
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">{s.error ?? s.description}</p>
            </div>
            {!s.error && (
              <div className="flex shrink-0 items-center gap-2">
                {s.status === "linked" && s.secret ? (
                  <>
                    <Badge variant="secondary">{s.secret.label}</Badge>
                    <Button variant="ghost" size="sm" onClick={() =>
                      void act(() => fetch(`/api/apps/${app.appId}/secrets/${s.slot}/link`, { method: "DELETE" }))
                    }>Unlink</Button>
                  </>
                ) : creating === s.slot ? (
                  <>
                    <Input className="w-32" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                    <Input type="password" autoComplete="off" className="w-36" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                    <Button size="sm" disabled={!newLabel.trim() || !newValue} onClick={() => void createAndLink(s.slot)}>Save & link</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setCreating(null); setNewValue(""); }}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Select value="" onValueChange={(slug) => link(s.slot, slug)}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Link a secret…" /></SelectTrigger>
                      <SelectContent>
                        {(catalog.data?.secrets ?? []).map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setCreating(s.slot)}>New secret…</Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

In `AppSection`, insert `<AppSecretsCard app={app} />` between the declared-settings `</Card>` and the `SettingsGroup title="Service overrides"` element.

In `SettingsView`'s SSE listener, after the `settings-change` handling, add:

```tsx
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
```

(adjust the early-`return` so both types are handled: change `if (d.type !== "settings-change") return;` into type checks per line).

- [ ] **Step 3: Home grid — nav link + pending badge** — in `packages/runtime/dashboard/src/routes/index.tsx`:

Add a `PendingSecretsBadge` component (after `ServerStateBadge`); it needs `useQuery` (already imported):

```tsx
// The "app needs a key" nudge (secret-store spec §9): pending slots, visible
// without hunting. Clicking lands on the app's settings section (slots panel).
function PendingSecretsBadge({ appId }: { appId: string }) {
  const q = useQuery<{ slots: { status: string }[] }>({
    queryKey: ["secrets", appId],
    queryFn: async () => (await fetch(`/api/apps/${appId}/secrets`)).json(),
  });
  const pending = (q.data?.slots ?? []).filter((s) => s.status === "pending").length;
  if (pending === 0) return null;
  return (
    <Link to="/settings" search={{ section: appId }}>
      <Badge variant="outline">{pending} secret{pending === 1 ? "" : "s"} needed</Badge>
    </Link>
  );
}
```

Render it beside the other badges in the app card — after `<ServerStateBadge state={serverStates[a.appId]} />` add:

```tsx
                  <PendingSecretsBadge appId={a.appId} />
```

In the SSE listener, after the `tasks-change` block, add:

```tsx
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
```

In the header nav, after the Settings link, add:

```tsx
          <Link to="/secrets" className="text-sm text-muted-foreground hover:underline">Secrets</Link>
```

- [ ] **Step 4: Verify — dashboard builds and serves**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/dashboard.test.ts tests/dashboardFallback.test.ts`
Expected: PASS — the Start build picks up the new route file; no compile errors.

Then a manual smoke: `pnpm dev`, open `http://lodekit.localhost:7777/_dashboard/secrets` (or via the nav link) — create a secret, see it listed with no value shown, delete it. Check an app section on the settings page renders (Greenhouse has no slots yet → no Secrets card, correct).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/dashboard/src/routes/secrets.tsx packages/runtime/dashboard/src/routes/settings.tsx packages/runtime/dashboard/src/routes/index.tsx
git commit -m "feat(dashboard): secrets catalog page, app slot linking panel, pending badge"
```

---

### Task 10: End-to-end — declare → pending → link → read

**Files:**
- Modify: `packages/runtime/tests/fixtures/start-app/src/fns.ts`
- Test: `packages/runtime/tests/secrets-e2e.test.ts`

**Interfaces:**
- Consumes: the whole stack (Tasks 1–7). The fixture gains a server function `readSecret` calling `secrets.get("api_key")`; the test drives it via an SSR page loader (the `bump.tsx` pattern from `e2e.test.ts`).

- [ ] **Step 1: Extend the fixture** — append to `packages/runtime/tests/fixtures/start-app/src/fns.ts`:

```ts
// Reads a secret slot through the worker-token door — secrets-e2e's probe.
import { secrets, SecretUnavailableError } from "@lodekit/sdk";

export const readSecret = createServerFn().handler(async () => {
  try {
    return { ok: true as const, value: await secrets.get("api_key") };
  } catch (e) {
    return {
      ok: false as const,
      reason: e instanceof SecretUnavailableError ? e.reason : "other",
      message: e instanceof Error ? e.message : String(e),
    };
  }
});
```

(Put the import at the top of the file with the existing `@lodekit/sdk` import — merge into `import { kv, secrets, SecretUnavailableError } from "@lodekit/sdk";`.)

- [ ] **Step 2: Write the e2e test** — create `packages/runtime/tests/secrets-e2e.test.ts` (harness copied from `settings-e2e.test.ts`; only the fixture files and assertions differ):

```ts
// secrets-e2e.test.ts — harness copied verbatim from settings-e2e.test.ts (same
// fixture-app scaffold + start(cfg) + wait helpers; only the fixture files and
// assertions below differ). Covers the spec §6 flow end to end: declare →
// pending → link → server-side read → unlink.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { start } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { stopAllWorkers } from "../src/appWorker.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixture = path.join(__dirname, "fixtures", "start-app");
const APP = "start-app";

let root: string, cache: string, state: string, server: Server, base: string;

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function waitReady(appId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await (await fetch(`${base}/${appId}/`)).text();
    if (last.includes("/_build/")) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${appId}; last page: ${last.slice(0, 300)}`);
}

async function waitForSlots(expected: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: string[] = [];
  while (Date.now() < deadline) {
    const doc = await (await fetch(`${base}/api/apps/${APP}/secrets`)).json();
    last = (doc.slots ?? []).map((s: { slot: string }) => s.slot).sort();
    if (JSON.stringify(last) === JSON.stringify([...expected].sort())) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`slots never matched ${JSON.stringify(expected)}; last: ${JSON.stringify(last)}`);
}

async function probe(): Promise<string> {
  const html = await (await fetch(`${base}/${APP}/secret-probe`)).text();
  const m = html.match(/<p id="secret-probe">([^<]*)<\/p>/);
  if (!m) throw new Error(`probe value not found in page: ${html.slice(0, 300)}`);
  return m[1];
}

const secretsTs = `
import { defineSecrets, secret } from "@lodekit/sdk";
export default defineSecrets({
  api_key: secret({ label: "API key", description: "Probe secret for the e2e." }),
});
`;

const probeRoute = `import { createFileRoute } from "@tanstack/react-router";
import { readSecret } from "../fns";

export const Route = createFileRoute("/secret-probe")({
  loader: () => readSecret(),
  component: () => {
    const d = Route.useLoaderData();
    return <p id="secret-probe">{d.ok ? \`ok:\${d.value}\` : \`err:\${d.reason}\`}</p>;
  },
});
`;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-"));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-cache-"));
  state = fs.mkdtempSync(path.join(os.tmpdir(), "lk-secretse2e-state-"));
  copyDir(fixture, path.join(root, "apps", APP));
  fs.writeFileSync(path.join(root, "apps", APP, "src", "secrets.ts"), secretsTs);
  fs.writeFileSync(path.join(root, "apps", APP, "src", "routes", "secret-probe.tsx"), probeRoute);
  process.env.LODEKIT_ROOT = root;
  process.env.LODEKIT_CACHE_DIR = cache;
  process.env.LODEKIT_STATE_DIR = state;
  process.env.LODEKIT_SECRETS_KEY_PROVIDER = "file";
  process.env.LODEKIT_PORT = "0";
  server = await start(loadConfig());
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await waitReady(APP, 90_000);
  await waitForSlots(["api_key"], 15_000);
}, 120_000);
afterAll(async () => {
  stopAllWorkers();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
  delete process.env.LODEKIT_ROOT;
  delete process.env.LODEKIT_CACHE_DIR;
  delete process.env.LODEKIT_STATE_DIR;
  delete process.env.LODEKIT_SECRETS_KEY_PROVIDER;
  delete process.env.LODEKIT_PORT;
});

describe("secrets e2e (real worker, worker-token door)", () => {
  it("declared slot registers as pending; server-side read reports unlinked", async () => {
    const doc = await (await fetch(`${base}/api/apps/${APP}/secrets`)).json();
    expect(doc.slots).toEqual([
      { slot: "api_key", label: "API key", description: "Probe secret for the e2e.", error: null, status: "pending", secret: null },
    ]);
    expect(await probe()).toBe("err:unlinked");
  }, 15_000);

  it("create + link → the server function reads the value; unlink → unlinked again", async () => {
    const created = await fetch(`${base}/api/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Probe key", value: "s3cr3t-value" }),
    });
    expect(created.status).toBe(201);
    const { slug } = await created.json();
    const linked = await fetch(`${base}/api/apps/${APP}/secrets/api_key/link`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    expect(linked.status).toBe(200);
    expect(await probe()).toBe("ok:s3cr3t-value");

    // The door: no token → 401, even while linked.
    const bare = await fetch(`${base}/api/apps/${APP}/secrets/api_key/value`);
    expect(bare.status).toBe(401);

    await fetch(`${base}/api/apps/${APP}/secrets/api_key/link`, { method: "DELETE" });
    expect(await probe()).toBe("err:unlinked");
  }, 20_000);
});
```

- [ ] **Step 3: Run to verify (this exercises the Task 5 build/registration wiring for real)**

Run: `pnpm --filter @lodekit/runtime exec vitest run tests/secrets-e2e.test.ts`
Expected: PASS. If the slot never registers, debug order: `server/secrets.js` exists in the cache dir (build entry), `secrets-manifest` posted (appWorkerEntry), `onSecretsManifest` wired (server.ts).

- [ ] **Step 4: Run every existing fixture-sharing suite** (the fixture's `fns.ts` changed — `e2e.test.ts`, `build-start.test.ts`, `tasks-e2e.test.ts`, `settings-e2e.test.ts` must still pass):

Run: `pnpm --filter @lodekit/runtime test`
Expected: PASS across the board (the known pre-existing `events-wiring.test.ts` flake aside — rerun once if it trips; it's on the roadmap).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/tests/fixtures/start-app/src/fns.ts packages/runtime/tests/secrets-e2e.test.ts
git commit -m "test(runtime): secrets e2e — declare, pending, link, worker-token read, unlink"
```

---

### Task 11: Skill, docs, roadmap, and the darwin keychain smoke

**Files:**
- Modify: `packages/skill/SKILL.md`, `context.md`, `roadmap.md`, `root/readme.md`

- [ ] **Step 1: Skill** — in `packages/skill/SKILL.md`, add a `## Secrets` section after the `## Settings` section (match the file's existing voice and code-example style):

```markdown
## Secrets

Credentials (API keys, auth tokens) live in the **secret-store** — never in
Settings, never in the Store. The person owns a platform-wide secret catalog;
your app declares **slots** it needs, and the person **links** a secret to each
slot in the dashboard. Server-side code reads linked values; browser code never
can.

Declare slots in `src/secrets.ts`:

```ts
import { defineSecrets, secret } from "@lodekit/sdk";

export default defineSecrets({
  weather_api_key: secret({
    label: "Weather API key",
    description: "Used by the watering forecast to fetch local weather.",
  }),
});
```

Read them **only in server functions** (never in components):

```ts
import { secrets, SecretUnavailableError } from "@lodekit/sdk";

const key = await secrets.get("weather_api_key"); // throws SecretUnavailableError
```

Handle `SecretUnavailableError` (`reason: "unlinked" | "unavailable"`) by
rendering a "configure me" state pointing the person at the dashboard's
Secrets page.

Hard rules:

- **Never ask the person to paste a secret value into chat.** Direct them to
  the dashboard → Secrets (or the app's settings page, which shows pending
  slots with a link/create affordance).
- **Never log, echo, or store a secret value** — not in `kv`, not in `files`,
  not in events, not in console output.
- The three-store boundary: **Settings** = the person's knobs; **Store (kv)**
  = the app's own memory; **Secrets** = credentials the person provides.
```

- [ ] **Step 2: context.md** — two surgical edits:

1. In the service-catalog paragraph (§ "The full set of services…", ~line 104): no change needed (secret-store is already listed); verify the catalog-name → SDK-handle mapping line (~112) already contains `secret-store→secrets` (it does — leave it).
2. Replace the Store-vs-Settings flagged-ambiguity bullet's Secrets sentence (~line 255). Old text:

```
Credentials are neither: **Secrets** (secret-store, future) hold sensitive values the person provides, read only by server-side app code — never Settings, never the Store.
```

New text:

```
Credentials are neither: **Secrets** (secret-store) hold sensitive values the person provides, encrypted at rest, read only by server-side app code — never Settings, never the Store. Apps declare **slots** (`src/secrets.ts`); the person **links** a catalog secret to each slot in the dashboard — the link is the grant.
```

- [ ] **Step 3: roadmap.md** — three edits:

1. Mark the Security item shipped. Old bullet (lines 21–25):

```
- **Real secrets storage** — back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets (the secret-store service; design with the lens of
  powering integrations). **Unblocked** by the tanstack-start-host substrate — server
  functions reach the SDK, so secrets have a server-side door
  (`docs/specs/2026-07-03-tanstack-start-host-design.md`); still its own slice.
```

New:

```
- **Real secrets storage** — ~~back the `lodekit.secrets.get()` stub with actual encrypted
  storage + a UI to manage secrets (the secret-store service; design with the lens of
  powering integrations).~~ **Shipped (2026-07-07):**
  `docs/specs/2026-07-07-secret-store-design.md` — encrypted catalog (master key in the
  Keychain), slots/links, worker-token server-only reads, dashboard + MCP (names only).
  Deferred from the slice (spec §12): master-key rotation, non-darwin key providers,
  secret expiry, read-audit log, MCP write/link tools, import; the worker-token door
  covers only the secrets value route — extending it stays with "Local door hardening".
```

2. In the "Greenhouse integrations chapter" bullet (~line 336), extend:

```
- **Greenhouse integrations chapter** — when the integrations layer lands, weather-aware
  watering is the first integration demo (showcase-apps spec §13); it also carries the
  **secret-store DoD coverage** deferred from that slice (spec
  2026-07-07-secret-store-design.md §11): declare a `weather_api_key` slot, link, read.
```

3. No other roadmap changes (the deferred list lives in the spec's §12, referenced from edit 1).

- [ ] **Step 4: root/readme.md** — add to the Pending block of the DoD coverage checklist (match the file's existing entry format — read the file first):

```
- secret-store: declare a slot + linked server-side read — deferred to the
  integrations chapter (secret-store spec §11).
```

- [ ] **Step 5: Manual darwin Keychain smoke** (the one untested provider path; runs on the dev machine, not CI):

```bash
LODEKIT_ROOT=$(pwd)/root pnpm --filter @lodekit/runtime start
```

In another shell: create a secret (`curl -s -X POST http://lodekit.localhost:7777/api/secrets -H 'Content-Type: application/json' -d '{"label":"Keychain smoke","value":"smoke-1"}'`), confirm `security find-generic-password -s Lodekit -a secret-store-master-key -w` prints a 64-char hex with **no prompt**, restart the runtime, and confirm `GET /api/secrets` still lists the secret (key survives restarts). Then clean up: `curl -s -X DELETE http://lodekit.localhost:7777/api/secrets/keychain-smoke`. Report the result in the task summary; if a prompt appears or the read-back fails, stop and investigate before committing.

- [ ] **Step 6: Full workspace test run**

Run: `pnpm test`
Expected: PASS (runtime incl. MCP integration, sdk, manager).

- [ ] **Step 7: Commit**

```bash
git add packages/skill/SKILL.md context.md roadmap.md root/readme.md
git commit -m "docs(skill,context,roadmap,root): secrets section, slot/link vocabulary, slice closure"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** §4 storage/crypto/key/degraded → Tasks 2–3; §5 declaration → Task 5 + SDK Task 7; §6 flow → Task 10; §7 door → Tasks 4+6; §8 routes/SDK/events → Tasks 6–7; §9 dashboard → Task 9; §10 MCP/skill → Tasks 8+11; §11 testing incl. DoD exception → Tasks 3, 5, 6, 10, 11; §12 deferrals → Task 11 roadmap edit.
- The `secrets-change` payload asserted implicitly via SSE-driven dashboard behavior; the emission call sites are exercised by secrets-api tests (routes run `emitSecretsChange`; `emitEvent` no-ops safely when the event store isn't initialized in unit tests — same as settings-api tests).
- Type consistency spot-checks: `SecretMeta.links` uses `appId`/`slot` camelCase in payloads (dashboard + MCP test match); the value route header is `x-lodekit-worker-token` in Task 4 (producer), Task 6 (router), Task 7 (SDK), Task 10 (e2e).
```
