# 01 — Product Requirements Document (PRD): 6-Player Invite Multiplayer

---

## 1. User Personas & Scenarios

### Persona A: The Casual Host (e.g., Discord / Group Chat Organizer)
- **Goal**: Wants to play Flywheel with 3 friends on Discord quickly without forcing anyone to create accounts or download an app.
- **Workflow**: Clicks "Host Game", selects 4 Players and "Lower Manhattan", copies the invite link, pastes into Discord. Friends click the link, pick a name/color, chat in the lobby while waiting for the 4th friend, and the match launches automatically when everyone arrives.

### Persona B: The 1v1 Competitor
- **Goal**: Fast, high-intensity duel against a specific rival.
- **Workflow**: Creates a 2-Player room on The Lab, sends link to rival. Rival clicks, instantly fills room (2/2), 3-second countdown triggers, match begins.

### Persona C: The Mobile Joiner
- **Goal**: Taps an invite link on an iOS or Android device and plays instantly in mobile Safari / Chrome.
- **Workflow**: Opens link in browser, sees responsive lobby UI with touch keyboard input for chat and name entry, sees live player count update, transitions smoothly into full-screen touch joystick gameplay.

---

## 2. Feature Walkthrough & UX Flow

```
[ Title Screen ]
       │
       ▼
 [ Multiplayer Mode Select ] ───────────┐
       │                                │
       ├─► [ Create Room / Host ]       └─► [ Join Room via Code ]
       │        │                              │
       │   Select Level (1..3)                 │
       │   Select Max Players (2..6)           │
       │        │                              │
       │        ▼                              ▼
       └──────► [ Staging Lobby Screen ] ◄─────┘
                    │
                    ├─ Shareable Link Copy Button ("📋 Copy Invite Link")
                    ├─ Player Roster Grid (Slots 1..N with colors/names)
                    ├─ Ephemeral Live Chat Box (Lobby only)
                    ├─ Map Showcase Card (The Lab / Manhattan / Brooklyn)
                    │
                    ▼
         (Room Reaches N/N Capacity)
                    │
                    ▼
           [ 3-Second Countdown ]
             "3... 2... 1... GO!"
                    │
                    ▼
          [ Live 6-Player Match ]
         (Identical SP Map, Multi-Hole Sim,
          Zero In-Game Chat, 180s Match Clock)
                    │
                    ▼
        [ Post-Match Podium & Results ]
         (Final Mass, Best Chains, Winner)
                    │
                    ▼
            [ Return to Lobby / Menu ]
```

---

## 3. Key UX & UI Requirements

### 3.1 Host Configuration Screen
- **Level Selector**: 3 horizontal carousel/radio cards showing:
  1. *The Lab* (Tier 1 · Starter · 12k blocks)
  2. *Lower Manhattan* (Tier 2 · Financial Grid · 25k blocks)
  3. *Brooklyn* (Tier 3 · Waterfront Metropolis · 40k blocks)
- **Player Capacity Stepper**: Interactive counter with `-` / `+` buttons allowing selection of `2`, `3`, `4`, `5`, or `6` players.
- **Create CTA**: Primary button that provisions room code and enters lobby.

### 3.2 Staging Lobby Interface
- **Top Header**: Room Code (e.g. `ROOM: K7QM3`), selected city pill, and player count pill (e.g. `3 / 4 PLAYERS`).
- **Share Card**:
  - One-tap button: `📋 COPY INVITE LINK` (copies `https://<domain>/?room=K7QM3` with copy toast notification).
  - Direct QR code / room code display.
- **Player Roster (2..6 Slots)**:
  - Visual cards for all $N$ slots.
  - Filled slots show player name, host crown badge, player hole color indicator, and active skin preview.
  - Empty slots show pulsating dashed borders and `Waiting for player...`.
- **Ephemeral Chat Panel**:
  - Scrollable live chat log showing incoming and outgoing messages.
  - Chat input box with `Send` button (and `Enter` key support).
  - Character limit: 140 characters per message.
  - Rate limiting: max 3 messages per second per client.
  - System notices: `Player Joined`, `Player Left`, `Countdown Started`, plus the start-vote narration (vote unlocked, each vote landing as `n/m`, vote passed).
  - Notice text: `🔒 Ephemeral Chat — Messages are never stored and disappear when match begins.`
- **Start Controls**:
  - Host: a start button, enabled at any count $\ge 2$. Reaching capacity changes nothing on its own.
  - Non-hosts: no start affordance at all until the host has been idle $\ge 45$s and $\ge 3$ players are seated — the vote UI is *absent*, not greyed out. Once unlocked it needs every non-host to agree.
- **Countdown Overlay**:
  - Triggers on the host's start or on a passed vote, never on room capacity.
  - Full-screen dramatic translucent glass modal with bold scale-in countdown numbers (`3`, `2`, `1`, `GO!`) and sound effects.

### 3.3 Live Gameplay Screen
- Same high-fidelity Three.js viewport and camera controls as single-player voxel sandboxes.
- **Power-Up Spawns & Parity**:
  - Dynamic intermittent power-ups (`Vortex`, `Turbo`, `Titan`, `Chain Frenzy`, `Chrono Freeze`, `Fault Line Rupture`), ground collectible coins, and scheduled cataclysms match single-player rules.
  - Active power-up buffs (e.g. Titan scale increase, Chrono world pause, Tectonic fissures) apply in real time to the collecting player.
- **PvP Hole-on-Hole Eating**:
  - A player with a larger hole radius devours any colliding player with a smaller radius ($r_\text{larger} > r_\text{smaller}$).
  - Consuming a rival awards mass and score to the larger player.
  - **10-Second Penalty / Respawn Timeout**: The eaten player's hole is swallowed into the void; their screen enters a 10.0-second timeout overlay (`💀 CONSUMED BY [RIVAL]! · RESPAWNING IN 10.0s...`) with disabled steering.
  - At $t=0$, the player respawns at a safe perimeter coordinate with their baseline starter hole radius.
- **HUD Elements**:
  - Top live mini-leaderboard rail displaying all connected player holes with their colors, names, and current devoured pieces/mass.
  - Player hole indicators: In-world colored floating nameplates and directional off-screen edge chevrons pointing toward rivals.
- **No Chat**: Absolutely no chat UI, input fields, or chat bubbles during gameplay.

### 3.4 Match Termination & Victory Condition
- **Triggers**:
  1. Countdown Clock reaches `00:00` (e.g. 180s duration), OR
  2. All map pieces are eaten (100% full map clear).
- **Winner Determination**: The player who devoured the most pieces / mass on the map wins 1st place.

### 3.5 Post-Match Summary Screen
- **Podium Ranking**: 1st, 2nd, 3rd place podium graphics with medals, scores, and player skins.
- **Detailed Stat Breakdown**: Total mass devoured, percentage of city eaten, player kills / times eaten, longest combo chain, and power-ups collected.
- **Action Buttons**: `Play Again (Same Lobby)` or `Back to Menu`.
