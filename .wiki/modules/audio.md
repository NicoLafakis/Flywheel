---
covers:
  - js/audio/**
  - js/main.js
  - js/multiplayer/**
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

The asset library (`assets/audio/`, manifest `CREDITS.json`) is CC0 except the
three eat gulps, which are original Flywheel masters (Nico with Suno, like the
music) and ship as MP3 (2026-08-12, replacing the freesound gulps). The engine
loads `name + '.ogg'` unless the constructor's `ext` map says otherwise —
`GameAudio`'s `FILE_EXT` carries the three `eat-N` names, so no call site,
event name or test knows the files changed.

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
only from `main.js` — that is what puts any saveless surface (`tools/scene-view.html`
today) on the new mix, since it has no save to consult. It is
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
EFFECTS level, because the main game and `tools/scene-view.html` already
call them; `flywheel.audio.volume` keeps its name for the same reason, so no
existing player's slider resets. Ambience adds `ambienceVolume`/
`setAmbienceVolume()` alongside them, mirrored on `GameAudio`.

`duckAmbience()` ramps down to and back up to `AMB_GAIN × ambience level`, never
to a constant — restoring to a literal would hand the ambience slider back at
full every time a skyscraper came down. Both setters apply live, including to a
bed that is already looping and to a duck ramp still in flight (a slider drag
cancels the scheduled values and wins).

## Collapses: one voice per building, not per falling piece

`js/voxelsim.js` emits a `crash` event from `_splitChunk()` every time a chunk
of at least three blocks hits something at over 4 m/s. One toppling tower does
that a dozen times over a couple of seconds, so `crash` is a **piece-landed**
signal, not a building-fell signal. Reading it as the latter stacked the same
bang on itself and re-ducked the bed every few frames, which is what made a
demolition sound jarring rather than heavy.

`GameAudio` therefore pools impacts into collapses before voicing anything. The
pooling is entirely render-side (ADR-0003): the sim's event stream is unchanged,
so two peers with different speakers still step bit-identically.

- Impacts landing within **18 m** of a live collapse's centroid are the same
  building. City scenes span ~250 m and a tower's rubble field is far tighter
  than that, so the radius separates two buildings across a block while still
  catching a wide spill. Impacts with no `x`/`z` — a surface that never set a
  listener — all share one pool, since without coordinates there is nothing to
  tell two sites apart.
- A collapse is **held 0.25 s** from its first impact before speaking, and each
  further impact pushes that out by 0.15 s, capped at **0.6 s**. The hold is
  what makes the weight class reflect the whole building rather than whichever
  slab happened to land first; the cap is what keeps the onset from arriving
  visibly late.
- It then speaks **once**, sized by the POOLED block count and positioned at the
  impacts' mass-weighted centroid, attenuated by the same `_att()` listener
  model as before. The tier thresholds are the pre-pooling numbers (26+ = the
  skyscraper treatment with rumble bed and glass; 9+ = the low-building crash),
  now read against a whole building instead of one fragment.
- **Under 9 pooled blocks is silent.** That is the pieces-falling case; it used
  to play a debris scatter, and the absence of that scatter is most of what the
  fix is.
- For **2 s** after speaking — refreshed while rubble keeps arriving — further
  impacts at that spot are swallowed, so a tower that settles for four seconds
  still only ever made one sound. Once the window lapses, a genuinely new
  collapse on the same spot voices again.

The layer delays inside a voice (glass at 0.25 s, debris at 0.45 s) are
deliberately *not* compensated for the hold: they are the shape of the sound,
and the hold moves only where that shape starts.

The pool is pumped by `tick()`, which is reached from both `updateListener()`
and `handleEvents()` (an empty drained-event batch still ripens the pool), so
any surface that runs inside `js/main.js`'s frame loop — the main game and
`js/multiplayer/` matches alike — needs no extra wiring; a caller with no live
listener position (nothing today) would still need its own `tick()` call, but
none currently exists (the standalone hot-seat demo that once needed this,
`js/demo/demo.js`, was removed 2026-08-16). `_stopScene()` **drops** anything
still pooling rather than flushing it: the surface feeding impacts has gone
away, and a collapse banging over the results reveal a beat after the city faded
out is the same miss the pooling exists to fix.

One voice per collapse also fixes the engine's per-name fatigue ducking, which
was working against the mix rather than for it. Fatigue deposits energy per
sound name with a ~4 s half-life; twenty impacts drove `crash-big` to roughly a
tenth of its level within one collapse, so the tower that mattered arrived
pre-fatigued and the tail was inaudible mush. A single play lands at full weight
and still leaves fatigue doing its real job — damping a second and third tower
felled in quick succession. No change was needed there.

`js/main.js` reads the same raw `crash` events for camera shake and is
deliberately left per-fragment: a small additive nudge per piece reads as ground
tremor, which is right, where a repeated bang does not.

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
allowing a standalone surface such as `tools/scene-view.html` to inherit the
same choices without importing the campaign save.

`settings.sfxVol` and `settings.ambVol` took no schema bump, and retuning their
defaults does not need one either: the key is present and its stored value is
still legal, just from an older mix. An absent key reads as the current default
through every consumer's `typeof … === 'number'` guard, and a present one is
moved forward by `reseedAudioMix()` — which is the right mechanism precisely
because it also reaches the save-less surfaces a migration could never touch.

`js/audio/music.js` owns the cue registry and one reusable `HTMLAudioElement`:
menu, shop, pause, results, victory, and one cue per authored city. Gallery maps
to deliberate silence. Only the requested file loads; pause/shop retain the
previous cue's position, background tabs pause playback, and major stingers duck
music through `GameAudio`.

**Arming vs. playing.** The browser's autoplay policy gates `play()` and nothing
else — assigning `src`, setting `preload='auto'` and calling `load()` are all
permitted before any user gesture. Downloading used to be gated behind the
gesture too (`src` was only assigned inside `_switchTo`, which only ran once
`_unlocked` was true), so the first tap did not start music, it started a
download and the player heard silence for the length of that fetch. `request()`
now calls `_arm(cue)` while locked: the element takes the source, switches
`preload` to `auto`, loads, and parks at `_fade = 0`. `unlock()` then finds
`_current === _wanted`, presses play and runs the fade-in that a normal switch
would have run — no second `src` assignment, no second `load()`. The
`loadedmetadata` handler still ends in `_safePlay()`, whose `!this._unlocked`
early return is the single thing keeping arming from becoming an autoplay
attempt; do not weaken that guard. `_armedSrc` tracks the last source string
handed to the element, because reading `audio.src` back gives an absolute URL
that never compares equal to the relative path assigned.

The menu theme is warmed further by `<link rel="preload" … as="audio">` in
`index.html`. `as="audio"` is load-bearing: the preload cache is keyed by
request destination, so the previous `as="fetch"` entry could never be matched
by the `<audio>` element and produced both a duplicate download and the
"preloaded but not used" console warning. There is no `crossorigin` attribute
for the same reason — the file is same-origin and the audio element issues no
CORS request, so a crossorigin entry would sit in a partition nothing reads. A
third fetch (a throwaway `bgMusicPreload = new Audio()` in the boot script) was
removed on 2026-08-17; the menu track now downloads exactly once.

Several cues are aliases onto one file rather than separate tracks: `title` and
`menu` share `main-menu.mp3`, `tokyo` and `manhattan` share `lower-manhattan.mp3`,
and `victory` (the multiplayer podium) shares `post-game.mp3` with `results` —
the podium is a post-game screen, so it gets the post-game track without a second
copy on disk. `MUSIC_FALLBACK_CUE` (`menu`) is where an unrecognised cue name
lands: `request()` still returns `false`, and still warns once, but the screen
plays the signature theme instead of nothing. A player cannot distinguish "this
screen has a bug" from "this screen is quiet on purpose", so an unknown cue must
never be answered with silence — that defect shipped once, leaving the
end-of-match podium dead quiet in every multiplayer match.

## Gotchas

- Audio variants use the seeded `RNG` from `js/rng.js`; the repository-wide
  `Math.random()` ban still applies even though sound is presentation-only.
- `updateListener(x, z, moverSim)` attenuates collapses and derail events from
  full at 25 m to silent at 160 m — for a collapse, measured at the pooled
  centroid at the moment it speaks, not at each impact. In Chicago the same feed
  glides the train bed toward the nearest car that remains on the rails. It also
  pumps the collapse pool, which is why the two surfaces that call it need no
  separate `tick()`.
- Arena peers have no stepping mover sim, so they can provide the local hole
  position but not a live train position. Their train bed remains at base level.
- `debris-metal.ogg` is preloaded but currently has no event mapping.
- A missing or not-yet-decoded sound is deliberately silent; audio loading is
  never awaited by the game loop.
- Cue names are asked for by string literal from DOM-only modules (`js/main.js`,
  `js/ui/screens.js`) that the headless validator can never import, so a name the
  registry does not define cannot be caught at runtime. `tools/music-cue.test.mjs`
  is the guard: it scans every `.js` under `js/` for `setMusicCue('…')`,
  `actions.music('…')` and `music.request('…')`, and fails if any literal cue is
  not a key of the imported `MUSIC_CUES`. It runs in the `multiplayer` section of
  `tools/validate.mjs`. Adding a new way to request music means adding its shape
  to that file's `CALL_SITE_PATTERNS`, or the new call sites go unguarded.
- Music assets and their hashes are pinned by `assets/music/MANIFEST.json` and
  `tools/music-assets-selftest.mjs`. `MANIFEST.json` lists one representative
  `cue` per file, not every alias, so an aliased cue adds no manifest row.
  Lifecycle behavior (including the unknown-cue fallback, pre-gesture arming,
  and a static check that `index.html`'s preload link still says `as="audio"`)
  is covered by `js/audio/music.test.mjs` — which now runs in the `multiplayer`
  section of `tools/validate.mjs`; before 2026-08-17 it was listed only in
  `tools/diagnostics.mjs`, so no gate ever ran it. The bus/level split and the one-time re-seed (fresh
  install, un-stamped old install, stamped install with chosen levels, and a
  second boot after a re-seed) by `js/audio/engine.test.mjs`; and the collapse
  pooling — one tower to one voice, pieces falling to silence, two simultaneous
  collapses to two voices, suppression expiry, one duck per voice, and the
  positionless surface — by `js/audio/game-audio.test.mjs` (all run with
  `node <path>`).
