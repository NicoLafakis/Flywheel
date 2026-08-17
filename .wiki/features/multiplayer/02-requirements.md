# 02 — Detailed Requirements: 6-Player Invite Multiplayer

---

## 1. Functional Requirements

| ID | Requirement | Description | Acceptance Criteria |
|---|---|---|---|
| **REQ-MP-01** | **Exact Map Replication** | Multiplayer levels load the identical procedural/authored voxel scenes from single-player. | Level definitions for `gallery`, `manhattan`, and `brooklyn` load the exact block schemas, vehicle grids, and structural equilibrium. |
| **REQ-MP-02** | **Initial 3-Level Scope** | Host can select any of the first 3 catalog levels: The Lab, Lower Manhattan, or Brooklyn. | Host level selection dropdown/carousel includes only these 3 levels during initial release. |
| **REQ-MP-03** | **Configurable Player Capacity** | Host selects match size between 2 and 6 players inclusive. | Stepper control allows values $N \in [2, 3, 4, 5, 6]$; lobby rejects join attempts when room has $N$ players. |
| **REQ-MP-04** | **Invite Link Generation** | Generating a room creates a unique URL with a 5-character alphanumeric room code. | URL format matches `?room=XXXXX`; clicking copy places URL into clipboard and triggers toast confirmation. |
| **REQ-MP-05** | **Direct Link Join Flow** | Navigating to an invite link automatically connects the browser to that lobby. | Client parses `?room=` parameter on load, bypasses manual code entry, and prompts for player display name. |
| **REQ-MP-06** | **Deliberate Lobby Start** | Reaching capacity does **not** start the match. A countdown has exactly two entry points: the host presses start, or the non-host players unanimously vote to start a host who has gone idle. | A full $N/N$ room sits waiting indefinitely. The host's start button arms an unskippable 3.0s synchronized countdown at any count $\ge 2$. The vote is unavailable until the host has been idle $\ge 45$s, requires $\ge 3$ seated players, must be unanimous among the non-hosts, and is reset in full by any join, any leave, or any host activity. The host alone broadcasts the resulting countdown. |
| **REQ-MP-07** | **Ephemeral Lobby Chat** | Real-time text messaging within the staging lobby only. | Messages broadcast instantly to all room occupants via WebSocket/Realtime broadcast; max 140 chars. |
| **REQ-MP-08** | **Strict Chat Non-Persistence** | Chat messages are never saved to disk, database, or client storage. | Zero database insert calls; zero entries in localStorage/IndexedDB; memory is discarded on lobby exit. |
| **REQ-MP-09** | **Zero In-Game Chat** | Chat UI is completely excluded from the in-game HUD and match state. | No chat box, hotkey, or DOM element exists in `#hud-left`, `#hud-right`, or the screen root during gameplay. |
| **REQ-MP-10** | **Multi-Hole Simulation** | Pure sim engine tracks up to 6 distinct holes with independent positions, sizes, masses, and combo streaks. | `VoxelSandboxSim` manages `sim.holes[0..5]`, applies spatial hash eating deterministically, and attributes eaten blocks to the correct eater. |
| **REQ-MP-11** | **Victory Conditions** | Match terminates on 180s timeout OR 100% full map clear; player with highest devoured pieces/mass wins. | Host evaluates win state on clock expiry or zero remaining edible blocks; assigns 1st place to top mass/piece devourer. |
| **REQ-MP-12** | **PvP Hole Eating & 10s Pause** | Larger player consumes smaller player on contact; smaller player is paused for 10 seconds before respawning. | When $r_A > r_B$ and distance $< r_A$, Player $B$ is swallowed, triggering 10.0s respawn timeout overlay on $B$'s client and awarding mass to $A$. |
| **REQ-MP-13** | **Full Power-Up & Systems Parity** | All single-player power-ups, coins, and disasters spawn and function in multiplayer. | `Vortex`, `Turbo`, `Titan`, `Chain Frenzy`, `Chrono Freeze`, and `Fault Line Rupture` spawn and activate live buffs on pickup. |

---

## 2. Non-Functional & Quality Requirements

1. **Performance**:
   - Host and peer framerates must maintain 60 FPS on standard desktop and mobile hardware.
   - Network payload per state snapshot: $< 500$ bytes compressed delta per tick.
2. **Deterministic Geometry**:
   - Both host and peer build the city with `VoxelSandboxSim(scene, { seed: matchSeed })`. Block IDs, dimensions, and materials match bit-for-bit.
3. **Resilience & Disconnection**:
   - If a peer disconnects in the lobby, their slot becomes available again, a running countdown is cancelled, and the start-vote tally and host-idle clock are both reset (a tally must never outlive the roster it was counted against).
   - If a peer disconnects during gameplay, their hole is frozen or retired cleanly without crashing the host or remaining peers.
4. **Mobile Responsiveness & Touch Ergonomics**:
   - Staging lobby and chat inputs adapt fluidly to portrait and landscape viewports on iOS Safari and Android Chrome.
   - Safe area insets (`env(safe-area-inset-*)`) respected across all lobby cards and chat inputs.
