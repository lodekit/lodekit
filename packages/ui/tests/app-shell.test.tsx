// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppShell, type ShellApp } from "../src";

// React's act() requires an explicit opt-in outside test renderers.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APPS: ShellApp[] = [
  { appId: "greenhouse", name: "Greenhouse", icon: "🪴" },
  { appId: "welcome", name: "Welcome", icon: "👋" },
];

let host: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(ui);
  });
}

async function unmount() {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const shellText = () => document.body.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
});
afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("AppShell", () => {
  it("dashboard mode: wordmark identity, apps rail, inert bell", async () => {
    await mount(
      <AppShell apps={APPS} iconStyle="b">
        <p>content</p>
      </AppShell>
    );
    // Wordmark appears in the header identity slot and the rail lockup.
    expect(shellText()).toContain("Lodekit");
    // One rail link per app, always full-page anchors.
    const appLinks = [...document.querySelectorAll('a[href="/greenhouse/"], a[href="/welcome/"]')];
    expect(appLinks.length).toBe(2);
    // No app is active in dashboard mode (data-active is a presence attribute).
    expect(document.querySelector("[data-sidebar=menu-button][data-active]")).toBeNull();
    expect(document.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
    expect(shellText()).toContain("content");
  });

  it("app mode: identity swap and active rail item", async () => {
    await mount(
      <AppShell app={APPS[0]} apps={APPS} iconStyle="b">
        <p>page</p>
      </AppShell>
    );
    // Header identity links to the app home and shows its name.
    const identity = document.querySelector('header a[href="/greenhouse/"]');
    expect(identity?.textContent).toContain("Greenhouse");
    const active = document.querySelector("[data-sidebar=menu-button][data-active]");
    expect(active?.getAttribute("href")).toBe("/greenhouse/");
  });

  it("renders loading dots without data, then the fetched apps", async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => { resolve = r; }))
    );
    await mount(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    expect(document.querySelector("[data-shell-dots]")).toBeTruthy();
    await act(async () => {
      resolve({ json: () => Promise.resolve({ apps: APPS, iconStyle: "c" }) });
    });
    expect(document.querySelector('a[href="/welcome/"]')).toBeTruthy();
    expect(document.querySelector("[data-shell-dots]")).toBeNull();
  });

  it("empty apps: dots stay as the tooltip-bearing empty state", async () => {
    await mount(
      <AppShell apps={[]} iconStyle="b">
        <p>page</p>
      </AppShell>
    );
    expect(document.querySelector("[data-shell-dots]")).toBeTruthy();
    expect(document.querySelector("[data-sidebar=menu-button]")).toBeTruthy(); // services/settings still render
  });

  it("services expand inline, persist to localStorage, and restore on mount", async () => {
    await mount(
      <AppShell apps={APPS} iconStyle="b">
        <p>page</p>
      </AppShell>
    );
    // Collapsed by default: no service links, toggle not expanded.
    expect(document.querySelector('a[href="/_dashboard/data"]')).toBeNull();
    const toggle = document.querySelector("[data-slot=shell-services-toggle]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll('a[href^="/_dashboard/"][data-sidebar=menu-button]').length).toBeGreaterThan(7); // 7 services + settings
    expect(localStorage.getItem("lodekit:shell:services-expanded")).toBe("1");

    // Chevron collapses again and clears the preference.
    await click(document.querySelector("[data-slot=shell-services-chevron]")!);
    expect(document.querySelector('a[href="/_dashboard/data"]')).toBeNull();
    expect(localStorage.getItem("lodekit:shell:services-expanded")).toBeNull();

    // Stored preference applies on a fresh mount.
    localStorage.setItem("lodekit:shell:services-expanded", "1");
    await unmount();
    await mount(
      <AppShell apps={APPS} iconStyle="b">
        <p>page</p>
      </AppShell>
    );
    expect(document.querySelector('a[href="/_dashboard/data"]')).toBeTruthy();
  });

  it("renderLink routes dashboard-internal links; app links stay plain anchors", async () => {
    await mount(
      <AppShell
        apps={APPS}
        iconStyle="b"
        activeHref="/_dashboard/settings"
        renderLink={({ href, ...rest }) => <a data-spa="1" href={href} {...rest} />}
      >
        <p>page</p>
      </AppShell>
    );
    const settings = document.querySelector('a[href="/_dashboard/settings"]');
    expect(settings?.getAttribute("data-spa")).toBe("1");
    expect(settings?.hasAttribute("data-active")).toBe(true);
    // App links never go through the adapter.
    expect(document.querySelector('a[href="/greenhouse/"]')?.getAttribute("data-spa")).toBeNull();
  });
});
