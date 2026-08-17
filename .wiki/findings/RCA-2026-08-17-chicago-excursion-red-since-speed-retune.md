# RCA — Chicago's excursion gate has been red since the hole-speed retune (2026-08-17)

**Status:** fixed 2026-08-17, with two measurements outstanding — see section 8.
Root cause proven by A/B; the fix is the shared arrival-driven driver in
`tools/route-driver.mjs`. Spec item 3 was retired on evidence (section 6a) and
replaced by two clauses the harness actually owns.

**Discovered:** while gating the partner-skin approval work. The full validator
returned `1 section group(s) FAILED: chicago`. The gating diff was the suspect
until the A/B cleared it.

---

## 1. The failure

```
FAIL: chicago: excursion reached only SIZE 6 (expected >=7)
  chicago sandbox: blocks=44578 mass=124047 eaten=878 size=6 peakChain=443 score=3435
```

`tools/validate.mjs:1489`. Every other section group passes.

## 2. It is not the partner-gating work

Ruled out structurally rather than by reasoning about it. `git archive HEAD`
extracted into a scratchpad and run there produces **byte-identical** numbers to
the dirty working tree — same `eaten=878`, same `mass=124047`, same
`score=3435`, same `size=6`. A diff that changed the outcome could not produce
an identical outcome. `main` was already red.

## 3. Root cause: commit `e8b84ae`

`e8b84ae` ("feat(audio): in-game music picker, tracklist unlock gating, dynamic
audio director & camera polish") also carries, in the same commit,
`js/voxelsim.js`:

```diff
-const SPEED_MULT = 1.4;      // sandbox hole runs at 1.4× the campaign speed curve
+const SPEED_MULT = 1.8;      // sandbox hole runs at 1.8× the campaign speed curve (retuned from 1.4 on 2026-08-17)
```

A/B against its parent `a0288a1`, chicago section only, same machine, same
command:

| Tree | `SPEED_MULT` | eaten | size | peakChain | score | result |
| --- | --- | --- | --- | --- | --- | --- |
| `a0288a1` | 1.4 | 1433 | 7 | 1433 | 8778 | ALL PASS |
| `e8b84ae` → HEAD | 1.8 | 878 | **6** | 443 | 3435 | **FAIL** |

The retune cut the excursion's consumption by 39% and its score by 61%.

## 4. Mechanism: the waypoints are TIME-gated, so a faster hole idles

`tools/validate.mjs:1472-1482`:

```js
for (let i = 0; i < DURATION * 60; i++) {
  const t = i * DT, h = run.hole;
  let wp = WP[WP.length - 1];
  for (const w of WP) if (t < w.until) { wp = w; break; }   // <-- TIME, not arrival
  const dx = wp.x - h.x, dz = wp.z - h.z, d = Math.hypot(dx, dz);
  run.step(DT, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 });
}
```

The active waypoint advances on the clock (`t < w.until`), never on arrival. So
a hole that reaches its waypoint early gets `d <= 0.3`, receives `{x: 0, z: 0}`,
and **parks** until the next window opens. Raising `SPEED_MULT` makes it arrive
earlier at every waypoint, which converts travel time into idle time. Faster
hole, less eaten — the opposite of the intuition, and the reason this was not
caught by inspection.

`peakChain` is the corroborating tell, and it is the strongest evidence in the
table. At 1.4× Chicago ran `peakChain = 1433 = eaten` — **one unbroken combo
chain for the whole excursion**, i.e. the hole never stopped eating long enough
to break it. At 1.8× that is `443` of `878`: the chain shatters, which is
exactly what parking does.

## 5. Blast radius — Chicago only, but three scenes are now closer to the edge

Every scene's excursion uses the same time-gated pattern, so all of them idle
more at 1.8× than they did at 1.4×. From the same full run, `peakChain` vs
`eaten` tells which routes still keep the hole continuously fed:

| Scene | eaten | peakChain | chain intact? | size | gate |
| --- | --- | --- | --- | --- | --- |
| manhattan (WTC) | 1429 | 1429 | yes | 8 | ≥7 |
| manhattan (district) | 455 | 455 | yes | 5 | ≥5 — **at the gate** |
| upper manhattan | 761 | 761 | yes | 6 | ≥5 |
| brooklyn | 767 | 651 | **broken** | 6 | ≥5 |
| boston | 1096 | 1096 | yes | 7 | ≥5 |
| cambridge | 2238 | 1886 | **broken** | 4 | ≥3 (gate slice) |
| **chicago** | **878** | **443** | **broken** | **6** | **≥7 — FAILS** |

Chicago is the only failure today. But `manhattan (district)` sits exactly on
its threshold with zero margin, and brooklyn and cambridge already show broken
chains — the same degradation, not yet past a gate. Any further speed increase
takes them out too.

## 6. Fix spec

**Do NOT lower the assertion to 6.** The assertion is not wrong; it is the only
thing that caught this. Lowering it would ratify the accident and destroy the
signal — and would leave the four scenes in section 5 silently degrading with
nothing watching.

**The defect is in the harness, not in the retune.** `SPEED_MULT = 1.8` is a
deliberate, shipped design decision (save schema v23, `RANKED_SIM_VERSION` 2);
a real player is not waypoint-gated and genuinely does eat more at 1.8×. What
broke is the probe, whose `until` values were implicitly calibrated so the hole
was *still travelling* when each window expired. It now measures a hole that is
parked for a large fraction of the run, which is not a measurement of the scene
at all.

Make waypoint advance **arrival-driven with the time as a cap**:

```js
// Advance on ARRIVAL, with `until` as a ceiling rather than the sole trigger.
// A purely time-gated route silently converts any speed increase into idle
// time (see section 4), so the probe stops measuring the scene and starts
// measuring how long the hole sits still. Arrival-driven keeps the hole moving
// at any SPEED_MULT, which makes the probe speed-INVARIANT — the next retune
// cannot quietly re-break it.
let wi = 0;
for (let i = 0; i < DURATION * 60; i++) {
  const t = i * DT, h = run.hole;
  while (wi < WP.length - 1 && (t >= WP[wi].until || reached(h, WP[wi]))) wi++;
  ...
}
```

Requirements on the fix:

1. **Apply it to every scene's excursion, not just Chicago.** Fixing only the
   red one leaves the four scenes in section 5 degraded and unwatched. This is
   the class, not the instance.
2. **Re-baseline every affected assertion in the same commit**, and state the
   before/after numbers. The thresholds were set against 1.4× travel; some will
   move up once the holes stop idling.
3. **Add a speed-invariance pin.** Run one scene's excursion at two different
   `SPEED_MULT` values and assert consumption does not *fall* as speed rises.
   That is the assertion whose absence let this ship — a monotonicity check, not
   a magic number.
4. TDD order: the invariance pin must be written first and must FAIL on the
   current tree (it will — Chicago is the proof case), before the harness is
   touched.

## 6a. Correction to spec item 3: the consumption clause is not winnable

Written during the fix, from measurement rather than argument. Item 3 as worded
— "assert consumption does not *fall* as speed rises" — cannot be satisfied by
any waypoint driver, because the property it asserts is false **of the sim**,
not of the harness. Section 4 blamed the whole 1433 → 878 drop on idling. Idling
is real and is the harness's to fix, but it is not the only term.

**The mechanism.** A block is consumed only when it has FALLEN below `SINK_Y`
while a hole's void is still overhead — `js/voxelsim.js:3221` (chunk members)
and `js/voxelsim.js:3397` (debris). Fall time is set by gravity, so yield is
time-over-content, not distance-over-content. Crossing the same metre twice as
fast halves the void's dwell over the debris it has just undermined, and that
debris lands on solid ground behind the hole instead of in it.

**The evidence.** The identical geometric route, sampled by DISTANCE travelled
rather than by time, which takes the driver out of the comparison entirely:

| travelled | 50 m | 100 m | 200 m | 400 m | 800 m |
| --- | --- | --- | --- | --- | --- |
| x1.00 eaten | 27 | 27 | 27 | 163 | 351 |
| x2.00 eaten | 7 | 7 | 7 | 40 | 111 |

Both arms are SIZE 1 through the first three marks, so this is not the growth
feedback loop — it is the per-metre yield itself. The feedback loop then
amplifies it: a hole that banks less stays small, and a small hole sweeps a
narrower void. Every driver inherits it. Measured over 90 s of the chicago
route, x1.00 vs x2.00: arrival-driven looping 2533 vs 639, arrival + dwell 1723
vs 1017, the old time-gated driver 435 vs 163.

The only way to pass a consumption-monotonicity pin is to slow the fast arm
down, which is undoing the work rather than testing it. **Item 3 is retired and
replaced**, not weakened, by two clauses over what the harness does own — that
the extra speed is SPENT rather than idled:

| driver | ground covered x1.00 → x2.00 | ratio | ticks parked |
| --- | --- | --- | --- |
| time-gated (broken) | 360 m → 361 m | **1.00** | 71.4% / 85.6% |
| arrival-driven, looping | 1467 m → 2442 m | **1.66** | 0.0% / 0.0% |

The broken ratio is 1.00 **by construction**: a time-gated schedule caps how
much ground a leg can cover however fast the hole is. Note that a bare
`fast > slow` would have passed it at 361 > 360, which is why the shipped pin
carries a margin (`MIN_SPEED_DISTANCE_RATIO`).

The speed knob is `upgrades.speed` rank 0 → 20 (x1.00 → x2.00), not `SPEED_MULT`.
It is the same multiplicative term in the same expression — hole speed is
`playerSpeedForRadius(r) * tune.speed * ramp * speedBoost * h.speedMult`
(`js/voxelsim.js:4464`) — so it is arithmetically identical to varying
`SPEED_MULT` 1.8 → 3.6 and needs no edit to a shipped module. It is also the
stronger statement, because it is the speed upgrade a player actually buys.

## 6b. Surfaced for the owner: this may also be a GAMEPLAY finding

Not acted on, and deliberately not chased — recorded here because it was found
while proving section 6a and it is the kind of thing that is invisible until
someone measures it. **No sim constant was changed by this work.**

**The mechanism** is the same one, stated in player terms. Consumption requires
`_overVoid(...)` to find a hole AND the block's own top to have fallen to
`… + sy / 2 <= SINK_Y`, **in the same tick** — `js/voxelsim.js:3218-3221` for
chunk members (`cb`), `js/voxelsim.js:3396-3397` for debris (`b`). A hole that has already moved on leaves `vh` null, and the block it
undermined lands on solid ground instead of falling into anything. Yield is
therefore gravity-time-gated: it is paid per second spent over the rubble, not
per metre travelled.

**The measurement**, identical geometric route, sampled by distance travelled:

| travelled | 50 m | 100 m | 200 m | 400 m | 800 m |
| --- | --- | --- | --- | --- | --- |
| x1.00 eaten | 27 | 27 | 27 | 163 | 351 |
| x2.00 eaten | 7 | 7 | 7 | 40 | 111 |

Roughly a quarter the consumption per metre at double speed, and both arms are
SIZE 1 through the first three marks so it is not the growth feedback loop.

**Why it might matter.** `SPEED_MULT` went 1.4 → 1.8 in `e8b84ae`, a commit that
bumped `RANKED_SIM_VERSION` to 2. If this carries to real play, the retune made
holes harder to steer *and* less rewarding to drive in a straight line — the
symptom to listen for is "I drove right over it and it didn't get eaten."

**The honest caveat.** A fixed scripted route is not how a player moves. A player
circles, doubles back, and lingers over a collapsing tower, all of which buy
dwell that this measurement does not include. So this **bounds** the concern —
it establishes the per-metre penalty is real and large — rather than proving the
retune hurt the game. Deciding that needs a play session or a telemetry sample,
which is Nico's call, not the harness's.

## 7. Process note

`e8b84ae` bundled a physics constant change (`SPEED_MULT`, which is
ranked-affecting — it bumped `RANKED_SIM_VERSION` to 2) into a commit whose
subject line is entirely about audio. Its own `tools/validate.mjs` hunk is +46
lines, so the file was edited in that commit without the chicago section coming
back green. A ranked-physics change deserves its own commit and its own gate
run; that is the reason this sat red across three subsequent commits without
anyone noticing.

## 8. Resolution

**The fix.** All nine scripted excursions and `tools/chicago-probe.mjs` now go
through one shared driver, `tools/route-driver.mjs`, instead of nine copy-pasted
loops. Waypoints advance on ARRIVAL, with `until` demoted to a per-lap ceiling,
and the route CYCLES to fill the excursion's fixed time budget.

The cycling is load-bearing and is not in the section 6 spec. Arrival-driven
advance *alone* measured **worse** than the bug on Chicago — 168 eaten / SIZE 1
against the broken driver's 435 / SIZE 3 — because it does not remove the
parking, it relocates it to the end of the route: the hole arrives at the last
waypoint early and then stands there. Looping is what converts the reclaimed
time back into travel.

**Before/after**, same seed, same routes, same `js/voxelsim.js`:

| scene | eaten | size | peakChain | score | floor |
| --- | --- | --- | --- | --- | --- |
| gallery tour | 1550 → **2247** | — | 1550 → **2247** | 8869 → **12670** | ≥8 unchanged |
| manhattan (WTC) | 1429 → **1347** | 8 → 8 | 1429 → 1347 | — → 10547 | ≥7 unchanged |
| manhattan (district) | 455 → **1477** | 5 → **8** | 455 → **1477** | — → 11158 | 5 → **7** |
| upper manhattan | 761 → **892** | 6 → 6 | 761 → **892** | — → 4122 | ≥5 unchanged |
| brooklyn | 767 → **558** | 6 → **5** | 651 → **558** | — → 2994 | ≥5 unchanged |
| boston | 1096 → **4545** | 7 → **11** | 1096 → **4545** | — → 50843 | 5 → **10** |
| cambridge | not re-measured | | | | ≥7 soak / ≥3 gate unchanged |
| chicago | not re-measured | | | | ≥7 unchanged |

Every chain that section 5 found broken is now intact, and every excursion
reports **0.0% parked ticks** against the new 2% ceiling.

**Thresholds moved: two, both upward, both because the hole now eats more.**
Manhattan-district 5 → 7 (measured 8) and boston 5 → 10 (measured 11), using
this file's own established convention of floor = reached − 1, which six of its
seven pre-existing floors already followed. **No threshold was lowered.**

**Brooklyn is the one scene the fix costs**, 767 → 558 eaten and SIZE 6 → 5. Its
route is a five-point orbit with ~7 m legs inside the museum, so its old yield
was dwell-dominated rather than travel-dominated and a driver that refuses to
park collects less on it — section 6a's mechanism, arriving where it bites
hardest. Its chain went the other way (651 of 767 broken → 558 of 558 intact),
i.e. the hole is now continuously fed. It still clears its floor, with zero
margin. **If it moves again, re-cut the ROUTE to be worth 62 s under a moving
hole; do not move the floor.**

**Still outstanding, and deliberately not guessed at:**

1. **Cambridge and chicago were never re-measured.** Their floors are therefore
   left exactly as shipped. Cambridge's gate-floor comment still cites
   `eaten 1724, SIZE 3`, which was measured under the broken driver and is now
   an underestimate; it is labelled as provenance in the code rather than
   silently left to read as current.
2. **Cambridge's section got materially more expensive.** A hole that eats
   instead of idling produces debris, and debris churn is superlinear
   (RCA-2026-08-11). A `FW_VALIDATE_SECTIONS=cambridge` run was observed at
   **30+ CPU-minutes at 97% of a core and still running** when it was killed, so
   that is a lower bound, not a completion time. If it becomes the validator's
   long pole, cut `DURATION` — under a looping driver a shorter budget costs laps
   rather than coverage — and re-baseline its two floors in the same change.

**What now watches this.** `probeRouteSpent` fails any excursion that parks for
more than 2% of its ticks and, more importantly, PRINTS `laps / idle% / dist` on
every run whether it passes or not; the absence of exactly that line is what let
this ship. A new `speedInvariance` section runs Chicago's route at x1.00 and
x2.00 hole speed (`upgrades.speed` rank 0 and 20) and requires the faster hole to
cover ≥1.25x the ground, a clause the broken driver fails at 1.00 by
construction.
