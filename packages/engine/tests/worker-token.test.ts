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
