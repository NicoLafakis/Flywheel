# ADR-0019: 6-Player Invite-Link Lobby Multiplayer with Ephemeral Lobby Chat and 1:1 Single-Player City Copy

- **Status:** accepted
- **Date:** 2026-08-16
- **Deciders:** Nico, Antigravity

## Context

The previous multiplayer prototype (`js/net/`, `arena.html`, `ADR-0010`) was coupled to an isolated 2-player arena separate from the core single-player game and suffered from architectural divergence. It has been completely scrapped.

We require a clean-slate, production-ready multiplayer experience that:
1. Directly uses the exact single-player voxel metropolis maps (starting with the first 3 levels: The Lab, Lower Manhattan, and Brooklyn).
2. Supports up to 6 simultaneous players (1 Host + up to 5 joining players, configurable $N \in [2..6]$).
3. Connects players seamlessly via shareable invite links and room codes.
4. Provides a pre-game staging lobby that automatically counts down and launches the match the instant all $N$ players have joined.
5. Features an ephemeral lobby chat that is never persisted to disk, database, or client storage, and completely terminates when gameplay begins (strictly zero in-game chat).

## Decision

### 1. Direct 1:1 Map Parity (Initial 3 Levels)
Multiplayer matches run on the identical voxel city definitions as single-player sandboxes. The initial rollout enables the first three catalog levels in size-ascending progression:
- **Level 1 — The Lab (`gallery`)**: 12,213 blocks / starter calibration.
- **Level 2 — Lower Manhattan (`manhattan`)**: 25,875 blocks / skyscraper canyon grid.
- **Level 3 — Brooklyn (`brooklyn`)**: 39,984 blocks / sprawling waterfront & bridges.

Both host and joining clients construct the identical city geometry locally from a shared seed, ensuring zero bandwidth wasted on transmitting static geometry.

### 2. Configurable Capacity (Host + up to 5 Joiners)
- The host selects the match player count $N$ ($2 \le N \le 6$).
- Slots are allocated in order: Slot 0 (Host), Slots 1..5 (Peers).
- Each player slot is assigned a unique, high-contrast identity palette and custom skin.

### 3. Shareable Invite Link & Room Code
- Rooms generate a compact 5-character alphanumeric room code (e.g. `K7QM3`).
- Invite URL format: `https://<origin>/?room=<CODE>` or modal 1-click clipboard copy.
- Joiners navigating to the URL directly land in the target lobby.

### 4. Lobby Lifecycle & Auto-Start on Full Room
- The lobby displays joined players, readiness status, chosen map preview, and room capacity (e.g., `4/6 Players`).
- **Auto-Start Condition**: The moment the active player count reaches the host-configured target capacity ($N/N$), the lobby initiates an unskippable 3.0-second visual/auditory countdown (`3... 2... 1... GO!`) and launches all players into the active match simultaneously.
- Host also retains a manual "Force Start" option if all currently connected players agree.

### 5. Ephemeral Lobby Chat (Zero Storage / In-Memory Only)
- Players can send text chat messages while waiting in the lobby.
- **Strict Anti-Persistence Invariant**: Chat messages exist exclusively in ephemeral channel memory. They are NEVER written to Supabase tables, Postgres databases, backend disk logs, `localStorage`, `sessionStorage`, or IndexedDB.
- **No In-Game Chat**: When the lobby transitions to gameplay, the chat component is completely unmounted from the DOM and disconnected from the network channel. In-game HUD contains zero chat UI to preserve competitive focus and prevent toxicity/distraction.

### 6. Single-Player Feature & Power-Up Parity
All single-player game functions, power-up systems, collectible coins, and environmental cataclysms operate in multiplayer:
- Power-ups (`Vortex`, `Turbo`, `Titan`, `Chain Frenzy`, `Chrono Freeze`, `Fault Line Rupture`) spawn dynamically in the shared city.
- Any player can collect power-ups, activating the corresponding buff effects (e.g. Titan expansion, Chrono freeze, or tectonic fault lines).

### 7. PvP Hole-on-Hole Eating (10-Second Pause Penalty)
- If player $A$ intersects player $B$ and $A$'s radius exceeds $B$'s radius ($r_A > r_B$), Player $A$ consumes Player $B$.
- **10-Second Penalty Pause**: The eaten player ($B$) is placed into a 10.0-second timeout/pause state with a countdown overlay (`RESPAWNING IN 10s...`), during which they cannot move or eat.
- **Respawn**: After 10 seconds, player $B$ respawns at a safe staging perimeter point with their baseline size restored.
- **Consumption Award**: Player $A$ receives a substantial bonus mass award for eliminating a rival.

### 8. Victory & Win Conditions
A match concludes when either:
1. The match duration timer expires (e.g., 180s clock), OR
2. The city pieces are completely eaten (100% full map clear).
- **Winner Verdict**: The player who ate the most on the map (highest total devoured pieces / mass) wins 1st place on the post-match podium.

## Consequences

- **Code Reusability**: Single-player map files (`voxelscene-*.js`), power-up integrators, physics systems, and cosmetic assets are shared directly without duplication.
- **High-Stakes Dynamics**: PvP eating creates thrilling cat-and-mouse interactions; the 10s pause penalty gives rivals meaningful territory expansion opportunities.
- **Zero Privacy / Storage Liability**: Because lobby chats are strictly ephemeral broadcasts, zero user-generated text is stored on any server or database.
- **Predictable Match Pacing**: Full-lobby auto-start eliminates staging delays and gets players into the action immediately.
- **Focused Competitive Gameplay**: Clean gameplay HUD without distraction or clutter from in-game chat feeds.
