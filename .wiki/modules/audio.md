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

`AudioEngine` owns WebAudio loading, buses, fatigue ducking, persisted mute and
volume, and mobile-safe unlock. `GameAudio` owns the mapping from drained sim
events and scene lifecycle to sounds. Both are render-side: they read gameplay
state only after `sim.step()` and never mutate it.

## Main-game wiring

`js/main.js` creates one `GameAudio` instance, exposes it as `window.__audio`
for smoke tests, feeds the local hole position each frame, and starts/stops city
ambience with sandbox lifecycle. The old oscillator `blip()` path is gone.

The SETTINGS Game sounds toggle and Sound volume slider update the save and the
engine together. The engine mirrors them to `flywheel.audio.muted` and
`flywheel.audio.volume`, allowing standalone surfaces such as the arena to
inherit the same player choice without importing the campaign save.

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
