# Rival Progress Visibility — Requirements

**Status:** planning (2026-08-11)

> [Objective overview](00-objective-overview.md) · [Tasks](02-tasks.md)

User stories — one per pattern, in the overview's ranked order — with
Given/When/Then acceptance criteria and the design folded inline (Tier 1
package: no separate PRD or design doc). If a behaviour is not written here,
it is not verified. Each criterion is tagged:

- **[V]** checkable in `tools/validate.mjs` or a headless Node run
  (sim/protocol level — encoders, decoders, attribution data)
- **[2C]** needs two clients — the loopback demo harness or two browser
  sessions against the live arena
- **[L]** live-verify only — a human, or a browser-driven pass, looking at it

One invariant governs everything here, restated from
[ADR-0002](../../adr/0002-sim-render-split.md): **every pattern is a read-only
consumer of sim events and wire snapshots.** No file added by this package
writes a hole field, a block field, or an outcome. A criterion that could only
pass by writing sim state is a bug in this document.

---

## US-01 — As a player, I can see whose blocks were eaten (pattern 1: colored craters)

**Given** a shared-arena match
**When** any hole eats a block
**Then** the exposed footprint where that block stood renders tinted in the
eater's color, on every screen, and the tint persists for the match. **[2C]**

*Design inline.* The sim already attributes every consumption:
`js/voxelsim.js` `_consume(b, h)` takes the eating hole (attribution decided
by the caller — first hole in index order whose void covers the block — so a
block is never double-counted) and emits `{type:'eat', obj, hole}`. The wire
already carries it: `js/net/snapshot.js` `captureEvents` encodes each eat as
`u8 slot / u8 flags / u16|u32 object_id` (`js/net/protocol.js`), slot being
the eater. Pattern 1 is therefore **render-side tinting keyed by eater slot**:
an attribution record (block id → eater slot) maintained from local sim
events on the host and from decoded snapshot events on peers, with the ground
footprint tinted from the record. Colors come from the per-slot color
identity (the skin layer's `skinId`), read from one place by every pattern in
this package.

- **AC-01.1 [V]** Every `eat` event in a multi-hole sim carries the eating
  hole, and the attribution record built from a headless match maps every
  consumed block id to exactly one eater slot — no block unattributed, none
  attributed twice.
- **AC-01.2 [V]** A decoded snapshot's eat events yield the same block→slot
  record on a peer as the host's local events yield, for the same tick range
  (loopback, headless).
- **AC-01.3 [2C]** On the peer's screen, a block eaten by the host renders its
  footprint in the host's color within one snapshot interval of the eat.
- **AC-01.4 [2C]** **Given** the rival ate a block while a peer was healing
  from a keyframe (or joined late), **when** the peer's keyframe heals it,
  **then** the exposed footprint tile renders in the rival's color within one
  keyframe interval — *this criterion is what forces the protocol addition
  below; it cannot pass against the current anonymous bitset.*
- **AC-01.5 [V]** The keyframe round-trips eater identity: encode a keyframe
  from a sim where slots 0 and 1 have each eaten a known disjoint block set,
  decode it cold (no prior snapshots), and recover both sets exactly.
- **AC-01.6 [V]** The amended keyframe layout is a `PROTOCOL_VERSION` bump,
  and `validate()` cleanly rejects the old version (existing gate — verified
  still covering the new layout, not bypassed by it).
- **AC-01.7 [L]** At the shipped camera distances on a phone, two players'
  territories are distinguishable at a glance, and the tint never makes
  un-eaten blocks look eaten.
- **AC-01.8 [V]** The attribution record is data keyed by block id, separable
  from the renderer — a headless consumer can read it without three.js (the
  seam for replays/heatmaps/stats named in the overview, move 4).

*The wire gap, stated for the implementer.* `encodeEatenRLE` /
`decodeEatenRLE` (`js/net/snapshot.js`) carry an anonymous one-bit-per-object
bitset — alternating not-eaten/eaten varint runs. Eater identity must survive
the keyframe; the overview §"The one wire gap" recommends one RLE stream per
occupied slot (reusing the codec unchanged), but the exact layout is T3's
call. What is normative here is AC-01.4/01.5, not the byte format.

## US-02 — As a player, I always know who is winning (pattern 2: tug-of-war bar)

**Given** a shared-arena match
**When** I glance at the HUD
**Then** one horizontal bar, split by player color at the current mass ratio,
tells me who is ahead and by roughly how much — without reading a number.
**[L]**

*Design inline.* One bar, N segments, each segment's width proportional to
that slot's share of total consumed mass (`rawMass`, the un-multiplied
figure — the same field the goal bar reads, so "winning the city" and
"winning the match" agree). Driven from snapshot hole mass on peers and sim
state on the host. Splatfest tracker / possession bar, not a scoreboard.

- **AC-02.1 [V]** Segment proportions computed from a known mass vector match
  the ratio exactly, sum to the full bar, and a zero-mass match renders an
  even split rather than dividing by zero.
- **AC-02.2 [V]** The bar reads `rawMass`, not combo-multiplied `mass` — grep
  finds no second mass source feeding it.
- **AC-02.3 [2C]** Both phones show the same split (within quantisation) at
  the same moment.
- **AC-02.4 [L]** The bar is legible on a phone in one glance; segments carry
  a redundant non-color cue at the boundary (per the shipped
  color-independence rule) so two similar skins still read.
- **AC-02.5 [L]** **Anti-pattern guard:** no exact percentage or score digits
  appear on or near the bar during play; the exact number appears only on the
  match-end screen (US-06). Coarse mid-match, exact at the end is the design,
  not an omission.
- **AC-02.6 [V]** With 8 slots the bar is 8 segments from the same code path —
  no duel special case.

## US-03 — As a player, a bigger rival reads as danger (pattern 3: size-as-threat)

**Given** rivals of different scores on screen
**When** I look at one
**Then** its hole is visibly bigger, ringed in its color, and nameplated — I
can tell "bigger than me or smaller" without the HUD. **[L]**

*Design inline.* The sim already scales radius with progress
(`h.radius` from the SIZE ladder) and the wire already carries per-hole
radius; this story is about making the *difference* legible: a color ring at
the rim in the slot's color and a world-space nameplate. This is the
legibility prerequisite for any future hole-eats-hole
([ai-players](../ai-players/) US-08/US-12 are the sim-side siblings); built
late (see build order) because craters and the bar answer "who's winning"
sooner and cheaper.

- **AC-03.1 [V]** Ring radius and nameplate anchor derive from snapshot
  radius/position only — no client-side re-derivation of size from mass.
- **AC-03.2 [L]** Relative size between two holes is readable at shipped
  camera distances, and never encoded by color alone.
- **AC-03.3 [2C]** The rival's ring and nameplate on my screen match their
  own identity on theirs (same color, same name, no slot swap).
- **AC-03.4 [L]** Nameplates do not stack into an occluding wall when holes
  cluster (same criterion family as ai-players AC-12.4).

## US-04 — As a player, I know where my rival is when off-screen (pattern 4: edge chevron)

**Given** a rival outside my view
**When** I play
**Then** a chevron in their color sits at the screen edge nearest them, sized
by their mass, and disappears when they come on screen. **[L]**

*Design inline.* Standard arena pattern; extends the shipped
directional-indicator vocabulary (commit 552f290 — the indicators that shrink
and lead the hole) rather than adding a second pointer system. Chosen over a
minimap for phones: the chevron lives in the view already being watched.
Driven from ghost positions (the interpolated roster in `js/net/snapshot.js`).

- **AC-04.1 [V]** The edge-projection math places the chevron on the correct
  screen edge for known world positions and camera poses (headless,
  camera-matrix level).
- **AC-04.2 [L]** Chevron size tracks rival mass; a big rival's chevron is
  noticeably larger than a small one's.
- **AC-04.3 [2C]** Walking toward a chevron finds the rival; the chevron
  hands off (disappears) exactly as they enter view, without flicker at the
  boundary.
- **AC-04.4 [L]** With 7 rivals, chevrons remain individually readable and do
  not overlap into noise (they may merge or prioritise; the criterion is
  readability, not completeness).
- **AC-04.5 [V]** No per-frame allocation in the chevron path (inherits the
  HUD discipline from score-combo-and-hype).

## US-05 — As a player, momentum shifts are called out (pattern 5: milestone feed)

**Given** a match in progress
**When** a rare, significant thing happens — a landmark falls, the lead
changes, 30 seconds remain while I trail
**Then** a one-shot callout names it, in the actor's color, through the
existing announcement queue. **[L]**

*Design inline.* Three beats, all derivable from data already flowing:
landmark eats (the wire's `LANDMARK` event flag), lead changes (the bar's
ratio crossing), and the timed "you're behind" beat (clock + ratio). Copy
lives in a data table keyed by beat type (inheriting score-combo FR-018's
rule), joins the one announcement queue as a new source under its FR-019
priority discipline, and inherits the reduced-motion rule. Target cadence:
3–5 beats per 3-minute match — rare enough to stay events.

- **AC-05.1 [V]** Beat detection is pure over sim/snapshot state: a headless
  run of a scripted match produces the expected beat sequence, exactly once
  per beat (a lead that oscillates across the threshold does not machine-gun
  the feed — hysteresis is required and tested).
- **AC-05.2 [V]** All callout copy lives in one data table; grep finds no
  feed copy in template literals at call sites.
- **AC-05.3 [V]** Feed messages enter the existing announcement queue as a
  distinct source with a defined priority — no second toast/overlay system
  exists.
- **AC-05.4 [2C]** A landmark eaten by one player produces the callout on
  both screens, naming the eater, in the eater's color.
- **AC-05.5 [L]** A full playtest match surfaces roughly 3–5 beats, and none
  feels like spam; with reduced motion enabled, every beat obeys the shipped
  reduced-motion rule.

## US-06 — As a player, the ending pays off the territory (pattern 6: match-end reveal)

**Given** the match clock expires
**When** the end sequence plays
**Then** the camera pulls up, the colored craters read across the whole city,
and the bar animates to the final split with the exact result. **[L]**

*Design inline.* Splatoon's Judd reveal, made of patterns 1 and 2: the
pull-up shows the crater map that already exists, the bar animates from its
last live state to the final ratio, and the exact percentages — deliberately
withheld all match (AC-02.5) — land here. Built after 1+2 by construction.

- **AC-06.1 [V]** The final split is computed from the same attribution
  record and mass fields the live surfaces used — no separate end-of-match
  tally that could disagree with what the city shows.
- **AC-06.2 [2C]** Both screens show the same final split and the same
  winner, always — including when the match ends mid-heal on one peer.
- **AC-06.3 [L]** The pull-up frames enough of the city that both territories
  are visible; the sequence is skippable and respects reduced motion.
- **AC-06.4 [L]** The exact number appears here and only here (the closing
  half of AC-02.5's guard).

## US-07 — As a player, big eats are felt (pattern 7: score popups)

**Given** a hole eats a high-value block
**When** the eat lands
**Then** a floating score popup rises from the block in the eater's color.
**[L]**

*Design inline.* Lowest priority in the package; a garnish once 1–6 have made
the city legible. Threshold-gated (big eats only — a popup on every block is
noise), driven from the same eat events as pattern 1.

- **AC-07.1 [V]** Popups fire only above the value threshold, and the
  threshold is a named constant in the package's constants block.
- **AC-07.2 [2C]** The popup appears on both screens in the eater's color.
- **AC-07.3 [V]** No per-frame allocation; popups pool.
- **AC-07.4 [L]** With reduced motion enabled, the popup obeys the shipped
  rule.

---

## Cross-cutting criteria

- **CC-1 [V]** No file added by this package writes any hole or block field —
  the same grep-based check ai-players AC-03.2 uses, extended to these files.
- **CC-2 [V]** No sim-path or net-path file added or changed contains
  `Math.random`, `Date.now`, or `performance.now` (existing conventions
  probe, extended).
- **CC-3 [V]** All five color-consuming surfaces (craters, bar, chevrons,
  rings, feed) read the per-slot color from one exported identity table;
  grep finds no second color mapping.
- **CC-4 [L]** Nothing in this package conveys information by color alone;
  every signal has a redundant channel.
- **CC-5 [V]** Tunable constants (popup threshold, feed hysteresis, beat
  cadence guards, tint parameters) live in one commented constants block.
