# ADR-0010: Host-authoritative arena over Supabase Realtime

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Nico, Claude Opus 5

## Context

The locked product shape is "same city, live, together": everyone who joins
drops into the same city at the same moment, sees each other's holes moving in
real time, and races to eat the most before the clock runs out. Alongside it
are leaderboards in four scopes and several simultaneously-held championship
belts, each with a holder and a reign that can be taken.

Two problems, and they are usually solved by the same expensive thing.

**Authority.** Somebody has to decide who ate what. Two clients that each
decide for themselves will disagree within seconds, and the disagreement is
visible: a prop vanishes on one screen and not another. **This ADR decides
authority, and only authority.**

**Trust.** A leaderboard at a conference is the most attacked surface this
project will ever have. That is a separate decision with a separate rationale
and it is made in full by
[ADR-0012](0012-replay-validated-leaderboard-trust.md) — server-side replay
validation as the sole basis for leaderboard trust. It is named here only
because the same property of this codebase pays for both, and because the
arena's authority model is what makes an arena round a hard case for 0012.
Nothing about scoring, verdicts, or board eligibility is decided in this
document; where the two could drift, 0012 wins.

The usual answer to authority is a dedicated authoritative game server. That is
a process to run, monitor, scale and pay for, against a low-tens-of-dollars
monthly budget (Supabase Pro is $25/month; see
[ADR-0009](0009-supabase-backend.md)), a team of one, and a conference date —
and it would end the static-hosting story that ADR-0009 went out of its way to
preserve.

What this codebase has instead is a property most games do not:
[ADR-0003](0003-deterministic-seeded-generation.md) guarantees that the same
seed produces the same city and the same rival behaviour on every machine, and
[ADR-0002](0002-sim-render-split.md) guarantees the rules run headlessly with
no three.js and no DOM. `tools/validate.mjs` already imports those files from
Node and proves things about them. A run is therefore fully described by a seed
plus its per-tick inputs, and that description is a few kilobytes.

## Decision

**Authority: host-authoritative peers over Supabase Realtime broadcast.** The
first client in a room is the authority. It runs the one true `Sim`, applies
every player's steering, and broadcasts absolute snapshots at 12 Hz. Peers send
6-byte steering intent at 10 Hz, interpolate remote holes 100 ms in the past,
and predict only their own movement — never their own eating. Host migration is
arbitrated by a single conditional `UPDATE` on `arena_rooms.host_session_id`,
so the database is the tie-breaker and two hosts are impossible by
construction.

**Trust: deferred to [ADR-0012](0012-replay-validated-leaderboard-trust.md).**
This ADR deliberately does not decide how a score becomes trustworthy. It
records only the two obligations the authority model places on whatever that
decision turns out to be, because they are properties of *this* design and
would otherwise be invisible from 0012:

1. **An arena round is not self-describing from any single peer.** A peer's
   outcome depends on every other player's inputs and on the interleaving the
   host chose, so the round must be validated as a whole from the host's
   multi-slot record, with peers corroborating their own contribution. 0012 §6
   is where that is specified and where board eligibility is decided.
2. **A host migration is a discontinuity in the authoritative stream.** The
   arena makes migration routine (§7 of the netcode design) precisely so a
   match survives it; the cost is that the round's provenance changes hands
   mid-play, and 0012 is what decides what that costs a record.

Determinism is what makes both cheap. The anti-cheat system is not built here;
it is `tools/validate.mjs` pointed at a different question, and it exists only
because ADR-0002 and ADR-0003 were paid for long before there was anything to
cheat at. Full specification of the arena in
`.wiki/features/online-flywheel/04-netcode-design.md` and
`.wiki/features/online-flywheel/03-technical-design.md`.

## Consequences

The pure-sim boundary gains a new way to be broken: a net-layer file that
writes sim state outside `sim.step()` silently destroys both the shared-seed
agreement between clients and the replay validity ADR-0012 depends on.
`AGENTS.md` gains invariants 7–10 to say so.

The host's device becomes load-bearing for the duration of a match. Migration
makes that recoverable in about 1.8 seconds, at the price of a round whose
authority changed hands — what that costs the round as a *record* is 0012's
call, not this one. We accept the trade explicitly: a booth match that survives
a closed laptop is worth more than one that could have set a record.

We are also accepting a real, bounded trust gap that follows directly from
host authority — a malicious host colluding with a peer could produce a
consistent forged session, because corroboration corroborates a lie when every
client is the same person. Closing it fully requires the dedicated server we
declined. That is the honest boundary of *this* decision, written down so
nobody later assumes it is airtight; what it is allowed to reach on a board is
bounded by 0012.

Cheaper than expected: no relay to run, no game server to operate, no TURN, no
second deploy target, and a solo-degraded fallback that is just the
single-player game the project already is.

## Alternatives Considered

- **Dedicated authoritative game server** — rejected for cost, operations, and
  the static-hosting story, not for correctness; it is the right answer at real
  scale, and `js/net/arena-host.js` is deliberately the file it would replace.
- **WebRTC peer mesh** — rejected: conference guest networks isolate clients,
  so it needs TURN, which is the server we were avoiding, with worse
  ergonomics.
- **Deterministic lockstep** — rejected despite fitting ADR-0003 almost too
  well: it advances at the speed of the slowest peer and stalls when anyone
  leaves, and someone walks away from a booth mid-match constantly. It is also
  unforgiving of the deliberate render-side `Math.random()` in `camera.js` and
  `voxelworld.js`, where one leak means a silent desync with no error.
- **PartyKit / Colyseus / Cloudflare Durable Objects** — rejected: each is a
  build step and a second deploy target, which collides directly with
  ADR-0009. Durable Objects is the strongest fallback if host-authority proves
  untenable; adopting it means accepting a build step, which is a new ADR.
- **Server-authoritative simulation inside an Edge Function** — rejected: Edge
  Functions are request-scoped, not long-running, so this is the dedicated
  server again with a worse execution model.

Alternatives for the *trust* half of the original brief — trusting the client,
signing the client's score, statistical anomaly detection, per-tick state
instead of inputs — are considered in
[ADR-0012](0012-replay-validated-leaderboard-trust.md), not here.

## Related

- 0002 sim/render split — headless rules are what both a peer and a Deno replay need
- 0003 deterministic seeded generation — the shared seed and the replay defense both rest on it
- 0009 Supabase backend and the end of the static-only constraint
- 0012 replay-validated leaderboard trust — owns scoring, verdicts, and board
  eligibility for everything this arena produces
