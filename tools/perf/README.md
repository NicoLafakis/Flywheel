# `tools/perf` - the T-901 mobile perf harness

The re-runnable form of the instrument that produced
[`.wiki/findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md`](../../.wiki/findings/T-901-2026-08-13-ranked-run-on-throttled-mobile.md).
It plays a full ranked Chicago run on an emulated Pixel 5 under a CPU throttle,
records every frame, and prints the tables that finding's section 3 is built
from.

It exists because that measurement first ran out of a session scratchpad that
was about to evaporate, which would have made the FAIL verdict unfalsifiable:
nobody could have re-measured after a fix. Any lever aimed at T-901 - the
debris-drain defect (T-402), map snapshot caching (T-404), a tier change - is
re-measured here, against the same arms, before anyone claims it moved.

## Reproduce the T-901 measurement

```
node tools/perf/t901.cjs
```

That is the whole command. It starts its own static server, runs 13 runs
round-robin (5 x `a4x`, 5 x `b1x`, 3 x `c4xcr1`), stops the server, and prints
the report. Budget **~75 minutes** and leave the machine alone while it runs.

Prove the harness itself works first, in about 3 minutes:

```
node tools/perf/t901.cjs --smoke
```

### Requirements

- **Playwright, installed globally.** This repo has no `package.json` and must
  never gain one, so the harness resolves the global install by absolute path
  (`%APPDATA%/npm/node_modules/playwright`, then `npm root -g`, then
  `PLAYWRIGHT_PATH`). Missing, it fails with the exact fix:
  `npm i -g playwright && npx playwright install chromium`.
- **Python, optional.** The server is `python -m http.server` because that is
  the surface the recorded measurement was taken on. Without Python it falls
  back to a built-in Node static server that reproduces the two behaviours the
  measurement depends on: `.js` served as `text/javascript`, and `501` on any
  non-GET, which is what pushes the run down the documented offline branch.
  Force it with `FLYWHEEL_PERF_SERVER=node`.
- **A real GPU.** Headless Chromium falls back to SwiftShader without the ANGLE
  flags the harness passes. The renderer string is recorded in every run JSON
  and the report calls out a SwiftShader run as not quotable.

## The arms

| Arm | Profile | What it is for |
|---|---|---|
| `a4x` | Pixel 5, CDP `Emulation.setCPUThrottlingRate` **4**, shipping ranked tune | **The gate.** This is the reference profile T-901 is judged on. |
| `b1x` | Same profile, **rate 1**, no throttle | **The control.** Not a target and nobody ships against it. It is the proof that the instrument responds to the throttle at all. |
| `c4xcr1` | Rate 4 with `sim.tune.contactRounds = 1` forced at run start | T-901's own **predeclared fallback branch**, measured as a runtime override. No product code changes. |

Select a subset with `--arms=a4x,b1x`.

## Files

| | |
|---|---|
| `t901.cjs` | Orchestrator. Server lifecycle, round-robin scheduling, retries, report. Start here. |
| `t901-run.cjs` | One run. Device profile, throttle, closed-loop drive, per-frame probes, JSON out. Usable standalone. |
| `t901-report.cjs` | Aggregation. Per-run table, per-arm summary, quotability gate, instrument check. |
| `lib.cjs` | Playwright resolution, the static server, argv. |

## Where the raw JSON goes

Per-run JSON is **evidence, not source**, so it never lands in the repo. Each
invocation writes to a fresh timestamped directory under the OS temp dir:

```
%TEMP%\flywheel-perf\t901-<UTC timestamp>\<label>.json
```

The path is printed at the start and end of every run. Override with
`--out-dir=DIR`. Re-print a report from any past directory:

```
node tools/perf/t901-report.cjs "<that directory>"
```

Each JSON holds the full per-frame `dt` series, the per-frame `rankedTicks`
series, `__quality.levers()`, the GL renderer string, cold-load timings, the
end-of-run screen text, and the commit the run was measured on. If a number
ever needs re-deriving, it is in there; copy the directory next to the finding
that quotes it.

## Reading the output

**The per-run table.** One line per run, in the order they ran.

```
    label | thr | cr | cold_ms | build_s |    med |    p95 |    p99 | worst |  >33% |  >50% | wall_s | sim/wall | ticks | dist_m |  mass | results | reqs |   KB
    a4x-1 |  4x |  2 |     489 |    41.0 |    100 |    350 |  566.7 |  1383 |  84.7 |  67.5 |  370.2 |    0.243 |  5400 |   1066 |  5456 |     yes |   40 | 2482
```

- `cold_ms` - page load to the title screen offering THE RUN.
- `build_s` - the click on `RUN CHICAGO` to the READY gate. Paid before every
  run and again on every RUN AGAIN. It is a separate, currently un-gated cost.
- `med / p95 / p99 / worst` - frame time in ms over the whole run, from gate
  dismissal to `runComplete`. They quantise to multiples of 16.667 ms because
  the emulated profile is vsync-locked; a 100 ms median is six missed vsyncs.
- **`sim/wall` is the decisive number.** The sim is fixed-tick with
  `maxSubSteps: 2`, so a frame can buy at most 33.3 ms of sim time and below
  ~30 fps the sim falls behind wall clock permanently. 1.000 is real time;
  0.231 means a "90 second" run costs the player 6.5 minutes. The codebase's
  own recorded "not playable" band is 0.10 (`js/quality.js:74-80`).
- `ticks` - 5,400 is a complete ranked run. Anything less did not finish.
- `dist_m` and `mass` - the drive's own liveness proof. A stationary hole eats
  nothing and generates no debris, so `dist_m` near 0 means the input driver
  died and the frame times are describing an idle scene, not a game.
- `results` - `yes` means the RUN results screen rendered.

**The arm summary.** Median across runs, with `min` and `max` in the object.
Both are always printed, and this is not decoration. Frame cost is a floor with
one-sided noise: nothing makes the box faster than it can run, everything else
makes it slower. `min` is the honest best case, `median` the honest typical.
`worst5s` is the worst 5-second window of `sim/wall`, which is where
"unsteerable" actually lives - a whole-run mean smears a local stall in
proportion to the good frames around it.

**The box-noise readout** (`median/min` of the per-run frame medians) is the
tree-quiet check. Much above 1.3 and something else was using the machine
while the harness ran, and the numbers are indicative at best regardless of how
many runs were collected.

**The quotability gate** prints `NOT QUOTABLE` with reasons whenever an arm has
fewer than 5 runs, contains a truncated smoke run, contains a run that hit its
wall-clock ceiling, saw page errors, or ran on SwiftShader.

**The instrument check** compares `a4x` against the `b1x` control on three
readouts. It uses three because the frame median parks on the 16.7 ms vsync
floor: on a short run both arms sit at 16.7 ms and the median cannot falsify
anything, so p95, the >33 ms share and `sim/wall` carry the check. If no
readout separates the arms, the CPU throttle never applied and nothing in the
report is about the code.

## Standing methodology rules

These are not style preferences. Each one is here because ignoring it has
already produced a wrong number in this repo, and each is enforced by the tool
rather than left to the operator.

1. **A single timing on a busy box is not a measurement.** Two points fit any
   curve, and on this machine the same build has shown 2.0-2.6x median/min
   spread with agents live. `n >= 5` per arm is the floor; below it the report
   refuses to call the numbers quotable. There is no flag to override that.
2. **Publish median AND min, always.** Reporting one alone hides the noise.
   Their ratio is itself the readout that tells you whether the box was quiet.
3. **Round-robin, never blocked.** One rep runs every arm once, then the next
   rep starts. A box that warms, throttles or picks up other work mid-session
   then contaminates every arm equally instead of landing entirely on whichever
   arm happened to hold the wall clock.
4. **Validate the instrument against a deliberately different arm before
   trusting any number.** The unthrottled control exists for exactly this. A
   probe that has only ever printed one value has not been shown to respond to
   anything - ask what a totally broken build would print here, and if it
   matches what you got, the instrument is dead. The recorded run cleared this:
   6x frame time, 6x city build, 3.9x wall clock between the arms.
5. **A metric resting on a clamp cannot fail.** The frame median sits on the
   vsync floor; the drive is capped at 30% of the scene's half span so it never
   scrapes the bounds clamp. Whenever a readout could be parked against a limit
   of the system rather than measuring it, read a second one that cannot be.
6. **Drive the app closed-loop, not with held keys.** Steering is
   camera-relative off a rising-edge-latched basis, so `keyboard.down()` steers
   toward wherever the camera happens to point and scrapes the bounds. The
   harness computes its stick angle against the live `__controls._basisYaw` and
   the ring's measured `__controls._joyThrow`, one sample per rendered frame -
   the same rate the shipped input path is sampled at.
7. **One fresh process, browser and profile per run.** A save that survives is
   how run 2 quietly stops being a first-play, device-default-tier run.
8. **`--smoke` is not a measurement.** It truncates every run at 900 ticks and
   stamps `truncated: true`, and the report refuses to call it quotable. It
   also cannot discriminate the arms on frame median: the 4x cost is
   cumulative and debris-driven, so at 15 seconds of sim time the throttled arm
   still sits on the vsync floor. That is expected and is the point of rule 5.

## Deliberate differences from the 2026-08-13 run

- **`c4xcr1` is interleaved with the other arms** instead of running afterward
  in a second pass. The original ran `a,b,a,b,...` then `c,c,c`; this runs
  `a,b,c,a,b,c,...`, which is rule 3 applied to all three arms rather than two.
  It cannot change what the arms mean; it only spreads box drift evenly.
- **`--max-ticks` exists** (smoke only, stamped and gated, see rule 8). The
  original had no way to check itself without a 75-minute run.
- **Everything else is preserved**: device profile, throttle rate and the point
  it is applied, the ANGLE flags, the waypoint circuit and its 30% inset, the
  basis-relative stick maths, the per-frame sampling, the probe set, the
  offline-branch server behaviour, and the aggregation maths. The report
  reproduces the finding's section 3 tables byte for byte from the original run
  JSONs.

## Known limits

Unchanged from the finding's section 7, and they are properties of the
instrument, not of this rewrite. This is an emulated viewport with a uniform
main-thread CPU throttle: it scales JS execution and does not model a real
phone's memory bandwidth, cache, thermals, GPU class or scheduler. There is no
`/api` locally, so runs take the offline branch and board submission is not
exercised - that is `tools/board-live-selftest.mjs` territory on the deployed
build. Only Chicago is reachable as a ranked run. The drive is synthetic and
deterministic, which is what makes the arms comparable and also means it is not
a human.
