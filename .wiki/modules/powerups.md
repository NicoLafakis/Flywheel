---
covers:
  - "js/powerups.js"
  - "js/sim.js"
  - "js/voxelsim.js"
  - "js/world3d.js"
  - "js/voxelworld.js"
  - "js/ui/hud.js"
---
# Power-Up System

## Purpose

Provides collectible in-game power-up entities and active status effects across both 2D/3D campaign levels and voxel sandbox city maps to assist players in clearing maps, maintaining combos, and scoring high.

## Catalog of Power-Ups

| Power-Up | Key | Duration | Color | Effect |
|----------|-----|----------|-------|--------|
| **Vortex Vacuum** | `VORTEX` | 15s | Cyan (`#00d2ff`) | Generates a gravitational vortex pulling edible objects and loose debris straight into the hole. |
| **Turbo Overdrive** | `SPEED` | 15s | Gold (`#ffb703`) | Grants +70% speed boost, lightning speed streaks, and instant steering agility. |
| **Titan Surge** | `TITAN` | 15s | Crimson (`#d90429`) | Expands player to **MAXIMUM MAP SIZE** for the full 15s duration, allowing immediate consumption of skyscrapers. |
| **Fault Line Rupture** | `QUAKE` | Instant | Orange (`#f77f00`) | Rips a massive fault fissure through the city, snapping foundations and toppling skyscrapers into rubble. |
| **Chain Frenzy** | `FRENZY` | 15s | Magenta (`#7209b7`) | Multiplier scales infinitely with chain count (`x30`, `x55`, etc.), combo timer freeze, and 2× point scoring. |
| **Chrono Freeze** | `CHRONO` | 15s | Frost Cyan (`#4cc9f0`) | Freezes the game clock for 15s with crystalline frost vignette and locks the combo meter risk-free. |

## Spawning, Cooldown & Lifespan Rules

1. **Strict Board Maximum**: Exactly 2 power-ups on the board at any given time (`MAX_MAP_POWERUPS = 2`).
2. **Permanent Ground Lifespan**: Ground power-ups persist indefinitely until collected (`lifespan = Infinity`) and will not despawn over time.
3. **35-Second Spawning Cadence & Post-Collection Cooldown**:
   - Initial spawn places up to 2 power-ups at the start of a map.
   - When a power-up is consumed by the player, a **35-second cooldown timer** starts before another power-up can spawn (as long as active on board < 2).
   - If neither power-up is eaten, they remain unchanged and in place.
4. **Duration Standardization**: All timed buffs last for **15.0 seconds** (`duration: 15.0`).

## Visual Feedback, Screen FX & Endgame Systems

- **Anime Active Screen Overlays**:
  - `Vortex Vacuum`: Inward swirling gravitational warp distortion and radial accretion rays.
  - `Titan Surge`: Golden-crimson border flare and Kanji expansion header (`巨 大 化`).
  - `Turbo Overdrive`: High-velocity anime lightning streaks along screen borders.
  - `Chain Frenzy`: Dragon fire flame borders and glowing chain particles.
- **Fault Line Rupture wavefront** (`js/voxelsim.js` `_queueFault` /
  `_advanceFaults`, 2026-08-19): collecting QUAKE only *queues* a fault — every
  static/unstable block within `QUAKE_CRACK_WIDTH` (4 m) of the line from the
  hole to the farthest bounds corner, plus a ground-level (y<=3) flank band out
  to `QUAKE_FLANK_MULT` (1.5x), sorted by distance along the line. `step()` then
  releases that list front-to-back at `faultLen / QUAKE_RUPTURE_SECONDS` (1.5 s,
  matching the camera's 1.16 s launch-to-endpoint phase and the renderer's
  0.6-1.0 s fissure propagation), at most `QUAKE_RELEASE_CAP` (60) blocks per
  fault per step. State lives on `sim._activeFaults` and is advanced ONLY inside
  `step()`; `sim._lastFaultReleases` is the per-step probe the validator reads.
  Every storey detaches: ground-band blocks keep the perpendicular 3.5 m/s kick,
  upper storeys are thrown outward harder with height
  (`QUAKE_STOREY_KICK_PER_M`, capped by `QUAKE_STOREY_KICK_MAX`), flank blocks
  slump *into* the crack one crack-width behind the front, and a kick that
  would land inside `QUAKE_EDGE_MARGIN` of the map edge is redirected toward
  the centre (the boundary clamp otherwise herds debris into one column the
  pair solver bounces apart forever). The open crack **swallows** — consumes
  without award — any loose body that comes to rest inside it (underside at or
  below `QUAKE_SWALLOW_Y`), for `QUAKE_SWALLOW_SECONDS` (6 s) after the last
  release; rubble that lands on the banks stays edible. The Seismic disaster
  (`_triggerNaturalSeismicDisaster`, `SEISMIC_CRACK_WIDTH` 5 m, centre-out in
  both directions) takes the same path with `disasterRng`.
  - *Why the 160/180-block cap went*: the fault used to resolve in one frame,
    stop after 160 blocks (a few metres into a dense city) and detach only the
    y<=3 band; taller blocks were set unstable/damage=1, but `_recalcSupport`
    runs first in `step()` and resets any still-supported unstable block to
    static, so they never fell. Owner report: "doesn't break everything down
    between the player and the end of the quake".
  - *Why the fissure swallows*: a building holds far more block volume than the
    ground strip under it. Dropped in place, a tower becomes a stack of loose
    bodies the pair solver walks apart for seconds (measured before the
    swallow: ~400 blocks awake and ~130 still moving at >5 m/s ten seconds
    after the quake, 90-120 ms/step on the desktop tier). With it, the gallery
    corner fault (2008 blocks over 200 m) releases in 1.48 s, peaks ~65 ms/step
    for about a second, and is back at the 3-4 ms baseline by t+4 s; ~1600
    blocks are swallowed and ~380 remain as bank rubble.
  - Pinned by `tools/quake-rupture.test.mjs` (validator section `quakeRupture`):
    full-length rupture across all ten longDist deciles, per-step cap,
    determinism, no state change outside `step()`, swallow/no-award, and the
    Seismic variant. `RANKED_SIM_VERSION` bumped 2 -> 3 (both fire inside a
    90 s RUN).
- **Fault Line Rupture cinematic**: The quake is queued in the sim (see the
  wavefront above; the sim is held for the cinematic, so the rupture itself
  plays out over ~1.5 s once the chase camera returns),
  then a 5.8-second, skippable super-move sequence freezes gameplay input and
  game time. Three player close-ups slam **EARTH**, **QUAKE**, and **TIME!**
  into the center of the screen; the camera then launches to the far endpoint,
  pulls a 180-degree turn, tracks the glowing fault back to the player, and
  returns to the normal chase camera. Space, Enter, Escape, tap, or click skips
  directly to the completed visual state. Reduced-motion mode uses a
  2.4-second overview hold instead. A full-clear result waits until this
  presentation has completed.
- **Non-quake pickup sequence**: Every other power-up keeps the two-stage
  battle rhythm: its spawn opens the Pokemon encounter, then collecting it
  pauses the fixed-step simulation for a 3.4-second Dragon Ball camera and
  explanatory card. The card uses the catalog icon, name, elemental type,
  duration, and effect description; Space, Enter, Escape, tap, or click skips
  it. Fault Line Rupture is deliberately excluded and retains its bespoke
  super-move sequence above.
- **Chrono Freeze audio follow-up**: Chrono retains the standard collection
  sound, then cues `powerup-chrono` 250 ms later in both campaign and voxel
  sandbox play so the ice cue lands as a distinct freeze beat.
- **Pickup camera recovery**: The final Dragon Ball pickup zoom captures the
  live chase distance before its close-ups begin, then blends back to that
  defined value. This keeps rendering live when the explanation card clears.
- **Louder Combo Multiplier**: `#cm-burst` overlays the combo meter with 3D comic typography, spinning dashed halos, and radial shock rings.
- **Endgame Remaining Blocks Pill & 3D Beacons**:
  - Displays `#blocks-left-pill` (`🎯 42 BLOCKS LEFT`) when uneaten blocks drop below 100, when they drop to 5% or less of the level's total, when the cleared fraction reaches 95% or more, or when time remaining is `≤ 30s`. The 5%/95% triggers exist so a huge level (many thousands of blocks) still surfaces the endgame pill well before the flat 100-block floor would fire.
  - Generates 3D downward-pointing glowing beacon arrows and pulsating ground locator rings above remaining standing blocks to help players pinpoint every last building for 100% full clears, using the same 100-block / 5%-remaining / 95%-cleared / 30s triggers (`js/world3d.js` for city holes, `js/voxelworld.js` for the Cambridge sandbox).
- **Scheduled Natural Disasters**:
  - **1m30s Elapsed**: Triggers **Seismic Super Quake** (`⚠️ NATURAL DISASTER: SEISMIC QUAKE! ⚠️`) with full-map fault fissures and building foundation collapses.
  - **1m Before End**: Triggers **Meteor Shower** (`⚠️ NATURAL DISASTER: METEOR SHOWER! ⚠️`) bombarding building clusters with stratospheric fireballs and loose debris.

## Architecture & Invariants

- **Pure Sim Determinism**: `js/powerups.js` contains no DOM or three.js dependencies. Randomness is strictly driven through `RNG` (`js/rng.js`). Roaming drift and distance calculations use `fwmath.js` helpers (`fwHypot2`, `fwCos`, `fwSin`).
- **3D Render Representation**: Floating luminous crystals with hover bobbing, dynamic position tracking, and particle flares on collection.
- **HUD & Visual Feedback**: Active power-up pills fly out smoothly into view, maintain steady solid countdown timer progress, pulse during expiry (last 3s), and slide back out upon expiration. Collection triggers screen ambient edge color pulses and WebAudio fanfares.
- **Focused regression gate**: Run `node tools/earthquake-cinematic-selftest.mjs`
  after changing any browser-only power-up event, camera, overlay, or renderer
  skip path. It complements the pure-simulation validator by checking the live
  event-to-cinematic contract in both campaign and voxel sandbox paths.
