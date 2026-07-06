// Runtime-internal recurring tasks (NOT the future person-facing Tasks service).
// Tasks are error-isolated (a throw logs and continues) and never hold the
// process open (unref).

import { emitLog } from "./logger.js";

const tasks = new Map<string, { run: () => void; timer: NodeJS.Timeout }>();

export function every(name: string, intervalMs: number, fn: () => void): void {
  stop(name);
  const run = () => {
    try {
      fn();
    } catch (e) {
      emitLog("error", "scheduler", `task "${name}" failed`, { stack: e instanceof Error ? e.stack ?? e.message : String(e) });
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  tasks.set(name, { run, timer });
}

export function tick(name: string): void {
  tasks.get(name)?.run();
}

export function stop(name: string): void {
  const t = tasks.get(name);
  if (t) {
    clearInterval(t.timer);
    tasks.delete(name);
  }
}

export function stopAll(): void {
  for (const name of [...tasks.keys()]) stop(name);
}
