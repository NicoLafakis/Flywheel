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
| **Vortex Vacuum** | `VORTEX` | 10s | Cyan (`#00f0ff`) | Generates a gravitational vortex pulling edible objects and loose debris into the hole. |
| **Turbo Overdrive** | `SPEED` | 12s | Gold (`#ffb700`) | Grants +70% speed boost and heightened handling. |
| **Titan Surge** | `TITAN` | 12s | Red (`#ff3366`) | Increases effective hole radius (+50%) and unlocks eating items 2 tiers higher. |
| **Seismic Quake** | `QUAKE` | Instant | Orange (`#ff7700`) | Sends a seismic shockwave shattering nearby static structures into bite-sized loose debris. |
| **Chain Frenzy** | `FRENZY` | 15s | Purple (`#a855f7`) | Freezes the combo timer decay and doubles (2×) all score point multipliers. |
| **Chrono Burst** | `CHRONO` | +15s (bonus clock) | Ice Blue (`#38bdf8`) | Adds +15 seconds to remaining level time and doubles swallow speed throughput. |

## Spawning Rules

1. **Map Placements**: Tossed into the level upon generation (random distribution using seeded RNG).
2. **Score Milestones**: Bonus power-up tossed in for every **100,000 points** earned on the map.
3. **Multiplier Milestones**: Bonus power-up tossed in for every **500 points** of multiplier / combo chain achieved.

## Architecture & Invariants

- **Pure Sim Determinism**: `js/powerups.js` contains no DOM or three.js dependencies. Randomness is strictly driven through `RNG` (`js/rng.js`). Distance calculations in `voxelsim.js` use `fwmath.js` helpers (`fwHypot2`, `fwCos`, `fwSin`).
- **3D Render Representation**: Represented as floating, rotating luminous crystals atop a beacon with hover bobbing animation, dynamic particle flares, and shockwave bursts on pickup.
- **HUD & Visual Feedback**: Active power-up pills display in `#active-powerups` with duration countdown progress rings, theme-colored glow effects, and audio stingers upon collection.
