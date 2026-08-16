# 04 — Netcode & Wire Protocol: 6-Player Shared City Multiplayer

---

## 1. Message Types & Definitions

All messages utilize standard structured JSON or compact binary payloads over the active room broadcast channel (`room:<ROOM_CODE>`).

### 1.1 Lobby Lifecycle Messages

#### `JOIN_REQUEST` (Peer → Host)
Sent when a player joins the invite link:
```json
{
  "type": "JOIN_REQUEST",
  "name": "Nico",
  "skin": "cosmic_nebula",
  "clientVersion": 1
}
```

#### `ROOM_STATE` (Host → All)
Broadcast whenever a player joins, leaves, or changes status:
```json
{
  "type": "ROOM_STATE",
  "roomCode": "K7QM3",
  "scene": "manhattan",
  "maxPlayers": 4,
  "matchSeed": 1849204,
  "players": [
    { "slot": 0, "name": "HostPlayer", "isHost": true, "skin": "default", "color": "#00f0ff" },
    { "slot": 1, "name": "Nico", "isHost": false, "skin": "cosmic_nebula", "color": "#ff0054" },
    null,
    null
  ]
}
```

#### `LOBBY_CHAT` (Any → All)
Ephemeral text broadcast in the lobby:
```json
{
  "type": "LOBBY_CHAT",
  "id": "c92a",
  "slot": 1,
  "name": "Nico",
  "color": "#ff0054",
  "text": "Ready to take down Manhattan!",
  "ts": 1723789000123
}
```
*Rules*:
- `text` trimmed and clamped to max 140 chars.
- Pure broadcast: never acknowledged with storage writes, never saved.

#### `COUNTDOWN_START` (Host → All)
Triggered automatically when room capacity is reached ($N/N$):
```json
{
  "type": "COUNTDOWN_START",
  "durationMs": 3000,
  "serverStartTs": 1723789005000
}
```

#### `GAME_START` (Host → All)
Fired at the expiration of countdown:
```json
{
  "type": "GAME_START",
  "scene": "manhattan",
  "matchSeed": 1849204,
  "durationSeconds": 180
}
```

---

## 2. Gameplay Synchronization Messages

#### `INPUT_TICK` (Peer → Host, 30-60 Hz)
Client movement vector and active flags:
```json
{
  "type": "INPUT_TICK",
  "slot": 1,
  "tick": 420,
  "inputX": 0.85,
  "inputZ": -0.52,
  "boost": false
}
```

#### `STATE_SYNC` (Host → Peers, 12-20 Hz)
Authoritative snapshot of all active player holes:
```json
{
  "type": "STATE_SYNC",
  "tick": 420,
  "holes": [
    { "slot": 0, "x": 12.4, "z": -8.2, "vx": 1.2, "vz": -0.4, "radius": 2.1, "mass": 850, "score": 2400, "chain": 14 },
    { "slot": 1, "x": -5.1, "z": 14.8, "vx": -0.8, "vz": 1.5, "radius": 1.8, "mass": 620, "score": 1800, "chain": 8 }
  ],
  "eatenDelta": [402, 403, 512]
}
```

#### `PVP_KILL` (Host → All)
Broadcast when a larger hole devours a smaller hole:
```json
{
  "type": "PVP_KILL",
  "killerSlot": 0,
  "victimSlot": 1,
  "awardMass": 450,
  "respawnDelaySeconds": 10.0
}
```

#### `POWERUP_EVENT` (Host → All)
Broadcast when a powerup is spawned or collected:
```json
{
  "type": "POWERUP_EVENT",
  "action": "COLLECT",
  "slot": 1,
  "powerUpId": 14,
  "powerUpType": "TITAN"
}
```

#### `GAME_OVER` (Host → All)
Broadcast when match duration reaches 180s or full map is cleared:
```json
{
  "type": "GAME_OVER",
  "reason": "TIME_EXPIRED",
  "winnerSlot": 0,
  "finalLeaderboard": [
    { "slot": 0, "name": "HostPlayer", "score": 45200, "mass": 1240, "bestChain": 84, "kills": 2, "rank": 1 },
    { "slot": 1, "name": "Nico", "score": 38100, "mass": 980, "bestChain": 62, "kills": 1, "rank": 2 }
  ]
}
```

---

## 3. Disconnection & Fault Handling

- **Lobby Phase**:
  - If a peer disconnects while countdown is active, the countdown is immediately aborted, a system message is appended to the ephemeral lobby chat (`Player X disconnected — Countdown cancelled`), and the slot is reopened for new joiners.
- **Match Phase**:
  - If a peer disconnects during a live match, the host flags their hole as inactive (`hole.active = false`). Their hole model disappears or remains inert, and other players can continue competing until the 180s clock concludes.
