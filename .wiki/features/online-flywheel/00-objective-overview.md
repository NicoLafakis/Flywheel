# Online Flywheel — Objective Overview

**Tier:** 3 · **Date:** 2026-08-06 · **Status:** planning

> The spine of the package. Every other doc inherits this trajectory. Read this
> before [01-prd.md](01-prd.md) or [03-technical-design.md](03-technical-design.md);
> the specs answer *what* and *how*, and only this page answers *why in this
> shape*.

## What was asked

Add player accounts, achievements, live shared-arena multiplayer, and
leaderboards across four scopes (UNBOUND, per city, per level, all-time),
ranked not by a single number but by a set of simultaneously-held championship
belts. Ready for a booth at UNBOUND, in front of HubSpot partners.

## What it really serves

Two things at once, and the design only makes sense if both are held in view.

**One: a single-player toy becomes a networked product.** Today every fact
about a player lives in one browser's `localStorage` under key `hole-city-save`
(schema v13). Clear the cache and the player never existed. Nothing in the
system can answer "who plays this," "how much," "who is best," or even "how
many people played." Adding accounts is not primarily a login feature — it is
the moment Flywheel acquires an **identity graph** and a **durable event
history**. Every subsequent capability anyone will ever want (tournaments,
seasons, partner arenas, matchmaking, retention analysis, a Steam-style profile
page) is a query over that graph. Build the graph badly now and each of those
becomes a migration; build it well and each becomes a view.

**Two: a conference booth becomes a lead engine.** A booth game that nobody
signs into produces a memory. A booth game with a name, an email, a company,
and a belt someone is defending produces a *named person with an expressed
interest and a reason to come back to the booth before the conference ends*.
The belt system is not decoration on top of the leaderboard — it is the
mechanism that converts a 90-second play session into a return visit, because a
belt you hold is a belt someone can take from you while you are at lunch. "Come
back and check if you're still champion" is the strongest booth CTA available,
and it costs nothing to run.

The two purposes reinforce each other, which is why they are one project. The
identity graph is what makes the belt personal; the belt is what makes people
willing to hand over the identity.

## Where the design is standing

Three existing properties of this codebase are doing enormous work here, and
none of them were built for this. They are the reason the project is a few
weeks rather than a few months.

- **The sim/render split** ([ADR-0002](../../adr/0002-sim-render-split.md)).
  The pure sim already runs headless in Node — `tools/validate.mjs` imports it
  and replays levels. A Supabase Edge Function can therefore *recompute a
  player's score from scratch* rather than believing what the browser posted.
  Anti-cheat is not a new subsystem; it is an existing test harness pointed at
  production traffic.
- **Determinism** ([ADR-0003](../../adr/0003-deterministic-seeded-generation.md)).
  Same seed, same city, same everything, on every machine. This is what lets
  ten booth visitors drop into the *identical* Brooklyn at the identical moment
  with no world-state sync at all — the world is a seed, not a payload. It is
  also what makes a replay a few kilobytes of input instead of a video.
- **No build step.** Three.js already loads from a CDN importmap. The Supabase
  JS client loads the same way. The invariant survives untouched, which matters
  more than it sounds: a bundler would have introduced a build, a build
  introduces a broken build, and a broken build at 8 a.m. on the conference
  floor is the single most expensive failure this project can have.

Determinism has quietly changed status. It was a *product* requirement (same
level every time). It is now a *security* requirement, because it is the only
thing standing between the leaderboard and a browser console. Treat any future
proposal to relax it as a security change, not a convenience change.

## 20 moves ahead

### Next wants — what gets asked for within days of this shipping

1. **"Can we see who played?"** A list of captured leads with company names.
   The data will exist; nothing will render it. Someone will ask on day one.
2. **"Can these go into HubSpot as contacts?"** Inevitable, given the audience.
   Deliberately *not* built (see the pens below) — but the schema must not make
   it awkward, so captured identity is stored with the field names a CRM sync
   would want (first name, last name, email, company) rather than a single
   `display_name` blob.
3. **"Can we run a tournament at 3 p.m.?"** A scheduled bracket. Not built. The
   seam is that a match is already a room with a seed and a scored result.
4. **"Can we put our partner's logo in the game?"** The repo already has
   `tools/gen-partner-logo.mjs` and a partner `logoTex` path — the appetite is
   demonstrated. A branded arena is a small step from a branded skin.
5. **"Why did the arena break at 2 p.m.?"** Someone will want an answer after
   the fact. Without deliberate logging there is none.
6. **A phone.** Someone will scan a QR code and play on their own device rather
   than the booth machine, and will expect to keep their belt. That is an
   accounts question, not a mobile-rendering question, and accounts answer it.

### Breaks at scale / edges — what concedes first, in order

1. **Conference wifi.** This is not an edge case, it is the *expected*
   operating condition, and [02-requirements.md](02-requirements.md) treats it
   as a first-class requirement. A shared NAT, hundreds of devices, captive
   portals, and 2 Mbps of real throughput. The game must remain playable with
   the network entirely absent and must degrade in a legible way rather than
   hanging on a spinner.
2. **The host leaves.** In a host-authoritative peer model the authority is a
   laptop someone can close. Host migration is core, not a nicety — at a booth
   the host *will* walk away mid-match, because the host is a stranger who
   finished their turn.
3. **Snapshot volume.** The snapshot rate × N players is the first thing that
   scales badly. It bounds arena size long before Postgres notices anything.
   Cap the room, and make the cap a config value rather than a constant buried
   in netcode.
4. **Replay validation cost.** Every submitted run gets replayed server-side.
   That is CPU per submission, and a queue of them at a booth rush is a real
   thing. Validation must be able to run behind the player's result screen, not
   in front of it — the player sees their score immediately and the board
   confirms it a moment later.
5. **Belt churn.** With enough players, a belt changing hands every few seconds
   stops feeling like a championship and starts feeling like a scoreboard. The
   reign model needs a minimum-defence or tie-break rule from the start, or the
   drama the belts exist to create evaporates exactly when the booth is busiest.
6. **Save merge conflicts.** A guest with 400 coins signs into an account with
   900 coins. The merge rule has to exist before the first sign-in, not after
   the first complaint. `js/save.js` already has the right instincts — schema
   versions, migrations, quarantine rather than deletion — and the cloud
   profile should inherit that posture exactly.

### Unlocks — the adjacent capability this opens

- **A verified score is a currency.** Once the server can prove a run, any
  future competition (tournament, season, sponsored challenge, a
  qualify-for-a-prize gate) is trustworthy by default. This is the highest-value
  thing in the package and it is nearly free, because determinism already paid
  for it.
- **A replay is a spectator feed.** An input trace plus a seed reproduces a run
  exactly. That is the raw material for a booth screen playing back the current
  champion's winning run on a loop, with no video pipeline. Not built now; the
  data is stored anyway because it is the same data anti-cheat needs.
- **A room is a product surface.** A shared arena with a code is, structurally,
  the same object as a private match, a partner-branded arena, a tournament
  round, and a "play against the person next to you" booth mode. One noun,
  several futures.
- **An identity graph is a funnel.** Named people, with companies, who did a
  measurable thing. That is what makes the booth reportable afterwards.

### Doors kept open vs. shut

**Kept open, deliberately:**

- **Scores are events, not a scoreboard.** Runs are stored as immutable rows
  with seed, scope tags, and metrics; every board and every belt is a *query*
  over them. This is the single most important schema decision in the package.
  Add a fifth leaderboard scope later and it is a new query. Store aggregates
  instead and it is a backfill you cannot do, because the underlying runs were
  never kept.
- **Belts are rows, not code.** A belt is a data row describing a metric, a
  scope, a window, and a tie-break rule — not a hardcoded `if`. A new belt is
  then an insert, which means Nico can have a new championship the same
  afternoon he thinks of one. Hardcode the five known belts and the sixth is an
  engineering ticket.
- **Scope is a dimension, not a table.** `unbound` is one value of an event tag,
  not a special-cased table. The next event needs no schema change.
- **Identity fields are CRM-shaped from day one.** First name, last name, email,
  company — separate columns, canonical formats, normalised at write time. This
  costs nothing now and is the whole difference between a future CRM sync being
  a mapping and being a data-cleaning project.
- **The offline path stays first-class.** localStorage v13 remains the source of
  truth for solo play. The cloud is *additive*. This is what makes bad wifi a
  degradation instead of an outage, and it also means the game still works
  exactly as it does today if Supabase is down, which is a nice property for a
  product being demonstrated in public.

**Shut, knowingly:**

- **No dedicated authoritative game server.** Realtime is a message bus. This
  buys enormous simplicity and cost savings, and it costs us: a determined
  cheater who becomes the host can distort a live arena's in-match state. It is
  accepted because arena results are re-validated server-side before they touch
  a board, and because no arena round of any verdict reaches the all-time scope
  or a solo-fed belt ([09](09-threat-model.md) §3.7), so the worst case is a bad
  ninety seconds, not a corrupted championship. If Flywheel ever becomes competitive for something that matters,
  this is the decision to revisit first.
- **No cross-region arenas.** Everyone in a room drops into one host's sim, and
  the host is physically at the booth. Fine for the booth; would need rethinking
  for a global player base.
- **No real-money or prize-bearing competition** without revisiting the threat
  model in [09-threat-model.md](09-threat-model.md). Fun-stakes anti-cheat and
  money-stakes anti-cheat are different projects.

## Scope line (pencil test)

Per the global rule: ship the pencil with its eraser and sharpener, never the
inkwell and parchment.

### Building silently — completers and precursors

These are all *the same purpose* as the ask, the thing is frustrating or broken
without them, and each is cheap, co-located, and removable.

- **Guest-first play.** Accounts without a guest path would put a login wall in
  front of a booth game, which defeats the booth. The sign-in is the sharpener;
  playing immediately is the pencil.
- **Deferred claim.** Play first, attach identity to the run afterward. Without
  it, the lead capture and the game compete for the same 90 seconds.
- **Host migration.** An arena without it is an arena that ends when a stranger
  walks away.
- **Offline / degraded mode with legible state.** Not an edge case — the
  expected condition. Includes a queued-submission path so a run played on dead
  wifi still reaches the board when the network returns.
- **Server-side score validation.** A leaderboard with no validation is a
  leaderboard someone edits in the console within an hour, and at a conference
  the audience is technical.
- **Belts as configurable rows.** Slightly more work than hardcoding, materially
  cheaper than every future belt being a deploy.
- **Run rows retained with seed + input trace.** The anti-cheat needs them
  anyway; keeping them is what leaves the replay and spectator doors open.
- **CRM-shaped identity columns.** Zero extra cost, removes an entire future
  data-cleaning project.
- **A visible reign clock on each belt.** The belt means nothing without the
  "how long have they held it" that makes losing it feel like something.

### Surfacing for Nico's call — pens, not built

Each of these is a **new noun**: a new scope, a new product direction, or a new
external commitment. Clean seams are left toward all of them; none is built.

| Pen | Why it is a pen, and what the seam is |
|---|---|
| **Piping captured leads into the HubSpot CRM as contacts** | A new external system, new credentials, new data-handling obligations, and a promise to a third party about what happens to a person's email. Genuinely valuable and genuinely out of scope for "add accounts." Seam: identity fields are already CRM-shaped, so the future work is a mapping and a sync job, not a schema change. |
| **Tournaments and brackets** | A scheduling and pairing product with its own UI, its own failure modes, and its own on-the-day operations burden. Seam: a match is already a seeded room with a validated result, which is exactly what a bracket node needs. |
| **Seasons** | Time-boxed resets with archived champions. Changes the meaning of "all-time" and needs a story for what happens to an existing belt. Seam: boards are queries over time-tagged events, so a season is a date filter. |
| **Spectator mode** | A second client type with its own rendering path and its own latency story. Seam: replays are stored; a spectator is a client that reads snapshots instead of sending intent. |
| **Partner-branded arenas** | A commercial commitment with per-partner assets and approval loops. Seam: `tools/gen-partner-logo.mjs` and the partner `logoTex` path already exist; a room row could carry a brand tag. |
| **Mobile / bring-your-own-device play via QR** | Touch controls exist, but a live arena on phone hardware over conference wifi is a different performance and netcode problem. Seam: accounts make the identity portable, so the day this is wanted, the progress already follows the player. |
| **A public profile page** | A new surface with its own privacy questions (who can see whose company name?). Seam: the identity graph and run history support it whenever it is wanted. |
| **Matchmaking / skill rating** | Only meaningful with a sustained player base, which does not exist yet. Seam: validated run history is the input any rating system would need. |

### Dropping — the parchment workshop

Not built, not seamed, not worth the words: friends lists and social graphs,
in-game chat (a moderation obligation at a public booth), voice, clans, a
real-money or prize economy, cross-title account federation, and a native app.
Each is a different product. If one of them turns out to be the actual goal,
that is a new package, not an extension of this one.

## Caliber & package

**Tier 3** because this introduces a backend, an authentication surface, live
networking, and personal data into a codebase that has had none of the four —
and it does so against a hard, public, unmovable date. Any one of those alone
would justify a design doc; together they justify the threat model, the runbook,
and the risk register.

Docs in this package: [README.md](README.md) · this overview ·
[01-prd.md](01-prd.md) · [02-requirements.md](02-requirements.md) ·
[03-technical-design.md](03-technical-design.md) ·
[04-netcode-design.md](04-netcode-design.md) ·
[05-identity-and-accounts.md](05-identity-and-accounts.md) ·
[06-belts-and-achievements.md](06-belts-and-achievements.md) ·
[07-test-strategy.md](07-test-strategy.md) ·
[08-rollout-and-runbook.md](08-rollout-and-runbook.md) ·
[09-threat-model.md](09-threat-model.md) ·
[10-observability-and-nfr.md](10-observability-and-nfr.md) ·
[11-risk-register.md](11-risk-register.md) ·
[12-migration-plan.md](12-migration-plan.md) ·
[13-tasks.md](13-tasks.md) · [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md).
Plus ADRs `0009`–`0012` in [`.wiki/adr/`](../../adr/).
