# RCA — Chicago's excursion gate has been red since the hole-speed retune (2026-08-17)

**Status:** open. Root cause proven by A/B; fix spec in section 6.

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

## 7. Process note

`e8b84ae` bundled a physics constant change (`SPEED_MULT`, which is
ranked-affecting — it bumped `RANKED_SIM_VERSION` to 2) into a commit whose
subject line is entirely about audio. Its own `tools/validate.mjs` hunk is +46
lines, so the file was edited in that commit without the chicago section coming
back green. A ranked-physics change deserves its own commit and its own gate
run; that is the reason this sat red across three subsequent commits without
anyone noticing.
