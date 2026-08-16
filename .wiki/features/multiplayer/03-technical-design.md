# 03 — Technical Design: 6-Player Invite Multiplayer Architecture

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                            UI LAYER                               │  │
│  │  - screens.showLobby(room)       - screens.showLobbyHost(cfg)     │  │
│  │  - screens.showLobbyChat()       - hud.updateMultiplayer(sim)     │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────────────▼─────────────────────────────────┐  │
│  │                     MULTIPLAYER CONTROLLER                        │  │
│  │                      (js/multiplayer/manager.js)                  │  │
│  │  - Room Lifecycle (create/join)   - Auto-Start Countdown Trigger  │  │
│  │  - Ephemeral In-Memory Chat Log   - Input Sampling & Dispatch     │  │
│  └──────────────────┬───────────────────────────────┬────────────────┘  │
│                     │                               │                   │
│  ┌──────────────────▼───────────────┐ ┌─────────────▼────────────────┐  │
│  │          SIMULATION LAYER        │ │       NETWORKING / WIRE      │  │
│  │  - js/voxelsim.js (multi-hole)   │ │  - js/multiplayer/channel.js │  │
│  │  - 60 Hz deterministic fixed-step│ │  - Ephemeral Broadcasts      │  │
│  │  - Exact single-player city load │ │  - Zero DB / Zero Storage    │  │
│  └──────────────────────────────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Structure

New clean modular namespace under `js/multiplayer/`:
- **`js/multiplayer/config.js`**: Multiplayer constants, supported scenes (`['gallery', 'manhattan', 'brooklyn']`), player count bounds ($2..6$), slot color palettes, countdown duration (3.0s), and tick rates.
- **`js/multiplayer/protocol.js`**: Binary/JSON wire message types (`ROOM_STATE`, `PLAYER_JOIN`, `PLAYER_LEAVE`, `LOBBY_CHAT`, `COUNTDOWN_START`, `GAME_START`, `INPUT_TICK`, `STATE_SYNC`, `GAME_OVER`).
- **`js/multiplayer/channel.js`**: Low-level transport wrapper over standard WebRTC / WebSocket / Realtime broadcast channels with automated reconnect, ping/pong latency measurement, and unpersisted broadcast dispatch.
- **`js/multiplayer/lobby.js`**: Staging lobby state manager, slot management, countdown timer loop, and ephemeral chat store.
- **`js/multiplayer/host.js`**: Host-authoritative session manager. Steps the 60 Hz `VoxelSandboxSim` with $N$ holes, consumes remote player inputs, resolves collisions/eats, and broadcasts periodic state snapshots.
- **`js/multiplayer/peer.js`**: Client/follower session manager. Samples local joystick/keyboard inputs, transmits `INPUT_TICK` messages, interpolates rival holes, and renders remote visual eat FX.
- **`js/multiplayer/ui-lobby.js`**: Modern, responsive DOM presentation component for the room creation, invite link sharing, player grid, countdown overlay, and ephemeral chat panel.

---

## 3. Ephemeral Chat Architecture (Zero Persistence)

```
[ Player Types Text ]
        │
        ▼
 [ lobby.sendChat(text) ]
        │ (Validate length <= 140, rate limit)
        ▼
 [ channel.broadcast('LOBBY_CHAT', { slot, name, text, ts }) ]
        │
        ├──► Local UI: append to in-memory Array (max 50 messages)
        │
        ▼
 (Wire Transmission over WebRTC / Realtime Broadcast)
        │
        ▼
 [ Remote Clients receive 'LOBBY_CHAT' ]
        │
        ▼
 [ Remote UI: append to in-memory Array ]
        │
        ▼
 [ Game Starts / Lobby Closes ]
        │
        ▼
 (Array cleared & DOM removed from tree — ZERO bytes saved to disk or DB)
```

### Anti-Persistence Safeguards
1. **No Database Writes**: The channel exclusively uses transient pub/sub broadcast topics (e.g. `broadcast: { self: false }`). No Postgres tables or row inserts are ever created for messages.
2. **No Client Persistence**: The chat array is instantiated as a local variable inside `LobbySession`. It is never written to `localStorage`, `sessionStorage`, cookies, or IndexedDB.
3. **Automatic Garbage Collection**: Calling `lobby.destroy()` unhooks all listeners, unmounts the DOM element, and sets the in-memory array to `null`.

---

## 4. Multi-Hole Simulation Integration

Flywheel's `VoxelSandboxSim` (`js/voxelsim.js`) already possesses native support for multiple holes (`sim.holes = [...]`).

### Allocation & Initialization
When the lobby launches the game:
1. Host builds the simulation:
   ```javascript
   const sim = new VoxelSandboxSim(sceneName, {
     seed: matchSeed,
     holes: players.map((p, i) => ({
       slot: i,
       name: p.name,
       skin: p.skin,
       color: PLAYER_PALETTES[i],
       x: spawnPositions[i].x,
       z: spawnPositions[i].z
     }))
   });
   ```
2. Spawn positions are computed deterministically around a circular staging perimeter ($R = 25\text{m}$) facing toward city center, ensuring zero initial overlap between players.
3. Fixed-step loop updates all holes:
   - Each hole possesses independent `x, z, vx, vz, radius, mass, chain, bestCombo, comboMultiplier`.
   - Block consumption checks spatial bounding boxes against all active holes in slot order. Eaten blocks are attributed directly to the consuming hole.

---

## 5. PvP Hole-on-Hole Collision & 10-Second Respawn Timeout

In the fixed 60 Hz simulation step (`sim._stepPvP()`):
1. **Pairwise Intersection Check**: For each pair of active holes $(A, B)$ where $A \ne B$:
   $$\text{dist}(A, B) = \sqrt{(A.x - B.x)^2 + (A.z - B.z)^2}$$
2. **Edibility Gate**: If $\text{dist}(A, B) < A.\text{radius}$ and $A.\text{radius} > B.\text{radius} \times 1.05$:
   - **Attribution & Award**: Player $A$ consumes Player $B$, gaining $50\%$ of $B$'s current mass and resetting $A$'s combo decay.
   - **Penalty State**: Player $B$ enters a 10.0-second timeout state:
     ```javascript
     B.alive = false;
     B.respawnTimer = 10.0; // 600 fixed ticks
     ```
   - **Event Broadcast**: Host emits `PVP_KILL` event `{ killerSlot: A.slot, victimSlot: B.slot, respawnTime: 10.0 }`.
3. **Respawn Resolution**: When `B.respawnTimer <= 0`, Player $B$ is restored:
   - Reset to initial baseline radius (`BASE_HOLE_RADIUS`).
   - Teleported to a deterministic safe perimeter waypoint furthest from all active rivals.
   - `B.alive = true`, granting 2.0 seconds of spawn invulnerability.

---

## 6. Power-Up & Systems Synchronization

All single-player power-up spawns (`js/powerups.js`), ground coins, and cataclysm systems are executed on the host's authoritative simulation:
- When any hole runs over a spawned power-up, the host fires `POWERUP_COLLECTED { slot, powerUpId, type }`.
- Timed buffs (`Titan`, `Chrono`, `Vortex`, `Turbo`, `Frenzy`) apply directly to the collecting hole and replicate visual auras to all connected peers.
- Seismic Quake fault lines and meteor events execute deterministically from the shared level seed.
