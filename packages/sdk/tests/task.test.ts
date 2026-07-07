import { describe, it, expect } from "vitest";
import { task } from "../src/task.js";

describe("task()", () => {
  it("tags the config with the worker-scanned marker", () => {
    const t = task({ cron: "0 9 * * *", catchUp: "6h", run: async () => {} });
    expect(t.__lodekitTask).toBe(true);
    expect(t.cron).toBe("0 9 * * *");
    expect(typeof t.run).toBe("function");
  });

  it("rejects cron+every together and a missing run", () => {
    expect(() => task({ cron: "0 9 * * *", every: "1h", run: async () => {} })).toThrow(/mutually exclusive/);
    // @ts-expect-error run is required
    expect(() => task({ cron: "0 9 * * *" })).toThrow(/run/);
  });

  it("passes the typed payload through", async () => {
    let got: { n: number } | undefined;
    const t = task<{ n: number }>({ run: (p) => { got = p; } });
    await t.run({ n: 7 });
    expect(got).toEqual({ n: 7 });
  });
});
