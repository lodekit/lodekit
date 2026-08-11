# 012-feat: Settings

**Status:** Active · **Last reviewed:** 2026-08-11

## Overview

Settings is the service that gives the platform and apps declared, schema-typed values
the person edits in the dashboard — the person's knobs, as distinct from the kv-store,
which is the app's own runtime memory. It has two tiers: platform settings declared by
the engine (dot-namespaced keys covering General, Appearance, and every service
default), and app settings declared by each app (bare snake_case keys). The person
edits values in the dashboard; apps read and watch their own declared settings through
the SDK; services resolve their own effective configuration internally; the manager
subscribes and applies the two OS-side settings.

## Behavior

- Every setting is one of a closed set of five field types — boolean, string, number,
  select, duration — each rendering as exactly one dashboard control. A label,
  one-line description, and default are required, so an undocumented knob cannot exist.
- An app declares its settings in a dedicated source module (`defineSettings()`); on
  each successful app-worker boot the schema registers wholesale — settings absent
  from the new declaration are removed and their stored person-set values pruned. A
  field with a bad declaration shows a per-field error in the dashboard without
  blocking its siblings, and a module load error never wipes previous definitions —
  declarations survive a down or broken worker.
- Platform settings carry a scope: global (one engine-wide value) or per-app. Per-app
  service settings can be overridden from an app's settings section; overriding a
  global setting is refused. Engine internals sit behind a collapsed Advanced
  disclosure per service; hard API caps (body limits, list ceilings) are not settings.
- Resolution is app override → platform value → declared default (the effective
  value). Only explicitly set values persist; reset deletes the stored value, so a
  later change to a code default reaches everyone who never touched the knob.
- A stored value that no longer validates against its current schema is treated as
  unset — the default wins, and the dashboard badges the row "was reset to default".
  A rejected write keeps the person's typed input for correction.
- The dashboard Settings page navigates General, Appearance, Services (one tab per
  service), then one section per app. The reset affordance doubles as the modified
  indicator. An app's section shows its declared settings, its Secrets panel, and a
  collapsed Service Overrides card that displays the platform value each override
  shadows.
- Apps read only their own declared settings through the SDK: typed reads per key, a
  read of all effective values, and a watch that fires on value changes (browser-side
  only). Apps never read service settings — services apply their own effective values.
- Writes are person-only: the SDK has no write surface and MCP exposes read-only
  inspection tools. Every mutation lands on the event bus as an identity-carrying
  fact (`value-set`, `value-cleared`, `defs-changed`), so the dashboard, the manager,
  and app watchers converge live, and engine loops re-arm when their intervals change.
- The theme setting drives light/dark mode for the dashboard and every hosted app.
  The manager applies launch-at-login and the menubar icon style, and reconciles on
  connect: if the OS state differs, the OS wins and is written back to the setting.
- Values are the person's data and live in the Backup tree — app settings and
  overrides with the app's own data, platform values in the platform data area.

## Design Decisions

### 1. A closed five-type schema is the feature

**Decision:** Only boolean, string, number, select, and duration exist, each mapping
to exactly one dashboard component, with label/description/default mandatory.
**Why:** The dashboard can always render a competent editor and validation is
enforceable at the trust boundary (settings spec §2). An app needing richer
configuration UX builds its own page on its stores — that is the settings/kv-store
line, not a workaround.
**Tradeoff:** No colors, lists, or long text until a type is added deliberately;
expressiveness is capped by design.

### 2. Declaration by convention file, registered at worker boot

**Decision:** A typed declaration module compiled into the app's server bundle; the
booting worker posts the schema and the engine stores durable definitions.
**Why:** The tasks precedent — type inference makes per-key reads typed, and durable
registration keeps the dashboard rendering an app's settings while its worker is
broken. Chosen over a manifest block (no inference, JSON authoring).
**Tradeoff:** Schema changes take effect only on a successful boot; a broken app
shows its last good schema.

### 3. The person writes; apps read

**Decision:** No write in the SDK, no MCP write tool.
**Why:** Keeps the three-store boundary crisp enough to teach in five lines: settings
are the person's knobs, the kv-store is the app's memory, the secret-store holds
credentials.
**Tradeoff:** An app cannot migrate or self-adjust its own settings.

### 4. Only explicit values persist; drift silently yields the default

**Decision:** Unset means the schema default, reset deletes the row, and a stored
value that no longer validates reads as the default with a visible notice.
**Why:** The modified indicator stays truthful, default changes propagate to the
untouched majority, and a tightened constraint can never poison reads.
**Tradeoff:** A person's stored value can be quietly bypassed after a schema change —
the badge is the only tell.

### 5. The engine owns platform settings; the manager is an applier

**Decision:** One store and one editing UX (the dashboard); the manager reads over
HTTP + SSE, applies the two OS-side settings, and keeps only a boot cache locally.
On connect the OS state is the applied truth and is written back if it differs.
**Why:** One store, one UX; the platform never silently fights the OS.
**Tradeoff:** Editing requires a running engine, and manager-applied settings are
desired state (not applied) whenever no manager is attached.

## Related

- **Recs:** 001-arch-event-envelope-kind-component, 002-arch-event-fact-types
  (settings watch keys on explicit value facts and no longer fires on defs reloads),
  008-feat-dashboard, 010-feat-app-storage (the kv-store side of the boundary),
  015-feat-secret-store (the third store)
- **Specs:** `docs/specs/2026-07-07-settings-design.md`,
  `docs/specs/2026-07-16-events-canonical-model-design.md`,
  `docs/specs/2026-07-09-dashboard-ui-revamp-design.md`

## Open Questions

- Greenhouse exercises only declaration plus the typed single-key read
  (`weather_location`); the watch surface and the richer field types still await a
  dedicated Greenhouse chapter (tracked in the showcase coverage table).
