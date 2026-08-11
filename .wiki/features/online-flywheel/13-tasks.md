# Online Flywheel — Task Breakdown

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Requirements](02-requirements.md) · [Technical design](03-technical-design.md) ·
> [Netcode](04-netcode-design.md) · [Identity](05-identity-and-accounts.md) ·
> [Belts & achievements](06-belts-and-achievements.md) ·
> [Test strategy](07-test-strategy.md) · [Rollout & runbook](08-rollout-and-runbook.md) ·
> [Threat model](09-threat-model.md) ·
> [Observability & NFR](10-observability-and-nfr.md) ·
> [Risk register](11-risk-register.md) · [Migration plan](12-migration-plan.md) ·
> [Setup for Nico](SETUP-FOR-NICO.md)

**Date:** 2026-08-06 · **Status:** planning

This is the build order. It exists so that an implementer can pick up a task and
execute it without re-deriving a single design decision — every task points at
the doc that already made the decision, and at the acceptance criteria in
[02-requirements.md](02-requirements.md) that prove it is done.

Nothing here invents design. Where two docs disagree, the disagreement is called
out as a task (see [T-006](#t-006--reconcile-the-module-path-drift-jsnet-vs-jsonline)),
not silently resolved in code.

---

## How to read a task

Every task carries the same six fields:

- **ID** — stable. The hundreds digit is the phase; IDs are never renumbered
  when the order changes, so a commit message or a note can name one forever.
- **Done when** — one observable sentence. If it cannot be observed, the task is
  written wrong.
- **Touches** — the files and surfaces. Paths are relative to the repo root.
- **Depends on** — task IDs, not prose. A task with no dependencies can start
  today.
- **Satisfies** — criterion IDs from [02-requirements.md](02-requirements.md)
  (`GWT-nnn`, `SYS-nnn`). Every task traces to at least one. Where a task is
  pure enablement its criterion is the invariant it protects (`GWT-X07`,
  `GWT-X08`, `GWT-X09`).
- **Size** — S ≈ half a day or less · M ≈ one to two days · L ≈ three days or
  more. Sizes assume the design docs are read first; they do not include reading
  them.

### Markers

| Marker | Meaning |
|---|---|
| ◆ | **Release-blocking for UNBOUND.** The booth does not open without it. |
| ○ | Can follow the event. Ship it when it is ready, not before the doors. |
| 🔑N*n* | **Blocked on Nico's credential handover**, section *n* of [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md). Cannot start, at all, until the values arrive. **Sections 1 (Supabase) and 2 (Vercel) were handed over 2026-08-10** — 🔑N1/🔑N2 tasks are unblocked; only 🔑N3 (Google) and 🔑N4 (HubSpot) still gate on Nico. |
| ⚠ | Decision gate. Work downstream of it must not start until the gate is answered in writing. |

### The two acceptance-criteria numbering schemes

[02-requirements.md](02-requirements.md) uses `GWT-nnn` / `SYS-nnn`.
[07-test-strategy.md](07-test-strategy.md) uses `AC-<AREA>-<n>`. **02 wins** —
it says so itself, and this document references it exclusively. Reconciling 07's
scheme to 02's is [T-712](#t-712--reconcile-07s-ac-area-n-ids-to-02s-gwtsys-ids).

---

## The shape of the plan

Eight phases. Each ends in something that can be demonstrated to a person, and
each is a state the project could sit in indefinitely without being half-wired.
That property is deliberate: the date is fixed and the scope is not, so the plan
has to degrade by dropping tail phases rather than by leaving a torso open.

| Phase | Ends with | Release-blocking? |
|---|---|---|
| **0** — Deploy, vendoring, flags, the determinism spike | Today's game, live on a real URL, with an inert online skeleton and every flag off | ◆ |
| **1** — Backend foundation | A schema with RLS, seed data, and a green pgTAP suite. No client change | ◆ |
| **2** — Guest identity + save v13→v14 | A guest has a durable identity and a v14 save. Still no visible online feature | ◆ |
| **3** — Submission + replay validation | A run is submitted, replayed server-side, and given a verdict | ◆ |
| **4** — Boards, belts, achievements | The booth screen shows champions and the results screen shows a belt change | ◆ |
| **5** — Account claim | A player attaches a real identity to their runs | ◆ (OTP + Google) / ○ (HubSpot) |
| **6** — Live arena | Two strangers race in the same city and the host can walk away | ◆ |
| **7** — Event hardening, moderation, kiosk | A booth that a non-developer can run for two days | ◆ |

**If the schedule bites**, cut from the tail: a booth with boards, belts, and
claim but no arena is a good booth. A booth with an arena and no moderation is
an incident waiting for a projector.

---

## Phase 0 — First deploy, vendoring, the flag skeleton, and the spike

**Demonstrable at the end:** the production URL loads on a phone, on cellular,
cold cache, and plays a campaign level to completion. It is byte-for-byte
today's game. `node tools/validate.mjs` prints `ALL PASS` with three new guards
in it. Nothing online exists yet — which is the point:
[08 §4](08-rollout-and-runbook.md#4-the-first-ever-deploy-of-this-repo) requires
that a deploy problem and an online problem can never be the same problem.

### T-001 — First-ever Vercel deploy of the static repo ✅ deployed 2026-08-10 ◆

- **Deployed 2026-08-10.** Project `flywheel`, live at
  https://flywheel-woad.vercel.app, GitHub-connected — a push to `main`
  auto-deploys within a minute. The 🔑N2 handover blocker is cleared.
- **Done when:** the production URL serves `index.html`, three.js loads, and a
  campaign level is completable on a phone on cellular with a cold cache. (The
  deploy itself is done; the cold-cache phone/cellular check below is still
  worth doing explicitly before it's treated as verified.)
- **Touches:** Vercel project settings (framework preset *Other*, blank build
  command, output directory = repo root, no install command).
- **Depends on:** nothing but the handover — done.
- **Satisfies:** GWT-X08, GWT-102 (establishes the regression baseline that
  every later measurement is taken against).
- **Size:** S
- **Note:** take the GWT-102 cold-start measurement *here*, on this build, and
  write it down. It is the number every later "did online make it slower" claim
  is compared to, and it cannot be recovered once online code lands.

### T-002 — `vercel.json`: MIME, caching, CSP, security headers ◆

- **Done when:** `.js`/`.mjs` serve as `text/javascript`; `index.html` and
  `/online-config.json` are `no-cache`; `js/`, `css/`, `assets/` revalidate on a
  short TTL; `X-Content-Type-Options`, `Referrer-Policy`, and a CSP allowing the
  three.js CDN, the Supabase CDN, and the Supabase project origin
  (`connect-src` for REST + Realtime websocket) are present; no SPA catch-all
  rewrite exists.
- **Touches:** `vercel.json`, `.vercelignore` (exclude `.wiki/`, `docs/`,
  `tools/`, `CHANGELOG.md`, `STATUS.md`, `AGENTS.md`).
- **Depends on:** T-001
- **Satisfies:** GWT-X08, GWT-911 (a wrong CSP is a blank game, which is the
  failure this criterion forbids).
- **Size:** S
- **Note:** [12 §7.1](12-migration-plan.md#71-client-older-than-backend) — with
  no build step there are no content-hashed filenames, so revalidation *is* the
  cache-busting mechanism. A stale `js/main.js` against a fresh `index.html` at
  a booth is unfixable from the booth.

### T-003 — Vendor three.js and supabase-js to same-origin, with a hash guard ◆

- **Done when:** `/vendor/three-0.160.0.module.js` and
  `/vendor/supabase-js-2.45.4.js` are committed, the importmap carries both the
  CDN specifier and the `…/local` specifier for each, and
  `tools/validate.mjs` fails if either vendored file's SHA-256 differs from the
  recorded one.
- **Touches:** `index.html` (importmap), `vendor/`, `tools/validate.mjs`.
- **Depends on:** T-001
- **Satisfies:** GWT-911, GWT-X07, GWT-X08
- **Size:** S
- **Note:** [03 §5.2](03-technical-design.md#52-the-fallback-and-why-it-is-a-second-specifier)
  — mirroring **three.js** is the higher-value half. A CDN failure on three.js
  today is not a degraded game, it is a black screen, and that is a pre-existing
  single point of failure this feature merely exposes.

### T-004 — `js/replay.js`: the input-trace codec, pure ◆

- **Done when:** `encode`/`decode` for `rle-i8-v1` exist in one file with no
  three.js, no DOM, no `Math.random()`, importable unchanged from the browser,
  from Node, and from Deno.
- **Touches:** `js/replay.js`
- **Depends on:** nothing
- **Satisfies:** GWT-501, GWT-508, GWT-X07
- **Size:** M
- **Note:** format is specified in
  [03 §2.3](03-technical-design.md#23-runs-and-the-replay-trace). Two
  implementations of this format is exactly the bug nobody would ever find.

### T-005 — Record the trace in the fixed-step loop, always ◆

- **Done when:** every campaign and sandbox run appends its per-tick move to a
  preallocated `Int8Array` inside the existing `while (accumulator >= FIXED_DT)`
  loop, with no allocation, no branch on network state, and no measurable frame
  cost; recording happens online *and* offline.
- **Touches:** `js/main.js` (one line in the loop plus buffer lifecycle),
  `js/replay.js`.
- **Depends on:** T-004
- **Satisfies:** GWT-501, GWT-904, SYS-312
- **Size:** S
- **Note:** ships before validation exists, on purpose
  ([12 §9](12-migration-plan.md#9-order-of-operations) item 7): traces recorded
  early are the only honest tuning data the plausibility heuristics will ever
  get. The trace is **tick-indexed, never wall-clock** — see T-304 for why that
  is not a style preference.

### T-006 — ⚠ SPIKE: cross-engine floating-point determinism ◆

**This is the highest-priority task in the package after the deploy, and the one
that can invalidate an entire phase.**

- **Done when:** 100 real recorded traces (campaign and sandbox, from at least
  Chrome/V8, Safari/JavaScriptCore, and Firefox/SpiderMonkey on the hardware
  classes the booth will actually see) have been replayed in Deno and the
  divergence, if any, is characterised to the last bit — and a written decision
  is recorded in [03-technical-design.md](03-technical-design.md) §8 item 2
  choosing (a), (b), or (c) below.
- **Touches:** `tools/` (a throwaway harness), a Deno scratch function, and a
  written decision in 03 §8.
- **Depends on:** T-004, T-005
- **Satisfies:** GWT-503 (the criterion this spike exists to make achievable),
  GWT-504, GWT-505
- **Size:** M
- **Why it is a gate, stated plainly:** the pure sim calls `Math.hypot`,
  `Math.cos`, and `Math.sin`. IEEE-754 pins `+ - * /` and `sqrt` exactly, but
  ECMAScript explicitly permits **implementation-defined precision** for the
  transcendentals and for `hypot`. The sim has *threshold* branches (`isEdible`,
  `inMouth`, the `holeSpeed > 10.0` bounce gate) where a last-bit difference
  flips a branch and cascades. Determinism has held so far only because the
  validator and the game have ever been compared V8-to-V8
  ([09 §3.4](09-threat-model.md#34-modified-client-sim)). If a run recorded on an
  iPhone does not replay in Deno, `submit-run` rejects **honest players**, at a
  booth, in front of partners, and the symptom looks like an anti-cheat bug
  rather than a floating-point one. Discovering that in Phase 3 means rewriting
  Phase 3.
- **The three outcomes and what each costs:**
  - **(a) Proven bit-identical** across the engines present. Cheapest. Record
    the evidence and the engine list; the allow-list becomes a real constraint
    the client checks.
  - **(b) Bounded tolerance.** Widen `submit-run`'s comparison beyond the
    designed relative 1e-9 / absolute 1e-6. Cheap to implement, and it weakens
    the defence by exactly the width of the tolerance — record the width and the
    reason in 03 §8, not in a code comment.
  - **(c) Remove the implementation-defined calls.** The durable fix. The
    cheapest form touches only `sim.js`'s `Math.hypot` (replaceable by
    `Math.sqrt(x*x+z*z)`, exactly specified, consumes no RNG). The `cos`/`sin`
    in `citygen.js` and rival spawn placement are harder — changing them changes
    generated cities and forces a validator retune per ADR-0003's consequences.

### T-007 — Execute the determinism decision ◆

- **Done when:** whichever of T-006's (a)/(b)/(c) was chosen is implemented, and
  `node tools/validate.mjs` proves the property it claims.
- **Touches:** depends on the outcome — `js/sim.js` and a validator retune under
  (c); `supabase/functions/submit-run/` under (b); a documented engine allow-list
  and a client-side check under (a).
- **Depends on:** T-006
- **Satisfies:** GWT-503, GWT-X07
- **Size:** S under (a) or (b); L under (c) with a citygen change.
- **Note:** if (c) touches `citygen.js`, this task carries a full validator
  retune of all 100 levels and is the single largest risk to the Phase 0 exit
  gate. Budget for it the moment T-006 points that way.

### T-008 — The feature-flag module, fail-closed ◆

- **Done when:** one module exports a frozen flag object read once at boot;
  precedence is URL param → localStorage override → `/online-config.json`
  (AbortController-bounded at 1500 ms) → compiled default (**every flag
  false**); a missing, slow, malformed, or wrong-shaped config leaves every flag
  false; the fetch runs in parallel with the scene build and is never awaited
  before the first frame.
- **Touches:** `js/net/flags.js`, `online-config.json`, `js/main.js` (boot
  wiring only).
- **Depends on:** T-002
- **Satisfies:** GWT-1003, GWT-911, GWT-902, SYS-912
- **Size:** M
- **Note:** flags are specified in
  [08 §2.1](08-rollout-and-runbook.md#21-the-flags): `online`, `accounts`,
  `arena`, `boards`, `belts`, `submit`, `event_tag`, `room_cap`, `snapshot_hz`.
  `room_cap` and `snapshot_hz` are numeric on purpose — they are the two dials
  that convert "the arena is struggling" into "the arena is fine but slightly
  less smooth", without a deploy.

### T-009 — Validator guard: online code is not on the boot path ◆

- **Done when:** `tools/validate.mjs` walks the module graph reachable from
  `js/main.js` without the online entry point and fails on any `@supabase/`
  import or online-config reference; the guard fails hard if its glob matches
  zero files.
- **Touches:** `tools/validate.mjs`
- **Depends on:** T-008
- **Satisfies:** GWT-X07, GWT-X08, GWT-911
- **Size:** S
- **Note:** [07 §2.4](07-test-strategy.md#24-flags-off-equivalence--validateofflinefallback)
  calls this the cheapest test in the package guarding the most expensive
  failure. It is what stops someone importing Supabase at the top of `main.js`
  "just for a second" and making a CDN outage a blank game.

### T-010 — Validator guard: no secrets, ever, in anything served ◆

- **Done when:** `tools/validate.mjs` greps the served tree for `service_role`,
  the `sb_secret_` prefix, `GOCSPX-`, and a HubSpot-secret shape, and fails the
  run on a hit; `.env*` is confirmed gitignored; `.env.example` lists every name
  with empty values.
- **Touches:** `tools/validate.mjs`, `.gitignore`, `.env.example`
- **Depends on:** nothing
- **Satisfies:** GWT-X09, SYS-233
- **Size:** S
- **Note:** [09 §5.4](09-threat-model.md#54-the-service-role-key) — the repo has
  no build step, so every string in the client is literally in a committed file.
  That is a security advantage: a leak is visible in the diff. Make the check
  mechanical rather than remembered.

### T-011 — Append invariants 7–10 and the fourth ring to the docs ◆

- **Done when:** `AGENTS.md` carries invariants 7–10 verbatim from
  [03 §1.2](03-technical-design.md#12-the-new-non-negotiables);
  `.wiki/conventions.md` carries the three supporting rules (no `await` inside
  `frame()`, `Math.random()` stays banned in `js/net/`, one concern per file);
  `.wiki/architecture.md` gains the fourth ring and its `covers:` glob matches
  `js/net/**`.
- **Touches:** `AGENTS.md`, `.wiki/conventions.md`, `.wiki/architecture.md`,
  `STATUS.md`
- **Depends on:** T-008 (the first `js/net/` file)
- **Satisfies:** GWT-X07
- **Size:** S
- **Note:** 03 §1.2 requires this land **in the same commit as the first
  `js/net/` file**. Doing it later means a window in which the invariants are
  unwritten and the code is already there.

### T-012 — Hold the module path at `js/net/` ◆

- **Done when:** the code uses one path prefix and no doc has drifted back to
  the other spelling.
- **Touches:** whatever has drifted; nothing at the time of writing.
- **Depends on:** nothing
- **Satisfies:** GWT-X07 (a doc that names a path the repo does not have is a
  wiki-rot defect under `.wiki/conventions.md`)
- **Size:** S
- **The resolution, so nobody re-litigates it:**
  [03-technical-design.md](03-technical-design.md) owns the module plan and says
  **`js/net/`**. The `js/online/` spelling that appeared in 01 and
  [08](08-rollout-and-runbook.md) §2.1/§7.1 has been corrected to `js/net/`
  (2026-08-06 reconciliation pass); `js/net/flags.js` and `js/net/config.js` are
  the names. Separately,
  [06 §7](06-belts-and-achievements.md#7-belts-and-achievements-as-data)'s
  `js/meta/rules.js` is a real second directory and is kept — it is the
  belt/achievement predicate evaluator and it is not net-layer code.

### Phase 0 exit gate ◆

All of: production URL plays a level cold on cellular · `node tools/validate.mjs`
prints `ALL PASS` with T-003, T-009, T-010 in it · T-006's decision is written
down in 03 §8 and T-007 has executed it · every flag is false in
`online-config.json` and the game is indistinguishable from today's build.

---

## Phase 1 — Backend foundation

**Demonstrable at the end:** `supabase test db` is green, the Security Advisor
is clean or waived in writing, and a `curl` with the anon key against every
table returns exactly what the policy intends. The game has not changed.

### T-101 — Supabase project bootstrap and CLI link ✅ unblocked 2026-08-10 ◆

- **Credentials handed over 2026-08-10.** The `flywheel` Supabase project
  exists (ref `zrsrvhrkgfuqhcjnjezw`, region us-east-1, Pro plan — confirmed
  $25/month, not the $10 compute-credit figure from the earlier conversation)
  and its keys live in the repo's gitignored `.env.local`, with the variable
  names documented in `.env.example`. The 🔑N1 credential-handover blocker is
  cleared; what remains of this task is the CLI-link and migration work itself.
- **Done when:** the `flywheel` project is linked from the repo, `supabase/`
  exists with `config.toml`, migrations run cleanly against a fresh local
  Postgres, and the secret key lives only in Edge Function secrets.
- **Touches:** `supabase/config.toml`, `supabase/migrations/`
- **Depends on:** the handover of SETUP items 1, 2, 3 — done
- **Satisfies:** GWT-X09
- **Size:** S
- **Note:** [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md) §1 recommended Pro at
  $25/mo, because Free pauses a project after ~7 idle days and a sleeping
  project on the morning of day two is an outage; the project was created on
  Pro. [03
  §7.3](03-technical-design.md#73-the-realtime-message-math-which-is-the-whole-cost-question)
  still governs the `snapshot_hz` and `room_cap` defaults, and T-709 is what
  settles them.

### T-102 — Migration: subjects, profiles, guests, events ◆

- **Done when:** the four tables exist exactly as
  [03 §2.1–2.2](03-technical-design.md#21-the-subject-problem-solved-once)
  specifies, including the trigger that refuses to merge an already-merged
  subject, the `auth.users` email-mirror trigger, and the `events` row shape.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-101
- **Satisfies:** SYS-106, SYS-208, GWT-203, SYS-610
- **Size:** M
- **Note:** `subjects` is the reason a guest and a profile do not need nullable
  pairs on six tables. Get it right here or pay for it in every later migration.

### T-103 — Migration: runs, run_inputs, submission_log ◆

- **Done when:** `runs` carries all six verdicts, `stats jsonb`, and the four
  indexes from [03 §2.3](03-technical-design.md#23-runs-and-the-replay-trace);
  `run_inputs` is a separate table with `sha256` and `byte_len`;
  `submission_log` supports the Postgres-counted rate limit.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-102
- **Satisfies:** SYS-509, SYS-510, GWT-507, GWT-508
- **Size:** M

### T-104 — Migration: metrics, boards, board_entries, `fw_run_matches_board` ◆

- **Done when:** a board is a scope crossed with a metric, `filter jsonb` is
  evaluated by one SQL function that **fails closed on an unknown key**, rank is
  computed at read time by `row_number()` in a view and never stored, and the
  `AFTER UPDATE OF verdict` trigger upserts on improvement.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-103
- **Satisfies:** GWT-601 … GWT-605, SYS-609, SYS-610
- **Size:** L
- **Note:** a typo in a filter must produce an **empty** board, not a wrong one.
  That is the whole reason for fail-closed.

### T-105 — Migration: belts, belt_reigns, belt_changes, belt_contenders ◆

- **Done when:** `CREATE UNIQUE INDEX ON belt_reigns (belt_id) WHERE lost_at IS
  NULL` exists, `fw_settle_belts(run_id)` closes the outgoing reign and opens
  the incoming one in one transaction, `belt_changes` feeds the ticker, and
  `belt_contenders` holds a materialised top-10 per belt for instant re-award.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-104
- **Satisfies:** GWT-702, GWT-703, GWT-705, GWT-708, SYS-710, SYS-711
- **Size:** L
- **Note:** the unique partial index is the constraint that carries the whole
  system. A double-title bug at a booth in front of partners is not recoverable
  by explanation.

### T-106 — Migration: achievements, achievement_unlocks ◆

- **Done when:** the two tables exist, PK on (`achievement_id`, `subject_id`) so
  a re-unlock is a no-op upsert, and `criteria jsonb` is evaluated by
  `fw_eval_achievement`.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-103
- **Satisfies:** GWT-805, SYS-807, GWT-802
- **Size:** M

### T-107 — Migration: arena_rooms, arena_sessions, arena_participants ○→◆

- **Done when:** the three tables exist per
  [03 §2.7](03-technical-design.md#27-arena-rooms-and-sessions), including
  `host_session_id`, `host_generation`, and `attest_sha256`.
- **Depends on:** T-102
- **Satisfies:** SYS-311, SYS-407, GWT-307
- **Size:** M
- **Note:** the schema lands in Phase 1 with everything else (a schema change
  during Phase 6 is a migration against live data). The *code* is Phase 6.
  Release-blocking only because Phase 6 is.

### T-108 — Migration: leads, consents, oauth_state, claim_tokens, linked_identities, moderation, ops_events ◆

- **Done when:** consent is an append-only ledger with `policy_version` and
  `evidence`; `handle_blocklist` and `profiles.moderation_state` exist;
  `ops_events` accepts client error reports (insert-only for every role);
  `oauth_state` and `claim_tokens` are single-use with a TTL.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-102
- **Satisfies:** GWT-X10, GWT-1004, SYS-233
- **Size:** M
- **Note:** `leads` is separated from `profiles` on purpose — a profile is *how
  you play*, a lead is *permission to contact you*, and the two must be
  deletable independently.

### T-109 — RLS on every table, plus the read-only views ◆

- **Done when:** RLS is enabled on every table in the schema; policies match the
  intent table in [03 §2.10](03-technical-design.md#210-rls-policy-intent) and
  the one in [09 §5.1](09-threat-model.md#51-table-by-table); `v_board_top`,
  `v_board_me`, `v_belt_current`, and the public profile view exist with
  `security_invoker = true` and expose no email under any traversal; **no client
  role has insert or update on `runs`**, and **no role but service has any
  access to `run_inputs`**.
- **Touches:** `supabase/migrations/`
- **Depends on:** T-102 … T-108
- **Satisfies:** GWT-X09, SYS-510, SYS-511, GWT-504
- **Size:** L
- **Note:** every INSERT/UPDATE policy needs a `with check`, not just a `using`.
  A missing `with check` is the classic hole that lets a row be inserted for
  someone else.

### T-110 — pgTAP RLS suite, written from the attacker's seat ◆

- **Done when:** `supabase test db` runs a suite under `supabase/tests/` that,
  for every table × every role, asserts the *denials* — anon cannot read email
  or company, a signed-in user cannot `UPDATE runs SET score`, cannot insert a
  run for another subject, cannot write `belts` at all, and a revoked JWT gets
  nothing — plus a loop over `pg_tables` asserting `rowsecurity = true` on every
  table.
- **Touches:** `supabase/tests/`
- **Depends on:** T-109
- **Satisfies:** GWT-X09, SYS-511
- **Size:** M
- **Note:** the `pg_tables` loop is the highest-value four lines of SQL in the
  package. The real-world failure is not a bad policy, it is a table someone
  added in week three and forgot to enable RLS on.

### T-111 — Seed data: the event, the metrics, the boards, the twelve belts, the achievements ◆

- **Done when:** `unbound-2026` exists as a row; the metrics registry from
  [06 §7](06-belts-and-achievements.md#7-belts-and-achievements-as-data) is
  seeded; the four board scopes are rows; the twelve UNBOUND belts from
  [06 §3](06-belts-and-achievements.md#3-belts-and-the-four-board-scopes) exist
  with qualifiers and directions; the 58 achievements from
  [06 §6](06-belts-and-achievements.md#6-achievements) are inserted with their
  card positions and visibility.
- **Touches:** `supabase/seed.sql`
- **Depends on:** T-104, T-105, T-106
- **Satisfies:** GWT-701, GWT-707, GWT-806, SYS-807, GWT-601 … GWT-604
- **Size:** M
- **Note:** GWT-707 is proved by this task being **data only**. If seeding a
  belt requires touching a `switch`, the belt system is hardcoded and the
  criterion fails.

### T-112 — `js/meta/rules.js`: the predicate evaluator, pure ◆

- **Done when:** one module with no three.js, no DOM, and no `Math.random()`
  evaluates a belt/achievement predicate (`>=`, `<=`, `==`, `in`,
  `bitmask_all`, `all`/`any`) against a metrics object; it is imported unchanged
  by the browser, by the Edge Function, and by `tools/validate.mjs`.
- **Touches:** `js/meta/rules.js`
- **Depends on:** nothing (pure; can start on day one, in parallel with anything)
- **Satisfies:** GWT-802, GWT-805, SYS-807, GWT-X07
- **Size:** M
- **Note:** resist growing the language. Two or three special cases in code are
  cheaper than a query engine, and `criteria: {"manual": true}` is the escape
  hatch for the rest.

### T-113 — Validator: catalogue sanity and belt-evaluation properties ◆

- **Done when:** `tools/validate.mjs` imports `js/meta/rules.js` and asserts —
  every rule references a metric that exists, every belt has a qualifier, no
  achievement is unreachable, no two belts at one scope share a
  metric-and-direction; plus, over a synthetic run ledger: exactly one holder per
  belt, total tie-breaks, order independence under a seeded shuffle, reign
  monotonicity, scope isolation across all four scopes, achievement idempotency,
  and a synthetic belt row that no code knows about still evaluating.
- **Touches:** `tools/validate.mjs`
- **Depends on:** T-112
- **Satisfies:** GWT-701, GWT-705, GWT-707, GWT-805, GWT-X07
- **Size:** M
- **Note:** the shuffle test catches the "first row wins" bug that only shows up
  once Postgres changes its plan — which it will, on the day the table gets big.

### T-114 — Retention jobs (`pg_cron`) ○

- **Done when:** the nightly job implements the retention table in
  [03 §2.9](03-technical-design.md#29-retention) and
  [09 §6.5](09-threat-model.md#65-retention-after-the-conference).
- **Depends on:** T-103, T-108
- **Satisfies:** GWT-X10
- **Size:** S
- **Note:** the *schedule* must be written and dated before the event; the cron
  job itself can land after. That split is 09's own recommendation (§8, item 19).

### Phase 1 exit gate ◆

`supabase test db` green · Security Advisor clean or waived **in writing** ·
`node tools/validate.mjs` still `ALL PASS` · an anon `curl` against every table
returns exactly the policy's intent, verified per table rather than sampled.

---

## Phase 2 — Guest identity and the save migration

**Demonstrable at the end:** a first-time visitor types a handle, plays, and
their guest identity and v14 save survive a reload — with every online flag
still off, the game is indistinguishable from Phase 0. This phase is where the
historical `sandbox` bug lives, and it gets its own commits.

### T-201 — Save v13 → v14: `defaultCloud()`, `freshSave()`, `MIGRATIONS[13]` ◆

- **Done when:** `CURRENT_VERSION` is 14; `cloud` is present in **both**
  `freshSave()` and `MIGRATIONS[13]` via a shared `defaultCloud()`; the coin
  ledger is seeded (`coinsSpent = sum(price of ownedItems)`,
  `coinsEarned = coins + coinsSpent`); every reader of `cloud` re-establishes its
  own container the way `recordSandboxResult` does.
- **Touches:** `js/save.js`
- **Depends on:** nothing
- **Satisfies:** SYS-106, SYS-107, GWT-104, GWT-X07
- **Size:** S
- **Note:** **this task ships alone, in a commit with nothing else in it.**
  [12 §1.4](12-migration-plan.md#14-the-drift-trap-stated-for-whoever-writes-the-migration)
  spells out why: `cloud` is the same shape of key `sandbox` was, and getting it
  wrong strands *every player who installs after this ships* — i.e. everyone at
  UNBOUND, the entire audience this feature exists for.

### T-202 — Validator: nested container parity, no-secrets, quarantine round-trip ◆

- **Done when:** `validateSaveSchema()` compares inner key sets for a **list** of
  container keys (`settings`, `cloud`, and whatever comes fourth) rather than a
  copy-pasted block; a walk of the fresh save and the end-of-chain save fails on
  any key matching `/token|jwt|email|password|secret|apikey|access|refresh/i`;
  and a v99 save, a truncated JSON string, and `{}` each write the quarantine
  key and return a fresh save.
- **Touches:** `tools/validate.mjs`
- **Depends on:** T-201
- **Satisfies:** GWT-X07, GWT-X10
- **Size:** M
- **Note:** the quarantine path exists today as code with no test, and
  [12 §8](12-migration-plan.md#8-rollback) makes it load-bearing for rollback.
  It stops being acceptable to leave it unproven.

### T-203 — `mergeProgress(local, cloud)`: pure, with property tests ◆

- **Done when:** the merge implements
  [12 §3.3](12-migration-plan.md#33-field-by-field-merge-rules) field for field
  (`max`/`min`/union/OR, coins via the two-sided ledger, settings **not synced**),
  and `tools/validate.mjs` asserts it is **idempotent**, **commutative** on every
  synced field, **monotone** on every field that must never regress, and **total**
  over the key set (output key set equals `freshSave()`'s exactly) across a
  generated matrix of presence × recency.
- **Touches:** `js/net/sync-merge.js` (pure), `tools/validate.mjs`
- **Depends on:** T-201
- **Satisfies:** GWT-202, GWT-207, GWT-104, GWT-X07
- **Size:** M
- **Note:** ships with **no caller** ([12 §9](12-migration-plan.md#9-order-of-operations)
  item 3). The join-semilattice property is what makes offline queues, retries,
  duplicate pushes, and kiosk resets non-events; the property test is the only
  thing that keeps it true after the fourth field is added.

### T-204 — `js/net/client.js`: lazy loader, fallback, online state, timeouts ◆

- **Done when:** supabase-js is dynamically imported on first use with the
  CDN → same-origin fallback; the module owns `isOnline()` / `whenOnline()` /
  `client()`; **every** call has a bounded timeout (4 s reads, 10 s
  `submit-run`) with a defined non-network behaviour; a captive-portal response
  is treated as a failure.
- **Touches:** `js/net/client.js`
- **Depends on:** T-003, T-008
- **Satisfies:** GWT-907, GWT-909, GWT-911, SYS-912
- **Size:** M
- **Note:** a call with no timeout is a review-blocking defect in this feature.
  Nothing else in `js/net/` may import supabase-js.

### T-205 — `js/net/identity.js`: guest id, anonymous sign-in, `currentSubject()` ◆

- **Done when:** a device-scoped guest id is minted with `crypto.randomUUID()`
  and stored in the save; Supabase anonymous sign-in gives the guest a real JWT
  (which is what makes RLS work for them at all); `currentSubject()` resolves
  through `merged_into`; the handle is validated client-side (3–16 chars,
  charset, NFKC, confusable folding) with inline rejection and focus return.
- **Touches:** `js/net/identity.js`
- **Depends on:** T-102, T-204
- **Satisfies:** GWT-101, GWT-103, GWT-105, SYS-106, SYS-107
- **Size:** M

### T-206 — Server-side handle pipeline: blocklist, protected terms, safe default ◆

- **Done when:** an Edge Function is the only writer of a display name; it
  leet-folds before matching a profanity list, rejects protected terms
  (`hubspot`, `unbound`, `admin`, `moderator`, `official`, `staff`, `support`,
  sponsor names) including punctuation-stripped variants, rejects confusable
  collisions with an existing handle, and returns a plain "that name isn't
  available"; a player who types nothing gets a curated generated handle.
- **Touches:** `supabase/functions/set-handle/`, `handle_blocklist` seed
- **Depends on:** T-108, T-205
- **Satisfies:** GWT-105, GWT-1004
- **Size:** M
- **Note:** [09 §6.1](09-threat-model.md#61-the-big-screen-problem) — fewer typed
  names is less moderation surface, which is why the generated default is a
  mitigation and not a nicety.

### T-207 — `js/net/outbox.js`: the durable offline queue ◆

- **Done when:** the queue lives in `localStorage` under `flywheel-outbox`,
  capped at 20 items or 1 MB; drains on `online`, on tab focus, on any successful
  call, and on a 60 s timer; backs off 2 s / 8 s / 30 s / 2 min / 10 min / hourly;
  never blocks the UI, never shows a modal, never retries a
  `retryable: false` error; survives a browser restart.
- **Touches:** `js/net/outbox.js`
- **Depends on:** T-204
- **Satisfies:** GWT-904, GWT-905, GWT-906, GWT-507, SYS-913
- **Size:** M

### T-208 — `js/net/sync.js` plus the server-side monotonic upsert ◆

- **Done when:** boot pulls the cloud profile if `cloud.userId` is set, merges it
  into local with T-203, and pushes the merged result; `cloud.lastPushHash`
  skips no-op pushes; and the **server** re-applies the same monotonic rules in
  SQL so a client that pushes a regressed value cannot lower a stored best.
- **Touches:** `js/net/sync.js`, `supabase/functions/sync-profile/` (or an RPC)
- **Depends on:** T-203, T-205
- **Satisfies:** GWT-202, GWT-206, SYS-107, SYS-913
- **Size:** M
- **Note:** client-side merge is for correctness; server-side monotonicity is for
  trust. Never rely on the client to have merged honestly.

### T-209 — Title-screen surfaces: handle field, offline chip, single PLAY ◆

- **Done when:** a first-time visitor sees a pre-filled suggested handle and a
  single PLAY control with **no sign-in step reachable** on that path; a quiet,
  non-alarming offline indicator appears when offline; online entry points
  explain plainly that they need a connection; cold-start time does not regress
  against T-001's measurement.
- **Touches:** `js/ui/screens.js`, `js/ui/screens-online.js`
- **Depends on:** T-205, T-008
- **Satisfies:** GWT-101, GWT-102, GWT-903, GWT-902, GWT-X01, GWT-X06
- **Size:** M
- **Note:** UI work routes through the frontend-design assets and consumes the
  shared `--fw-*` tokens and `.fw-*` primitives. No screen reimplements the
  outline-ring or extrude-shadow stack locally (ADR-0005, GWT-X06).

### Phase 2 exit gate ◆

A guest plays, reloads, and keeps their handle and progress · `ALL PASS` with
T-202 and T-203's property tests · with flags off, the build is still
indistinguishable from Phase 0 · the GWT-102 cold-start measurement has not
regressed.

---

## Phase 3 — Score submission and replay validation

**Demonstrable at the end:** finish a run, see the score instantly, and watch a
verdict arrive a moment later. Alter the score in the console and watch it be
rejected, neutrally, with the run retained for inspection.

### T-301 — `js/net/submit.js`: build a submission from a finished sim ◆

- **Done when:** on `endLevel` / `endSandbox` the submission carries seed, mode,
  scope tags, the encoded input trace, the claimed metrics, and a
  client-generated `client_run_id`; it goes to the outbox, not to the network;
  the results screen renders immediately and waits on nothing.
- **Touches:** `js/net/submit.js`, `js/main.js` (call site only)
- **Depends on:** T-004, T-005, T-207
- **Satisfies:** GWT-501, GWT-506, GWT-904
- **Size:** M

### T-302 — `submit-run`: the anti-cheat door ◆

- **Done when:** the function implements
  [03 §3.1](03-technical-design.md#31-edge-functions) step for step — subject
  from JWT (no unauthenticated path), idempotency on `client_run_id`, cheap
  rejects before any work (64 KB, tick/duration equality, 20-minute cap, unknown
  mode, non-canonical seed), Postgres-counted rate limits, `unverifiable` on sim
  version skew with **no cross-version replay attempted**, replay against the
  same `js/` modules the browser ran, comparison at the tolerance T-007 fixed,
  and one transaction writing `runs` + `run_inputs`.
- **Touches:** `supabase/functions/submit-run/`
- **Depends on:** T-007, T-103, T-109, T-301
- **Satisfies:** GWT-502, GWT-503, GWT-504, GWT-507, GWT-508, SYS-509, SYS-510
- **Size:** L
- **Note:** a false `mismatch` accusing a player at a booth is worse than an
  unranked run. That is why version skew is `unverifiable`, not `mismatch`, and
  why T-006 had to be answered before this task started.

### T-303 — Validator: single-source guard on the scorer ◆

- **Done when:** `tools/validate.mjs` asserts the Edge Function's scoring entry
  point imports the same relative paths the browser does, and that no second
  copy of the scoring or belt logic exists anywhere in the tree.
- **Touches:** `tools/validate.mjs`
- **Depends on:** T-302
- **Satisfies:** GWT-502, GWT-X07
- **Size:** S
- **Note:** a forked scorer is an anti-cheat system that disagrees with the game,
  and it will be discovered by a player, publicly.

### T-304 — Validator: replay determinism, tick-indexing, codec, tamper ◆

- **Done when:** `tools/validate.mjs` replays a recorded fixture and reproduces
  its score to full precision; replays the same trace with the harness stepping
  **1, 2, 4, and 6 ticks per simulated frame** and gets an identical result;
  replays it again with the step budget **changing partway through the run**
  (6 → 1 → 6 and 1 → 6 → 1, transitions mid-trace) and gets the same result
  again; round-trips the codec over empty / single-tick / max-length / all-same /
  all-different fixtures; and **rejects** (never clamps) a truncated tail, a
  flipped byte, an out-of-order tick, a duplicate tick, an out-of-range steering
  value, and an over-length trace. Brooklyn and Boston both covered.
- **Touches:** `tools/validate.mjs`
- **Depends on:** T-004, T-302
- **Satisfies:** GWT-503, GWT-508, GWT-X07
- **Size:** M
- **Note:** the sub-step test is the reason to record traces in ticks.
  `js/quality.js` gives LOW `maxSubSteps: 2` and HIGH `6` — a strict
  player-chosen binary, no classifier, no watchdog (commit `b9af8bf`,
  2026-08-08) — and `js/main.js` *drops* unaffordable accumulator debt, so a
  LOW-tier device advances fewer sim ticks per wall-second than a HIGH-tier
  one. A wall-clock trace would flag those players as cheats, and the failure
  would look like an anti-cheat bug rather than a clock bug. There is no
  watchdog to move the tier automatically anymore, but a player flipping
  SETTINGS mid-match still produces the mid-run-change case above, and that is
  the one to expect on a warm booth laptop where the operator drops it to LOW
  by hand. See [07](07-test-strategy.md) §2.2 and [09](09-threat-model.md)
  §3.5.

### T-305 — Measure a Boston sandbox replay in Deno ⚠ ◆

- **Done when:** p95 replay wall-time for a 3-minute Boston run is measured on
  the production instance (min-of-N, N ≥ 5, quiet machine, per
  [07 §10](07-test-strategy.md#10-measurement-discipline)) and written into
  03 §8 item 1.
- **Depends on:** T-302
- **Satisfies:** GWT-506
- **Size:** S
- **Gate:** if p95 > 5 s, T-306 becomes mandatory rather than preferred.

### T-306 — Asynchronous verification for the expensive replays ◆(conditional)

- **Done when:** sandbox and arena submissions write `pending`, return
  immediately with a "verifying" chip, and a `pg_cron` worker invoking the
  function in verify-only mode clears them within a minute; campaign runs stay
  synchronous.
- **Touches:** `supabase/functions/submit-run/`, a cron job, results-screen chip
- **Depends on:** T-305
- **Satisfies:** GWT-506, GWT-607
- **Size:** M
- **Note:** this is a one-flag difference in the same function and it is the
  difference between a feature that scales and one that times out on stage.

### T-307 — Verdict UX: instant result, neutral rejection ◆

- **Done when:** the result is shown before any server round trip; a rejected
  run produces a neutral, non-accusatory message revealing nothing about which
  check failed; a pending or rejected run appears on no board.
- **Touches:** `js/ui/screens.js`, `js/ui/screens-online.js`
- **Depends on:** T-302
- **Satisfies:** GWT-505, GWT-506, GWT-607
- **Size:** S

### T-308 — End-to-end trigger wiring: verdict → boards → belts → achievements ◆

- **Done when:** flipping a run to `verified` in the database alone updates
  `board_entries`, settles belts through `fw_settle_belts`, emits a
  `belt_changes` row, and grants achievements — all inside one transaction, and
  provably twice-safe against a duplicate submission.
- **Touches:** `supabase/migrations/` (trigger wiring), integration check
- **Depends on:** T-104, T-105, T-106, T-302
- **Satisfies:** GWT-507, GWT-605, GWT-702, GWT-802, SYS-710, SYS-711
- **Size:** M

### T-309 — Plausibility screening as flags, not rejections ○

- **Done when:** the Edge Function computes tick-count equality, direction
  reversal rate, heading entropy, and zero-input fraction, and writes a
  `flagged` review state that excludes a run from *displayed* boards without
  accusing anyone; thresholds live server-side only.
- **Depends on:** T-302
- **Satisfies:** GWT-505, GWT-607
- **Size:** M
- **Note:** [09 §8](09-threat-model.md#8-prioritised-mitigations) item 16 — ship
  the **column and the filtering** before the event; the scoring can arrive
  later.

### Phase 3 exit gate ◆

A run played in a browser is replayed in Deno and the recomputed metrics equal
the claimed metrics exactly (GWT-503) · a console-altered score is rejected and
retained · the same submission delivered twice produces exactly one row ·
`ALL PASS` with T-303 and T-304 in it.

---

## Phase 4 — Boards, belts, achievements

**Demonstrable at the end:** the Titantron shows twelve champions with ticking
reign clocks, and a run that takes a belt produces the NEW CHAMPION card on the
kiosk and interrupts the big screen at the same moment.

### T-401 — `js/net/boards.js`: catalogue, top-N, your rank, SWR cache ◆

- **Done when:** the board catalogue, `v_board_top`, and `v_board_me` are
  fetched with the cache windows in
  [03 §3.2](03-technical-design.md#32-direct-postgrest-calls), and a player
  ranked below the visible page has their own row surfaced without scrolling.
- **Touches:** `js/net/boards.js`
- **Depends on:** T-104, T-109, T-204
- **Satisfies:** GWT-601 … GWT-606
- **Size:** M

### T-402 — `js/net/belts.js`: state, reign formatting, change ticker ◆

- **Done when:** current holders, reign lengths, defence counts, and the
  `belt_changes` feed are available to the UI; the booth screen subscribes to
  Postgres Changes and everything else polls.
- **Depends on:** T-105, T-401
- **Satisfies:** GWT-701, GWT-703, GWT-709
- **Size:** M

### T-403 — `js/net/achievements.js`: local evaluation, server reconciliation ◆

- **Done when:** the client evaluates the same `js/meta/rules.js` criteria
  locally for instant toasts (offline included), and reconciles against the
  server's grants on next sync — server wins, the local unlock is dropped
  silently, and a toast that already fired is never taken back on screen.
- **Depends on:** T-112, T-106, T-208
- **Satisfies:** GWT-801, GWT-803, GWT-805, GWT-802
- **Size:** M

### T-404 — `js/ui/screens-online.js`: boards screen and the Locker Room ◆

- **Done when:** the boards screen renders all four scopes with a purposeful
  empty state (never a blank panel, never a spinner); the Locker Room shows
  belts held with live reign clocks, past reigns with dates and defence counts,
  the 58 achievements grouped by section with unearned ones visible and secrets
  as `???`, and the career panel.
- **Depends on:** T-401, T-402, T-403
- **Satisfies:** GWT-608, GWT-701, GWT-709, GWT-806, GWT-X01, GWT-X06
- **Size:** L

### T-405 — Results screen: the belt check, the gap, RUN IT BACK ◆

- **Done when:** the results screen grows one section below the stars and coins
  that shows a took-a-belt card per belt, a missed-a-belt line with the standing
  number **and the gap**, a defence line, and an achievements strip — and
  **never blocks CONTINUE or CITIES**, rendering from whatever data it has,
  including none.
- **Touches:** `js/ui/screens.js`
- **Depends on:** T-402, T-403, T-307
- **Satisfies:** GWT-701, GWT-702, GWT-706, GWT-801, GWT-902
- **Size:** M
- **Note:** both hard rules here were learned from the `sandbox` bug in
  `save.js`. A player must always be able to leave the results screen, network
  or no network, belt data or no belt data.

### T-406 — The belt-change celebration ◆

- **Done when:** a real title change (never a defence, never a near miss, never
  the Iron Sprocket) plays the ~2.5 s block-letter sequence, skippable with any
  input, announced to assistive technology **once**, honouring the existing
  reduced-motion setting and the OS preference through the same setting the game
  already reads.
- **Touches:** `js/ui/screens-online.js`, `js/ui/blockword.js` consumers
- **Depends on:** T-405
- **Satisfies:** GWT-704, GWT-X02, GWT-X03, GWT-X06
- **Size:** M

### T-407 — The Titantron ◆

- **Done when:** a read-only anonymous session with no claim UI cycles the wall
  of twelve champions, the live arena spectator view, interrupting title
  changes, the 24/7 clock with the day's shortest reign, and OPEN CHALLENGE
  after 60 quiet minutes — with a visible "last updated" timestamp so a stalled
  board is obvious from across the aisle.
- **Depends on:** T-402, T-404
- **Satisfies:** GWT-1001, GWT-1004, GWT-704
- **Size:** L
- **Note:** the arena panel lands with Phase 6; ship the rest first and leave the
  slot.

### T-408 — Accessibility and brand-token pass on every new screen ◆

- **Done when:** every new screen is fully keyboard-operable with visible focus,
  moves focus to the first error on a failed submit, traps focus correctly in
  modals, passes contrast against the brand palette in both plate and in-game
  overlay contexts, contains no em-dash or en-dash in any user-facing string,
  and consumes only the shared `--fw-*` / `.fw-*` layer.
- **Depends on:** T-404, T-405, T-406, T-407
- **Satisfies:** GWT-X01, GWT-X02, GWT-X03, GWT-X04, GWT-X05, GWT-X06
- **Size:** M
- **Note:** run this as a gate at the end of the phase and again after Phase 5's
  and Phase 6's screens land — it is per-surface, and two of the surfaces do not
  exist yet.

### T-409 — Retroactive seeding: achievements generous, boards excluded ◆

- **Done when:** at first sign-in, progress-shaped achievements unlock all at
  once from the imported local history; historical local bests appear as
  personal history on level select, profile, and campaign UI; and they enter
  **no** ranked board and **no** belt.
- **Depends on:** T-403, T-208
- **Satisfies:** GWT-804, GWT-607, SYS-609
- **Size:** M
- **Note:** the framing to the player is verification, not loss —
  [12 §6.4](12-migration-plan.md#64-what-existing-players-are-told-and-what-they-get-instead).
  A player with 60 levels of history is the best-equipped person in the room to
  fill a fresh board fast.

### T-410 — Belt re-award when a run is stripped ◆

- **Done when:** marking a run `rejected` closes its reign with
  `outcome = 'stripped'`, leaves it in the lineage named as stripped, and
  re-awards the belt from `belt_contenders` in one lookup — or vacates it if the
  list is empty above the qualifier.
- **Depends on:** T-105, T-308
- **Satisfies:** GWT-708, SYS-710
- **Size:** M

### Phase 4 exit gate ◆

All four scopes render and are not empty · a new top score changes the holder
within the expected window and the reign clock reads correctly · the big screen
is legible at real viewing distance with a live "last updated" · T-408 passes.

---

## Phase 5 — Account claim, in risk order

Email OTP first because it has **zero third-party dependency** and still
captures the lead. Google second. HubSpot last, behind a flag, with its fallback
built *before* the real thing.

### T-501 — The claim screen ◆

- **Done when:** the claim prompt appears **after** the result is visible and
  never blocks replaying or leaving; the two social buttons sit above the form;
  first/last/email/company are separate fields; both consent checkboxes are
  unticked and non-blocking; "Not now — keep playing" is the same size and
  weight as "Claim my runs"; every prefix-locked field carries its adornment so
  a "must start with…" error is never shown.
- **Touches:** `js/ui/screens-online.js`
- **Depends on:** T-209
- **Satisfies:** GWT-201, GWT-203, GWT-204, GWT-X01, GWT-X10
- **Size:** M
- **Note:** [05 §5](05-identity-and-accounts.md#5-lead-capture-and-consent)'s
  forbidden list is normative: no pre-ticked boxes, no bundling, no greyer "Not
  now", no re-prompt after a second decline, no interstitial before gameplay.

### T-502 — Email OTP ◆

- **Done when:** `signInWithOtp` is called **while holding the existing
  anonymous session** so the claim is retroactive; a 6-digit code (never a magic
  link) arrives; a wrong or expired code produces an inline message with focus
  returned and nothing lost; resend appears after a 60 s cooldown alongside an
  alternative path; **no unverified email is ever stored**.
- **Depends on:** T-501, T-205
- **Satisfies:** GWT-210, GWT-211, GWT-212, GWT-202
- **Size:** M

### T-503 — `claim-guest`: the merge, both cases ◆

- **Done when:** case A (empty cloud) adopts the local save wholesale, silently;
  case B (both sides have progress) always asks first, in plain language, with
  refusing as the safe option; the subject is merged by repointing
  `merged_into`, never by rewriting history rows; boards and belts are
  recomputed for the surviving subject; the whole thing is idempotent.
- **Touches:** `supabase/functions/claim-guest/`, `js/net/identity.js`
- **Depends on:** T-102, T-203, T-502
- **Satisfies:** GWT-202, GWT-207, SYS-208
- **Size:** L
- **Note:** the dialog inverts the usual instinct — we are confirming an
  *acquisitive* action, because acquiring someone else's history is the
  destructive outcome here.

### T-504 — Google sign-in 🔑N3 ◆

- **Done when:** `linkIdentity({ provider: 'google' })` attaches to the existing
  anonymous session; scopes are `openid email profile` and nothing else; the
  player returns to the screen they left (restored from a `sessionStorage`
  breadcrumb) with name and email prefilled and company left to them; cancelling
  at the provider returns them as a guest, on the same screen, with the run
  intact and no error styling.
- **Depends on:** T-501, the handover of SETUP items 6 and 7
- **Satisfies:** GWT-220, GWT-221, GWT-202
- **Size:** M
- **Note:** consent still happens after the redirect, unticked. A Google click is
  not marketing consent.

### T-505 — The HubSpot fallback, built first ◆

- **Done when:** with `identity.hubspot_oauth = off`, the "Continue with
  HubSpot" button opens the claim form with an "I'm a HubSpot partner" toggle
  preset and company promoted to prominent-but-optional; verification is email
  OTP; the lead records `hubspot_partner_self_declared = true`.
- **Depends on:** T-502
- **Satisfies:** GWT-232, GWT-231
- **Size:** S
- **Note:** this is the task that makes T-506 droppable. Build it before, not
  after.

### T-506 — HubSpot custom OAuth broker 🔑N4 ○

- **Done when:** `auth-hubspot-start` mints a single-use, TTL'd, session-bound
  `state` with PKCE and 302s to HubSpot with scope `oauth` **only**;
  `auth-hubspot-callback` validates state, exchanges the code server-side,
  verifies the token's app id against ours before trusting any claim, attaches
  the verified email to the *existing* user via the admin API, records the
  linkage, and returns a one-time token the browser exchanges for an ordinary
  Supabase session; the access token is used once and never stored; the client
  secret never leaves Edge Function secrets.
- **Depends on:** T-505, the handover of SETUP items 8, 9, 10, and a stable
  custom domain (SETUP §5)
- **Satisfies:** GWT-230, GWT-231, SYS-233
- **Size:** L
- **Note:** flagged ○ deliberately.
  [05 §2.3](05-identity-and-accounts.md#23-hubspot-oauth--custom-flow-highest-risk-in-the-package)
  and [09 §7.4](09-threat-model.md#74-hubspot--the-highest-risk-path) both say
  the same thing: **if it is not solid a week before the event, ship without
  it.** A broken custom OAuth flow in front of HubSpot partners is worse than
  its absence. Note also that HubSpot requires byte-exact redirect URIs, so this
  path can never work on an ad-hoc Vercel preview — it needs the custom domain
  from day one.

### T-507 — Sign-out purge, the who-is-playing chip, round-start attribution ◆

- **Done when:** signing out returns the player to guest play, pushes any
  pending runs, clears the local save (the cloud copy is the backup), and
  destroys the session everywhere; a visible "who is playing" chip appears on
  every screen once signed in; a submission carries the JWT of the session
  established **at round start**, and a session change mid-round discards the
  round rather than re-attributing it.
- **Depends on:** T-503
- **Satisfies:** GWT-205, GWT-X10
- **Size:** M

### T-508 — Multi-device sign-in ◆

- **Done when:** signing in on a second device shows the profile, achievements,
  and belts there, with settings deliberately not synced.
- **Depends on:** T-208, T-503
- **Satisfies:** GWT-206
- **Size:** S

### T-509 — Data export and delete-my-account ○

- **Done when:** an Edge Function returns the player's own rows as JSON, and a
  Settings action hard-deletes auth user, profile, linked identities, consents,
  and runs while **vacating rather than erasing** belt reigns.
- **Depends on:** T-108, T-503
- **Satisfies:** GWT-X10
- **Size:** M
- **Note:** before the event, the *process* (an address that reaches a human who
  can run it) is enough. The build satisfies both the GDPR access obligation and
  [12 §8.2](12-migration-plan.md#82-the-rollback-that-is-actually-safe-in-order-of-escalation)'s
  pre-retirement export, which is why it is worth building before it is urgent.

### T-510 — `lead-sync` into HubSpot CRM — NOT BUILT, surfaced ⚠

- **Status:** [00 §Scope line](00-objective-overview.md#scope-line-pencil-test)
  classifies piping captured leads into the HubSpot CRM as a **pen** — a new
  external system, new credentials, new data-handling obligations — and
  explicitly does not build it. [03 §3.1](03-technical-design.md#31-edge-functions)
  lists a scheduled `lead-sync` function. **The overview wins.** What ships is
  the `leads` table, the consent join, and CRM-shaped columns; the sync job is
  Nico's call, after UNBOUND.
- **Depends on:** T-108 (the seam)
- **Satisfies:** nothing in 02 — it is out of scope by
  [02 §Out of scope](02-requirements.md#out-of-scope).
- **Size:** — (not scheduled)

### Phase 5 exit gate ◆

Guest progress merges on first sign-in with no coin or unlock decrease · OTP and
Google round trips complete on the stable preview alias and on production ·
cancel/deny returns to the game on both · sign out, reload, and **no previous
player's name, email, belt, or session remains** — repeated twice, because the
second player is the one who gets the leak.

---

## Phase 6 — The live arena

**Demonstrable at the end:** two kiosks and a phone in one room, racing the same
Brooklyn, and closing the host's laptop lid does not end the match.

### T-601 — `js/net/snapshot.js`: the wire codec and every constant ✅ done 2026-08-10 ◆

- **Shipped 2026-08-10** as designed: binary snapshot/intent/keyframe codecs, a
  `MAX_PLAYERS` constant, encode/decode as pure functions of state, no
  Supabase import, no three.js. `tools/net-match-selftest.mjs` round-trips it
  as part of the 48-check suite (below).
- **Done when:** the binary snapshot / intent / keyframe formats from
  [04 §4.1](04-netcode-design.md#41-wire-format) encode and decode as a pure
  function of state, with the constant block from
  [04 §13](04-netcode-design.md#13-constants-in-one-place) in this one file, no
  Supabase import, no three.js, and a validator round-trip test.
- **Touches:** `js/net/snapshot.js`, `tools/validate.mjs`
- **Depends on:** nothing (pure; parallelizable from day one)
- **Satisfies:** SYS-310, SYS-312, GWT-X07
- **Size:** M

### T-602 — `arena-open`, `arena-join`, quick join — not started ◆

- **Still open.** T-603 shipped a **client-side, host-minted** substitute (a
  5-char code and a `deriveSeed(code)` derivation, no Edge Function, no
  server-side capacity check) that carries the same UNBOUND demo today but
  does not satisfy this task: no server-minted seed, no atomic capacity UPDATE,
  no build-version-mismatch spectator path, no quick join. `js/net/arena.js`'s
  own file comment names the swap explicitly — "when `arena-open` lands,
  `createRoom` swaps its mint for the function's response and nothing
  downstream changes shape." Scouting a city by restarting until a liked seed
  appears is the exposure this task exists to close; accepted for the
  two-phone demo, not for the booth.
- **Done when:** rooms mint a 4-character code from the 28-symbol alphabet
  (no `O`/`0`/`I`/`1`) via `crypto.getRandomValues` with retry on collision; the
  seed is `arena:{session_id}` minted **server-side**; capacity is enforced by an
  atomic conditional UPDATE, not a read-then-write; a build-version mismatch
  joins as a spectator with an explicit message; quick join selects the newest
  open room for the active event or opens one.
- **Depends on:** T-107, T-109
- **Satisfies:** GWT-301, GWT-302, GWT-307, GWT-308, SYS-311
- **Size:** L
- **Note:** a client-chosen seed would let a player scout a city and restart
  until they like it. Two builds of `citygen.js` produce two different cities
  from one seed, which is the exact failure mode of deploying mid-conference.

### T-603 — `js/net/arena.js`: room lifecycle, roster, succession, channel ✅ minimal cut shipped 2026-08-10 ◆

- **Shipped 2026-08-10, the minimal cut (T-603 minimal, per the file's own
  header comment).** `js/net/arena.js` mints a 5-symbol code (27-symbol
  no-vowel, no-confusable alphabet `BCDFGHJKMNPQRSTVWXZ23456789`) client-side,
  derives the city seed deterministically from the code, and runs the
  JOIN/WELCOME/REJECT/ROSTER handshake with room-full and no-host errors —
  live-proven over real Supabase Realtime, not just loopback, in
  `arena.html`. **Succession is explicitly not in this cut**: a vanished host
  freezes the match ("HOST LEFT") rather than electing a new one — that is
  T-606, and `ArenaRoomPeer.onHostLeft` is the hook a claim will replace.
  Realtime Authorization/token-gating and server-enforced rate limits are also
  not yet built (both depend on T-602's server side existing at all).
- **Done when:** join/leave/roster/succession are owned here; Realtime
  Authorization is **on** and the topic is token-gated by the join function;
  presence payloads are display hints only and a presence entry with no roster
  row is never drawn; per-client message rate limits are set explicitly just
  above the legitimate ceiling.
- **Depends on:** T-601, T-602
- **Satisfies:** GWT-302, SYS-310, SYS-407
- **Size:** L

### T-604 — `js/net/arena-host.js`: the authority loop ✅ shipped 2026-08-10 (as `js/net/host.js`) ◆

- **Shipped 2026-08-10.** `js/net/host.js` was promoted from the driver-seam
  skeleton to a real per-slot-moves authority: it feeds the full per-slot moves
  array into the multi-hole sim (`sim.step(dt, moves)`), broadcasts snapshots,
  emits keyframes carrying an RLE eaten bitset, and zeroes a silent peer's
  intent after a staleness timeout. Proved bit-exact against a scripted replay
  in `tools/net-match-selftest.mjs` (48/48, including bit-exact host replay).
  **Naming note:** the file stays `js/net/host.js`, not `arena-host.js` as this
  task's title names it — the rename never happened and the module boundary is
  otherwise exactly what this task describes; treat `js/net/host.js` as this
  task's deliverable.
- **Done when:** the host applies peer intents into `sim.step`, broadcasts
  snapshots at `SNAPSHOT_HZ`, emits keyframes at `KEYFRAME_HZ` including the
  eaten bitset, records the multi-hole trace, zeroes a silent peer's intent after
  `INTENT_STALE_MS`, and finalizes at the clock.
- **Depends on:** T-603
- **Satisfies:** GWT-303, GWT-305, GWT-306, SYS-310, SYS-312
- **Size:** L

### T-605 — `js/net/arena-peer.js`: the follower loop ✅ shipped 2026-08-10 (as `js/net/peer.js`) ◆

- **Shipped 2026-08-10.** `js/net/peer.js` (new file) implements the follower
  loop end to end: intents at a fixed cadence, snapshot interpolation,
  prediction with banded reconciliation (ignore/smooth/snap), and keyframe
  healing when a client falls too far behind. Proved over `netdemo.html`
  (both sides of a loopback match rendered live in one page, the right half
  purely from the wire) and over real Supabase Realtime in `arena.html`.
  **Naming note:** ships as `js/net/peer.js`, not `arena-peer.js` — same
  rename gap as T-604, same otherwise-matching module boundary.
- **Done when:** intent goes out at `INTENT_HZ`; ghosts render 100 ms in the
  past from a ring buffer, extrapolate at most 250 ms then freeze and dim; the
  peer's own hole is predicted with the shared `tiers.js` speed function and
  reconciled in the ignore/smooth/snap bands; **mass, radius, eats, and combos
  are never predicted**; ghosts live in the net layer's roster and never in
  `sim.rivals`.
- **Depends on:** T-603
- **Satisfies:** GWT-304, GWT-305, GWT-910, SYS-312
- **Size:** L
- **Note:** invariant 7 dies the moment someone "simplifies" the ghost roster by
  reusing `sim.rivals`, and the replay defence goes with it. Watch for it in
  review.

### T-606 — Host migration — not started ◆

- **Still open.** T-603's `js/net/arena.js` ships the hook this task claims
  (`ArenaRoomPeer.onHostLeft`) but not the claim itself: today a vanished host
  freezes the match with a "HOST LEFT" message rather than electing a
  successor. No `arena-claim-host` function or `host_generation` column exists
  yet (both are also T-107/T-602 territory).

- **Done when:** a peer seeing no snapshot for `HOST_TIMEOUT_MS` claims host via
  `arena-claim-host`'s single conditional UPDATE on `host_generation`, staggered
  by succession index; exactly one claimant wins; the winner rebuilds from the
  last keyframe plus subsequent snapshots and re-broadcasts; a returning old
  host adopts the new generation and its stale snapshots are dropped on arrival;
  a failed migration ends each client's match locally with a plain message and a
  queued result rather than a freeze.
- **Depends on:** T-604, T-605
- **Satisfies:** GWT-401, GWT-402, GWT-403, GWT-404, GWT-405, GWT-406, SYS-407
- **Size:** L
- **Note:** the database row is the arbiter. No election, no quorum, no
  split-brain, because there is exactly one writable column.

### T-607 — `arena-finalize` and `arena-attest` ◆

- **Done when:** the host submits the multi-slot trace and the server replays
  the whole room — one `Sim`, N holes — recomputing every participant's score;
  peers independently submit a rolling `intent_sha256`; agreement keeps the
  session `verified`, disagreement drops it to `disputed`, a missing attestation
  or any host migration caps it at `attested`; attested runs reach event and city
  boards and **never** a belt.
- **Depends on:** T-604, T-606, T-302
- **Satisfies:** GWT-306, GWT-502, SYS-710
- **Size:** L
- **Note:** belts and all-time records are reachable only through a fully
  verified path. The trust model closes the door before the title, not after.

### T-608 — Arena UI: lobby, join code, HUD, spectator ◆

- **Done when:** the lobby shows the spoken-unambiguous code and the city; the
  code field upper-cases, strips whitespace, and accepts a pasted full URL; a QR
  renders the join URL; the HUD carries roster, live standings, match clock, and
  the RECONNECTING band; overflow past capacity joins as a spectator with
  "watching, you're next" rather than a dead end.
- **Depends on:** T-603
- **Satisfies:** GWT-301, GWT-302, GWT-307, GWT-308, GWT-X01, GWT-X06
- **Size:** L

### T-609 — Graceful degradation to solo ◆

- **Done when:** a failed or timed-out `arena-open`/`arena-join` mints a local
  session with the same clock and rules, says "Playing solo — no connection"
  once, quietly, and submits at the end as a normal solo run — fully verified,
  fully belt-eligible; a mid-match network loss ends the match locally with a
  legible message and a queued result.
- **Depends on:** T-605, T-207
- **Satisfies:** GWT-908, GWT-902, SYS-912
- **Size:** M

### T-610 — `tools/arena-harness.html`: N scripted peers in one tab ◆

- **Done when:** `?peers=6&scene=…&seed=…&trace=…` runs N real net clients with
  rendering disabled, stepped by one shared 60 Hz interval, with `--host` and
  `--kills-host-at=` flags and a `?drop=` loss injector; it passes the whole
  scenario matrix in
  [07 §4.1](07-test-strategy.md#41-the-scripted-peer-harness--toolsarena-harnesshtml)
  including **two migrations in one match**.
- **Depends on:** T-605, T-606
- **Satisfies:** GWT-401, GWT-402, GWT-404, GWT-910, GWT-304
- **Size:** L
- **Note:** a browser page rather than a Node script, because the Supabase client
  comes from the importmap and a Node harness would need `package.json` and
  `node_modules` — the exact posture change 07 §3 rejects. The constraint
  produces the better test: same importmap, same client, same code path.

### T-611 — Late join, rejoin, and idle eviction ◆

- **Done when:** late join is allowed until T−30 s with an immediate keyframe
  and a `partial` flag that keeps the run off city and all-time boards; a
  dropped peer's slot is held 30 s with the hole frozen, translucent, and
  uneatable; after 30 s the run finalizes as `left_early` and still posts to the
  event board.
- **Depends on:** T-604, T-605
- **Satisfies:** GWT-405, GWT-406, GWT-910
- **Size:** M

### T-612 — Arena frame-rate gate on booth hardware ◆

- **Done when:** an 8-hole arena on the booth machine is measured (min-of-N,
  N ≥ 5, quiet machine) and does not regress below the current release build's
  60 fps target on that hardware.
- **Depends on:** T-604, T-605, T-608
- **Satisfies:** GWT-309
- **Size:** S

### Phase 6 exit gate ◆

Two kiosks see each other's holes move and agree on the clock · the host's lid
closes and the match continues to a normal end with valid results · a
disconnected peer rejoins within 30 s with the same slot and mass · the room
fills and the ninth person gets "next match starts in…" · T-610's whole matrix
is green · T-612 passes.

---

## Phase 7 — Event hardening, moderation, and the booth

**Demonstrable at the end:** a person who is not a developer runs the booth for
an hour, resets a kiosk between players, hides a name from the big screen inside
a minute, and switches a kiosk to offline-only — unaided.

### T-701 — Kiosk mode ◆

- **Done when:** `?kiosk=unbound-2026` declares the mode (never guessed from
  screen size or user agent) and is captured into `sessionStorage`; the Supabase
  session is in-memory only (`persistSession: false`); the save module's storage
  target is **injectable** and kiosk writes go to a session-scoped shim so a
  crashed browser cannot leave one player's progress for the next; an
  always-visible NEXT PLAYER button plus a 45 s idle timeout (20 s on results)
  with a 10-second visible countdown performs the full reset — push pending runs,
  sign out, drop the scratch save, drop the quarantine key, drop cached boards,
  **mint a new device id**, reload to the attract screen.
- **Touches:** `js/save.js` (storage injection), `js/net/identity.js`,
  `js/ui/screens-online.js`
- **Depends on:** T-201, T-507
- **Satisfies:** GWT-1002, GWT-X10, GWT-205
- **Size:** L
- **Note:** [12 §4](12-migration-plan.md#4-the-shared-booth-kiosk) is the
  highest-severity item in the migration plan and it is not a merge problem, it
  is a data-leak and identity problem. Fix 3 (non-durable storage) is the
  structural version of fix 2 (the reset button); behavioural fixes fail when
  someone walks away mid-round, structural ones do not. **Both are required.**

### T-702 — The QR claim handoff ◆

- **Done when:** the kiosk results screen renders a QR encoding
  `https://<domain>/claim#<one-time 5-minute token bound to the guest>`; the
  player completes the claim in their own browser on their own connection with
  all three paths available; the kiosk, polling a Realtime channel, shows
  "Claimed by …" and rolls to NEXT PLAYER; the typed-email OTP fallback stays on
  the kiosk for people who will not scan.
- **Depends on:** T-701, T-502
- **Satisfies:** GWT-201, GWT-202, GWT-X10
- **Size:** M
- **Note:** this is the reason Google and HubSpot buttons are **hidden by default
  on kiosks**. Signing into Google on a shared machine leaves a cookie on
  someone else's origin that our code cannot clear, and the next player could be
  silently signed in as the previous one. Not fixable in our code — only
  avoidable.

### T-703 — Moderation: one-tap hide, rehearsed ◆

- **Done when:** `profiles.moderation_state` (`ok | hidden | banned`) filters
  through the public view so hiding is instantaneous and global — screen, board,
  room, belts; an auth-gated operator page has one button; the big screen renders
  only handles at least N seconds old, giving the blocklist's misses a human
  window; **hide, never delete**.
- **Depends on:** T-108, T-206, T-407
- **Satisfies:** GWT-1004, GWT-1002
- **Size:** M
- **Note:** target is **under 60 seconds by someone who is not the developer**,
  and it is timed as a drill in T-708. Layers 1–4 of the handle pipeline will
  miss something; the question is only how fast we recover.

### T-704 — The booth diagnostics view ◆

- **Done when:** one view answers whether the backend is reachable, whether an
  arena is live, and how many players are in it; the connection pill reads
  green / amber / grey with the plain-language meanings the runbook uses.
- **Depends on:** T-204, T-603
- **Satisfies:** GWT-1001
- **Size:** M

### T-705 — Abuse and quota limits, set explicitly ◆

- **Done when:** room creation is rate-limited per subject per hour with a cap on
  concurrently-open rooms; anonymous sign-ins are rate-limited per IP; Realtime
  per-client message rates are set just above the legitimate ceiling; OTP
  attempts are limited per address and per IP; handle-uniqueness checks are
  rate-limited and return a neutral "not available" so they cannot become an
  attendee-list oracle.
- **Depends on:** T-602, T-603, T-502
- **Satisfies:** GWT-X09, GWT-307
- **Size:** M
- **Note:** denial of wallet followed by denial of service is the most likely
  *technical* thing to actually ruin the booth.

### T-706 — The bounded-timeout and captive-portal audit ◆

- **Done when:** every network operation in `js/net/` is inventoried against its
  timeout and its defined fallback; a captive-portal response is treated as a
  failure rather than rendered or trusted; no screen shows an indefinite spinner
  and no control is permanently disabled without an explanation.
- **Depends on:** all of Phase 3–6's net code
- **Satisfies:** GWT-902, GWT-907, GWT-909, SYS-912
- **Size:** M
- **Note:** run this as a written inventory, not a spot check. "The one thing the
  booth must never see is a spinner that does not resolve" is only true if
  somebody enumerated the calls.

### T-707 — Rollback rehearsal and the printed runbook ◆

- **Done when:** the §5.7 contact block is filled in; the one-page runbook is
  **printed** and taped inside the booth counter; and the person who will staff
  the booth has personally executed rollback layers 1 and 2 (`?online=off`, then
  a config-file flag edit) and watched the game keep working.
- **Depends on:** T-008
- **Satisfies:** GWT-1002, GWT-1003
- **Size:** S
- **Note:** a kill switch nobody has pulled is a hypothesis. A runbook with an
  unfilled contact block is not a runbook.

### T-708 — The pre-event smoke checklist, run twice ◆

- **Done when:** [07 §8](07-test-strategy.md#8-manual-pre-event-smoke-checklist)
  is completed end to end at the soft-launch exit **and again on the booth
  hardware, on the venue wifi, the evening before doors** — including the
  offline guarantee section first, the two-consecutive-players sign-out check,
  the timed moderation drill, and the accessibility spot-check.
- **Depends on:** everything ◆ above
- **Satisfies:** GWT-901 … GWT-911, GWT-1001 … GWT-1004, GWT-X01 … GWT-X06
- **Size:** M
- **Note:** the second run is the one that counts. It is the only test in the
  whole package that runs in the actual conditions.

### T-709 — Load, soak, and **the** Realtime message measurement ◆

- **Done when:** **the actual Realtime message count for one full match at the
  shipped rates (12 Hz snapshots, 10 Hz intents) is read off the Supabase
  dashboard** and multiplied out against the plan's allowance — replacing
  [03 §7.3](03-technical-design.md#73-the-realtime-message-math-which-is-the-whole-cost-question)'s
  arithmetic with a fact; **`snapshot_hz` is not committed until this number
  exists**; and, separately, the harness soaks 8 peers for 90 minutes back to
  back with no monotonic memory growth or leaked channel handles, 40 submissions
  in 10 seconds are measured for confirmation lag, and the four board queries are
  hammered while submissions land.
- **Depends on:** T-610, T-302
- **Satisfies:** GWT-309, GWT-506, GWT-601 … GWT-604
- **Size:** M
- **Note:** this is the task the whole cost question reduces to. 03 §7.3 projects
  **1.34 M–3.54 M sent / 2.38 M–6.65 M delivered** over the event; the 5× spread
  is three unmeasured assumptions (matches per event, sent-vs-delivered metering,
  players per room), not netcode, and no amount of further arithmetic narrows it.
  It also answers 03 §8 item 3 — whether Supabase counts **sent** or
  **sent+delivered**, worth ~1.9× on its own. If the measured number lands over
  the allowance, the levers in 03 §7.3, in order: snapshot rate 12 → 10, room cap
  8 → 6, time-box arena hours to ~4 a day.

### T-710 — Post-event: retention automation and the frozen event scope ○

- **Done when:** T-114's schedule is automated; the UNBOUND scope is frozen per
  the answer to 02's open question 3; unconsented PII is purged on schedule.
- **Depends on:** T-114
- **Satisfies:** GWT-X10, GWT-601
- **Size:** S

### T-711 — Docs and wiki sync ◆

- **Done when:** `STATUS.md`, `CHANGELOG.md`, the covering `.wiki/modules/*.md`
  pages, and `.wiki/architecture.md` all describe the shipped system; every
  `covers:` glob still matches real paths; ADRs 0009–0012 are referenced from
  `.wiki/INDEX.md`.
- **Depends on:** each phase (run it per phase, not once at the end)
- **Satisfies:** GWT-X07
- **Size:** S per phase
- **Note:** `.wiki/conventions.md` requires the covering module page and
  `STATUS.md` update **in the same commit as the code change**. This is a
  reminder, not a licence to batch it.

### T-712 — Reconcile 07's `AC-<AREA>-<n>` IDs to 02's `GWT`/`SYS` IDs ◆

- **Done when:** [07-test-strategy.md](07-test-strategy.md) references 02's
  criterion IDs directly, or carries an explicit mapping table, so that a
  renumber in 02 orphans nothing and a reviewer can check coverage in one pass.
- **Touches:** `.wiki/features/online-flywheel/07-test-strategy.md`
- **Depends on:** nothing
- **Satisfies:** GWT-X07
- **Size:** S
- **Note:** 07 §0 already states that 02 wins and that a stale ID means 07 is
  wrong. This task acts on its own rule.

### Phase 7 exit gate ◆

The booth staffer, unaided, can reset a kiosk, read the connection pill and say
what it means, hide a handle in under a minute, and switch a kiosk to
offline-only · T-708's second run is complete on venue wifi · the printed
runbook is taped inside the counter.

---

## The critical path

Everything else can be worked around. This chain cannot.

```
🔑N1+N2 (Nico, ~30 min of the 90)
   │
   ├─► T-001 deploy ─► T-002 headers ─► T-003 vendoring ─► T-008 flags
   │                                                          │
   └─► T-101 Supabase ─► T-102 subjects ─► T-103 runs ─► T-109 RLS ─► T-110 pgTAP
                                                │
   T-004 codec ─► T-005 recording ─► T-006 SPIKE ⚠ ─► T-007 remediation
                                          │
                                          ▼
                          T-201 save v14 ─► T-205 identity ─► T-207 outbox
                                                │
                                                ▼
                                    T-301 submit ─► T-302 submit-run ─► T-308 triggers
                                                                             │
                                                                             ▼
                                              T-401 boards ─► T-405 results ─► T-407 Titantron
                                                                             │
                                                                             ▼
                                                     T-501 claim ─► T-502 OTP ─► T-503 merge
                                                                             │
                                                                             ▼
                                          T-602 rooms ─► T-604/605 host+peer ─► T-606 migration
                                                                             │
                                                                             ▼
                                                          T-701 kiosk ─► T-703 moderation ─► T-708 smoke
```

**Nico's handover, ordered by what it unblocks:**

| Handover | Unblocks | Status |
|---|---|---|
| SETUP §2 — Vercel (10 min) | T-001, and therefore every deployed test | ✅ **Done 2026-08-10** |
| SETUP §1 — Supabase URL + publishable key + secret key (20 min) | T-101 and all of Phase 1 | ✅ **Done 2026-08-10** |
| SETUP §5 — the domain (10 min) | T-506 (HubSpot's byte-exact redirect), the booth sign, the stable preview alias | Open — before Phase 5 |
| SETUP §3 — Google (25 min) | T-504 only | Open — before Phase 5 |
| SETUP §4 — HubSpot (30 min) | T-506 only, which is ○ | Open — whenever; the fallback ships regardless |

The two sections that gated **everything** are done. What remains gates one
sign-in button each, and the game ships without either.

**The two hard gates inside the path:** T-006 (cross-engine determinism) must be
answered before T-302 is written, and T-305 (Boston replay cost) must be
measured before T-306 is designed. Both are ⚠ for the same reason: getting the
answer late means rebuilding a phase rather than configuring one.

---

## What can be built in parallel, by separate agents

Four streams run concurrently from day one with no shared files and no
coordination beyond the phase gates. This is where the schedule is actually won.

**Stream A — pure modules (no backend, no credentials, no deploy).**
T-004 (`js/replay.js`), T-112 (`js/meta/rules.js`), T-601
(`js/net/snapshot.js`), T-203 (`mergeProgress`), and every validator extension
that tests them: T-113, T-202, T-304, T-303. All of these are Node-testable,
none touches a network, and none needs a single value from Nico. **Start this
stream immediately, before the credentials arrive.**

**Stream B — the database.** T-102 … T-114. One agent, sequential inside the
stream (migrations are ordered), independent of everything the client does.
Gated only on 🔑N1.

**Stream C — the client net layer.** T-204 … T-209, then T-301, T-401 … T-403.
Can be built against fixtures and a local Supabase before the production project
exists.

**Stream D — UI surfaces.** T-209, T-404 … T-408, T-501, T-608. Routes through
the frontend-design assets per the standing UI hot-zone rule. Can be built
against static fixtures ahead of the data being real; the accessibility and
brand-token pass (T-408) is what joins it back to the others.

**Explicitly serial, do not parallelise:**

- **T-201 ships alone.** One commit, nothing else in it. The historical bug this
  task exists to avoid was caused by a change that looked small next to a bigger
  one.
- **T-006 → T-007 → T-302.** The spike, its remediation, and the function that
  depends on both. Writing `submit-run` against an unanswered tolerance question
  is rework, not progress.
- **T-604 → T-605 → T-606.** Host, peer, then migration. Migration is not
  testable until both loops exist, and it is the single most subtle thing in the
  package.
- **T-505 before T-506.** The HubSpot fallback before the HubSpot flow. That
  order is what makes the risky one droppable.

---

## Related

- [02-requirements.md](02-requirements.md) — the criteria every task above
  traces to. If a task's criteria are met and the thing still feels wrong, the
  defect is in 02 and 02 gets fixed.
- [07-test-strategy.md](07-test-strategy.md) — how each criterion is actually
  checked, and the two coverage gaps it names rather than hides.
- [08-rollout-and-runbook.md](08-rollout-and-runbook.md) — the phase entry and
  exit gates this document's phases are named after.
- [10-observability-and-nfr.md](10-observability-and-nfr.md) and
  [11-risk-register.md](11-risk-register.md) — the budgets T-709 measures
  against and the risks T-006, T-305, and T-506 exist to retire.
