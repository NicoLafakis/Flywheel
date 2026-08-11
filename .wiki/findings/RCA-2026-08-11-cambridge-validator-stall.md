# RCA: validateCambridge never completes — the 780 s excursion hits superlinear debris churn

- **Date:** 2026-08-11
- **Status:** **Diagnosed, not fixed.** No code was changed for this finding. The mechanism is an engine characteristic (awake-debris population grows without bound during sustained eating on the untiered default physics), and every candidate small fix either only buys a constant factor or changes physics underneath the validator's determinism gates — see §5. The full validator therefore does NOT currently run end-to-end; `tools/chicago-probe.mjs` and the other fast selftests remain the working gates.
- **Reporter:** two consecutive `node tools/validate.mjs` runs (2026-08-10 and 2026-08-11) went silent for >1 h after the `cambridge district density` line and had to be killed.
- **Severity:** High for the toolchain (the shared validator is unusable end-to-end, so nothing behind Cambridge in the call order — including the new `validateChicago` — ever runs in a full pass). Latent Medium for the product: the same mechanism predicts a progressive slowdown in a long uninterrupted Cambridge session on the highest device tier (see §6).
- **Investigator:** headless instrumented reproduction + V8 CPU profile; numbers below are from this session's runs.

## 1. Symptom

`tools/validate.mjs` prints `cambridge district density: 15 district(s), median 3.52 ...` and then nothing, for over an hour, twice on two different days. Every other scene's section completes in seconds to a couple of minutes. The killed process (PID 125768) had consumed **78 minutes of CPU** and held a **2.33 GB working set** — CPU-bound and memory-heavy, not deadlocked.

The silent phase is the **deterministic double excursion** (`tools/validate.mjs:1321-1333`): the two probes between the density line and the excursion (`probeHeroIdentity`, `probeIdleStability`) print nothing on success and finish in seconds; an instrumented run of the excursion alone reproduces the stall.

## 2. Root cause

**Confidence: confirmed** (reproduced headless with per-10-sim-second instrumentation, hot functions identified by CPU profile, kill-time process stats consistent).

The validator is not hung. It is executing a simulation whose **per-step cost grows superlinearly with elapsed route time**, on a route ~6-26x longer than any other scene's:

1. **Cambridge's excursion is uniquely long.** It drives the scene's own exported `CAMBRIDGE_ROUTE`, whose final waypoint is `until: 780` (`js/voxelscene-cambridge.js:2866`) — 46,800 steps, **run twice** for the determinism gate = 93,600 steps. Every other scene's excursion is 30-135 s (Boston 56 s, Chicago 135 s, Manhattan district legs 30-39 s). Cambridge was the first scene to export its route and have the validator drive it (`tools/validate.mjs:1277-1281`); nobody re-derived what 780 s of continuous eating does to the debris population.

2. **The awake-debris population never drains during sustained eating.** Debris resting on other debris is deliberately never marked `_wantSleep` (`js/voxelsim.js:2436-2441`: "the walk never marks it `_wantSleep` ... so the cap cannot retire it") — a sleeper recorded on loose support would hang in the sky when the support rolls away. On a route that plows fresh structures for 13 minutes, collapses outrun settling and the awake set grows monotonically: measured 16 awake bodies at simT=10 s, ~350 at simT=250 s, **738 at simT=320 s**, still rising.

3. **Per-step cost is proportional to (awake bodies) x (pile size), so total cost is roughly quadratic in route progress.** CPU profile over simT 0-280 s: `_supportBelow` **~32%** (per awake body per step it walks each footprint column DOWN cell-by-cell through the fine grid — cost grows with body altitude, i.e. with pile height), `_stepDebris` self 19%, `_resolveDebrisContacts` 16% (pair relaxation plus bucket walks against the ever-taller sleeper columns), `_contact` 9%, `_resolveStaticContacts`/`_pushAxis`/`_separate` ~12% combined.

4. **The levers that bound this in the shipped game are deliberately absent in the validator.** `debrisCap`/`contactBudget`/`contactRounds` are the device-tier levers and default to Infinity precisely so "`tools/validate.mjs` never sees a tier at all" (`js/voxelsim.js:417-426`). The validator runs the one configuration with no bound on the churning population.

## 3. The numbers

Instrumented excursion (`seed 'validator'`, scene `cambridge`, exact validator drive loop), wall time per 10 sim-seconds:

| simT | wall for that 10 s | awake (`_falling`) | eaten | SIZE | heap |
|---|---|---|---|---|---|
| 10 s | 0.12 s | 16 | 49 | 1 | 355 MB |
| 100 s | 1.3 s | 98 | 322 | 1 | 419 MB |
| 200 s | 7.1 s | 335 | 1035 | 3 | 373 MB |
| 270 s | 10.2 s | 385 | 1871 | 4 | 747 MB |
| **280 s** | **66.8 s** | 541 | 2081 | 5 | 606 MB |
| 300 s | 34.1 s | 587 | 2451 | 6 | 1039 MB |
| 310 s | 40.5 s | 617 | 2557 | 6 | **1274 MB** |
| 320 s | 57.9 s | 738 | 2979 | 7 | 530 MB (post-GC) |

The cliff at simT 270-280 is the hole crossing SIZE 4→5: it starts undermining whole large masses at once, awake debris jumps 385→541 inside 10 sim-seconds, and one 10-sim-second window costs 67 wall-seconds.

Projection: at simT=320 s the run is 41% through excursion A after 5.3 wall-minutes, with the marginal rate ~4-6 wall-seconds per sim-second and still climbing alongside the debris count. The remaining 460 sim-seconds at SIZE 7 (the biggest collapses on the route: the mill, University Park, MIT main group all lie ahead) put a single excursion in the **1-2+ hour** range, and the validator runs it **twice**. That matches both observed stalls and the killed process's 78 CPU-minutes.

Memory: the ~GB working set is the churn's transient state (contact buckets, wake/sleep sets, GC pressure at 1.2 GB peaks), not a leak — heap sawtooths back down after collections.

## 4. Causal chain

- **Trigger:** `validateCambridge` reaches the double excursion and steps a fresh sim along the scene's 780 s route.
- **Proximate cause:** from ~simT 180 s on, each sim-second costs seconds of wall time; the phase's total is hours, not minutes. No print happens until the excursion finishes, so the run looks hung.
- **Root cause:** per-step debris cost scales with an awake population that sustained eating grows without bound (rubble-on-rubble never sleeps, by design), and the validator runs the only untiered (unbounded) physics configuration over the only 13-minute route.
- **Contributing factors:** `_supportBelow`'s per-cell downward column walk makes each awake body more expensive as piles grow taller; the route was exported and adopted for district-density measurement (a geometry concern) without a cost budget for the excursion reuse (a physics concern); success-silent probes hide which phase is running.

## 5. Why no fix landed with this RCA

- **Bounding the population** (finite `contactBudget`/`debrisCap` for the validator's Cambridge sim) is one line, but violates the documented invariant that the validator gates the untiered default physics (`js/voxelsim.js:420-422`) and changes the excursion's eaten/SIZE numbers under the existing gates.
- **Optimizing the hot walks** (`_supportBelow` skip-lists, cached column tops) buys a constant factor against a population that grows without bound — the excursion still lands in tens of minutes and keeps degrading.
- **The real fix is engine-level debris retirement**: let piles solidify bottom-up (promote settled rubble into the heightmap/`_top` so the layer above gains SOLID support and can sleep), which retires the rubble-on-rubble population instead of exempting it from sleep. That dissolves both the validator stall and the §6 gameplay risk, but it is a physics-semantics change touching sleep/wake, `_capDebris`, and the support probes — it needs its own design-and-regression pass, not a drive-by inside a diagnosis task.
- **Interim option for whoever needs a full validator pass now:** progress prints inside the excursion (cheap, honest) plus a shorter validator-owned excursion budget would be a policy change to what the gate measures — deliberately left as a decision for the fix, not smuggled in here.

## 6. Player-facing implication

On the highest device tier (the only tier with `contactBudget: Infinity`), a player who plows Cambridge continuously reproduces this curve in real time: the same 5+ minutes of sustained eating that cost the validator its cliff would drag the frame rate down progressively as awake debris accumulates. Lower tiers are protected by the finite contact budget (`js/quality.js`). Nobody has reported it because a real session pauses, wanders, and lets piles settle — the scripted excursion is the worst case: 13 minutes of uninterrupted maximal eating. The §5 engine fix removes the risk for real players too.

## 7. Reproduction

```
node <harness>  # construct VoxelSandboxSim({ seed: 'validator', scene: 'cambridge' }),
                # drive CAMBRIDGE_ROUTE exactly as tools/validate.mjs:1321-1330 does,
                # log wall time + _falling.length every 600 steps
```

Any run reproduces the table in §3 deterministically (same seed, same route). A V8 profile (`node --cpu-prof`) over the first 280 sim-seconds shows the §2.3 distribution.
