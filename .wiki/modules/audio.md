---
covers:
  - js/audio/**
  - js/main.js
  - js/demo/**
  - js/ui/screens.js
  - tools/scene-view.html
---
# Audio

## Purpose

`AudioEngine` owns WebAudio SFX/ambience loading, buses, fatigue ducking,
persisted mute/master volume, and mobile-safe unlock. `MusicDirector` streams
one state-aware MP3 at a time. `GameAudio` is the facade over both: it maps
drained sim events and scene lifecycle to sound. All are render-side: they read
gameplay state only after `sim.step()` and never mutate it.

## Main-game wiring

`js/main.js` creates one `GameAudio` instance, exposes it as `window.__audio`
for smoke tests, feeds the local hole position each frame, and starts/stops city
ambience with sandbox lifecycle. The old oscillator `blip()` path is gone.

The SETTINGS Game sounds toggle and Sound volume slider update the save and the
whole audio facade together. The new Music volume slider is independent beneath
that master. The engine/director mirror them to `flywheel.audio.muted`,
`flywheel.audio.volume`, and `flywheel.audio.musicVolume`, allowing standalone
surfaces such as the arena to inherit the same choice without importing the
campaign save.

`js/audio/music.js` owns the cue registry and one reusable `HTMLAudioElement`:
menu, shop, pause, results, and one cue per authored city. Gallery maps to
deliberate silence. Only the requested file loads after the first gesture;
pause/shop retain the previous cue's position, background tabs pause playback,
and major stingers duck music through `GameAudio`.

## Gotchas

- Audio variants use the seeded `RNG` from `js/rng.js`; the repository-wide
  `Math.random()` ban still applies even though sound is presentation-only.
- `updateListener(x, z, moverSim)` attenuates crash and derail events from full
  at 25 m to silent at 160 m. In Chicago it also glides the train bed toward the
  nearest car that remains on the rails.
- Arena peers have no stepping mover sim, so they can provide the local hole
  position but not a live train position. Their train bed remains at base level.
- `debris-metal.ogg` is preloaded but currently has no event mapping.
- A missing or not-yet-decoded sound is deliberately silent; audio loading is
  never awaited by the game loop.
- Music assets and their hashes are pinned by `assets/music/MANIFEST.json` and
  `tools/music-assets-selftest.mjs`; lifecycle behavior is covered by
  `js/audio/music.test.mjs`.
