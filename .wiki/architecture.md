---
covers:
  - "js/**"
  - "index.html"
  - "tools/**"
  - "old_voxelsim.js"
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
  `voxelsim.js`, `fwmath.js` (Taylor-polynomial transcendentals so a browser
  and the Node verifier round the same way — see the "Boot" section's replay
  note), `citycatalog.js` (city metadata and unlock ordering, headless
  Node-safe), `powerups.js` (power-up catalog and deterministic state
  updates), plus the voxel authoring layers `voxelforms.js` and `voxelkit.js`
  and the scene files `voxelscene-*.js`, among them `voxelscene-cambridge.js`
  and `voxelscene-tokyo.js`): no three.js imports, no DOM, no `Math.random()`.
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

**`old_voxelsim.js` (repo root) is dead code, not a boundary.** It is an
earlier, now-superseded snapshot of the voxel sandbox sim — `index.html` does
not reference it, no `js/` module imports it, and no tool or test path touches
it (confirmed by a repository-wide search). It is not part of the pure-sim
boundary above and should not be edited or imported; it is slated for deletion
whenever a change touches the repo root, but removing it is out of scope for a
documentation-only pass.

**Multi-hole sim & presentation alignment:** `VoxelSandboxSim` (`js/voxelsim.js`) runs a multi-hole roster `sim.holes[]`.
- `sim.localSlot`: Identifies which hole index belongs to the local machine (default `0`).
- `sim.localHole`: Getter returning `sim.holes[this.localSlot]`. Presentation code across `main.js` (controls, camera, audio listener, heading indicator), `hud.js` (mass, SIZE, cleared %, combo), and `voxelworld.js` strictly reads `sim.localHole`, eliminating peer desync and camera jumping.
- `sim.hole`: Maintained as a backward-compatible alias for `sim.holes[0]`.
- `addHole(x, z, opts)`: Appends an additional player hole with specific perimeter spawn coordinates, palette color, and cosmetic skin.
- Support recalculation resolves against the union of all active holes.
- Conflicts (such as two holes reaching the same coin on the same fixed step) resolve in deterministic hole-index order.

**6-Player Synchronized Multiplayer (`js/multiplayer/`):** Built clean-slate on Supabase Realtime Broadcast ([ADR-0019](adr/0019-six-player-invite-lobby-multiplayer.md)), directly integrated into the single-player engine in `js/main.js`:
- `channel.js`: Wraps Supabase Realtime Broadcast (`js/vendor/supabase-realtime.module.js`) with an outbound message queue that buffers transmissions until `SUBSCRIBED` confirmation, eliminating join race conditions.
- `protocol.js`: Message type registry and validation gate — `JOIN_REQUEST`, `JOIN_ACCEPT`/`JOIN_REJECT`, `ROOM_STATE`, `PLAYER_JOIN`/`PLAYER_LEAVE`, `LOBBY_CHAT`, `COUNTDOWN_START`/`COUNTDOWN_CANCEL`, `GAME_START`, `INPUT_TICK`, `STATE_SYNC`, `PVP_KILL`, `POWERUP_EVENT`, `GAME_OVER`. `HOST_ONLY_TYPES` lists which of these only the authoritative host may originate — a peer that accepted a forged `STATE_SYNC` or `GAME_OVER` from an arbitrary sender could be told the match ended or handed a fake roster. `PLAYER_LEAVE` is deliberately the one exception: both the host (detecting a drop via presence) and a client announcing its own graceful exit are honest senders, so `isAuthorizedLeave` gates it on sender-equals-leaver rather than on host-only. `validateMessage()` is the single point every inbound message passes through: unknown types, out-of-range slot indices, non-array roster/leaderboard fields and any non-finite number anywhere in the payload are all dropped before a listener sees them.
- `config.js`: The shared constants both host and peer read rather than each carrying its own copy — `MAX_PLAYERS` (6), room-code length, `COUNTDOWN_TICKS` (180 = 3.0s at 60 Hz, derived so the tick count and the seconds can never silently disagree), `HOST_SILENCE_TIMEOUT_MS` (5000, roughly 300 missed `STATE_SYNC` messages), `HOST_HEARTBEAT_MS` (1000, so an alt-tabbed host whose render loop is cancelled still proves it is alive), `PVP_RESPAWN_TIMEOUT_SECONDS` (10), chat length/rate limits, and `PLAYER_PALETTES` (the one per-slot color table every surface reads).
- `roster.js`: The slot-indexed roster — spawn geometry, hole configs, and the one leaderboard shape both podium paths render. Deliberately never compacted: `INPUT_TICK`/`STATE_SYNC` key by slot and `sim.holes[slot]`/`sim.localSlot` index by slot, so a filtered array would silently reassign a departed player's slot to someone else's hole.
- `sanitize.js`: Escapes names, chat text and slot colors arriving off the open broadcast channel before they can reach `innerHTML` or a `style="…"` attribute — anyone holding the 5-letter room code can write to it, so every value from the wire is treated as hostile input.
- `lobby.js`: Pre-game room management (2..6 players), 5-character alphanumeric room codes, shareable invite links (`?room=CODE`), ephemeral in-memory chat, and start control. Filling the room does **not** start the match (that auto-start was removed 2026-08-17): an unskippable 3.0s countdown is armed either by the host's start button, or by a unanimous `START_VOTE` of the non-hosts once the host has been idle 45s with at least 3 players seated. `START_VOTE` is therefore *not* host-only — a client casts its own — but the countdown it produces is still broadcast by the host alone, and the vote gate itself is host-declared via `ROOM_STATE.startVoteOpen` because a peer can only observe host traffic, never host silence.
- `host.js`: Authoritative host simulation running `sim.step(1/60, moves)` at 60 Hz, broadcasting state syncs, detecting PvP hole swallowing ($r_\text{killer} > r_\text{victim} \times 1.05$), awarding +50% mass bounties, and managing 10s perimeter respawns. Also owns connection lifecycle: a heartbeat proves the host is alive while its render loop is suspended (backgrounded tab), and `PLAYER_LEAVE` handling is idempotent because presence detection and an explicit leave message routinely both fire for the same departure.
- `peer.js`: Follower loop sending steering intents and reconciling authoritative state syncs with local interpolation; runs its own host-silence watchdog so a peer whose host disappeared (closed tab, dead connection) ends the match locally rather than staring at a frozen city.
- `ui.js`: DOM-based multiplayer lobby, room code sharing, ephemeral chat view, in-game 10s respawn timeout overlays, and post-match per-player victory podium rankings.

Full detail — the host-authoritative match clock (T-635), the shared coin pool (T-636), per-player coin isolation, and the podium music fix — lives in `modules/multiplayer.md`.

**Zero-storage networking guarantee:** Multiplayer is completely ephemeral and does not write state to database tables or localStorage during matches. Matches run directly within the standard engine and deposit only the local player's earned match coins into `save.coins` upon victory podium display.

**Rival visibility, phases A-D shipped 2026-08-11, retired 2026-08-16:** a
render-only `js/rival/` ring (per-slot color identity, per-object eater
attribution, crater tinting, a coarse tug-of-war bar, an off-screen chevron,
milestone callouts, and an end-of-match territory reveal) shipped on top of
the original `js/net/` prototype arena. It was removed wholesale in the
2026-08-16 legacy-multiplayer purge alongside `js/net/`, `js/demo/`,
`arena.html`, `multiplayer.html` and `netdemo.html` (see STATUS.md's "Scrapped
Legacy Multiplayer" entry and "Key decisions" below) — `js/rival/` does not
exist in the current tree. The clean-slate `js/multiplayer/` replacement kept
only the PvP takedown announcement (`hud.announce`, via `host.js`'s PvP
detection) from that package; per-slot craters, the tug bar, the off-screen
chevron and the territory reveal have no equivalent today. [The
rival-visibility feature package](features/rival-visibility/README.md) is
kept as a historical design record of what phases A-D built and why (the
two-phone playtest complaint that motivated it, the protocol changes it
required), not as a description of anything currently running.

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
(`sim.objectIdSpace`), so a swallowed car is just another consumed object as
far as any caller iterating that space is concerned.
`js/voxelscene-chicago.js`'s CTA train is the only mover using it today;
`tools/train-derail-selftest.mjs` (39 checks, expanded 2026-08-11) pins
determinism and consumption attribution against the pure sim directly. Its
header comment still describes a host/peer convergence pass over an
`ArenaHost`/`ArenaPeer` pair and `cityRawMassOf(sim)` — both were part of the
`js/net/`/`js/demo/arena.js` prototype removed 2026-08-16 (`cityRawMassOf` no
longer exists anywhere in `js/`), so that part of the file's own header is
stale; `js/multiplayer/host.js` and `peer.js` do not currently reference
`objectIdSpace`, `sceneMovers` or the derail mover system at all, so train
consumption inside a live `js/multiplayer/` match is unverified rather than
covered. Full derail/ground-run/eatable detail lives in `modules/voxel.md`'s
chicago section.

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
constructors so any saveless surface (`tools/scene-view.html` today) lands on
the new mix too, not only the main game. `duckAmbience()`
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
events, scene beds, win/lose, and a delegated menu-click listener — this same
path covers both single-player and `js/multiplayer/` matches, since both read
`sim.localHole`) and `tools/scene-view.html`. The settings screen's mute
toggle now sits above three independent sliders — Effects, Ambience, Music —
each of which drives only its own bus (`save` mirrors all of it into the
engine's localStorage keys, so a saveless surface like the scene viewer
inherits the same choices via `reseedAudioMix()` instead). Known gap:
`debris-metal.ogg` is preloaded but has no call site yet.
Collapse sounds are pooled per BUILDING rather than per falling chunk: the
sim's `crash` event fires once per chunk that lands hard, so nearby impacts are
gathered render-side into one collapse, voiced once on their combined block
count, and anything short of a real collapse is silent. Bus/level split
coverage lives in `js/audio/engine.test.mjs` and collapse pooling in
`js/audio/game-audio.test.mjs`. Full detail in `modules/audio.md`.

**Original game music, built 2026-08-11:** `js/audio/music.js` streams one of
ten proprietary MP3s from `assets/music/` through a reusable media element,
rather than decoding the 47.49 MiB library into the SFX pool. A data registry
maps each city plus menu, shop, pause and results (`title` and `victory` are
aliases onto the menu and results tracks respectively, and `tokyo` aliases
onto `lower-manhattan.mp3` — full alias list in `modules/audio.md`); Gallery
is deliberately silent. Cue offsets survive pause/shop detours, visibility
changes pause/resume the appropriate cue, and `GameAudio` ducks music beneath
major stingers. Music volume persists independently at
`flywheel.audio.musicVolume` under mute only — since the 2026-08-12 split,
neither the Effects nor the Ambience slider reaches it. Every surface that
plays music — the main game, `js/multiplayer/` matches (same `main.js` loop),
and `tools/scene-view.html` — uses this one facade and registry. Lifecycle
behavior (cue selection, offset retention, visibility pause/resume, ducking)
is covered by `js/audio/music.test.mjs`; the ten committed MP3s and their
hashes are pinned against `assets/music/MANIFEST.json` by
`tools/music-assets-selftest.mjs`, run standalone rather than folded into
`tools/validate.mjs`'s pure-sim chain since it checks shipped binary assets,
not sim determinism.

**Retired 2026-08-16:** a separate hot-seat two-player demo (`multiplayer.html`
+ `js/demo/` — its own overhead camera in `view.js`, its own loop in
`demo.js`, a thin `duel.js` wrapper over the sim's multi-hole roster, entirely
outside `main.js`'s screen state machine) shared the union-based multi-hole
support-recalc fix documented above with the rest of the engine, but ran
outside `main.js` on its own page. It was removed in the same purge as
`js/net/`, `arena.html` and `netdemo.html` (see "Key decisions" below); there
is no standalone hot-seat surface today. Local multi-hole play now happens
only through `js/multiplayer/`, which is always networked (host + peers over
Supabase Realtime), even when every peer happens to be on the same machine.

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

**The city scene modules are fetched on demand, not at boot (2026-08-12).**
`voxelsim.js` keeps an importer registry (`loadScene`/`sceneReady`) for the
seven authored scenes that are not the gallery (Manhattan, Upper Manhattan,
Brooklyn, Boston, Cambridge, Chicago, Tokyo — the gallery is built inline in
`_buildScene` and needs no import); the title screen, the menu backdrop, the
single-player start path and `js/multiplayer/`'s scene selection each await
exactly the one city they are about to build. The seven are ~1.11 MB of source
between them and a session plays one, so static imports would put most of an
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
deferred claim, 0012 replay-validated leaderboard trust. The original
host-authoritative arena design (0010) and its `features/online-flywheel/`
design package were scrapped on 2026-08-16 along with the standalone
`js/net/` prototype (`host.js` + `peer.js` + `arena.js`) it shipped as; see
STATUS.md's "Scrapped Legacy Multiplayer" entry. 0019 six-player invite-link
lobby multiplayer is its accepted, clean-slate replacement and is shipped and
integrated (`js/multiplayer/`) — see
[features/multiplayer/](features/multiplayer/README.md). Accepted and shipped: 0013 anisotropic voxel
primitives — see [features/cambridge-sandbox/](features/cambridge-sandbox/README.md);
0014 vendored, same-origin runtime code and the no-build constraint — see
"Boot" above (now also the pattern `js/vendor/supabase-realtime.module.js`
follows).

## Performance notes

Shared geometries/materials via caches in `world3d.js`; individual meshes per
object (needed for eat animations). Frustum culling handles most of the cost;
if object counts grow, move props to `InstancedMesh` with per-instance eaten
flags (see visual-direction.md).
