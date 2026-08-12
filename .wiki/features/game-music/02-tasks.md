# Game Music — Implementation Plan

> [Objective overview](00-objective-overview.md) · [Requirements](01-requirements.md)

- [x] **0. Record supplied owner decisions** — dedicated Lower Manhattan and
  Shop cues are present; the ten tracks are original work created by Nico with
  Suno and their copyright is owned by the project.
- [x] **1. Resolve the remaining Gallery decision** — Gallery stays deliberately
  music-free while retaining SFX and environmental ambience.
- [x] **2a. Prepare the ten shipping assets** — moved to lowercase kebab-case
  paths under `assets/music/`; manifest byte sizes/hashes and total shipped
  bytes are pinned by `tools/music-assets-selftest.mjs`.
- [ ] **2b. Complete objective master analysis** — measure duration, codec,
  integrated LUFS, and true peak; normalize offline if needed to meet the ±1 LU
  / -1 dBTP gate. Blocked only on an audio-analysis binary not present here.
- [x] **3. Add the streamed music director** — files: `js/audio/music.js` plus
  a focused Node test; implement the cue registry, one reusable media element,
  retained cue offsets, idempotent switching, fade transitions, failure
  handling, visibility/pagehide behavior, and localStorage-backed music level;
  done when lifecycle tests cover duplicate requests, pause/resume position,
  missing media, mute, master × music volume, and hidden-page recovery.
- [x] **4. Extend the shared audio facade** — files:
  `js/audio/game-audio.js`, `js/audio/engine.js`; make `GameAudio` own the
  director, route global mute/master changes to it, expose music-volume access,
  and duck music under the existing major-event set; done when callers still
  use one audio object and no audio path mutates sim state.
- [x] **5. Wire main-game lifecycle** — files: `js/main.js`; request menu,
  shop, city, pause, resumed-city, and results cues at existing state transitions;
  stop music on teardown only when no successor state owns a cue; done when
  every transition in the requirements is represented once and repeated
  screen renders cannot stack playback.
- [x] **6. Add the GUI setting without a save migration** — files:
  `js/ui/screens.js`; add a `Music volume` slider with an accessible label and
  immediate feedback through the `actions` boundary; keep persistence in
  `flywheel.audio.musicVolume`, not `save.settings`; done when reload and later
  arena entry restore the same value.
- [x] **7. Wire arena lifecycle** — files: `js/demo/arena.js`; use main-menu
  music for host/join, the host-selected city cue during a match, and post-game
  music for results; done when both host and peer request identical cue ids and
  arena needs no save import.
- [x] **8. Update living docs** — files: `STATUS.md`, `.wiki/architecture.md`,
  `.wiki/modules/audio.md`, this package, and credits/manifest; mark only
  implemented mappings as shipped and retain any deliberate silence/gaps.
- [x] **9. Verify and prepare the implementation commit** — `node --check`,
  music lifecycle tests, asset registry/hash checks, arena and match self-tests,
  and `git diff --check` pass. The full validator was attempted and reached its
  known city-generation timeout after 94 seconds without reporting a failure.
- [ ] **10. Verify deployed browser behavior** — after the authorized push is
  live, verify cue transitions, autoplay unlock, background-tab recovery, and
  the Music volume control against the live URL rather than localhost.
