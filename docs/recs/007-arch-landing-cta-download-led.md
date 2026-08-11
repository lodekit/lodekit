# 007-arch: The landing CTA is download-led; email capture is retired

**Date:** 2026-07-30 · **Status:** Accepted · **Provenance:** landing v3 spec
`docs/specs/2026-07-24-landing-page-v3-design.md`

## Context

Since landing v2, the page's primary CTA was a launch-announcement email form
(`NotifyForm`, mock capture) in the hero and the CTA band — the site's only
conversion mechanism, promising "one email when the alpha ships". The v3 session
(2026-07-30) reconsidered it alongside two new facts: the docs site has a canonical
URL (`https://docs.lodekit.com`, deploying soon) and the GitHub repo
(`lodekit/lodekit`) will be public.

## Decision

The primary CTA in the hero and the CTA band becomes a **permanently disabled
Apple-logo Download button** ("Coming soon!" tooltip on hover/focus, static
coming-soon copy nearby for touch), paired with a live **"Getting started"** ghost
link to the docs. `NotifyForm` and its mock-capture script are deleted; the page
carries **no email capture anywhere**. Docs and GitHub links ship unflagged even
while those destinations are unpublished.

## Rationale

- The only live control in the pair is the secondary — deliberate: the page's real
  action today *is* reading the docs, and a disabled Download states the product's
  imminence in the brand's honest-to-a-fault voice, where an email form implies a
  pipeline that didn't exist (capture was mock-only, never wired).
- A disabled-but-visible Download makes the launch shape concrete (macOS, an app
  you download) in a way "notify me" never did.
- Trade-off accepted knowingly: no launch-notification list — visitors return on
  their own or watch the GitHub repo. Reintroducing capture later is a product
  decision, not a follow-up task.

## Consequences

- The landing has no conversion funnel until launch; launch reach relies on the
  repo, the docs, and outside channels.
- The disabled primary must stay honest: the button enables only when a real
  download exists. The `aria-disabled` (focusable) pattern in the spec §5.11 is
  load-bearing for the tooltip's accessibility.
- Site links render before their destinations are live (may 404 until docs deploy
  / repo goes public) — accepted by the person, 2026-07-30.
- If a launch-email list is ever wanted again, it re-enters through PRODUCT.md and
  a spec, not by resurrecting `NotifyForm`.
