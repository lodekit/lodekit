import { insertLog, LEVELS, type LevelName } from "./logStore.js";
import { broadcast } from "./sse.js";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

// The one emission path (spec §5): persist, stream live, and tee errors to stderr
// so the system stream keeps evidence even when the SQLite sink is the failure.
export function emitLog(
  level: LevelName,
  source: string,
  message: string,
  fields?: Record<string, unknown>,
  appId?: string
): void {
  const record = insertLog({ level, source, appId, message, fields }) ?? {
    id: 0,
    ts: Date.now(),
    level,
    source,
    appId: appId ?? null,
    message,
    fields: fields ?? null,
  };
  broadcast("log", record, appId);
  if (LEVELS[level] >= LEVELS.error) {
    const stack = typeof fields?.stack === "string" ? `\n${fields.stack}` : "";
    process.stderr.write(`[${source}${appId ? `:${appId}` : ""}] ${message}${stack}\n`);
  }
}

export function createLogger(source: string, appId?: string): Logger {
  const at = (level: LevelName) => (message: string, fields?: Record<string, unknown>) =>
    emitLog(level, source, message, fields, appId);
  return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}
