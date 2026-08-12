# ADR-0012: Server-side replay validation as the sole basis for leaderboard trust

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Nico, Claude

> **Narrowed 2026-08-12 by [ADR-0016](0016-bounded-ranked-run.md).** The
> non-negotiable trust rule remains: a public number is server-recomputed from
> inputs. Its practical unit is now a bounded 90-second voxel RUN rather than
> the retired campaign level; see ADR-0016 for the fixed tune, ticket and
> replay-boundary decision.

## Context

Flywheel is getting a public leaderboard, and it is getting one in a specific
place: a booth at UNBOUND, in front of HubSpot partners, on a screen. That
setting changes what a wrong number costs. In a single-player game a cheated
score is a private matter between a player and their own save file. On a
projector at a partner conference, a fake #1 — a nonsense name with an
impossible score, or a real name with a score nobody believes — is not a game
bug. It is a credibility problem in front of exactly the audience the game was
built to impress, and it is unfixable in the moment except by wiping the board,
which is its own kind of visible.

The client cannot be part of the answer. It is a static site: no build step, no
minification, no obfuscation, every module readable in devtools, and it ships
the Supabase anon key because it has to. Anything the client asserts, an
attendee with the network tab open can assert too. The realistic adversary here
is not a determined attacker — it is a bored partner waiting for their turn who
opens devtools to see what happens. That person will find a score field if one
exists, within a minute, and probably show their friend.

What makes a real defence affordable is that the hard part was already built,
years of decisions ago and for entirely different reasons:

- **[ADR-0002](0002-sim-render-split.md)** put a hard boundary between the pure
  sim and the renderer. `rng.js`, `tiers.js`, `citygen.js`, `levels.js` and
  `sim.js` import no three.js and touch no DOM.
- **[ADR-0003](0003-deterministic-seeded-generation.md)** banned `Math.random()`
  in `js/`, routed all randomness through a seeded `mulberry32`, and fixed the
  timestep at `1/60`. Same seed, same inputs, same result — a product
  requirement then, an anti-cheat foundation now.
- **`tools/validate.mjs`** already imports that sim into Node and replays all
  100 levels headlessly with a greedy bot, and has done since the campaign
  existed. Server-side replay is not a new capability we have to invent. It is
  the test suite with a different caller.

So the decision is not "can we validate scores server-side" — we demonstrably
can, today, in the repo. It is whether replay validation is a *contributing
signal* alongside a client-reported score, or the *only* thing that produces a
number. Half-measures here are worse than either extreme: a board that mostly
recomputes scores but accepts the client's word in some paths has a rule with an
exception, and the exception is what gets found.

## Decision

**A score reaches a leaderboard only by being recomputed server-side from a
replay. The client's own idea of its score is never stored, never compared, and
never displayed as a ranked number.**

Concretely:

1. **Submissions carry inputs, not outcomes.** A submission is
   `{ mode, level_or_scene, seed, trace, client_version }`, where `trace` is the
   per-tick move-intent stream the player actually produced. There is no score
   field on the wire, in the request body, or in any client-writable column. RLS
   grants the `anon` and `authenticated` roles no INSERT and no UPDATE on any
   ranked table; the validating Edge Function writes them under service role.

2. **A Supabase Edge Function replays the pure sim.** It loads the server's own
   copy of `sim.js` and its dependencies at the pinned version, constructs the
   level or scene from the submitted seed, steps `sim.step(1/60, intent)` once
   per recorded tick, and reads the resulting mass, combo, and outcome. That
   number is the score. Nothing else is.

3. **Client scores are discarded, not reconciled.** We do not send a claimed
   score and flag mismatches. There is no claimed score. This is the part that
   makes the rule stateable in one sentence — *every number on this board was
   recomputed by us* — and a rule that survives being said out loud is the only
   kind worth having on a scoreboard someone is standing in front of.

4. **Submissions are content-addressed and idempotent.** The unique key is a
   hash of `(seed, trace, mode)`. A resubmission returns the original result
   rather than creating a second row, which kills trace replay as an attack and,
   with the same mechanism, makes the offline retry queue safe on conference
   wifi.

5. **Version pinning is part of the contract.** Every submission names its
   client version; the server keeps an explicit allow-list of versions it can
   validate and replays each trace against the matching sim. An unrecognised
   version is rejected, not trusted. Determinism only means anything between two
   copies of the *same* sim, so tuning changes make old traces unreplayable and
   we say so rather than quietly accepting them.

6. **The carve-out for live arenas — arena results do not feed the ranked
   boards.** The shared arena is host-authoritative: one player's client
   simulates the room and broadcasts snapshots, so a *peer's* score is computed
   on somebody else's machine. A peer cannot submit a self-sufficient trace,
   because their outcome depends on every other player's inputs. Rather than
   pretend replay covers this, the two are separated:
   - A round produces a **match result** — a per-room scoreboard, displayed and
     stored as history. It is the moment the product asked for, and the moment
     is the point.
   - **The all-time and per-level scopes, and every solo-fed belt, are fed only
     by replay-validated single-player runs.** An arena round never sets an
     all-time record. The two arena-only belts —
     [06-belts-and-achievements.md](../features/online-flywheel/06-belts-and-achievements.md)
     §2.6 The Main Event Belt and §2.7 The Tag Team Titles — exist precisely to
     rank arena play and nothing else, and they are fed by arena rounds; they
     are the carve-out, they are named here so the rule stays stateable, and
     nothing else may join them without superseding this ADR.
   - **A round's session verdict decides the rest.** Whole-room replay plus
     complete peer attestation and no host migration ⇒ `verified`, which may
     feed the event (UNBOUND) and per-city scopes and the two arena belts. A
     peer that never attested ⇒ `attested`, which may feed event and city and
     **never** a belt. A digest that disagrees ⇒ the round is voided and
     nothing is written. Verdict semantics and the per-board `min_verdict`
     column live in
     [03-technical-design.md](../features/online-flywheel/03-technical-design.md)
     §2; the netcode side is
     [04-netcode-design.md](../features/online-flywheel/04-netcode-design.md)
     §10.2.
   - The host submits the whole round — room seed and the per-tick intent stream
     of *every* participant as it applied them — and the Edge Function replays
     the entire room, recomputing all scores. Peers corroborate by submitting
     their own intent streams, which they authored. A mismatch **voids the
     round**; we do not adjudicate who lied. At a booth a voided round costs
     ninety seconds, and a wrong belt costs credibility.
   - A round whose host changed mid-play is not a record.

   This also bounds a fairness problem that has nothing to do with cheating: the
   host has zero latency to its own authoritative sim while peers eat a round
   trip. That advantage is inherent to host-authoritative peer networking
   ([ADR-0010](0010-host-authoritative-arena.md)), and it is an independent
   reason arena outcomes must never reach the all-time scope. It is tolerable on
   the event and city scopes, which are about the room and the day, and on the
   two arena belts, which are explicitly about arena play — where the advantage
   is a known property of the format rather than a distortion of a solo record.

7. **Historical local bests are excluded.** Existing players' `bestMass` and
   `bestSize` predate trace recording and cannot be replayed. They are imported
   as personal history and seed progress achievements; they never touch a ranked
   scope. Reasoning in
   [12-migration-plan.md §6](../features/online-flywheel/12-migration-plan.md#6-retroactive-seeding-of-leaderboards-and-achievements).

## Consequences

**What becomes easier.** The four leaderboard scopes get one trust story instead
of four. Belts are defensible: every reign traces to a run we can re-run. The
determinism invariant, which used to be justified by "replays and the greedy-bot
proof", acquires a second and much harder constituency — breaking it now breaks
the scoreboard, and that will keep it honest long after everyone has forgotten
the original argument. And the validator machinery is shared: the same replay
harness answers "is level 73 beatable" and "did this player really score that".

**Trace storage costs real money.** A trace is one small intent record per tick
at 60 Hz — a 90-second level is ~5,400 ticks. Quantised and delta-encoded this is
kilobytes per run, not megabytes, but it is per run, and a busy conference day is
thousands of runs. Mitigation is retention, not cleverness: traces expire at 90
days, after which the validated result and the hash remain and the run can no
longer be re-validated. That is an accepted trade against unbounded growth on a
single small Supabase plan (Free $0 / Pro $25 per month; see
[ADR-0009](0009-supabase-backend.md)).

**Replay costs CPU on someone else's clock.** Every submission is a full headless
sim run inside an Edge Function. The validator already does 100 of these in
seconds, so a single level is cheap — but it is cheap *per invocation*, and
invocations are the metered resource. A submission flood is therefore a denial-
of-wallet vector before it is anything else, and rate limiting is not optional
polish. Whole-room arena replay multiplies this by the participant count.

**Submissions are no longer instant.** The score appears after a network round
trip and a replay rather than the moment the clock stops. The results screen has
to be designed for it: show the local number immediately as *your run*, resolve
it to *verified* a beat later, and never block the player behind a spinner. On
venue wifi the round trip may be seconds or may never complete, so the queue is
offline-first and a failed submission is invisible.

**A crafted-but-valid trace is indistinguishable from real play, and we are not
going to fix that.** Replay proves a trace produces a score under our rules. It
cannot prove a human produced the trace. We ship, in this repository, a greedy
bot that beats every level with time to spare — the tool that proves the game is
fair is also the tool that would beat it. The residual defences are heuristic
and honest about being heuristic: tick-count exactness, direction-reversal rate,
input entropy, and wall-clock plausibility, all of which **flag** a run into a
review state rather than rejecting it, plus a human takedown path that hides a
row in seconds. The stakes are a novelty belt at a conference; the correct
posture is to make casual cheating impossible, scripted cheating visible and
removable within a minute, and to spend no further engineering on the arms race.

**Two smaller commitments follow, and both are load-bearing.** First, no
client-writable score column may ever be added for convenience — it is the one
change that silently undoes all of this, and it will be tempting during the
build. Second, cross-engine determinism must be proven or removed before the
event: the pure sim calls `Math.hypot`, `Math.cos` and `Math.sin`, whose
precision ECMAScript leaves implementation-defined, and this sim has threshold
branches (`isEdible`, `inMouth`, the speed gates) where a last-bit difference can
cascade. Determinism has only ever been tested V8-to-V8. A run recorded in Safari
and replayed in Node must produce the same score, or the defence starts rejecting
honest players on iPhones — which at a booth is the more likely failure than any
attack. See
[09-threat-model.md §3.4](../features/online-flywheel/09-threat-model.md#34-modified-client-sim).

## Alternatives Considered

- **Trust the client, moderate after the fact.** Cheapest to build and it is
  what most jam-scale leaderboards do. Rejected: the audience is the point of the
  product, the screen is public and unattended, and the attack is a one-line
  `fetch` that the most likely adversary will find in a minute.
- **Obfuscate or sign the client-reported score.** A shared secret in a static
  bundle is not a secret; signing only moves the forgery one step later. It also
  costs the honesty of the model — you end up believing a number you cannot
  recompute.
- **Server-authoritative live simulation for everything.** The strongest option
  and the one that would also fix the host-advantage problem. Rejected on cost
  and scope: it means a persistent game server, which is a different product,
  a different bill, and not deliverable before UNBOUND. Host-authoritative peers
  plus replay-validated solo runs gets the shared-arena *feeling* and a trustable
  board out of the budget we have.
- **Statistical anomaly detection instead of replay.** Flag improbable scores,
  ban outliers. Rejected as a primary defence: it cannot distinguish a very good
  player from a forger, it produces exactly the false accusations you cannot
  afford in front of partners, and it needs a history of honest play to
  calibrate against — which on day one of a new board does not exist. Retained
  as the secondary layer over the crafted-trace gap, where it is doing a job
  nothing else can do.
- **Admit historical local bests, flagged.** Rejected; see the migration plan.
  Editing a plaintext localStorage number would have been the easiest attack in
  the entire threat model, aimed at the most visible asset.

## Related

- [ADR-0002 sim/render split](0002-sim-render-split.md) — why a browser and a
  server can agree on a score at all.
- [ADR-0003 deterministic seeded generation](0003-deterministic-seeded-generation.md)
  — the invariant this rests on entirely.
- [09-threat-model.md](../features/online-flywheel/09-threat-model.md) — the full
  cheating taxonomy and where this defence leaks.
- [12-migration-plan.md](../features/online-flywheel/12-migration-plan.md) — the
  retroactive-seeding decision and the save-schema work that precedes it.
- `tools/validate.mjs` — the existing headless replay harness this reuses.
