# Multiplayer System

`js/multiplayer/` implements low-latency, zero-storage, authoritative multiplayer over Supabase Realtime Broadcast.

## Architecture

- **Transport (`js/multiplayer/channel.js`)**: Ephemeral WebSocket broadcast layer. Messages are never written to disk or database. Includes outbound queueing until `SUBSCRIBED`.
- **Wire Protocol (`js/multiplayer/protocol.js`)**: Standardized messages (`JOIN_REQUEST`, `ROOM_STATE`, `GAME_START`, `INPUT_TICK`, `STATE_SYNC`, `PVP_KILL`, `GAME_OVER`).
- **Lobby (`js/multiplayer/lobby.js`)**: Room creation, 5-character codes, invite links (`/?room=CODE`), ephemeral chat, and 3-second auto-start countdown.
- **Host Session (`js/multiplayer/host.js`)**: Authoritative physics simulation, input collection across slots, and state broadcasting at 60 Hz.
- **Peer Session (`js/multiplayer/peer.js`)**: Client-side prediction, input transmission, state smoothing.
- **Multi-Hole Presentation Alignment**:
  - `VoxelSandboxSim.localSlot`: Identifies which slot the local client controls (`0` for Host, `mySlot` for Peer).
  - `sim.localHole`: Accessor used by camera, audio listener, controls, and HUD.
  - `VoxelWorld3D`: Renders local player's equipped skin on `sim.localHole`, and dynamically renders colored rival rings for all connected slots $0..N-1$ excluding `localSlot`.
- **PvP Interactions**: Pairwise hole collision swallowing ($r_\text{large} > r_\text{small} \times 1.05$), +50% mass steal bounty, 10s perimeter respawn with fullscreen countdown overlay, and real-time takedown announcements.
- **Per-Player Coin Isolation & Banking**: Each hole tracks its own `coinsCollected` and `coins`. Coin pick-up SFX, toasts, and combo pulses fire exclusively for `sim.localHole` while rival pick-ups render silent golden sparkles in 3D. Coins are synced in `STATE_SYNC`, ranked on the victory podium, and deposited into `save.coins` on match conclusion.
- **Free Basic Color Skins**: 7 baseline color skins (`baseline-cyan`, `baseline-crimson`, `baseline-amber`, `baseline-emerald`, `baseline-purple`, `baseline-orange`, `baseline-magenta`) costing 0 coins, providing distinct colors across single player and multiplayer.
