# Rival Progress Visibility — Objective Overview

**Tier:** 1 · **Status:** planning (2026-08-11)

> The spine of the package. [01-requirements.md](01-requirements.md) says *how
> we will know each pattern works* (design inline — this is a Tier 1 package,
> there is no separate PRD), and [02-tasks.md](02-tasks.md) is the build order.
> Only this page says *why in this shape*. Read it first.

## What was observed

Nico's two-phone playtest over the live arena (2026-08-11): two players, one
shared city, both eating. The match worked — positions synced, blocks
disappeared on both screens — and it still failed as a *contest*, because
nothing on either screen answered the four questions a rival makes urgent:

1. **Whose blocks were eaten?** (the verbatim complaint: "no sense of whose
   blocks were eaten")
2. **Who is winning right now?**
3. **Where is the other player?**
4. **Is the gap growing or shrinking?**

The netcode carries the answers; the presentation discards them. This package
is the plan for surfacing them, and nothing else — no new mechanics, no
outcome changes, presentation only.

## What it really serves

The literal ask is "show whose blocks those were." What it is reaching for is
**making the rival's presence legible enough that the match feels contested
from any seat** — on a phone held in one hand, at a glance, without a HUD
census. Every pattern below was chosen and ranked against that reading, and
the ranking came from genre research (the games that solved exactly this:
Splatoon's turf, Agar.io/Hole.io's size legibility, Tetris 99's event
banners).

## The seven patterns, ranked

**1. Player-colored craters/rubble where each hole ate** — *whose blocks* —
trivial/small. Splatoon turf ink; Paper.io 2 claimed area. Every consumed
block's exposed footprint renders in the eater's color, so the city itself
becomes a live territory map. Zero extra HUD, phone-friendly, and it answers
the playtest complaint directly. Highest value in the package.

**2. Proportional tug-of-war mass bar** — *who's winning* — trivial. One bar,
split by player color at the mass ratio (Splatfest trackers, sports possession
bars). Replaces the mental math of comparing two absolute scores; scales to 8
players as segments of one bar.

**3. Size-as-threat** — *who's winning + danger* — small. A rival hole's
diameter already scales with score in the sim; make it *visibly* read at a
glance, with a color ring and nameplate. Agar.io/Hole.io's core legibility
move. This is the prerequisite for any future hole-eats-hole, which is why it
is planned here and built late (see the build order).

**4. Off-screen rival indicator** — *where are they* — small. An edge chevron
in the rival's color, sized by their mass. Standard arena pattern; builds on
the shipped directional-indicator code (commit 552f290) rather than a new
pointer system. Preferred over a minimap on mobile — a minimap is a second
view to glance at, a chevron lives in the view you already have.

**5. Milestone event feed** — *momentum* — trivial. Rare one-shot callouts:
"RED ate the stadium!", "RED took the lead!", "30s — you're behind!". Tetris
99 / Fall Guys banners. Three to five beats per 3-minute match, with landmark
buildings as the milestones. Rides the existing announcement queue from
[score-combo-and-hype](../score-combo-and-hype/) as a new source — never a
second toast system.

**6. End-of-match territory reveal** — *payoff* — medium. Camera pulls up,
the colored craters read across the whole city, the bar animates to the final
result. Splatoon's Judd reveal. Built after 1+2, because it is literally made
of them.

**7. Floating score popups on big eats, in the eater's color** — *momentum* —
trivial. Lowest priority; a garnish on a city that patterns 1–6 have already
made legible.

**Recommended build order: 1+2 → 4 → 5 → 6 → 3/7 as 8-player lands.**

## Anti-patterns — researched, and deliberately not built

- **Exact live percentages mid-match.** The bar stays coarse during play and
  the exact number appears only at the end — this is Splatoon's deliberate
  design, and it exists to keep a losing player playing. A precise live
  percentage turns a close match into a countdown.
- **Hidden rubber-banding.** Any catch-up mechanic must be visible and earned;
  invisible score assistance is the classic trust-killer (see the rejection
  with sources in [ai-players](../ai-players/), which this package inherits).
  Nothing in this package touches outcomes at all.
- **Minimap + feed + bars simultaneously on mobile.** The patterns are ranked
  precisely so we never ship all of them stacked on a phone screen. The
  chevron replaces the minimap; the bar replaces a scoreboard column; the feed
  is rare by design.

## The one wire gap

Verified against the code, 2026-08-11:

- **The sim attributes every block.** `js/voxelsim.js` `_consume(b, h)` takes
  the eating hole; attribution is decided by the caller (first hole in index
  order whose void covers the block, so no double-count), and the emitted
  `eat` event carries `hole: h`. Pattern 1's data exists at the source.
- **Live snapshots carry the eater.** `js/net/snapshot.js` `captureEvents`
  maps each `eat` event to a wire event whose first byte is the eater's slot
  (`u8 slot / u8 flags / u16|u32 object_id`, `js/net/protocol.js`). A client
  that sees the eat live can tint the crater correctly with zero wire changes.
- **The keyframe forgets.** The keyframe's eaten set (`encodeEatenRLE`) is an
  anonymous one-bit-per-object bitset — alternating not-eaten/eaten varint
  runs. A client that learns a block's fate from a keyframe (a late joiner,
  or any peer healing after missed snapshots) knows *that* the block is gone
  and not *whose* it was. Left alone, pattern 1 degrades exactly at the moment
  the playtest cared about: rejoin mid-match and the whole city's history is
  colorless.

**The protocol addition pattern 1 needs:** eater identity in the keyframe
tail. The cheap shape that fits the existing format is one RLE bitset *per
occupied slot* instead of one global one (a block eaten by slot `s` sets only
slot `s`'s stream), which reuses `encodeEatenRLE` unchanged and keeps the
"anonymous union" available as the OR of the streams; it costs roughly
`hole_count ×` the current tail on the wire, still double-digit bytes for a
campaign city and comfortably inside the snapshot budget. It is a keyframe
layout change, so it is a `PROTOCOL_VERSION` bump — the version gate in
`validate()` already makes that a clean break rather than a desync. The exact
layout is the implementer's call in [02-tasks.md](02-tasks.md) T3; what is
load-bearing here is only that **eater identity must survive the keyframe**,
because every render path must be able to answer "whose" from wire data alone.

## Twenty moves ahead

Where this goes if it works, and what today's shape must not foreclose:

1. **2 → 8 players is the same code.** Every pattern is specified per-slot,
   never as "me vs. the rival": the bar is N segments, the craters are N
   colors, the chevrons are N−1 edges. The two-phone test is just N=2. Any
   design that hardcodes a duel is the dead end here.
2. **Party mode inherits the whole layer.** [party-mode](../party-mode/) is a
   room of people watching each other's screens; its "BOTTOMS UP!" callout is
   pattern 5's queue discipline, and its social legibility assumes rivals are
   already visible. This package is the substrate that plan stands on.
3. **The UNBOUND booth is a spectator of exactly this.** A booth screen
   showing a match is showing patterns 1, 2 and 6 — territory, bar, reveal —
   to people who are not holding a controller. Everything here must render
   from the snapshot stream alone (which the host-authoritative shape gives us
   for free), so a spectator screen is a peer that never sends intent.
4. **Per-block attribution is the stats foundation.** The same
   block→eater record that colors craters is, replayed, an end-of-match
   heatmap; aggregated, it is "favorite district" and "landmarks taken" on a
   leaderboard row; validated, it rides
   [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md)'s replay
   trust. Store attribution as data keyed by block id, not as baked-in
   material state, and all three come later for free.
5. **Landmark milestones become content.** Pattern 5's "RED ate the stadium!"
   needs landmarks to be data rows (they already carry a `landmark` event
   flag on the wire). The moment callout copy is a table, scenes can ship
   bespoke milestone lines without touching the feed.
6. **Colors must come from one place.** Craters, bar segments, chevrons, rings
   and feed all key off the same per-slot color identity (the skin layer
   already gives every hole a `skinId`). A second color table anywhere is a
   future desync between what the bar says and what the city shows.
7. **Hole-eats-hole arrives on schedule.** When [ai-players](../ai-players/)'
   swallow rule reaches the arena, pattern 3's size ring is what makes it fair
   — the danger was legible before the mechanic existed.

## The scope line (pencil test)

**Build silently** — completers, cheap, removable:

- Per-slot color identity read from the existing skin layer, exposed once for
  all five surfaces (move 6 above).
- Attribution kept as data (block id → eater slot), with the tint derived from
  it — never the other way around (move 4).
- Reduced-motion and color-independence handling: every color-coded signal
  carries a redundant channel (name, position, pattern), inherited from the
  shipped rules.
- The N-player shapes for bar/chevron/craters even though today's test is N=2
  (move 1).

**Surface, do not build** — pens:

- End-of-match replays, heatmaps, leaderboard stat columns (move 4 names the
  seam; nothing reads it yet).
- Spectator/booth screen as a product surface (move 3; the snapshot-driven
  constraint is honored now, the screen is its own package).
- Hole-eats-hole in the arena (belongs to [ai-players](../ai-players/) and a
  future arena package).
- A minimap. Researched, rejected for mobile; revisit only if a desktop booth
  view wants it.

## Sources

Inkipedia Turf War / Tricolor pages; Nintendotimes Splatoon analysis;
holeio.com; Paper.io 2; Agar.io; TetrisWiki Tetris 99; 80.lv Teardown
multiplayer tech; RocketBrush HUD design; GameAnalytics mobile UI; Pixune
mobile UI; Wikipedia, rubber banding.
