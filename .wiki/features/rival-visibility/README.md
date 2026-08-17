# Rival Progress Visibility — planning package

**Status: phases A–D shipped 2026-08-11, then retired 2026-08-16 along with
the `js/net/` prototype arena this package was built on — this page is now a
historical design record, not a description of anything currently running.**
At the time, shipped: per-slot color identity (`js/rival/identity.js`), the
attribution record (`js/rival/attribution.js`), the protocol v3 per-slot
keyframe streams (the one wire gap, closed), crater tinting
(`js/rival/territory.js` + `territory-layer.js`), the tug-of-war bar, the
off-screen/apart rival chevron, milestone callouts, and the end-of-match
territory reveal — live on arena.html, with craters + bar shared onto the
hot-seat page (multiplayer.html). Headless coverage was `js/rival/rival.test.mjs`.
None of `js/rival/`, `arena.html` or `multiplayer.html` exist in the current
tree; the clean-slate `js/multiplayer/` rebuild kept only PvP takedown
announcements from this package. See `architecture.md`'s "Rival visibility"
note and [modules/multiplayer.md](../../modules/multiplayer.md) for what
actually ships today.

The package comes
directly out of a live playtest: Nico's two-phone test over the deployed arena
(2026-08-11) surfaced one dominant complaint — **"no sense of whose blocks were
eaten."** Two holes shared a city, both ate, and neither screen ever said who
was winning, where the other player was, or which half of the wreckage was
whose. This package is the plan for making a rival's progress *visible* —
seven ranked patterns from genre research, ordered by value against that exact
complaint.

This was never blocked on anything unbuilt, unlike the original party-mode
design (retired along with the legacy multiplayer stack; see
[multiplayer](../multiplayer/README.md) for the shipped replacement): the sim
already attributes every eaten block to the hole that ate it, and the wire
already carries eat events with the eater's slot. Most of this package is
render-side tinting and HUD work on top of data that already flows.

## Start here

- **Implementers:** [00-objective-overview.md](00-objective-overview.md) →
  [01-requirements.md](01-requirements.md) → [02-tasks.md](02-tasks.md). The
  overview is the spine; read it before the criteria. The trap this package
  sets is building pattern 1 as a pure render effect and discovering that a
  late joiner — or any peer healing from a keyframe — paints every crater
  grey, because the keyframe's eaten bitset does not say *who* (the one
  protocol gap this package found; see the overview §"The one wire gap").
- **Nico:** nothing in this folder is open on your desk. The build order is an
  engineering call and the visuals are described in the overview in terms of
  what a player sees.

## The docs

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What the playtest complaint really asks for, the seven ranked patterns and the research behind them, the anti-patterns we are deliberately not building, the one wire gap, twenty moves ahead, and the pencil-test scope line |
| [01-requirements.md](01-requirements.md) | Seven user stories — one per pattern — with Given/When/Then acceptance criteria and the design folded inline (this is a Tier 1 package: no separate PRD or design doc). Each criterion tagged validator-checkable, needs-two-clients, or live-verify-only |
| [02-tasks.md](02-tasks.md) | Discrete tasks in the recommended build order (1+2 → 4 → 5 → 6 → 3/7), each sized trivial / small / medium |

## The finding that shapes the build

**Per-block eater attribution already exists everywhere except one place.**
The sim's `_consume(b, h)` credits every block to the hole that ate it and
emits an `eat` event carrying that hole; the wire's per-event layout
(`u8 slot / u8 flags / u16|u32 object_id`) carries the eater's slot on every
live snapshot. The single hole is the keyframe: its eaten set is an anonymous
one-bit-per-object RLE bitset, so a client that learns a block's fate from a
keyframe (late join, missed snapshots) knows *that* it was eaten but not *by
whom*. Pattern 1 therefore needs one protocol addition — eater identity in the
keyframe tail — and everything else in the package is client-side.

## What this package is not

- Not a minimap. Rejected on purpose for phone screens — the off-screen
  chevron (pattern 4) does the "where are they" job without a second view to
  glance at.
- Not exact live percentages mid-match. The tug-of-war bar is deliberately
  coarse until the end screen; see the anti-patterns section of
  [00](00-objective-overview.md).
- Not rubber-banding, visible or hidden. Nothing here changes match outcomes;
  every pattern is read-only over sim state.
- Not hole-eats-hole. Pattern 3 (size-as-threat) is the *legibility
  prerequisite* for that future mechanic, which belongs to
  [ai-players](../ai-players/) (US-08 there) and to the arena, not here.

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — every
  pattern here is dressing. Nothing in this package writes sim state; craters,
  bars, chevrons and callouts are all read-only consumers of events and
  snapshots.
- [ADR-0019 six-player invite-lobby multiplayer](../../adr/0019-six-player-invite-lobby-multiplayer.md)
  — attribution is whatever the host's sim said, carried on the wire. A peer
  never infers "whose block" from its own ghost positions.
- [ADR-0012 replay-validated leaderboard trust](../../adr/0012-replay-validated-leaderboard-trust.md)
  — the same per-block attribution stream that colors craters is the data
  foundation for post-match stats that this ADR's validated replays can trust.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no dependency; tinting is material work in the existing
  renderer.
- [score-combo-and-hype](../score-combo-and-hype/) (shipped 2026-08-10) — the
  milestone event feed (pattern 5) is a new source in the one announcement
  queue, at that package's FR-019 priority discipline, inheriting its
  reduced-motion rule. Not a second toast system.
- The directional-indicator work (commit 552f290) — the off-screen rival
  chevron (pattern 4) extends the shipped indicator vocabulary rather than
  inventing a new pointer.
- [multiplayer/04-netcode-protocol](../multiplayer/04-netcode-protocol.md)
  — the snapshot/keyframe layout this package's one wire change amended. That
  wire change was written against the legacy `js/net/` protocol, which has
  since been scrapped; it has not been reconciled against the current
  multiplayer package's netcode.
