# Scoreboards & Profiles — Rollout and Runbook

> [Objective overview](00-objective-overview.md) · [Migration](11-migration-plan.md) ·
> [Threat model](07-threat-model.md) · [Tasks](13-tasks.md)

How this ships, what the switches are, and what to do when something goes wrong on
a public board.

---

## 1. Phases

Five, each independently shippable and each leaving the game in a complete state.
Phase order is set by risk and by the one hard ordering constraint in
[11](11-migration-plan.md) §5.

| # | Phase | Ships | Network? | Why here |
|---|---|---|---|---|
| 1 | **Save + determinism** | v17 migration; `js/fwmath.js`; the ten `Math.*` fixes; validator gates | No | The migration is the highest-blast-radius change and belongs alone. The math fix changes the sim trajectory and must precede any stored trace. |
| 2 | **The RUN** | 90-second mode, the pinned ranked tune, `js/replay.js`, recording in `main.js`, the results-screen treatment | No | A complete, playable feature by itself: a time-attack mode with a local best. If everything after this were cancelled, this would still be worth having. |
| 3 | **The backend** | Supabase migration, RLS, `/api/run/start`, `/api/run/submit`, the verifier, the queue drain | Yes, invisible | Runs and verifies in the dark. Nothing is displayed. T-902 is measured here. |
| 4 | **Names and boards** | `/api/name/*`, RECORDS, PROFILE, the status-strip cell, the chip lines | Yes, visible | The first phase a player can see. |
| 5 | **Moderation** | Blocklist enforcement, operator page, report button, deletion | Yes | **Ships before phase 4 is made public**, not after. See §2. |

**Phases 4 and 5 are sequenced but released together.** Phase 5 is listed last
because it is built last; it is *enabled* first. A public board with names and no
moderation lever is an incident with a date on it.

---

## 2. Flags

Two, and they are different things on purpose.

**`board.enabled`** — in `js/board/config.js`, client-side. Off means
`js/board/**` is never imported: no ticket request, no submission, no board UI, no
status-strip cell. The game is byte-for-byte the game that shipped before this
feature. This is the flag for "we are not ready to show this."

**`FW_BOARDS_ACCEPTING`** — server-side, read by `/api/run/start`. Off means no
new tickets are issued and no new CPU is spent, while existing boards stay
readable. This is the flag for "something is wrong right now", and it is the one
that matters in an incident because it takes effect for every client immediately
with no deploy and no cache to wait out.

**Default state at each phase:** off through phase 3, on for phase 4's release.
Neither is ever removed after launch — a kill switch that has been deleted is not
a kill switch.

**Both are rehearsed in production before the boards go public.** Turn each off,
confirm the game is completely playable, turn each on, confirm boards return.
[07](07-threat-model.md) §6 item 10. A lever nobody has pulled is a lever whose
latency nobody knows.

---

## 3. Runbook

### 3.1 "There is an offensive name on the board"

1. Operator page → find the row → **FORCE RENAME**. Target: 60 seconds.
2. If it is worse than a name — a coordinated set, a targeted impersonation —
   **HIDE** instead, which removes them from both boards on the next read.
3. If it is broader than one player, `FW_BOARDS_ACCEPTING = off` buys time without
   taking the game away from anyone.
4. Add the pattern to `blocked_names`. It is a table, not a deploy.
5. Write the audit reason. Six months from now somebody will ask.

**Do not delete the scores.** The remedy is the name
([06](06-privacy-and-moderation.md) §4).

### 3.2 "The `mismatch` rate jumped"

**Assume it is our bug first.** A cheat is rare and lumpy; a determinism
regression is broad and sudden.

1. Run the §2 histogram in [09](09-observability-and-budgets.md).
2. Did a sim change deploy? If yes, `sim_version` was probably not bumped — bump
   it, which turns the false mismatches into honest `unverifiable` rows, and
   redeploy.
3. If no sim change deployed, pull a `verdict_detail` divergence tick and
   reproduce it in `tools/board-selftest.mjs`. **Whatever trace that is, it
   becomes a permanent fixture** ([08](08-test-strategy.md) §7).
4. If it is browser-correlated — all Safari, all Firefox — it is the cross-engine
   problem and T-102 was insufficient. Widen the tolerance as a stopgap and fix
   the call site properly.

**Nobody is ever accused of anything on the strength of a mismatch rate.**

### 3.3 "The CPU allowance is running out"

In order, cheapest first:

1. Tighten the placement gate — top 200 becomes top 50.
2. Lower the per-player replay ceiling from 20/hour.
3. Drop the ranked mode to 60 seconds ([08](08-test-strategy.md) §4). ~5× cheaper.
4. `FW_BOARDS_ACCEPTING = off`. Boards stay readable, the game stays playable, and
   nothing is lost — queued submissions drain when it comes back.
5. Only then, consider the plan.

### 3.4 "The boards are down / Supabase is down"

Do nothing. This is the designed behaviour: every call times out, the outbox
holds, the cached board renders with an "as of" line, and the game is completely
playable. **Confirm** that is what players are seeing rather than a spinner — a
hanging spinner is the one failure this design is not allowed to have, and if one
appears, that is the bug to fix, not the outage.

### 3.5 "Someone is clearly botting the board"

1. Confirm the runs actually verify (they will — that is the point).
2. Check the heuristics: is `flagged` set? If not, the thresholds are wrong for
   this case; adjust them server-side and re-evaluate.
3. Hide the player if it is spoiling the board.
4. **Do not start an arms race.** [04](04-anti-cheat.md) §6 is the standing
   position and it was decided in advance precisely so that this moment does not
   become a project.

### 3.6 "A player says they lost their name"

There is no recovery and there cannot be
([05](05-identity-and-names.md) §4.1). The honest answer is the one the claim
panel already gave them. Confirm the in-game copy is clear, and if this happens
often, the fix is to surface the transfer code earlier, not to build a recovery
path — a recovery path with no identity to check against is an account-takeover
primitive.

---

## 4. Rollback

**Do not roll back the client to undo a board problem.** A code rollback drops
`CURRENT_VERSION` below what already-updated players have, which quarantines their
saves and wipes visible progress for people who did nothing wrong. The escalation
ladder is:

- **Level 1 — flags (seconds, no deploy).** `FW_BOARDS_ACCEPTING = off`, then
  `board.enabled = false` if the UI itself is the problem. **This is the only
  lever anyone should reach for during an incident.**
- **Level 2 — read-only (minutes).** Revoke the verifier's write path; boards
  freeze, reads continue.
- **Level 3 — permanent retirement.** Ship a client that **keeps
  `CURRENT_VERSION = 17`, keeps `MIGRATIONS[16]`, keeps `player` and `outbox` in
  `freshSave()`**, and simply contains no board code. The keys become vestigial
  and inert. Then delete the tables — because a retired feature with a live table
  of player names is the worst of both worlds.

Level 3 is also the answer if the feature is simply abandoned. It costs one commit
and leaves no orphaned personal data.

---

## 5. Pre-launch checklist

Not "nice to have". Each line is a thing that is bad to discover afterwards.

- [ ] T-901 measured: the ranked tune is playable for 90 s on a real low-end phone
      (or the fallback tune is applied and recorded).
- [ ] T-902 measured: deployed replay p95 and the projected monthly CPU.
- [ ] T-903 measured: real trace size against the 32 KB reject threshold.
- [ ] The publishable-key deny test passes for every table, by name.
- [ ] The secret grep passes over everything the browser loads.
- [ ] Airplane-mode boot verified **on the deployed build**, not locally.
- [ ] Both flags pulled and restored in production.
- [ ] Force-rename timed with a stopwatch. Under 60 seconds.
- [ ] Hide verified to clear both boards on the next read.
- [ ] The three-browser replay fixtures (Chrome, Safari, Firefox) all reproduce.
- [ ] A v16 save with real `sandbox` records loads at v17 intact and renders.
- [ ] `STATUS.md` and `.wiki/modules/ui.md` updated in the same commit as the
      code, per `AGENTS.md` doc hygiene.
- [ ] The two ADRs moved from `adr-proposed/` into `.wiki/adr/`, renumbered if the
      sequence has moved, and `ADR-0012` given a "narrowed by" note.
