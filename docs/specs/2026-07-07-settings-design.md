# Settings service (v1) — design

**Date:** 2026-07-07
**Status:** Approved
**Fits:** the umbrella spec's service-catalog row "settings — Future" and its dashboard
per-service-panels row (`docs/specs/2026-07-02-product-overview-design.md`). Joins the
catalog beside kv-store (`2026-07-03-kv-store-v2-design.md`), file-store
(`2026-07-06-file-store-design.md`), logging (`2026-07-06-logging-design.md`), and tasks
(`2026-07-06-tasks-service-design.md`), whose declaration pattern (`src/tasks.ts`) it
deliberately mirrors. Closes the roadmap items "Settings" (apps register settings),
"Service defaults/thresholds → settings", and "Log retention as dashboard settings", and
supersedes the theming spec's deferral of a person-facing dark/light toggle
(`2026-07-06-user-theming-and-ui-catalog-design.md`).

## 1. Purpose and v1 scope

Settings is the service that gives the platform and apps **fixed, declared properties the
person edits in the dashboard**: a schema-driven Settings page covering platform behavior
(start at login, icon style, theme), service tuning (task defaults, retention, timeouts),
and each app's own declared settings — with per-app overrides of service tuning.

**In v1:** a closed five-type schema (`boolean`, `string`, `number`, `select`,
`duration`) with required label + one-line description per setting; app declaration via
`src/settings.ts` with full type inference; the platform settings catalog (§6) including
every current hard-coded service default, engine internals grouped under a collapsed
**Advanced** tier; per-app overrides of per-app-scoped service settings; a dashboard
`/settings` page whose editors are inferred from the schema; live `settings-change` SSE;
manager integration (tray "Settings…" deep link; manager applies `start_at_login` and
`icon_style`); read-only SDK (`get`/`all`/`watch`) and MCP inspection tools.

**Not in v1** (deferred, §12): secrets (its own slice — no secret-typed setting exists,
by design), additional field types (color, multiline text, string lists), app-declared
setting groups, an MCP write tool, theme presets/pickers.

## 2. Decisions and rationale

- **The closed type set is the feature.** Five types, each mapping to exactly one
  dashboard component, guarantee the page can always render a competent editor and that
  validation is enforceable at the trust boundary. An app that needs richer configuration
  UX builds its own page on the Store — that is the Settings/Store line, not a workaround.
- **Declaration by convention file** (`src/settings.ts`, a `defineSettings()` wrapper) —
  the tasks precedent. Chosen over a manifest block (no type inference, JSON authoring)
  because `defineSettings` lets the SDK type `settings.get()` per key. Registration rides
  the same worker-boot manifest mechanism as tasks, so schemas are durable and the
  dashboard renders them while a worker is down or broken.
- **Runtime owns platform settings; the manager subscribes.** One store, one UX. The
  manager reads platform settings over HTTP + SSE and applies the two OS-side ones
  (`start_at_login` via Electron's login-item API, `icon_style` on the tray). Its
  schema-less `settings.json` shrinks to a cache of last-applied values so the tray icon
  renders correctly before the runtime is up. Editing requires the runtime — acceptable,
  since editing happens in the dashboard, which requires the runtime anyway.
- **Person writes; apps read.** No `settings.set()` in the SDK, no MCP write tool. If app
  code wants to persist its own state, that's the Store. This keeps the three-store
  boundary (§3) crisp enough for the skill to teach in five lines.
- **Everything becomes a setting; internals go under Advanced.** Person-meaningful knobs
  (task defaults, retention) render normally; engine internals (backoff curves, sweep
  intervals, poll rates) live in a collapsed Advanced group per service. Both tiers are
  per-app overridable where per-app has meaning; settings that parameterize a single
  runtime-wide loop (sweeps, the tasks dispatch poll) are declared `global` and never
  appear on app pages. Hard API caps (body limits, list-limit ceilings) stay code — they
  are guardrails protecting the API, not knobs.
- **Only explicit values are persisted.** Unset = the schema default; reset = delete the
  row. The dashboard can therefore always show what's modified, and changing a code
  default later takes effect for everyone who never touched the knob.
- **Values live in the data tree, not State.** Settings are the person's data and follow
  the backup boundary: app settings and per-app overrides in the app's own SQLite
  (lifecycle follows the app's data), platform values in `data/_platform/settings.sqlite`
  (`_platform` joins `_dashboard` as a reserved id). State (`logs.sqlite`) remains
  disposable; settings are not.

## 3. Terminology (closes with this slice)

- **Setting** — a declared, schema-typed value the person edits in the dashboard.
  Platform settings are declared by the runtime (dot-namespaced keys, e.g.
  `tasks.default_retries`); app settings are declared in the app's `src/settings.ts`
  (bare `snake_case` keys). _Avoid_: preference, option, config, flag.
- **Override** — an app-level value for a per-app-scoped service setting, taking
  precedence over the platform value for that app.
- **Effective value** — the result of resolution: app override → platform value → code
  default (service settings), or set value → default (all others).
- **Scope** — `global` (one runtime-wide value; never overridable) or `per-app`
  (overridable from an app's settings page).
- **Section** — a dashboard nav grouping: **General**, **Appearance**, **Services**
  (one group per service), then one section per app. **Advanced** is the collapsed
  internals tier inside a service group.
- The three-store boundary, normative for docs and the skill: **Settings** — the person's
  knobs (person writes, app reads). **Store (kv)** — the app's own memory (app writes,
  app reads). **Secrets** — sensitive values the person provides; server-side app code
  reads them; values never reach the browser. Credentials never go in Settings.
- Catalog naming: **settings**; catalog-name → SDK-handle mapping `settings → settings`.
- `context.md` is amended: the Settings entry gains the platform tier and the override
  concept; the Store-vs-Settings flagged ambiguity gains the Secrets line.

## 4. Schema — the five types

Every setting, platform or app, is one of five field types. Common required properties:
`label` (short noun phrase), `description` (the one-liner rendered under the control),
`default`. A declaration missing any of them fails validation — the skill cannot
scaffold an undocumented setting.

| Type | Constraints | Dashboard component |
|---|---|---|
| `boolean` | — | switch |
| `string` | `maxLength`, `placeholder` | text input |
| `number` | `min`, `max`, `step`, `integer` | numeric input with stepper |
| `select` | `options: [{ value, label }]` | segmented control (≤4 options) / dropdown |
| `duration` | `min`, `max` | value + unit input (`s/m/h/d` grammar, shared parser) |

Optional common properties: `advanced: true` (folds into the collapsed Advanced group).
Platform settings additionally carry `scope: "global" | "per-app"` and a service/section
assignment; app settings are always their own scope and never carry `scope`.

## 5. Declaration contract — `src/settings.ts`

```ts
// apps/<id>/src/settings.ts
import { defineSettings, boolean, select, duration } from "@lodekit/sdk";

export default defineSettings({
  show_archived: boolean({
    label: "Show archived items",
    description: "Include archived items in the main list.",
    default: false,
  }),
  layout: select({
    label: "Layout",
    description: "How items are arranged on the home screen.",
    options: [
      { value: "grid", label: "Grid" },
      { value: "list", label: "List" },
    ],
    default: "grid",
  }),
  refresh_every: duration({
    label: "Refresh interval",
    description: "How often the feed refreshes in the background.",
    default: "15m",
    min: "1m",
  }),
});
```

- `defineSettings` is a thin SDK wrapper: it validates shape locally and returns the
  schema tagged; it does not talk to the runtime. Its type parameter drives SDK
  inference: `settings.get("refresh_every")` is typed, keys autocomplete.
- Keys are `snake_case`, no dots (dots are reserved for platform namespacing); collisions
  with reserved namespaces are impossible by construction.
- The Start build includes `src/settings.ts` as an additional server-bundle entry
  (exactly the tasks mechanism). On worker boot, the worker posts a **settings manifest**
  (the schema, serialized) to the runtime, which upserts durable definitions into the
  app's SQLite. Schemas therefore survive a down or broken worker — the dashboard still
  renders the app's settings from the last successful registration.
- Registration is wholesale per successful boot: definitions absent from the new manifest
  are removed and their stored values pruned (a person-set value for a setting the app
  deleted is meaningless). Per-field declaration errors (missing label/description/
  default, bad constraint) fail that field's registration with a visible per-field error
  in the dashboard; other fields still register. Apps without `src/settings.ts` have no
  declared settings — their settings page shows only Service overrides.
- The folder-watcher/rebuild pipeline picks up edits like any source change;
  re-registration happens on the resulting worker boot.

## 6. Platform settings catalog

Declared in runtime code with the same field builders. Defaults are today's constants —
this table is normative and replaces them (each constant's site reads the effective value
instead).

**General**

| Key | Type | Default | Scope | |
|---|---|---|---|---|
| `general.start_at_login` | boolean | false | global | applied by the manager (§9) |

**Appearance**

| Key | Type | Default | Scope | |
|---|---|---|---|---|
| `appearance.icon_style` | select a/b/c | b | global | applied by the manager (§9) |
| `appearance.theme` | select system/light/dark | system | global | drives dashboard + all hosted apps (§8) |

**Services → Tasks**

| Key | Type | Default | Scope | Advanced |
|---|---|---|---|---|
| `tasks.default_retries` | number (int, ≥0) | 3 | per-app | |
| `tasks.default_timeout` | duration | 5m | per-app | |
| `tasks.default_catch_up` | duration | 1h | per-app | |
| `tasks.run_retention_count` | number (int, ≥1) | 100 | per-app | |
| `tasks.run_retention_age` | duration | 30d | per-app | |
| `tasks.backoff_base` | duration | 30s | per-app | ✓ |
| `tasks.backoff_cap` | duration | 10m | per-app | ✓ |
| `tasks.schedule_grace` | duration | 30s | per-app | ✓ |
| `tasks.min_every` | duration | 1m | per-app | ✓ |
| `tasks.dispatch_poll` | duration | 1s | global | ✓ |
| `tasks.sweep_interval` | duration | 60s | global | ✓ |

**Services → Logs**

| Key | Type | Default | Scope | Advanced |
|---|---|---|---|---|
| `logs.retention_age` | duration | 7d | per-app | |
| `logs.retention_max_rows` | number (int) | 200 000 | global (one platform-wide table cap) | |
| `logs.sweep_interval` | duration | 60s | global | ✓ |
| `logs.list_limit` | number (int) | 100 | per-app | ✓ |

**Services → Store**

| Key | Type | Default | Scope | Advanced |
|---|---|---|---|---|
| `kv.sweep_interval` | duration | 60s | global | ✓ |
| `kv.list_limit` | number (int) | 1000 | per-app | ✓ |

**Services → Files**

| Key | Type | Default | Scope | Advanced |
|---|---|---|---|---|
| `files.sweep_interval` | duration | 60s | global | ✓ |
| `files.list_limit` | number (int) | 100 | per-app | ✓ |

**Services → App hosting**

| Key | Type | Default | Scope | Advanced |
|---|---|---|---|---|
| `hosting.request_timeout` | duration | 30s | per-app | |
| `hosting.restart_backoff_base` | duration | 1s | per-app | ✓ |
| `hosting.restart_backoff_cap` | duration | 10s | per-app | ✓ |

Hard list-limit ceilings (cap 1000) and the 100kb body limit stay code, as guardrails.
Each per-app setting's constraint set applies equally to overrides.

**Liveness** — when a change takes effect (rendered as fine print in the dashboard where
it isn't instant): `appearance.*` and `general.*` — instant (SSE). Retention and sweep
intervals — next sweep. Task defaults — next run materialization/enqueue. Timeouts and
backoff — next request/attempt/restart. Poll intervals — the running loop re-arms on
change via the event bus.

## 7. Storage, resolution, and the scoped API

`packages/runtime/src/services/settings.ts`, the catalog pattern: `CATALOG_NAME =
"settings"`, chained Hono router with `zValidator`, `export type SettingsRoutes` for the
SDK, SSE emission on mutation.

**Storage.** Two `_lodekit_`-prefixed tables in each app's `data/<appId>/db.sqlite`:
`_lodekit_setting_defs` (key PK, schema JSON, field-error text, registered-at) and
`_lodekit_setting_values` (key PK, value JSON, updated-at) — bare keys are the app's own
settings, dot-namespaced keys are its service overrides. Platform values live in
`data/_platform/settings.sqlite` (values table only — the platform schema is code).
Validation on write is built from the registered schema; a write to an unknown key is
404, a value failing its field's constraints is 400 with the reason.

**Resolution.** Service settings: app override → platform value → code default. App
settings: set value → declared default. Services resolve effective values at point of use
through a runtime-internal `getEffective(key, appId?)` with an in-memory cache
invalidated by the event bus — no service ever caches a value past a change event.
**Apps never read service settings through the SDK**; services apply their own effective
config. **Schema drift:** a stored value that no longer validates (option removed,
constraint tightened) is treated as unset — the default wins, and the dashboard shows a
"was reset to default" notice on that setting until dismissed by any edit.

**Routes.**

- Platform: `GET /api/settings` (schema + set values + effective values, section
  structure included), `PUT /api/settings/:key` `{ value }`, `DELETE /api/settings/:key`
  (reset).
- Per app, under `/api/apps/:appId/settings`: `GET /` (declared schema + values, plus the
  app's overridable service settings with inherited/effective values), `PUT /:key`,
  `DELETE /:key` — where `:key` is a declared app key or a per-app-scoped platform key
  (an override); anything else is 404.

Mutations broadcast **`settings-change`** on the existing SSE bus — app-scoped for app
keys and overrides, platform-scoped for platform keys — carrying `{ key }` (values are
re-fetched, matching the established change-event shape family).

## 8. SDK, theme plumbing, MCP, and skill

**SDK** (read-only; typed via `hc<SettingsRoutes>` and the `defineSettings` inference):

```ts
import { settings } from "@lodekit/sdk";

const layout = await settings.get("layout");   // typed from defineSettings
const all = await settings.all();
settings.watch(cb);                            // client-side, shared EventSource channel
```

**Theme.** `appearance.theme` supersedes the theming spec's deferred toggle. The shared
root scaffolding (dashboard `__root.tsx` and the app scaffold's equivalent) resolves it:
`system` → today's `matchMedia` behavior; `light`/`dark` → forced root class. The
effective theme is exposed on the `_ui` substrate beside `/_ui/theme.css` so hosted apps
inherit it with no app code, live via `settings-change`. Agent-owned `theme.css` files
are untouched — this setting picks the mode, theming still owns the look.

**MCP** — read-only inspection, mirroring the kv tools: `lodekit_settings_list` (platform
or a given app: schema + effective values) and `lodekit_settings_get`.

**Skill** — a new `## Settings` section: the `defineSettings` example, the read-only SDK
surface, and the three-store boundary from §3 verbatim (settings = person's knobs; store
= app memory; secrets = credentials, never settings).

## 9. Manager integration

- The tray gains **Settings…** → opens `${dashboardUrl}/settings` (the first dashboard
  deep link). The icon-style radio submenu and the start-at-login checkbox leave the
  tray; the manager remains the *applier*, not an editor.
- On runtime-up the manager fetches `GET /api/settings` and subscribes to
  `settings-change`; on change (or connect) it applies `appearance.icon_style` to the
  tray and `general.start_at_login` via `app.setLoginItemSettings`, then records
  last-applied values in its existing `settings.json` (now purely a pre-runtime cache for
  correct tray rendering at boot).
- **Reconciliation:** the OS login item is the applied truth and the setting the desired
  state. On connect, if the OS state differs (the person toggled it in System Settings
  directly), the manager writes the OS state back to the setting — the platform never
  silently fights the OS.
- Dev mode (`app.isPackaged` false): Electron cannot manage login items, so
  `start_at_login` is applied only when packaged; the dashboard control notes this via
  its liveness fine print. Dashboard-only operation (no manager running) leaves the two
  manager-applied settings editable but un-applied until a manager connects — desired
  state, by design.

## 10. Dashboard UX

A new internal route `packages/runtime/dashboard/src/routes/settings.tsx` (the logs-page
pattern), left-nav sections: **General · Appearance · Services · [apps…]**.

- Every control renders its **label** with the **one-line description** beneath it — no
  undocumented knobs, enforced by the schema (§4).
- Component per type per the §4 table. Durations render as value + unit.
- A **modified indicator** marks any explicitly set value, with a per-setting **Reset to
  default** affordance (the default value shown). Advanced groups are collapsed by
  default behind an "Advanced" disclosure per service.
- Service groups show scope quietly: global settings carry an "applies to all apps" hint.
- **App page:** the app's declared settings first (with any per-field registration errors
  inline), then a **Service overrides** section listing the app's overridable service
  settings with their inherited effective values; each has an **Override** affordance
  that turns the row editable, and a **Revert to platform value** once overridden.
- Live: the page subscribes to `settings-change` so concurrent edits (or
  manager reconciliation) reflect immediately.

## 11. Testing

- **Unit (pure):** field-builder validation (missing label/description/default rejected,
  constraint checks per type), resolution order (override → platform → default),
  schema-drift-to-default, duration grammar reuse, wholesale re-registration pruning.
- **Service (Hono router, temp root):** platform and per-app GET/PUT/DELETE round-trips;
  unknown-key 404; constraint-violation 400; override of a global-scoped key rejected;
  `settings-change` emission; effective-value correctness in GET payloads.
- **Integration (real worker, e2e pattern):** fixture app declares settings; manifest
  registration on boot and after `src/settings.ts` edit; typed `settings.get`/`watch`
  round-trip; a service actually honoring an override (e.g. set `tasks.default_retries`
  override → new runs use it); schema survives a broken worker.
- **Manager (existing vitest suite):** apply-on-change and boot-cache behavior against a
  mocked runtime; login-item reconciliation logic (OS-differs → write-back).

## 12. Deferred (→ roadmap)

- **Secret-store** — its own slice; settings deliberately has no secret type. When it
  lands, its dashboard editor reuses this page's section/control patterns.
- **Additional field types** — color, multiline text, string lists — added when a real
  app needs one (each is component + validation + skill docs).
- **App-declared groups/sections** — apps get a flat list in v1.
- **MCP settings write tool** — "switch me to dark mode" from chat; read-only first, per
  the security posture.
- **Theme presets / pickers** — theming stays agent-edited CSS; this slice only adds the
  mode switch.
