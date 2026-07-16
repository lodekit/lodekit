// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Settings, createIcon } from "../src/icons";
import { CANONICAL_NAMES, KNOWN_UNMAPPED } from "../src/icons/generated/names";
import phosphorMap from "../src/icons/generated/phosphor";
import tablerMap from "../src/icons/generated/tabler";

function mount(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return host;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("@lodekit/ui/icons", () => {
  it("renders the lucide glyph by default", () => {
    document.documentElement.removeAttribute("data-icon-library");
    const host = mount(<Settings />);
    expect(host.querySelector("svg")).not.toBeNull();
  });

  it("falls back to lucide for an unmapped name under phosphor (no throw)", () => {
    document.documentElement.setAttribute("data-icon-library", "phosphor");
    const Exotic = createIcon("ThisIconIsNotMapped", Settings);
    const host = mount(<Exotic />);
    expect(host.querySelector("svg")).not.toBeNull();
    document.documentElement.removeAttribute("data-icon-library");
  });

  it("re-renders live when data-icon-library flips to tabler", async () => {
    document.documentElement.removeAttribute("data-icon-library");
    const host = mount(<Settings />);
    const before = host.querySelector("svg")!.outerHTML;

    document.documentElement.setAttribute("data-icon-library", "tabler");
    await flush();

    const after = host.querySelector("svg")!.outerHTML;
    expect(after).not.toEqual(before);
    document.documentElement.removeAttribute("data-icon-library");
  });

  it("maps every canonical name in both sets or lists it as known-unmapped", () => {
    const unmapped = new Set(KNOWN_UNMAPPED);
    for (const name of CANONICAL_NAMES) {
      const covered =
        (name in phosphorMap && name in tablerMap) || unmapped.has(name);
      expect(covered, `${name} must be in both maps or KNOWN_UNMAPPED`).toBe(
        true
      );
    }
  });
});
