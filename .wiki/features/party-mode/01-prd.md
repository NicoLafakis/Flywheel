# PRD 0003 — Party Mode

**Status:** planning · **Depends on:** [online-flywheel](../online-flywheel/)
(all of it) and [score-combo-and-hype](../score-combo-and-hype/) (shipped)

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Legal scaffolding](03-legal-scaffolding.md)
>
> This document extends `docs/PRD.md` and
> [online-flywheel/01-prd.md](../online-flywheel/01-prd.md) rather than
> replacing either. Where it conflicts with them, it says so explicitly in
> §11 and nowhere else.

> **Not legal advice.** §9 and all of
> [03-legal-scaffolding.md](03-legal-scaffolding.md) are advisory drafting by a
> non-lawyer and require attorney review before any of it is shown to a user.

---

## 1. The load-bearing invariant

**A drink token's existence, expiry and claim are decided by exactly one
machine — the host — and every other client, including the claimer, learns the
outcome by being told.**

Every requirement below is downstream of this. If a peer can decide it took a
token, two screens in the same room disagree about who is drinking, in front of
the people who are drinking. That is the one failure this feature cannot
survive, and it is worse than the token never spawning at all.

Second invariant, inherited and non-negotiable: **no `Math.random()` anywhere
in the sim path** (conventions hard rule 1, enforced by `tools/validate.mjs`
over `js/voxelscene-*.js` and the seven named files). Token scheduling is
seeded via `rng.js`.

---

## 2. Scope

**In scope:** the drink token entity and its lifecycle; host-authoritative
claim; the freeze state; the "BOTTOMS UP!" announcement and its reduced-motion
variant; the 21+ age gate and its persistence; the opt-out/decline path;
session caps; exclusion of party sessions from ranked surfaces; the tunable
constants block; and the scoping (not the final wording) of the game's EULA /
ToS / privacy / disclaimer set.

**Out of scope:** rule packs; a custom-rules editor; verified (document-based)
age checking; clip capture or streaming integration; achievements or belts that
count tokens; single-player party mode; campaign-mode party mode; any paid
third-party service.

**Mode availability:** party mode is an option on an **arena room** in the
**voxel sandbox** only. It is not offered in the campaign and not offered
offline. There is no single-player party mode — a drinking game played alone is
a different product with a different duty of care.

---

## 3. Functional requirements

### Mode selection and gating

- **FR-001** Party mode must be selectable only by the room host, only while
  the room is in `OPEN`, and only on a voxel-sandbox room.
- **FR-002** The mode must be visible in the lobby to every player before the
  match starts, with plain-language copy describing what will happen.
- **FR-003** A room must not transition from `OPEN` to `COUNTDOWN` with party
  mode enabled until every joined player has resolved the age gate (affirmed,
  declined, or previously affirmed on this device).
- **FR-004** A player joining a party room mid-session (late join, per
  [04](../online-flywheel/04-netcode-design.md) §8) must resolve the age gate
  before their hole is spawned; until then they are a spectator.
- **FR-005** The mode must be behind a rollout flag that can disable it for an
  event without a deploy.

### The age gate

- **FR-006** The gate must require an affirmative action to proceed — a
  deliberate control the player operates. A pre-checked box, a default-focused
  confirm button, or a countdown that proceeds on inaction all fail this.
- **FR-007** The gate must offer a decline path that is exactly as prominent as
  the affirm path and is not styled as a lesser or negative choice.
- **FR-008** Declining must keep the player in the room as a normal player:
  they play the same match on the same city with the same scoring, and tokens
  do not spawn for them, do not freeze them, and do not name them.
- **FR-009** A player's decline must not be announced to the other players. No
  roster badge, no lobby label, no "N of 8 opted in" counter.
- **FR-010** The affirmation must persist per device and survive a reload
  (`localStorage`), and must be revocable from settings at any time.
- **FR-011** The affirmation must be re-requested when the affirmation record
  is older than a configured age (default: 180 days) or when the legal-copy
  version changes.
- **FR-012** The age threshold must be a single named constant with a
  region-resolution hook beside it, even if the hook returns the constant
  unconditionally in v1.
- **FR-013** The gate must state, in the player's view, that this is a
  self-affirmation and is not verified.

### Token lifecycle

- **FR-014** Token windows must be scheduled deterministically from the session
  seed, so no position data is ever transmitted.
- **FR-015** The schedule must produce jittered intervals, never a fixed
  metronome.
- **FR-016** At most `MAX_LIVE_TOKENS` (default 1) tokens may be live at once.
- **FR-017** A token must be placed on a valid, reachable, currently-uneaten
  surface position, revalidated by the host at spawn time against actual sim
  state — a scheduled position inside a hole that has already been eaten must
  be skipped, not spawned in mid-air.
- **FR-018** A live token must expire after `TOKEN_LIFE_S` unclaimed, and its
  despawn must be visible (a wind-down, not a pop) so a player running for it
  is not confused by its disappearance.
- **FR-019** Only the host may declare a token claimed. A peer must never
  self-claim, including when its local hole visibly overlaps the token.
- **FR-020** Claim must be resolved by the host against the host's own
  authoritative positions at a single tick; a tie at the same tick resolves to
  the lower slot index, deterministically.
- **FR-021** Token spawn, expiry and claim must ride the existing snapshot
  message. No new message type and no new clock.
- **FR-022** A token must carry a **kind** field on the wire and in the
  schedule, with exactly one kind (`drink`) defined in v1.
- **FR-023** Tokens must not spawn during `COUNTDOWN`, during `SETTLING`, or in
  the final `TOKEN_TAIL_S` (default 20 s) of a match — a freeze in the last
  seconds is the one that actually costs someone the match.
- **FR-024** A token must not spawn within `TOKEN_MIN_DIST_M` of any live hole
  at spawn time, so nobody takes one they never saw.
- **FR-025** Tokens must not be visible to, or claimable by, a player who
  declined (FR-008).

### Freeze semantics

- **FR-026** On claim, the claiming player enters a freeze state for
  `FREEZE_HOLD_S`, followed by `FREEZE_EASE_S` of restored control.
- **FR-027** The freeze must be applied by the host: the host ignores that
  slot's intent messages for the duration. The peer freezes locally for
  responsiveness, but authority is the host's.
- **FR-028** While frozen, the hole must: stop moving (decelerate to rest over
  ≤ 0.3 s rather than stopping instantly, which reads as a network fault), eat
  nothing, accumulate no score, and be inert to other players.
- **FR-029** The frozen player's match clock must not pause. The world keeps
  going — that is what makes it a moment rather than an interlude.
- **FR-030** A frozen player must remain visible to everyone, distinctly marked
  as frozen (see §6), including on the minimap.
- **FR-031** The freeze must end on schedule regardless of client state. A
  player who backgrounds the tab, reloads, or disconnects and rejoins must not
  be able to shorten or extend it, and must not be left frozen forever.
- **FR-032** If the host migrates mid-freeze, the new host must restore the
  remaining freeze from the keyframe. An unfinishable freeze is a stuck player.
- **FR-033** Freeze must not be triggerable by another player's action. There
  is no mechanic by which player A causes player B to be frozen.

### The announcement

- **FR-034** "BOTTOMS UP!" must be rendered with `buildBlockWord()` from
  `js/ui/blockword.js`. No local reimplementation of the block-letter stack
  (ADR-0005, conventions §Brand layer).
- **FR-035** The announcement must pass through the existing HUD announcement
  queue (score-combo FR-019) with a new source `party` at a priority above all
  existing sources, so it interrupts a milestone banner and is never truncated
  by one.
- **FR-036** The announcement must render on **every** client in the session —
  claimer, peers, and spectators — and must name the player who claimed on
  every screen except the claimer's own, which reads in the second person.
- **FR-037** The announcement copy must come from a data table keyed by
  vocabulary and token kind, editable by someone who does not read code.
- **FR-038** The announcement must have a reduced-motion variant honouring
  `prefers-reduced-motion` that conveys the same information with no
  translation, scale, or shake animation (inherits score-combo FR-022).
- **FR-039** No part of the announcement may flash, strobe, or pulse faster
  than 3 Hz, and it must not cover more than the transient central band that
  score-combo FR-023 already permits.
- **FR-040** Audio, if any, must respect the existing mute setting and must
  never be the sole channel carrying the information.

### Session caps and responsible play

- **FR-041** A single player must not be able to claim more than
  `MAX_CLAIMS_PER_PLAYER` tokens per match (default 2). Beyond the cap, tokens
  do not spawn near them and do not resolve to them.
- **FR-042** A room must not exceed `MAX_CLAIMS_PER_MATCH` total claims
  (default 6).
- **FR-043** A player must be able to opt out mid-match from the pause/settings
  overlay, taking effect at the next token window, silently (FR-009 applies).
- **FR-044** After `SESSION_SOFT_CAP` consecutive party matches in one room
  (default 4), the lobby must surface a non-blocking, non-preachy prompt
  offering a break or a switch to the normal arena. It must be dismissible and
  must not gate play.
- **FR-045** The game must never instruct a player to consume anything. Copy
  says what happened ("BOTTOMS UP!"), never what the player must do next, and
  never a quantity.
- **FR-046** No copy, art, or audio in party mode may reference a real alcohol
  brand, product, trade dress, or slogan.

### Ranked-surface exclusion

- **FR-047** A party session's results must not be submitted to any
  leaderboard, must not affect belts, and must not count toward achievements.
- **FR-048** The results screen must state plainly that the session was
  unranked, so the exclusion is not experienced as a bug.
- **FR-049** Party sessions must be excluded from replay validation
  (ADR-0012) rather than the validator being taught about freezes.

---

## 4. Non-functional requirements

| Budget | Value | Why |
|---|---|---|
| Added wire bytes | ≤ 8 bytes per snapshot while a token is live; 0 otherwise | Rides the existing event array; must not perturb the 1 KB snapshot target |
| Added draw calls | ≤ 2 while a token is live | One instanced disc, one bubble system, both from `world3d.js` caches |
| Frame cost of the announcement | ≤ 1.5 ms/frame on a mid laptop | It plays while eight holes are simulating on the host |
| Freeze application latency | ≤ 1 snapshot interval (83 ms at 12 Hz) | Beyond that the claimer keeps steering into a wall after being called |
| DOM elements per announcement | ≤ 1 created per announcement | Inherits score-combo's rule |
| New dependencies | 0 | ADR-0014 |

---

## 5. Data model

No database tables beyond what online-flywheel already defines. Party mode adds
one column-shaped fact to the room and one to the session; everything else is
module scope and one save key.

### 5.1 The token schedule (derived, never stored)

Derived on every client identically from `RNG('party:' + session_id)`:

```
scheduleToken(n) -> { tick, kind, candidatePositions[] }
```

`candidatePositions` is a short ordered list; the host takes the first entry
that passes FR-017 and FR-024 at spawn time and broadcasts *which index* it
used (2 bits), so peers place it without receiving coordinates.

### 5.2 Tunable constants

One block, one file (`js/party.js`), each commented with what it does to the
feel. These are the playtest's dials and the reason the owner's "tunable" is a
requirement rather than a nicety.

| Constant | Default | Effect |
|---|---|---|
| `TOKEN_INTERVAL_S` | `[40, 60]` | Jitter range between windows. Lower = metronome |
| `TOKEN_LIFE_S` | `12` | Unclaimed lifetime |
| `MAX_LIVE_TOKENS` | `1` | Two at once collide in the announcement queue |
| `TOKEN_MIN_DIST_M` | `8` | Never spawn on top of someone |
| `TOKEN_TAIL_S` | `20` | No spawns in the endgame |
| `FREEZE_HOLD_S` | `2.5` | Owner decision 2 |
| `FREEZE_EASE_S` | `1.0` | Control ramps back rather than snapping |
| `MAX_CLAIMS_PER_PLAYER` | `2` | Per match |
| `MAX_CLAIMS_PER_MATCH` | `6` | Per match, all players |
| `SESSION_SOFT_CAP` | `4` | Consecutive matches before the break prompt |
| `AGE_THRESHOLD` | `21` | Behind `resolveAgeThreshold(region)` |
| `AFFIRM_TTL_DAYS` | `180` | Re-affirmation cadence |

### 5.3 Persistence

A save-schema bump (per conventions §Saves — `CURRENT_VERSION` **and**
`freshSave()` **and** a `MIGRATIONS` entry, all three, or the validator fails):

| Key | Shape | Notes |
|---|---|---|
| `legal.acceptedVersion` | string | The EULA/ToS version accepted. Drives FR-011 |
| `legal.acceptedAt` | ISO date | |
| `party.affirmedAt` | ISO date or null | The 21+ affirmation. Null = never / revoked |
| `party.optOut` | boolean | Player-level decline, persists across matches |
| `party.vocabulary` | `'party' \| 'soda'` | Owner decision 4; unused if that lands as "no" |

None of this is transmitted. The affirmation is a local fact about a device.
Whether a claimed account also records it server-side is a legal question, not
an engineering one — see [03](03-legal-scaffolding.md) §7.

---

## 6. Surfaces

| Surface | Change |
|---|---|
| Lobby (`OPEN`) | Party-mode toggle (host only), mode description, per-player age gate |
| Age gate | New full-screen modal, brand-layer styled, reachable from settings for revocation |
| Arena HUD | Live-token indicator; frozen-player marker; the `party` announcement |
| Minimap | Token pip; frozen holes distinctly marked |
| Pause/settings overlay | Mid-match opt-out (FR-043); revoke affirmation |
| Results screen | Unranked notice (FR-048) |
| Title screen | EULA/ToS links, first-run legal acceptance (see [03](03-legal-scaffolding.md)) |

The frozen-player marker must be legible at a glance on a busy city and must
not rely on colour alone (a hole is already identified by colour; a second
colour meaning is unreadable at eight players).

---

## 7. Accessibility

Party mode's core mechanic is **removing control from a player and playing an
animation at them**. That is a genuine accessibility hazard, not a hypothetical
one, and it gets its own section rather than a line in a checklist.

- **Reduced motion.** `prefers-reduced-motion` replaces the bubbly title with a
  static, high-contrast banner of the same duration and the same information.
  The freeze itself still happens; the motion does not (FR-038).
- **Photosensitivity.** Nothing flashes above 3 Hz; the bubble field is
  continuous motion, not strobing; the gold glow does not pulse at speed
  (FR-039).
- **Loss of control.** The freeze must be visually explained on the frozen
  player's own screen the instant it starts — a player who does not know *why*
  they stopped moving experiences a bug, not a beat. Any player may opt out
  entirely (FR-043), which is also the accessibility escape hatch.
- **Screen readers.** The announcement carries an accessible name via the
  caller (`buildBlockWord()` returns `aria-hidden` markup by design — the
  caller owns the accessible name; see the file's own comment). Freeze start
  and end must be announced politely, not assertively, to avoid interrupting.
- **Motor.** The age gate must be operable by keyboard and by touch, with
  targets at the existing minimum, and must not be time-limited.
- **Cognitive.** Gate copy at plain-language reading level; no legalese in the
  gate itself, with the full terms one link away.

---

## 8. Freeze in the shared arena — the resolved questions

The brief asked what happens to a frozen hole in a shared arena. Stated
plainly, and reflected in FR-028/FR-033:

| Question | Resolution |
|---|---|
| Does it keep moving? | It decelerates to rest over ≤ 0.3 s, then holds position. It does not stop dead (reads as lag) and does not drift (reads as broken) |
| Can it eat? | No. Nothing it overlaps is consumed, and nothing is queued to be consumed on unfreeze |
| Can it be eaten? | No — and note holes cannot eat holes in Flywheel at all today (`docs/PRD.md` §4). Owner decision 3 |
| Does it block others? | No. It is inert: other holes and debris pass it |
| Does it keep scoring? | No. Its score is frozen with it |
| Does its clock pause? | No (FR-029) |
| Can someone push it into a token? | There is no push mechanic and none is added (FR-033) |
| What if it disconnects? | The freeze runs out on the host regardless; on rejoin the player is already free (FR-031) |
| What if the host migrates? | Remaining freeze rides the keyframe (FR-032) |
| What if the *host* is frozen? | The host still runs the sim. Being frozen is a state of a hole, not of a machine. This must be explicitly tested |

That last row is the one most likely to be missed in implementation.

---

## 9. Legal surface (summary — full treatment in 03)

Party mode cannot ship into a game with no terms at all. The minimum set:

1. **EULA / Terms of Service** — the game has none today.
2. **Privacy note** — needed anyway once accounts land
   ([05-identity-and-accounts](../online-flywheel/05-identity-and-accounts.md)
   collects name, email, company and consent flags).
3. **Party-mode disclaimer** — the 21+ affirmation, the responsible-consumption
   statement, the no-instruction statement (FR-045), and liability language.
4. **Acceptable use / conduct** — party mode puts a named player on eight
   screens; the harassment surface is real.

All drafting in this package is advisory and must be reviewed by a qualified
attorney before it is shown to any user. See
[03-legal-scaffolding.md](03-legal-scaffolding.md).

---

## 10. Phasing

Every phase is independently verifiable and none of them can start before the
arena exists.

| Phase | Contents | Verifiable by |
|---|---|---|
| **P0** | Legal set drafted, reviewed by counsel, and the first-run acceptance surface built | The game has terms. Independent of party mode and shippable alone |
| **P1** | Age gate, persistence, opt-out, settings revocation | Gate flow tests; save migration passes the validator |
| **P2** | Token schedule + host spawn/expiry + wire encoding, no freeze, no announcement | Two clients agree on token position and lifetime across a session |
| **P3** | Claim resolution + freeze semantics | Contested-claim and host-migration tests |
| **P4** | The "BOTTOMS UP!" announcement, reduced-motion variant, frozen markers | Live verification; reduced-motion snapshot |
| **P5** | Caps, break prompt, unranked exclusion, rollout flag | Cap tests; a party session appears on no board |

**P0 is not optional and does not depend on the rest.** It is the phase most
likely to be deferred and the one with the longest external lead time
(attorney review is not a sprint task).

---

## 11. Amendments to existing normative docs

- `docs/PRD.md` §5 — party mode's results screen adds an unranked notice and
  does not award coins for the star rating. `docs/PRD.md` otherwise describes
  the campaign and is unaffected.
- `docs/PRD.md` §8 — unchanged. No new dependency, no build step, nothing
  fetched off-origin.
- [online-flywheel/01-prd.md](../online-flywheel/01-prd.md) — arena rooms gain
  a mode field; a room in party mode is excluded from ranked surfaces.
- [online-flywheel/04-netcode-design](../online-flywheel/04-netcode-design.md)
  §4.1 — the snapshot header `flags` field gains a token-live bit and the event
  `flags` byte gains a token bit; both from currently-unused bits. The keyframe
  gains per-slot remaining-freeze ticks (1 byte per frozen slot).
- [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) — unchanged
  and deliberately so: party sessions are excluded from validation rather than
  validated (FR-049).

## 12. Companion ADR this package would make

**"Party sessions are unranked by construction."** One decision that resolves
fairness, replay validation, and grief incentive simultaneously, and that a
future contributor will otherwise try to relitigate the first time someone asks
why their best-ever run did not appear on the board.
