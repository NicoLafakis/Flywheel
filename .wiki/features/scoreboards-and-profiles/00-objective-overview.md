# Scoreboards & Profiles — Objective Overview

**Tier:** 3 · **Date:** 2026-08-12 · **Status:** planning, nothing built

This is the spine. Every other doc in this package inherits its trajectory. Read
it before you read a spec, or you will build the literal ask instead of the thing
it serves.

---

## What was asked

Scoreboards, "globally as well as per level. So like a per level record of which
player has what and an overall." Plus player profiles, "which are now needed."

Two decisions came with the ask and are **not open here**:

1. **Identity: "just pick a name."** No email, no password, no sign-in wall. The
   first time a player earns a place, they are asked for a name and they are on
   the board.
2. **Anti-cheat: "hard to fake."** The server must be able to establish that a
   submitted score was actually achievable from how the run was played — not
   merely a plausibility check.

## What it really serves

A single-player game that nobody talks about. Flywheel today is seven cities, a
score plate, a combo ring, and a `localStorage` blob that only the player who set
it will ever see. Every one of those records is a private fact. The ask is not
"add a table of numbers" — it is **make the score mean something to somebody
else**, which is the thing that converts a toy into a game people come back to.

The second half of the ask is the interesting half. "Hard to fake" is not a
security requirement dressed up as a product one; it is the *same* requirement.
A board nobody believes is worse than no board, because it converts the score
plate — which is currently honest — into decoration. The owner's instinct here
is exactly right and it is what makes this a Tier 3 feature rather than a
weekend's work.

## The finding that reshapes the plan

**[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) committed this
project to full server-side re-simulation of every ranked run. That is not
achievable for the game that actually shipped, and this package is where we say
so.**

ADR-0012 was written 2026-08-06 against the 100-level campaign, whose `sim.js` is
281 lines. The campaign was retired (`STATUS.md`: "the retired campaign is no
longer reachable from the game"). What shipped instead is seven voxel city
sandboxes running `js/voxelsim.js` — 3,275 lines of structural physics over
23,000 to 73,000 blocks — and the cost is not in the same universe.

Measured this session (see [04-anti-cheat.md](04-anti-cheat.md) §2 for the
method, the probe, and the caveats):

| Run | Headless CPU to re-simulate |
|---|---|
| Chicago, 135 s scripted route, 23,151 blocks — **the cheapest real city** | 6.2 s scene build + **75.8 s** replay |
| Cambridge, 780 s route, 72,943 blocks | **78 CPU-minutes and still going** when killed at 41% ([RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md)) |

A completed run in the shipped game is *clearing 50% of a city*, which is
minutes-to-tens-of-minutes of play, on a cost curve that rises roughly 70× across
a single 135-second route. Re-simulating one costs more than playing it. There is
no serverless platform, at any price this project would pay, where that fits.

**And a second, independent killer:** the quality tier is a sim-trajectory tier.
`js/quality.js` sets `debrisCap`, `contactBudget`, `contactRounds` and
`supportEvery` differently on LOW, and LOW is the default on every touch device.
Measured on identical seed and identical inputs:

| | HIGH | LOW |
|---|---|---|
| blocks eaten | 1,173 | 976 |
| score | 7,228.36 | 5,762.93 |
| SIZE reached | 7 | 6 |

That is not a floating-point rounding gap the way ADR-0012's `1e-9` tolerance
anticipated. It is a different run. Two honest players making identical inputs
score 25% apart depending on which phone they hold — which is a **fairness** bug
before it is a verification one, and it exists in the shipped game today with no
board to expose it.

## The answer, in one line

**Rank a bounded run, and re-simulate all of it.**

The board's unit is not the city clear. It is **THE RUN**: 90 seconds, one city,
a seed the server issues, a clock that stops itself. Ninety seconds of Chicago
costs ~33 s of headless CPU to re-simulate — a number that fits inside a
serverless function with room, and one that stays fixed however good the player
gets. Everything ADR-0012 wanted is then true again: no score field on the wire,
the server computes the number, and the rule survives being said out loud.

The city clear is untouched. It stays exactly as it is — offline, local, on the
card shelf — and it is honestly labelled as personal rather than ranked, because
it is the one thing we cannot verify. Nothing is taken away from anybody.

The tier problem is solved by pinning: a ranked run uses one fixed physics tune
for everyone, chosen so the caps barely bind at 90 seconds and a phone can still
afford it. Details and the required measurement in
[04-anti-cheat.md](04-anti-cheat.md) §5.

## 20 moves ahead

**Next wants.** The moment a name is on a board, the next four asks are
predictable and each one is cheap *if* the schema is shaped for it now and
expensive if it is not:

- *"Where's my friend?"* — rivalry between two named players. Needs a stable
  public player id and a board query that can filter to a set of players.
- *"This board is full of people from six months ago."* — seasons. Needs a
  `season_id` on every ranked row from day one, even when there is only one
  season and nobody ever queries it.
- *"Show me how they did it."* — ghost replays. **We are already storing the
  input trace, because verification requires it.** A ghost is a rendering of a
  row we already have. This is the single biggest thing this feature unlocks
  and it costs nothing extra to keep the door open.
- *"Same city every day."* — daily challenges. A daily is a board whose scope
  filter carries a date and whose seed is minted from it. If seeds are
  server-issued (they are, for anti-cheat reasons), a daily is an `insert`.

**Breaks at scale / edges.** Three things concede, in this order. (1) **Replay
CPU** is the metered resource and a submission flood is a denial-of-wallet
attack before it is anything else — which is why replay is gated behind
"could this run actually place" rather than run on every submission. (2)
**Name-space exhaustion**: first-come-first-served single names work at hundreds
of players and get ugly at tens of thousands; the discriminator suffix is the
release valve and it must exist from the start. (3) **Trace storage** grows per
run forever; retention, not cleverness, is the answer.

**Unlocks.** Ghost replays, daily/weekly challenges, seasons, friend boards,
"beat this run" share links, and — the one worth naming — **a reason to open the
game on a Tuesday.** Every one of those is a query or a row against the schema
this package specifies. None of them needs a second system.

**Doors kept open vs shut.**

*Kept open, deliberately, at near-zero cost now:*
- `season_id` on every ranked row, defaulted to season 1. A season is an `insert`.
- Board scope stored as `{kind, filter}` JSON rather than an enum, so a daily,
  a friends board, or an event board is a row and not a migration.
- The input trace is retained for verified runs, so a ghost replay is a feature
  and not an archaeology project.
- The player token is a bearer capability, not an account — which means a
  *transfer code* to a second device is a handoff of something we already have,
  not a login system we have to build.
- The verification function imports `js/voxelsim.js` directly, the same way
  `tools/validate.mjs` does, so there is exactly one physics implementation.

*Shut, and shut on purpose:*
- **Ranking the city clear.** It cannot be verified, so it will never be ranked.
  Re-opening this means either accepting an unverifiable ranked number (which
  contradicts the owner's own second decision) or funding hours of CPU per
  submission. Stated once, here, so it is not re-litigated every quarter.
- **Client-computed scores.** No score field on any write path, ever. This is
  the one change that silently undoes everything and it will be tempting during
  the build.
- **Accounts.** No email, no password, no OAuth. That is the owner's decision and
  this package builds to it. The cost is real and named in
  [05-identity-and-names.md](05-identity-and-names.md): a cleared browser is a
  lost name, and there is no support path that can fix it.

## Scope line (pencil test)

**Building (completers and precursors — the run is broken or dishonest without
them):**

- The 90-second RUN mode itself. Without a bounded unit there is nothing
  verifiable to rank, so this is not an addition to the ask, it is the ask.
- Per-city boards and one overall standing (the literal ask).
- Name claim, device-held token, collision handling, transfer code. The transfer
  code is the eraser on this pencil: a name you can never move to your new phone
  is a name that stops mattering the day you get one.
- Offensive-name blocking and a one-tap hide. A public board with a name field
  and no moderation is not a finished feature, it is an incident waiting for a
  date.
- The offline outbox. The game must stay fully playable with no network, which
  is already an invariant here; a submission that silently vanishes on bad wifi
  breaks the board's credibility as surely as a forged one.
- Local records preserved and shown as personal history.

**Surfacing for the owner's call (pens — new scope, not completers):**

- **Ghost replays.** We will be storing everything a ghost needs. Rendering one
  is a real piece of work and a real product decision. Recommended as the next
  thing after this ships.
- **Daily challenge.** One city, one seed, everybody gets the same 90 seconds,
  board resets at midnight. Cheap on this schema; a genuine new mode.
- **Seasons.** Worth doing when the first board goes stale, not before.
- **Ranking the live arena.** The arena is host-authoritative
  ([ADR-0010](../../adr/0010-host-authoritative-arena.md)) so a peer's score is
  computed on somebody else's machine and cannot be self-verified. Arena results
  stay arena results. Changing that is a separate design.

**Dropping (the parchment workshop):**

- Belts, reigns, championships, the Titantron, and the 58-achievement catalogue
  from [06-belts-and-achievements.md](../online-flywheel/06-belts-and-achievements.md).
  Good design, wrong order. A belt is a board with a claim rule; boards have to
  exist and be trusted first.
- Email OTP, Google, HubSpot sign-in, lead capture, consent ledgers, kiosk mode.
  All of it is downstream of accounts, and accounts were ruled out.
- Event scoping (`events` table, UNBOUND). No event is on the calendar in this
  package's scope; the board scope filter can express one later as a row.

## Relationship to the `online-flywheel` package

[`.wiki/features/online-flywheel/`](../online-flywheel/README.md) is a 9,865-line
planning package covering the same territory, written 2026-08-06 for a conference
booth. It is not superseded wholesale and it is not to be deleted — its threat
model, RLS discipline, and merge semantics are still the best thinking in this
repo and this package cites them rather than restating them.

What this package **changes**, with the reason:

| `online-flywheel` said | This package says | Why |
|---|---|---|
| Full server-side replay of every ranked run (ADR-0012) | Full replay of a **bounded 90 s run**; the city clear is unranked | Measured: replaying a clear costs more CPU than playing it |
| Three-rung identity ladder ending in email/Google/HubSpot accounts (ADR-0011) | One rung: a name and a device-held token. No accounts | Owner decision: "just pick a name" |
| Four scopes (event, city, level, all-time) + 12 belts | Two scopes (city, overall). No belts | Owner ask; belts are downstream of trusted boards |
| Supabase anonymous auth + supabase-js in the browser | No auth SDK. Our own bearer token, checked by our own function | `js/net/client.js` vendors Realtime only; ADR-0014 forbids adding a CDN import |
| Supabase Edge Functions (Deno) | Vercel Functions (Node) | The verifier must `import` `js/voxelsim.js` from this repo, which is a relative import on Vercel and a copy-or-fetch problem on Deno |
| Save schema v13 → v14 | v16 → v17 | The repo moved; v14, v15 and v16 are all taken |
| Campaign levels are the per-level scope | The seven cities are the per-city scope | The campaign is retired |

Two new ADRs record the reversals, in
[`adr-proposed/`](adr-proposed/). They are drafts in this folder and must be moved
to `.wiki/adr/` on acceptance, per the append-only rule in
[`conventions.md`](../../conventions.md).

## Caliber & package

**Tier 3**, because it puts user-typed names on a public server (a PII and
moderation surface), adds a new externally-facing write API, migrates the save
schema, and makes a decision — what a ranked score *is* — that is expensive to
reverse once a board has history on it.

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | This. The spine. |
| [01-prd.md](01-prd.md) | The normative product spec. |
| [02-requirements.md](02-requirements.md) | User stories + Given/When/Then. The contract the tests check. |
| [03-technical-design.md](03-technical-design.md) | Schema, RLS, API, client modules, failure modes. |
| [04-anti-cheat.md](04-anti-cheat.md) | **The centrepiece.** The measurements, the design, and what it honestly does not stop. |
| [05-identity-and-names.md](05-identity-and-names.md) | Name claim, device token, collisions, cleared browser, second device. |
| [06-privacy-and-moderation.md](06-privacy-and-moderation.md) | What is public, offensive names, deletion. |
| [07-threat-model.md](07-threat-model.md) | Who attacks this and what stops them. |
| [08-test-strategy.md](08-test-strategy.md) | What is tested where, incl. the two measurements that gate the build. |
| [09-observability-and-budgets.md](09-observability-and-budgets.md) | Latency, cost and CPU budgets; how we see a problem without buying a SaaS. |
| [10-rollout-and-runbook.md](10-rollout-and-runbook.md) | Phases, flags, kill switch, rollback. |
| [11-migration-plan.md](11-migration-plan.md) | Save v16 → v17, and what happens to existing local records. |
| [12-risk-register.md](12-risk-register.md) | Ranked risks. |
| [13-tasks.md](13-tasks.md) | Ordered, independently verifiable build tasks. |
| [adr-proposed/](adr-proposed/) | Two draft ADRs, to be moved to `.wiki/adr/` on acceptance. |
