// Runs one app's built server bundle. Plain JS on purpose: workers must not
// depend on the tsx loader. Protocol (structured clone + transfers):
//   main -> worker  { type:"request", id, method, url, headers:[[k,v]], body:Uint8Array|null }
//                   | { type:"task-run", id, name, payload }
//   worker -> main  { type:"ready" } | { type:"fatal", message }
//                   | { type:"tasks-manifest", tasks:[{name,...config}], error? }
//                   | { type:"response", id, status, headers:[[k,v]], body:ReadableStream|null }
//                   | { type:"response-error", id, message }
//                   | { type:"task-result", id, ok, message? }
//                   | { type:"log", level, message, fields }
import { parentPort, workerData } from "node:worker_threads";
import { inspect } from "node:util";
import { readFileSync } from "node:fs";

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

// Task handlers from the app's built src/tasks.ts (spec §4). Task name =
// kebab-case of the export identifier. An import failure is reported, never
// fatal — the app keeps serving HTTP; the runtime keeps the previous defs.
const taskHandlers = new Map();
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const CONFIG_KEYS = ["cron", "every", "catchUp", "retries", "timeout"];
if (workerData.tasksEntry) {
  try {
    const mod = await import(workerData.tasksEntry);
    // A dynamic import() of an ES module returns a Module Namespace Object, whose
    // own keys are spec-ordered alphabetically — never source declaration order.
    // Re-derive declaration order from the built file's text so the manifest lists
    // tasks the way the developer wrote them, not alphabetized.
    const source = readFileSync(workerData.tasksEntry, "utf8");
    const marked = Object.entries(mod).filter(
      ([, val]) => val && val.__lodekitTask === true && typeof val.run === "function"
    );
    marked.sort((a, b) => source.indexOf(a[0]) - source.indexOf(b[0]));
    const tasks = [];
    for (const [key, val] of marked) {
      const name = kebab(key);
      taskHandlers.set(name, val.run);
      const entry = { name };
      for (const k of CONFIG_KEYS) if (val[k] !== undefined) entry[k] = val[k];
      tasks.push(entry);
    }
    parentPort.postMessage({ type: "tasks-manifest", tasks });
  } catch (e) {
    parentPort.postMessage({ type: "tasks-manifest", tasks: [], error: e?.stack ?? String(e) });
  }
} else {
  parentPort.postMessage({ type: "tasks-manifest", tasks: [] });
}

parentPort.on("message", async (msg) => {
  if (msg.type === "task-run") {
    const run = taskHandlers.get(msg.name);
    if (!run) {
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: false, message: `unknown task "${msg.name}"` });
      return;
    }
    try {
      await run(msg.payload);
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: true });
    } catch (e) {
      parentPort.postMessage({ type: "task-result", id: msg.id, ok: false, message: e?.stack ?? String(e) });
    }
    return;
  }
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
