# Scoreboards & Profiles — Task Breakdown

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Requirements](02-requirements.md) · [Technical design](03-technical-design.md) ·
> [Anti-cheat](04-anti-cheat.md) · [Test strategy](08-test-strategy.md) ·
> [Rollout & runbook](10-rollout-and-runbook.md) · [Migration](11-migration-plan.md) ·
> [Risk register](12-risk-register.md)

**Date:** 2026-08-12 · **Status:** accepted and implemented; the task detail is
retained as the delivery audit trail

This is the build order: ordered, independently verifiable tasks. It exists so
an implementer can pick one up and execute it without re-deriving a design
decision — every task points at the doc that already made the decision, and at
the requirements in [02](02-requirements.md) (S-sections) and
[01](01-prd.md) (FR-numbers) that prove it is done.

Nothing here invents design. Three IDs were assigned by the design docs before
this file existed — **T-102** ([04](04-anti-cheat.md) §3A.3), **T-301**
([03](03-technical-design.md) §5) and the measurement gates **T-901/T-902/T-903**
([08](08-test-strategy.md) §4) — and they keep their numbers here.

> **Delivery reconciliation (2026-08-12):** T-101 through T-503 are represented
> by the v17 save migration, fixed-tick RUN/replay path, Vercel API, applied
> Supabase migrations, optional UI, and moderation surface. Focused replay,
> schema, API-syntax, RLS, and production checks are recorded in `SPEC.md` and
> `STATUS.md`; T-901 remains an explicit real-device measurement rather than a
> result inferred from this development machine.

---

## How to read a task

- **ID** — stable. The hundreds digit is the phase from
  [10](10-rollout-and-runbook.md) §1 (1xx save + determinism, 2xx the RUN,
  3xx backend, 4xx names and boards, 5xx moderation); 9xx is the measurement
  gates. IDs are never renumbered when the order changes.
- **Done when** — one observable sentence. If it cannot be observed, the task is
  written wrong.
- **Touches** — the files and surfaces. Paths are relative to the repo root.
- **Depends on** — task IDs, not prose. A task with no dependencies can start
  today.
- **Satisfies** — criteria from [02](02-requirements.md) (`S1`–`S8`) and
  [01](01-prd.md) (`FR-0nn`). Every task traces to at least one.
- **Size** — S ≈ half a day or less · M ≈ one to two days · L ≈ three days or
  more. Sizes assume the design docs are read first; they do not include
  reading them.

### Markers

| Marker | Meaning |
|---|---|
| ⚠ | **Decision gate.** The branch is written in advance; work downstream of it does not start until the measurement lands. |
| 🔑N | **Blocked on Nico.** `SUPABASE_SECRET_KEY` set as a Vercel env var and a new `FW_TICKET_SECRET` minted ([01](01-prd.md) §20); also covers the Vercel plan confirmation. |

---

## The shape of the plan

Five phases from [10](10-rollout-and-runbook.md) §1, plus the measurement gates.
Each phase ends in something that can be demonstrated and each is a state the
project could sit in indefinitely — stopping anywhere leaves a complete
product, which is what makes the degrade order in
[12](12-risk-register.md) safe.

| Phase | Ends with | Network? |
|---|---|---|
| **1** — Save + determinism | A v17 save; `js/fwmath.js`; the ten `Math.*` fixes; validator re-gated | No |
| **2** — The RUN | The 90-second mode playable locally, every run recorded, a browser trace reproduced in Node | No |
| **3** — The backend | Runs verified in the dark; the three security gates scripted; T-902 measured | Yes, invisible |
| **4** — Names and boards | A player claims a name in one field and reads both boards | Yes, visible |
| **5** — Moderation | Force-rename, hide and deletion live and rehearsed — **enabled before phase 4 is public** | Yes |
| **9xx** — Measurement gates | T-901, T-902, T-903 answered with numbers | — |

---

## Phase 1 — Save + determinism

**Demonstrable at the end:** a v16 save with real `sandbox` records loads at
v17 intact; `node tools/validate.mjs` passes with the extended key-set guard;
the sim's ranked path is bit-reproducible across engines by construction.
The ordering constraint of [11](11-migration-plan.md) §5 governs: the save
migration is alone in its commit, and the math fix lands **before any trace is
ever stored**.

### T-101 — Save schema v16 → v17

- **Done when:** a v16 save with real `sandbox` records loads at v17 with every
  `completions`, `bestSize`, `bestTime`, `bestCombo` and `bestScore` intact, and
  a fresh save and a migrated save have identical key sets, top level and inside
  `settings` and `player`.
- **Touches:** `js/save.js` (`CURRENT_VERSION`, `MIGRATIONS[16]`,
  `defaultPlayer()`, `freshSave()` — all in one commit with nothing else),
  `tools/validate.mjs` (the key-set parity guard **extended, not forked**, to
  walk `player` the way it already walks `settings`), the readers
  (`js/ui/screens.js` and friends gain the `||` container seatbelt).
- **Depends on:** nothing. It goes first and it goes alone
  ([11](11-migration-plan.md) §5.1).
- **Satisfies:** FR-019; S6.
- **Size:** M

### T-102 — `js/fwmath.js` and the ten `Math.*` call sites ⚠

- **Done when:** the six `Math.hypot` sites compose through `Math.sqrt`, the
  two trig sites use the bounded-domain `fwSin`/`fwCos` polynomial, the
  `Math.cbrt` at `:2825` gets the structural treatment `:847` already uses, and
  `tools/validate.mjs` passes with re-measured gates if trajectories moved.
- **Touches:** `js/fwmath.js` (new, pure, joins the no-`Math.random()` guard
  list), `js/voxelsim.js` (the ten call sites audited in
  [04](04-anti-cheat.md) §3A.2), `tools/validate.mjs`.
- **Depends on:** T-101 (ordering per [11](11-migration-plan.md) §5, not
  technique).
- **Satisfies:** the determinism half of S2; [07](07-threat-model.md) §6 item 9.
  ⚠ The gate: until this lands, a comparison tolerance absorbs last-bit drift
  and unreproducible runs are `unverifiable` — or the tolerance path is
  explicitly accepted with a note saying who accepted it.
- **Size:** L

---

## Phase 2 — The RUN

**Demonstrable at the end:** a 90-second run on the ranked tune, a clock that
stops itself at exactly 5,400 ticks, a results screen that shows the local
number instantly as YOUR RUN, and a trace on disk that Node reproduces to the
same score. Still no network — if everything after this phase were cancelled,
this would still be worth having ([10](10-rollout-and-runbook.md) §1).

### T-201 — `js/replay.js`: the trace codec

- **Done when:** the `rle-i8-v1` codec round-trips any input sequence in a
  property check, and the module is pure enough to be imported by the browser,
  by `tools/validate.mjs`, and by `api/` — one implementation.
- **Touches:** `js/replay.js` (new, pure, joins the guard list),
  `tools/board-selftest.mjs` (new — the round-trip property check).
- **Depends on:** nothing.
- **Satisfies:** the codec half of FR-003; S2 (codec row of
  [08](08-test-strategy.md) §1).
- **Size:** M

### T-202 — Recording in `js/main.js`

- **Done when:** every run, online or offline, appends two `int8`s per tick to
  a preallocated `Int8Array` inside the existing fixed-step loop — no
  allocation, no branch on network state — and a profile shows no frame-time
  cost ([09](09-observability-and-budgets.md) §4.4).
- **Touches:** `js/main.js` (one line in the hot loop), `js/replay.js`.
- **Depends on:** T-201. Ships **before** verification so real human traces
  exist for T-903 and for fixtures ([11](11-migration-plan.md) §5.3).
- **Satisfies:** FR-003; S1 (EARS: no allocation while in progress).
- **Size:** S

### T-203 — The RUN mode and the ranked tune

- **Done when:** a `'run90'` run plays one city at `RANKED_TUNE`
  (`debrisCap: 280, contactBudget: 200, contactRounds: 2, supportEvery: 1`)
  with the clock stopping on the tick boundary at exactly 5,400 ticks, and the
  graphics tier changes only what is drawn.
- **Touches:** `js/voxelsim.js` (`RANKED_TUNE` next to the existing defaults —
  `js/quality.js` is **not** touched, per [03](03-technical-design.md) §6.1),
  `js/main.js` (the mode), `js/ui/screens.js` (the RUN entry on a city chip,
  `FREE_PLAY` as the single city list).
- **Depends on:** T-102 — the tune is measured and recorded against the
  post-fix sim.
- **Satisfies:** FR-001; S1.
- **Size:** M

### T-204 — The results-screen treatment

- **Done when:** the local score shows instantly labelled YOUR RUN, the chip
  beneath it holds the slot that will later resolve to VERIFIED, an offline run
  reads `SAVED — NOT RANKED (NO CONNECTION)`, and no button moves and no modal
  appears in any state.
- **Touches:** `js/ui/screens.js` (`showSandboxResults`),
  `recordSandboxResult` extended, never forked ([01](01-prd.md) §18).
- **Depends on:** T-203.
- **Satisfies:** S1, S2 (the unverified-then-resolves pair); FR-020's visible
  half.
- **Size:** M

### T-205 — `tools/board-selftest.mjs` and the fixture that is the real gate

- **Done when:** a run recorded in a real browser replays in Node to the same
  score, from a committed fixture (base64 trace, seed, scene, tune, expected
  score) — for Chicago and Brooklyn, recorded in Chrome, Safari and Firefox —
  and perturbing one byte of the trace turns the test red.
- **Touches:** `tools/board-selftest.mjs`, the fixture files,
  `tools/validate.mjs` (the gate additionally registered there, per
  [08](08-test-strategy.md)'s standing RCA caveat).
- **Depends on:** T-102, T-201, T-203. The three-browser set is the
  cross-engine determinism check and the only way to find out whether T-102
  was sufficient ([08](08-test-strategy.md) §2).
- **Satisfies:** S2 (the gate row); [01](01-prd.md) §19's
  record-and-reproduce criterion.
- **Size:** M

---

## Phase 3 — The backend

**Demonstrable at the end:** a submission is ticketed, re-simulated, and given
a verdict, with boards never shown. T-902 is measured here. Nothing a player
can see changes.

### T-300 — Deploy spike: the three §5 questions 🔑N ⚠

- **Done when:** written answers exist to [03](03-technical-design.md) §5's
  three items — a zero-dependency `api/*.mjs` deploys on this project with no
  root `package.json`; the function bundle fits and its cold-start parse cost
  is counted; and the Vercel plan is confirmed (Hobby is non-commercial-only).
- **Touches:** Vercel project settings, one throwaway `api/*.mjs`, `.env.local`
  → Vercel env for `SUPABASE_SECRET_KEY`; `FW_TICKET_SECRET` minted.
- **Depends on:** nothing. **It gates T-301** — 03 §5 and [01](01-prd.md) §20
  both name it as the blocking item.
- **Satisfies:** none directly — it is the enablement the backend stands on.
- **Size:** S

### T-301 — The Supabase migration

- **Done when:** the eight tables, two `security_invoker` views, RLS policies
  and `fw_rank_points` of [03](03-technical-design.md) §3 exist on project
  `zrsrvhrkgfuqhcjnjezw`, forward-only and additive, with the migration test
  proving rank is computed at read time, ties break by earliest, and the §2.2
  points arithmetic is exact.
- **Touches:** `supabase/migrations/**` (new).
- **Depends on:** T-300. Nothing to backfill — the cheapest moment the
  no-historical-scores decision will ever be available
  ([11](11-migration-plan.md) §4). The RLS policies get the second pair of
  eyes, not the DDL.
- **Satisfies:** FR-008, FR-009, FR-010; S5's SQL rows.
- **Size:** M

### T-302 — `POST /api/run/start` 🔑N

- **Done when:** a ticket is issued with the `run_tickets` row written
  **before** the seed is returned, redemption is a conditional
  `UPDATE … WHERE redeemed_at IS NULL`, the HMAC covers
  `(run_id, seed, scene_id, mode, tune_id, player_id, issued_at)`, and the §7
  rate limits are counted in Postgres via `submission_log` — and on failure the
  client still starts the run.
- **Touches:** `api/run/start.*` (new), the `run_tickets` and `submission_log`
  tables.
- **Depends on:** T-301. 🔑N — needs `FW_TICKET_SECRET`.
- **Satisfies:** FR-002, FR-005 (issuance half); S1's EARS ticket clause.
- **Size:** M

### T-303 — `POST /api/run/submit` and the verifier

- **Done when:** the five ordered checks (ticket, shape, elapsed-time, rate
  limits, placement gate — [04](04-anti-cheat.md) §5.3) run before a single sim
  step; the verifier constructs the sim by importing the shipping
  `js/voxelsim.js` at the declared tune and steps it 5,400 times; the run is
  written `pending` and resolved asynchronously by the queue drain; a
  resubmission returns the first result with no second row; and every
  verification emits the one structured log line of
  [09](09-observability-and-budgets.md) §1.
- **Touches:** `api/run/submit.*` (new), the verifier (one function per ranked
  scene, or lazy `loadScene()` — [03](03-technical-design.md) §5),
  `js/replay.js` (shared, not forked).
- **Depends on:** T-301, T-302, T-201, T-203.
- **Satisfies:** FR-004, FR-005, FR-006, FR-007; S2.
- **Size:** L

### T-304 — The three security gates, scripted

- **Done when:** the publishable-key deny test attempts INSERT/UPDATE/DELETE
  against every table and SELECT against everything but the two views, per
  table by name (a table added without joining the list is itself a failure);
  the secret grep walks `index.html`, `js/**` and `css/**` for `sb_secret_`,
  `service_role`, `FW_TICKET_SECRET` and visible env values; and the score-path
  audit greps `api/**` for any handler reading `score`, `verified_score` or
  `points` into a write.
- **Touches:** `tools/board-live-selftest.mjs` (the deny test),
  `tools/validate.mjs` (the grep — next to `validateOfflineBoot()`, whose shape
  it shares).
- **Depends on:** T-301, T-303.
- **Satisfies:** [07](07-threat-model.md) §6 items 1–3; [01](01-prd.md) §19's
  invariant criterion.
- **Size:** M

### T-305 — `tools/board-live-selftest.mjs`: the live suite

- **Done when:** against <https://flywheel-woad.vercel.app>, the suite proves
  idempotency (second submission returns the first result), ticket single-use,
  the deny test, and version-skew recorded as `unverifiable` — following
  `tools/net-live-selftest.mjs`'s precedent of a live suite kept out of the
  default chain.
- **Touches:** `tools/board-live-selftest.mjs`.
- **Depends on:** T-303, T-304.
- **Satisfies:** S2's live rows; [08](08-test-strategy.md) §6.
- **Size:** M

---

## Phase 4 — Names and boards

**Demonstrable at the end:** a verified run that places asks for a name in one
field, the name is on the board within a second, and both boards read.
**Released only together with phase 5**
([10](10-rollout-and-runbook.md) §1).

### T-401 — `POST /api/name/claim` and the name pipeline 🔑N

- **Done when:** a claim enforces the full pipeline server-side — 3–16 chars,
  `[A-Za-z0-9 _-]`, NFKC, default-ignorables stripped, UTS-39 skeleton,
  casefold, the vendored blocklist (leet-folded, punctuation-stripped, severity
  4 auto-rejects) and the reserved list — a taken name returns at least three
  checked-available alternatives with no sign-in affordance, the token is
  minted server-side and returned exactly once with only its hash stored, the
  triggering run is backfilled in the same transaction, and the limits (3 per
  IP per day, one per token) hold.
- **Touches:** `api/name/claim.*` (new), the vendored confusables subset and
  profanity-list JSON under `api/data/` (pinned, same-origin, replaced
  wholesale — the ADR-0014 pattern, [06](06-privacy-and-moderation.md) §3.1),
  the `players` and `blocked_names` tables.
- **Depends on:** T-301, T-303 (the backfilled run exists).
- **Satisfies:** FR-011, FR-012, FR-013, FR-014, FR-016; S3 — including the
  five-way `NICO`/`ｎｉｃｏ`/`NIСO`/`ni​co` collision check.
- **Size:** L

### T-402 — `POST /api/name/transfer/start` and `/redeem`

- **Done when:** a six-character code from `js/net/arena.js`'s existing
  `ROOM_CODE_ALPHABET` (reused, not a second alphabet) is single-use with a
  ten-minute expiry; redeeming mints a new token, increments `token_version`,
  and the old device's token stops verifying on its next call.
- **Touches:** `api/name/transfer/*` (new), the `name_transfers` table.
- **Depends on:** T-401.
- **Satisfies:** FR-015; S4.
- **Size:** M

### T-403 — The `js/board/*` client layer

- **Done when:** `config.js`, `player.js`, `run.js`, `outbox.js` and `read.js`
  exist with the envelope client switching on `code` never `message`; the
  outbox is durable, idempotent by `run_id`, drains on `online`/focus/
  success/60 s timer with the [03](03-technical-design.md) §8 backoff and
  20-item/1 MB cap; every call carries its timeout (4 s reads, 10 s writes);
  the layer is dynamically imported on first use with **zero** boot cost and
  the whole layer plus `js/ui/boards.js`, `js/replay.js` and `js/fwmath.js`
  stays under 25 KB uncompressed with zero new runtime dependencies
  ([09](09-observability-and-budgets.md) §4.4).
- **Touches:** `js/board/*` (new), `js/board/config.js` (the two flags:
  `board.enabled`, and the client half of the server flag),
  **`AGENTS.md` (invariants 7–9 land in the same commit as the first
  `js/board/` file — [03](03-technical-design.md) §1.1) and
  `.wiki/conventions.md` (the no-`await`-inside-`frame()` rule).**
- **Depends on:** T-302, T-303, T-401.
- **Satisfies:** FR-020, FR-021, FR-022; S8.
- **Size:** L

### T-404 — RECORDS, PROFILE, and the existing surfaces

- **Done when:** RECORDS shows THE FLYWHEEL and one tab per ranked city (top
  25, then your row with two neighbours); PROFILE carries the six sections of
  [05](05-identity-and-names.md) §5 with YOUR HISTORY visibly local; the status
  strip gains its one cell only once a name exists; each city chip gains its
  one line; a record never set renders **no cell, not a zero**; the claim
  panel, the greyed-name state, the three outbox states, and the one-time
  boards copy of [11](11-migration-plan.md) §3.4 all read as specified; and the
  whole of it is built from the existing `.fw-*` layer with the §16
  accessibility contract (real table semantics, real label, focus management,
  reduced motion).
- **Touches:** `js/ui/boards.js` (new), `js/ui/screens.js` (one cell, one line
  per chip, one results panel), `css/main.css` (tokens only, no new
  primitives).
- **Depends on:** T-403.
- **Satisfies:** FR-008–FR-011's visible half, FR-019's display half; S4, S5,
  S6; [01](01-prd.md) §16.
- **Size:** L

---

## Phase 5 — Moderation

**Built last, enabled first.** A public board with a name field and no
moderation lever is an incident waiting for a date
([10](10-rollout-and-runbook.md) §1).

### T-501 — `POST /api/report`

- **Done when:** any board row can be reported in one tap, the report is
  insert-only at one per device per player per day, and **a report never hides
  anyone by itself** — N distinct reporters raise the row in the operator
  queue, because a report button that hides is a griefing weapon aimed at
  whoever is in first place ([06](06-privacy-and-moderation.md) §3.1).
- **Touches:** `api/report.*` (new), the `moderation_reports` table.
- **Depends on:** T-301.
- **Satisfies:** S7's report row.
- **Size:** S

### T-502 — The operator page

- **Done when:** a static route gated on a secret held only by the owner lists
  recent claims and reported players; FORCE RENAME sets a generated neutral
  name and `moderation_state = 'renamed'` with every rank and score untouched;
  HIDE sets `'hidden'` and the player leaves both boards on the next read with
  no backfill and no deploy; a renamed player sees the one-line appeal copy;
  and every action writes an audit row (`who`, `what`, `when`, `why`).
- **Touches:** the operator page (new), the `players.moderation_state` column.
- **Depends on:** T-301, T-401.
- **Satisfies:** FR-017; S7; [07](07-threat-model.md) §6 item 6.
- **Size:** M

### T-503 — REMOVE ME FROM THE BOARDS

- **Done when:** one button, one confirmation, and in one transaction the
  player is hidden, the name replaced with `Retired Sprocket` and its
  `name_key` cleared, `token_hash` deleted (irreversible by construction),
  every `run_inputs.payload` for the player deleted, and the `runs` rows kept,
  anonymous — with the button copy stating exactly that, because deleting the
  scores would silently promote everyone below them
  ([06](06-privacy-and-moderation.md) §5).
- **Touches:** the deletion endpoint, PROFILE's last section.
- **Depends on:** T-401.
- **Satisfies:** FR-018; S7.
- **Size:** M

### T-504 — The drills and the pre-launch checklist

- **Done when:** every line of [10](10-rollout-and-runbook.md) §5 is checked
  off in production: T-901/T-902/T-903 recorded, the deny test and secret grep
  green, airplane-mode boot verified **on the deployed build**, both flags
  pulled and restored, force-rename stopwatched under 60 s, hide confirmed on
  both boards, the three-browser fixtures reproducing, a real v16 save
  migrated — plus `STATUS.md` and `.wiki/modules/ui.md` updated in the same
  commit as the code, and the two ADRs moved from `adr-proposed/` into
  `.wiki/adr/`, renumbered if the sequence has moved, with ADR-0012 given its
  "narrowed by" note.
- **Touches:** production, the runbook, `STATUS.md`, `.wiki/modules/ui.md`,
  `.wiki/adr/`.
- **Depends on:** everything above. A lever nobody has pulled is a lever whose
  latency nobody knows ([07](07-threat-model.md) §6 item 10).
- **Satisfies:** [07](07-threat-model.md) §6 in full.
- **Size:** M

---

## The measurement gates (9xx)

Neither a decision nor optional — both are measurements with their branches
written in advance ([01](01-prd.md) §21, [08](08-test-strategy.md) §4).

### T-901 — Is the ranked tune playable on a phone? ⚠

- **Done when:** a full 90-second ranked run at `RANKED_TUNE` on a real low-end
  touch device (the Pixel-5-at-4×-throttle profile `js/quality.js` cites as its
  own evidence base), on Chicago **and** Brooklyn, has median and p95 frame
  times recorded.
- **Branches:** pass ⇒ ship the tune. Fail ⇒ `contactRounds: 1` for
  **everyone, verifier included**, re-measure, record the new constant in
  `js/voxelsim.js` and update [04](04-anti-cheat.md) §5.2. The tune must never
  differ between players.
- **Depends on:** T-102, T-203.
- **Size:** S

### T-902 — What does a replay cost where it actually runs? ⚠

- **Done when:** the deployed verifier replays the fixture runs on Vercel and
  p50/p95 `replay_ms` and per-run Active CPU are recorded against the ~436
  verifications/month projection.
- **Branches:** pass (p95 ≤ 120 s and the allowance projects comfortably) ⇒
  ship 90 seconds. Fail ⇒ drop the ranked mode to 60 seconds (a new
  `runs.mode` value, not a new table) and re-measure
  ([04](04-anti-cheat.md) §5.1).
- **Depends on:** T-303.
- **Size:** S

### T-903 — The trace size, which nobody has ever measured

- **Done when:** the encoded size of the T-902 fixtures — real human traces,
  not the validator's bot — is recorded against the 32 KB reject threshold,
  replacing the inherited 1–4 KB figure with a measured one.
- **Branches:** over 32 KB ⇒ the threshold moves; far under ⇒ nothing changes
  ([08](08-test-strategy.md) §4).
- **Depends on:** T-202 (recording ships first so the traces exist —
  [11](11-migration-plan.md) §5.3), measured alongside T-902.
- **Size:** S

---

## Explicitly deferred (the "can follow" list)

From [07](07-threat-model.md) §7 — real work, deliberately not tasks yet:
Cloudflare Turnstile on name claim (the mass-squatting escalation, held in
reserve because it is friction on the one interaction that must be
frictionless) · the heuristic review-queue UI (the `flagged` verdict and board
filter ship first) · Vercel WAF rules · per-city replay budgets for cities
beyond T-901's two · a richer appeals flow.

Doors held open by the schema and by ADR-0016 but not built here: ghost
replays, daily challenges, seasons, friend boards ([00](00-objective-overview.md)
"20 moves ahead"; [02](02-requirements.md) "Out of scope").
