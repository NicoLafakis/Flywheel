# ADR-0015: The scoring ladder is a table the HUD reads, not a formula the HUD mirrors

- **Status:** Accepted
- **Date:** 2026-08-10
- **Context package:** [.wiki/features/score-combo-and-hype/](../features/score-combo-and-hype/00-objective-overview.md)
  (objective overview, [PRD 0002](../features/score-combo-and-hype/01-prd.md) §22,
  [requirements](../features/score-combo-and-hype/02-requirements.md) GWT-201/202)

## Context

The voxel sandbox has always kept a real, combo-multiplied score in `hole.mass`
and has never rendered it. The multiplier it applied lived in one closed-form
expression in the sim:

```js
const comboMult = (chain) => Math.min(3, 1 + 0.1 * Math.floor(Math.max(0, chain - 1) / 25));
```

and the only combo feedback the player ever saw lived in a *second* expression
in the view:

```js
this.comboLabel.textContent = `⚡ COMBO x${Math.floor((h.chain - 1) / 25) + 1}`;
```

The second one is a **level index printed in multiplier notation**. At a chain
of 26 the HUD read `x2` while the sim awarded `1.1`; at 101 it read `x5` while
the sim awarded `1.4`. The overstatement grew with the chain, which is the worst
shape this class of bug can take — it is smallest exactly where a player might
sanity-check it.

Neither expression is unreasonable read alone, and that is the point: nothing
could have caught the disagreement except a check that the two agree, and there
was no single object for such a check to be about.

Two further pressures arrived together. The owner's replacement curve is
**front-loaded** — steps at chain 2, 10, 15, 25, 50, 100, then a rare tail —
and a closed-form expression cannot express that shape at all without becoming
a piecewise function that is a table in disguise. And the multiplier had to stop
feeding growth (the points-only ruling below), which meant the SIZE ladder's
input changed in the same breath.

## Decision

**The combo ladder is a data table in `js/voxelsim.js`, exported, and every
consumer reads that one object.**

- `COMBO_THRESHOLDS = [2, 10, 15, 25, 50, 100, 350, 600]` — the ordered chain
  thresholds. The level is the count of thresholds passed, floored at 1.
- `COMBO_STEP = 1` — what one level is worth. A whole extra helping of
  everything eaten, per the owner's ruling: level *n* multiplies by *n*.
- `COMBO_MAX_LEVEL = 8` — the tail rule. The ladder **tops out** and hands out
  nothing past it; level 8 is displayed by name (`MAX`) rather than as a number.
- `comboLevel(chain)` and `comboMult(chain)` are the only functions that turn a
  chain into either quantity, and `js/ui/hud.js` imports `comboMult` rather than
  mirroring it.

**The consumption milestone ladder is the same shape**: `MILESTONES` is an
ordered array of `{ at, text, tier }` where `at` is a fraction of the scene
*goal*, replacing the `0.25`-step arithmetic that hard-coded four thresholds
against the whole city.

**The combo is points-only.** `hole.mass` is the multiplied running total and is
now purely the displayed score; `hole.rawMass` drives the goal bar, the
milestones **and the SIZE ladder**. `SIZE_MASS` was rebased onto raw mass in the
same change, so a hot chain no longer makes the hole physically bigger.

The rebase is **per level, not one divisor**, and that was a measurement rather
than a choice. Every scene's scripted excursion was re-run against the HEAD tree
recording both currencies at each SIZE crossing; the raw figure divided by the
scene's ladder scale is the `SIZE_MASS` entry that scene needs to keep its
level. The raw/mass ratio at a crossing turned out to vary from 0.94 (gallery,
SIZE 2) to 0.39 (Manhattan, SIZE 8) — chains lengthen as the hole grows, and
Manhattan's excursion sustains a far longer one than the gallery's — so no
single constant spans it. Each entry is the minimum across scenes, with levels
9-12 (where only the gallery reaches) eased geometrically off SIZE 8 rather
than jumping 2.4× in a step. The floors in `tools/validate.mjs` were raised
from a blanket `>= 4` to the exact level each excursion reached on the old
ladder, so the rebase cannot quietly cost a scene a level.

`tools/validate.mjs` holds the invariant: for every chain from 1 to 1000, the
multiplier the HUD would display equals `comboMult(chain)`; the thresholds are
strictly increasing; the milestone rows are strictly increasing inside `(0, 1]`
with the last row exactly at the goal; and the HUD source is checked to import
the ladder and to no longer contain the old `(chain - 1) / 25` expression.

## Alternatives considered

**Keep a closed-form expression and fix the HUD to call it.** This closes the
instance and not the class — it is one edit away from a second expression next
time someone wants a display variant — and it still cannot express a
front-loaded curve. Rejected.

**A piecewise closed form.** `chain < 10 ? … : chain < 15 ? …` is a table with
worse ergonomics: it cannot be iterated, cannot be asserted structurally, and
cannot be re-tuned by anyone who does not read code. Rejected.

**Compute the display value in the HUD from sim state.** This is the status quo
and is precisely the defect. Rejected on sight.

**Growth-linked combo** (the objective overview's original recommendation).
Overruled by the owner: points-only. Under `COMBO_STEP = 1` a level-8 chain
would have fed the SIZE ladder eight times faster, and the SIZE ladder decides
movement speed, camera height and time-to-clear — a beautiful combo meter that
quietly turns every city into a ninety-second run.

## Consequences

**Bought.** One source of truth with a validator assertion holding it there. A
curve shape the owner's instruction can actually express. Milestone copy that is
editable by someone who does not read code. A ladder that can be re-tuned after
a playtest without an algebra session. A summit with a name on it, which is a
sentence a booth visitor understands in three seconds.

**Paid.** The elegance of a one-line formula, and a table that must stay sorted
— which is why the validator asserts monotonicity rather than trusting it. Two
tables now have to be kept honest instead of two expressions, but only one of
each is reachable, and each has a test.

**Foreclosed.** Continuous tuning of the multiplier between levels. The ladder
is stepped by construction; a smooth curve would be a different decision and
would need this one superseded rather than edited (ADRs are append-only).

## References

- `js/voxelsim.js` — `COMBO_THRESHOLDS`, `COMBO_STEP`, `COMBO_MAX_LEVEL`,
  `comboLevel`, `comboMult`, `MILESTONES`, `SIZE_MASS` (and the measurement
  table in the comment above it)
- `js/ui/hud.js` — the single reader, plus the announcement queue
- `tools/validate.mjs` — `validateRewardLadders()`
- [ADR-0002](0002-sim-render-split.md) — the sim emits, the renderer dresses
- [ADR-0003](0003-deterministic-seeded-generation.md) — a table lookup keeps the
  sim free of randomness and bit-identical across runs
- [ADR-0005](0005-shared-brand-layer.md) — the meters join the existing visual
  language rather than starting a new one
- [ADR-0014](0014-vendored-same-origin-runtime.md) — no build step, no new
  dependency: hand-written CSS, DOM and one SVG arc
