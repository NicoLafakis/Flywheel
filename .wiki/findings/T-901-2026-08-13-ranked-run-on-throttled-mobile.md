# T-901 — THE RUN on a throttled mobile profile (emulated)

> **Status: FAIL, recorded, no fallback applied.** This is the T-901 record for
> `SPEC.md` AC-7. Two owner decisions frame it, both made 2026-08-13:
>
> 1. **The physical-device requirement is retired.** It was unreproducible,
>    unautomatable, and could not be re-run when the code changed. The gate is
>    now the emulated Pixel-5 + 4x CPU throttle profile used below — the same
>    instrument `js/quality.js` already cites as its evidence base and the same
>    one that produced the shipped 2026-08-12 mobile fixes. §7's caveat about
>    what emulation does not model still stands and is accepted knowingly.
> 2. **Neither predeclared fallback will be applied.** Both were measured (§5)
>    and neither closes a ~4x gap; `contactRounds: 1` would additionally change
>    a frozen ranked constant and bump `sim_version`, invalidating stored
>    traces, to buy an improvement that sits inside the control arm's own noise.
>
> **What it forces.** The shortfall is cumulative and debris-driven, which makes
> it the same root cause as
> [RCA-2026-08-11-cambridge-validator-stall](RCA-2026-08-11-cambridge-validator-stall.md):
> the awake-debris population never drains. One engine defect is making the
> validator unusable *and* ranked play impossible on a phone. The fix is that
> defect, not a tuning lever — and it changes sim output, so it wants to land
> while the board holds one run and zero claimed names. Re-run this harness
> after it lands; if the gap survives, the next lever is a device capability
> check that declines to offer ranked play on hardware that cannot sustain it,
> which keeps the tune identical for everyone who does play it.
>
> **Harness custody.** The scripts in §8 live in a session-scoped scratchpad and
> will evaporate. Preserving them as a re-runnable `tools/` harness is a tracked
> task — see `.wiki/features/timed-runs-and-full-clear/13-tasks.md`.

**Date:** 2026-08-13 · **Repo:** `C:\programming\nico-apps\Flywheel` @ `ef80d83` (clean)
**Surface:** local static server (`python -m http.server 8791`), `http://127.0.0.1:8791/index.html`
**Verdict: FAIL.** THE RUN is not steerable on the declared reference profile, and neither
predeclared fallback recovers it.

---

## 1. The declared threshold, quoted

`.wiki/features/scoreboards-and-profiles/08-test-strategy.md` §4:

> **T-901 — is the ranked tune playable on a phone?**
> Run a full 90-second ranked run on a real low-end touch device (the reference is
> the Pixel-5 profile at 4x CPU throttle that `js/quality.js` already cites as its
> own evidence base) on Chicago and on Brooklyn. Record median and p95 frame time.
> - **Pass:** a steerable frame rate throughout. Ship the tune.
> - **Fail:** set `contactRounds: 1` for **everyone, verifier included**, re-measure,
>   record the new constant in `js/voxelsim.js` next to the defaults, and update
>   [04](04-anti-cheat.md) §5.2. The tune must never differ between players.

`SPEC.md` "Open questions" records the standing caveat:

> T-901 requires a genuine low-end touch-device measurement. This workspace has
> no confirmed physical test device. A browser CPU-throttle result is useful
> evidence but does not satisfy the stated real-device gate.

**The gate is qualitative.** "A steerable frame rate throughout" is the only pass
condition written down. No document in this feature declares a numeric frame-time
budget for T-901 — `09-observability-and-budgets.md` §4.4's client budgets are about
shipped JS (< 25 KB), zero new deps, zero added boot cost, and "frame-time cost of
trace recording must not appear in a profile"; none of those is a frame-time ceiling.
**I have not substituted a threshold of my own.** The 33 ms / 50 ms lines below are
reporting lines requested by the task brief, labelled as such. The verdict is argued
against the declared qualitative criterion using the sim-time / wall-clock ratio,
which is the number that decides whether a bounded ranked run is playable at all.

The one numeric anchor the codebase itself supplies for "not playable" is
`js/quality.js:74-80`: the pre-cap build measured *"Brooklyn pegged at ~1 fps /
~1000 ms frames from the first seconds, the sim advancing 6 s of game time per 60 s
of wall clock"* — a 0.10 sim/wall ratio, on this same instrument.

---

## 2. Instrument

| | |
|---|---|
| Device profile | Playwright `devices['Pixel 5']` — 393x727 CSS px, DPR 2.75, `isMobile`, `hasTouch`, Pixel-5 UA |
| CPU throttle | CDP `Emulation.setCPUThrottlingRate` **rate 4**, set before `page.goto`, held for the whole session |
| Control arm | identical profile, **rate 1** (no throttle) — instrument validation, not a target |
| Fallback arm | rate 4 + `sim.tune.contactRounds = 1` forced at run start (T-901's own predeclared branch) |
| Browser | global Playwright Chromium, headless, `--use-angle=default --enable-gpu --ignore-gpu-blocklist` |
| GL backend | `ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti (0x00002803) Direct3D11 vs_5_0 ps_5_0, D3D11)` — real GPU, **not** SwiftShader |
| Host | Windows 11, `navigator.hardwareConcurrency` 16. Nico's own Chrome was open and active; box load outside the harness sampled at ~22-25%. This is why N and min-of-N matter. |
| N | **5 runs at 4x** and **5 runs at 1x**, strictly sequential and interleaved A,B,A,B... (round-robin), one fresh browser + fresh profile per run. Plus **3 runs** on the fallback arm. 13 complete runs, 0 aborted, 0 page errors. |
| Save state | fresh context every run -> fresh v17 save -> `qualityChosen: false` -> `defaultTierForDevice()` returns **LOW** on a coarse-pointer profile. That is what a real phone gets on first play. |
| Input | closed-loop synthetic drive: `pointerdown` at screen centre arms the floating stick, then one `pointermove` per rendered frame steering toward a 5-waypoint circuit derived from the scene's own block extents, so the hole never scrapes the bounds clamp. Stick angle is computed against the live latched basis (`__controls._basisYaw`) and the ring's measured throw (`__controls._joyThrow`) — the real steering contract, not a held key. |
| Probes | rAF-delta frame times, `__sim.rankedTicks` per frame, hole position/mass per frame, `__quality.levers()`, results-screen text |

### Confirmation that this is THE RUN, not free-play Chicago

Read out of the live sim at the READY gate on every run:

```
mode: {"mode":"run90","scene":"chicago",
       "tune":{"gravity":70,"waveK":0.1,"creak":0,"speed":1.4,"attract":2,
               "debrisCap":280,"contactBudget":200,"contactRounds":2,"supportEvery":1}}
levers: {"tier":"low","dpr":1,"shadows":false,"ambientFrozen":true,
         "debrisCap":280,"contactBudget":200,"maxSubSteps":2,
         "contactRounds":2,"supportEvery":1}
```

`mode: run90`, the frozen `RANKED_TUNE` values (`js/voxelsim.js:264-267`), every run
ending at exactly **5,400 ticks**, and the RUN results screen. Entered through the real
UI button (`RUN CHICAGO · 90 SECONDS`, `js/ui/screens.js:250-251`).

**One deviation, disclosed:** the local static server answers `POST /api/run/start`
with 501, so `startRankedRun`'s ticket fetch fails and the run takes the documented
offline branch (`js/main.js:404-414`) — same mode, same tune, same 5,400 ticks, seed
`local-run:chicago` instead of a server-issued seed, and no board submission. Frame
cost is unaffected; the submit path is out of local reach by design (see §7).

---

## 3. Results

### 3.1 Frame time, Chicago, THE RUN, full 90 s / 5,400 ticks

All frames from the READY-gate dismissal to `runComplete`. ms.

| Arm | n | median | p95 | p99 | worst | >33 ms | >50 ms | >100 ms | mean fps |
|---|---|---|---|---|---|---|---|---|---|
| **Pixel 5 @ 4x (shipping tune)** | 5 | **100.0** | **350.0** | 583.3 | 1416.6 | **85.1 %** | **68.8 %** | 46.6 % | 7.5 |
| ... best single run (min) | | 66.7 | 316.6 | 500.0 | 1033.4 | 79.6 % | 60.7 % | 26.4 % | 10.2 |
| ... worst single run (max) | | 116.7 | 400.1 | 683.2 | 2149.9 | 87.7 % | 74.8 % | 56.7 % | 6.9 |
| Pixel 5 @ 1x (control) | 5 | 16.7 | 50.0 | 83.2 | 133.4 | 13.0 % | 3.7 % | 0.1 % | 47.5 |
| Pixel 5 @ 4x, `contactRounds:1` | 3 | 116.6 | 283.3 | 416.7 | 1383.3 | 79.3 % | 59.6 % | 52.1 % | 8.8 |

Row values are the **median across runs**; the two "best/worst single run" rows give the
min and max across the five 4x runs, per the min-of-N requirement.

Frame times quantise to multiples of 16.667 ms because the emulated profile is
vsync-locked: a median of 100.0 ms is 6 missed vsyncs, p95 350 ms is 21.

### 3.2 Does the fixed-tick sim keep up with wall clock? (the decisive number)

`maxSubSteps` is **2** on both tiers (`js/quality.js:100-101`), so a frame may buy at
most 33.3 ms of sim time. Below ~30 fps the sim falls behind wall clock permanently —
`js/main.js:679` drops the unaffordable debt rather than carrying it.

| Arm | wall clock for a "90 s" run | sim/wall over the whole run | worst 5 s window |
|---|---|---|---|
| **4x, shipping tune** | **390.1 s** (min 296.4, max 419.2) | **0.231** (min 0.215, max 0.304) | **0.050** |
| 1x control | 100.5 s (min 95.1, max 107.5) | 0.896 (min 0.837, max 0.946) | 0.548 |
| 4x, `contactRounds:1` | 348.0 s (min 293.8, max 472.2) | 0.259 (min 0.191, max 0.306) | 0.066 |

**A 90-second ranked run takes 6 minutes 30 seconds of real time on the reference
profile** (best of five: 4 min 56 s). The in-game clock still reads 90.0 s at the
results screen, because it is sim time. In the worst 5-second window the sim advanced
0.25 s of game time — 20x slow motion.

### 3.3 Cold load to interactive

City modules load on demand via `loadScene()`, so boot and city build are separate costs.

| Arm | DOMContentLoaded | title screen offering THE RUN | Chicago build (click -> READY gate) | requests | transferred |
|---|---|---|---|---|---|
| 4x | 229 ms | **486 ms** (min 453, max 506) | **34.1 s** (min 28.1, max 46.3) | 40 | 2.48 MB |
| 1x | ~90 ms | 237 ms (min 225, max 305) | 5.7 s (min 5.3, max 6.9) | 40 | 2.48 MB |

Boot is genuinely cheap — the on-demand city split is doing its job. The 34-second
Chicago build under the loading frame is the real cold cost of starting a RUN, and it
is paid again on every "RUN AGAIN".

### 3.4 Does the run end correctly?

Yes, in all 13 runs. Every run reached exactly **5,400 ticks**, `runComplete: true`, and
rendered the RUN results screen. Verbatim from a 4x run:

```
THE RUN  YOUR RUN 5,655  Best combo 530  Clock 90.0 s
SAVED — NOT RANKED THIS TIME  3,657 B trace saved  RUN AGAIN  CITIES
```

No page errors, no unhandled rejections, no dropped input, no degraded end state. The
only console error is the expected `501` from the static server on the ticket POST.
"SAVED — NOT RANKED" is the correct offline state per `09-observability-and-budgets.md`
§3, and the trace was still encoded and retained.

Incidental T-903 datum (not the T-903 measurement, which wants human input on the
T-902 fixtures): encoded 5,400-tick traces from this synthetic driver came out at
**2,748-7,614 B** across 13 runs — comfortably under the 32 KB reject threshold.

---

## 4. Verdict: FAIL

Against the declared criterion — *"a steerable frame rate throughout"*:

1. **Input resolution collapses.** The stick is sampled once per rendered frame
   (`js/main.js:633-634`), so at a median 100 ms frame the player's thumb is read 10
   times a second and each sample is applied to 2 sim ticks. p95 350 ms means one in
   twenty frames answers a third of a second late; the worst frame measured was 2.15 s.
2. **The mode stops being 90 seconds.** sim/wall 0.231 means the bounded ranked unit
   takes 6.5 minutes of a player's real time. ADR-0016's whole premise is a *bounded*
   90-second attempt; on this profile the bound holds in sim time only.
3. **It is inside the codebase's own "not playable" band.** `js/quality.js:74-80`
   calls 0.10 sim/wall a broken build. 0.231 is 2.3x better than that disaster and
   still 4x short of real time, with 46.6 % of frames over 100 ms.
4. **It is not a warm-up artefact.** The first 60 s of sim already runs at 0.388
   sim/wall with a 66.6 ms median; the run degrades from there as debris accumulates.

The 1x control shows this is the throttle, not the harness or the scene: identical
route (1,069 m vs 1,049 m driven), identical tick count, 16.7 ms median, 0.896 sim/wall.

### Why this is worse than free play on the same phone

`RANKED_TUNE` is applied *after* the quality tier and overwrites it
(`js/main.js:525-527`, `js/voxelsim.js:264-267`). On the LOW tier the sim levers
resolved to `contactRounds: 2, supportEvery: 1` — the HIGH-tier values — because the
ranked tune must not differ between players. A phone in free play would have run
`contactRounds: 1, supportEvery: 2`. **THE RUN is deliberately the most expensive
thing a phone can run in this game**, and the tier only buys it dpr 1 and no shadows.
That is the design working as written, and it is also why T-901 exists.

---

## 5. Would a predeclared fallback bring it into budget?

### 5.1 T-901's own branch — `contactRounds: 1` for everyone: **No.**

Measured, n=3, same profile, `sim.tune.contactRounds` forced to 1 at run start (runtime
override in the harness; no product code was changed):

| | shipping (cr 2, n=5) | fallback (cr 1, n=3) | change |
|---|---|---|---|
| median frame | 100.0 ms | 116.6 ms | worse |
| p95 | 350.0 ms | 283.3 ms | -19 % |
| >50 ms | 68.8 % | 59.6 % | -13 % |
| >100 ms | 46.6 % | 52.1 % | worse |
| sim/wall | 0.231 | 0.259 | +12 % |
| wall clock for the run | 390 s | 348 s | 6.5 min -> 5.8 min |

The medians overlap the run-to-run spread of the shipping arm (whose own sim/wall
ranged 0.215-0.304, i.e. the fallback's entire gain sits inside the control arm's
noise). `_resolveDebrisContacts` is cited at 24.9 % of CPU with the second round about
half of that (`js/quality.js:62-64`), so ~12 % is the right order for a real effect —
it is simply nowhere near the 4.3x needed. **Applying this branch would change a
frozen ranked constant, invalidate every stored trace via a `sim_version` bump, and
still not produce a playable run.**

### 5.2 The 90 s -> 60 s fallback (ADR-0016 / T-902's branch): **No.**

Evaluated from the tick timeline of the same 4x runs, truncated at tick 3,600:

| | first 60 s of sim | full 90 s |
|---|---|---|
| median frame | 66.6 ms | 100.0 ms |
| p95 | 150.1 ms | 350.0 ms |
| sim/wall | 0.388 (min 0.348, max 0.472) | 0.231 |
| wall clock | ~155 s for a "60 s" run | 390 s |

A 60-second ranked run on this profile is still a 2.5-minute wall-clock run at a 67 ms
median and a 150 ms p95. Better — and it confirms the cost is cumulative, debris-driven,
not constant — but it does not reach a steerable frame rate. For comparison the 1x
control's first 60 s runs at **0.969** sim/wall, i.e. real time; its shortfall is
entirely in the last third. That fallback is also declared as T-902's branch (verifier
CPU), not T-901's; it is analysed here because the task asked.

**Neither predeclared branch closes the gap. The gap is ~4x and no lever in the
declared fallback set is worth ~4x.**

---

## 6. Recommended next actions

1. **Take the FAIL to Nico as a scope decision, not a tuning one.** The declared
   fallback is measured and insufficient; anything that would actually close 4x
   (raising `maxSubSteps` for ranked play, decoupling the ranked clock from wall clock,
   a lighter ranked scene subset, or gating THE RUN behind a device check) is outside
   T-901's predeclared branch and needs an owner decision.
2. **If any lever is chosen, re-run this harness first.** It is 13 runs, ~75 minutes,
   fully scripted, and it discriminates: the 1x control and the cr-1 arm both moved
   the numbers in the expected direction and magnitude.
3. **Consider the wall-clock honesty question independently of the verdict.** Even the
   *unthrottled* emulated phone finishes a 90 s run in 100.5 s (0.896 sim/wall), so
   "90 seconds" is already a device-dependent amount of real time on every device.
   Verification is unaffected (the trace is tick-indexed), but the RUN's framing and
   the results screen's `Clock 90.0 s` are sim time, not the player's time.
4. **The 34 s Chicago build at 4x is a separate, un-gated cost** paid before every RUN
   and again on every RUN AGAIN. No document declares a budget for it. Worth one.

---

## 7. What this measurement does NOT cover

- **A physical device.** This is an emulated Pixel-5 viewport with a uniform 4x
  main-thread CPU throttle. CDP throttling scales JS execution; it does not model a
  real phone's memory bandwidth, cache, thermal throttling, GPU class, or scheduler.
  `SPEC.md`'s open question stands on its own terms — the owner has accepted this
  throttled profile as the gate for this measurement, and that acceptance is what
  makes this the T-901 record. A real Pixel 5 could land either side of these numbers.
- **Brooklyn.** T-901's text asks for Chicago *and* Brooklyn. `RANKED_SCENES` is
  `['chicago']` (`js/board/config.js:7`) and the only ranked entry point is hardcoded
  to Chicago (`js/ui/screens.js:251`), so there is no ranked Brooklyn run to measure.
  ADR-0016 says a city joins only after its own budget gate. **Not measured; not
  reachable through the product.**
- **The HIGH tier at 4x.** Every run used the device default (LOW). HIGH differs only
  in dpr 1.5, shadows, and ambient — the sim levers are identical under `RANKED_TUNE` —
  so HIGH can only be slower. Not measured.
- **Board submission.** No `/api` locally, so the runs took the offline branch. Ticket
  issue, submit, verification, verdicts and rank display are not exercised here; that
  is T-902 / `board-live-selftest.mjs` territory on the deployed build. Proxying the
  local page at the production API was deliberately not done — it would have written
  real rows to the production board.
- **The trace-recording frame cost** (`09` §4.4: "must not appear in a profile"). Two
  int8 writes per tick cannot be isolated against a 100 ms frame with this instrument;
  the only clean comparison available (free play) differs in `contactRounds` and is
  therefore confounded. Not measured — but no arm showed a per-tick cost anywhere near
  observable.
- **Real human input.** The drive is synthetic and deterministic by construction (a
  waypoint circuit), which is what makes the arms comparable — the driven route was
  1,032-1,077 m in every single run across all three arms. A human would eat more or
  less and shift the debris load; the 4x arm actually ended with ~12 % *less* mass
  consumed than the control, so its frame times are, if anything, flattering.
- **Audio, reduced motion, orientation changes, backgrounding.** Untouched.

---

## 8. Evidence

Raw per-run JSON (frame-time series, tick series, levers, screen text) and the harness:

```
C:\Users\lafak\AppData\Local\Temp\claude\C--programming-nico-apps-Flywheel\cb5bf456-49b3-40d8-a03e-089e407bccfe\scratchpad\
  t901.cjs            harness (Pixel 5 + CDP throttle + closed-loop drive + probes)
  t901r.cjs           same, with the T901_ROUNDS contactRounds override
  runner.sh           round-robin driver: a4x-1..5 / b1x-1..5, interleaved
  runner2.sh          fallback arm: c4xcr1-1..3
  agg.cjs, table.cjs  analysis
  a4x-{1..5}.json     4x, shipping ranked tune
  b1x-{1..5}.json     1x control
  c4xcr1-{1..3}.json  4x, contactRounds:1
```

### Per-run table

```
label     | cr | cold_ms | build_s | med   | p95   | p99   | worst | >33%  | >50% | wall_s | sim/wall | ticks | dist_m | mass
a4x-1     | 2  | 489     | 41.0    | 100.0 | 350.0 | 566.7 | 1383  | 84.7  | 67.5 | 370.2  | 0.243    | 5400  | 1066   | 5456
a4x-2     | 2  | 486     | 33.6    | 116.6 | 400.1 | 683.2 | 2150  | 87.7  | 74.8 | 419.2  | 0.215    | 5400  | 1077   | 5655
a4x-3     | 2  | 506     | 35.0    | 116.7 | 333.4 | 583.3 | 1033  | 85.1  | 69.5 | 418.7  | 0.215    | 5400  | 1077   | 6939
a4x-4     | 2  | 466     | 34.1    | 100.0 | 399.9 | 616.7 | 1900  | 85.8  | 68.8 | 390.1  | 0.231    | 5400  | 1069   | 5968
a4x-5     | 2  | 453     | 28.1    |  66.7 | 316.6 | 500.0 | 1417  | 79.6  | 60.7 | 296.4  | 0.304    | 5400  | 1051   | 5013
b1x-1     | 2  | 237     |  5.7    |  16.7 |  50.1 |  83.3 |  133  | 17.0  |  5.1 | 103.5  | 0.869    | 5400  | 1049   | 6569
b1x-2     | 2  | 234     |  5.3    |  16.7 |  66.7 | 100.0 |  450  | 11.4  |  6.1 | 107.5  | 0.837    | 5400  | 1033   | 4059
b1x-3     | 2  | 225     |  5.3    |  16.7 |  50.0 |  66.7 |  133  | 13.0  |  3.0 |  99.4  | 0.905    | 5400  | 1054   | 7321
b1x-4     | 2  | 265     |  6.1    |  16.7 |  33.4 |  50.1 |  133  |  7.4  |  1.2 |  95.1  | 0.946    | 5400  | 1042   | 5801
b1x-5     | 2  | 305     |  6.9    |  16.7 |  50.0 |  83.2 |  150  | 14.1  |  3.7 | 100.5  | 0.896    | 5400  | 1050   | 6416
c4xcr1-1  | 1  | 463     | 34.9    | 116.6 | 466.7 | 850.0 | 2533  | 85.0  | 71.5 | 472.2  | 0.191    | 5400  | 1069   | 5157
c4xcr1-2  | 1  | 699     | 46.3    | 116.7 | 283.3 | 400.0 | 1350  | 79.3  | 59.6 | 348.0  | 0.259    | 5400  | 1032   | 3784
c4xcr1-3  | 1  | 444     | 27.8    |  83.3 | 283.2 | 416.7 | 1383  | 71.7  | 56.7 | 293.8  | 0.306    | 5400  | 1033   | 4077
```

### Probe validation (what a totally broken build would have printed)

Every probe was checked for the failure mode where it prints the same thing either way:

| Probe | Dead-probe signature | What it actually printed |
|---|---|---|
| Frame time (rAF deltas) | a constant 16.7 ms regardless of throttle | 16.7 at 1x, 100.0 at 4x — a 6x differential on the same build |
| sim/wall ratio | a hardcoded 1.000 | 0.896 at 1x, 0.231 at 4x, 0.969 over the control's first 60 s |
| Game loop alive | my sampler would still tick at 60 Hz with a dead game | ticks advanced to 5,400 and mass grew in every run |
| Input driver | dist 0, mass 0, `wpHits` 0 (a stationary hole eats nothing and generates no debris) | 1,032-1,077 m driven, 11 waypoints reached, mass 3.8k-7.3k in every run |
| Run completion | `ticksEnd < 5400`, no results screen | 5,400 / results screen in 13 of 13 |
| Cold load | insensitive to the throttle | 237 ms at 1x vs 486 ms at 4x |
| CPU throttle actually applied | 4x arm indistinguishable from control | 6x frame time, 6x city build, 3.9x wall clock |

The instrument is the same one `CHANGELOG.md`'s 2026-08-12 mobile pass and
`js/quality.js`'s own comments cite as their evidence base, which is why its numbers
are directly comparable to the constants already in the code.
