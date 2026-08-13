# Timed Runs & Full Clear — objective overview

**Date:** 2026-08-13 · **Status:** accepted, in build · **Owner decision:** Nico,
2026-08-13

> [Requirements](02-requirements.md) · [Tasks](13-tasks.md)

## What the owner asked for

Four instructions, verbatim in intent:

1. **Timers on the levels** — "so that it's not just open season". A **3-minute
   limit to finish on all levels**. *"I don't care how unrealistic that is,
   do it."*
2. **The goal on ALL levels is now 100%, not 50%** — "CHANGE THEM ALL, not just
   the front-end, the back-end and everything."
3. **Scores must add up properly**, single player *and* multiplayer.
4. **The multiplier must work as expected and show an accurate value** — "If it
   maxes out at 100x, then it shouldn't ever go above 100... There's some common
   sense stuff that's not being taken into account there."

Plus a standing instruction covering all four: apply common sense, and research
how the genre already solves it rather than deriving a scheme.

## What the genre already answers

[Hole.io runs two-minute matches](https://en.wikipedia.org/wiki/Hole.io). The
timer is load-bearing rather than decorative: it manufactures urgency, produces
the "just one more" pull that defines the hyper-casual loop, and reframes every
idle second as score conceded to a rival. A 3-minute limit sits squarely inside
that convention — it is not the unrealistic part of the request.

The part the genre answers differently is the *goal*. In this family of games the
clock **ends** the match and the player is scored on **how much they got**. No
mainstream hole-eater asks the player to clear the entire map as a pass/fail
condition, because on any map worth driving around that is unreachable.

## The reading that makes instructions 1 and 2 cohere

Taken literally and naively — a 3-minute hard limit *and* a 100% completion
requirement — every city level becomes an automatic loss. Upper Manhattan is
73,393 blocks; Chicago is 44,578. A measured 90-second ranked run on Chicago
consumes low single-digit percentages of the map
([T-901](../../findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md)
§3.4, and [04-anti-cheat](../scoreboards-and-profiles/04-anti-cheat.md) §3A
measured 2.91% after nearly ten minutes of sim time). Nobody will ever clear one.

So the accepted design is both instructions, literally, with the genre's own
resolution of the tension:

- **The clock is 3:00 and it is hard.** When it expires the run ends and the
  player goes to a results screen. No level runs open-ended any more.
- **The goal target is 100% of the city on every level.** The goal bar, the
  milestone phrases, the completion percentage and the saved records all measure
  against the whole map, not against half of it.
- **The outcome is the percentage reached, not a pass/fail on 100%.** Star
  ratings and records scale off what the player got in the time. 100% remains
  reachable and is a genuine perfect clear — routine on the gallery, monumental
  on a city, and prestigious precisely because it is hard.

This gives the owner exactly what was asked for on both counts while leaving a
game that can be played. If the owner later wants 100% to be a hard *win*
condition rather than a scoring ceiling, that is a one-constant change and is
called out as a seam in [requirements](02-requirements.md) R-2.5.

## Why the multiplier reads wrong today

Confirmed by inspection, `js/voxelsim.js:176-216`:

```
COMBO_THRESHOLDS  = [2, 10, 15, 25, 50, 100, 350, 600]
COMBO_LEVEL_NAMES = ['', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'MAX']
comboMult(chain)  = 1 + (comboLevel(chain) - 1) * COMBO_STEP,  COMBO_STEP = 1
```

The true multiplier tops out at **8x**. The number the owner saw — `Best combo
530` on the RUN results screen — is a **chain count**: 530 blocks eaten inside
the rolling window. It is a truthful number wearing a multiplier's clothes, in a
slot where players read "x". The sim is not paying 530x and never could.

The defect is therefore one of naming and inventory, not arithmetic: every
readout must declare which of the three distinct quantities it shows — chain
count, level index (1-8), or multiplier (1x-8x) — and a value labelled as a
multiplier must never exceed the declared cap. A label reading `MAX` while the
number underneath keeps climbing is the specific thing being called out.

The full readout inventory and any genuine arithmetic defects come from the
scoring audit; its findings land in [13-tasks](13-tasks.md) as T-3xx.

## Scope

**In:** the goal table and every consumer of `targetFraction`; a 3:00 run clock
for campaign and sandbox alike; the end-of-clock results path; combo readout
honesty across HUD, results, toasts, and arena surfaces; score-accumulation
correctness in single player, in the host/peer arena, and in the server-side
ranked verifier.

**Out:** THE RUN's own 90-second bound (ADR-0016, server-seeded and frozen —
unaffected by the 3:00 level clock); the debris-drain engine defect and the
validator rebuild, which are their own tracked work and are dependencies rather
than parts of this feature; map snapshot caching.
