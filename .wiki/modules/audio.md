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
persisted mute and per-bus levels, and mobile-safe unlock. `MusicDirector`
streams one state-aware MP3 at a time. `GameAudio` is the facade over both: it
maps drained sim events and scene lifecycle to sound. All are render-side: they
read gameplay state only after `sim.step()` and never mutate it.

## Levels: three independent buses, one mute

There is no master volume. `AudioEngine`'s master gain carries mute and nothing
else (`muted ? 0 : MASTER_GAIN`); the player's levels live one layer down, one
per bus, and none of them scales another:

| Level | Default | Rides | Covers | Persisted as |
| --- | --- | --- | --- | --- |
| Effects | 0.7 | `sfx` bus gain | crashes, gulps, combo/milestone stingers, UI taps | `flywheel.audio.volume` |
| Ambience | 0.4 | `amb` bus gain (`AMB_GAIN 0.55 × level`) | per-city beds, Chicago el-train rattle | `flywheel.audio.ambVolume` |
| Music | 0.3 | `HTMLAudioElement.volume` | the streamed soundtrack | `flywheel.audio.musicVolume` |

The mix descends deliberately: crashes lead, the city sits under them, the score
sits under both.

Music is not on the WebAudio graph at all, so it is unreachable from the two bus
gains by construction. `MusicDirector._master` exists as a separate multiplier
but stays at 1 in the game: nothing calls `setMasterVolume()`, so music answers
only to its own slider, its ducking, and mute.

## `js/audio/mix.js`: one description of the shipped mix

The three defaults above, the three keys they persist under, and the mix-version
stamp all live in `js/audio/mix.js`, which is deliberately dependency-free — it
is three numbers and four strings, not the engine. Four unrelated layers need
the same values and all four import them from there rather than restating a
literal: `engine.js` (constructor fallbacks for effects and ambience, plus
`VOL_KEY`/`AMB_VOL_KEY`), `music.js` (which re-exports `DEFAULT_MUSIC_VOLUME`
and `MUSIC_VOLUME_KEY` so every existing importer keeps its import path),
`save.js` (`defaultSettings()`), and `js/ui/screens.js` (the three slider rows'
resting positions). `js/main.js` imports the effects and ambience numbers for
its boot and `applySettings()` fallbacks. Retuning the mix is one edit in
`mix.js`; a bare literal anywhere else is a drift bug waiting to happen, which
is why `save.js` imports a constants module rather than the audio engine —
persistence never points at render-side code.

## Re-seeding an existing install

Changing the defaults alone would be inaudible to anyone who has already played:
`main.js` writes all three levels back to localStorage on every boot, so a
stored older mix wins forever. `reseedAudioMix(storage)` closes that:

- `flywheel.audio.mixVersion` holds an integer stamp; `MIX_VERSION` is the
  current one.
- Missing, unparseable, or lower than `MIX_VERSION` → all three levels are
  overwritten with the shipped defaults and the stamp is written last, so a
  store that fails partway through (quota, private mode) simply retries next
  boot instead of recording a half-done re-seed. A stamp from a future build is
  left alone rather than stomped backwards.
- Equal or higher → nothing happens, forever. Every slider drag after the
  re-seed is the player's and is never touched again.

It fires from the `AudioEngine` constructor (before the two levels are read) and
from the `MusicDirector` constructor (against that director's own storage), not
only from `main.js` — that is what puts the arena, the hot-seat demo and the
scene viewer on the new mix, since none of them has a save to consult. It is
stamped and therefore idempotent, so whichever caller runs first does the work
and the rest find nothing to do.

`main.js` calls it explicitly BEFORE constructing `GameAudio`, and that ordering
is load-bearing: it makes the main game the one caller that sees `reseeded ===
true`, which is its cue to mirror the new levels into `save.settings.sfxVol` and
`save.settings.ambVol`. Without that, the save's old levels would be written
straight back over the freshly seeded keys a few lines later and nothing would
change. It only stores the save when a value actually moved, so a brand-new
player — who is also stamped on first boot, so the next retune knows where they
stand — takes no extra write and cannot end up anywhere other than the plain
defaults.

A retune therefore costs two edits: the numbers in `mix.js`, and `MIX_VERSION`.

`AudioEngine.volume`/`setVolume()` keep their pre-split names while meaning the
EFFECTS level, because the arena, the hot-seat demo and the scene viewer already
call them; `flywheel.audio.volume` keeps its name for the same reason, so no
existing player's slider resets. Ambience adds `ambienceVolume`/
`setAmbienceVolume()` alongside them, mirrored on `GameAudio`.

`duckAmbience()` ramps down to and back up to `AMB_GAIN × ambience level`, never
to a constant — restoring to a literal would hand the ambience slider back at
full every time a skyscraper came down. Both setters apply live, including to a
bed that is already looping and to a duck ramp still in flight (a slider drag
cancels the scheduled values and wins).

## Main-game wiring

`js/main.js` creates one `GameAudio` instance, exposes it as `window.__audio`
for smoke tests, feeds the local hole position each frame, and starts/stops city
ambience with sandbox lifecycle. The old oscillator `blip()` path is gone.

SETTINGS carries one Game sounds toggle (the global mute) and three sibling
sliders in order: Effects volume, Ambience volume, Music volume. Effects and
Ambience write `settings.sfxVol` and `settings.ambVol` into the save and reach
the facade through `actions.applySettings()`; Music goes straight through
`actions.setMusicVolume()` because `MusicDirector` owns its own persistence.
The engine and director mirror all four values to `flywheel.audio.muted`,
`flywheel.audio.volume`, `flywheel.audio.ambVolume`, and
`flywheel.audio.musicVolume`, alongside the `flywheel.audio.mixVersion` stamp,
allowing standalone surfaces such as the arena to inherit the same choices
without importing the campaign save.

`settings.sfxVol` and `settings.ambVol` took no schema bump, and retuning their
defaults does not need one either: the key is present and its stored value is
still legal, just from an older mix. An absent key reads as the current default
through every consumer's `typeof … === 'number'` guard, and a present one is
moved forward by `reseedAudioMix()` — which is the right mechanism precisely
because it also reaches the save-less surfaces a migration could never touch.

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
  `js/audio/music.test.mjs`, and the bus/level split and the one-time re-seed
  (fresh install, un-stamped old install, stamped install with chosen levels,
  and a second boot after a re-seed) by `js/audio/engine.test.mjs` (run either
  with `node <path>`).
