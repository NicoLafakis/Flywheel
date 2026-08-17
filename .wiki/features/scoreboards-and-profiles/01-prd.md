# PRD: Scoreboards & Profiles

- **Status:** Proposed · 2026-08-12 · nothing built
- **Priority:** P1
- **Owner surface:** `js/board/**` (new), `js/replay.js` (new), `js/fwmath.js` (new), `api/**` (new), `js/ui/boards.js` (new), `js/main.js`, `js/save.js`, `js/ui/screens.js`, `js/voxelsim.js`, `tools/validate.mjs`, `supabase/migrations/**` (new)
- **Migration:** save schema v16 → v17; one Supabase migration
- **Related:** [Objective overview](00-objective-overview.md) · [Requirements](02-requirements.md) · [Technical design](03-technical-design.md) · [Anti-cheat](04-anti-cheat.md) · [ADR-0003](../../adr/0003-deterministic-seeded-generation.md) · [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) (partly superseded) · [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md) · [adr-proposed/0016](adr-proposed/0016-bounded-ranked-run.md) · [adr-proposed/0017](adr-proposed/0017-name-ownership-by-device-token.md)

---

## 1. Overview

Flywheel is seven voxel cities and a score that only the player who set it will
ever see. This feature makes the score public and comparable: a board per city, a
single overall standing across them, and a name attached to it — claimed in one
field with no account, no email and no sign-in. Every ranked number on those
boards is one the server recomputed by re-simulating the run that produced it.

**Primary goal:** give a Flywheel score an audience, without giving anyone a
reason to doubt it.

## 2. Load-bearing invariant

> **No score reaches a board except by being recomputed server-side from the
> inputs that produced it. No request body, column, view or RPC accepts a score
> from a client.**

A pull request that adds a client-writable score path is wrong no matter what else
it does. This is inherited verbatim from
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md), which this
package narrows in scope but does not weaken in principle. `runs.claimed_score`
exists for exactly one purpose — deciding whether spending CPU on verification is
worthwhile — and is never displayed, compared as truth, or stored as a result.

## 3. Goals

1. A per-city board for every ranked city, showing at least the top 25 and the
   player's own row with neighbours.
2. One overall standing, THE FLYWHEEL, computed so that it measures the player
   and not which city they happened to play.
3. A name claimed in a single field at the moment a place is earned, with no
   sign-in surface at any point.
4. Every ranked score recomputed server-side, with the verification cost bounded
   and known in advance rather than growing with the player's skill.
5. Existing local records preserved, visible, and clearly distinguished from
   ranked ones.
6. The game fully playable, and every local record still written, with no network
   at all.
7. An offensive name removable from every surface in under 60 seconds by one
   person with no deploy.

## 4. Non-goals

- **Ranking the 50% city clear.** Measured infeasible to verify
  ([04](04-anti-cheat.md) §2); ranking it unverified would contradict goal 4.
- **Accounts.** No email, no password, no OAuth, no HubSpot, no lead capture, no
  consent ledger. Ruled out by the owner.
- **Belts, reigns, championships, achievements.** Deferred; a belt is a board with
  a claim rule and boards have to exist and be trusted first.
- **Ranking the live arena.** Host-authoritative
  ([ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)), so a peer's score is
  computed on another player's machine. Arena results stay arena results.
- **Ghost replays, daily challenges, seasons, friend boards.** Doors held open in
  the schema ([03](03-technical-design.md) §3.2), built later.
- **Chat, messaging, or any player-to-player free text beyond the name.**

## 5. Personas & user stories

- **The returning player.** "As someone who has played Chicago forty times, I want
  to know whether forty times makes me good, so that there is a reason to play it
  a forty-first."
- **The first-timer.** "As someone who just finished a run and did well, I want to
  put my name on it in one tap, so that I do not lose the moment to a form."
- **The competitor.** "As someone chasing first place, I want to see how far off I
  am and try again immediately, so that the gap is a target and not a wall."
- **The sceptic.** "As someone looking at a board with a suspiciously high score
  on it, I want to believe the number, so that beating it is worth my time."
- **The operator (the owner).** "As the person whose game this is, I want an
  offensive name gone from a public page in under a minute without a deploy."
- **Non-human actor — the verifier.** "As the verification function, I need the
  seed, the exact input trace, the tick count and the physics tune, so that I can
  reproduce the run and compute the score myself."

## 6. Functional requirements

- **FR-001** The system must offer a ranked mode, THE RUN: a single city, exactly
  5,400 ticks (90 s at 1/60), a server-issued seed, and one pinned physics tune.
- **FR-002** On starting a ranked run the client must obtain a run ticket from the
  server, and must start the run regardless of whether it succeeds.
- **FR-003** The client must record the per-tick move intent of every run into a
  preallocated buffer, always, online or offline.
- **FR-004** A submission must carry inputs, a ticket, a tick count, a tune id and
  a build id, and must not carry a score that is stored or displayed.
- **FR-005** The server must reject a submission whose ticket is absent, invalid,
  expired or already redeemed.
- **FR-006** The server must re-simulate the submitted inputs against its own copy
  of the sim at the declared tune and record the score it computes.
- **FR-007** A run whose claimed score could not place must be recorded as
  `unranked` without being re-simulated.
- **FR-008** The system must maintain one best verified run per player per city
  per season.
- **FR-009** The system must expose a per-city board ranked by verified score
  descending, ties broken by earliest.
- **FR-010** The system must expose an overall standing computed as the sum of
  rank-points earned on each city board.
- **FR-011** The system must ask for a name only at the moment a run earns a board
  place, never at boot and never before a first run.
- **FR-012** On claiming a name the server must mint a bearer token, return it
  once, store only its hash, and attach the triggering run to the new player.
- **FR-013** Names must be unique on a folded key (NFKC, default-ignorables
  stripped, UTS-39 confusable skeleton, casefolded).
- **FR-014** A taken name must be refused with at least three available
  alternatives, and must never expose that an account exists or offer a sign-in.
- **FR-015** A player must be able to mint a single-use, ten-minute transfer code
  that moves the name to another device and invalidates the previous one.
- **FR-016** A name matching the blocklist or the reserved list must be refused at
  claim time.
- **FR-017** An operator must be able to force-rename or hide any player, taking
  effect on every board on the next read with no deploy and no backfill.
- **FR-018** Any player must be able to request removal of their name and rows.
- **FR-019** Existing `save.sandbox` records must survive the migration unchanged
  and be displayed as personal history, labelled as not ranked.
- **FR-020** A submission that cannot reach the server must be queued durably and
  retried, and must never block, modal, or interrupt gameplay.
- **FR-021** The game must boot, run every city, and write every local record with
  the board layer never imported.
- **FR-022** Every board read and write must have a timeout with a defined
  non-network behaviour.

## 7. Data model & schema

Full tables, columns, indexes, views and RLS intent in
[03-technical-design.md](03-technical-design.md) §3. Summary: `players`, `runs`,
`run_inputs`, `run_tickets`, `name_transfers`, `blocked_names`,
`moderation_reports`, `submission_log`; two `security_invoker` views
(`v_city_board`, `v_overall`); rank never stored.

Client save: v16 → v17 adds `player: { id, name, claimedAt }` and `outbox: []` to
**both** `freshSave()` and `MIGRATIONS[16]`, per `AGENTS.md` invariant 6 and the
documented drift trap that broke the sandbox results screen once already
([11-migration-plan.md](11-migration-plan.md) §2). The bearer token lives in a
**separate** `localStorage` key and never in the save.

## 8. Surfaces & UX

[03](03-technical-design.md) §7. Title-screen status strip gains one cell; each
city chip gains one line; the results screen gains one panel and one chip; two new
screens (RECORDS, PROFILE). All built from the existing `.fw-*` brand layer per
[ADR-0005](../../adr/0005-shared-brand-layer.md).

**Interaction budget.** Ranked run from title screen: 2 taps (city chip → RUN).
Name claim: 1 field + 1 tap. Board from title screen: 1 tap. Nothing in this
feature adds a tap to the existing path to play.

Empty, loading and error states: a record never set renders **no cell, not a
zero** — the rule `.wiki/modules/ui.md` already states for the status strip,
applied to every board field. Loading renders the cached value with an "as of"
line, never a spinner. Error renders the cached value and says nothing.

## 9. Interface contract

[03](03-technical-design.md) §4. Six POST endpoints under `/api/` on Vercel, three
GET reads direct to PostgREST. Shared `{ok, data}` / `{ok, error:{code, message,
retryable}}` envelope; the client switches on `code`, never on `message`.

## 10. Security, authz & access control

- **`anon` (the publishable key, which ships in the browser by design) has SELECT
  on two views and INSERT on `moderation_reports`. Nothing else.** No table
  holding a score, a name, or a token is reachable from the browser.
- All writes go through Vercel Functions holding `SUPABASE_SECRET_KEY`, which must
  never appear in `js/`, in `index.html`, or in any bundle. A grep gate enforces it
  ([08](08-test-strategy.md) §3).
- Every input validated server-side; the client's identical checks are for
  feedback and are never the authority.
- Rate limits on **ticket issuance** as well as submission, counted in Postgres
  ([04](04-anti-cheat.md) §7).
- The name is the only user-supplied string stored. It is validated, normalised,
  length-bounded, charset-bounded, and blocklisted before storage
  ([05](05-identity-and-names.md) §3.2).
- **Compliance:** the only personal data is a self-chosen display name and a
  random device key. No email, no IP logging, no fingerprinting, no analytics
  SaaS, no profiling. Deletion and what is public are covered in
  [06-privacy-and-moderation.md](06-privacy-and-moderation.md).

## 11. Data integrity & write path

One write path: `/api/run/submit` under the secret key. There is no second.

- **Idempotency** on `sha256(payload)` (a unique index) and on the ticket's
  `run_id`, so the offline outbox can retry forever without a dedupe problem.
- **Atomic ticket redemption** — a conditional `UPDATE … WHERE redeemed_at IS
  NULL`, consumed before the seed is usable, not after
  ([04](04-anti-cheat.md) §4.2 for the postmortem that makes this a rule).
- **Best-per-player** derived at read time in `v_city_board` rather than
  maintained by a trigger, so there is no materialised state to be wrong.
- **Rank never stored.** `row_number()` in the view.
- Server clock for `created_at` and `verified_at`; neither is client-writable.

## 12. Testing strategy

[08-test-strategy.md](08-test-strategy.md). Highlights: `tools/validate.mjs` gains
a trace-codec round-trip property check and — the real gate — a fixture that
records a run in a browser and reproduces its score in Node. An automated
publishable-key deny test per table. Two measurements gate the build: the ranked
tune on a real low-end phone (T-901) and the deployed replay p95 (T-902).

## 13. Observability & logging

[09-observability-and-budgets.md](09-observability-and-budgets.md). Vercel runtime
logs and Supabase logs only — no new SaaS, per the standing ban. Structured one
line per verification carrying `run_id`, `scene_id`, `verdict`, `replay_ms`,
`tick_count`. A weekly `verdict` histogram is the health signal: a rising
`mismatch` rate means our bug before it means their cheat.

## 14. Error handling & user feedback

Every failure has a defined user-visible response and none of them is a modal.
Ticket refused → the run starts anyway and is saved unranked. Submission fails →
outbox, chip reads `WILL SUBMIT WHEN ONLINE`. Verification says `mismatch` → the
row is not displayed and the player's own history shows the run without a rank;
**the player is never accused**. Name taken → three working alternatives in the
same panel. Name blocked → "that name isn't available", with no explanation of
which rule fired, because explaining the filter is a guide to evading it. No error
string leaks a table name, a vendor name, or a stack.

## 15. Performance & cost

[09](09-observability-and-budgets.md). Board read p95 < 400 ms and always
cache-first. Verification is asynchronous; the submit call returns in < 500 ms.
Replay budget ≤ 120 s p95 per run, with a hard fallback to a 60-second mode.
**The binding cost is Vercel's monthly Active CPU allowance** — 4 CPU-hours on
Hobby, roughly 436 verifications a month at the measured 33 s — which is why the
placement gate is structural. No paid third-party service is added; Supabase and
Vercel are already sanctioned.

## 16. Accessibility

Board tables get real semantics (`<table>`, `<caption>`, `<th scope>`), not divs.
The name field has a real `<label>`, `autocomplete="off"`, `autocapitalize`, and
an `aria-describedby` carrying the "this name lives in this browser" line. Focus
moves to the name field when the claim panel opens and returns to the results
buttons when it closes. Every new colour is drawn from the existing `--fw-*`
tokens, which already carry measured contrast (the `--fw-ring-*` outline rings
measure 19:1). Reduced motion swaps the existing `--fw-press`/`--fw-release`
tokens as the landing screen already does; nothing new animates. Rank changes are
announced through the existing HUD announcement queue rather than a new live
region.

## 17. Phases

[10-rollout-and-runbook.md](10-rollout-and-runbook.md). Five phases, each
independently shippable, each behind `board.enabled` in
`js/board/config.js`:

1. **Determinism and the trace** — `js/fwmath.js`, the ten `Math.*` call sites,
   `js/replay.js`, recording in `main.js`, validator gates. **No network.** This
   phase is valuable on its own and is the only one that touches physics.
2. **The RUN mode** — 90-second mode, ranked tune, results screen. Still local.
3. **The backend** — migration, RLS, `/api/run/*`, the verifier. Boards not shown.
4. **Names and boards** — claim, transfer, RECORDS, PROFILE, the UI surfaces.
5. **Moderation and the operator page** — ships before the boards are public, not
   after.

## 18. Reuse — don't fork

Named so the implementer extends rather than duplicates:

- **`js/voxelsim.js`.** The verifier imports it. There is never a second copy of
  the physics, in Deno or anywhere else. This is the entire reason the design is
  affordable.
- **`tools/validate.mjs`.** The replay harness already exists; the verifier is the
  same move pointed at a different question.
- **`js/rng.js`.** All randomness. Seeds are strings handed to `RNG`.
- **The `.fw-*` brand layer** ([ADR-0005](../../adr/0005-shared-brand-layer.md)) —
  `.fw-status`, `.fw-stat`, `.fw-chip`, `.fw-group`, `--fw-*`. No new primitives.
- **`js/net/arena.js`'s `ROOM_CODE_ALPHABET`.** The transfer code uses it. A
  second unambiguous-glyph alphabet is a future inconsistency.
- **`js/ui/screens.js`'s `FREE_PLAY`.** The single place city order and labels
  live. The ranked-city list references it; it does not re-list the cities.
- **`js/save.js`'s `recordSandboxResult`.** Extended, never forked — the same
  precedent the v16 bump set.
- **`js/audio/`** for any board sting, via the existing announcement queue.

## 19. Acceptance criteria

- [ ] A grep of everything the browser loads finds no secret key and no score
      field on any write path. (**invariant**)
- [ ] Submitting a hand-written body with an invented score to `/api/run/submit`
      returns an error and writes nothing. (FR-004, FR-005, invariant)
- [ ] A recorded browser run replayed by `tools/validate.mjs` in Node reproduces
      its score exactly. (FR-006)
- [ ] Replaying the same trace at HIGH and at the ranked tune produces different
      scores, and the verifier uses the declared tune. (FR-006)
- [ ] A second submission of the same trace returns the first result and creates
      no second row. (FR-004)
- [ ] A ticket redeemed twice fails the second time. (FR-005)
- [ ] Airplane mode: the game boots, every city plays, a ranked run is offered and
      saved unranked, and no request is attempted. (FR-021, FR-002)
- [ ] A submission made offline appears on the board after reconnecting, with no
      user action. (FR-020)
- [ ] `NICO`, `nico`, `ｎｉｃｏ`, `NIСO` (Cyrillic С) and `ni​co` (zero-width) all
      collide on one claim. (FR-013)
- [ ] A taken name returns three alternatives that are themselves free, and the
      response contains no sign-in affordance. (FR-014)
- [ ] A transfer code works once, moves the name, and the old device's token stops
      verifying. (FR-015)
- [ ] Hiding a player removes them from both boards on the next read, in under
      60 seconds, with no deploy. (FR-017)
- [ ] A v16 save with `sandbox` records loads at v17 with every record intact and
      renders them as personal history. (FR-019)
- [ ] A fresh save and a migrated save have identical key sets, top level and
      inside `settings` and `player`. (FR-019)
- [ ] The overall standing of a player ranked in one city is lower than that of a
      player ranked in several, and both are explicable from the visible ranks.
      (FR-010)
- [ ] Every board call has a timeout and a defined behaviour on timeout. (FR-022)
- [ ] Keyboard-only: claim a name, open RECORDS, switch tabs, return. (§16)

## 20. Dependencies & integration points

- **Blocking:** which Vercel plan this project is on, and confirmation that a
  zero-dependency `api/*.mjs` deploys with no root `package.json`
  ([03](03-technical-design.md) §5).
- **Depends on:** Supabase project `zrsrvhrkgfuqhcjnjezw` (exists, Pro); Vercel
  project `flywheel` (exists); `SUPABASE_SECRET_KEY` as a Vercel env var (in
  `.env.local`, not yet in Vercel); a new `FW_TICKET_SECRET`.
- **New paid services:** **none.** Supabase and Vercel are already sanctioned. The
  name blocklist is a vendored MIT-licensed JSON file, not a service.
- **Depended on by:** ghost replays, daily challenges, seasons, friend boards, and
  any future belt system — all of which read this schema.
- **Note:** `online-flywheel` described a different, larger design for the
  same territory. [00](00-objective-overview.md) has the reconciliation
  table; that package was retired along with the legacy multiplayer stack on
  2026-08-16, including the threat model this note used to cite.

## 21. Open questions

Two are genuinely open and both are **measurements, not decisions**:

1. **Is the ranked tune playable at 90 seconds on a low-end phone?** (T-901.) The
   fallback if not is written in advance: `contactRounds: 1` for everyone,
   verifier included, re-measured and recorded. What must never happen is the
   tune differing between players.
2. **What is the deployed replay p95?** (T-902.) If it exceeds 120 s, or the
   monthly CPU allowance is projected to run out, the ranked mode drops to 60
   seconds. Both branches are specified; neither needs a new decision.

Everything else that looked like a question resolved to a decision and is recorded
as one, in [00](00-objective-overview.md), [03](03-technical-design.md) §2.2, and
the two ADRs.

## 22. Companion ADRs

- [`adr-proposed/0016-bounded-ranked-run.md`](adr-proposed/0016-bounded-ranked-run.md)
  — the ranked unit is a bounded run, re-simulated in full; the city clear is
  never ranked. **Narrows ADR-0012** to the scope in which it is achievable.
- [`adr-proposed/0017-name-ownership-by-device-token.md`](adr-proposed/0017-name-ownership-by-device-token.md)
  — identity is a name plus a server-minted device-held token, with no accounts.
  **Supersedes ADR-0011's rungs 2 and 3.**

Both are drafts in this folder. Per `.wiki/conventions.md` ADRs are append-only
and live in `.wiki/adr/`; move them there, renumbered if the sequence has moved,
on acceptance.

**Cited rather than re-decided:** [ADR-0002](../../adr/0002-sim-render-split.md),
[ADR-0003](../../adr/0003-deterministic-seeded-generation.md),
[ADR-0005](../../adr/0005-shared-brand-layer.md),
[ADR-0009](../../adr/0009-supabase-backend.md),
[ADR-0014](../../adr/0014-vendored-same-origin-runtime.md),
[ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md).
