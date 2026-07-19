import { describe, expect, it } from "vitest";
import {
  applyBeat,
  beatDuration,
  CLEAR_SCRIPT,
  EMPTY,
  restState,
  SCRIPT,
  TYPE_MS,
} from "./script";

describe("script", () => {
  it("plays out to the spec's 9-item final frame with an empty input", () => {
    const rest = restState();
    expect(rest.items.map((i) => i.kind)).toEqual([
      "user", "agent", "options", "user", "reasoning", "tool", "tool", "tool", "agent",
    ]);
    expect(rest.input).toBe("");
    expect(rest.streamingIndex).toBeNull();
  });

  it("shows the honest artifacts: real MCP tool, real app files, real URL", () => {
    const rest = restState();
    const tools = rest.items.filter((i) => i.kind === "tool");
    expect(tools.map((t) => t.kind === "tool" && t.name)).toEqual([
      "lodekit_scaffold", "greenhouse/src/db.ts", "greenhouse/src/gateways.ts",
    ]);
    const last = rest.items.at(-1);
    expect(last?.kind === "agent" && last.text).toContain("http://lodekit.localhost/greenhouse");
  });

  it("post of a user message clears the typed input", () => {
    const typed = applyBeat(EMPTY, { do: "type", text: "hello" });
    expect(typed.input).toBe("hello");
    const posted = applyBeat(typed, { do: "post", item: { kind: "user", text: "hello" } });
    expect(posted.input).toBe("");
    expect(posted.items).toHaveLength(1);
  });

  it("press marks the options row; toolDone completes the oldest running tool", () => {
    let s = restState();
    // restState already has pressed=2 and all tools done; verify from scratch instead
    s = applyBeat(EMPTY, {
      do: "post",
      item: { kind: "options", options: [], pressed: null },
    });
    s = applyBeat(s, { do: "press", option: 2 });
    expect(s.items[0].kind === "options" && s.items[0].pressed).toBe(2);

    s = applyBeat(s, { do: "post", item: { kind: "tool", via: "mcp", name: "a", caption: "", done: false } });
    s = applyBeat(s, { do: "post", item: { kind: "tool", via: "file", name: "b", caption: "", done: false } });
    s = applyBeat(s, { do: "toolDone" });
    const [ , t1, t2] = s.items;
    expect(t1.kind === "tool" && t1.done).toBe(true);
    expect(t2.kind === "tool" && t2.done).toBe(false);
  });

  it("clear returns to EMPTY", () => {
    expect(applyBeat(restState(), { do: "clear" })).toEqual(EMPTY);
  });

  it("durations: type scales per char; the whole cycle fits the 25–45s envelope", () => {
    expect(beatDuration({ do: "type", text: "12345" })).toBe(5 * TYPE_MS);
    const total = SCRIPT.reduce((ms, b) => ms + beatDuration(b), 0);
    expect(total).toBeGreaterThan(25_000);
    expect(total).toBeLessThan(45_000);
    const clearTotal = CLEAR_SCRIPT.reduce((ms, b) => ms + beatDuration(b), 0);
    expect(clearTotal).toBeGreaterThan(0);
  });
});
