import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Kicker, Meta } from "../src";

describe("Kicker", () => {
  it("renders the mono uppercase eyebrow and merges classes", () => {
    const html = renderToString(<Kicker className="mb-1">Colors</Kicker>);
    expect(html).toContain("font-mono");
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-[0.12em]");
    expect(html).toContain("mb-1");
    expect(html).toContain("Colors");
  });
});

describe("Meta", () => {
  it("renders the normal-case mono data voice with tabular-nums", () => {
    const html = renderToString(<Meta>2026-07-19 14:02</Meta>);
    expect(html).toContain("font-mono");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("tracking-[0.01em]");
    expect(html).not.toContain("uppercase");
  });
});
