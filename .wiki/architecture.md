---
covers:
  - "js/**"
  - "index.html"
  - "tools/**"
---
# Architecture

Plain ES modules, no build step. Three.js is vendored into the repo and
resolved by a same-origin importmap. The same simulation modules run in the
browser (rendered) and in Node (headless validator) — rendering is a thin layer
over a pure sim.

## Data flow

```
levels.js ──► citygen.js ──► sim.js ──► world3d.js ──► screen
                 (seed)      (fixed     (meshes only)
                              60 Hz)
                                ▲
controls.js ──► move/orbit intents ──┘
save.js ◄──► localStorage (schema v7 + migrations)

voxelsim.js ──► voxelworld.js        (voxel sandbox: same split,
 (seed, fixed 60 Hz)                  no citygen/levels)
```

## Boundaries

- **Pure sim** (`rng.js`, `tiers.js`, `citygen.js`, `levels.js`, `sim.js`,
  `voxelsim.js`, plus the voxel authoring layers `voxelforms.js` and
  `voxelkit.js` and the scene files `voxelscene-*.js`, among them
  `voxelscene-cambridge.js`): no three.js imports, no DOM, no `Math.random()`.
  This is what `tools/validate.mjs` proves beatable (and deterministic).
- **Render** (`world3d.js`, `voxelworld.js`, `camera.js`): reads sim state,
  never writes it. Eat/tide/unlock arrive as drained event lists.
- **UI** (`ui/hud.js`, `ui/screens.js`): DOM overlay; screens drive
  `main.js`'s state machine via an `actions` callback object.
- **Glue** (`main.js`): boot, screen state machine, fixed-timestep loop,
  audio blips.

**Built, standalone, not yet wired (2026-08-10):** the fourth **net** ring
proposed in [features/online-flywheel/03-technical-design.md](features/online-flywheel/03-technical-design.md)
now exists as code, in `js/net/` — `driver.js` (the driver seam: a hole is
steered by anything that answers `decide(hole, world, dt)`; `HumanDriver`,
`PeerDriver` with last-write-wins-by-seq intents and a 500 ms staleness
timeout, `IdleDriver` for a disconnected slot), `protocol.js` (versioned
message codecs, validated against hostile payloads), `snapshot.js` (capture/
apply with interpolation against the real sim), `transport.js` (a `Transport`
interface, `LoopbackTransport` with latency/jitter/drop simulation, and an
injected-client Supabase Realtime adapter marked untested until credentials
exist — see below, credentials now exist as of today but the adapter itself
is still unexercised against them), and `host.js` (the host-authoritative loop
skeleton, ADR-0010 — ships under the name `host.js` on purpose; it becomes
`arena-host.js` in the wiring commit that also writes the room-lifecycle half,
`arena.js`, neither of which exist yet). `tools/net-selftest.mjs` proves 132
checks headless, including a loopback exchange at 120 ms latency with 5%
drop. Nothing in `js/main.js` or any screen calls into `js/net/` yet — the
ring is proven in isolation but not plugged into the game. Its invariants
hold as designed: the net layer never writes sim state outside `sim.step()`
(there is exactly one `sim.step()` call in `host.js` and no other assignment
to a sim field), it never imports three.js, a client's score is never the
record, and the network is optional at every point.

**Also built (2026-08-10), separate surface:** `multiplayer.html` + `js/demo/`
is a hot-seat two-player demo — two holes sharing one gallery sim, swapped in
and out of the sim's single `hole` slot each half-frame (`js/demo/duel.js`),
rendered by its own overhead camera (`js/demo/view.js`) and its own loop
(`js/demo/demo.js`), entirely outside `main.js`'s screen state machine, HUD
and chase camera. It does not use `js/net/` — both players are local input on
one machine — and it does not edit `voxelsim.js`. Demo-grade and explicitly
scoped that way: a known artifact where each hole's support recalc partially
re-heals the rim the other hole is undermining is accepted rather than fixed,
since fixing it means editing the shared sim.

**Built, and still in progress:** [ADR-0013](adr/0013-anisotropic-voxel-primitives.md)
widened a voxel block from a cube (`fs`/`s`) to an axis-aligned box with
independent per-axis extents (`fsx/fsy/fsz`, `sx/sy/sz`), and added the
`js/voxelforms.js` authoring layer sitting below `js/voxelkit.js`. It stays
inside the existing pure-sim/render boundary — the extents are pure-sim data
and `voxelworld.js` reads them the way it reads `b.s` today — and every
shipped scene stayed byte-identical. Its debut vehicle is the sixth voxel
scene, [features/cambridge-sandbox/](features/cambridge-sandbox/README.md).
The engine change, the primitive layer, the coin-anchor change, the new
validator probes (`tools/probe-aniso.mjs`, `tools/probe-buildcost2.mjs` — see
`runbooks/run-and-validate.md`'s "Other tools" section; neither runs as part
of `tools/validate.mjs`'s own `ALL PASS`) and Districts 1 through 5 are
committed in `js/voxelscene-cambridge.js`. Districts 6 through 10, Phase 7's
hidden content and achievements, and the Phase 8 sign-off are still ahead. The
scene registration (task P6.12) was pulled forward out of order, so the scene
dispatches from `voxelsim.js`, has its own `validateCambridge()` block in the
validator, and loads from the free-play picker.

## Boot

**Third-party runtime code lives in `js/vendor/` and ships with the game.**
Today that is one file, `js/vendor/three.module.js` — three@0.160.0, 1,272,972
bytes, `REVISION '160'`, 416 named exports — and `index.html`'s import map
resolves the bare specifier `three` to `./js/vendor/three.module.js`. The
directory exists to keep code we do not author out of the hand-written `js/`
namespace: nothing under `js/vendor/` is edited, and a version change means
replacing the file wholesale rather than patching it. The version stays pinned;
vendoring was not an occasion to upgrade.

It used to point at `cdn.jsdelivr.net`, which made a third-party host a hard
dependency of the boot. That fetch failed live (`ERR_CONNECTION_RESET`, and
succeeded on a retry minutes later), no module in `js/` ever evaluated, and the
game sat on its LOADING splash indefinitely. Venue wifi at a conference makes
that a likely failure rather than a theoretical one, and it is the whole reason
the engine is now same-origin. See
[ADR-0014](adr/0014-vendored-same-origin-runtime.md).

**There is no `package.json`, no lockfile and no build step, and that constraint
is load-bearing rather than incidental.** What sits in the repo is byte-for-byte
what the browser gets, which is what makes the deploy story "copy the repo root
to a static host" (`runbooks/run-and-validate.md`) and what lets `tools/` and
`tools/validate.mjs` import the same pure-sim modules under Node with no
transform in between. Vendoring is compatible with all of that — a committed
file is not a build step — where a package manager plus a bundler would put a
generated artifact between the source and both consumers.

**The failure path is explicit, because a slow boot and a broken boot look
identical to a player.** `#boot-splash` is pure HTML/CSS with no JS dependency,
so a 10-15 s cold load never reads as a crashed tab; `js/main.js` removes it
just before the first screen mounts. An inline boot watchdog in `index.html`
covers the case the splash was never designed for. It is deliberately a classic
script rather than a module — the failure it reports is "module loading itself
broke", so anything needing the module graph is useless — and it replaces the
splash text with "The game could not start. Please reload the page to try
again." on either of two triggers: 20 s elapsed with the splash still in the
DOM, or an uncaught error/rejection while it is up. The error listener runs in
the **capture** phase because a module script that cannot fetch itself fires a
non-bubbling error on its own element, which is precisely the case being
watched; targets are filtered to scripts so one missing texture cannot claim the
game failed to start. The contract with `main.js` runs one way and `main.js`
does not know the watchdog exists: every path re-queries the live DOM for the
splash and no-ops if it is already gone, so there is no shared reference to go
stale and no ordering to get wrong.

**`validateOfflineBoot()` in `tools/validate.mjs` keeps it that way.** It parses
`index.html` and fails on any external-origin runtime dependency — an import-map
target, a `<script src>`, or a `<link href>` — and also on a missing or
unparseable import map, since the browser drops a malformed map whole and every
bare `three` import then fails. It was proved in both directions rather than
assumed: pointed back at jsdelivr it exits 1, restored it passes.

**No existing gate can see a broken renderer.** `validate.mjs` drives the pure
sim and never loads `js/voxelworld.js` or the rest of the render ring, so both
`node --check` and a full `ALL PASS` were observed on a renderer file the
browser refuses to parse. The watchdog above is currently the only thing that
surfaces that class of breakage, and confirming a boot means loading the module
graph in a browser — see `runbooks/run-and-validate.md`.

## Key decisions

See `adr/`: 0002 sim/render split, 0003 deterministic seeded generation,
0004 formula-driven levels with validator-enforced margins. Planned (not yet
wired into the game): 0009 Supabase backend, 0011 guest-first identity with
deferred claim, 0012 replay-validated leaderboard trust — see
[features/online-flywheel/](features/online-flywheel/README.md). 0010
host-authoritative arena has code (`js/net/host.js`, see "Boundaries" above)
but no room lifecycle and no call site yet, so it is still pre-launch.
Accepted and shipped: 0013 anisotropic voxel primitives — see
[features/cambridge-sandbox/](features/cambridge-sandbox/README.md); 0014
vendored, same-origin runtime code and the no-build constraint — see "Boot"
above.

## Performance notes

Shared geometries/materials via caches in `world3d.js`; individual meshes per
object (needed for eat animations). Frustum culling handles most of the cost;
if object counts grow, move props to `InstancedMesh` with per-instance eaten
flags (see visual-direction.md).
