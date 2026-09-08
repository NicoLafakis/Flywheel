# Collision grid performance remediation — 2026-09-08

Status: final automated validation passed (31 groups, 1867.0 s). Physical-phone performance acceptance remains unresolved.

The old “Singapore is the only city over budget” report covered 11 cities.
The current catalog has 24. Three round-robin runs of the growing-hole hero
attack found average step-budget misses in Paris, Singapore and Auckland.
These measurements are from this Windows workstation, not a physical phone.

| Growing-hole workload | Before, median of run averages | Numeric grid | Indexed support scan | Final per-step p95 |
|---|---:|---:|---:|---:|
| Singapore | 24.36 ms | 18.35 ms | 13.98 ms | 21.52 ms |
| Paris | 25.64 ms | 20.63 ms | 17.18 ms | 28.33 ms |
| Auckland | 17.32 ms | 14.95 ms | 12.30 ms | 17.91 ms |

The target is 16.67 ms for the **whole frame**, including rendering. Singapore's
average simulation cost is improved by about 43%, but its p95 still exceeds
that total-frame budget. Paris still exceeds it on average. This is not a
claim of sustained 60 FPS or a closed physical-phone performance issue.

## Evidence and method

`tools/pw/hero-attack-perf.mjs`, seed `perf`, initial SIZE 11, 60 settling
steps followed by 200 measured steps, three round-robin repetitions. The
hole attacks the ground-footprint centroid of each city's largest component.
`FW_PERF_GROW=1` permits gameplay growth; the unset mode pins SIZE and must be
reported separately. Per-step median/p95/max and a ten-second post-attack
settlement observation are now emitted as `PERF_JSON`, with tested labels
and percentile calculations. A growing-mode run no longer says “pinned”.

Raw logs are local verification artifacts under `tools/pw/_remediation-*.log`.
The initial baseline's awake-count field accidentally included consumed
blocks; that field is invalid and is not used here. `countAwake()` now counts
only falling, non-sleeping bodies, with an explicit consumed-body regression.
The timings above were unaffected by that reporting error. Final post-attack
Singapore observation: 10 awake bodies, approximately 0.44 ms per step.

A V8 CPU profile of the original Singapore workload attributed about 2.23 s
to `_supportBelow`, 1.54 s to `_stepDebris`, 1.13 s to `_contact`, and 0.99 s
to pair contacts, versus 0.21 s to `_recalcSupport`. This supports optimizing
collision queries before rewriting structural-support propagation.

## Resulting implementation

`VoxelGrid` uses exact numeric fine-cell keys internally, preserving the
string-key interface used by authoring tools. Out-of-range coordinates fall
back to strings without wrapping or aliasing. Occupied vertical cells are
lazily coalesced into owner runs. Support queries skip air and repeated
ownership while preserving the original downward scan's selection order;
they inspect block state live and invalidate a column on ownership edits.

No geometry, physics coefficients, scoring rules, or ranked version changed.
The string-grid and original support algorithm remain independent test
oracles in `tools/grid-sim-parity.test.mjs`; real collapse snapshots include
block state, movement, score, holes and events. Boundary tests also exercise
negative coordinates, packing limits, float thresholds, state changes and
cell deletion. A within-step answer cache was measured, gave no material
benefit, and was removed.

## Remaining verification

- All 24 cities pass legacy collapse parity; the final validator passed all 31 groups in 1867.0 s.
- Rerun all 24 cities in pinned and growing modes on the final revision.
- Rendered mobile-emulation measurements are recorded below; the 60 FPS target remains unmet.
- Keep physical-device performance explicitly unverified until measured.

## Rendered mobile emulation (2026-09-08)

Real deployed scene viewer, Singapore hero attack, starting SIZE 11 and natural
size growth; 60 settling frames followed by 200 measured frames. Each frame
executes a 1/60 simulation step and the real world update/render. Three
alternating baseline/final pairs used Chrome with ANGLE D3D11 on an NVIDIA
GeForce RTX 4060 Ti, a 390x844 touch viewport, DPR2 and CDP 4x CPU throttling.
This is a synthetic workstation condition, not calibrated physical-phone data.
A full-validator worker was active during both versions; no other simulation
benchmark ran concurrently. The first pair also overlapped a short viewer
smoke check and the tail of the ranked status-polling browser session.

| Pair | Baseline frame median / p95 | Final frame median / p95 |
|---|---:|---:|
| 1 | 202.6 / 391.3 ms | 114.9 / 161.8 ms |
| 2 | 144.2 / 290.9 ms | 75.5 / 104.7 ms |
| 3 | 146.5 / 273.2 ms | 76.3 / 106.8 ms |

The median of frame medians falls 48%, from 146.5 to 76.3 ms. Simulation medians
fall from 134.0 to 62.7 ms. Both still exceed the 16.67 ms target substantially.
The workload window consumed 2,549-2,550 blocks and ended at SIZE 14; small setup
and screenshot timing differences mean this rendered measurement is not the
exact parity oracle. The separate deterministic all-city test proves parity.

Baseline deployment: `flywheel-m4reku9yx`; final: `flywheel-1w7bmvlek`.
Screenshots and raw JSON are in `tools/pw/_remediation/mobile-*.png` and
`mobile-perf.json`. Screenshots were inspected. Both versions report seven
partner-logo 404s because the development viewer resolves relative assets
under `/tools/assets/`; the first also reports a favicon 404. No JavaScript
exceptions or failed network transports occurred. These asset errors are a
viewer limitation, not a clean-browser pass. The actual root-game ranked run
recorded no console errors or failed requests.

The viewer uses the uncapped default simulation tune and one step per frame.
The shipped game applies the phone's LOW graphics default and its fixed-step
accumulator; a separate root-game check is needed to characterize that path.
The viewer result is a rendered stress measurement, not a substitute for it.

## All-city measurement data

The [machine-readable measurements](2026-09-08-collision-benchmarks.json)
contain all24 cities in both modes, before and after, with timing percentiles
and final awake/settlement observations. The CPU is an AMD Ryzen7 8700G
(8 cores,16 logical processors). Runs were sequential, but a validator worker
overlapped the final growing run and part of the final pinned run. These
conditions limit small before/after comparisons; the repeated rendered pairs
and dedicated three-city run provide additional evidence.

The final all-city growing run measured Singapore19.04ms and Paris17.86ms
(medians of run averages), with p95 values27.25ms and29.31ms. These differ
from the earlier quieter three-city run above. Both measurements are retained;
there is no claim that Singapore meets the whole-frame budget.

## Actual LOW-quality game path and correctness repair

The actual mobile game exposed a deferred-support defect: a stationary hole
could lose its pending coverage update under `supportEvery: 2`, so the hero
never collapsed. Its initial near-60FPS idle measurements are discarded.
The pending update now drains on the scheduled tick; default/ranked interval 1
behavior is unchanged. The automated stationary reproduction went from 0 to
2470 consumed blocks.

Updated preview: `https://flywheel-azk45ktwb-nicos-projects-896b6ff8.vercel.app`.
A real root-game check used the same 390x844/DPR2/4x CPU profile, actual LOW
settings (debrisCap 350,contactBudget 250,one contact round,supportEvery 2),
the normal fixed-step accumulator, camera, HUD and renderer. It required
actual destruction, completed 200 measured frames after 60 warmup frames,
consumed 2,493 blocks and reached SIZE 14. Console errors and failed requests
were both empty. The screenshot `mobile-game-fixed.png` was inspected:
13% cleared and a 2,493 chain are visible.

Simulation step median/p95: 37.3/136.3 ms (400 steps). Frame median/p95:
98.4/309.2 ms (200 frames). The main loop executed two simulation steps per
measured frame. Ready/power-up gates were excluded; ordinary rendered frames
were included even when no simulation step occurred. Full validation was
running concurrently, so this is not a quiet-machine acceptance benchmark.
It proves the corrected gameplay flow and an ongoing stress-budget miss;
it does not establish physical-phone performance or close the 60 FPS target.
Raw data: `tools/pw/_remediation/mobile-game-perf.json`.

A later first-solid-column contact candidate was removed after limited
benefit: Singapore 14.19 versus 14.83 ms, Paris 16.45 versus 16.52 ms, Auckland 11.77
versus 13.19 ms in the targeted comparison. The simpler implementation remains;
28,800 legacy-order contact comparisons remain as additional regression
coverage, together with the all-city independent contact oracle.
