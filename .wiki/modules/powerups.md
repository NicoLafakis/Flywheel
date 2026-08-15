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

## Spawning & Roaming Rules

1. **Dynamic Roaming**: Ground power-ups cruise along streets and open spaces with deterministic wandering velocities (~2.8 m/s) and boundary reflections.
2. **Intermittent Lifespan**: Ground power-ups persist with a temporary lifespan (~26–28s) and pulse/flicker during their final 4 seconds before dissolving.
3. **Intermittent Dynamic Spawning**: Every 18–28 seconds, an intermittent power-up spawns dynamically at an open map location (capped at 2 active roaming ground power-ups at any time).
4. **Score Milestones**: Bonus roaming power-up dropped for every **100,000 points** earned.
5. **Multiplier Milestones**: Bonus roaming power-up dropped for every **500 points** of multiplier / combo chain achieved.

## Architecture & Invariants

- **Pure Sim Determinism**: `js/powerups.js` contains no DOM or three.js dependencies. Randomness is strictly driven through `RNG` (`js/rng.js`). Roaming drift and distance calculations use `fwmath.js` helpers (`fwHypot2`, `fwCos`, `fwSin`).
- **3D Render Representation**: Represented as floating, rotating luminous crystals with hover bobbing animation, dynamic position tracking, expiring flicker animation, and particle flare bursts on collect/despawn.
- **HUD & Visual Feedback**: Active power-up pills fly out smoothly into view, maintain steady solid countdown timer progress, pulse during expiry (last 3s), and slide back out upon expiration. Collection triggers screen ambient edge color pulses and WebAudio fanfares.
