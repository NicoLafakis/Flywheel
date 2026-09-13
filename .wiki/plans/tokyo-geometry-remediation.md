# Tokyo geometry, destruction and growth remediation

Status: implementation complete for the Tokyo pilot; sustained frame-stall
and visual acceptance remain open. Other-city rollout is gated.
The physical-device 60 FPS acceptance gate was retired by the owner on
2026-09-13; the phone-matrix requirements below are kept as historical record.
Owner: legacy Flywheel workspace. Tokyo is the pilot; do not convert other cities
or promote over the separate Flywheel-v2 production deployment.

## Accepted outcome

Preserve architectural identity and satisfying breakup using actual floor bays,
columns, walls, roofs and joints rather than arbitrary building slices. Keep
small street food. Reach maximum size around three minutes of a five-minute run.
Target 60 FPS on desktop. The 2019-onward phone matrix (iPhone, Pixel, Galaxy S
and Galaxy A) is retired as an acceptance gate per the owner's 2026-09-13
decision; universal handset performance was never established by a
representative test matrix and is no longer required.

## Implementation

- Tokyo geometry v2 consolidates the existing tower and podium builders inside
  their authored two/three-metre bays and three-metre storeys. Equal adjoining
  faces merge only when material and finish agree; occupied spaces and openings
  are preserved. Other builders, including small props, remain fine grained.
- Piece count: 84,122 to 34,796 (58.6% fewer). Bounds storage uses 39,955 bucket
  entries instead of storing every interior quarter-metre cell. Contact and
  support queries operate on bounds, with an exact cell fallback around inherited
  overlapping authoring. This is not a claim that historical overlaps are fixed.
- Per-face texture repeat preserves authored tile density on larger members in
  the WebGL2 surface-array path. Existing
  shared box geometry/material batching remains the rendering path. New curved
  custom meshes and a general compound-shape renderer are not part of this pass.
- Assemblies identify building boundaries. Fresh chunks cannot join different
  buildings and have a hard 64-member cap. Existing material-joint breakup remains.
- Tokyo fixes its physics tune across graphics tiers: speed 0.55, debris settling
  target 350, contact budget 250, two rounds, support every tick. These are not a
  hard cap on all airborne objects; overflow assembly scheduling remains open if
  the sustained frame-time gate requires it. Uneaten material is never discarded.
- Raw material mass and original base-point value are preserved by consolidation.
  Tokyo retains its authored economy weight, story order and coin rewards;
  displayed piece counts reflect v2 without reclassifying its reward tier.
  Consumption is idempotent in v2. Upper growth thresholds end at 30% material
  clear; after SIZE 8, already-earned growth expands at 0.105 sizes per simulation
  second. No growth is granted without eaten material. This prevents a collapse
  from jumping immediately to maximum size while retaining its reward.
- Geometry v1 remains constructible explicitly for baseline comparison. Other
  cities and the current Chicago ranked rules keep their previous simulation.
  Before extending this version into ranked scenes, add protocol/replay version
  routing and retain support for issued tickets and queued traces.

## Validation and rollout gates

Tests were written and observed failing before implementation. Registered suites
cover occupied-space/material equivalence, small-prop retention, growth and score
conservation, idempotence, bounded storage, support visibility, assembly boundaries,
15,360 directional bounds contacts against the independent legacy oracle, and
three no-power-up calibration drives. Tokyo also passed a 260-tick collapse
comparison using the independent cell-based grid/contact implementation.

Initial paced calibration reached SIZE 24 at 157.20, 187.48 and 157.20 simulation
seconds. These were tuning drives stopped at maximum size, not completed five-minute
acceptance sessions. The full validator also runs all three complete drives.

Remaining release acceptance:

- Validation evidence (release acceptance remains separate from commit/push):
  The 35.3-minute run passed 29/31 groups. Stale help-count and economy-order
  checks were repaired, and both complete failed groups then passed (291.8 s).
  Subsequent camera and HUD changes passed their targeted suites. This combined
  coverage is not a final monolithic ALL PASS run; no implementation commit yet.
  A later full run passed 30/31 groups (2091.6 s), exposing a HUD test double
  missing classList.remove. Only that fixture changed; its four tests passed,
  and the complete core group then passed (172.9 s). All groups now have passing
  coverage across these last two runs, still not a single all-green full run.
  During the user's explicit commit/push request, a redundant full rerun was
  stopped after the user objected to another long validation run. The commit
  uses the existing passing coverage; no additional runtime changes were made.
- Matching whole-city and five-district captures were inspected against the old
  deployed build. This caught texture stretching, now fixed and rechecked. Review
  sustained destruction recordings as part of visual acceptance.
- RETIRED 2026-09-13 (owner decision): three consecutive five-minute
  physical-device sessions, including tornado,
  landmark collapse, simultaneous major power, and recovery. Required anchors:
  iPhone 11/SE 2020/16; Pixel 4a/6a/9; Galaxy S10/A12/A16 5G/S24. Record exact
  chipset/RAM, OS, browser, thermal state and display mode. Safari, Chrome and
  Samsung Internet are separate coverage surfaces.
- RETIRED 2026-09-13 (owner decision): per-scenario phone thresholds
  (average >=59 FPS, p95 frame interval <=18 ms, p99 <=33.4 ms,
  no gameplay stall >100 ms). Desktop throttling cannot substitute for phones.
- Runtime render fallback now observes two-second frame windows and reduces
  resolution/shadows/ambient animation in three bounded steps. Ten seconds of
  recovery restores one step. It changes neither physics nor saved preferences;
  the physical-device gate that would have judged these levers was retired
  2026-09-13.
- Only after Tokyo passes, benchmark the remaining catalog and migrate failing
  cities individually. Keep current production separate.

Evidence is under ignored `tools/pw/_tokyo-remediation/` and `_tokyo-*.log` files.
Three consecutive 300-second hardware-Chrome headless runs averaged 74.16,
72.72 and 71.84 FPS but failed the maximum-stall gate (166, 1121 and 440 ms).
A CPU-profile repeat found most large gaps predominantly idle on the JS thread,
plus a genuine 39 ms simulation burst with 1,023 falling pieces. This does not
identify the cause of the idle gaps. Retiring the legacy overlays did not resolve
them. No claim of sustained 60 FPS acceptance is made from these averages.
The user watched the visible Chrome playthrough and reported no visible FPS drops
or performance issues. Preserve that observation alongside the timing results:
the recorded RAF gaps have not been established as visible gameplay stutters.
Further optimization requires attributable evidence, not speculation from a gap.
The completed visible three-session run averaged 73.93, 73.36 and 72.95 FPS,
with p95 13.5 ms each and maximum RAF gaps 267, 681 and 494 ms. All reached
SIZE 24. The harness exited on aborted navigation requests before its timing
assertions; the stored measurements also miss the maximum-gap gate. Evidence:
`tools/pw/_tokyo-remediation/headful/result.json`.
See [ADR 0025](../adr/0025-tokyo-architectural-pieces.md) and the independent
[controls/presentation plan](controls-powerup-remediation.md).
