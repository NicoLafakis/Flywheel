# 03 — Technical design: T-402, the debris drain

> **Status: IMPLEMENTED and measured.** The decision this document argues for is
> recorded as
> [ADR-0018](../../adr/0018-debris-retires-on-proven-stationarity.md); the
> measured results are in §10. Every number here was taken on this tree —
> BEFORE on `862fdec` unmodified, AFTER on the same box with the same seed,
> route and command.
>
> **Scope.** T-402 only — the one engine defect behind both the
> `validateCambridge` stall
> ([RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md))
> and T-901's ~4x mobile shortfall
> ([finding](../../findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md)).
> T-403 (audit split), T-404 (map snapshots) and T-405 are out of scope here.

---

## 1. The measurement that redirected this work

[RCA-2026-08-11 cambridge-validator-stall](../../findings/RCA-2026-08-11-cambridge-validator-stall.md)
**as corrected** carries the record: its original §2.2 mechanism (the sleep
exemption for debris resting on other debris) and its §5 fix (promote settled
rubble into `_top` so the layer above gains solid support) did not survive
measurement. The correction is stated there and is not restated here.

What belongs here is the evidence that produced it. Instrumenting the
validator's own Cambridge drive loop and counting the awake set by *why* each
body is awake:

| simT | awake | grounded on LOOSE support (`_looseSup`) | grounded on SOLID | airborne |
|---|---|---|---|---|
| 60 s | 58 | **0** | 56 | 2 |
| 120 s | 101 | **0** | 80 | 21 |
| 170 s | 135 | **0** | 111 | 24 |
| 190 s | 330 | **4** | 273 | 53 |

The rubble-on-rubble population the RCA names is *zero* for the first 170
seconds and 4 bodies out of 330 at 190 s. It is not what is growing.

## 2. What is actually growing: jammed bodies the sleep gate refuses to retire

**Root cause (confirmed, reproduced, fixed-point verified).**

A block wedged between an immovable partner (a sleeper, or a standing structure
block) and another awake block reaches a **geometric fixed point**. Within one
step the alternating pair/obstacle separations converge geometrically — traced
on block `13655`, every step, identical values:

```
sep 13655<-13658 movO=true  pen=0.1588  stamped=true    (awake partner)
sep 13655<-13653 movO=false pen=0.0809  stamped=true    (sleeper)
sep 13655<-13658 movO=true  pen=0.0793  stamped=true
sep 13655<-13653 movO=false pen=0.0388  stamped=false
sep 13655<-13658 movO=true  pen=0.0380  stamped=false
...                                     → net displacement 0.0000
```

The next step reproduces that sequence bit for bit. Over 60 consecutive steps
the first penetration of each step changes by at most **8.88e-16** (one ULP) and
the body moves less than **1 mm** on every axis.

Because that first penetration is `0.1588 > 0.05`, `_separate` stamps
`b._inContact = true` (`js/voxelsim.js:2807-2810`) on **every** step, and the
sleep commit refuses any block carrying it (`js/voxelsim.js:2489`). So the block
is:

- stationary (velocity at rest, position invariant to 1 mm),
- `_grounded` on a **solid** support (`_looseSup === false`),
- doing no physical work whatsoever,
- and structurally incapable of ever being retired.

**Census at simT 120 s, observed over 60 consecutive steps** (a body counts as
jammed only if it was `_inContact` on *every* one of the 60 steps and never
moved more than 1 mm):

| | count | share |
|---|---|---|
| awake bodies, all still awake 60 steps later | 101 | 100% |
| **JAMMED — permanent contact, zero motion** | **78** | **77%** |
| churning — permanent contact, but moving | 4 | 4% |
| free — contact-free at least once, so drainable | 19 | 19% |

Each jammed body then pays `_contact` + `_topAt`/`_supportBelow` +
`_resolveStaticContacts` + a pair-relaxation slot, every step, forever. That is
the superlinear curve: the population is a monotonically accumulating set of
wedges, one per collapse that leaves a block pinched, and nothing in the engine
can ever remove one.

**The gate's own premise is already false for this population.** The
`_inContact` guard exists because *"a block frozen mid-overlap can never
separate"* (`js/voxelsim.js:2550-2552`). Measured: these overlaps are not
separating anyway — they are stationary fixed points. Freezing them changes
nothing except cost.

## 3. The fix: retire on proven stationarity, not on contact-freedom

A **stationarity latch** on the existing sleep path (`_latchJammed`, called from
`step` immediately after `_resolveDebrisContacts`). No new sleep registration, no
new support representation, no change to the wake paths. Decision of record:
[ADR-0018](../../adr/0018-debris-retires-on-proven-stationarity.md).

**The promotion criterion — what counts as "settled".** A body becomes
sleep-eligible when it satisfies *all* of:

1. `_grounded` — `b.y` was snapped to `support + sy/2` in this step's walk, so
   the support is one the block is physically touching, not one probed for.
2. `!_looseSup` — the support is a heightmap/static surface, never another
   awake body. **This is the guard that keeps
   [RCA-2026-08-11 skyscraper-launch-and-hanging-debris](../../findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md)
   closed**, and it is the identical condition `_capDebris` already applies at
   `js/voxelsim.js:2567`. See §4.
3. Speed below the existing repose threshold (`v² < 0.06`) — the number the
   current sleep path already uses (`js/voxelsim.js:2468`). No new constant.
4. **Position invariant for `JAM_STEPS` consecutive steps** — max per-axis
   displacement below `1e-3` m. Proposal: `JAM_STEPS = 30` (0.5 s at 60 Hz).
   This is the new part, and it is what makes "settled" a *measured* property
   instead of an inferred one: the solver has had 30 consecutive opportunities
   to move the body and has not.
5. **Not `_budgetHold`.** Parked bodies are skipped by integration entirely
   (`js/voxelsim.js:2352`), so they satisfy "did not move" trivially and by
   construction. Excluding them is mandatory: without it the device-tier
   contact budget silently becomes a retirement mechanism, and a phone's sim
   would diverge from a desktop's — including THE RUN, whose frozen
   `RANKED_TUNE` carries `contactBudget: 200`.

A body meeting all five sleeps through the **existing** commit path with
`_sleepSupport = b.y - b.sy / 2` — the same value `_capDebris` records
(`js/voxelsim.js:2584`), for the same stated reason: grounded means `b.y` was
snapped to its support this step, so no probe can disagree with it.

**Why a pile that is still moving cannot be promoted.** Criterion 4 is a
per-step position comparison, not a velocity read. A body being shuffled by its
neighbours has a non-zero displacement even when its velocity samples near zero
between pushes, so the latch resets. A body still receiving *net* separation —
the "churning" 4% above — never accumulates 30 steps. Only a fixed point does.

**Why it is visually a no-op.** The sleep commit runs after
`_resolveDebrisContacts`, so the frozen pose is the post-solve pose — exactly
the position the renderer already draws for that body this frame. Nothing moves
at the moment of retirement.

**The latch must NOT skip a body whose `_wantSleep` is already set.** Recorded
because the first implementation did, and it read as harmless housekeeping. The
sleep walk sets `_wantSleep` on exactly this population every step — grounded,
on solid support, below the repose speed — and the commit then discards it on
`_inContact`. That pair *is* the defect, so `!_wantSleep` is never true for a
jammed body and the gate made the whole path a measured no-op: awake held at 100
at 120 s (HEAD: 101) while 79 bodies counted toward a threshold they were never
allowed to act on. Removing the gate took the same measurement to 21.
`js/voxelsim.drain.test.mjs` pins it with a body whose flag is pre-set.

## 4. How the hang-in-the-sky failure cannot come back

That failure ([RCA-2026-08-11 skyscraper-launch](../../findings/RCA-2026-08-11-skyscraper-launch-and-hanging-debris.md),
closed by `235c82d`, tightened by `57d0652`) had one mechanism: a sleeper whose
recorded support was a **loose** body has no wake path, because awake blocks
live in neither `_top` nor `_sleepObs`, so `_consume` / `_unsleep` / `_topRemove`
all miss it and the sleeper hangs when its support rolls away.

This design cannot reintroduce it, for four independent reasons:

1. **Criterion 2 forbids it outright.** `_looseSup` bodies are excluded, which is
   the exact guard `57d0652` added to `_capDebris` for this exact failure. The
   new path is *strictly more* conservative than the walk's own sleep path,
   because it additionally requires 30 steps of proven stillness.
2. **The recorded support is unchanged.** `b.y - b.sy/2` after a grounded snap —
   not a `_topAt` column maximum, which is what produced the original bug.
3. **The wake paths are untouched.** Registration still goes through
   `_topAdd` + `_sleepers` + `_sleepObsAdd`, so `_topRemove` still wakes the
   sleeper when the surface under it is removed or eaten, and
   `_wakeRestingUnderHoles` still reaches retired rubble under a hole.
4. **A regression test pins it** (§7): no sleeping body may have `restTop` above
   its own `_supportBelow`, asserted over a full collapse.

## 5. The `sim_version` question, derived

`RANKED_SIM_VERSION` (`js/voxelsim.js`) gates stored trace validity and server
replay (`api/_verify.mjs`). A bump invalidates every stored trace, so it is not
a free precaution — and "probably fine" is not an answer either. The question
was settled by measurement, not by argument. See §10.3.

**Result: no digit moves, across eight independent ranked trajectories.
`RANKED_SIM_VERSION` stays at 1.**

**Why that is not a coincidence.** A retired body is registered into `_top` at
the pose it already occupied, and the latch's whole job is to prove that pose is
the one the body was going to hold anyway. To `_consume`, a retired body and a
jammed awake body present identical geometry; and the wake paths are untouched,
so `_topRemove` and `_wakeRestingUnderHoles` still revive it the moment the hole
reaches it. Retirement moves a body between two bookkeeping sets that the
scoring path does not read.

**What that argument does not cover, stated plainly.** The internal state *does*
diverge — awake-at-end differs on all eight variants (e.g. 131 → 32) — so the
equality rests on the wake paths being complete, not on the two trees computing
identical state. Eight trajectories exercising those paths is evidence, not
proof. The window for a cheap bump is still open (one run on the board, zero
claimed names) if the owner would rather buy the insurance than hold the
evidence.

## 6. Measurement

The instrument is the validator's own Cambridge drive loop, one row per 10 sim
seconds: wall time for that window, awake population split by reason, retired
count, eaten, SIZE, heap. The RCA's §3 table is the shape; its *numbers* are not
a comparison target — they were taken on a different tree. **The instrument was
validated before it was trusted**: on this tree the BEFORE curve reproduces the
RCA's §3 shape at matching sim times (541 awake / 2081 retired / SIZE 5 at 280 s
against the RCA's 66.8 s vs a measured 63.26 s for that window).

- **BEFORE**: `862fdec`, this tree, unmodified, 400 sim-seconds.
- **AFTER**: same command, same seed, same route, same box, at each of
  `JAM_STEPS` ∈ {10, 30, 60}, run **sequentially** so the box holds one job at a
  time and the wall-clock column stays honest.
- **Both arms were driven by the same script**, selected by `--root`, against a
  HEAD control extracted with `git archive HEAD` into a scratchpad — so the A/B
  is structural rather than a before-and-after in one moving tree.

Results in §10.

## 7. Regression coverage (`js/voxelsim.drain.test.mjs`)

Fast headless tests, in the style of `js/voxelsim.gravity.test.mjs`: eleven
assertions covering the latch's refusals (drift, sub-epsilon creep, `_budgetHold`,
loose support, a stale `_groundT`, speed, and the pre-set `_wantSleep` no-op
trap), plus three end-to-end properties on the route the defect was measured on
— the settled-awake population drains, every sleeper sits on ground/static/another
sleeper, and no parked body ever sleeps.

**Every one of them was run against a deliberately broken tree before it was
trusted.** Ten breaks, ten caught, none uncovered — §10.4.

## 8. Alternatives rejected

- **Bound the population** (finite `debrisCap`/`contactBudget` for the
  validator). Violates the documented invariant that the validator gates
  untiered default physics (`js/voxelsim.js:420-422`), and changes the
  excursion's numbers under the existing gates. Rejected by RCA §5; still right.
- **Optimise the hot walks** (`_supportBelow` skip-lists, cached column tops).
  Buys a constant factor against a population that grows without bound.
  `_supportBelow` is ~32% of CPU precisely *because* 77% of the bodies calling
  it should not exist. Fix the population, then re-profile.
- **Build the RCA's bottom-up promotion.** Already implemented
  (`js/voxelsim.js:2499`), and its target population is ~1% here. §1.
- **Relax the `_inContact` threshold** from 0.05 to something larger. Treats a
  0.1588 m wedge as "not in contact" for every body, including ones genuinely
  mid-collapse, and re-opens the frozen-overlap failure the gate was built for.
  The stationarity latch keeps the threshold and adds evidence instead.

## 9. The two open questions, answered

- **Does the `_looseSup` population become the binding constraint once jams
  retire?** **No.** Measured across all four arms to 400 sim-seconds it never
  exceeds **9 bodies**, and the fixed arms are not systematically above HEAD
  (at 400 s: HEAD 6, jam10 6, jam30 7, jam60 8). Rubble-on-rubble is not the
  next bottleneck, and the RCA's proposed fix would still have nothing to bite
  on. No follow-up task.
- **Is `JAM_STEPS = 30` the right constant?** It is not on a knife edge — see
  §10.2. All three swept values fix the defect and land within ~30% of each
  other, in an order that is not monotonic in `JAM_STEPS`, which is the signal
  that the differences between them are trajectory divergence rather than the
  constant. 30 is kept: it is the most conservative value with no measured cost
  against 10, and it demands three times as much evidence before freezing a
  body.

## 10. Results

### 10.1 The drain, BEFORE vs AFTER

Cambridge, `seed: 'validator'`, the scene's own scripted route, 400 sim-seconds,
one row per 10. `awake` is the whole awake set; `onSolid` is the settled
population this fix targets.

| simT | BEFORE awake/onSolid | jam10 | jam30 | jam60 |
|---|---|---|---|---|
| 40 s | 45 / 45 | 5 / 5 | 0 / 0 | 0 / 0 |
| 80 s | 92 / 76 | 19 / 5 | 16 / 1 | 18 / 2 |
| 120 s | 101 / 80 | 24 / 5 | 21 / 1 | 23 / 2 |
| 160 s | 127 / 105 | 25 / 5 | 22 / 1 | 24 / 2 |
| 200 s | 335 / 279 | 66 / 21 | 62 / 11 | 73 / 18 |
| 240 s | 343 / 287 | 69 / 23 | 67 / 16 | 73 / 18 |
| 280 s | 541 / 387 | 174 / 59 | 217 / 75 | 235 / 77 |
| 320 s | 738 / 540 | 212 / 96 | 253 / 105 | 277 / 123 |
| 360 s | 807 / 612 | 200 / 92 | 248 / 104 | 257 / 99 |
| **400 s** | **832 / 633** | **202 / 91** | **256 / 107** | **265 / 113** |

HEAD's settled population climbs monotonically, 45 → 633, and is still climbing
at 400 s. Every fixed arm holds it near zero for the first 160 seconds and ends
5–7x lower. That is the accumulating wedge set, drained.

### 10.2 The `JAM_STEPS` sweep, all three

| arm | wall for 400 sim-s | eaten | SIZE | mass | bestChain | retired |
|---|---|---|---|---|---|---|
| BEFORE (HEAD) | **964.4 s** | 5507 | 8 | 16728.931 | 456 | 2483 |
| `JAM_STEPS = 10` | 327.3 s | 5498 | 8 | 16442.281 | 444 | 3124 |
| **`JAM_STEPS = 30`** | **526.8 s** | 5551 | 8 | 17135.034 | 462 | 3113 |
| `JAM_STEPS = 60` | 478.5 s | 5545 | 8 | 17879.586 | 547 | 3028 |

Reported in full including the dull parts, because a threshold shown without its
neighbours is a magic number.

**What the wall column does and does not license.** BEFORE → any fixed arm is a
real 1.8–2.9x, and the AFTER arms did *more* work for it (jam30 ate 5551 blocks
to HEAD's 5507 and reached higher mass). Between the three fixed arms it
licenses nothing: 60 came in faster than 30, which cannot be a `JAM_STEPS`
effect. Two reasons, both recorded rather than argued away. The arms diverge
into materially different runs within the first ten seconds — different `eaten`,
different `bestChain` — so past that point they are not doing the same work.
And the box was not idle: three Next.js dev servers belonging to an unrelated
project were resident throughout, from before the BEFORE curve started until
after the last sweep arm finished (~2% average CPU between them). They were
present in **every** arm equally, so the A/B is not biased — but they are a real
reason the fixed arms do not order cleanly among themselves, and a reason not to
quote any single wall number to more than one significant figure.

The population column is the comparable one: it is deterministic, identical
input drives it, and background load cannot move it.

### 10.3 Does a ranked score move? Eight trajectories, both arms

Chicago, `mode: 'run90'`, `RANKED_TUNE` asserted installed, `RANKED_TICK_COUNT`
5,400, HEAD extracted with `git archive`. Each variant offsets every waypoint by
a fixed vector, so the trajectories differ materially while both arms see
byte-identical input. One route would not have been enough: the internal state
provably diverges, so equality on a single trace is a property of that trace.

| variant | offset | mass (both arms) | eaten | SIZE | chain | awake at end HEAD → fixed |
|---|---|---|---|---|---|---|
| 0 | — | 2221.507813 | 666 | 4 | 193 | 131 → 32 |
| 1 | +6, 0 | 709.570312 | 392 | 3 | 201 | 102 → 13 |
| 2 | −6, 0 | 1229.851562 | 457 | 3 | 183 | 124 → 28 |
| 3 | 0, +6 | 77.182813 | 178 | 1 | 53 | 62 → 23 |
| 4 | 0, −6 | 132.260938 | 114 | 2 | 38 | 38 → 4 |
| 5 | +4, +4 | 109.850000 | 127 | 1 | 44 | 56 → 15 |
| 6 | −4, −4 | 22.429688 | 11 | 1 | 5 | 20 → 1 |
| 7 | +8, −3 | 84.017188 | 100 | 2 | 39 | 37 → 0 |

**Thirty-two output numbers, thirty-two exact matches** — `mass` to six decimal
places. The awake column is the only thing that moves, and nothing scored reads
it. `RANKED_SIM_VERSION` stays at 1; §5 records the mechanism and the residual
risk.

### 10.4 Break-and-verify: ten breaks, ten caught

Each case copies the working tree, applies exactly one surgical break (asserted
to have edited exactly one line — a drifted pattern would otherwise produce an
unmodified tree, pass, and report as a false coverage gap), and runs the suite.

| break | caught by |
|---|---|
| HEAD, untouched | `_latchJammed` absent; 56 settled bodies still awake |
| `_latchJammed()` never called | 56 settled bodies still awake |
| latch gated on `!_wantSleep` | the pre-set-flag test, **and** the drain test |
| `_budgetHold` guard dropped | a parked body latched |
| `_looseSup` guard dropped | a body on loose support latched |
| `_groundT` staleness guard dropped | a stale grounded claim latched |
| drift measured step-to-step | 0.2 mm/step creep latched |
| `JAM_EPS` 1e-3 → 1.0 | 2 mm/step drift latched |
| `JAM_STEPS` 30 → 1 | latched at step 1, expected exactly 30 |
| contact gate opened for **every** body | 13 sleepers frozen on support that is neither ground, static, nor another sleeper |

The last row is the one worth keeping: the suite catches the *over*-permissive
direction too, not only the under-permissive one. A test set that only proves
"more bodies sleep now" would have passed a tree that freezes debris in mid-air.

### 10.5 Every existing gate still passes

`FW_VALIDATE_SECTIONS` covering every section except `cambridge` (which cannot
complete on HEAD — that is the defect), run on both arms:

- **Both arms exit 0.** No gate threshold moves. `SIZE` is unchanged in every
  scene, and every `eaten >= 300` / `size >= N` floor still clears.
- Free-run excursion telemetry moves by under 2%, as expected of a physics
  change: manhattan `eaten` 1535 → 1563 and `score` 23175 → 23494; upper
  manhattan 778 → 781 / 6030 → 6075; brooklyn 722 → 717 / 6397 → 6337; boston
  1345 → 1341 / 12957 → 12890; voxel sandbox `score` 19149 → 19147.
- **Chicago's excursion line is byte-identical between the arms**, which
  independently corroborates §10.3 on the ranked city.

No validator expectation needed re-baselining.
