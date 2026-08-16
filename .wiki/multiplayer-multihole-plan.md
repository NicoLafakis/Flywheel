# Multi-Hole Multiplayer Architecture & Implementation Plan

Synchronized multi-hole gameplay execution plan for 2-to-6 player real-time multiplayer in Flywheel. In every match, each joined player directly steers and controls their own dedicated black hole on the same shared metropolis map.

---

## 1. Core Mechanics & Architecture Overview

When players join a match (Host at slot 0 + Peers at slots $1 \dots N-1$):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MULTIPLAYER MATCH SESSION                         │
├──────────────────────────────────────┬──────────────────────────────────────┤
│               HOST CLIENT            │              PEER CLIENT             │
│                                      │                                      │
│  ┌────────────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │   Authoritative Sim (60 Hz)    │  │  │    Client-Predicted Sim        │  │
│  │  - Holes: [H0, H1, ... H_N-1]  │  │  │  - Holes: [H0, H1, ... H_N-1]  │  │
│  │  - Union support evaluation    │  │  │  - Steps local hole (mySlot)   │  │
│  │  - PvP collision resolution    │  │  │  - Smooths rival positions     │  │
│  │  - Consumed block authority    │  │  │  - Consumes eatenDelta blocks  │  │
│  └───────────────┬────────────────┘  │  └────────────────▲───────────────┘  │
│                  │                   │                   │                  │
│                  │ Broadcast: StateSync + EatenDelta     │                  │
│                  └───────────────────────────────────────┘                  │
│                                      │                                      │
│  ┌────────────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │     Host VoxelWorld3D          │  │  │     Peer VoxelWorld3D          │  │
│  │  - Local HoleMesh: Slot 0      │  │  │  - Local HoleMesh: mySlot (1..N)│ │
│  │  - Rival Meshes: Slots 1..N-1  │  │  │  - Rival Meshes: All others    │  │
│  │  - Cam locks on Hole 0         │  │  │  - Cam locks on Hole mySlot    │  │
│  │  - Multi-Hole Discard Shader   │  │  │  - Multi-Hole Discard Shader   │  │
│  └────────────────────────────────┘  │  └────────────────────────────────┘  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 1.1 Key Systems & Responsibilities

1. **Independent Hole Ownership**:
   - Each player is assigned a slot index ($0 \dots N-1$).
   - Holes spawn evenly spaced along the perimeter of the metropolis.
   - Each client transmits `INPUT_TICK` for their slot and steers their local hole.

2. **Local First-Person Perspective**:
   - The chase camera strictly tracks the local player's hole (`sim.holes[localSlot]`).
   - The local hole is equipped with the player's equipped skin, heading direction arrow, and local power-up auras.
   - The audio listener position (`audio.updateListener`) tracks `localHole.x, localHole.z`.
   - The HUD meters (mass, size, combo, score) track the local player's stats.

3. **Rival Visuals & Nameplates**:
   - Other players' holes (rivals) are rendered in real time at their synchronized positions.
   - Rivals render with their customized rim colors and skins.
   - Overhead floating 3D nameplate badges (`[Name] · SIZE X`) hover above each rival hole for instant visual recognition.

4. **Multi-Hole Ground Voxel Clipping**:
   - The ground/facade fragment shader receives uniform arrays:
     - `uniform vec2 uHolePos[8]`
     - `uniform float uHoleRadius[8]`
     - `uniform int uHoleCount`
   - Blocks falling below the street surface ($y < 0.01$) are kept if they are inside *any* active hole on the board, and discarded if outside all holes.

5. **Authoritative State Sync & Block Grid Consistency**:
   - The host sends `STATE_SYNC` at 60 Hz containing all hole states (`x, z, radius, mass, rawMass, alive, respawnTimer, kills, timesEaten`).
   - The host tracks newly consumed block IDs each frame into `eatenDelta` so peers immediately remove any block swallowed by any rival.

6. **PvP Mechanics & Match Leaderboard**:
   - Colliding with a smaller hole ($\ge 1.25\times$ radius ratio) swallows the smaller hole, granting mass to the predator and triggering a 10s respawn timeout on the victim.
   - Real-time in-game leaderboard HUD displays live ranks, scores, and PvP kill feed.

---

## 2. Component Implementation Details

### 2.1 3D Renderer (`js/voxelworld.js`)

- **Multi-Hole Clipping Shader**:
  ```glsl
  #define MAX_HOLES 8
  uniform vec2 uHolePos[MAX_HOLES];
  uniform float uHoleRadius[MAX_HOLES];
  uniform int uHoleCount;

  // In fragment shader:
  bool insideAnyHole = false;
  for (int i = 0; i < MAX_HOLES; i++) {
    if (i >= uHoleCount) break;
    if (length(vHoleWorldPos.xz - uHolePos[i]) <= uHoleRadius[i]) {
      insideAnyHole = true;
      break;
    }
  }
  if (vHoleWorldPos.y < 0.01 && !insideAnyHole) {
    discard;
  }
  ```
- **Local vs Rival Mesh Binding**:
  - `VoxelWorld3D(canvas, sim, skinId, options)` accepts `options.localSlot`.
  - `this.localHole = this.sim.holes[this.localSlot] || this.sim.hole`.
  - `this.holeMesh` binds to `this.localHole`.
  - `this.rivalMeshes` builds meshes for all `sim.holes` where `i !== this.localSlot`.
  - Each rival mesh receives an overhead billboard name badge (`THREE.Sprite` or canvas texture) showing player name and score.

### 2.2 Multiplayer Session (`js/multiplayer/`)

- **`MultiplayerHost` (`js/multiplayer/host.js`)**:
  - Steps simulation with collected inputs array `moves[0..N-1]`.
  - Tracks newly consumed block IDs and includes `eatenDelta` in `sendStateSync()`.
  - Forwards `PVP_KILL` events to all peers.
- **`MultiplayerPeer` (`js/multiplayer/peer.js`)**:
  - Steps local simulation with `moves[this.mySlot] = localMove`.
  - Transmits `INPUT_TICK` over channel.
  - Updates rival hole positions from `STATE_SYNC` and reconciles local score/mass.
  - Immediately detaches/consumes blocks received in `eatenDelta`.

### 2.3 Game Orchestrator & Camera (`js/main.js`)

- In `startMultiplayerMatch`:
  - Passes `localSlot = isHost ? 0 : mySlot` into `VoxelWorld3D`.
  - Identifies `localHole = sim.holes[localSlot] || sim.hole`.
- In the animation loop:
  - Calls `cam.update(realDt, localHole.x, localHole.z, localHole.radius, ...)`.
  - Stamps `localHole.heading = controls.heading`.
  - Updates listener `audio.updateListener(localHole.x, localHole.z, sim.moverSim)`.
  - Updates HUD `hud.updateSandbox(sim, localHole)`.
  - Filters local announcements: combo banners and fullscreen juice trigger only when `ev.hole === localHole`.

### 2.4 In-Game Live Scoreboard & HUD (`js/ui/hud.js`, `js/multiplayer/ui.js`)

- Displays top-right glassmorphic live leaderboard during multiplayer matches:
  - Ranked list of players (1st to $N$th) with player colors, names, and current scores.
  - Highlights the local player's rank.
  - Displays live kill feed alerts ("**Player 1** swallowed **Player 2**!").

---

## 3. Verification & TDD Plan

1. **Automated Sim & Protocol Tests**:
   - `node js/voxelsim.multihole.test.mjs`: Tests multi-hole instantiation, array move inputs, independent accumulation, conservation, union support, and PvP swallowing.
   - `node tools/validate.mjs`: Full repository regression test suite (must print `ALL PASS`).
2. **Multi-Client Browser Manual Verification**:
   - Launch local server: `python -m http.server 8000`.
   - Host match in Window 1 (2 players).
   - Join room in Window 2 using room code.
   - Verify both players steer their own holes, cameras follow the respective local holes, debris drops cleanly into both holes, nameplates are visible, and PvP collision triggers the respawn overlay.
