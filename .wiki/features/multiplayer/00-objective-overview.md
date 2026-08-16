# 00 — Objective & Overview: 6-Player Invite Multiplayer

*Flywheel — Shared Metropolis Arena*

---

## 1. Vision & Core Objective

Bring the chaotic fun of Flywheel's single-player city destruction into a live, real-time shared arena where up to **6 players (1 Host + 5 Joiners)** compete simultaneously in the exact same metropolis maps.

Players can instantly spin up a match, configure the desired player count (2 to 6), share a short invite link with friends or rivals, chat in real time within the staging lobby, and jump straight into high-stakes synchronized city eating the moment all expected players join.

---

## 2. Core Pillars

### 1. Direct Single-Player City Map Parity (Initial 3 Levels)
No artificial stripped-down arenas. Multiplayer directly runs the authored voxel sandboxes from single-player mode. The initial rollout enables the first three catalog levels:
1. **The Lab (`gallery`)**: Fast-paced warmup starter grid (~12,213 blocks).
2. **Lower Manhattan (`manhattan`)**: Classic Wall Street canyon grid with dense towers (~25,875 blocks).
3. **Brooklyn (`brooklyn`)**: Expansive waterfront, docks, and bridge approaches (~39,984 blocks).

### 2. Flexible Room Capacity (2 to 6 Players)
The host selects the exact target player capacity ($N \in [2..6]$) when creating the room. The game supports 1v1 duels, 3-4 player brawls, up to full 6-player metropolitan cataclysms.

### 3. One-Click Invite Links
Hosting generates a clean invite link containing a unique 5-character alphanumeric room code (e.g. `https://flywheel.app/?room=K7QM3`). Joiners clicking or pasting the link are immediately routed directly into the host's lobby.

### 4. Zero-Friction Auto-Start
No confusion over when to press "Start". When the lobby reaches full capacity ($N/N$ players connected), an unskippable 3-second visual and audio countdown initiates across all connected clients, seamlessly launching everyone into the city at the exact same tick.

### 5. Ephemeral Lobby Chat (Zero Storage / Zero In-Game Clutter)
- Real-time bidirectional chat is available exclusively in the staging lobby for bantering, agreeing on rules, and coordinating.
- **Strict Anti-Persistence**: Messages are broadcasted in-memory over the real-time channel. Zero chat messages are ever written to Postgres, databases, backend storage, or client cookies/storage.
- **Zero In-Game Chat**: In-game HUD has zero chat box or inputs, preserving 100% of mobile/desktop screen real estate and competitive focus for city demolition.

### 6. Full Power-Up & Systems Parity
All single-player power-ups (`Vortex`, `Turbo`, `Titan`, `Chain Frenzy`, `Chrono Freeze`, `Fault Line Rupture`), map coins, and cataclysmic disasters spawn dynamically in the shared multiplayer city.

### 7. PvP Hole-on-Hole Eating (10-Second Pause Penalty)
When a larger player hole collides with a smaller player hole ($r_\text{large} > r_\text{small}$), the larger player devours the smaller player. The eaten player receives a **10-second penalty pause / respawn countdown** before re-entering the city at a safe spawn point.

### 8. Definitive Victory Conditions
The match ends when the 180s countdown clock expires OR when the city is 100% cleared. The player who ate the most on the map (total pieces/mass devoured) wins the match!

---

## 3. Invariants

1. **Pure Sim Boundary**: Multiplayer simulation logic strictly follows the fixed 60 Hz deterministic step loop (`sim.step(1/60)`), with three.js rendering decoupled from state advancement.
2. **Deterministic Map Build**: Host and peers construct the identical voxel city locally from the shared level seed, requiring zero geometry transmission over the network.
3. **Strict Ephemerality**: Chat text exists solely in RAM during the active lobby session. Once the match starts or players disconnect, the chat history is instantly garbage collected.
4. **Offline / Solo Safety**: Single-player campaign and free-play sandbox modes remain 100% functional with zero network dependencies.
