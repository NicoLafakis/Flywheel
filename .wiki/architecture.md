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
save.js ◄──► localStorage (schema v17 + migrations)

voxelsim.js ──► voxelworld.js        (voxel sandbox: same split,
 (seed, fixed 60 Hz)                  no citygen/levels)

replay.js ──► Vercel API ──► voxelsim.js replay ──► Supabase public views
 (quantized RUN inputs)  (ticketed)     (server score only)    (records)
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
- **Boards** (`js/board/`, `api/`, `supabase/migrations/`): an optional outer
  ring. The browser may read derived `security_invoker` record views with its
  publishable key, but tickets, traces, names, moderation, and deletion cross
  Vercel only. Server replay is another `voxelsim.js` caller; it cannot write
  gameplay state, and the fixed loop never waits on a request.

**Multi-hole sim & presentation alignment:** `VoxelSandboxSim` (`js/voxelsim.js`) runs a multi-hole roster `sim.holes[]`.
- `sim.localSlot`: Identifies which hole index belongs to the local machine (default `0`).
- `sim.localHole`: Getter returning `sim.holes[this.localSlot]`. Presentation code across `main.js` (controls, camera, audio listener, heading indicator), `hud.js` (mass, SIZE, cleared %, combo), and `voxelworld.js` strictly reads `sim.localHole`, eliminating peer desync and camera jumping.
- `sim.hole`: Maintained as a backward-compatible alias for `sim.holes[0]`.
- `addHole(x, z, opts)`: Appends an additional player hole with specific perimeter spawn coordinates, palette color, and cosmetic skin.
- Support recalculation resolves against the union of all active holes.
- Conflicts (such as two holes reaching the same coin on the same fixed step) resolve in deterministic hole-index order.

**6-Player Synchronized Multiplayer (`js/multiplayer/`):** Built clean-slate on Supabase Realtime Broadcast ([ADR-0019](adr/0019-six-player-invite-lobby-multiplayer.md)), directly integrated into the single-player engine in `js/main.js`:
- `channel.js`: Wraps Supabase Realtime Broadcast (`js/vendor/supabase-realtime.module.js`) with an outbound message queue that buffers transmissions until `SUBSCRIBED` confirmation, eliminating join race conditions.
- `protocol.js`: Fast binary-compatible message definitions (`JOIN_REQUEST`, `ROOM_STATE`, `START_GAME`, `PLAYER_MOVE`, `STATE_SYNC`, `PVP_KILL`, `CHAT_MESSAGE`, `GAME_OVER`).
- `lobby.js`: Pre-game room management (2..6 players), 5-character alphanumeric room codes, shareable invite links (`?room=CODE`), ephemeral in-memory chat, and an unskippable 3.0s auto-countdown when the lobby fills.
- `host.js`: Authoritative host simulation running `sim.step(1/60, moves)` at 60 Hz, broadcasting state syncs, detecting PvP hole swallowing ($r_\text{killer} > r_\text{victim} \times 1.05$), awarding +50% mass bounties, and managing 10s perimeter respawns.
- `peer.js`: Follower loop sending steering intents and reconciling authoritative state syncs with local interpolation.
- `ui.js`: DOM-based multiplayer lobby, room code sharing, ephemeral chat view, in-game 10s respawn timeout overlays, and post-match victory podium rankings.

**Zero-storage networking guarantee:** Multiplayer is completely ephemeral and does not write state to database tables or localStorage during matches. Matches run directly within the standard engine and deposit only the local player's earned match coins into `save.coins` upon victory podium display.

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
it was eaten — previously the keyframe's eaten bitset was anonymous. The wire is now at **protocol v4**, which widened
the per-hole `mass_q` field from u16 to u32 — the u16 hard-clamped a peer's
readable score at 16383.75, within 11% of the shipped Chicago route's own
maximum (T-307). Craters
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

**Game audio, shipped 2026-08-11, main-game wiring landed the same day; split
into independent Effects/Ambience/Music levels 2026-08-12:**
`js/audio/engine.js` (pooled decoded
buffers, sfx/ambience buses, listener-fatigue ducking so repeat sounds decay
instead of stacking, ambience ducking under big hits, mobile-safe autoplay
unlock on first gesture) has no master volume: its master gain carries mute
and nothing else, and each bus holds its own persisted level —
`flywheel.audio.volume` for effects (`sfx` bus), `flywheel.audio.ambVolume`
for ambience (`amb` bus, scaled by a fixed `AMB_GAIN`). The three defaults
(0.7 effects, 0.4 ambience, 0.3 music), the four localStorage keys, and a
one-time `reseedAudioMix()` that moves an already-installed player onto a
retuned mix without a schema bump all live in the dependency-free
`js/audio/mix.js`; `engine.js`, `music.js`, `save.js`, and
`js/ui/screens.js` import from there instead of restating the numbers, and
the reseed itself runs from both the `AudioEngine` and `MusicDirector`
constructors so the arena, hot-seat demo, and scene viewer land on the new
mix too. `duckAmbience()`
ducks to and restores from the live ambience level rather than a hardcoded
constant, so a slider change during a duck ramp still wins. `js/audio/game-audio.js`
is the facade over the engine and `MusicDirector` (the themed event map — eat
gulps pitched deeper as the hole grows, a combo tick ladder, weight-tiered
collapse sounds, milestone/roar/win/lose stingers, per-city ambience beds, and
the derailment screech-then-crash, wired to the `derail` sim event); its
`setVolume()` governs effects only and no longer reaches into music. Positional
events (`crash`, `derail`) attenuate by distance from the local hole — full
inside 25 m, gone at 160 m — fed per frame via `updateListener(x, z,
moverSim)`; the same feed drives the Chicago el-train bed, which tracks the
nearest car still on the rails (base level 0.3 after the flat 0.5 read as
plainly loud). Render-side only, same rule as the rest of the render ring: it
reads drained sim events and never writes sim state (ADR-0003). 32 CC0 sound
files ship in `assets/audio/` (1.25 MB); `CREDITS.md` +
`assets/audio/CREDITS.json` carry the per-file source/author/license
manifest, and both landing screens show the small-type credit line. Wired
into `js/main.js` (the `blip()` oscillator is deleted: sandbox + campaign
events, scene beds, win/lose, and a delegated menu-click listener),
`arena.html`, the hot-seat `multiplayer.html` demo, and
`tools/scene-view.html`. The settings screen's mute toggle now sits above
three independent sliders — Effects, Ambience, Music — each of which drives
only its own bus (`save` mirrors all of it into the engine's localStorage
keys, so the arena — which has no save — inherits the same choices). Known
gaps: the arena PEER feeds no mover positions (its sim never steps), so its
el bed stays flat; `debris-metal.ogg` is preloaded but has no call site yet.
Collapse sounds are pooled per BUILDING rather than per falling chunk: the
sim's `crash` event fires once per chunk that lands hard, so nearby impacts are
gathered render-side into one collapse, voiced once on their combined block
count, and anything short of a real collapse is silent. Bus/level split
coverage lives in `js/audio/engine.test.mjs` and collapse pooling in
`js/audio/game-audio.test.mjs`. Full detail in `modules/audio.md`.

**Original game music, built 2026-08-11:** `js/audio/music.js` streams one of
ten proprietary MP3s from `assets/music/` through a reusable media element,
rather than decoding the 47.49 MiB library into the SFX pool. A data registry
maps menu, shop, pause, results, Brooklyn, Boston, Cambridge, Chicago, Lower
Manhattan and Upper Manhattan; Gallery is deliberately silent. Cue offsets
survive pause/shop detours, visibility changes pause/resume the appropriate
cue, and `GameAudio` ducks music beneath major stingers. Music volume persists
independently at `flywheel.audio.musicVolume` under mute only — since the
2026-08-12 split, neither the Effects nor the Ambience slider reaches it.
The main game and arena both use the same facade and registry. Lifecycle
behavior (cue selection, offset retention, visibility pause/resume, ducking)
is covered by `js/audio/music.test.mjs`; the ten committed MP3s and their
hashes are pinned against `assets/music/MANIFEST.json` by
`tools/music-assets-selftest.mjs`, run standalone rather than folded into
`tools/validate.mjs`'s pure-sim chain since it checks shipped binary assets,
not sim determinism.

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

**Cache policy is declared in `vercel.json`, and it splits on mutability
(2026-08-12).** `/assets/**` (audio, music, skins — content that changes only
by deliberate asset swap) ships `immutable` for a year; `/js/**` and `/css/**`
ship `max-age=300` with a week of `stale-while-revalidate`, so a redeploy
reaches players in minutes while a repeat visit never re-downloads the module
graph in the critical path.

**The six city scene modules are fetched on demand, not at boot (2026-08-12).**
`voxelsim.js` keeps an importer registry (`loadScene`/`sceneReady`); the title
screen, the menu backdrop, the single-player start path and the arena each
await exactly the one city they are about to build. The six are 1.19 MB of
source between them and a session plays one, so static imports put most of an
18.6 s throttled cold load in front of the title screen for nothing. The
sim constructor stays synchronous and throws by name if a city was not awaited
first — see `.wiki/modules/voxel.md`'s module table.

**A backgrounded tab stops entirely, and a noisy `resize` costs nothing
(2026-08-12).** `main.js`'s loop cancels its own animation frame on
`visibilitychange` (a hidden mid-run game also lands on the pause screen —
coming back to a city that kept collapsing without you is the same bad
surprise either way) and resets both the accumulator and the frame clock on
return, so a suspended tab does zero renders, zero sim steps and no GPU work,
and cannot try to replay its absence. `resize` events are coalesced to one
reallocation per frame and dropped entirely when the size did not actually
change, because mobile browsers fire them continuously through the URL-bar
collapse animation during normal play.

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
