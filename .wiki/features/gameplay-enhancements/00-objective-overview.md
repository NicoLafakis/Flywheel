# Gameplay & UI Enhancements

**Date**: 2026-08-15  
**Status**: IN-PROGRESS  
**Owner**: Antigravity  

## Objectives

1. **Titan Surge (Enlarged Hole) Max Size**: Provide MAX SIZE capabilities (`MAX_RADIUS` / `PLAYER_MAX_RADIUS`) to the player during the active Titan Surge powerup window.
2. **6-Second Modal & Message Minimum**: Ensure every on-screen modal, dialogue, cinematic showcase, and announcement remains visible for at least 6.0 seconds (unless dismissed early by user interaction).
3. **Coin Bank / NaN / NaN/80 Fix**: Fix uninitialized `coinsCollected` in `VoxelSandboxSim` constructor and ensure clean integer formatting across HUD and results screens.
4. **Smooth Loading Bar Animation**: Animate level loading bars continuously and fluidly across scene setup without snapping.
5. **Chain Frenzy Infinite Combo**: Allow uncapped multiplier scaling (`x30`, `x55`, etc.) during the 15-second Frenzy duration.
6. **Natural Disaster Teleport Penalty**: Teleport players to another quadrant of the map when hit by meteors, seismic faults, or twisters.
