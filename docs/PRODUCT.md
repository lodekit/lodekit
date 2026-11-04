# Product

The brand and product strategy steering doc: positioning, narrative, messaging, and
voice. It exists so every outward-facing artifact — landing page, docs prose, blog
posts, launch material — and the visual-identity work (`DESIGN.md`) draw from one
strategic source instead of re-deriving it per session.

- **Language:** `DEFINITIONS.md` is normative. This doc uses canonical terms (app,
  agent, engine, service, gateway, dashboard, manager, Lodekit root) without
  redefining them.
- **Boundaries:** visual identity (palette, typography, illustration) is out of
  scope; that is `DESIGN.md`'s job, briefed by §7 here. Architecture is out of
  scope; that is `ARCHITECTURE.md`'s job.
- **Provenance:** derived 2026-07-18 in a pair session using the INTENT `strategize`
  and `storytelling` disciplines: the five foundational questions run fresh, the
  narrative composed under the situation → complication → resolution pattern.
  The re-derivation **revalidated** the product statement from the 2026-07-02 spec;
  this doc is now the canonical home for strategy, positioning, and messaging.
- **Evidence flags:** claims carry `[firsthand]` (building and using Lodekit),
  `[desk]` (public information about the market), or `[hypothesis]` (believed, not
  yet validated — see §3 open questions). No primary user research exists yet; this
  doc says so plainly rather than dressing claims up.

## 1. Product statement

**Category:** the local platform for agent-built apps.

**Tagline:** *Cloud batteries, locally, easily.*

**Elevator:** Everything your apps need from a cloud — a real database, file storage,
secrets, scheduled tasks, an always-on engine — on the one computer you already own.
You describe the app; your agent builds it; Lodekit runs it and keeps it. No accounts,
no subscriptions, nobody else's computer. Your apps and your data are files in a
folder — back it up and it's yours forever.

"Batteries" is a marketing metaphor only; it never enters the domain language
(`DEFINITIONS.md` fixes *service* as the domain word). The tagline's three words
carry the three promises: **cloud batteries** (capability), **locally** (ownership),
**easily** (no tooling).

## 2. The derivation — five foundational questions

The investigation record behind §1. Kept so future sessions inherit the reasoning,
not just the conclusions.

### 2.1 Problem validation — is this a real problem?

Agents made personal software real: anyone can describe an app and have working code
minutes later. Software for an audience of one is economically viable for the first
time `[desk]`. But what the agent produces has no good place to live:

- **Frequency:** every agent-built tool faces the where-does-it-live question
  immediately — hosting, data, persistence, secrets, scheduling `[firsthand]`.
- **Severity:** for the primary audience (§2.2) it blocks adoption; it is not a mere
  inconvenience. Without a home, the tool either moves to a hosted platform (cost,
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

The form factor: one installed menubar app (the manager) supervising one local
engine; apps are URLs in the person's browser; everything precious is files in one
folder (the Lodekit root). Fit for the primary audience:

- No terminal, no builds, no per-app installs — the platform owns the toolchain,
  down to its own pinned Node `[firsthand]`.
- Backup = copy a folder. Ownership is legible even to someone who never opens a
  code editor.
- Apps in the browser meet people where personal tools already live.

Rejected forms: per-app desktop bundles (heavy, no shared services), hosted cloud
(breaks the point), static files (no batteries — no database, tasks, or secrets).

### 2.4 Feature validation — is the feature set right?

- **Essential (adoption-blocking without):** durable storage (db-store, kv-store,
  file-store), the zero-tooling build-and-run loop, the dashboard (see and trust
  what runs), agent drivability (skill + MCP), one-install distribution (manager).
- **Differentiators:** **gateways** — apps reach external providers through a
  managed door and credentials never enter agent-written code. This is the trust
  story: guardrails are what make agent-built software safe to live with
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

**White space:** the intersection *agent-built × locally-owned × batteries-included
× non-dev-operable* is unoccupied; no player above holds more than two of the four.
Self-host platforms prove the local appetite exists at consumer scale; hosted AI
builders prove the build-by-describing behavior exists at consumer scale. Lodekit is
the join.

**Onlyness statement:** Lodekit is the only platform where agent-built apps run on
your own computer with cloud-grade services, operated by a person who never touches
a terminal.

## 3. Strategic frame

- **Context:** agents collapsed the cost of making software; MCP and skills made
  agent-agnostic infrastructure possible; personal hardware sits idle and capable.
- **Gap:** agent-built software has nowhere good to live — it rents a home in
  someone else's cloud or rots homeless on disk.
- **Opportunity:** own the keeping layer of the agent era. Whoever gives personal
  software a durable, owned home becomes the default substrate for it.
- **Goals:** v0.1 — a person completes the loop assisted. 0.x — an unassisted
  stranger completes it. The central product metric is **kept**: an app still in
  weekly use 30 days after scaffold `[hypothesis — instrumentation to be designed]`.
  Secondary: time to first running app; apps per instance over time.
- **Constraints:** small team; macOS-first alpha (ad-hoc signed); agent-agnostic by
  invariant; one canonical language by invariant; claims must stay honest — no cloud
  sync, no sharing, macOS-only are all currently true and must not be papered over.
- **Guiding principles:**
  1. **Ownership is the point** — local is why, not just how.
  2. **The person never touches tooling** — a terminal appearing anywhere is a
     defect in the story.
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
  - Business model: undefined. §9 records candidate directions (encrypted remote
    backup, hosted instances, team and family sharing) for pitch use only; pricing
    language stays banned from artifacts until decided.
  - macOS-only weakens "the computer you already own" — sequence for Windows/Linux
    is open.
  - OSS positioning is settled: AGPL-3.0-only product, Apache-2.0 for
    everything a user's app touches; contributions closed through alpha.
    See `LICENSING.md` and `CONTRIBUTING.md`.
  - Sharing/publishing is deliberately out of the story; revisit once the ownership
    position is established.

## 4. Positioning — the enemy

The story leads with the enemy, in two beats. Both beats are documented trade-offs
(§2.5), not manufactured tension; keep them factual wherever they appear.

1. **Someone else's computer.** The hosted path: your app behind an account, on a
   meter, in a silo. You made it, but it lives at the vendor's pleasure — and so
   does your data.
2. **The graveyard.** The local path: output with no home. It needs tooling you
   don't have, keeps nothing durably, breaks silently, and joins the folder of
   half-working things you stopped opening.

Compression: **agent-built software today either lives on someone else's computer
or dies in a folder.** Lodekit is positioned as the third path, and the tagline is
the resolution compressed: keep the batteries, drop the cloud.

**What Lodekit is not** (guards against drift): not a deployment platform, not a
hosting company, not an app store, not a dev tool that happens to run locally, not
an agent. It is the home — the platform apps live on.

## 5. Brand narrative

Pattern: **situation → complication → resolution** (INTENT storytelling), told
enemy-first: artifacts open on the complication, then earn the situation and land
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
  claims true. Never cite the story as proof, and never smooth real user data into
  a cleaner arc than it had — once real users exist, their mess stays visible.
- **Keep the complication factual.** The two beats survive because they are
  checkable trade-offs. If an artifact needs a bigger enemy than the evidence
  supports, the artifact is wrong.

## 6. Messaging

Five pillars. Every outward claim should trace to one; an artifact that needs a
sixth should question itself first.

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
shadcn, MCP) one level below the headline, never in it. Credibility for developers
comes from real names; warmth for non-devs comes from never leading with them.

**Language rules:** canonical terms end-to-end (`DEFINITIONS.md`) — *app* (never
tool, project, widget), *agent* (never Claude-as-generic, AI, assistant), *service*
in product surfaces ("batteries" only in marketing prose). Marketing may simplify;
it may never rename.

## 7. Voice & tone

The personality, stated as attributes so `DESIGN.md` can translate it visually.
Voice attributes: **plain-spoken** (short words, concrete nouns), **quietly
confident** (states, doesn't hype), **wry, not cynical** (the edge points at
systems, per principle 5), **warm underneath** (the product is about keeping
things — domestic verbs like *live*, *keep*, *home* are on-voice), **honest to a
fault** (limitations stated plainly; "macOS only, for now" over silence).

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

- **Landing page:** hero = resolution-led — tagline-family headline with a
  situation subhead; the complication (§4) moves below the fold as the problems
  section. Arc: problems → fit check → what-is → how-it-goes → comparison →
  manifesto → CTA. Oscillation pairs (§5) close the manifesto; stack names in the
  developer layer only.
- **Docs prose:** voice per §7 (no edge); narrative rules per §5 (calm-shaped,
  never punching).
- **Blog / launch post:** skeleton is §5 verbatim — complication, situation,
  resolution, why-now — with §2 evidence keeping it honest.
- **`DESIGN.md`:** its brief is §7's attributes, §4's positioning, and §2.2's
  audience. Visual identity decisions happen there, not here.
- **Pitches:** investor, grant, and professional-user conversations start from §9;
  pick the angle, keep the honesty notes.
- **Amending:** positioning, pillar, or narrative changes land here first, then
  flow outward — artifacts never fork the strategy locally. Resolve an open
  question in §3 by editing this doc in the same change.

## 9. Audience pitches

Elevator pitches and taglines by audience, derived 2026-11-04 from §1–§7. Each
audience gets two or three angles on the same core: the person owns the apps and the
data, and can leave with them any time. The angles are starting points for a
conversation, not copy to ship; landing and docs prose still follow §8.

Two framings appear here that the rest of the doc does not yet carry:

- **Liquid software** `[desk]` — software made on demand, shaped to one person, and
  expected to move with them between machines and hosts. Lodekit's unit of liquidity
  is the Lodekit root: apps, data, and config in one folder that runs wherever an
  engine runs.
- **Candidate directions** `[hypothesis]` — encrypted remote backup, hosted instances,
  and team or family sharing as paid layers on a free local core; continued
  self-hosting with data sovereignty, local-AI compatibility, and agent-agnosticism as
  the public-interest story. None is built or decided (§3). Pitches may name them as
  a path; artifacts may not.

### 9.1 Accelerator / investor

**Angle A — the keeping layer.** Agents made software nearly free to make. Nobody
owns where it lives. Today a person's agent-built app either rents a home on Lovable
or Replit, or dies in a folder. Lodekit is the third path: a local platform that runs
agent-built apps like real software — a database, storage, secrets, scheduling — on
the computer the person already has. The wedge is free and local. The revenue is
everything people want once they have apps worth keeping: encrypted remote backup,
hosted instances, sharing with a team or family. Whoever owns the keeping layer
becomes the default substrate for personal software.

**Angle B — liquid software.** Software is becoming liquid: made on demand, shaped to
one person, expected to move with them. The hosted AI builders still pin it to their
servers. Lodekit makes the app plus its data a single portable unit, a folder, that
runs on a laptop today, on a home server tomorrow, and on a hosted tier when the
person wants it. We charge for the convenience of where it runs, never for the right
to leave. That is a moat built on trust instead of lock-in, and trust is the scarce
asset in the agent era.

**Angle C — invert the stack.** Every AI app builder has the same shape: your idea,
their server, your data in their silo, a meter on a thing you made. We invert it. The
app lives with the person, the cloud is optional, and the agent is interchangeable.
That inversion is where the next decade of personal software gets built, and the
company that supplies the substrate gets the distribution.

Taglines: *The home for agent-built software.* · *Own the keeping layer.* ·
*Software that moves with you.* · *Personal software needs a place to live.* ·
*Cloud batteries, locally. Then anywhere.*

### 9.2 Open-source grant (NLnet / NGI)

**Angle A — data sovereignty.** AI agents will soon write most of the small, personal
software people use. The open question is who holds it. The current answer is hosted
builders: account, subscription, data on a vendor's server. Lodekit is the open
alternative. One AGPL platform runs a person's agent-built apps on their own hardware,
stores their data as plain files, and works with any agent, including locally run
models. Leaving is a folder copy. The goal is to make sure the agent era does not
rebuild the platform silos the web just spent twenty years escaping.

**Angle B — open standards and interoperability.** Lodekit is agent-agnostic by
design: any agent that speaks MCP can drive it, and the platform never depends on one
vendor's model. Apps are standard web software on a documented contract, data is
SQLite and files on disk, and the whole instance is one directory that migrates
between machines. Funding would go to the parts that matter most for a commons: Linux
support, first-class local-model integration, and documented export and migration
formats so no Lodekit user is ever stuck.

**Angle C — public-interest infrastructure.** Personal computing is about to get a new
layer, the one where agent-made tools live. If that layer is proprietary and hosted,
every citizen's private tools become someone else's product. Lodekit is a small, open,
self-hosted answer: the person's computer is the server, the person's folder is the
database, and any agent is welcome.

Taglines: *Personal software, owned by the person.* · *Your apps, your hardware, any
agent.* · *An open home for agent-built software.* · *Leave any time. It's a folder.*
· *Local by default. Open by license. Yours by design.*

### 9.3 Professionals in law, medicine, finance

Non-technical potential users whose work carries confidential records. They map to
the spreadsheet outgrower and the data-private profiles (§2.2).

**Angle A — confidential by construction.** You know the tool you wish you had. A
matter tracker shaped like your practice. A follow-up list for patients that actually
matches how you work. A client cashflow view your spreadsheet can't quite do. Ask your
AI for it and it builds it. Lodekit runs it on your own computer, not on some
company's server, and everything it stores stays in one folder on your machine.
Nothing leaves your desk.

**Angle B — the spreadsheet successor.** Somewhere you have a spreadsheet doing a job
it was never built for. Lodekit turns that into a small app made exactly for you, in a
few minutes, by describing it. It stays on your computer, it keeps working next year,
and backing it up means copying a folder.

**Angle C — no vendor to outlive.** Most tools you'd use for this are subscriptions.
Stop paying and the tool, and often your records, go away. With Lodekit the app and
its data are files you own. If you ever stop using Lodekit, the files are still there
and still readable.

Taglines: *Software made for you, kept by you.* · *The app you wish existed. On your
computer.* · *Ask for it. Use it. Keep it.* · *No account. No subscription. Nobody
else's computer.* · *Your files. Your computer. Your tool.*

### 9.4 Honesty notes

These audiences probe; say each of these before they ask.

- **Roadmap vs shipped.** Backup, hosting, and team or family sharing are candidate
  directions, not features. Adopting any of them means resolving the §3 open
  questions in the same change.
- **The agent is not local by default.** App data stays on the machine, but the
  person's agent may be a cloud model that sees whatever they paste into the
  conversation. Say "the app's data never leaves your computer", never "nothing you
  type leaves your computer". Local-AI compatibility is what closes that gap.
- **macOS only, for now.**
- **No compliance claims.** "Stays on your computer" is checkable; "HIPAA-compliant"
  or "privileged" is not something Lodekit can promise.
