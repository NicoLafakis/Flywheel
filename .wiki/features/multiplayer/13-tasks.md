# 13 — Task Breakdown: 6-Player Invite Multiplayer (TDD Phased Plan)

All implementations strictly adhere to the Red-Green-Refactor development methodology.

---

## Phase 1: Core Multiplayer Protocol & Configuration (TDD)
- [ ] **T-101 — Configuration & Constants Module**: Define `js/multiplayer/config.js` with `MULTIPLAYER_SCENES` (`['gallery', 'manhattan', 'brooklyn']`), capacity bounds ($2..6$), slot colors, countdown durations, and tickrate limits. Test suite: `tools/multiplayer-config.test.mjs`.
- [ ] **T-102 — Message Schema & Protocol Validation**: Define `js/multiplayer/protocol.js` with codec encoders/decoders for all message types (`JOIN_REQUEST`, `ROOM_STATE`, `LOBBY_CHAT`, `COUNTDOWN_START`, `GAME_START`, `INPUT_TICK`, `STATE_SYNC`, `GAME_OVER`). Test suite: `tools/multiplayer-protocol.test.mjs`.

## Phase 2: Transport & Ephemeral Channel Architecture (TDD)
- [ ] **T-201 — Ephemeral Channel Transport**: Implement `js/multiplayer/channel.js` supporting loopback hub (for local testing/bots) and live pub/sub broadcast channels. Enforce zero database write paths and zero persistent storage. Test suite: `tools/multiplayer-channel.test.mjs`.
- [ ] **T-202 — Staging Lobby Manager & Auto-Start Logic**: Implement `js/multiplayer/lobby.js` managing room creation, joining, invite link encoding (`?room=CODE`), capacity bounds, automatic 3.0s countdown trigger on full capacity ($N/N$), countdown cancellation on peer drop, and ephemeral in-memory chat log management. Test suite: `tools/multiplayer-lobby.test.mjs`.

## Phase 3: Multi-Hole City Simulation Integration (TDD)
- [ ] **T-301 — 6-Player Multi-Hole City Initialization**: Verify and wire multi-hole instantiation ($N \in [2..6]$) across `gallery`, `manhattan`, and `brooklyn` with non-overlapping circular perimeter spawns. Test suite: `tools/multiplayer-sim.test.mjs`.
- [ ] **T-302 — Host Authority & Input Reconciliation**: Implement `js/multiplayer/host.js` and `js/multiplayer/peer.js` for fixed-step input transmission, remote player position interpolation, and eat event attribution across multiple simultaneous holes. Test suite: `tools/multiplayer-session.test.mjs`.
- [ ] **T-303 — PvP Hole-on-Hole Eating & 10s Pause Penalty**: Implement pairwise hole collision eating ($r_A > r_B$), 10.0s timeout pause overlay for the eaten player, mass transfer, and perimeter respawn. Test suite: `tools/multiplayer-pvp.test.mjs`.
- [ ] **T-304 — Power-Up & Systems Synchronization**: Wire single-player power-up spawns (`Vortex`, `Turbo`, `Titan`, `Chain Frenzy`, `Chrono Freeze`, `Fault Line Rupture`), ground coins, and cataclysms into the multi-hole session. Test suite: `tools/multiplayer-powerups.test.mjs`.

## Phase 4: UI Presentation (Lobby, Ephemeral Chat, Invite Link, HUD)
- [ ] **T-401 — Title Screen Multiplayer Navigation**: Add "Multiplayer" entry point in title screen opening the multiplayer setup modal/screen.
- [ ] **T-402 — Host Room Creation & Level Picker**: Build UI modal/screen allowing the host to select level (The Lab, Lower Manhattan, Brooklyn), player capacity ($2..6$), and click "Create Room".
- [ ] **T-403 — Staging Lobby Screen & Copy Invite Link**: Render 2..6 player roster cards with live status, host badge, player color chips, and a prominent `📋 COPY INVITE LINK` button with toast feedback.
- [ ] **T-404 — Ephemeral In-Lobby Chat UI**: Implement chat feed component inside the lobby with message list, auto-scrolling, input field, send button, and clear disclaimer ("🔒 Ephemeral Chat — never stored"). Ensure complete DOM destruction on game start.
- [ ] **T-405 — Synchronized 3-Second Countdown Overlay**: Render full-screen dramatic scale-in countdown numbers (`3`, `2`, `1`, `GO!`) and WebAudio chimes when room reaches full capacity.
- [ ] **T-406 — In-Game Multiplayer HUD & Rivals Display**: Add top-center leaderboard pill showing all active players, scores, and colored off-screen directional chevrons for rival positions. Ensure zero chat UI during gameplay.
- [ ] **T-407 — Post-Match Podium & Results Screen**: Render 1st, 2nd, 3rd place podium graphics and detailed score breakdown at the conclusion of the 180s match.

## Phase 5: Verification & End-to-End Validation
- [ ] **T-501 — Multi-Client E2E Simulation Validation**: Headless multi-process simulation test verifying a full 6-player match lifecycle from room join to game over. Test suite: `tools/multiplayer-e2e.test.mjs`.
- [ ] **T-502 — Validator Integration**: Add multiplayer test runners to `tools/validate.mjs` ensuring `ALL PASS`.
