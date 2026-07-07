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
