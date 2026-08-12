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
  GameAudio wiring (see the audio section below).

**Multi-hole sim, shipped 2026-08-10:** `VoxelSandboxSim` now runs a roster,
`sim.holes[]`, rather than one hole. `sim.hole` is kept as an accessor for
`holes[0]` (`get hole()`/`set hole()`), so every pre-existing single-player
read and write keeps working unchanged — this is what makes the roster a
non-breaking refactor rather than a rewrite. `addHole(x, z)` appends a hole
with the next roster index; `step()` takes either the legacy single `move`
or an array of moves (one per hole, index-aligned) — `sim.step.length` is
deliberately still 2, since `js/net/host.js` feature-detects the array form.
Support recalculation resolves against the **union** of every hole's
influence rather than each hole's own, which fixed a real artifact (one
hole's undermining getting partially healed by the other hole's presence
elsewhere); conflicts (two holes reaching the same coin the same step)
resolve in hole-index order, deterministically. `js/demo/duel.js` — the
hot-seat two-player demo — is now a thin wrapper over the native roster
(`sim.holes[0]`/`addHole` for the second player, one real `sim.step(dt,
moves)` per frame) instead of its original dt-slicing hack (bind hole A, step
half the frame, bind hole B, step the other half); the wrapper's public API
(`step`, `drain`, `hole`, `fraction`) is unchanged, so `js/demo/demo.js`
needed no edits. New test: `js/voxelsim.multihole.test.mjs` (roster shape,
call-shape equivalence, two-hole determinism, independent per-hole
accumulation, shared-world conservation, and the duel-heal fix specifically).
Single-player behavior was verified bit-identical to pre-refactor HEAD across
three scenes.

**Built and wired end to end, live on a real URL (2026-08-10):** the fourth
**net** ring proposed in
[features/online-flywheel/03-technical-design.md](features/online-flywheel/03-technical-design.md)
went from standalone skeleton to a playable two-device product in one day,
in `js/net/`:

- `driver.js` — the driver seam (`decide(hole, world, dt)`), `HumanDriver`,
  `PeerDriver`, `IdleDriver` — unchanged since first landing.
- `protocol.js` — versioned message codecs, validated against hostile
  payloads; gained a `REJECT` control message so a refused JOIN (room full,
  match locked) is distinguishable on the wire from "nobody there" (a
  timeout alone can't tell the two apart).
- `snapshot.js`, `transport.js` — unchanged in shape; `transport.js`'s
  `LoopbackTransport` (latency/jitter/drop simulation) now has a real
  Supabase Realtime sibling, not just a stub — see below.
- `host.js` — promoted from a loop skeleton to the real authority: it feeds
  the full per-slot moves array into the multi-hole sim
  (`sim.step(dt, moves)`), broadcasts snapshots, and ships the promised RLE
  eaten bitset in keyframes.
- `peer.js` (**new**) — the follower loop: fixed-cadence intents, snapshot
  interpolation, own-hole prediction with banded reconciliation
  (ignore/smooth/snap), and keyframe healing when a client falls behind.
  **Naming note:** the design docs call the host/peer pair
  `arena-host.js`/`arena-peer.js`; they ship as `host.js`/`peer.js` — the
  rename never happened, and the file-header comments explain why (it was
  meant to land alongside the room-lifecycle file, which shipped the same
  day as `arena.js`, at which point renaming stopped being worth doing).
- `arena.js` (**new**, T-603 minimal cut) — room lifecycle: 5-symbol codes
  from a 27-symbol no-vowel, no-confusables alphabet
  (`BCDFGHJKMNPQRSTVWXZ23456789`) minted client-side via
  `crypto.getRandomValues`; forgiving code normalization (lowercase, dashes,
  a pasted `?room=` invite URL); a deterministic `deriveSeed(code)` so every
  client builds the identical city (ADR-0003); JOIN/WELCOME/REJECT/ROSTER
  handshake with room-full and no-host errors and a "HOST LEFT" freeze.
  Server-minted rooms/seeds (T-602) and host succession (T-606) are explicit,
  named non-goals of this cut — see
  [features/online-flywheel/13-tasks.md](features/online-flywheel/13-tasks.md).
- `client.js` + `supabase-config.js` (**new**) — the one file
  (`client.js`) that imports the vendored Supabase Realtime client;
  everything else in `js/net/` goes through it. `supabase-config.js` holds
  only the project URL and the publishable key (both public-by-design browser
  values; the secret key never leaves `.env.local`).
- `js/vendor/supabase-realtime.module.js` (**new**) — `@supabase/realtime-js`
  2.112.2, bundled once to a single self-contained 135 KB ESM file and
  committed same-origin, same pattern as `js/vendor/three.module.js`
  (ADR-0014): pinned, never edited, replaced wholesale to upgrade. The full
  `supabase-js` (auth + PostgREST + storage + functions, ~500 KB) was
  skipped — Realtime broadcast is the only capability with a caller today.

Two proof surfaces, both new: `netdemo.html` + `js/demo/netdemo.js` run a
host and a peer in one page over `LoopbackHub` (120 ms latency / 30 ms
jitter / 5% drop) — the right half of the page renders purely from the wire,
nothing but wire messages crosses to it. `arena.html` + `js/demo/arena.js`
is the real product: HOST A CITY / JOIN A CITY, a giant shareable code plus
a copyable `?room=` invite link that auto-joins, a touch joystick for
mobile, score plates, a 3-minute clock, a winner banner, RECONNECTING and
HOST LEFT states. It runs the same netcode stack as `netdemo.html` with
`LoopbackHub` swapped for the real Supabase Realtime transport through the
existing seam — swapping the transport was the entire diff needed to go
from loopback proof to two phones on the internet. **Proven live**: a
two-browser-context match played to completion against the deployed
project, at https://flywheel-woad.vercel.app/arena.html.

Self-tests: `tools/net-match-selftest.mjs` (48 checks, including a bit-exact
host replay), `tools/arena-selftest.mjs` (48 offline checks — codes,
normalization, seeds, handshake, room-full, no-host, the REJECT guard), and
`tools/net-live-selftest.mjs` (18/18 against the real Supabase project —
subscribe, both-direction binary and control frames, RTT, clean disconnect;
kept out of the default validate chain since it needs live credentials and a
network).

**Discoverable from the title screen as of 2026-08-11, still not reachable
from `js/main.js`'s state machine.** `index.html` now carries a MULTIPLAYER
plate on the title screen (styled in the landing chips' own vocabulary — dark
plate, gold accent bar, 2P tag, gold hover), gated by a CSS `:has()` rule so
it only exists while the landing screen is mounted (never over gameplay, HUD,
pause, shop, or the boot splash) — zero JS, no edits to `js/main.js` or
`js/ui/screens.js`, fails safe to hidden on browsers too old for `:has()`.
It links to `/arena`, served extensionless by the new `vercel.json`'s
`cleanUrls`, which also 307-redirects `/multiplayer` to `/arena` so both
guessable names land on the online arena. `arena.html` and `netdemo.html`
are still standalone pages outside the campaign/sandbox state machine,
exactly like the hot-seat `multiplayer.html` demo below — the button makes
the arena a click away from the title screen, it does not fold it into
`main.js`'s screens. Deferred, with the seam each will use noted in
[features/online-flywheel/13-tasks.md](features/online-flywheel/13-tasks.md):
host migration/succession (T-606 — a vanished host freezes the match today
rather than electing a new one), spectators, more than two players (the
netcode itself supports up to 8 via `LIMITS.MAX_HOLES`; `arena.js`/`arena.html`
seat exactly 2), server-minted rooms (T-602), and peer-side debris cosmetics.
Its invariants hold as designed: the net layer never writes sim state outside
`sim.step()` (there is exactly one `sim.step()` call in `host.js` and no
other assignment to a sim field), it never imports three.js, a client's score
is never the record, and the network is optional at every point.

**Rival visibility, phases A-D shipped (2026-08-11), new `js/rival/` ring:**
out of a live two-phone playtest complaint ("no sense of whose blocks were
eaten"), a render-only layer sits on top of the net/sim boundary without
writing sim state — `js/rival/identity.js` (per-slot color identity),
`attribution.js` (per-object eater record — `cityRawMassOf(sim)` is the one
raw-mass lookup over the whole object-id space, blocks and mover units alike,
so a swallowed el-train car credits its declared raw mass to the eater's
tug-bar/reveal tally exactly as the solo sim scores it, not the 0 a
blocks-only lookup used to return), `territory.js` +
`territory-layer.js` (crater tinting), `tugbar.js` (coarse-until-the-end
tug-of-war bar), `offscreen.js` (off-screen/apart rival chevron),
`beats.js`/`announce.js` (milestone callouts), and `reveal.js` (end-of-match
territory reveal, paired with a new follow-zoom arena camera that only pulls
back to a full-city view at that reveal). This closed the one real wire gap
the package found: **protocol v3** (`js/net/protocol.js`) adds per-slot eaten
RLE streams to keyframe payloads, so a client healing from a keyframe (a late
joiner, or any peer that fell behind) learns *who* ate a block, not just that
it was eaten — previously the keyframe's eaten bitset was anonymous. Craters
and the tug bar are also shared onto the hot-seat `multiplayer.html` demo.
Headless coverage: `js/rival/rival.test.mjs`. Two patterns from the package's
seven (size-as-threat legibility and its own tasks T11/T12) are deliberately
deferred until 8-player support lands, per the package's build order — see
[features/rival-visibility/README.md](features/rival-visibility/README.md).

**Train derail/ground-run/eatable, shipped 2026-08-11:** the render-only mover
seam (`sim.sceneMovers` + `moverArc`/`moverPose`) gained a simulated half in
`js/voxelsim.js` — a mover opts in via `sim: {derail, groundRun, eatable}`
capability flags, not train-specific code, so any current or future mover
(boats, streetcars) can inherit derailment for free. Each unit samples the
track deck under its bogies on the fine grid; a full-width gap derails it
(uniform gravity, the same pre-move-base landing rule RCA-2026-08-11 fixed),
a grounded car keeps driving its route at street level as a runaway, and a
derailed (falling/grounded) car becomes eatable through the real consumption
path (`_award`, extracted from `_consume`) — elevated cars on intact track
are deliberately not eatable. Unit ids extend the block id space
(`sim.objectIdSpace`, adopted by `js/net/host.js`), so a swallowed car needs
zero new wire format: the keyframe eaten bitset already covers it, and a
peer's derived train state converges on the same keyframe heal every other
consumed object does. `js/voxelscene-chicago.js`'s CTA train is the only
mover using it today; `tools/train-derail-selftest.mjs` (39 checks, expanded
2026-08-11) pins determinism, consumption attribution, host/peer convergence
over lossy loopback, and **arena scoring parity** — a car swallowed inside a
live `ArenaHost` match now credits its full 75 raw mass to the eater's
attribution record (`js/demo/arena.js` builds that record over
`cityRawMassOf`), converging host and peer the same way block eats do. Full
detail lives in `modules/voxel.md`'s chicago section.

**Game audio, shipped 2026-08-11, main-game wiring landed the same day:**
`js/audio/engine.js` (pooled decoded
buffers, sfx/ambience buses, listener-fatigue ducking so repeat sounds decay
instead of stacking, ambience ducking under big hits, persistent mute AND a
persisted volume setting — `flywheel.audio.muted` / `flywheel.audio.volume`,
mobile-safe autoplay unlock on first gesture) and `js/audio/game-audio.js`
(the themed event map — eat gulps pitched deeper as the hole grows, a combo
tick ladder, weight-tiered collapse sounds, milestone/roar/win/lose stingers,
per-city ambience beds, and the derailment screech-then-crash, wired to the
`derail` sim event). Positional events (`crash`, `derail`) attenuate by
distance from the local hole — full inside 25 m, gone at 160 m — fed per
frame via `updateListener(x, z, moverSim)`; the same feed drives the Chicago
el-train bed, which tracks the nearest car still on the rails (base level
0.3 after the flat 0.5 read as plainly loud). Render-side only, same rule as
the rest of the render ring: it reads drained sim events and never writes
sim state (ADR-0003). 32 CC0 sound files ship in `assets/audio/` (1.25 MB);
`CREDITS.md` + `assets/audio/CREDITS.json` carry the per-file
source/author/license manifest, and both landing screens show the small-type
credit line. Wired into `js/main.js` (the `blip()` oscillator is deleted:
sandbox + campaign events, scene beds, win/lose, and a delegated menu-click
listener), `arena.html`, the hot-seat `multiplayer.html` demo, and
`tools/scene-view.html`. The settings screen's mute toggle and volume slider
drive the engine (`save` mirrors into the engine's localStorage keys, so the
arena — which has no save — inherits the same setting). Known gaps: the
arena PEER feeds no mover positions (its sim never steps), so its el bed
stays flat; `debris-metal.ogg` is preloaded but has no call site yet.

**Original game music, built 2026-08-11:** `js/audio/music.js` streams one of
ten proprietary MP3s from `assets/music/` through a reusable media element,
rather than decoding the 47.49 MiB library into the SFX pool. A data registry
maps menu, shop, pause, results, Brooklyn, Boston, Cambridge, Chicago, Lower
Manhattan and Upper Manhattan; Gallery is deliberately silent. Cue offsets
survive pause/shop detours, visibility changes pause/resume the appropriate
cue, and `GameAudio` ducks music beneath major stingers. Music volume persists
independently at `flywheel.audio.musicVolume` under the existing mute/master.
The main game and arena both use the same facade and registry.

**Also built (2026-08-10), separate surface:** `multiplayer.html` + `js/demo/`
is a hot-seat two-player demo — two holes sharing one gallery sim, rendered by
its own overhead camera (`js/demo/view.js`) and its own loop
(`js/demo/demo.js`), entirely outside `main.js`'s screen state machine, HUD
and chase camera. It does not use `js/net/` — both players are local input on
one machine. `js/demo/duel.js` is now a thin wrapper over the sim's native
multi-hole roster (see above) rather than a dt-slicing hack, so the artifact
this section used to describe (each hole's support recalc partially
re-healing the rim the other hole was undermining) is gone — the union-based
support recalc in `voxelsim.js` fixed it at the source, for every caller of
multiple holes, not just this demo.

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
host-authoritative arena is **shipped as a standalone product** (`js/net/host.js`
+ `peer.js` + `arena.js`, live over Supabase Realtime at
https://flywheel-woad.vercel.app/arena.html, and discoverable from the title
screen's MULTIPLAYER plate since 2026-08-11 — see "Boundaries" above) but not
called from `js/main.js` or any campaign/sandbox screen, so it is proven,
playable, and a click away, not yet integrated. Accepted and shipped: 0013 anisotropic voxel
primitives — see [features/cambridge-sandbox/](features/cambridge-sandbox/README.md);
0014 vendored, same-origin runtime code and the no-build constraint — see
"Boot" above (now also the pattern `js/vendor/supabase-realtime.module.js`
follows).

## Performance notes

Shared geometries/materials via caches in `world3d.js`; individual meshes per
object (needed for eat animations). Frustum culling handles most of the cost;
if object counts grow, move props to `InstancedMesh` with per-instance eaten
flags (see visual-direction.md).
