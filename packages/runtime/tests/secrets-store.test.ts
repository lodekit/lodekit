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
