# ADR-0007: Manual orbit re-aims the chase via a persistent yaw offset, not a suspend-then-reclaim hold

- **Status:** accepted
- **Date:** 2026-08-05
- **Deciders:** Nico

## Context

The sandbox chase camera (`ChaseCamera` in `js/camera.js`) auto-aims itself
behind the direction of travel (`setFollowDirection(true)`, shipped as part of
the `chaseMode` third-person redesign). Manual orbit (Q/E, or the touch drag)
lets the player look around independently of that auto-aim. The two systems
wrote the same underlying yaw, and the scheme for reconciling them was: a
manual look **suspends** the chase for `ORBIT_HOLD = 0.7 s` after the last
orbit frame, then the spring reclaims the yaw outright at its normal rate.

Measured against `HEAD` through identical scripted input, that reclaim is not
a nudge: a 1 s look gained the player 151.5° of framing, the hold expired
0.700 s after release, and the spring took the whole 151.5° back at 240.6°/s —
exactly `FOLLOW_MAX_RATE` (4.2 rad/s), i.e. pinned to its ceiling. At SIZE 12
(`FOLLOW_MAX_RATE` ramped to 7.0 rad/s) the reclaim measured 401.2°/s — over a
full revolution per second. This is the literal shape of the "camera fights
me" complaint: the player looks somewhere on purpose and the camera visibly
yanks the view back.

The fix is not a longer hold. `ORBIT_HOLD` only controls **when** the reclaim
starts; it says nothing about **how fast** it runs, and speed was the
complaint. A 3 s hold buys three calm seconds and then the identical snatch.

A second, previously unnamed failure mode compounded this: a **ratchet**.
`chaseMode` latches the player's move basis to the live yaw on the rising edge
of input (correct — that's what camera-relative movement means), but the
camera still held its orbit-vs-heading error measured against the heading
that press just retired. Four look-then-press cycles compounded to 123.8° of
accumulated drift with no mitigation.

## Decision

Manual orbit no longer suspends the chase. It accumulates a persistent yaw
`_yawOffset`, and the chase spring targets `heading + offset` instead of
`heading` alone — so during a drag the *target* moves by exactly the drag, the
spring's tracking error is unchanged, and there is nothing left for the spring
to fight. The offset then eases back to zero on its own, on a deliberately
different rate than the spring, because the two rates are two different
promises:

- **The spring** (`FOLLOW_OMEGA`/`FOLLOW_MAX_RATE`, 4.2-7.0 rad/s, size-ramped)
  tracks the *heading*, so a chosen framing survives a turn — it has to scale
  with how fast the world is moving underneath it.
- **The unwind** (`ORBIT_RECENTRE_RATE = 0.45`/s, tau 2.2 s, capped at
  `ORBIT_RECENTRE_MAX = 0.5 rad/s` / 29°/s) returns that framing to centre, so
  a player who does nothing still ends up auto-centred. It deliberately does
  **not** size-ramp — it's a readability budget, not a speed-tracking rate.
  `ORBIT_RECENTRE_DELAY = 1.2 s` is the grace window before the unwind starts,
  matching `FOLLOW_COAST` for the same reason: longer than the worst chase
  swing (0.9 s), so a deliberate look taken mid-turn survives the turn.

The unwind is a rate-capped first-order decay, not a plain lerp: a lerp's peak
rate is at `t=0` and scales with the offset, so a 180° look would start
unwinding at 81°/s while a 20° look would crawl — a ceiling makes a big look
and a small one return at the same, readable speed. Measured: 28.6°/s,
8.4× slower than the reclaim it replaces at SIZE 1 and 14.0× slower at SIZE 12.

The ratchet is closed by firing `ChaseCamera.recentre()` (zeroes `_yawOffset`
and the hold timer) from `onBasisLatch` — the same rising-edge event that
re-anchors the move basis — so the offset drops on exactly the frame it
becomes a no-op on the visible camera. Measured: 123.8° of drift over four
look-then-press cycles with the mitigation forced off, 0.0° with it live.

`_orbitHold` (the field, not a public constant any more) is now a misnomer —
it means "grace before unwind," not "chase suspended" — and was deliberately
left unrenamed to keep the diff scoped to behavior.

## Consequences

Campaign is untouched: `chaseMode = false` there, so `_yawOffset` and
`_orbitHold` stay at their initial 0 for the whole session by construction.
Campaign bit-identity across 5 levels / ~14,830 frames was proved on the
combined tree (this change shipped alongside point-to-move, 17 skins, and
rubble retirement) with max abs delta 0 on sim, camera, move/orbit/zoom, and
world3d blocker state.

The sandbox chase now converges reliably instead of overshooting: 48 headings
× 5 start offsets measured 240/240 successful convergences and 48/48
reversals against the old scheme's 8/240 and 0/48, worst case 1.20 s.

Cost: a small amount of extra state (`_yawOffset`) and a second rate pair to
tune instead of one. Both are now documented in `.wiki/modules/render.md`'s
Gotchas as load-bearing constants, not incidental numbers.

## Alternatives Considered

- **Lengthen `ORBIT_HOLD`** — rejected outright per the Context section: it
  changes when the snatch starts, not its speed, so it doesn't address the
  measured complaint at all.
- **Lerp the offset back to zero instead of a rate-capped decay** — rejected:
  a lerp's rate scales with the remaining offset, so it is fast exactly when
  a big look has just been released (the moment control should feel most
  respected) and slow for small looks (where a snappier return reads fine).
  A rate ceiling decouples "how far you looked" from "how fast it lets go."
- **Re-anchor the offset continuously to the live yaw instead of on the
  rising edge of input** — rejected: this was tried for the ratchet fix
  specifically and reopens the same feedback loop for analog input, since a
  thumb sweeping the stick would pick up the camera's own rotation on every
  frame it changes direction. Latching once, on the edge, is what makes the
  basis stable for the duration of a held input.
