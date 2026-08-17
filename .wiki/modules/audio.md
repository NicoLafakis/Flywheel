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

## Levels: one master over three buses, one mute

Four player-facing levels. Master scales all three of the others; the three
below it are independent of each other and none of them scales another:

| Level | Default | Rides | Covers | Persisted as |
| --- | --- | --- | --- | --- |
| Master | 0.50 | `master` gain node (`MASTER_GAIN 0.9 × level`) **and** `MusicDirector._master` | everything | `flywheel.audio.masterVolume` |
| Effects | 0.30 | `sfx` bus gain | crashes, gulps, combo/milestone stingers, UI taps | `flywheel.audio.volume` |
| Music | 0.25 | `HTMLAudioElement.volume` | the streamed soundtrack | `flywheel.audio.musicVolume` |
| Ambience | 0.15 | `amb` bus gain (`AMB_GAIN 0.55 × level`) | per-city beds, Chicago el-train rattle | `flywheel.audio.ambVolume` |

The mix descends deliberately: crashes lead, the score sits under them, the city
sits under both.

Master is the one level that crosses the WebAudio boundary, and it has to be
reached twice to do it. Music is not on the WebAudio graph at all — it is an
`HTMLAudioElement`, so the master gain node cannot touch it — which is why
`GameAudio.setMasterVolume()` fans out to both sides:

```js
// js/audio/game-audio.js
setMasterVolume(v) { this.engine.setMasterVolume(v); this.music.setMasterVolume(v); }
```

`MusicDirector` then folds it in alongside its own slider, its ducking and its
fades (`this.audio.volume = muted ? 0 : clamp01(_master * _music * _duck * _fade)`).
Anything added to the music path later must be reached the same way or master
will silently stop covering it.

**These levels multiply, and the product is small.** A nominal `vol: 0.65` gulp
arrives at roughly `0.65 × 0.30 (effects) × 0.9 × 0.50 (master) ≈ 0.088`. That
is the number to reason against when picking a level for a new sound — not the
`vol:` literal at the call site, which is a share of the effects bus and not of
the output. Two consequences worth holding onto: headroom for stacking is far
tighter than the call-site numbers suggest, and a level chosen by ear on a
desktop at master 1.0 will not survive the shipped default.

The one thing master deliberately does NOT do is get wired up in the `GameAudio`
constructor. The effects level used to be pushed into `MusicDirector`'s master
multiplier at boot, which meant turning effects down turned the score down with
it; the constructor comment at `js/audio/game-audio.js:138` marks that seam so
it does not get re-introduced. Master reaches music through the setter above and
through `main.js`'s boot and `applySettings()` calls, never through the
constructor.

## `js/audio/mix.js`: one description of the shipped mix

The four defaults above, the four keys they persist under, and the mix-version
stamp all live in `js/audio/mix.js`, which is deliberately dependency-free — it
is four numbers and five strings, not the engine. Four unrelated layers need
the same values and all four import them from there rather than restating a
literal: `engine.js` (constructor fallbacks for master, effects and ambience,
plus `MASTER_VOLUME_KEY`/`VOL_KEY`/`AMB_VOL_KEY`), `music.js` (which re-exports
`DEFAULT_MUSIC_VOLUME` and `MUSIC_VOLUME_KEY` so every existing importer keeps
its import path), `save.js` (`defaultSettings()`), and `js/ui/screens.js` (the
four slider rows' resting positions). `js/main.js` imports all four numbers for
its boot and `applySettings()` fallbacks. Retuning the mix is one edit in
`mix.js`; a bare literal anywhere else is a drift bug waiting to happen, which
is why `save.js` imports a constants module rather than the audio engine —
persistence never points at render-side code.

## Re-seeding an existing install

Changing the defaults alone would be inaudible to anyone who has already played:
`main.js` writes all four levels back to localStorage on every boot, so a
stored older mix wins forever. `reseedAudioMix(storage)` closes that:

- `flywheel.audio.mixVersion` holds an integer stamp; `MIX_VERSION` is the
  current one.
- Missing, unparseable, or lower than `MIX_VERSION` → all four levels are
  overwritten with the shipped defaults and the stamp is written last, so a
  store that fails partway through (quota, private mode) simply retries next
  boot instead of recording a half-done re-seed. A stamp from a future build is
  left alone rather than stomped backwards.
- Equal or higher → nothing happens, forever. Every slider drag after the
  re-seed is the player's and is never touched again.

It fires from the `AudioEngine` constructor (before its three levels are read) and
from the `MusicDirector` constructor (against that director's own storage), not
only from `main.js` — that is what puts any saveless surface (`tools/scene-view.html`
today) on the new mix, since it has no save to consult. It is
stamped and therefore idempotent, so whichever caller runs first does the work
and the rest find nothing to do.

`main.js` calls it explicitly BEFORE constructing `GameAudio`, and that ordering
is load-bearing: it makes the main game the one caller that sees `reseeded ===
true`, which is its cue to mirror the new levels into `save.settings.masterVol`,
`sfxVol`, `ambVol` and `musicVol` (`js/main.js:61-67` — all four, despite the
comment above it still saying "two keys"). Without that, the save's old levels would be written
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

The pool is pumped by `tick()`, which is reached from `updateListener()`, from
the batch helper `handleEvents()` (an empty drained-event batch still ripens the
pool), and from `handleEvent()` itself — so every drained event pumps it too.
`js/main.js` drains its own batch and calls the singular form per event, which
is why the listener call at `js/main.js:1372` is the one that matters: it runs
every frame whether or not any event was drained. So
any surface that runs inside `js/main.js`'s frame loop — the main game and
`js/multiplayer/` matches alike — needs no extra wiring **for the pool**; a
caller with no live listener position (nothing today) would still need its own
`tick()` call, but none currently exists (the standalone hot-seat demo that once
needed this, `js/demo/demo.js`, was removed 2026-08-16). `_stopScene()` **drops** anything
still pooling rather than flushing it: the surface feeding impacts has gone
away, and a collapse banging over the results reveal a beat after the city faded
out is the same miss the pooling exists to fix.

Read that "no extra wiring" narrowly: it is a claim about the collapse pool
ripening, not about events reaching audio at all. Those are separate lines, and
the second one is a single point of failure. Every sound that is not a collapse
arrives only because some caller hands the event to `handleEvent()`, and in the
voxel branch that caller is exactly one statement — `js/main.js:1390`. When a
multiplayer refactor deleted it (`8c3c85d`) the pool kept ticking off
`updateListener()` at `:1372` exactly as this section describes, the crashes
kept sounding, and the gulps, the combo ladder, every stinger, the derailment
and the tornado went silent for a day with `ALL PASS` printing throughout. See
[RCA-2026-08-17](../findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md).
`tools/sfx-event-guard.test.mjs` now watches that statement specifically,
executing the shipped guard text rather than re-implementing it.

One voice per collapse also fixes the engine's per-name fatigue ducking, which
was working against the mix rather than for it. Fatigue deposits energy per
sound name with a ~4 s half-life; twenty impacts drove `crash-big` to roughly a
tenth of its level within one collapse, so the tower that mattered arrived
pre-fatigued and the tail was inaudible mush. A single play lands at full weight
and still leaves fatigue doing its real job — damping a second and third tower
felled in quick succession.

That was not the whole story, though, and the rest of it was a live defect until
2026-08-17. **An inaudible sound still fatigued its sample.** `_fatigueScale()`
returned the scale and deposited a flat `+= 1` in the same call, before `play()`
applied its 0.02 audibility floor, so two things were wrong at once: a play
dropped as inaudible had already been charged, and the charge ignored `vol`
entirely, so a sound at 0.02 fatigued as hard as the same sound at 1.0. Collapse
voices are distance-attenuated before they reach `play()`, so a demolition 150 m
away arrived at nothing, got dropped, and still deposited a full unit on
`crash-big` — and the tower coming down beside the player four seconds later was
ducked by rubble they never heard. Pooling fixed how many times a building
speaks; it never touched what an inaudible play costs, so the same
"the tower that mattered arrived pre-fatigued" failure walked back in behind it.

The fix is an ordering change, not a retune: `_fatiguePeek()` reads,
`_fatigueDeposit(name, v)` charges, and the floor sits between them, charging
only for a sound that actually sounds and only in proportion to the gain it
sounded at. A full-volume play still deposits exactly 1, so the damping of a
second and third tower is unchanged. Measured on the reported scenario (six
collapses at 145-158 m over 3 s, then a tower at 12 m), the tower that mattered
came back **11.1 dB louder, a factor of 3.58**. This also composes with the rival
ladder above: a rival event scaled down by distance now costs proportionally
less fatigue than your own, which is why the fatigue fix had to land first.

`js/main.js` reads the same raw `crash` events for camera shake and is
deliberately left per-fragment: a small additive nudge per piece reads as ground
tremor, which is right, where a repeated bang does not.

## Main-game wiring

`js/main.js` creates one `GameAudio` instance, exposes it as `window.__audio`
for smoke tests, feeds the local hole position each frame, and starts/stops city
ambience with sandbox lifecycle. The old oscillator `blip()` path is gone.

### Who hears which event: three scopes, not two

The voxel frame loop drains the sim's events and decides, per event, whether the
local player hears it. There are **three** answers, and reading it as two is the
mistake that costs you either a silent city or a cacophony of other people's
business (`js/main.js:1390`):

| Scope | Marker | Who hears it | Why |
| --- | --- | --- | --- |
| **World** | `ev.hole == null` | everybody, full level | A tornado, a derailment, a collapse or a power-up spawning happened to the *city*. Nobody owns it, so ownership cannot gate it — and `isLocalHole` is false whenever there is no hole to own, which is why gating world events on it silences them outright. |
| **Mine** | `ev.hole` is the local hole | me, full level | Ordinary hole-scoped feedback: gulps, my combo ladder, my SIZE stings. |
| **A rival's** | `ev.hole` is someone else's | nothing, *except* `quake` | Their gulps and their combo are their business; mine would be unreadable under five other holes' worth of it. |

**The rival level is a distance, not a constant.** A `quiet` event plays at
`base x RIVAL_RATIO x _att(their hole)`, where `RIVAL_RATIO` is 0.35
(`js/audio/game-audio.js`) and `_att` is the same listener model the collapses
already use, measured from the local hole to the rival's. A flat scalar would
make a rival quaking 150 m away exactly as loud as one 10 m from you, which
inverts the goal: the near rival is the one you need to hear, the far one is
pure mix tax. It also dissolves most of the N-rival stacking worry, since five
rivals only stack at full ratio when all five are on top of you, which is the
one moment that information is worth the headroom.

`ratio x att` drops under the engine's 0.02 audibility floor somewhere past
~145 m. **That is correct and deliberate**: a rival that far away should be
gone, not faint. Do not raise `RIVAL_RATIO` to lift them back over the floor,
because that raises every near rival too, which is the mix this protects.

`quiet` also spends none of your ducks. The ambience and music dips are most of
what makes an event feel like it happened to you, so a rival's roar, goal or
quake is heard without dipping your bed or your score on someone else's timer.
And a rival's gulps run on their own throttle (`_lastRivalEat`), because the
0.055 s "a plowed row is one mouthful" limiter is per-`GameAudio`: one shared
limiter would let a rival eating nearby swallow your own gulps.

Nine hole-scoped arms carry the ladder: eat, coin, powerup_collect, combo,
growth, milestone, goal, disaster_teleport, quake. World-scoped arms
deliberately do not, and the two positional ones (crash, derail) already
attenuate themselves, so running them through it as well would double-attenuate.
`tools/sfx-event-guard.test.mjs` derives that list from the emitters and
**executes** each arm both ways, so an arm added later that forgets `scale`
fails the gate rather than shipping a rival event at your own level.

One subtlety the guard surfaced: **scope is a property of the emission, not of
the type.** `powerup_spawn` carries no hole from the voxel sim or from the
campaign's initial and intermittent spawns, but does carry one from the
campaign's two reward spawns (`js/sim.js:437` `score_100k`, `:442` `mult_500`).
A type emitted both ways counts as world-scoped for audio, because the ownerless
emissions are real and have to reach everybody.

**Batch-level `quiet` is refused.** `handleEvents()` strips it and warns once.
It is a per-event property, and a drained batch mixes ownerless world events
with hole-scoped ones from several holes, so one flag over the array cannot be
right; `handleEvents(rivalEvents, { quiet: true })` would have attenuated the
tornado for everybody. The caller that knows ownership decides, which is
`js/main.js`, the only place `sim.localHole` is in scope.

`quake` is the one hole-scoped event that crosses the line, because its
**consequences** do not respect the line: a fault-line quake topples buildings,
and those `crash` events are world-scoped and already audible to everyone. Mute
the rumble and a rival's quake gives you the consequence with no cause — towers
falling across the map for no reason you can hear. So a rival's quake plays, at
`vol 0.35`, and **without** either duck: the ambience and music dips are most of
what makes the event feel like it happened *to you*, and spending them on
someone else's timer dips your own bed and score for 3.5 s over something you
did not do. That is the same re-ducking the collapse pooling above exists to
stop. The level rides through `handleEvent(ev, { quiet: true })` →
`playFaultLineQuake({ quiet })`; `quiet` is a real option on `handleEvent`, but
only these two cases read it, so do not assume a new event honours it.

Single player is untouched by all of this: `!isMultiplayer` short-circuits the
ownership test true, so every event is "mine" and plays at full level.

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
menu, shop, pause, results, victory, one cue per authored city, and the
`flywheel-*` default pool (eight `Flywheel-music-*.mp3` tracks). Gallery — The
Lab — maps to `the-lab.mp3`; it was deliberate silence until the track shipped
(2026-08-17). Only the requested file loads; pause/shop retain the
previous cue's position, background tabs pause playback, and major stingers duck
music through `GameAudio`.

## The pause-menu track picker

`js/audio/tracklist.js` (pure data + logic, validator-importable) catalogs every
player-selectable track in two groups: the eight-track `flywheel` default pool,
always available, and one `city` row per city that has its own theme, available
only while `isCityUnlocked(save, scene)` says the city is unlocked — the same
gate the map screen uses, so the picker can never offer music from a city the
player has not reached. City rows reuse the scene cues (`gallery`, `manhattan`,
…) the run-start paths already request; Tokyo is deliberately absent because it
aliases Lower Manhattan's MP3.

The picker itself is the MUSIC section of `showPause()` in `js/ui/screens.js`,
reachable mid-run in single player and multiplayer alike. A selection sets
`musicOverride` in `js/main.js` and starts the track immediately (that doubles
as the preview; the pause theme is not re-requested over it). The override is
session-scoped and never persisted: every run-start path (campaign, sandbox,
multiplayer match) clears it, so a new city returns to its own theme, while
resume (`actions.resume()` and the Escape handler) requests
`playCue() === musicOverride || activePlayMusicCue`. A cue the save may not
select is refused at `actions.musicSelect()`.

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
  is covered by `js/audio/music.test.mjs`; picker availability gating (default
  pool always, city tracks behind the real `isCityUnlocked`, every row's cue
  resolving to a real file) by `js/audio/tracklist.test.mjs`. Both run in the
  `multiplayer` section of `tools/validate.mjs`, as does
  `tools/music-assets-selftest.mjs` since 2026-08-17 — before that it was
  listed only in `tools/diagnostics.mjs`, so no gate ever ran it, and
  `js/audio/music.test.mjs` had the same gap until the same day. The bus/level split and the one-time re-seed (fresh
  install, un-stamped old install, stamped install with chosen levels, and a
  second boot after a re-seed) by `js/audio/engine.test.mjs`; and the collapse
  pooling — one tower to one voice, pieces falling to silence, two simultaneous
  collapses to two voices, suppression expiry, one duck per voice, and the
  positionless surface — by `js/audio/game-audio.test.mjs` (all run with
  `node <path>`).
- **The effects seam has the same shape as the music-cue seam above, and needed
  the same kind of guard.** `js/audio/game-audio.test.mjs` asserts the whole
  event-to-sound mapping, but it calls `handleEvent()` itself, so it owns both
  sides of the seam and can never see the *caller* disappear — which is exactly
  what happened in `8c3c85d` (see
  [RCA-2026-08-17](../findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md)).
  `tools/sfx-event-guard.test.mjs` watches the seam instead of the mapping: it
  cross-checks every `case '…'` in `handleEvent` against the `events.push({…})`
  sites in `js/voxelsim.js` and `js/sim.js` (brace-matched, because `hole,`
  shorthand is invisible to a `hole:` grep), asserts both frame-loop branches
  still pump, and **executes the shipped guard text** lifted out of `js/main.js`
  via `new Function` rather than re-implementing it, so a guard that stops
  delivering fails even though the test never restates what the guard should
  say. It also prints which cases read `quiet`. Run it with
  `node tools/sfx-event-guard.test.mjs`.
- Registration status, 2026-08-17: `tools/sfx-event-guard.test.mjs`,
  `js/audio/game-audio.test.mjs` and `js/audio/engine.test.mjs` are **not yet in
  `validateMultiplayer()`'s `suites` array**. Until they are, they only run when
  someone runs them by hand, which is contributing factor 2 of the RCA above —
  `game-audio.test.mjs` asserted the eat gulp throughout the outage and stayed
  green because nothing ran it.
