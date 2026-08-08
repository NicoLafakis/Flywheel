# Online Flywheel — Netcode Design

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) ·
> [Test strategy](07-test-strategy.md) ·
> [Threat model](09-threat-model.md) ·
> [Risks](11-risk-register.md)

The live arena: "same city, live, together." Everyone who joins drops into the
same city at the same moment, sees each other's holes moving in real time, and
races to eat the most before the clock runs out.

Model, locked by [ADR-0010](../../adr/0010-host-authoritative-arena.md): the
**first client in a room is the authority**. It runs the one true `Sim`,
applies everyone's steering, and broadcasts snapshots. Peers send intent and
interpolate. Scores are recomputed server-side by replaying the host's trace.

This doc is written against a specific environment, and every judgement in it
is made for that environment rather than for the general case:

> A booth at a conference. Shared venue wifi with hundreds of devices on it.
> Players who have never seen the game before, playing for three minutes, on
> phones and on two booth laptops. Someone closes a laptop lid mid-match, and
> they do it more than once a day. Nobody is going to read an error message.

---

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Room** | A durable lobby with a 4-character code. Survives many matches |
| **Session** | One match inside a room. Has its own seed and clock |
| **Host** | The client whose `session_id` equals `arena_rooms.host_session_id`. Runs the authoritative sim |
| **Peer** | Any non-host player. Sends intent, renders ghosts |
| **Ghost** | A remote player's hole as drawn on a peer's screen. Lives in the net layer's roster, **never** in `sim.rivals` (invariant 7) |
| **Slot** | A stable 0..N index within a session. Wire messages use slots, not uuids — a uuid is 36 bytes and a slot is one |
| **Generation** | `arena_rooms.host_generation`. Increments on every host migration. Stamped on every snapshot; peers reject stale ones |
| **Tick** | One `sim.step(1/60)`. The authoritative clock. Never wall-clock |

---

## 2. Room lifecycle

```
                  arena-open                arena-join (code)
 [ nothing ] ──────────────────► [ OPEN ] ◄────────────────────  players
                                    │
                            host presses START
                            (or auto at capacity,
                             or 20 s after 2nd join)
                                    ▼
                             [ COUNTDOWN 3s ]  ── seed broadcast, cities built
                                    │
                                    ▼
                            [ IN_MATCH  N ticks ]
                              ├─ late join  (until T−30 s)
                              ├─ rejoin     (30 s grace)
                              └─ host migration (any time)
                                    │
                            clock hits zero
                                    ▼
                          [ SETTLING ~2 s ]  host → arena-finalize
                                                peers → arena-attest
                                    ▼
                            [ RESULTS ] ──► back to OPEN (same room, same
                                             code, new session and new seed)
```

**Returning to OPEN with the same code is the booth feature.** A room code
written on a card at the booth stays valid all day; each press of REMATCH mints
a new session and a new seed under the same code. Nobody re-reads a code off a
screen between rounds.

### 2.1 Creating and joining

- **Create:** `arena-open` (see [03](03-technical-design.md) §3.1) returns a
  code, a session id, a seed, and makes the caller host.
- **Join by code:** four characters from a 28-symbol alphabet with `O`, `0`,
  `I`, `1` removed — 614,656 combinations, which at a booth's handful of live
  rooms means a collision is a retry, not a design problem. The input field
  upper-cases and strips whitespace as you type, and accepts a pasted full URL
  (`…/#/arena/K7QM`) as well as bare characters, per global rule 3.
- **Quick join** (the booth's default button, and the only one on the
  touch-first layout): calls `arena-join` with no code, which server-side
  selects the newest `OPEN` room for the active event with capacity, and calls
  `arena-open` if there is none. One tap from title screen to lobby. A player
  at a booth should never have to know what a room code is.
- **QR code:** the booth screen renders the join URL as a QR. This is not a
  nicety at a conference; typing anything on a phone at a loud booth is where
  players are lost.

### 2.2 Capacity: eight players

**Max 8, defaulted from `arena_rooms.max_players`, overridable per event via
`events.config`.** Reasons, in the order they actually bind:

1. **The host's frame budget.** The host runs one `Sim` with 8 holes. `sim.js`
   already runs the player plus up to 3 rivals through the same `eatAround` /
   swallow paths, so 8 holes is roughly 2x a level-90 campaign sim — comfortably
   inside budget on a laptop, and the host is *always* a laptop at the booth
   because the booth machine opens the room. On a phone host, 8 holes plus
   rendering is the case to measure ([07](07-test-strategy.md)).
2. **Message volume.** Delivered messages scale with players squared for a
   broadcast topology (host sends to N−1, N−1 peers send to host). At 8 players
   a 3-minute match is ~45 K delivered messages; at 16 it is ~170 K, and the
   free-tier ceiling in [03](03-technical-design.md) §7.3 arrives inside a
   single afternoon.
3. **Legibility.** Eight coloured holes on a shared city is already busy.
   Beyond that the minimap becomes confetti and a new player cannot find
   themselves — which is the failure a booth cannot afford, because the player
   has three minutes and no tutorial.
4. **Booth reality.** A booth has two laptops and a queue. Eight is more than
   ever plays at once and leaves room for a group that arrives together.

Overflow past 8 joins as a **spectator** (§11), not as a rejection. "Room full"
is a dead end; "watching, you're next" is a queue.

---

## 3. The shared seed

Every client generates the identical city because
[ADR-0003](../../adr/0003-deterministic-seeded-generation.md) says it will.

- The seed is `arena:{session_id}` — a uuid, so it is unguessable and
  unrepeatable, and **minted server-side** in `arena-open`. A client-chosen
  seed lets a player scout a city, restart until they like it, and arrive
  knowing where the golden props are.
- It arrives in the `arena-open` / `arena-join` response, and is re-broadcast
  in the `match_start` message so a late joiner never has to ask.
- Cities are built during COUNTDOWN, not at match start. The 3-second countdown
  exists precisely to cover `generateCity` (campaign) or `_buildScene` (voxel,
  ~1.3 s for Lower Manhattan — the hitch `main.js` already shows a loading frame
  for). A client that has not finished building when the clock starts joins at
  the first tick it can and its hole is spawned in place; the sim is
  authoritative and does not wait.
- **Build version is part of the contract.** Two builds of `citygen.js` produce
  two different cities from one seed. `arena-join` returns the room's
  `build_version`; a mismatched client refuses to play and joins as a spectator
  with an explicit message. This is not paranoia — it is the exact failure mode
  of deploying mid-conference, which will happen.

---

## 4. Rates and payload budget

Three independent clocks. Only the first is a game invariant.

| Clock | Rate | Constant | Notes |
|---|---|---|---|
| **Simulation** | 60 Hz fixed | `FIXED_DT` in `main.js` | Unchanged. Invariant 3. The host steps exactly as single-player does |
| **Snapshot** (host → all) | **12 Hz** shipped; 15 Hz ceiling | `SNAPSHOT_HZ` in `js/net/snapshot.js` | Every 5th tick at 12 Hz |
| **Intent** (peer → host) | **10 Hz** shipped; 20 Hz ceiling | `INTENT_HZ` | Every 6th tick at 10 Hz |
| **Keyframe** (host → all) | 0.5 Hz | `KEYFRAME_HZ` | Full state including the eaten set. The host-migration lifeline (§7) |
| **Heartbeat** | Rides on every snapshot | — | No separate message |

The shipped rates are lower than the ceiling for the cost reason in
[03](03-technical-design.md) §7.3, and they are *chosen*, not conceded: at a
100 ms interpolation delay (§5) a 12 Hz snapshot stream is indistinguishable
from 15 Hz for holes moving at 4.5–7.5 m/s. Nobody at the booth can see the
difference and the booth stays inside the free tier. One constant each, so
raising them is a one-line change if measurement disagrees.

### 4.1 Wire format

Supabase Realtime broadcast carries JSON with a default payload ceiling around
**256 KB**. We are not close, and staying not-close is the point: our target is
**≤ 1 KB per snapshot**, which leaves two orders of magnitude of headroom for
whatever this grows into.

Snapshots are **binary, base64'd into the JSON envelope**. JSON per-field names
for 8 holes at 12 Hz is roughly 6x the bytes for no benefit, and a binary codec
in one pure file (`js/net/snapshot.js`) is easier to test than a shape spread
across call sites.

**Snapshot, `S`:**

```
header  (12 bytes)
  u8   type        = 0x01
  u8   generation           host_generation; peers drop stale
  u16  tick                 low 16 bits of the sim tick, wraps every ~18 min
  u16  flags                bit0 keyframe, bit1 match_over, bit2 tide_fired
  u16  time_left_cs         centiseconds, 0..65535
  u8   hole_count
  u8   event_count
  u16  reserved

per hole (10 bytes × N)
  u8   slot
  u8   state                bit0 alive, bit1 disconnected, bit2 swallowing
  i16  x_cm, z_cm           world position in cm, ±327 m — every shipped scene fits
  u16  mass_q               mass × 4, 0..16383 (cap is well under)
  u8   radius_q             radius × 20, 0..12.75 m (PLAYER_MAX_RADIUS is 6.0)
  u8   heading_q            heading × 256/2π

per event (4 bytes × E)      eats since the last snapshot
  u8   slot
  u8   flags                bit0 golden, bit1 landmark, bit2 combo_pop
  u16  object_id            index into the city's object array
```

At 8 holes and 12 events: 12 + 80 + 48 = **140 bytes**, ~190 base64'd. At 12 Hz
that is **2.3 KB/s down per peer**. A 3-minute match moves under 500 KB total
per client. On venue wifi this is invisible.

Object ids are indices into the deterministically-generated city array, which
is identical on every client. That is the second dividend of ADR-0003 in this
doc: we send a number, not an object.

**Intent, `I`** (peer → host), 6 bytes:

```
  u8   type      = 0x02
  u8   slot
  u16  seq                  monotonic; host keeps the highest and drops the rest
  i8   mx, mz               steering, ÷127. Exactly what sim.step already takes
```

**Keyframe, `K`**: a snapshot with `flags.keyframe`, plus the **eaten bitset** —
one bit per city object, RLE'd. Lower Manhattan's ~1,400 campaign-scale objects
is 175 bytes raw and typically under 60 RLE'd; a voxel scene sends a coarser
per-zone consumption summary instead, since 82,894 blocks is not a bitset we
want on the wire twice a second. The keyframe is what lets a new host or a late
joiner know what is already gone (§7, §8).

**Control messages** (`join`, `leave`, `roster`, `match_start`, `match_end`,
`host_claim`, `host_announce`) are plain JSON. They are rare, they are read by
humans during debugging, and none of them is on a per-tick path.

---

## 5. Interpolation and reconciliation

### 5.1 Remote holes: buffered interpolation

Peers render ghosts **100 ms in the past** — `INTERP_DELAY_MS = 100`, slightly
over one snapshot interval at 12 Hz (83 ms), so there is nearly always a
snapshot on each side of the render time and interpolation is interpolation
rather than extrapolation.

- Keep a ring buffer of the last 8 snapshots, ordered by tick.
- Render time = `now − INTERP_DELAY_MS`. Find the bracketing pair, lerp
  position and radius linearly, slerp heading on the shortest arc.
- If the buffer has run dry (the host went quiet), **extrapolate for at most
  250 ms** along the last known velocity with a decay, then freeze the ghost
  and dim it. Frozen-and-dimmed reads as "that player has a bad connection",
  which is true and is better than a ghost that slides confidently through a
  building.
- Ghosts are drawn by `world3d.js` from the roster the net layer maintains. The
  sim on a peer does not know they exist.

### 5.2 Your own hole: predict, then reconcile

Input latency is the one thing a player feels immediately, so a peer's own hole
is **predicted locally and never waits for the host**.

- The peer runs the *movement half* of the sim locally: the same
  `playerSpeedForRadius(radius)` from `tiers.js`, the same clamp to bounds. It
  is presentation-only state living in the net layer, and it uses the shared
  `tiers.js` function rather than a copy — hard rule 4 applies to the net layer
  exactly as it applies everywhere else.
- The peer keeps its last 60 intents with their tick numbers.
- When a snapshot arrives with an authoritative position for your slot,
  compute the error against where your prediction had you at that tick:
  - **error < 0.5 m** — ignore it. Below the noise floor for a hole that is
    0.45–6 m across.
  - **0.5–3 m** — smooth: blend the visual position toward the authoritative
    one over 150 ms with an exponential decay. The player perceives drift, not
    a correction.
  - **> 3 m** — snap, and flash the rim. Something real happened (a tide, a
    long stall) and pretending otherwise makes the world feel dishonest.
- **Mass, radius, eats and combos are never predicted.** Only the host decides
  what got eaten. A peer that predicts an eat will occasionally show a prop
  vanishing and returning, which is the single worst-feeling networking
  artifact there is. The eat animation instead fires on the snapshot event —
  ~100 ms of latency on a visual flourish, against zero chance of an
  un-eating. That is the right trade and it is not close.

The asymmetry is deliberate and worth stating plainly: **your movement is
instant and slightly wrong; your eating is slightly late and always right.**

---

## 6. Latency and loss

Supabase Realtime is a WebSocket over TCP through a relay. There is no packet
loss at the application layer — loss manifests as **latency spikes and
head-of-line blocking**, which is a different failure and calls for different
handling.

| Condition | Behaviour |
|---|---|
| RTT < 80 ms | Nominal. Nothing visible |
| RTT 80–200 ms | Interpolation absorbs it. Own-hole correction lands in the smooth band |
| RTT 200–500 ms | Ghosts lag visibly; own hole still responsive. HUD shows a two-bar signal chip. Playable |
| RTT > 500 ms sustained | Own-hole corrections start hitting the snap band. HUD shows one bar |
| No snapshot for 1.0 s | Ghosts freeze and dim. "RECONNECTING…" band appears |
| No snapshot for 1.5 s | Host presumed gone → migration (§7) |
| Socket closed | Reconnect with backoff 0.5/1/2/4 s; rejoin (§9) |

Design properties that make this survivable:

- **Snapshots are absolute, not deltas.** Any one can be dropped with no
  consequence beyond a coarser interpolation. There is no ordered stream to
  repair and no ack/retransmit layer to write.
- **Snapshots older than the newest tick seen are discarded**, and the tick is
  a 16-bit wrap-around compare, so a burst that arrives out of order after a
  stall cannot rewind the world.
- **Intents are last-write-wins by `seq`.** A dropped intent means one tick of
  the previous direction — 16 ms of stale steering, undetectable. Nothing is
  ever resent.
- **The host zeroes a peer's intent after 500 ms of silence.** Without this a
  disconnected player's hole grinds against a wall for the rest of the match,
  which looks like a bug and inflates their score if the wall happens to be
  edible.

### 6.1 A peer's tick rate depends on a manual quality choice, and can still change mid-match

As of commit `b9af8bf` (2026-08-08), `js/quality.js` is a strict two-value
HIGH/LOW binary, player-chosen only — there is no device classifier and no
live watchdog stepping a tier under load. Tier selects `maxSubSteps` (HIGH 6,
LOW 2) and `js/main.js` still drops unaffordable accumulator debt, so **two
peers can simply be ticking at different rates from the first frame of a
match**, because they picked different SETTINGS, not because either device is
struggling. The mid-run case still exists too, just voluntary rather than
automatic: nothing stops a peer opening SETTINGS during a match and flipping
HIGH/LOW, and `main.js` applies the new `maxSubSteps` immediately — so **the
same device can advance a different number of sim ticks per wall-second at
minute two than it did at minute one**, at the player's own hand rather than a
watchdog's. Treat both as routine, not exotic.

Nothing in this design needs to change, and that is the point — but the reasons
are worth naming, because each is a place a later "optimisation" could break it:

- **The peer's local step rate does not affect the arena's authority.** The host
  runs the one true `Sim` at a fixed 60 Hz. A peer that steps fewer ticks is
  behind on its own *prediction*, not on the match. Its intents still carry a
  monotonic `seq` and the host applies the newest one it has (§6), so a peer
  that goes from 60 to 20 effective ticks per second simply steers a little more
  coarsely.
- **The peer's own-hole reconciliation absorbs it.** A tier step-down widens the
  gap between the predicted and authoritative position; §5.2's correction bands
  already handle exactly that, and a step-down that pushes the gap past
  `CORRECTION_SMOOTH_M` produces one snap, not a desync.
- **Intent send rate must stay time-based, not tick-based.** `INTENT_HZ` is a
  wall-clock interval. If it is ever implemented as "every 6th sim tick", a
  peer's send rate silently falls with its tier and the host starts zeroing a
  player who is still holding the stick.
- **Interpolation is unaffected** because remote holes are drawn from received
  snapshots, not from local simulation.
- **The arena trace is tick-indexed, never wall-clock** — see
  [09](09-threat-model.md) §3.5, which owns that rule and now has a second
  reason to.

---

## 7. Host migration

**This will happen.** Someone closes the booth laptop mid-match. The design
treats it as routine, not exceptional.

### 7.1 Succession is decided before it is needed

The roster carries a **line of succession**: participants sorted by
`(joined_at asc, session_id asc)`, excluding the current host, published in
every `roster` message and updated on every join and leave. Every peer knows
its own position in the line at all times. Deciding the order in advance is
what turns a distributed-consensus problem into a queue.

### 7.2 Detection

Every snapshot is a heartbeat. A peer that sees no snapshot for **1.5 s**
(18 missed at 12 Hz) declares the host gone. Peers do not coordinate this
declaration — they each decide independently, and the tie-break happens at the
database, not between them.

### 7.3 The claim

1. Successor #1 waits **0 ms**; #2 waits 300 ms; #3 waits 600 ms. The stagger
   means the usual case is one claim, not five.
2. The claimant calls `arena-claim-host` with the generation it last saw.
3. The Edge Function runs one conditional UPDATE
   ([03](03-technical-design.md) §3.1). Exactly one caller gets rows back.
   **The database row is the arbiter.** There is no election, no quorum, and no
   possibility of two hosts, because there is one writable column and Postgres
   already knows how to serialise writes to it.
4. The winner broadcasts `host_announce` with the new generation. Everyone
   else — including a claimant who lost, and including the *old* host if its
   lid opens again — adopts it and reverts to peer. A snapshot stamped with an
   older generation is discarded on arrival, which is what makes a returning
   zombie host harmless rather than catastrophic.

### 7.4 Reconstructing the sim

The new host builds its authoritative sim from **the last keyframe it received,
fast-forwarded by the snapshots after it**:

- The city is regenerated from the seed — free and exact (ADR-0003).
- The eaten bitset comes from the keyframe (≤ 2 s old) and is topped up from
  the eat events in every snapshot since.
- Hole positions, masses and radii come from the newest snapshot.
- The clock comes from `time_left_cs`.

Total interruption: **1.5 s detection + ~200 ms claim + ~100 ms rebuild ≈
1.8 s**, during which every client shows the RECONNECTING band over a frozen
but still-rendering world. Nobody's score changes. The match continues.

### 7.5 The honest cost

**A migrated session can never be `verified`.** The new host did not observe
the ticks before it took over, so the multi-hole trace has a hole in it and a
server replay cannot reproduce the result. `arena_sessions.host_migrations` is
incremented, and `arena-finalize` caps every run in the session at
`attested` ([03](03-technical-design.md) §2.7, §3.1). Attested runs count on
event and city boards and are **never** belt-eligible.

This is the right trade and it should not be quietly softened later: a booth
match that survives a closed laptop is worth far more than a booth match that
could have set an all-time record. The alternative — killing the match — is the
outcome nobody wants, and the alternative to *that* — trusting a partial trace
— would let a determined player win a belt by inducing a migration. Naming the
downgrade in the results screen ("event score recorded — no title match, the
host dropped") also makes the system legible instead of mysterious.

---

## 8. Late joiners

Allowed until **T−30 s**; after that, spectator until the next session.

- The host sends an immediate keyframe on `join` rather than waiting for the
  scheduled one, so the newcomer's first frame is correct.
- The new hole spawns at the least-crowded quadrant of the bounds, at starting
  radius, mass 0.
- Their run is flagged `partial` in `arena_participants` (derived from
  `joined_tick > 0`). Partial runs place in the match standings normally — they
  are visibly behind and everyone can see why — but do not post to city or
  all-time boards, because "highest mass" is meaningless over an unknown clock.
- The 30-second cutoff exists so that late-joining does not become a way to
  farm participation without playing.

---

## 9. Disconnect and rejoin

- On losing the socket, a client keeps its `session_id` and slot in
  `sessionStorage` and reconnects with backoff (0.5/1/2/4 s, then give up at
  ~8 s).
- The **host keeps the slot alive for 30 s**, marked `disconnected`. The hole
  freezes in place, stops eating, and is drawn translucent. It is not removed
  and cannot be eaten — a rival hole cannot consume another hole in this game,
  and this is not the place to invent that.
- Rejoin inside 30 s: the peer resumes its slot with all mass intact and gets a
  keyframe. From the room's point of view nothing happened.
- After 30 s: the slot is released, the score is frozen at its last value, and
  the run is finalized as `left_early`. It still places in the match and still
  posts to the event board. Someone who walks away from a booth mid-match
  should still see their name on the screen.
- **If the disconnected client was the host**, §7 has already run; on return it
  is a peer, and the generation stamp enforces that without any special case.

---

## 10. Scoring an arena run

The hard question, stated exactly: **the host is replay-validatable and peers
are not — at least not in the same way.** Here is precisely how that is
handled.

### 10.1 The host's trace validates everyone

The host records, per tick, **every hole's applied intent** — its own from
local input, each peer's from the last intent received for that slot. At match
end it submits the whole thing to `arena-finalize` as a single multi-slot
trace (`rle-i8-multi-v1`: the same RLE, one stream per slot, concatenated with
a slot index header).

The Edge Function then does exactly what `submit-run` does, with N holes
instead of one: construct the `Sim` from the session seed, drive slot 0..N−1
from their streams, step `duration_ticks` times, read off every player's final
mass and stats. **Every participant's score is server-computed.** No peer's
self-reported number is ever written anywhere.

At ~60 bytes/second/slot RLE'd, an 8-player 3-minute trace is roughly 90 KB —
comfortably under the 256 KB Realtime ceiling it never touches (it goes over
HTTPS to the function) and trivial to store.

### 10.2 What that does not prove, and the cross-check

Replaying the host's trace proves the *scores follow from those inputs*. It
does not prove **those were the real inputs** — a modified host could write
itself a perfect steering line and give every peer a stream of zeros.

So each peer independently calls `arena-attest` at match end with:

- `intent_sha256` — a rolling SHA-256 over its own emitted intent stream
  (`seq`, `mx`, `mz`), computed as it plays, not reconstructed afterwards.
- `observed_final` — the last mass it saw for itself in a snapshot.

The server hashes the corresponding slot out of the host's trace and compares.

Board eligibility is **not** decided here —
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) §6 owns it and
[09](09-threat-model.md) §3.7 states it. This table is the netcode's view of the
same rule, and 0012 wins if they ever drift:

| Outcome | Session verdict | Board eligibility |
|---|---|---|
| All present peers attest and match | `verified` | Event + city scopes; the two arena-only belts ([06](06-belts-and-achievements.md) §2.6, §2.7). Never all-time, never per-level, never a solo-fed belt |
| A peer's digest disagrees | `disputed` | Round voided; nothing written. Flagged for review, host trace retained a year |
| A peer disconnected and never attested | `attested` | Event + city scopes; no belts at all |
| Any host migration occurred | `attested` | Event + city scopes; no belts at all |
| Solo-degraded run (§12) | `verified` (single-hole replay) | All scopes, all belts — it is a single-player run |

The load-bearing consequence, and the reason this is honest rather than
hand-waved: **an all-time record and every solo-fed belt are reachable only
through a replay-validated single-player run.** No arena round of any verdict
reaches them, so the host's inherent zero-latency advantage and the
colluding-room gap cannot distort a record. Arena play at the booth produces
match results, event- and city-board rows, and the two belts that exist to rank
arena play — which is exactly what the booth is for. The trust model closes the
door before the record, not after.

`observed_final` is not used for enforcement (it is a peer's word about a
number, which is worth nothing) — it is logged and diffed as a **health
signal**. Systematic disagreement between what peers saw and what the replay
computed means our netcode is lying to players, and we want to know that from
telemetry rather than from someone at the booth saying "it said I had more".

---

## 11. Spectators

- Subscribe to the same Realtime topic, receive snapshots and keyframes, send
  nothing. They cost one connection and zero messages upstream.
- Capped at **20** per room (`arena_rooms.config.spectator_cap`), which is the
  connection budget, not a gameplay limit.
- Three uses, all real: the **booth big screen** (spectator + a live
  `belt_changes` subscription, rendering a scoreboard overlay); the **queue**,
  where player nine watches and is auto-promoted to a slot the moment one frees
  between sessions; and **version-mismatched clients** (§3), who get to watch
  rather than get an error.
- A spectator renders the whole city and every ghost with no local sim at all —
  it is a pure interpolation client, which incidentally makes it the best test
  harness we have for the interpolation code.

---

## 12. Graceful degradation to solo

When Realtime is unreachable — the case to design for, given the venue — the
arena does not error. **It becomes a solo run of the same thing.**

1. The player taps QUICK JOIN. `arena-open`/`arena-join` fails or times out at
   4 s.
2. The client mints a local session with a locally-generated seed, builds the
   city, and starts a solo match with **the same clock and the same rules**.
   The screen says "Playing solo — no connection", once, quietly.
3. Ghost rivals are drawn from the last cached board for that scene if one
   exists: recorded traces of previous good runs, replayed as non-interacting
   ghosts. They cannot eat and cannot be eaten — they are pace cars. If no
   cached traces exist, the match uses `sim.js`'s existing deterministic AI
   rivals, which is a solved problem already shipped.
4. At match end the run goes to the outbox ([03](03-technical-design.md) §4.3)
   and submits as a normal solo run when the network returns — fully
   `verified`, fully belt-eligible, because a solo run is exactly the case the
   single-hole replay handles best.

The degraded path is not a lesser mode hidden behind a failure. It is the
single-player game the project already is, wearing the arena's clock, and it is
the reason a dead venue network costs the booth nothing but the word "live".

---

## 13. Constants, in one place

All in `js/net/snapshot.js` except where noted, so tuning is one file.

```js
SNAPSHOT_HZ        = 12     // ceiling 15; see 03 §7.3 for why 12 ships
INTENT_HZ          = 10     // ceiling 20
KEYFRAME_HZ        = 0.5
INTERP_DELAY_MS    = 100
EXTRAPOLATE_MAX_MS = 250
CORRECTION_IGNORE_M = 0.5
CORRECTION_SMOOTH_M = 3.0   // above this: snap
CORRECTION_BLEND_MS = 150
INTENT_STALE_MS    = 500    // host zeroes a silent peer's steering
HOST_TIMEOUT_MS    = 1500   // → migration
CLAIM_STAGGER_MS   = 300    // × succession index
RECONNECT_GRACE_MS = 30000
LATE_JOIN_CUTOFF_S = 30     // before match end
MAX_PLAYERS        = 8      // arena_rooms.max_players is the real authority
SPECTATOR_CAP      = 20
```

---

## 14. What to verify before the booth

Cross-referenced from [07-test-strategy.md](07-test-strategy.md); listed here
because these are the netcode-specific ones and they are the ones that end a
demo.

1. **Close the host's laptop mid-match, on real venue-grade wifi.** Not a
   simulated disconnect — the actual lid. Verify §7 end to end, including the
   old host reopening and correctly becoming a peer.
2. **Eight real devices, one room**, phones and laptops mixed, on a shared
   network with other traffic. Measure delivered message count against
   [03](03-technical-design.md) §7.3's model and correct the model.
3. **Kill the network for 10 seconds mid-match** on a peer, restore it, verify
   the 30-second rejoin resumes the same slot with the same mass.
4. **Start a match with one client on a stale build.** Verify it is refused into
   spectator and not silently playing a different city.
5. **Run a session, then diff the server replay's per-player scores against
   what each client displayed.** Any systematic gap is a netcode bug, and
   finding it after a partner has seen a different number on their phone is
   the worst possible time.
