# ADR-0016: The ranked unit is a bounded 90-second run; the city clear is never ranked

- **Status:** accepted
- **Date:** 2026-08-12
- **Deciders:** Nico, Kimi
- **Context package:** [.wiki/features/scoreboards-and-profiles/](../00-objective-overview.md)

## Context

[ADR-0012](../../../adr/0012-replay-validated-leaderboard-trust.md) committed this
project to full server-side re-simulation of every ranked run: submissions
carry inputs, not outcomes, and the only number a board may show is one the
server recomputed itself. That decision was written on 2026-08-06 against the
100-level campaign, whose `sim.js` is 281 lines and whose validator replays a
hundred levels in seconds. The campaign has since been retired. What shipped
instead is seven voxel city sandboxes running `js/voxelsim.js` — 3,275 lines of
structural physics over 23,000 to 73,000 blocks per city — and the cost of
replaying that is not in the same universe.

Measured for the scoreboards package
([04-anti-cheat.md](../04-anti-cheat.md) §2): re-simulating 135 seconds of
Chicago — at 23,151 blocks the **cheapest** real city — costs 6.2 s of scene
build plus 75.8 s of replay, and the per-sim-second cost rises ~65× across that
route, because the awake-debris population grows monotonically while a hole is
eating
([RCA-2026-08-11](../../../findings/RCA-2026-08-11-cambridge-validator-stall.md)
§2). And 135 seconds is not a run. A completed run in the shipped game is
clearing 50% of a city: the direct probe burned 432.5 s of CPU to reach 2.91%
consumed, with the last 20 sim-seconds costing a thousand times the first 20,
and Cambridge consumed 78 CPU-minutes and 2.33 GB before being killed at 41% of
a single excursion, with one to two hours projected per excursion.
Re-simulating a city clear costs more than playing it. There is no serverless
platform, at any price this project would pay, where verifying the clear fits —
and running it asynchronously only moves *when* the CPU is spent, not *how
much*.

A second, independent finding fell out of the same measurements
([04](../04-anti-cheat.md) §3): the graphics quality tier is a sim-trajectory
tier. `debrisCap`, `contactBudget`, `contactRounds` and `supportEvery` differ
between HIGH and LOW, LOW is the default on every touch device, and two honest
players producing identical inputs score ~25% apart depending on which tier
their device picked. ADR-0012 sized its replay tolerance (`1e-9`) for
floating-point drift; this is nine orders of magnitude past that — a different
run, not a rounding gap. A server replaying at one tier would flag every honest
player on the other, which is precisely the failure ADR-0012 itself warned was
more likely than any attack. It is also a fairness bug in the shipped game
today, invisible only because there is no board to expose it.

And what the economics actually meter is monthly CPU, not invocation duration.
Vercel functions run long enough (300 s on Hobby, up to 800 s on Pro, at 2 GB /
1 vCPU); the binding allowance is Active CPU-hours per month — 4 on Hobby,
roughly 436 verifications at the measured ~33 s each. Any design whose
verification cost grows with player skill has an unbounded price by
construction, and an unbounded replay path is a denial-of-wallet vector before
it is anything else.

## Decision

**A score is ranked only if it comes from THE RUN: 90 seconds — exactly 5,400
ticks at the fixed 1/60 timestep — on one city, from a server-issued seed, at
one pinned physics tune. Every ranked score is computed by re-simulating that
bounded run in full on the server. The 50% city clear is never ranked.**

1. **The bound is the design.** Ninety seconds of Chicago costs ~27.3 s of
   replay plus ~6.2 s of scene build — about 33 s of CPU on the (busy)
   measurement box, an upper bound on a quiet machine. That number fits inside
   a serverless function with room, and it stays fixed however good the player
   gets: a world record and a first attempt cost the same to verify. The clock
   is ticks, never wall time — the trace's tick count *is* the run length, and
   there is nothing to stretch. The seed is server-issued inside a signed,
   single-use ticket, so a player cannot shop for a favourable layout and
   cannot submit a run the server never started.

2. **The bound has a stated fallback, not a renegotiation.** If the deployed
   replay p95 exceeds 120 s, or the monthly CPU allowance is projected to run
   out, the ranked mode drops to 60 seconds — ~6 s of replay plus build,
   roughly 2,000 verifications a month on Hobby. A 60-second mode is a new
   value of `runs.mode`, not a new table and not a new decision. And a city
   joins the ranked set only once its 90-second replay has been measured inside
   the budget; the two measurements that gate this are T-901 (the ranked tune
   holds on a real low-end phone) and T-902 (the deployed replay p95) in
   [08-test-strategy.md](../08-test-strategy.md). A city that has not been
   measured stays fully playable and simply is not offered ranked.

3. **One physics tune for everyone.** A ranked run does not use the player's
   graphics tier. It uses `RANKED_TUNE` — `debrisCap: 280`,
   `contactBudget: 200`, `contactRounds: 2`, `supportEvery: 1` — the same for
   every player and for the verifier. `contactRounds` and `supportEvery` apply
   on every step regardless of load, so they are pinned to the HIGH values the
   validator gates and the pre-tier sim used; `debrisCap` and `contactBudget`
   bind only under population, and awake debris peaks around 163 across the
   first 90 seconds of Chicago — comfortably under 280/200 — so pinning LOW's
   caps costs a desktop essentially nothing while giving a phone the bound it
   needs when a collapse spikes. Graphics tier keeps `dpr`, `shadows`,
   `ambient` and `maxSubSteps`, and stops touching the ranked result at all.
   One trajectory, one score, one thing to replay. If T-901 says a phone cannot
   hold this tune, the pre-agreed fallback is `contactRounds: 1` for
   *everyone*, verifier included, re-measured and recorded — what must never
   happen is the tune differing between players.

4. **Everything ADR-0012 demanded is kept.** Submissions carry inputs and a
   ticket, not outcomes; there is no score field on the wire, in any request
   body, or in any client-writable column; the server recomputes the number and
   only that number is stored or displayed; submissions are content-addressed
   and idempotent; a cross-version replay is `unverifiable`, never trusted and
   never an accusation. `runs.claimed_score` exists for exactly one purpose —
   deciding whether spending CPU on verification is worthwhile — and is never
   displayed, compared as truth, or stored as a result. The verifier imports
   the shipping `js/voxelsim.js` by relative path from a Vercel Function,
   exactly as `tools/validate.mjs` does, so there is one physics implementation
   in the repository. (Supabase Edge Functions cap CPU at 2 s per request with
   256 MB of memory; a 33–66 s replay needs 30× that, and on Deno the sim would
   have to be copied or fetched — the second implementation that is exactly the
   bug nobody would ever find. The venue is not a close call.)

5. **Replay is gated behind placement, and the gate is structural.** A run is
   re-simulated only if its claimed score beats the player's own verified best
   on that city or would enter the city's top 200; anything else is recorded
   with `verdict = 'unranked'` and never replayed. The gate is safe because the
   incentive runs the right way: claiming a low score to dodge verification
   gains nothing, and claiming a high one is exactly what triggers it. It is
   the one place a client-supplied number is read at all, and it decides only
   whether to spend CPU — never what is stored.

6. **The city clear is untouched.** It stays exactly as it is — the 50% goal,
   offline, local records on the card shelf — honestly labelled personal rather
   than ranked, because it is the one thing we cannot verify
   ([11-migration-plan.md](../11-migration-plan.md) for what existing players
   see). Ranking it is shut on purpose: re-opening means either accepting an
   unverifiable ranked number, which contradicts the owner's own second
   decision, or funding hours of CPU per submission. Stated once, here, so it
   is not re-litigated every quarter.

## Relationship to ADR-0012

This ADR **narrows ADR-0012** to the scope in which it is achievable. ADR-0012
is **partly superseded**: on acceptance it keeps its accepted status with a
"narrowed by" pointer added, per the package's rollout checklist
([10-rollout-and-runbook.md](../10-rollout-and-runbook.md) §5).

What is superseded is one assumption: that the run players care about can be
replayed within any budget this project can pay. ADR-0012's unit of
verification was the campaign level, which no longer exists; this ADR replaces
the unit, not the rule.

What is **not** weakened is the rule itself. No client-writable score path,
ever; the server computes the number; the rule survives being said out loud —
*every number on this board was recomputed by us*. Submissions-carry-inputs,
content-hash idempotency, version pinning, the arena carve-out
(host-authoritative results stay arena results), and the exclusion of
historical local bests all remain in force exactly as ADR-0012 states them.
Two of its open items are answered differently rather than dropped: the tier
divergence that its `1e-9` tolerance cannot span is answered by the pinned
tune and tick-exact traces, not by a wider epsilon; and the cross-engine
`Math.*` hardening it flagged as unproven is now gated work that must land
before any board has history on it ([04](../04-anti-cheat.md) §3A).

## Consequences

**What becomes easier.** The board gets ADR-0012's one-sentence trust story at
a price that is known in advance and does not move with player skill. The
denial-of-wallet ceiling becomes an arithmetic fact — about 436 verifications a
month on Hobby at 33 s — rather than a hope, and the placement gate plus the
20 replays/hour/player hard ceiling keep spend inside it. The input trace is
retained for verified runs — 180 days, because the trace is also the ghost
replay the overview deliberately keeps the door open for — so ghosts, daily
challenges and seasons become queries against data we already store. The tier
fairness bug gets fixed where it matters most, because every ranked player
runs the same physics. And there is still exactly one physics implementation,
in this repo, imported by player and verifier alike.

**What it costs.** The thing players grind is no longer the thing that is
ranked, and that is a real product risk, not a footnote: the 90-second RUN mode
has to be built and has to be good, because without a bounded unit there is
nothing verifiable to rank — this is not an addition to the ask, it is the ask.
A clear a player is proud of is labelled personal, and the labelling has to
carry that honestly. The ranked set may launch smaller than the city list,
since a city is ranked only once its replay measures inside budget. And the
whole design stands on two measurements that have not been taken yet (T-901,
T-902); both fallbacks are pre-agreed, but the numbers are inference until
someone measures them.

**What we are now committed to.** The tune never differs between players. The
bound drops to 60 seconds by the stated rule, not by taste. No client-writable
score path is ever added, including for convenience — it is the one change that
silently undoes all of this. And the clear stays unranked unless this ADR is
superseded by one that says where the CPU comes from.

## Alternatives Considered

Argued in full in [04-anti-cheat.md](../04-anti-cheat.md) §4; recorded here so
the ladder is visible without leaving the ADR.

- **Full re-simulation of the city clear.** Dead on measurement — see Context.
  Re-simulating a run costs more than playing it.
- **Asynchronous full re-simulation.** Moves *when* the CPU is spent, not *how
  much*. At hours per submission there is no schedule that works.
- **Verify a random segment of a long run.** Dead on a single fact: replaying a
  window from tick N requires the sim state at tick N. Client-supplied state is
  forgeable — a hash chain prevents editing a sequence you did not author, not
  authoring a fake tail — and server-derived state is full re-simulation. With
  N windows and k checks the catch probability is k/N. Recorded so it is not
  re-proposed.
- **Trust the client, or sign and obfuscate its score.** Fails the owner's
  stated requirement outright, and a shared secret in a static bundle is not a
  secret. Worse, it costs the honesty of the model: you end up believing a
  number you cannot recompute.
- **Statistical outlier detection as the primary defence.** Cannot distinguish
  a very good player from a forger, needs a history of honest play that a new
  board does not have, and produces exactly the false accusations a public
  board cannot afford. Retained as a secondary, flag-only layer.
- **Server-authoritative live simulation.** The textbook answer and a
  different product: a persistent game server running 73,000-block physics per
  concurrent player is a different bill, and not this one.
- **Rank the clear anyway, labelled unverified.** Rejected: it contradicts the
  owner's second decision ("hard to fake") and converts the score plate —
  currently honest — into decoration.

## Related

- [ADR-0012](../../../adr/0012-replay-validated-leaderboard-trust.md) — the ADR
  this one narrows; its trust rule is kept whole.
- [ADR-0002](../../../adr/0002-sim-render-split.md) and
  [ADR-0003](../../../adr/0003-deterministic-seeded-generation.md) — the
  sim/render split and the determinism invariant the verifier stands on.
- [ADR-0014](../../../adr/0014-vendored-same-origin-runtime.md) — why the verifier
  is relative imports in this repo and not a second physics copy on Deno.
- [ADR-0015](../../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md) — what
  the verified number *is*: the combo-multiplied `hole.mass`, the game's one
  score.
- [ADR-0017](0017-name-ownership-by-device-token.md) — the companion: a ranked
  score belongs to a name owned by a device-held token.
- [04-anti-cheat.md](../04-anti-cheat.md) — the measurements, the design, and
  the honest list of what this does not stop.
- [03-technical-design.md](../03-technical-design.md) — schema, tickets, API,
  and where the server code lives.
- `tools/validate.mjs` — the headless replay harness the verifier reuses.
