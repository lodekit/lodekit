// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  Command,
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "../src";

// Client-mount smoke for the command palette. The SSR smoke can't cover this:
// dialog popup content mounts only in the browser (portal gated on a client
// effect), which is where the cmdk store wiring first runs. Regression test
// for "Cannot read properties of undefined (reading 'subscribe')" — cmdk
// components crash when mounted without a Command root above them (base-nova's
// CommandDialog, unlike the old Radix flavor's, does not provide one).
function palette() {
  return (
    <CommandDialog open>
      <Command>
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Pages">
            <CommandItem>Settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

describe("CommandDialog client mount", () => {
  it("mounts open without crashing and renders the cmdk parts", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(palette());
    });

    // Popup content is portaled to <body>; assert the cmdk parts really mounted.
    expect(document.querySelector("[data-slot=command-input]")).toBeTruthy();
    expect(document.querySelector("[data-slot=command-item]")).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
