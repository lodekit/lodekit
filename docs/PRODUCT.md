# Lodekit — Product Strategy

The brand and product strategy steering doc: positioning, narrative, messaging, and
voice. It exists so every outward-facing artifact — landing page, docs prose, blog
posts, launch material — and the future visual-identity work (`DESIGN.md`) draw from
one strategic source instead of re-deriving it per session.

- **Language:** `CONTEXT.md` is normative. This doc uses canonical terms (app, agent,
  engine, service, gateway, dashboard, manager, Lodekit root) without redefining them.
- **Boundaries:** visual identity (palette, typography, illustration) is out of scope —
  that is `DESIGN.md`'s job, briefed by §7 here. Architecture is out of scope — that is
  the product overview spec (`docs/specs/2026-07-02-product-overview-design.md`).
- **Provenance:** derived 2026-07-18 in a pair session using the INTENT `strategize`
  and `storytelling` disciplines: the five foundational questions run fresh, the
  narrative composed under the situation → complication → resolution pattern.
  The re-derivation **revalidated** the product statement from the 2026-07-02 spec;
  this doc is now the canonical home for strategy, positioning, and messaging.
- **Evidence flags:** claims carry `[firsthand]` (building and using Lodekit),
  `[desk]` (public information about the market), or `[hypothesis]` (believed, not
  yet validated — see §3 open questions). No primary user research exists yet; this
  doc is honest about that rather than dressed up as if it did.

## 1. Product statement

**Category:** the local platform for agent-built apps.

**Tagline:** *Cloud batteries, locally, easily.*

**Elevator:** Everything your apps need from a cloud — a real database, file storage,
secrets, scheduled tasks, an always-on engine — on the one computer you already own.
You describe the app; your agent builds it; Lodekit runs it and keeps it. No accounts,
no subscriptions, nobody else's computer. Your apps and your data are files in a
folder — back it up and it's yours forever.

"Batteries" is a marketing metaphor only — it never enters the domain language
(`CONTEXT.md` fixes *service* as the domain word). The tagline's three words carry the
three promises: **cloud batteries** (capability), **locally** (ownership), **easily**
(no tooling).

## 2. The derivation — five foundational questions

The investigation record behind §1. Kept so future sessions inherit the reasoning,
not just the conclusions.

### 2.1 Problem validation — is this a real problem?

Agents made personal software real: anyone can describe an app and have working code
minutes later. Software for an audience of one is economically viable for the first
time `[desk]`. But what the agent produces has no good place to live:

- **Frequency:** every agent-built tool faces the where-does-it-live question
  immediately — hosting, data, persistence, secrets, scheduling `[firsthand]`.
- **Severity:** for the primary audience (§2.2) it is adoption-blocking, not an
  inconvenience: without a home, the tool either moves to a hosted platform (cost,
  account, silo) or dies. Widely reported as the "graveyard of half-working scripts"
  experience `[desk]` `[hypothesis — severity for non-devs specifically is unvalidated]`.
- **Trajectory:** growing fast. Agent capability compounds; the keeping problem
  compounds with it. Nothing on the horizon solves it locally `[desk]`.

**Gate: proceed.** The strongest honest claim: *the making got easy; the keeping is
still broken.*

### 2.2 Audience definition — who has it?

**Primary: non-devs and tinkerers.** People comfortable asking an agent for things,
not comfortable with terminals, dev servers, or `node_modules`. Working profiles
(`[hypothesis]` — replace with research-based profiles once alpha intercepts exist):

- **The spreadsheet outgrower** — tracks real things (habits, collections, house
  projects, money) in tools shaped almost right. Wants the exactly-right tool; would
  never self-host anything that requires ops.
- **The tinkerer** — runs Home Assistant or a home server, quantifies something,
  already believes in local. Wants building power without becoming a maintainer.
- **The data-private** — won't put a life log, health data, or finances into another
  SaaS. Local is a requirement, not a preference.

**Secondary: developers** — want a zero-ceremony home for personal tools; also the
credibility audience and early evangelists. Served by honesty one layer down (the
stack is named, not hidden), never by dev-first framing.

**Structural note:** Lodekit has two constituencies by construction — the **person**
(customer: dashboard, docs, ownership story) and the **agent** (operator: skill, MCP,
SDK). Marketing addresses the person. The skill instructs; it never persuades.

### 2.3 Solution fit — is this the right form factor?

The form factor: one installed menubar app (the manager) supervising one local engine;
apps are URLs in the person's browser; everything precious is files in one folder
(the Lodekit root). Fit for the primary audience:

- No terminal, no builds, no per-app installs — the platform owns the toolchain, down
  to its own pinned Node `[firsthand]`.
- Backup = copy a folder. Ownership is legible even to someone who never opens a code
  editor.
- Apps in the browser meet people where personal tools already live.

Rejected forms: per-app desktop bundles (heavy, no shared services), hosted cloud
(breaks the point), static files (no batteries — no database, tasks, or secrets).

### 2.4 Feature validation — is the feature set right?

- **Essential (adoption-blocking without):** durable storage (db-store, kv-store,
  file-store), the zero-tooling build-and-run loop, the dashboard (see and trust what
  runs), agent drivability (skill + MCP), one-install distribution (manager).
- **Differentiators:** **gateways** — apps reach external providers through a managed
  door and credentials never enter agent-written code. This is the trust story:
  guardrails are what make agent-built software safe to live with
  `[hypothesis — that trust is a top adoption barrier]`. Also: scheduled tasks,
  one shared theme (ten agent-built apps feel like one product, not ten codepens),
  theming as the person's surface.
- **Deliberately absent:** sharing/publishing, multi-user, cloud sync. Each would
  blur the ownership positioning; each is a future decision, not an oversight (§3).

### 2.5 Competitive landscape — what exists?

`[desk]` — snapshot 2026-07; revisit before launch material ships.

| Class | Examples | Their thesis | Trade-off Lodekit exploits |
| --- | --- | --- | --- |
| Hosted AI app builders | Lovable, Bolt, v0, Replit | Prompt to deployed app, zero setup | Someone else's computer: account, subscription, data silo, per-app sprawl |
| In-chat apps | Claude artifacts and similar | Instant, in-conversation | Ephemeral: no storage, no schedule, no life beyond the chat |
| No-code tools | Airtable, Notion, Glide, Retool | Personal-ish tools without code | Cloud + subscription; generic shapes; ceilings where your needs get specific |
| Self-host platforms | Umbrel, CasaOS, Home Assistant | Your hardware, catalog apps | Other people's apps, not yours; ops burden aimed at tinkerers |
| Local-first tools | Obsidian, Anytype | Your data, one great app | A single app, not a platform for building your own |
| The incumbent | Spreadsheets; doing nothing | Free, already open | Everything is a workaround — the pain Lodekit names |

**White space:** the intersection *agent-built × locally-owned × batteries-included ×
non-dev-operable* is unoccupied — no player above holds more than two of the four.
Self-host platforms prove the local appetite exists at consumer scale; hosted AI
builders prove the build-by-describing behavior exists at consumer scale. Lodekit is
the join.

**Onlyness statement:** Lodekit is the only platform where agent-built apps run on
your own computer with cloud-grade services, operated by a person who never touches
a terminal.

## 3. Strategic frame

- **Context:** agents collapsed the cost of making software; MCP and skills made
  agent-agnostic infrastructure possible; personal hardware sits idle and capable.
- **Gap:** agent-built software has nowhere good to live — it rents a home in someone
  else's cloud or rots homeless on disk.
- **Opportunity:** own the keeping layer of the agent era. Whoever gives personal
  software a durable, owned home becomes the default substrate for it.
- **Goals:** v0.1 — a person completes the loop assisted. 0.x — an unassisted
  stranger completes it. The load-bearing product metric is **kept**: an app still in
  weekly use 30 days after scaffold `[hypothesis — instrumentation to be designed]`.
  Secondary: time to first running app; apps per instance over time.
- **Constraints:** small team; macOS-first alpha (ad-hoc signed); agent-agnostic by
  invariant; one canonical language by invariant; claims must stay honest — no cloud
  sync, no sharing, macOS-only are all currently true and must not be papered over.
- **Guiding principles:**
  1. **Ownership is the point** — local is why, not just how.
  2. **The person never touches tooling** — a terminal appearing anywhere is a defect
     in the story.
  3. **Guardrails make agent code livable** — trust is engineered, not asked for.
  4. **Many apps, one product** — coherence is a feature the person can feel.
  5. **Punch at systems, never at people** — the enemy is subscriptions, silos, and
     meters; never the people using them, never developers, never agents.
- **Key assumptions & open questions:**
  - `[hypothesis]` Non-devs feel the keeping problem acutely enough to install a
    platform. **Biggest risk in the strategy.** Validate with alpha intercept
    interviews — the first primary research to commission.
  - `[hypothesis]` Distrust of agent-written code is an adoption barrier that
    visible guardrails answer.
  - Business model: undefined. Nothing in this doc assumes one; pricing language is
    banned from artifacts until decided.
  - macOS-only weakens "the computer you already own" — sequence for Windows/Linux
    is open.
  - OSS positioning is settled: AGPL-3.0-only product, Apache-2.0 for
    everything a user's app touches; contributions closed through alpha.
    See `LICENSING.md` and `CONTRIBUTING.md`.
  - Sharing/publishing is deliberately out of the story; revisit once the ownership
    position is established.

## 4. Positioning — the enemy

The story leads with the enemy, in two beats. Both beats are documented trade-offs
(§2.5), not manufactured tension — keep them factual wherever they appear.

1. **Someone else's computer.** The hosted path: your app behind an account, on a
   meter, in a silo. You made it, but it lives at the vendor's pleasure — and so does
   your data.
2. **The graveyard.** The local path: output with no home. It needs tooling you don't
   have, keeps nothing durably, breaks silently, and joins the folder of half-working
   things you stopped opening.

Compression: **agent-built software today either lives on someone else's computer or
dies in a folder.** Lodekit is positioned as the third path — and the tagline is the
resolution compressed: keep the batteries, drop the cloud.

**What Lodekit is not** (guards against drift): not a deployment platform, not a
hosting company, not an app store, not a dev tool that happens to run locally, not
an agent. It is the home — the platform apps live on.

## 5. Brand narrative

Pattern: **situation → complication → resolution** (INTENT storytelling), told
enemy-first — artifacts open on the complication, then earn the situation and land
the resolution. This is the canonical telling; landing hero, launch post, and About
prose are compressions or expansions of it.

**Complication (open here):** You can have software made just for you now — and
nowhere to keep it. Ask an agent for a tool and it will build one; then the choice
appears. Host it on someone else's computer: an account, a subscription, your data in
their silo, a meter running on a thing you made. Or keep it on yours: a folder of
files that needs tools you don't have, forgets everything between runs, and quietly
dies. The making got easy. The keeping is still broken.

**Situation (the world that makes this urgent):** This didn't matter before, because
personal software didn't exist. Software was built for everyone-at-once, and you rented
whichever shape fit least badly. Agents ended that: software for one person is now a
conversation, and every conversation produces another thing with nowhere to live.

**Resolution:** Lodekit — the local platform for agent-built apps. One thing to
install. Your agent builds; the engine runs your apps like real software — a real
database, file storage, secrets, scheduled tasks, a dashboard that shows you
everything. All of it on your computer, and everything worth keeping is files in one
folder: copy it and it's yours forever. Cloud batteries, locally, easily.

**Why now (inside the resolution):** agents crossed the capability line; MCP made
agent-agnostic platforms possible; the computer on your desk is idle and more than
capable.

### What-is / what-could-be pairs

For persuasion surfaces (landing sections, launch post). Oscillate; end on the gap.

| What is | What could be |
| --- | --- |
| Renting generic tools that fit almost | A set of small apps shaped exactly like your life |
| Your data spread across silos you can't open | Your data in a folder you can copy |
| A subscription per need | One platform, no meter |
| Scripts that die when you look away | Apps that are still running, still yours, next year |

### Narrative rules

- **Docs never punch.** Enemy-led framing is for persuasion surfaces. Docs orient
  people already inside — calm, concrete, zero adversarial framing.
- **User stories are calm-shaped.** The lived product experience is habitual, not
  heroic. Compose user stories kishōtenketsu-style (introduction → development →
  twist → settling) rather than forcing conflict arcs onto a habit tracker.
- **Story is not evidence.** The narrative makes people care; §2's evidence makes
  claims true. Never cite the story as proof, and never smooth real user data into a
  cleaner arc than it had — once real users exist, their mess stays visible.
- **Keep the complication factual.** The two beats survive because they are checkable
  trade-offs. If an artifact needs a bigger enemy than the evidence supports, the
  artifact is wrong.

## 6. Messaging

Five pillars. Every outward claim should trace to one; an artifact that needs a sixth
should question itself first.

| # | Pillar | The claim | Proof points |
| --- | --- | --- | --- |
| 1 | **Keep the batteries, drop the cloud** | Everything apps need from a cloud, without the cloud | Real database, file storage, secrets, scheduled tasks, gateways to outside services — all local services of one engine |
| 2 | **Yours forever** | Ownership you can hold | Apps and data are files in one folder; backup = copy; no accounts; readable on disk |
| 3 | **Never touch tooling** | You never build, install, or configure | One menubar install; platform provisions its own Node; apps build themselves on save |
| 4 | **Safe to let an agent build** | Guardrails, not vibes | Apps run in isolated workers; each app sees only its own data; secrets never enter app code; failures surface in the dashboard, never crash the platform |
| 5 | **Many apps, one product** | Ten apps that feel like one | Shared UI library and theme; one dashboard for every app's state, data, and tasks |

**Message architecture by audience:** the primary audience gets pillars in the order
above — outcome and ownership first, mechanics as proof. The developer audience gets
the same pillars plus the honesty layer: name the stack (TanStack Start, SQLite,
shadcn, MCP) one level below the headline — never in it. Credibility for developers
comes from real names; warmth for non-devs comes from never leading with them.

**Language rules:** canonical terms end-to-end (`CONTEXT.md`) — *app* (never tool,
project, widget), *agent* (never Claude-as-generic, AI, assistant), *service* in
product surfaces ("batteries" only in marketing prose). Marketing may simplify; it may
never rename.

## 7. Voice & tone

The personality, stated as attributes so the future `DESIGN.md` session can translate
it visually. Voice attributes: **plain-spoken** (short words, concrete nouns),
**quietly confident** (states, doesn't hype), **wry, not cynical** (the edge points at
systems, per principle 5), **warm underneath** (the product is about keeping things —
domestic verbs like *live*, *keep*, *home* are on-voice), **honest to a fault**
(limitations stated plainly; "macOS only, for now" over silence).

| Do | Don't |
| --- | --- |
| "Your data is a folder. Copy it and it's yours forever." | "Revolutionary local-first AI-native platform" |
| "No accounts. No subscriptions. Nobody else's computer." | Mocking people who use cloud tools |
| "Ask your agent for an app. Use it in your browser a minute later." | Leading with framework names in a headline |
| "It broke? The dashboard shows you exactly where." | Pretending agent-built code never breaks |

Register calibration: **landing** — full voice, enemy-led, wry edge allowed;
**docs** — same plainness, zero edge, orientation only; **dashboard/product UI** —
neutral and factual, personality through clarity, not copy; **blog/launch** — the §5
narrative at full length, evidence-honest.

## 8. Using this doc

- **Landing page:** hero = complication compression (§4) → tagline as resolution;
  section order follows the pillars (§6); oscillation pairs (§5) for the persuasion
  band; stack names in the developer layer only.
- **Docs prose:** voice per §7 (no edge); narrative rules per §5 (calm-shaped, never
  punching).
- **Blog / launch post:** skeleton is §5 verbatim — complication, situation,
  resolution, why-now — with §2 evidence keeping it honest.
- **`DESIGN.md` session (next):** brief in = §7 attributes + §4 positioning + the
  audience of §2.2. Visual identity decisions happen there, not here.
- **Amending:** positioning, pillar, or narrative changes land here first, then flow
  outward — artifacts never fork the strategy locally. Resolve an open question in §3
  by editing this doc in the same change.
