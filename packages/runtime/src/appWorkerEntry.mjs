// Runs one app's built server bundle. Plain JS on purpose: workers must not
// depend on the tsx loader. Protocol (structured clone + transfers):
//   main -> worker  { type:"request", id, method, url, headers:[[k,v]], body:Uint8Array|null }
//   worker -> main  { type:"ready" } | { type:"fatal", message }
//                   | { type:"response", id, status, headers:[[k,v]], body:ReadableStream|null }
//                   | { type:"response-error", id, message }
//                   | { type:"log", level, message, fields }
import { parentPort, workerData } from "node:worker_threads";
import { inspect } from "node:util";

// Console capture (logging spec §5): app console output becomes structured log
// records instead of untagged runtime stdout — keeping the text tier minimal.
// Replaces (not tees) the console methods; the platform log is the destination.
const CONSOLE_LEVELS = { debug: "debug", log: "info", info: "info", warn: "warn", error: "error" };
for (const [method, level] of Object.entries(CONSOLE_LEVELS)) {
  console[method] = (...args) => {
    try {
      const err = args.find((a) => a instanceof Error);
      const message = args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" ");
      parentPort.postMessage({ type: "log", level, message, fields: err?.stack ? { stack: err.stack } : null });
    } catch {
      // logging must never break the app (e.g. unserializable arg)
    }
  };
}

let handler;
try {
  const mod = await import(workerData.serverEntry);
  handler = mod.default;
  if (typeof handler?.fetch !== "function") {
    throw new Error("server bundle default export has no fetch()");
  }
  parentPort.postMessage({ type: "ready" });
} catch (e) {
  parentPort.postMessage({ type: "fatal", message: e?.stack ?? String(e) });
  process.exit(1);
}

parentPort.on("message", async (msg) => {
  if (msg.type !== "request") return;
  try {
    const request = new Request(msg.url, {
      method: msg.method,
      headers: msg.headers,
      body: msg.body ?? undefined,
    });
    const response = await handler.fetch(request);
    const headers = [...response.headers];
    if (response.body) {
      parentPort.postMessage(
        { type: "response", id: msg.id, status: response.status, headers, body: response.body },
        [response.body]
      );
    } else {
      parentPort.postMessage({ type: "response", id: msg.id, status: response.status, headers, body: null });
    }
  } catch (e) {
    parentPort.postMessage({ type: "response-error", id: msg.id, message: e?.stack ?? String(e) });
  }
});
