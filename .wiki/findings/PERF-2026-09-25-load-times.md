# PERF-2026-09-25 — Load times: title boot and city load

Investigation only; no code changed. Scope cut mid-task to title boot + The Lab,
Tokyo, Cambridge (other cities measured along the way are listed for context).

**Rig.** Intel Core Ultra 9 275HX (24 cores, ~23% background load), headless
Chromium via Playwright, ANGLE/D3D11 on the real GPU, 1280x800, served by
`python -m http.server` (no compression). Phone-class numbers use Chrome CPU
throttling (4x) and a Lighthouse-mobile network profile (1.6 Mbps, 150 ms RTT).
Scripts live in the session scratchpad (`boot.mjs`, `city.mjs`, `sim-phases.mjs`).
The Lab was measured on the **working tree** (uncommitted Tokyo-recreation Lab,
7,474 pieces), not HEAD.

## Title boot (measured)

| Condition | Network done | Brooklyn build (one main-thread task) | Splash gone | Watchdog |
|---|---|---|---|---|
| Unthrottled, 3 cold + 3 warm | 0.3-0.6 s | 2.2-3.8 s | 3.7-5.9 s | no |
| 4x CPU, local network | 0.8 s | 22.3-23.4 s | 26.4-27.1 s | **fired, both runs** |
| Mobile network only | 18.3 s (DCL) | 4.1-5.2 s | 24.8-26.0 s | no (1 s margin) |
| Mobile network + 4x CPU | 19.8 s | 21.0-24.4 s | 42.7-47.5 s | **fired, both runs** |

Boot fetches 66 JS modules, 3.4 MB raw (0.94 MB gzip / 0.77 MB brotli), import
depth 3; `three.module.js` is 1.24 MB of it. The 3.8 MB menu MP3 is not on the
critical path (blocking it changed nothing).

**Watchdog root cause (reproduced).** The splash waits for the Brooklyn backdrop
(`js/main.js:2248-2253`, `immediate: true`), whose sim + renderer build runs as
one uninterrupted main-thread task (`js/ui/menuscene.js` `build()`). The 25 s
timer (`index.html:225`, armed at inline-script time, `index.html:336`) cannot run
during that task; it runs the instant the task ends, before the splash's
completion ramp (`index.html:246-277`) reaches 100, so `done` is still false and
it paints "LOAD ERROR". `js/main.js:2236-2244` then fades the splash out 1.4 s
later, which is the "recovered" behaviour STATUS recorded. The boot was never
broken; it was slow, and the watchdog cannot distinguish slow from dead.

## City load, measured (unthrottled, cold first render)

| City | Pieces (cubes / arch.) | Grid | Sim build | Renderer build | First frame | Total | 4x CPU total |
|---|---|---|---|---|---|---|---|
| The Lab | 7,474 (337 / 7,137) | VoxelGrid | 2.65 s | 0.52 s | 0.68 s | **3.9 s** | 36.4 s |
| Tokyo | 34,796 (23,803 / 10,993) | BoxGrid | 0.66 s | 0.20 s | 0.27 s | **1.2 s** | 10.1 s |
| Cambridge | 72,943 (39,381 / 33,562) | VoxelGrid | 5.55 s | 0.69 s | 0.82 s | **7.1 s** | 43.9 s |
| Brooklyn (context) | 39,984 (all cubes) | VoxelGrid | 1.91 s | 0.26 s | 0.29 s | 2.5 s | 22.2 s |

Module fetch is 5-13 ms for every city; it is not a factor. All of sim build +
renderer build + first frame is one main-thread task (`js/main.js:884-898`), so
the loading screen is frozen for the whole total.

### Piece count does not predict load cost; fine-cell volume does

Sim build splits into `_block` (grid insertion) and `_buildNeighbors`:

| City | Fine cells | Face cells | `_block` | `_buildNeighbors` |
|---|---|---|---|---|
| The Lab | 2.89 M | 3.68 M | 1,505 ms | 1,012 ms |
| Cambridge | 3.57 M | 7.05 M | 2,075 ms | 2,984 ms |
| Tokyo (BoxGrid) | 4.75 M | 4.89 M | **52 ms** | 451 ms |

Across 9 VoxelGrid cities `_block` costs 0.46-0.66 us per 0.25 m fine cell and
`_buildNeighbors` 0.21-0.44 us per face cell. The Lab has 10x fewer pieces than
Upper Manhattan (73,393) yet the same 2.65 s sim build.

## Top 3 load costs, with fixes

1. **Per-fine-cell occupancy grid (VoxelGrid) — 40-60% of every non-Tokyo city
   load and of the title boot. Measured.** `_addBlock` writes every 0.25 m cell
   a piece covers (`js/voxelsim.js:2141-2145`), two Map writes plus a column
   update per cell. So a 3 m wall panel costs as much as the ~1,700 cubes it
   replaced, and **the geometry-authoring piece consolidation buys no load time
   and no memory** unless the map runs on BoxGrid. Retained heap: Lab 249 MB,
   Cambridge 325 MB, Boston 454 MB; Tokyo on BoxGrid 35 MB. BoxGrid is only
   selected for Tokyo, and only through `geometryVersion === 2`
   (`js/voxelsim.js:1016-1018`), which also freezes a different physics tune.
   **Fix:** separate "which grid" from "which tune", then move maps to BoxGrid
   one at a time behind the validator. Estimate (inferred from Tokyo's per-cell
   rates): `_block` goes from 1.5-2.1 s to under 0.1 s on Lab and Cambridge, and
   memory drops by roughly 200-300 MB. Behaviour parity must be proven per map
   (support/collision queries go through the grid).

2. **`_buildNeighbors` walks every face cell — 1.0-3.0 s. Measured cost;
   fix inferred.** `js/voxelsim.js:2156-2176` allocates a coordinate array per
   face cell and does a grid lookup for every 0.25 m of every face. Large pieces
   make this worse (Cambridge 0.42 us per face cell against 0.23 for all-cube
   maps). **Fix:** skip ahead by the found neighbour's extent along the face,
   drop the per-cell allocations, or derive adjacency from BoxGrid's range query.
   Estimate: 2-4x faster, so Cambridge saves about 1.5-2.2 s.

3. **The title waits for a whole city build, and the watchdog reports slow as
   failed — 2.2-3.8 s unthrottled, 21-24 s at 4x CPU. Measured.** Brooklyn's
   backdrop build is the whole boot. **Fixes:** (a) mount the title and remove
   the splash when the menu can paint, then fade the backdrop in when it is
   ready (the module header already says the backdrop "must never delay the
   menu"; `immediate: true` contradicts that). Saves 2.2-3.8 s, or about 20 s on
   a phone-class CPU. (b) have the watchdog recheck progress when it fires and
   stand down if the boot reached 100 or is still advancing. This removes the
   false "LOAD ERROR". (c) fix 1 also shrinks the Brooklyn build.

**Smaller measured costs:**
- Cold GPU warm-up (shader compile, environment map, texture upload) is the
  first frame minus a warm first frame: 0.56 s on the Lab, 0.65 s on Cambridge,
  0.21 s on Tokyo. Fix: warm up shaders during the loading frame with
  `renderer.compileAsync`.
- The 17-layer procedural surface texture array takes about 220 ms to generate
  on first use (`js/voxelsurfaces.js:228-280`). Fix: bake it once to a static
  asset, or generate it in a worker.
- On mobile networks, boot is bound by 3.4 MB of uncompressed JS. Production
  hosting compresses it to about 0.8 MB, so that part is a local-only effect.
  `supabase-realtime` (135 KB) and `world3d.js` (87 KB) load statically at boot
  but are not needed for the title.

**Caveat.** Chrome's 4x throttle overstates the build superlinearly (the Lab
went from 2.65 s to 32.6 s, 12x). Treat throttled figures as direction, not
phone truth.
