import { describe, it, expect } from "vitest";
import { classifyAddress, hostAllowedByPins, checkEgress, EgressDeniedError, type LookupFn } from "../src/gatewayEgress.js";

describe("classifyAddress", () => {
  it("classifies IPv4 ranges", () => {
    expect(classifyAddress("127.0.0.1")).toBe("loopback");
    expect(classifyAddress("10.1.2.3")).toBe("private");
    expect(classifyAddress("172.16.0.1")).toBe("private");
    expect(classifyAddress("172.31.255.255")).toBe("private");
    expect(classifyAddress("172.32.0.1")).toBe("public");
    expect(classifyAddress("192.168.1.1")).toBe("private");
    expect(classifyAddress("169.254.13.37")).toBe("link-local");
    expect(classifyAddress("0.0.0.0")).toBe("special");
    expect(classifyAddress("255.255.255.255")).toBe("special");
    expect(classifyAddress("224.0.0.1")).toBe("special");
    expect(classifyAddress("8.8.8.8")).toBe("public");
    expect(classifyAddress("172.15.0.1")).toBe("public");
  });
  it("classifies IPv6 and mapped IPv4", () => {
    expect(classifyAddress("::1")).toBe("loopback");
    expect(classifyAddress("fc00::1")).toBe("private");
    expect(classifyAddress("fdff::1")).toBe("private");
    expect(classifyAddress("fe80::1")).toBe("link-local");
    expect(classifyAddress("::")).toBe("special");
    expect(classifyAddress("ff02::1")).toBe("special");
    expect(classifyAddress("::ffff:127.0.0.1")).toBe("loopback");
    expect(classifyAddress("::ffff:8.8.8.8")).toBe("public");
    expect(classifyAddress("2001:4860:4860::8888")).toBe("public");
  });
  it("classifies IPv6 alternate spellings that bypass naive string matching", () => {
    // v4-mapped addresses spelled as hex hextets rather than dotted-decimal.
    expect(classifyAddress("::ffff:7f00:1")).toBe("loopback"); // 127.0.0.1
    expect(classifyAddress("::ffff:a9fe:a9fe")).toBe("link-local"); // 169.254.169.254
    expect(classifyAddress("::ffff:c0a8:101")).toBe("private"); // 192.168.1.1
    // fully expanded canonical forms.
    expect(classifyAddress("0:0:0:0:0:0:0:1")).toBe("loopback"); // ::1
    expect(classifyAddress("0:0:0:0:0:0:0:0")).toBe("special"); // ::
  });
  it("classifies the deprecated IPv4-compatible IPv6 form (no ffff marker)", () => {
    expect(classifyAddress("::127.0.0.1")).toBe("loopback");
    expect(classifyAddress("::169.254.169.254")).toBe("link-local");
    expect(classifyAddress("::192.168.1.1")).toBe("private");
    // special-cases must still win over the new v4-compatible branch.
    expect(classifyAddress("::1")).toBe("loopback");
    expect(classifyAddress("::")).toBe("special");
  });
});

describe("hostAllowedByPins", () => {
  it("matches exact and wildcard, case-insensitively", () => {
    expect(hostAllowedByPins("home.example.com", ["home.example.com"])).toBe(true);
    expect(hostAllowedByPins("HOME.example.com", ["home.example.com"])).toBe(true);
    expect(hostAllowedByPins("a.ui.nabu.casa", ["*.ui.nabu.casa"])).toBe(true);
    expect(hostAllowedByPins("ui.nabu.casa", ["*.ui.nabu.casa"])).toBe(false); // bare host not matched by wildcard
    expect(hostAllowedByPins("evil.com", ["home.example.com"])).toBe(false);
    expect(hostAllowedByPins("home.example.com.evil.com", ["home.example.com"])).toBe(false);
  });
});

describe("checkEgress policy", () => {
  const pub: LookupFn = async () => ["8.8.8.8"];
  const priv: LookupFn = async () => ["192.168.1.10"];
  const mixed: LookupFn = async () => ["8.8.8.8", "127.0.0.1"];

  it("allows a public https target", async () => {
    await expect(checkEgress({}, new URL("https://api.example.com"), { lookup: pub })).resolves.toBeUndefined();
  });
  it("denies a private target without local_network", async () => {
    await expect(checkEgress({}, new URL("https://ha.example"), { lookup: priv })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it("allows a private target with local_network", async () => {
    await expect(checkEgress({ local_network: true }, new URL("https://ha.example"), { lookup: priv })).resolves.toBeUndefined();
  });
  it("denies when any answer in a multi-answer response is private", async () => {
    await expect(checkEgress({}, new URL("https://rebind.example"), { lookup: mixed })).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it("denies an off-pin host before resolving", async () => {
    let called = false;
    const lk: LookupFn = async () => { called = true; return ["8.8.8.8"]; };
    await expect(checkEgress({}, new URL("https://evil.com"), { pins: ["home.example.com"], lookup: lk }))
      .rejects.toBeInstanceOf(EgressDeniedError);
    expect(called).toBe(false);
  });
  it("classifies an IP-literal without a lookup", async () => {
    let called = false;
    const lk: LookupFn = async () => { called = true; return []; };
    await expect(checkEgress({}, new URL("https://169.254.169.254"), { lookup: lk })).rejects.toBeInstanceOf(EgressDeniedError);
    expect(called).toBe(false);
  });
  it("denies http toward a public host and allows http toward a local one with the flag", async () => {
    await expect(checkEgress({ local_network: true }, new URL("http://pub.example"), { lookup: pub })).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(checkEgress({ local_network: true }, new URL("http://192.168.1.10"))).resolves.toBeUndefined();
  });
  it("denies a special address even with local_network: true", async () => {
    await expect(checkEgress({ local_network: true }, new URL("https://[::]/"))).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(checkEgress({ local_network: true }, new URL("http://0.0.0.0"))).rejects.toBeInstanceOf(EgressDeniedError);
  });
  it("rejects IPv6-mapped-hextet loopback and link-local bypass spellings", async () => {
    await expect(checkEgress({}, new URL("https://[::ffff:7f00:1]/"))).rejects.toBeInstanceOf(EgressDeniedError);
    await expect(checkEgress({}, new URL("https://[::ffff:a9fe:a9fe]/"))).rejects.toBeInstanceOf(EgressDeniedError);
  });
});
