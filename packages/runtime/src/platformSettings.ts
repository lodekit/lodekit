// The platform settings catalog (spec §6) — declared in code with the same field
// grammar apps use. Defaults here REPLACE the old hard-coded constants: each
// former constant's site reads the effective value instead (tasks/logs/kv/files/
// events/hosting plumbing tasks). Hard caps (body limit, list ceilings) stay code.
import type { SettingField } from "./settingsSchema.js";

export interface PlatformSetting {
  field: SettingField;
  scope: "global" | "per-app"; // global = one runtime-wide value; never on app pages
  section: string;             // display grouping (SECTIONS order)
}

export const PLATFORM_KEY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export const SECTIONS = ["General", "Appearance", "Tasks", "Logs", "Store", "Files", "Events", "App hosting"] as const;

const g = (field: SettingField, section: string): PlatformSetting => ({ field, scope: "global", section });
const p = (field: SettingField, section: string): PlatformSetting => ({ field, scope: "per-app", section });

export const PLATFORM_SETTINGS: Record<string, PlatformSetting> = {
  "general.start_at_login": g({
    type: "boolean", label: "Start at login",
    description: "Launch Lodekit automatically when you log in. Applied by the menubar app (packaged builds only).",
    default: false,
  }, "General"),

  "appearance.icon_style": g({
    type: "select", label: "Menu bar icon",
    description: "The style of the Lodekit icon in the macOS menu bar.",
    options: [{ value: "a", label: "Solid" }, { value: "b", label: "Knockout" }, { value: "c", label: "Outline" }],
    default: "b",
  }, "Appearance"),
  "appearance.theme": g({
    type: "select", label: "Theme",
    description: "Light or dark mode for the dashboard and all apps. System follows the OS setting.",
    options: [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }],
    default: "system",
  }, "Appearance"),

  "tasks.default_retries": p({
    type: "number", label: "Default retries",
    description: "Retries after a task's first failed attempt, when the task doesn't set its own.",
    default: 3, min: 0, max: 20, integer: true,
  }, "Tasks"),
  "tasks.default_timeout": p({
    type: "duration", label: "Default timeout",
    description: "How long a task attempt may run before it is failed, when the task doesn't set its own.",
    default: "5m", min: "1s",
  }, "Tasks"),
  "tasks.default_catch_up": p({
    type: "duration", label: "Default catch-up window",
    description: "How late a missed scheduled run may still fire, when the task doesn't set its own.",
    default: "1h", min: "1m",
  }, "Tasks"),
  "tasks.run_retention_count": p({
    type: "number", label: "Run history per task",
    description: "The newest runs always kept per task, regardless of age.",
    default: 100, min: 1, integer: true,
  }, "Tasks"),
  "tasks.run_retention_age": p({
    type: "duration", label: "Run history age",
    description: "Finished runs older than this are pruned (unless within the per-task count).",
    default: "30d", min: "1d",
  }, "Tasks"),
  "tasks.backoff_base": p({
    type: "duration", label: "Retry backoff base",
    description: "First retry delay; each retry doubles it.",
    default: "30s", min: "1s", advanced: true,
  }, "Tasks"),
  "tasks.backoff_cap": p({
    type: "duration", label: "Retry backoff cap",
    description: "The retry delay never exceeds this.",
    default: "10m", min: "1s", advanced: true,
  }, "Tasks"),
  "tasks.schedule_grace": p({
    type: "duration", label: "Schedule grace",
    description: "An occurrence this close to now always fires, even with catch-up disabled.",
    default: "30s", min: "1s", advanced: true,
  }, "Tasks"),
  "tasks.min_every": p({
    type: "duration", label: "Minimum interval",
    description: "The smallest allowed \"every\" interval a task may declare.",
    default: "1m", min: "1s", advanced: true,
  }, "Tasks"),
  "tasks.dispatch_poll": g({
    type: "duration", label: "Dispatch poll",
    description: "Fallback poll rate of the task dispatcher (enqueues nudge it immediately).",
    default: "1s", min: "1s", max: "1m", advanced: true,
  }, "Tasks"),
  "tasks.sweep_interval": g({
    type: "duration", label: "Run-history sweep",
    description: "How often finished task runs are pruned.",
    default: "60s", min: "5s", advanced: true,
  }, "Tasks"),
  "tasks.list_limit": p({
    type: "number", label: "Runs page size",
    description: "Default number of runs returned by the runs API when no limit is given.",
    default: 50, min: 1, max: 200, integer: true, advanced: true,
  }, "Tasks"),

  "logs.retention_age": p({
    type: "duration", label: "Log retention",
    description: "Log records older than this are pruned.",
    default: "7d", min: "1d",
  }, "Logs"),
  "logs.retention_max_rows": g({
    type: "number", label: "Log store cap",
    description: "Hard cap on stored log records across the platform; the oldest are pruned first.",
    default: 200_000, min: 1_000, integer: true,
  }, "Logs"),
  "logs.sweep_interval": g({
    type: "duration", label: "Log sweep",
    description: "How often log retention is enforced.",
    default: "60s", min: "5s", advanced: true,
  }, "Logs"),
  "logs.list_limit": p({
    type: "number", label: "Logs page size",
    description: "Default number of log records returned when no limit is given.",
    default: 100, min: 1, max: 1000, integer: true, advanced: true,
  }, "Logs"),

  "kv.sweep_interval": g({
    type: "duration", label: "Store sweep",
    description: "How often expired Store entries are removed.",
    default: "60s", min: "5s", advanced: true,
  }, "Store"),
  "kv.list_limit": p({
    type: "number", label: "Store page size",
    description: "Default number of Store entries returned when no limit is given.",
    default: 1000, min: 1, max: 1000, integer: true, advanced: true,
  }, "Store"),

  "files.sweep_interval": g({
    type: "duration", label: "Files sweep",
    description: "How often expired files are removed.",
    default: "60s", min: "5s", advanced: true,
  }, "Files"),
  "files.list_limit": p({
    type: "number", label: "Files page size",
    description: "Default number of files returned when no limit is given.",
    default: 100, min: 1, max: 1000, integer: true, advanced: true,
  }, "Files"),

  "events.retention_age": p({
    type: "duration", label: "Event retention",
    description: "Events older than this are pruned from the bus history.",
    default: "30d", min: "1d",
  }, "Events"),
  "events.retention_max_rows": g({
    type: "number", label: "Event store cap",
    description: "Hard cap on stored events across the platform; the oldest are pruned first.",
    default: 50_000, min: 1_000, integer: true,
  }, "Events"),
  "events.sweep_interval": g({
    type: "duration", label: "Event sweep",
    description: "How often event retention is enforced.",
    default: "60s", min: "5s", advanced: true,
  }, "Events"),

  "hosting.request_timeout": p({
    type: "duration", label: "Request timeout",
    description: "How long an app may take to answer an HTTP request.",
    default: "30s", min: "1s",
  }, "App hosting"),
  "hosting.restart_backoff_base": p({
    type: "duration", label: "Restart backoff base",
    description: "First delay before a crashed app server restarts; doubles per consecutive crash.",
    default: "1s", min: "1s", advanced: true,
  }, "App hosting"),
  "hosting.restart_backoff_cap": p({
    type: "duration", label: "Restart backoff cap",
    description: "The restart delay never exceeds this.",
    default: "10s", min: "1s", advanced: true,
  }, "App hosting"),
};
