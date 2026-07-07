// The declaration side of the tasks service (spec §4): a thin validator/tagger.
// It never talks to the runtime — appWorkerEntry scans a built src/tasks.ts
// module for the __lodekitTask marker and reports the config as the manifest.
export interface TaskConfig<P = unknown> {
  /** 5-field cron expression, machine-local timezone. Mutually exclusive with `every`. */
  cron?: string;
  /** Interval sugar ("30m", "1h"), minimum "1m". Mutually exclusive with `cron`. */
  every?: string;
  /** Catch-up window for missed occurrences ("6h"); false disables. Default "1h". */
  catchUp?: string | false;
  /** Retries after the first attempt. Default 3. */
  retries?: number;
  /** Per-attempt timeout ("5m" default). */
  timeout?: string;
  run: (payload: P) => void | Promise<void>;
}

export type DefinedTask<P = unknown> = TaskConfig<P> & { __lodekitTask: true };

export function task<P = unknown>(config: TaskConfig<P>): DefinedTask<P> {
  if (typeof config.run !== "function") throw new Error('task(): "run" must be a function');
  if (config.cron != null && config.every != null) {
    throw new Error('task(): "cron" and "every" are mutually exclusive');
  }
  return { __lodekitTask: true, ...config };
}
