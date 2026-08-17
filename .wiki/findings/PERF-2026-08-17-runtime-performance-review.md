# PERF review — seven proposed runtime optimisations (2026-08-17)

**Question asked:** can each of these raise performance *without* degrading look
and feel?

**Method:** code evidence only. Nothing here is a profiler measurement — every
verdict is "what the source says this would and would not do", and the two
items that turn on real numbers (2a, 3a) say so explicitly. Treat a verdict as
a decision about *whether to spend the profiling time*, not as the profile.

Verdict key: **BUILD** (worth doing, low risk) · **BUILD, SCOPED** (worth doing
but not as stated) · **BLOCKED** (needs a precursor first) · **PREMISE FAILS**
(the described problem is not in the code) · **DO NOT** (cost exceeds any
plausible win).

---

## 1. Quick wins

### 1a. Front-load shader compilation on the loading screen — **BUILD**

`grep` for `.compile(` / `compileAsync` across `js/` returns hits **only** inside
`js/vendor/three.module.js`. No app code precompiles anything, so every material
variant pays a `glCompileShader` + `glLinkProgram` stall on the first frame it
appears in — which is exactly the opening seconds of a city, when the skin, the
decor layers, the particle materials and the void shader all arrive at once.

The hook already exists: `screens.showLoading()` (`js/ui/screens.js:731`) is
called from all three entry paths — campaign (`js/main.js:690`), sandbox
(`:717`) and multiplayer (`:1092`).

Use **`renderer.compileAsync(scene, camera)`** (present at
`js/vendor/three.module.js:29429`), not `renderer.compile()`. `compile()` is
synchronous and would move the stall rather than hide it; `compileAsync`
returns a promise the loading screen can await while it is already showing a
spinner.

Look-and-feel risk: **zero**. Identical pixels; the cost moves to a screen
whose entire job is absorbing cost.

### 1b. Object pooling for particles / sparks / dust — **BUILD, SCOPED**

Half of this is already done and the brief should not re-do it. `mat()`
(`js/world3d.js:68-79`) caches every material by a `color|emissive|flat` key,
and `boxGeo()` (`:61`) caches the geometry — **particles do not allocate
materials or geometry today.**

What they *do* allocate, per particle, is a `new THREE.Mesh` — which brings a
`Matrix4`, a `Quaternion`, an `Euler`, two `Vector3`s, a `Layers` and a UUID
string with it — plus a `scene.add()` on birth and a `scene.remove()` on death
(`js/world3d.js:2196-2197`), each of which mutates the scene-graph child array.
Live caps are 100 (35 in `perfMode`) against lives of 0.4-0.5 s, so sustained
heavy eating churns roughly 200-250 Meshes per second.

So: pool the **Meshes**, not the materials. A fixed ring of ~110 Meshes
parented once at boot and toggled via `.visible` removes both the allocation
and the scene-graph mutation.

Look-and-feel risk: **zero** — `.visible = false` is a render skip, not a
material or transform change. Expect this to remove GC micro-stutter, **not**
to raise average FPS; if the frame budget is the complaint rather than the
hitching, this is the wrong lever.

### 1c. Preload the active city's track during the intro — **BLOCKED** (one-line unblock)

The mechanism you want already exists and is already correct: `_arm(cue)`
(`js/audio/music.js:274`) assigns `src`, sets `preload='auto'` and calls
`load()` without touching `play()`, precisely because the autoplay policy gates
only `play()`. It is what makes the menu track buffer at boot.

It cannot be reused here, for a structural reason: **there is exactly one
`new Audio()` in the whole music layer** (`js/audio/music.js:65`), and `_arm`
writes `this.audio.src`. Arming the city track during the intro would stop the
menu track that is currently playing on that same element. `_arm` is
consequently called from one place only (`:211`, the still-locked path).

Unblock it either way:

- **Cheapest:** inject `<link rel="preload" as="audio" href="…">` on
  `showLoading()`. One line, no new state, browser handles the fetch.
- **More control:** a second, permanently-muted `HTMLAudioElement` used purely
  as a prefetcher, handed off by `src` when the switch happens.

This is the **highest-value item on the list for perceived smoothness**, and
the numbers say why: `assets/music` is **83 MB across 19 files**, against
4.2 MB for `assets/audio` and 301 KB for `assets/skins`. Individual tracks are
multi-megabyte; the intro shot is dead time that could be paying for one.

---

## 2. Physics polish

### 2a. Fast-path debris already inside the hole void — **BUILD, SCOPED** (and price it properly)

Most of the surrounding optimisation is already in place, so the brief must not
re-derive it: `js/voxelsim.js` keeps `_falling[]` as an *active* list with
retirement out of it (`_retireResting`), deferred compaction
(`_fallingRemoved`, `:2754-2759`), and a `FRESH_WINDOW` cutoff that drops stale
blocks out of the chunk-grouping pass entirely (`:2782-2783`).

`_overVoid(p, x, z)` exists (`:2846`) and is called in five places — none of
which is the one you are proposing. It is used for tipping over a rim
(`:3469`), camera blockers (`:3218`) and mover consumption (`:4168-4192`), but
**never to skip contact/heightmap resolution for a block whose footprint is
wholly inside the removal disc.** Such a block cannot land on anything and its
contacts cannot matter; an early `continue` there is the real fast path.

**Price this above the render items, for one reason:** `js/voxelsim.js` is
determinism-critical. Skipping work changes float accumulation *order*, which
can move ranked replay results — see the `feedback_vary_the_dimension_that_
causes_the_bug` lesson about consumption order. This needs a TDD-first pin, a
full validator pass, and an explicit decision on whether `RANKED_SIM_VERSION`
bumps. It is not a free win, and it should be measured before it is built.

Look-and-feel risk: **zero if it is truly a no-op path**; the whole design
requirement is that the skipped work provably could not have changed a
position.

### 2b. Smoother interpolation of size growth — **PREMISE FAILS**

There is no step to smooth. `js/voxelsim.js:4367`:

```js
h.radius = isTitan ? MAX_RADIUS
                   : (START_RADIUS + (h.size - 1 + Math.min(1, h.sizeFrac)) * 0.5);
```

where `h.sizeFrac = (rawMass - lo) / (hi - lo)` normalised inside the current
ladder level (`:4365`). The radius already advances *continuously with every
mouthful*, and the code comment at `:4352-4354` states that as its intent.
`js/voxelworld.js` reads `h.radius` raw (`:3308`, `:3314`, `:3322`, `:3341`)
because there is nothing to filter.

Two things genuinely do snap, and neither is growth:

1. **TITAN** slams `h.radius` to `MAX_RADIUS` and back. Deliberate — a powerup
   should feel instant.
2. **The "delayed collapse pop"** is a *support-failure* event: a chunk
   detaching all at once after its cantilever times out. If that is what feels
   wrong, the levers are `HANG_CAP` (1.8 s, `:316`) and `FLOOR_CANTILEVER`
   (`:315`) — the creak-then-let-go timing — not an interpolation filter. That
   is a **feel** change, not a performance one, and it belongs in a separate
   decision.

---

## 3. Advanced / architectural

### 3a. Service Worker / CacheStorage — **BUILD, SCOPED** (biggest win on the list)

Nothing exists today: no `sw.js`, no `serviceWorker` registration, no `caches.`
usage anywhere outside vendor code.

Payload reality:

| Bucket | Size |
| --- | --- |
| `js/vendor/three.module.js` | 1.33 MB |
| `js/` total | 4.4 MB |
| `assets/skins` | 301 KB |
| `assets/audio` | 4.2 MB |
| `assets/music` | **83 MB** |

**Precache `js/` + `assets/skins` + `assets/audio` (~9 MB).** That is the whole
boot path, it is safe, and it makes every repeat visit start instantly.

**Do NOT precache the 83 MB of music.** Per-origin quota is a share of free
disk, eviction is opaque, and a full-manifest precache will either fail outright
on a constrained device or evict unpredictably later. Music wants runtime
cache-first with an LRU cap.

**The trap specific to this repo:** Flywheel is static with no build step, so
there is no content hash to bust a stale cache. A service worker here MUST use
a versioned cache name and make a deliberate `skipWaiting()` / `clients.claim()`
choice, or players get pinned to an old build with no way to notice. That
hazard is the reason this is "scoped" rather than "just do it".

Look-and-feel risk: **zero**, assuming the staleness hazard is handled.

### 3b. Web Worker thread for simulation physics — **DO NOT**

Three independent reasons, any one of which is sufficient:

1. **It breaks the stated invariants.** Invariant 4 ("gameplay state changes
   only in `sim.step(1/60)`") and invariant 9 ("network work stays outside the
   synchronous fixed-step loop") both presuppose a synchronous, same-thread sim.

2. **It is a rewrite of the sim/render boundary, not an optimisation.**
   `js/voxelworld.js` reads live sim objects every frame, and `js/main.js:1374`
   compares object *identity* (`ev.hole === sim.localHole`) to decide whose
   event an event is. Every one of those becomes a structured clone or a
   `SharedArrayBuffer` view. Ranked replay verification also imports the sim
   into Node, where a worker is dead weight.

3. **It costs a frame of latency by construction** — the worker's result lands
   after the render that asked for it. That is a *feel* regression, which is
   exactly the trade the request rules out.

If the sim really is the frame budget, the answer is profiling the `_falling`
passes and the contact solver (i.e. item 2a, measured first), not a thread.

---

## Recommended order

1. **1c** — one line, unblocks the largest single asset stall (83 MB of music).
2. **1a** — `compileAsync` on a screen that already exists to absorb cost.
3. **3a** — biggest repeat-visit win; scope to ~9 MB and handle staleness.
4. **1b** — Mesh pool only; targets hitching, not average FPS.
5. **2a** — *measure first.* Determinism-critical file; the profile decides
   whether the ranked-version risk is worth it.
6. **2b** — nothing to build. If the collapse pop is a real complaint, open it
   as a feel decision about `HANG_CAP`.
7. **3b** — declined.

Items 1a, 1b, 1c and 3a touch no simulation code and cannot move a ranked
score. Item 2a can, and is the only one on the list that needs a schema/version
conversation.
