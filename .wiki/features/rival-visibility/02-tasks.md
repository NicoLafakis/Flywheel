# Rival Progress Visibility — Tasks

**Status:** phases A–D shipped 2026-08-11 (T6's two-phone playtest gate and
phase E remain open; T13's wiki half done, its probe extensions ride the next
conventions pass)

> [Objective overview](00-objective-overview.md) ·
> [Requirements](01-requirements.md)

The work breakdown, in the recommended build order from the overview:
**1+2 → 4 → 5 → 6 → 3/7 as 8-player lands.** Sizing is the research
synthesis's own scale — *trivial* (hours), *small* (a day-ish), *medium*
(days). Every task cites the acceptance criteria it exists to pass; the
criteria, not the task text, are the contract.

A note on sequencing: T1–T4 (phase A) close the playtest complaint and are
the package's whole reason to exist. Everything after phase A is only worth
building once phase A has been felt on two phones.

---

## Phase A — whose blocks, and who's winning (patterns 1 + 2)

- [x] **T1 — Per-slot color identity, exported once.** *Trivial.* One module
  exposing slot → color (and name), derived from the existing skin layer
  (`skinId` per hole). Every later task imports this; none defines its own
  mapping. → CC-3.
- [x] **T2 — Attribution record from live events.** *Trivial.* Maintain
  block id → eater slot: from `sim.events` (`eat` carries `hole`) on the
  host, from decoded snapshot events (`slot` per event) on peers. Pure data,
  no three.js, headless-readable — this is also the future seam for
  replays/heatmaps/leaderboard stats (overview, move 4). → AC-01.1, AC-01.2,
  AC-01.8, CC-1, CC-2.
- [x] **T3 — Eater identity survives the keyframe.** *Small.* The one wire
  change in the package. Amend the keyframe tail so a cold decoder recovers
  block → eater slot (recommended shape: one `encodeEatenRLE` stream per
  occupied slot — codec reused unchanged; exact layout is this task's call);
  bump `PROTOCOL_VERSION`; extend `validate()` coverage and the protocol
  round-trip probes. → AC-01.4, AC-01.5, AC-01.6.
- [x] **T4 — Crater tinting.** *Small.* Render the exposed footprint of every
  attributed block in its eater's color, from T2's record — including records
  rebuilt from a T3 keyframe. Phone-legible tint levels; un-eaten ground
  untouched. → AC-01.3, AC-01.7.
- [x] **T5 — Tug-of-war bar.** *Trivial.* One N-segment bar over `rawMass`
  shares, color from T1, redundant boundary cue, **no digits during play**.
  → AC-02.1 through AC-02.6.
- [ ] **T6 — Phase A playtest gate.** Re-run the two-phone test on the live
  arena. The question to answer is the original complaint, verbatim: is there
  now a sense of whose blocks were eaten, and of who is winning? → AC-01.7,
  AC-02.4, AC-02.5 live halves.

## Phase B — where are they (pattern 4)

- [x] **T7 — Off-screen rival chevron.** *Small.* Edge-projected chevron per
  off-screen rival, color from T1, sized by mass, driven from the ghost
  roster; extends the shipped directional-indicator vocabulary (commit
  552f290), allocation-free. → AC-04.1 through AC-04.5.

## Phase C — momentum (pattern 5)

- [x] **T8 — Beat detection.** *Trivial.* Pure detectors over sim/snapshot
  state: landmark eat (wire `LANDMARK` flag), lead change (with hysteresis),
  trailing-at-30s. Headless-probed for exactly-once firing. → AC-05.1.
- [x] **T9 — Feed copy table + queue source.** *Trivial.* Callout copy as a
  data table; beats enter the existing announcement queue as a new source
  with a defined priority; reduced-motion inherited. 3–5 beats per match.
  → AC-05.2 through AC-05.5, CC-5.

## Phase D — payoff (pattern 6)

- [x] **T10 — Match-end territory reveal.** *Medium.* Camera pull-up over the
  T4 crater map, bar animation to the final split, exact percentages shown
  here for the first time; same data sources as the live surfaces, skippable,
  reduced-motion respected. Depends on T4 + T5 by construction. → AC-06.1
  through AC-06.4.

## Phase E — as 8-player lands (patterns 3 + 7)

Deliberately last: both are garnish at N=2 and earn their keep as the arena
fills. Neither blocks anything above.

- [ ] **T11 — Size-as-threat ring + nameplate.** *Small.* Color ring at the
  rim and world-space nameplate from snapshot radius/position; the legibility
  prerequisite for future hole-eats-hole ([ai-players](../ai-players/)).
  → AC-03.1 through AC-03.4.
- [ ] **T12 — Score popups on big eats.** *Trivial.* Threshold-gated, pooled,
  eater-colored, from the same events as T2. → AC-07.1 through AC-07.4.

## Package close-out

- [ ] **T13 — Cross-cutting probes + wiki.** Extend the conventions/no-write
  greps to the new files (CC-1, CC-2), verify the single color table (CC-3)
  and constants block (CC-5), update `.wiki/modules/render.md` /
  `.wiki/modules/ui.md`, `STATUS.md` (dated) and `CHANGELOG.md` per
  [conventions](../../conventions.md), and flip this package's status from
  planning as phases land.
