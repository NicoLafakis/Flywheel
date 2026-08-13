# ADR-0018: Debris retires on proven stationarity, not on contact-freedom

- **Status:** accepted
- **Date:** 2026-08-13
- **Deciders:** Nico, Ares

## Decision

A debris body that has held its position for 30 consecutive steps while grounded
on solid support may be retired **even though it is still flagged
`_inContact`**. Stationarity is measured, not inferred: per-axis drift below
1 mm from a fixed anchor, for `JAM_STEPS = 30` steps, on a body the integrator
actually moved this step.

The `_inContact` sleep refusal stays in place for every other body. It is
overridden only by that latch, and only for bodies that additionally satisfy the
four conditions the existing sleep walk already applies: grounded this step, on
solid support (`!_looseSup`), below the repose speed, and not `_budgetHold`.

## Why the previous rule was wrong for this population

The `_inContact` refusal exists because a block frozen mid-overlap can never
separate. That premise is false for a wedge at a **geometric fixed point**: the
alternating pair separations converge within one step and the next step
reproduces them bit for bit — traced over 60 consecutive steps, the first
penetration drifted by one ULP (8.88e-16) and the body moved less than 1 mm.
These overlaps were never going to separate. Freezing them bought nothing and
cost a per-step contact, support probe and relaxation slot each, forever.

At simT 120 s on the validator's Cambridge route, **78 of 101 awake bodies (77%)
were in that state.** The population is monotonic — one wedge per collapse that
leaves a block pinched — which is the superlinear cost curve behind both the
`validateCambridge` stall and T-901's mobile shortfall.

## Rejected alternatives

- **RCA-2026-08-11 §5's bottom-up promotion** (promote settled rubble into `_top`
  so the layer above gains solid support). Already implemented at
  `js/voxelsim.js:2499`; writing it again is a no-op. Its target population
  (`_looseSup`) measured **0** awake bodies for the first 170 sim-seconds and 4
  of 330 at 190 s. The RCA header has been corrected accordingly.
- **Bound the population** with a finite `debrisCap`/`contactBudget` for the
  validator. Breaks the invariant that the validator gates untiered default
  physics, and makes a device-tier lever decide what leaves the simulation.
- **Optimise the hot walks.** A constant factor against an unbounded population.
  `_supportBelow` is expensive precisely because most of its callers should not
  exist.
- **Relax the `_inContact` penetration threshold** from 0.05. Would treat a
  0.1588 m wedge as contact-free for every body, including ones genuinely
  mid-collapse, and re-open the frozen-overlap failure the gate was built for.
  The latch keeps the threshold and adds evidence instead.

## Consequences

**Output is unchanged on the ranked route.** Measured A/B on the ranked Chicago
run (`run90`, `RANKED_TUNE`, 5,400 ticks) across **eight** input trajectories,
each byte-identical between the arms: `mass` (to six decimals), `eatenCount`,
`size` and `bestCombo` match exactly on all eight. **`RANKED_SIM_VERSION`
therefore does not bump**, and stored traces stay valid. This was derived, not
assumed, and eight routes rather than one because the internal awake population
*does* diverge (131 → 32 on the shipping route) — equality on a single trace
would have been a property of that trace. The residual risk and the mechanism
are stated in the design doc §5.

**Existing gates are unaffected.** Every validator section except `cambridge`
(which cannot complete on HEAD) exits 0 on both arms with no threshold moved and
`SIZE` unchanged in every scene; free-run excursion telemetry moves by under 2%.
The full validator, `cambridge` included, completes for the first time.

`_looseSup` remains the guard that keeps
[RCA-2026-08-11 skyscraper-launch](../findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md)
closed: the new path is strictly more conservative than the walk's own sleep
path, since it requires everything that path requires plus 30 steps of proven
stillness, and it records the same grounded-snap support value `_capDebris`
records rather than a `_topAt` column maximum.

`_budgetHold` bodies are excluded by construction. They are skipped by
integration entirely, so they satisfy "did not move" trivially; retiring them
would let a phone's contact budget decide what leaves the sim and diverge it
from a desktop's.

Full measurement record, census tables, the `JAM_STEPS` sweep and the traced
fixed point:
[03 — Technical design: T-402](../features/timed-runs-and-full-clear/03-technical-design.md).
Root cause of record:
[RCA-2026-08-11 cambridge-validator-stall](../findings/RCA-2026-08-11-cambridge-validator-stall.md)
(as corrected — its §2.2 mechanism and §5 fix did not survive measurement).
