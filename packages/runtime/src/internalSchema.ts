// Internal tables declared in drizzle (spec §5): the types and the drift test.
// The migration files stay the source of truth for DDL — the schema-drift test
// asserts these declarations never diverge from what the chains build.
import { sqliteTable, text, integer, blob, primaryKey, index } from "drizzle-orm/sqlite-core";

// --- app db (packages/runtime/src/migrations/appDb.ts) ---

// Note: single-column primary keys use the table-level `primaryKey({ columns })`
// helper rather than the column-builder's `.primaryKey()` shorthand. drizzle-kit's
// SQLite generator unconditionally appends `NOT NULL` to a `.primaryKey()` column
// (matching other dialects' semantics) even though SQLite itself leaves a plain
// `TEXT/INTEGER PRIMARY KEY` column nullable — the table-level helper is the only
// declaration shape that reproduces the chain's actual DDL (and its `notnull: 0`
// fingerprint) exactly. Never call `.notNull()` on these columns — that reintroduces
// the same drift.

const kv = sqliteTable(
  "_kv",
  {
    key: text("key"),
    value: text("value").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (t) => [primaryKey({ columns: [t.key] }), index("_idx_kv_expires").on(t.expiresAt)]
);

const files = sqliteTable(
  "_files",
  {
    slug: text("slug"),
    path: text("path").notNull(),
    title: text("title"),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    hash: text("hash").notNull(),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (t) => [primaryKey({ columns: [t.slug] }), index("_idx_files_expires").on(t.expiresAt)]
);

const settingDefs = sqliteTable(
  "_setting_defs",
  {
    key: text("key"),
    field: text("field"),
    error: text("error"),
    registeredAt: integer("registered_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key] })]
);

const settingValues = sqliteTable(
  "_setting_values",
  {
    key: text("key"),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key] })]
);

const taskDefs = sqliteTable(
  "_task_defs",
  {
    name: text("name"),
    scheduleKind: text("schedule_kind"),
    scheduleExpr: text("schedule_expr"),
    catchUpMs: integer("catch_up_ms"),
    retries: integer("retries"),
    timeoutMs: integer("timeout_ms"),
    retired: integer("retired").notNull().default(0),
    error: text("error"),
    registeredAt: integer("registered_at").notNull(),
    highWater: integer("high_water"),
  },
  (t) => [primaryKey({ columns: [t.name] })]
);

const taskRuns = sqliteTable(
  "_task_runs",
  {
    id: integer("id"),
    task: text("task").notNull(),
    state: text("state").notNull(),
    payload: text("payload"),
    dedupeKey: text("dedupe_key"),
    attempt: integer("attempt").notNull().default(0),
    notBefore: integer("not_before").notNull(),
    source: text("source").notNull(),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    durationMs: integer("duration_ms"),
    error: text("error"),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    index("_idx_task_runs_due").on(t.state, t.notBefore),
    index("_idx_task_runs_task").on(t.task, t.id),
  ]
);

const secretSlots = sqliteTable(
  "_secret_slots",
  {
    slot: text("slot"),
    def: text("def"),
    error: text("error"),
    registeredAt: integer("registered_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.slot] })]
);

const schema = sqliteTable(
  "_schema",
  {
    id: integer("id"),
    snapshot: text("snapshot").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.id] })]
);

// --- events db (packages/runtime/src/migrations/platform.ts) ---

const events = sqliteTable(
  "events",
  {
    id: integer("id"),
    ts: integer("ts").notNull(),
    ns: text("ns").notNull(),
    source: text("source").notNull(),
    type: text("type").notNull(),
    payload: text("payload"),
    expiresAt: integer("expires_at"),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    index("events_ns").on(t.ns, t.id),
    index("events_ts").on(t.ts),
  ]
);

// --- logs db ---

const logs = sqliteTable(
  "logs",
  {
    id: integer("id"),
    ts: integer("ts").notNull(),
    level: integer("level").notNull(),
    source: text("source").notNull(),
    appId: text("app_id"),
    message: text("message").notNull(),
    fields: text("fields"),
  },
  (t) => [
    primaryKey({ columns: [t.id] }),
    index("logs_app").on(t.appId, t.id),
    index("logs_level").on(t.level, t.id),
    index("logs_ts").on(t.ts),
  ]
);

// --- secrets db ---

const secrets = sqliteTable(
  "secrets",
  {
    slug: text("slug"),
    label: text("label").notNull(),
    description: text("description"),
    ciphertext: blob("ciphertext").notNull(),
    nonce: blob("nonce").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.slug] })]
);

const links = sqliteTable(
  "links",
  {
    appId: text("app_id").notNull(),
    slot: text("slot").notNull(),
    slug: text("slug").notNull(),
    linkedAt: integer("linked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.slot] })]
);

// --- settings db ---

const settings = sqliteTable(
  "settings",
  {
    key: text("key"),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key] })]
);

export const APP_DB_SCHEMA = { kv, files, settingDefs, settingValues, taskDefs, taskRuns, secretSlots, schema } as const;
export const EVENTS_SCHEMA = { events } as const;
export const LOGS_SCHEMA = { logs } as const;
export const SECRETS_SCHEMA = { secrets, links } as const;
export const SETTINGS_SCHEMA = { settings } as const;
