# Scoreboards & Profiles delivery

## Outcome

Flywheel ships the two accepted decisions as one complete, production-verified
feature: verified scores come only from a bounded, server-replayed RUN, and a
player owns a chosen name through a server-minted device token. Existing local
history stays local; no client-writable score path, account system, or cloud-save
sync is introduced.

## Acceptance criteria

### AC-1: Accepted decisions and migration contract

ADR-0016 and ADR-0017 are accepted in `.wiki/adr/`; ADR-0012 records the
narrowing. A v16 save migrates to v17 without changing its sandbox records; a
fresh and migrated save have equal top-level, `settings`, and `player` key sets.
The board schema is additive and no historical local score is ranked.

Proved by: `node tools/validate.mjs` including its save-schema guard and a
recorded migration fixture.

Paths: `.wiki/adr/**`, `.wiki/features/scoreboards-and-profiles/**`, `STATUS.md`,
`.wiki/modules/**`, `js/save.js`, `tools/validate.mjs`.

### AC-2: Deterministic ranked simulation

All implementation-approximated math in the ranked `voxelsim` path is replaced
or structurally avoided as specified by T-102. A ranked run uses one pinned
physics tune, ends after exactly 5,400 fixed ticks, and is unaffected by the
render quality tier.

Proved by: `node tools/validate.mjs`, a unit test for `js/fwmath.js`, and a
ranked replay fixture that produces the same result in browser and Node.

Paths: `js/fwmath.js`, `js/voxelsim.js`, `js/replay.js`, `js/main.js`,
`tools/validate.mjs`, `tools/board-selftest.mjs`, fixture files.

### AC-3: Offline-first RUN and durable outbox

The game can run, record, and display a local result with no network. Board code
is lazy-loaded, every request has a timeout and defined offline behaviour, and
the outbox persists no more than 20 idempotent run submissions / 1 MB and drains
on reconnect, focus, success, and its 60-second timer.

Proved by: codec/property tests, offline boot guard, browser smoke checks on the
deployed build, and the board self-test.

Paths: `js/replay.js`, `js/main.js`, `js/board/**`, `js/ui/**`, `tools/**`.

### AC-4: Verifiable backend and database

The Vercel API and Supabase schema implement ticket issue, single-use redemption,
server replay, idempotency, verdicts, rank-at-read-time city and overall views,
and structured verification logs. The only score a board shows is server
computed from a valid ticket and trace. All exposed tables have RLS; the two
read views use `security_invoker`.

Proved by: migration verification on Supabase, a publishable-key deny test,
score-path and secret greps, local verifier tests, and live ticket/idempotency /
version-skew checks.

Paths: `api/**`, `supabase/migrations/**`, `js/replay.js`, `tools/**`,
`vercel.json`, `.env.example`.

### AC-5: Names, records, and profile

A placing verified run can claim a 3–16-character name in one field, under the
documented normalization, collision, blocklist, and rate-limit rules. The server
mints and stores only a hash of the bearer token. Transfer codes are single-use,
expire in ten minutes, and invalidate the old token. RECORDS and PROFILE show
verified boards distinctly from local history, with the documented accessibility
and no-account UX.

Proved by: name collision and transfer tests, live read/write self-tests,
keyboard-only traversal on the deployed build, and UI smoke checks.

Paths: `api/name/**`, `api/data/**`, `js/board/**`, `js/ui/boards.js`,
`js/ui/screens.js`, `css/main.css`, `index.html`.

### AC-6: Moderation and deletion are live before boards are public

Reporting is insert-only and cannot hide a player. The owner-only operator
surface can force-rename or hide a player; hide removes both board rows within
60 seconds without a deploy. Player deletion anonymises the public record,
revokes the token, and removes trace payloads while preserving anonymous ranks.

Proved by: live moderation drill, audit-row checks, and the production
pre-launch checklist.

Paths: `api/report.*`, `api/operator/**`, `api/delete.*`, `js/ui/boards.js`,
`supabase/migrations/**`, `tools/**`, `.wiki/**`, `STATUS.md`.

### AC-7: Production readiness and release

The feature passes the complete validator and feature self-tests, all required
Supabase security advisors are resolved or explicitly waived by the owner,
T-901/T-902/T-903 are recorded with their predefined branches applied, and the
completed work is committed, pushed to `main`, and verified at the deployed URL.

Proved by: command evidence, Supabase advisor output, deployment status/logs,
the live suite, and the completed rollout checklist.

Paths: `.longhaul/**`, `SPEC.md`, all paths claimed by AC-1 through AC-6.

## Non-goals

- Do not rank a 50% city clear, the live arena, or legacy local records.
- Do not add accounts, email/password/OAuth authentication, cloud-save sync,
  chat, free text beyond a display name, seasons, belts, ghost replays, daily
  challenges, friend boards, or a new paid service.
- Do not add runtime dependencies or a root `package.json`.
- Do not weaken the pure-sim, seeded-randomness, fixed-timestep, tier, or
  placement invariants.
- Do not change unrelated game mechanics, city content, audio, or menu styling.
- Do not expose credentials, service keys, ticket secrets, token values, or a
  client-writable score/rank/points field.

## Fixed decisions

- ADR-0016: THE RUN is a server-seeded, fixed 90-second / 5,400-tick mode at
  one pinned tune; the predeclared 60-second fallback applies only if T-902
  fails its budget.
- ADR-0017: identity is a display name plus a server-minted, device-held bearer
  token; no sign-in surface exists.
- Local storage remains authoritative for existing local progress; board data is
  additional and optional.
- No score is sent, accepted, or stored as a client-authoritative value.
- Moderation is enabled before boards become publicly visible.

## Change budget

- Allowed paths: paths named in AC-1 through AC-7, plus narrowly necessary
  imports, configuration, tests, and their covering wiki pages.
- Maximum files changed: 65, excluding generated fixtures and Supabase migration
  artifacts.
- A change outside these paths or beyond this budget requires an amendment.

## Open questions

- T-901 requires a genuine low-end touch-device measurement. This workspace has
  no confirmed physical test device. A browser CPU-throttle result is useful
  evidence but does not satisfy the stated real-device gate.
- T-300 must prove the zero-dependency Vercel API deployment and confirm that
  `SUPABASE_SECRET_KEY` and a new `FW_TICKET_SECRET` are configured in Vercel;
  no secret values will enter the repository.

## Sign-off

Approved by: Nico
Date: 2026-08-12
Baseline commit: `3959da0e79500c679ea9bd578cdec1b837cab0b0`
