# Party Mode — Requirements

**Status:** planning

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Legal scaffolding](03-legal-scaffolding.md)

User stories with Given/When/Then acceptance criteria. This is the contract
verification checks against: if a behaviour is not written here, it is not
verified. Each criterion is tagged:

- **[V]** checkable in `tools/validate.mjs` or a headless unit test
- **[N]** needs two or more networked clients (a harness with a host and a peer)
- **[L]** live-verify only — a human, or a browser-driven pass, looking at it

Nothing here can be executed until the arena from
[online-flywheel](../online-flywheel/) exists.

---

## US-01 — As a host, I turn party mode on for my room

**Given** I am the host of an `OPEN` voxel-sandbox arena room
**When** I open the room options
**Then** a party-mode toggle is present, off by default, with copy stating what
it does. **[L]**

- **AC-01.1 [V]** The toggle is absent for non-host players and absent on
  campaign rooms.
- **AC-01.2 [V]** With the rollout flag off, the toggle is absent for everyone
  and no party code path executes.
- **AC-01.3 [N]** Enabling the mode broadcasts a roster update; every joined
  client shows the mode as enabled within one snapshot interval.
- **AC-01.4 [V]** The mode cannot be changed once the room leaves `OPEN`.

## US-02 — As a player, I am asked to affirm my age before a party match

**Given** I am in a room with party mode enabled and have never affirmed on
this device
**When** the lobby renders
**Then** an age gate appears requiring a deliberate affirmative action, with an
equally prominent decline. **[L]**

- **AC-02.1 [V]** No control on the gate is pre-selected, pre-checked, or
  auto-confirmed by inaction or by a timer.
- **AC-02.2 [V]** The affirm and decline controls have the same visual weight
  class; neither is styled as a warning or a lesser option.
- **AC-02.3 [V]** The gate states that this is a self-affirmation and is not
  verified.
- **AC-02.4 [V]** The room cannot enter `COUNTDOWN` while any joined player has
  an unresolved gate. **[N]** for the multi-client case.
- **AC-02.5 [V]** The gate is fully operable by keyboard alone, with a visible
  focus ring at every step, and has no time limit.
- **AC-02.6 [V]** The threshold rendered in the copy is read from
  `resolveAgeThreshold()`, not from a literal in the template.

## US-03 — As a player who does not drink, I decline and still play

**Given** the age gate is showing
**When** I decline
**Then** I stay in the room and play the same match, and no other player is
told. **[N]**

- **AC-03.1 [N]** My hole spawns normally, on the same city, with the same
  scoring as everyone else.
- **AC-03.2 [N]** No token spawns within my claim resolution, no token freezes
  me, and no announcement names me, for the whole session.
- **AC-03.3 [N]** No roster entry, badge, label, count, or lobby text on any
  other client indicates that I declined.
- **AC-03.4 [V]** My decline persists to the next match and the next session
  until I change it in settings.
- **AC-03.5 [L]** I can find and change this setting without help from another
  player.

## US-04 — As a player, a drink token appears in the city

**Given** a party match is in `IN_MATCH` and past the countdown
**When** a scheduled token window opens
**Then** exactly one token appears at the same world position on every client.
**[N]**

- **AC-04.1 [V]** The token schedule is a pure function of the session seed;
  two runs of the schedule for one seed produce identical ticks, kinds and
  candidate lists.
- **AC-04.2 [V]** `tools/validate.mjs` still passes its `Math.random()` guard
  over the sim files and the `js/voxelscene-*.js` glob with party code present.
- **AC-04.3 [V]** Intervals across a 20-minute simulated session are jittered,
  with no two consecutive intervals identical, and all within
  `TOKEN_INTERVAL_S`.
- **AC-04.4 [N]** Host and peer report the same token position, spawn tick and
  expiry tick.
- **AC-04.5 [V]** No token is scheduled during `COUNTDOWN`, `SETTLING`, or the
  final `TOKEN_TAIL_S`.
- **AC-04.6 [V]** No more than `MAX_LIVE_TOKENS` are live at any tick.
- **AC-04.7 [N]** No token spawns within `TOKEN_MIN_DIST_M` of any live hole,
  measured against host positions at the spawn tick.
- **AC-04.8 [V]** A scheduled candidate position whose ground has already been
  consumed is skipped; the token takes the next valid candidate or the window
  passes with no spawn. Never a token in mid-air.
- **AC-04.9 [V]** The wire encoding of a spawn adds ≤ 8 bytes to a snapshot,
  and 0 bytes when no token is live.
- **AC-04.10 [V]** The token record carries a `kind` field, and the code path
  reads it rather than assuming `drink`.

## US-05 — As a player, an unclaimed token goes away

**Given** a token has been live for `TOKEN_LIFE_S` and nobody has claimed it
**When** its lifetime expires
**Then** it winds down visibly and is gone on every client at the same tick.
**[N]**

- **AC-05.1 [L]** The despawn is an animated wind-down, not an instant
  disappearance.
- **AC-05.2 [N]** Host and peers remove it on the same tick; no client renders
  a ghost token after expiry.
- **AC-05.3 [N]** A claim attempt arriving after the expiry tick is rejected
  and produces no announcement anywhere.

## US-06 — As a player, I take a token and everyone sees it

**Given** a token is live and my hole reaches it
**When** the host resolves the claim
**Then** I freeze, and "BOTTOMS UP!" plays on every screen in the session
naming me. **[N]**

- **AC-06.1 [N]** The claim is decided only by the host. A peer whose local
  hole overlaps the token takes no local action until told.
- **AC-06.2 [N]** With two holes overlapping the token on the same tick,
  exactly one claim is announced, it is the same player on all clients, and it
  is the lower slot index.
- **AC-06.3 [N]** A peer client modified to emit a self-claim message gains
  nothing: no token is consumed and no announcement fires.
- **AC-06.4 [N]** The announcement fires on spectator clients with the same
  content as on peers.
- **AC-06.5 [L]** The claimer's own screen reads in the second person; every
  other screen names the player.
- **AC-06.6 [V]** The title is produced by `buildBlockWord()`; no `.fw-ch`,
  outline-ring or extrude-shadow CSS is defined outside the shared brand layer.
- **AC-06.7 [V]** The announcement enters the shared HUD queue with source
  `party`; a milestone banner showing at the time is interrupted, and a
  milestone arriving during the party announcement does not truncate it.
- **AC-06.8 [V]** All announcement copy resolves from the data table by
  `(vocabulary, kind)`; no user-visible party string is a literal at a call
  site.
- **AC-06.9 [V]** Freeze is applied within one snapshot interval of the claim
  tick.

## US-07 — As a frozen player, I am stopped, and the world is not

**Given** I have just claimed a token
**When** the freeze is applied
**Then** my hole comes to rest and does nothing for `FREEZE_HOLD_S`, while the
match continues around me. **[N]**

- **AC-07.1 [N]** My intent messages are ignored by the host for the duration;
  steering input changes nothing.
- **AC-07.2 [L]** My hole decelerates to rest over ≤ 0.3 s rather than halting
  in one frame.
- **AC-07.3 [N]** Nothing is consumed by my hole while frozen, and nothing is
  consumed retroactively when the freeze ends.
- **AC-07.4 [N]** My score does not change while frozen.
- **AC-07.5 [N]** Other holes and debris are unaffected by my hole while
  frozen: nothing collides with me, nothing is blocked by me, nothing consumes
  me.
- **AC-07.6 [N]** The match clock continues; the time remaining after my freeze
  is reduced by exactly the freeze duration.
- **AC-07.7 [L]** My own screen shows, at freeze start, why I stopped.
- **AC-07.8 [N]** Every other client marks my hole as frozen, in the world and
  on the minimap, using a marker that is not colour-alone.
- **AC-07.9 [N]** Control returns over `FREEZE_EASE_S` rather than snapping.

## US-08 — As a player, a freeze always ends

**Given** I am frozen
**When** anything at all goes wrong
**Then** the freeze still ends at the tick it was scheduled to end. **[N]**

- **AC-08.1 [N]** Backgrounding the tab for longer than the freeze: I am free
  on return, not frozen and not frozen-forever.
- **AC-08.2 [N]** Reloading mid-freeze and rejoining within the grace window:
  the remaining freeze is restored from the keyframe, not restarted and not
  dropped.
- **AC-08.3 [N]** Host migration mid-freeze: the new host restores the
  remaining ticks and the freeze ends on the original schedule.
- **AC-08.4 [N]** The host itself claiming a token: the host freezes as a hole,
  the sim keeps stepping, snapshots keep flowing, and no peer observes a stall.
- **AC-08.5 [N]** A client that stops sending intent during the freeze is not
  treated as disconnected.
- **AC-08.6 [V]** No code path can extend a freeze past `FREEZE_HOLD_S +
  FREEZE_EASE_S` from the claim tick.

## US-09 — As a player, the mode stays infrequent and bounded

**Given** a party match is running
**When** the whole match plays out
**Then** the number of callouts stays inside the caps. **[V]**

- **AC-09.1 [V]** Over a simulated 3-minute match, the expected number of
  windows is 3–5 at default constants.
- **AC-09.2 [N]** After `MAX_CLAIMS_PER_PLAYER` claims, that player cannot
  claim again this match; tokens do not resolve to them.
- **AC-09.3 [N]** After `MAX_CLAIMS_PER_MATCH` total claims, no further token
  spawns this match.
- **AC-09.4 [L]** After `SESSION_SOFT_CAP` consecutive party matches, the lobby
  shows a dismissible break prompt that does not block starting another match.
- **AC-09.5 [V]** Every tunable in PRD §5.2 is a named export from one file,
  and no party magic number appears at a call site.
- **AC-09.6 [V]** No party-mode copy contains an instruction to consume, or a
  quantity.
- **AC-09.7 [V]** No party-mode copy, asset name, or audio file references a
  real alcohol brand, product, or slogan.

## US-10 — As a player, I opt out mid-match without a scene

**Given** I am in a party match and want out
**When** I open the pause overlay and opt out
**Then** it takes effect at the next token window and nobody is told. **[N]**

- **AC-10.1 [N]** From the next window onward, no token resolves to me and no
  announcement names me.
- **AC-10.2 [N]** A freeze already running is unaffected — it ends normally.
- **AC-10.3 [N]** No other client observes any change.
- **AC-10.4 [V]** The choice persists to the next match.

## US-11 — As a player with motion sensitivity, the mode is still playable

**Given** my OS reports `prefers-reduced-motion: reduce`
**When** a token is claimed
**Then** I get the same information with none of the motion. **[L]**

- **AC-11.1 [V]** With reduced motion, the announcement has no translate,
  scale, rotate, or shake animation, and the same duration.
- **AC-11.2 [V]** Nothing in the token, freeze, or announcement changes opacity
  or luminance faster than 3 Hz, in either motion mode.
- **AC-11.3 [V]** The token's bubble effect is suppressed under reduced motion
  and the token remains clearly visible.
- **AC-11.4 [V]** Freeze start and end are announced to assistive technology
  politely; the decorative wordmark stays `aria-hidden` with the accessible
  name supplied by the caller.
- **AC-11.5 [V]** The frozen marker is distinguishable without colour.

## US-12 — As a player, I know the match was unranked

**Given** a party match has ended
**When** the results screen renders
**Then** it says plainly that this session was unranked. **[L]**

- **AC-12.1 [N]** No leaderboard write occurs for a party session, at any
  scope.
- **AC-12.2 [N]** No belt changes hands and no achievement progresses.
- **AC-12.3 [V]** The session is excluded from replay validation rather than
  submitted and rejected.
- **AC-12.4 [V]** A per-scene best score or best combo is not overwritten by a
  party session.

## US-13 — As a player, the game finally has terms

**Given** I open Flywheel for the first time after this ships
**When** the title screen renders
**Then** the terms are reachable, and first-run acceptance is recorded. **[L]**

- **AC-13.1 [V]** The EULA/ToS, privacy note, and party-mode disclaimer are
  reachable from the title screen and from settings, in at most two taps.
- **AC-13.2 [V]** The accepted legal version is persisted, and a version bump
  re-prompts on next launch.
- **AC-13.3 [V]** An affirmation older than `AFFIRM_TTL_DAYS` re-prompts.
- **AC-13.4 [V]** The save migration adding the legal and party keys satisfies
  conventions hard rule 6 — `freshSave()` and `MIGRATIONS` agree, and
  `tools/validate.mjs` passes in both directions.
- **AC-13.5 [L]** No legal text ships without a recorded attorney review of
  that exact version. This one is a process gate, not a test.

---

## Verification notes

- Everything tagged **[N]** needs a two-client harness that can run a host and a
  peer against the same session and diff their observed state. That harness is
  [online-flywheel/07-test-strategy](../online-flywheel/07-test-strategy.md)'s
  problem and party mode is one of its consumers, not its author.
- **AC-06.2** (the contested tie) and **AC-08.3/AC-08.4** (freeze across host
  migration, and a frozen host) are the three most likely to be skipped and the
  three most likely to be discovered by a room full of people.
- **AC-13.5** is the only criterion here that no amount of engineering can
  close.
