# Party Mode — Objective Overview

**Tier:** 2 · **Status:** planning · **Blocked on:** [online-flywheel](../online-flywheel/)
(unbuilt; itself blocked on backend credentials)

> The spine of the package. [01-prd.md](01-prd.md) says *what the system must
> do*, [02-requirements.md](02-requirements.md) says *how we will know it does
> it*, and [03-legal-scaffolding.md](03-legal-scaffolding.md) says what has to
> exist on paper before any of it can be shown to a stranger. Only this page
> says *why in this shape*. Read it first, or the literal ask gets built
> instead of the thing the ask is reaching for.

> **Not legal advice.** Everything this package says about law, liability,
> age gating, or jurisdiction is engineering-side advisory drafting by a
> non-lawyer. No text in this package may ship to a real user until a
> qualified attorney has reviewed it. See
> [03-legal-scaffolding.md](03-legal-scaffolding.md).

## What was asked

In the owner's words (2026-08-10):

> a "drinking game" party mode for the voxel sandbox, MULTIPLAYER ONLY. Random
> "drink tokens" appear and disappear every so often; if a player's hole hits
> one, their screen freezes and a bubbly title-style "BOTTOMS UP!" animation
> plays. Frequency must be tunable and infrequent. Plus an age gate where
> players affirm 21+, and the game currently has no EULA or legal copy at all.

Four things, then: **a host-authoritative collectible that appears and vanishes
on a slow, tunable cadence**; **a freeze-plus-celebration beat when someone
takes one**; **an age affirmation in front of it**; and **the game's entire
missing legal layer**, which party mode is merely the forcing function for.

## What it really serves

The literal ask is a token that freezes you. What it is reaching for is a
**shared social beat in a room of people who are in the same physical space**.

That reading changes several decisions:

- The event is not a *penalty*, it is a *callout*. Everybody in the arena needs
  to see who got called, or the beat only exists on one screen and the room
  around the game learns nothing. The frozen player's own freeze is the least
  important half of the feature; the broadcast to the other seven is the
  feature.
- The freeze exists to make the moment **unignorable to the person it happened
  to** — they cannot keep playing through it, so they look up. That is the
  entire mechanical job of the freeze, and it sets its length: long enough to
  break flow, short enough that a player at a booth does not feel benched.
- A social beat that costs you the match is a bad social beat. Party mode
  therefore should not feed the ranked ladder at all (§Scope line, and
  FR-030 in the PRD). This is not a concession — it *solves* three separate
  problems at once (fairness, replay validation, and grief incentive) with one
  decision.

Flywheel has an announcement channel and a celebration vocabulary already, both
shipped 2026-08-10 in [score-combo-and-hype](../score-combo-and-hype/). "BOTTOMS
UP!" is a fourth voice in that choir, not a new instrument: it goes through the
one queue (FR-019 there), at a priority above every existing source, and it is
built with `buildBlockWord()` from `js/ui/blockword.js` — the same builder the
landing screen and the READY gate use, per
[ADR-0005](../../adr/0005-shared-brand-layer.md). If this package ends up with
its own local outline-ring/extrude stack, it has already gone wrong.

## The hard constraint the ask walks into

The obvious implementation is the coin system: `js/voxelsim.js` places pickups
deterministically from the seed, so every client agrees on where they are with
zero network traffic. That is exactly the wrong pattern here, and the reason is
worth stating precisely because it will be tempting on the day.

A deterministic pickup works when **consumption is uncontested or private**. A
drink token is neither: two holes can reach one within the same 83 ms snapshot
interval, and the answer to "who got it" must be the same on all eight screens
because the room is watching. Determinism gives every client the same *set of
candidate positions*; it cannot give them the same *winner*, because the
winner is decided by positions that are only authoritative on the host
([04-netcode-design](../online-flywheel/04-netcode-design.md) §1, invariant:
peers hold ghosts, never truth).

The resolution — reasoned against that doc, and specified in the PRD §5:

1. **Candidate placement stays deterministic and seeded.** The token schedule
   is derived from the session seed via `rng.js`, so no position data ever goes
   on the wire, the sim stays `Math.random()`-free per convention hard rule 1,
   and `tools/validate.mjs` keeps passing unchanged.
2. **Existence and claim are host-authoritative.** The host decides which
   scheduled token is live, when it expires, and who claimed it. Peers render
   whatever the host says is live and **never** self-claim, even when their own
   local hole is visibly overlapping the token. A peer that trusts its own
   overlap is the same class of bug as a peer writing into `sim.rivals`.
3. **It costs almost nothing on the wire.** A token event is a slot, a token
   id and a flag — it rides the existing snapshot event array (4 bytes per
   event, currently `u8 slot / u8 flags / u16 object_id`) by taking one of the
   free `flags` bits, plus one bit in the snapshot header's `flags` field for
   "a token is live". At the shipped cadence (§Frequency) that is single-digit
   bytes per minute. No new message type, no new clock, no budget conversation.
4. **Freeze is a host-applied state, not a client-side effect.** The frozen
   player's intent messages are ignored by the host for the freeze duration.
   The peer also freezes locally so the screen matches, but the host would have
   frozen them anyway — so a hacked client that keeps sending intent gains
   nothing.

## Frequency: what "infrequent" has to mean

The owner's word is "infrequent" and the number is playtest-tuned later. What
planning owes the playtest is a **shape** and a defensible starting point, not
a final constant.

A 3-minute arena match (the booth default) with 8 players. If a token appears
every ~45 s and is claimable by one player, a full match produces ~4 callouts
spread across 8 people — most players see the beat happen and never take one.
That is the correct feel for a room: the event stays an event. Halve the
interval and it becomes a metronome; double it and half the matches contain
zero, which makes the mode indistinguishable from the normal arena.

**Starting point for the playtest:** one token window every 40–60 s (jittered
from the seed, never a fixed metronome), a 12 s life before it despawns
unclaimed, and a hard cap of 1 live token at a time. Every one of those is a
named constant in one file (PRD §5.2), and the cap is the interesting one — it
is what keeps two simultaneous callouts from stepping on each other in the
announcement queue.

## Twenty moves ahead

Where this goes if it works, and what today's shape must not foreclose:

1. **A second token type.** "Everyone but you drinks" is the obvious sibling
   and it is the same machinery with a different resolution rule. The token
   schedule must therefore carry a **kind** field from day one, even with
   exactly one kind defined. A schedule of bare positions is the dead end here.
2. **Rule packs.** A group wants their own rules ("waterfall", "categories").
   The moment token kinds are data, a pack is a table of kinds with copy — so
   the copy must live in a data table an editor can touch, not in template
   literals (this is FR-018's rule from score-combo, inherited).
3. **Non-alcoholic framing as a first-class mode, not a toggle.** See the owner
   decision on the soft-drink variant. If the copy table is keyed by vocabulary
   ("party" vs "soda"), swapping the entire voice is a one-line change; if
   "BOTTOMS UP!" is a string constant in the freeze handler, it is a rewrite.
4. **Spectators.** The arena already queues overflow players as spectators
   ([04](../online-flywheel/04-netcode-design.md) §11). They are the room. The
   callout must render on a spectator's screen with the same weight, which
   means it must be driven by the snapshot, not by local claim logic — which
   the host-authoritative shape gives us for free.
5. **The age gate becomes the game's front door.** Once a 21+ affirmation
   exists and is durable, it is the natural home for the EULA acceptance the
   game has never had. Design the gate as a **general legal-acceptance
   surface** with a party-mode-specific clause, not as a bespoke party screen.
   This is the single highest-leverage forward move in the package.
6. **Regional availability.** Drinking ages differ (18/19/20/21) and some
   jurisdictions prohibit alcohol entirely. A hardcoded "21" is a wrong number
   in most of the world. The threshold must be a constant with a region hook
   beside it even if the hook returns 21 forever on day one.
7. **Recording and clips.** A booth screen that clips the callout is an
   obvious marketing artefact, and it is also the fastest way to publish
   something that looks like alcohol advertising. Flagged, not built.
8. **Achievements.** Belts and achievements
   ([06](../online-flywheel/06-belts-and-achievements.md)) will want to count
   tokens. Rewarding a player for taking more drink tokens is a design we
   should decline on purpose rather than arrive at by accident; the token
   counter should exist, and nothing should read it yet.

## The scope line (pencil test)

**Build silently** — these complete the thing asked for and the feature is
frustrating or unshippable without them:

- The token kind field and the data-table copy (moves 1–3 above cost nothing
  now and are a rewrite later).
- The tunable constants block, one place, commented with what each does to the
  feel.
- The reduced-motion variant of the bubbly animation, and the freeze's
  accessibility handling. A screen that seizes control with a flashing overlay
  and no reduced-motion path is not a shippable state.
- The decline / opt-out path. A person in the room who is not drinking must be
  able to play without being called out, and must be able to choose that
  *without announcing it to seven other people*.
- The region hook beside the age constant.
- Exclusion from ranked scoring, belts and the leaderboard.

**Surface, do not build** — new nouns, new scope:

- Rule packs and custom rules editor.
- A dedicated soft-drink mode identity (as opposed to the toggle, which is an
  owner decision below).
- Clip capture, streaming integration, achievements that count tokens.
- Any form of verified age checking (document upload, third-party KYC). Costs
  money, changes the privacy posture entirely, and is a product decision.

## Decisions that are the owner's

> **RESOLVED 2026-08-10 (Nico, in session).** All six are decided; the
> paragraphs below are kept for the reasoning record. The rulings:
>
> 1. **Token identity:** NOT the abstract disc — **3-4 iconic drink-type
>    icons, rendered as circles**. Sized 10% smaller than a SIZE-1 player;
>    they grow slightly with the average player size on the map but are
>    **never larger than the smallest player in the match**. Artwork has
>    free rein (fireworks etc.); the game is not monetized, fun value first.
> 2. **Freeze duration: ~5 s** — a real penalty-box beat (owner chose longer
>    over the 2.5 s recommendation). Still a tunable constant; playtest may
>    shorten it.
> 3. **Frozen player is inert and untouchable** (per recommendation).
> 4. **Soft-drink variant: yes, per-player** (per recommendation).
> 5. **Regional availability: no geo-restriction.** A plain, flat 21+
>    affirmation — no "whichever is higher" formulation. Match the standard
>    age-gate convention used by shipped games/alcohol-adjacent sites
>    (research references before drafting the gate copy).
> 6. **Booth:** no special concern from the owner; the build-it-flag-it-off
>    posture stands as the default.

**1. Token visual identity.** What is the thing floating in the street?

*Recommendation: an abstract effervescent token — a gold-rimmed voxel disc with
a rising bubble column and the sprocket mark on its face, no vessel, no liquid,
no brand.* It stays inside the existing gold/orange brand palette, it reads at
a distance on a busy city (which a glass would not), and — the load-bearing
reason — it depicts nothing that could be read as a real product or as alcohol
advertising in a jurisdiction that regulates that. A cartoon beer mug is the
obvious answer and it is the one that creates legal surface area.

**2. Freeze duration.** How long is a player benched?

*Recommendation: 2.5 s of hard freeze, then a 1 s ease back to control.* Long
enough that the player looks up from the screen (the mechanical job of the
freeze), short enough that at 8 players in a 3-minute match nobody feels the
match was taken from them. Under ~1.5 s the beat does not land; past ~4 s the
frozen player starts watching other people play, which is the failure state.

**3. Can a frozen player be eaten or griefed?**

*Recommendation: no — a frozen hole is inert and untouchable. It stops, it does
not eat, it cannot be consumed, and it does not block anyone.* The alternative
turns the token into a weapon: players would herd rivals into tokens, and the
social beat becomes a combat mechanic. Note that Flywheel's holes cannot eat
each other today at all (`docs/PRD.md` §4), so "eaten" would be a *new*
capability introduced by a party feature, which is exactly backwards.

**4. A soft-drink variant toggle.** Do non-drinkers get a reskinned vocabulary?

*Recommendation: yes, and per-player rather than per-room.* A room-level toggle
forces a group to negotiate out loud before the match, which is the awkward
conversation the toggle exists to prevent. Per-player means the same token
event renders as "BOTTOMS UP!" on one screen and something else on another —
which is fine, because the token, the freeze and the timing are identical; only
the copy differs. The cost is that the copy table needs a vocabulary key, which
this package recommends building anyway (move 3).

**5. Regional availability.** Is party mode offered everywhere, hidden in some
regions, or gated on a region-aware age threshold?

*No recommendation — this is a legal and business call, not an engineering
one.* What engineering can say: the cheapest defensible posture is a single
worldwide 21+ affirmation (the strictest common threshold), because it is
never *under* a local minimum. The expensive posture is per-region thresholds,
which needs a location signal we do not collect and do not want to.

**6. Does party mode exist at the booth?** UNBOUND is a professional
conference. A drinking-game mode on a partner-facing booth screen is a brand
decision that has nothing to do with whether the code works.

*Recommendation: build it, flag it off for the event, and decide separately.*
The rollout flag costs one line ([08](../online-flywheel/08-rollout-and-runbook.md)
already has the flag machinery).

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — the token
  is sim state, the bubbly title is dressing. The freeze belongs to the sim;
  the animation must never be able to change how long it lasts.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — the token *schedule* is seeded. Convention hard rule 1 is not negotiable
  for a party feature.
- [ADR-0005 shared brand layer](../../adr/0005-shared-brand-layer.md) —
  "BOTTOMS UP!" is `buildBlockWord()`, not a new title treatment.
- [ADR-0010 host-authoritative arena](../../adr/0010-host-authoritative-arena.md)
  — the reason claim resolution is not a client concern.
- [ADR-0012 replay-validated leaderboard trust](../../adr/0012-replay-validated-leaderboard-trust.md)
  — and the reason party sessions stay off the ranked board rather than
  teaching the validator about freezes.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no dependency, and no third-party age-verification script.
