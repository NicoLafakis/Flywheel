# Tokyo remediation acceptance evidence

Update 2026-09-13: the owner retired the physical-device 60 FPS acceptance
gate. The "Phones released from 2019 onward" row below is historical record.

Review build: https://flywheel-448ypdw2r-nicos-projects-896b6ff8.vercel.app

This is the legacy Tokyo pilot, not the separate Flywheel-v2 production build.
Implementation is present; release acceptance is incomplete.

| Requirement | Evidence | State |
| --- | --- | --- |
| Fewer architectural pieces, conserved material and points | 84,122 to 34,796 pieces; architectural-pieces, architectural-tiles, architectural-chunks and tokyo-geometry tests | Verified |
| Preserve city detail | Matched whole-city and five-district screenshots inspected; stretching found, repaired, and rechecked | Verified for captured views; destruction/art acceptance open |
| Bounds-based occupancy and support | 15,360 independent contact comparisons and 260-tick Tokyo collapse oracle | Verified within tested scope |
| Maximum growth around three minutes | Three full no-power calibration routes pass 150–210 second gate | Verified on calibration routes |
| Direct WASD, fixed gameplay orientation | Actual camera/control tests and deployed keyboard flow | Verified |
| Floating touch joystick and pinch zoom | CDP touch origin, reversal, release, two-finger spread and cancellation | Browser automation verified; physical touch open |
| Major-only power sequences | Quake/Titan/Vortex; skip, natural completion, routine powers, reduced motion and scene replacement exercised | Verified functionally; style/audio acceptance open |
| Retire competing full-screen power treatments | RED-proven HUD retirement test; deployed old-overlay visibility assertions | Verified |
| Preserve rewards and other cities | Explicit Tokyo economy weight and unchanged story order; geometry v2 Tokyo-only; Chicago ranked v1 retained | Targeted tests and relevant full-suite groups passed |
| Desktop sustained frame target | Three visible 300-second sessions below | Mixed evidence; strict timing gate not met |
| Phones released from 2019 onward | No physical devices or device service available | Retired 2026-09-13 (owner decision; was: unverified) |
| Validator coverage | Full run: 30/31 groups, 2091.6 s; corrected core: ALL PASS, 172.9 s (`_tokyo-core-final.log`) | All groups covered across runs; no single all-green run. Redundant rerun stopped following user direction during commit/push |
| Other-city rollout | Intentionally gated on Tokyo acceptance in approved plan | Not started |

## Visible desktop sessions

Ryzen 7 8700G, RTX 4060 Ti, 64 GB RAM, Windows 10.0.26200,
Chrome 152.0.7977.83, hardware ANGLE/D3D11, 1440×900 viewport.

| Session | Average FPS | p95 / p99 interval (ms) | Maximum RAF gap (ms) | Tornado average FPS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 73.93 | 13.5 / 13.9 | 266.7 | 73.74 |
| 2 | 73.36 | 13.5 / 26.6 | 680.9 | 71.51 |
| 3 | 72.95 | 13.5 / 26.6 | 493.5 | 73.77 |

All reached SIZE 24. These are 300 wall-clock-second sessions; major presentation
holds and timing gaps mean they are not necessarily 300 simulation seconds.
The last screenshot was inspected: SIZE 24, 94% cleared, gameplay HUD visible.

The user watched the visible playthrough and reported no visible FPS drops or
performance issues. That observation agrees with the sustained average rate.
The maximum RAF gaps remain recorded, but their attribution to visible gameplay
stutters is unproven. The earlier CPU-profile repeat showed mostly idle JS during
large gaps and one genuine simulation burst. Do not infer a shader, OS, GPU or
physics cause from this evidence alone.

The harness exited on aborted navigation requests (including Vercel's JWE URL)
before its timing assertions. The stored timings independently miss the strict
maximum-gap gate. The separate deployed functional test had no browser errors
or failed requests. Do not silently discard the benchmark's network failures.

Raw evidence: `tools/pw/_tokyo-remediation/headful/result.json`, screenshots
`headful/run-0.png` through `run-2.png`, and `_tokyo-render-visible.log`.
These local artifacts are ignored by Git.
