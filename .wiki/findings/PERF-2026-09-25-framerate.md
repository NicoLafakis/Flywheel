# Frame rate during play — 2026-09-25

Status: investigation only. Nothing in `js/` or `tools/` was changed. The scope was cut to Tokyo and Singapore at HIGH, with one LOW run on Singapore for comparison.

## Method

- **Build under test:** a clean `git archive HEAD` snapshot of `bdbcfdc`. The uncommitted Lab work in the tree was excluded. It was served locally on its own port.
- **Machine:** Intel Core Ultra 9 275HX laptop with an RTX 5070 Ti Laptop GPU (ANGLE D3D11 confirmed). Playwright Chromium, headless, 1440x900 at DPR 1.5, 150 s per run.
- **Driving:** a greedy autopilot (nearest edible block, plus waypoints).
- **What was recorded per frame:**
  - the rAF gap
  - the game frame's JS time
  - wrapped timers on the sim phases, `world.update`, `renderer.render` and the HUD
  - `renderer.info` (calls and triangles)
  - shader program count
  - heap drops
  - long-animation-frame entries
- **Sim-only timing:** a Node bench of the Singapore hero attack with a growing hole (seed `perf`, 240 steps), plus V8 CPU profiles.
- **Caveats:**
  - The Singapore HIGH browser run overlapped Node bench runs, so its absolute numbers are inflated. Its attribution still holds.
  - Another agent was using the machine at the same time.
  - Harness scripts are session-scratch and were not committed.

## Measured results

| Run | avg FPS | dt p50 / p95 / p99 / max (ms) | frames >50 / >100 ms | sim ms per step p50 / p95 | peak falling bodies |
|---|---:|---|---:|---|---:|
| Tokyo HIGH | 55.9 | 16.7 / 33.3 / 49.9 / 183 | 38 / 2 | 2.0 / 10.1 | 1,028 |
| Singapore HIGH | 8.8 | 100 / 333 / 417 / 450 | 746 / 653 | 58.5 / 166 | 3,459 |
| Singapore LOW | 31.8 | 16.7 / 66.7 / 100 / 133 | 832 / 50 | 7.9 / 31.0 | 2,127 |

Three things hold in every run:

- **Rendering is not the problem.** `renderer.render` averages 1.8–2.6 ms per frame (p99 ≤ 5.1), at 150–290 draw calls and 0.27–0.42 M triangles.
- **Shader compiles are not a hitch source here.** No new shader programs were compiled mid-play in any run.
- **Almost no hitch comes from outside the game's JS.** Of the frames over 50 ms, only 2 in Tokyo and 12 in Singapore LOW happened outside the game's own JS.

## Ranked costs

### 1. Loose-debris physics during collapses: the cause of every attributed hitch (measured)

Of the frames over 50 ms, `_stepDebris` accounts for 34/38 in Tokyo, 744/746 in Singapore HIGH and 818/832 in Singapore LOW. The rest are 2 chunk-dominated frames in Tokyo and the 2 + 12 outside-JS frames noted above. Cost follows the number of bodies moving at once, not the size of the city.

The worst Singapore frames ran 2 sim steps at about 420 ms, with about 2,600 bodies moving. The pair solver `_resolveDebrisContacts` (`js/voxelsim.js:3607`) took about 265 ms of that. The per-body probes in `_stepDebris` (`:3189`) took the other roughly 150 ms (`_contact` → `VoxelGrid.getCell`, `_topAt`, `_resolveStaticContacts`).

Counted per step on the Node bench, with 962 awake bodies:

- 628k bucket visits
- 188k `_separate` calls
- only 15k actual pushes (8%)

**Root cause.** The broad phase buckets bodies into 0.25 m fine cells, padded by one on each side. A 1 m block therefore sits in 36 cells, and each bucket holds the whole column of a pile at every height. The same pair is found up to 36 times per round, and 92% of the calls do nothing.

The debris-exclusive loop also pays for 32 `getCell` probes per 1 m body per step in `_contact` (`:2833`). `_pushAxis` (`:3879`, `:3886`) builds `'v' + axis` strings and a `['x','z']` array on every push.

### 2. HIGH has no debris cap outside ranked play (measured)

HIGH is the desktop default, and `TIERS.high` (`js/quality.js:100`) sets `debrisCap` and `contactBudget` to Infinity. LOW (350/250, one contact round) cut the Singapore step p50 from 58.5 to 7.9 ms in the browser, and from 207 to 53 ms mean on the Node bench. Ranked play is already capped (`RANKED_TUNE`: 280/200).

### 3. Two full scans of the block list every frame to count what is left (measured cost; the GC link is inferred)

`sim.remainingBlocksCount` is never assigned anywhere. So `hud.updateSandbox` (`js/ui/hud.js:382-384`) and `VoxelWorld3D.update` (`js/voxelworld.js:3482-3484`) each run `sim.blocks.filter(...)` every frame. That allocates two arrays of 22k–35k entries per frame.

The HUD's mean cost is 1.8–2.7 ms per frame, the largest non-sim item. Heap drops over 1 MB appeared in 494 Tokyo frames and 649 Singapore LOW frames, many at 11–30 MB. This allocation is the likely main feeder of that GC, but that link is inferred.

## Fixes

| # | Fix | Measured or estimated gain | Ranked determinism |
|---|---|---|---|
| A | In the pair loops of `_resolveDebrisContacts`, pre-reject on the horizontal overlap (`px`/`pz`) as well as the existing vertical one. Rewrite `_pushAxis` without string keys or array allocation. | **Measured on the Node bench, same machine, back to back: 149 → 74 ms/step mean, p95 299 → 104 ms.** Final state hash is bit-identical (`5e206b851bfd`) over 240 steps. | **Safe**: it only skips calls that would have done nothing. Still needs the parity suite (`tools/grid-sim-parity.test.mjs`) and a ranked replay check before shipping. |
| B | Keep a `remainingBlocksCount` counter in the sim, updated on consume, or compute the count once per frame. Drop both `filter` calls. | Estimated −2 ms per frame on the HUD and world, plus most of the per-frame garbage. | **Safe**: a render-side read; the counter never feeds gameplay. |
| C | Give HIGH a finite `debrisCap`/`contactBudget`, for example 600/450, or the ranked 280/200. | Estimated 3–7x lower sim cost in collapse spikes (Singapore LOW vs HIGH: 7.4x on the browser p50). | Ranked is unaffected (`tuneLocked`). It changes how free play feels, so decide it by playing, not by numbers. |
| D | A coarser or deduplicated broad phase (for example 1 m buckets, or each pair visited once per round). | The naive dedup was tried and **measured worse (116 ms mean) and changed the trajectory**. It is not a free win. | **Changes determinism.** It needs `RANKED_SIM_VERSION` 4 → 5. |

Not causes in these runs:

- shader compiles
- GPU or render cost
- support recalc (≤ 4.6 ms p99; one 23 ms outlier)
- storm (≤ 10.7 ms rip max, in Tokyo)
- cutscenes and power-ups (the largest announce spike was 22 ms)

The outlier frames with collapse chunk time of 12–15 ms (Tokyo, simT 113 s) are secondary.

Recommended order: A, then B, then C. D only goes ahead with a version bump.
