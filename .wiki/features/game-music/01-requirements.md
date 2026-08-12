# Game Music — Requirements

> [Objective overview](00-objective-overview.md) · [Implementation tasks](02-tasks.md)

## Problem and goal

Flywheel has event SFX and environmental ambience but no state-aware musical
score. Done means the supplied tracks follow the player through menu, play,
pause, and results; the player can independently adjust music; and the feature
does not add a 47.49 MiB boot download or obscure gameplay cues.

## User stories

- As a player, I want music that follows the current game state and city, so
  the experience has a coherent arc.
- As a player, I want an independent music-volume control, so I can keep useful
  sound effects while lowering or silencing music.
- As a mobile player, I want music to respect browser autoplay and page
  visibility, so it never surprises me or continues from a background tab.

## Acceptance criteria

### Cue selection and lifecycle

- **Given** the title screen or arena lobby is active, **when** audio has been
  unlocked by a player gesture, **then** the main-menu cue loops.
- **Given** the Shop screen is active, **then** the dedicated Shop cue replaces
  the menu cue; **when** the player returns, **then** the menu cue resumes.
- **Given** a supported city match starts, **when** its READY gate/match start
  takes over, **then** the registry-selected city cue replaces the menu cue.
- **Given** Brooklyn, Boston, Cambridge, Chicago, Lower Manhattan, or Upper Manhattan is active,
  **then** the correspondingly named source track plays.
- **Given** Gallery is active, **then** music is deliberately silent while SFX
  and environmental ambience remain available.
- **Given** the pause overlay opens, **then** the city cue position is retained
  and the pause cue plays; **when** play resumes, **then** the pause cue stops
  and the city cue resumes from its retained position.
- **Given** a match reaches results, **then** the active city cue stops and the
  post-game cue loops until navigation chooses another state.
- **Given** repeated screen renders or duplicate lifecycle calls, **then** only
  one copy of the requested music cue is audible.

### Player controls and persistence

- **Given** SETTINGS is open, **then** a `Music volume` range control is shown
  beside the existing sound controls, with range 0–100% and default 65%.
- **When** the player changes Music volume, **then** the active music level
  changes immediately and persists under `flywheel.audio.musicVolume`.
- **Given** the page is reloaded or the arena is opened later on the same
  origin, **then** the persisted music value is restored without a save-schema
  migration.
- **When** Game sounds is OFF, **then** music, ambience, and SFX are all silent;
  **when** it returns ON, **then** the independent music level is restored.
- **When** Effects volume or Ambience volume changes, **then** the music level
  does not move. There is no master level over the three sliders: each governs
  its own bus, and music's effective level is music × duck × fade, which cannot
  exceed its authored ceiling.

### Loading, focus, and mix

- **Given** a cold page load before interaction, **then** no city, pause, or
  results MP3 is downloaded or decoded eagerly; only the active requested cue
  may load after unlock.
- **Given** the supplied library is 47.49 MiB, **then** implementation uses a
  streamed media element rather than decoding the whole library into WebAudio
  buffers.
- **When** `document.visibilityState` becomes `hidden` or `pagehide` fires,
  **then** music pauses; **when** the page returns visible, **then** only the
  cue appropriate to the still-current game state may resume.
- **When** a major collapse, milestone roar, goal, win, lose, or derail stinger
  plays, **then** music ducks smoothly and recovers without changing gameplay
  state or allocating work inside `sim.step()`.
- **Given** the tracks are prepared for shipping, **then** their integrated
  loudness is consistent within 1 LU, true peak is no higher than -1 dBTP, and
  playback introduces no clipping at master volume 100%.
- **Given** an MP3 is absent, corrupt, or cannot play, **then** the game remains
  playable and the cue fails to silence with at most one diagnostic warning.

### Repository and verification gates

- **Given** implementation is complete, **then** there is no `Math.random()` in
  added `js/` code and audio never writes sim state.
- **Given** source filenames contain spaces/mixed casing, **then** committed
  assets use canonical lowercase kebab-case names under `assets/music/`, with
  one registry owning source paths and scene/state mappings.
- **Before** shipping copies are committed under `assets/music/`, **then**
  `CREDITS.md` and the asset manifest identify them as original music created
  by Nico with Suno, with copyright owned by the project and all rights reserved.
- **Given** the changed files do not trigger the pure-sim validator mandate,
  **then** syntax and focused audio lifecycle tests must pass; the full
  validator is attempted and its known Cambridge stall is reported honestly.
- **When** browser behavior is verified, **then** verification uses the live
  deployed URL or an authorized preview, never localhost, and no deployment is
  made without Nico explicitly saying to push/go live.

## Inline design

Add `js/audio/music.js` with a `MusicDirector` that owns one reusable
`HTMLAudioElement`, a cue registry, retained offsets, state-idempotent
`request(cue)`/`pauseForPage()`/`resumeForPage()` methods, and a short
fade-out/swap/fade-in. Streaming avoids decoding all tracks. `GameAudio` owns
the director so its existing `setMuted`, `setVolume`, scene lifecycle, and
ducking entry points remain the single audio facade. SETTINGS reads/writes the
director's localStorage-backed music level through `actions`; no field is added
to `save.js`, so `CURRENT_VERSION` does not change.

## Out of scope

- User-selected playlists, shuffle, track skipping, adaptive stems, beat-sync,
  and per-city selection UI.
- A dedicated Gallery composition.
- Campaign-only cue design while campaign has no title-screen route.
- Music playback in `tools/scene-view.html` or other developer surfaces.
- Automatic normalization at runtime; source assets are normalized once.

## Resolved owner decisions

- Lower Manhattan uses its dedicated supplied track.
- Shop uses its dedicated supplied track.
- Gallery remains deliberately music-free.
- The ten tracks are original music created by Nico with Suno; the project
  owns the copyright and reserves all rights.
