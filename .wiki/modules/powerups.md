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
- **Fault Line Rupture cinematic**: The instant quake is resolved in the sim,
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
