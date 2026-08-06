# ADR-0007: Manual orbit re-aims the chase via a persistent yaw offset, not a suspend-then-reclaim hold

- **Status:** accepted; rates amended 2026-08-06 (see Amendment below — the
  structure stands, the three return-to-centre constants do not)
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

## Amendment, 2026-08-06: the unwind was too slow to still be a follow cam

The decision above stands in full — the persistent `_yawOffset` the chase
targets around, the rate ceiling rather than a lerp, the deliberate refusal to
size-ramp the unwind, and `recentre()` on `onBasisLatch`. What did not stand is
the three numbers.

This ADR solved "the camera fights me" by making the return to centre very
slow. It over-corrected. At `ORBIT_RECENTRE_DELAY = 1.2 s`, `RATE = 0.45`/s
(tau 2.2 s) and `MAX = 0.5 rad/s` (28.6°/s), a 90° look measures **8.05 s** to
come back within 5° of behind the heading, and a 180° look 11.08 s. A camera
that stays where you last pointed it for eight seconds is an orbit camera. The
sandbox is supposed to be a follow cam, and Nico reported it as exactly that
inversion: *"I think we decided on orbital over follow? I want to have it go
back to follow."*

Amended to `DELAY = 0.15 s`, `RATE = 18`/s (tau 56 ms), `MAX = 2.2 rad/s`
(126.1°/s). Measured closed-loop through the real `Controls` and `ChaseCamera`
at a fixed 1/60 s step:

| look | before | after |
| --- | ---: | ---: |
| 90° @ SIZE 1 | 8.05 s | 1.23 s |
| 180° @ SIZE 1 | 11.08 s | 1.92 s |
| 90° @ SIZE 12 | 8.05 s | 1.08 s |
| 180° @ SIZE 12 | 10.92 s | 1.73 s |
| peak unwind rate | 28.6°/s | 126.0°/s |

126°/s is still 1.9× slower than the 240.6°/s reclaim this ADR was written to
kill at SIZE 1, and 3.2× slower than its 401.2°/s at SIZE 12 — the return is
bought without buying back the snatch. `RATE = 18` puts tau (56 ms) far below
the frame budget on purpose, so the **ceiling governs the entire return** and
the decay term is effectively vestigial; that is what makes a 20° look and a
180° look come back at the same readable speed, which is the property the
original "ceiling, not a lerp" reasoning was after.

Three findings worth recording, because they contradict or complete what is
written above:

1. **The return time has a floor the three constants cannot reach.** It
   decomposes as `DELAY + arc/MAX + the chase spring settling ~2·MAX/omega of
   ramp-tracking lag`. That third term is ~0.4 s at SIZE 1 and belongs to
   `FOLLOW_OMEGA`, not to anything in this ADR. 505 (DELAY, RATE, MAX) triples
   were measured; 1.23 s is on the frontier at a ≤130°/s ceiling, not a
   round number someone liked.
2. **The refusal to size-ramp the unwind is now measured, not just argued.**
   SIZE 12 returns *sooner* than SIZE 1 (1.08 s vs 1.23 s) because
   `FOLLOW_OMEGA` is higher there and closes the residual lag faster. Ramping
   the unwind would speed up the end that is already fast.
3. **`recentre()` is not made redundant by the faster unwind.** With it forced
   off on the amended build, four look-then-press cycles still drift 216° at a
   0.25 s re-press cadence and 36-51° at 0.5 s, self-healing only from ~1 s
   onward. It stays.

The amendment also **created and closed a defect of its own**, which is the
part worth reading if you touch these numbers again. The grace was refreshed
only by a non-zero `orbitDelta`. A held Q/E emits one every frame, so the
keyboard was always fine — but a touch drag whose finger stops moving emits
nothing, and what was harmless at a 1.2 s grace is a live bug at 0.15 s: 12.6°
of look lost per 0.25 s of stationary finger, 44.1° per 0.5 s, 92.9° per 1.0 s,
against 0.0° before the amendment. Closed by reporting the pointer being *down*
separately from the pointer *moving* — `Controls.orbitHeld` (`orbitId !== null`)
passed per frame as an optional 7th argument to `ChaseCamera.update` from both
`main.js` call sites, refreshing the grace inside the existing `followDir`
branch so the campaign is untouched by construction. Touch is the only exposed
surface: the mouse has no orbit drag by an explicit earlier decision (Q/E
already are the mouse's manual look). Measured after: a paused finger loses
0.0° at every duration tested, a lifted finger still unwinds at the new rate,
and the grace starts at the **lift** — a 5 s paused drag retires its offset
1.17 s after release rather than during the pause.

Finally, a correction to this ADR's own Consequences section. It quotes
**123.8°** of ratchet drift with the mitigation forced off; that exact figure
did not reproduce. The drift is strongly cadence-dependent and wraps past 180°,
which is the likely provenance — the same 4-cycle scenario on the same code
measures 338-347° at a 0.25-1.0 s cadence and 62.0° at 4 s. The claim (large
drift off, 0.0° on) reproduces exactly; the number should not be used as a
baseline. Likewise the "worst case 1.20 s" spring-convergence figure
re-measures as 1.250 s, identically on the old and amended files, at both 48
and 192 headings (1920/1920 convergences, 384/384 reversals) — a difference in
methodology, not a regression, since no convergence case touches `_yawOffset`.

Campaign bit-identity was re-proved rather than carried over, because
`update()`'s signature changed: max abs delta **0** on yaw, position, FOV and
far plane across 10,800 frames, 6 levels, 3 metros, with `_yawOffset` and
`_orbitHold` pinned at 0 throughout. Reduced Motion likewise unchanged (yaw is
input-only, zero chase contribution).
