import { describe, it, expect } from "vitest";
import { MARK_BODIES, markFaviconSvg, emojiFaviconSvg } from "../src/marks.js";

describe("favicon svg builders", () => {
  it("renders the requested mark and falls back to b on unknown styles", () => {
    expect(markFaviconSvg("c")).toContain(MARK_BODIES.c);
    expect(markFaviconSvg("nope")).toContain(MARK_BODIES.b);
    expect(markFaviconSvg("b")).toContain("prefers-color-scheme");
    expect(markFaviconSvg("b")).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("renders the emoji via the text technique", () => {
    expect(emojiFaviconSvg("🪴")).toContain("🪴");
    expect(emojiFaviconSvg("🪴")).toContain("<text");
  });

  it("XML-escapes user-authored icon text (manifest is a trust boundary)", () => {
    const svg = emojiFaviconSvg('<script>alert(1)</script>"\'&');
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&#39;");
    expect(svg).toContain("&amp;");
  });
});
