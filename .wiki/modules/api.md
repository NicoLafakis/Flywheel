---
covers:
  - "api/**"
---
# API (Vercel Functions)

## Purpose

`api/` is the only place gameplay-affecting writes and identity checks happen.
It is the server half of [ADR-0012](../adr/0012-replay-validated-leaderboard-trust.md)
(replay-validated leaderboard trust) and [ADR-0011](../adr/0011-guest-first-identity-deferred-claim.md)
(guest-first identity, deferred claim): a browser may read public board views
directly from Supabase with its publishable key (`js/board/read.js`), but every
mutation — starting a ranked run, submitting one, claiming/renaming/transferring
a name, removing a player, reporting one — goes through one of these 16
functions, deployed from the same static repo (`vercel.json`).

Nothing here is required to play. `js/board/**` (the client side of this
surface) fails closed to a local/offline fallback everywhere it calls into
`api/`, which is invariant 10 in `CLAUDE.md`: an offline player can always
start and finish a city or a RUN, and a failed ranked submission is queued
(`js/board/outbox.js`) rather than blocking play.

## Files

| File | Method | Purpose |
|------|--------|---------|
| `api/_lib.mjs` | — | Shared primitives: JSON envelope helpers (`ok`/`fail`/`json`), request-body reader with a 64 KB cap, Supabase REST/RPC client (service-role key, server-only), HMAC ticket signing, device/player token hashing, name normalisation + leet-speak collision key, origin rate-limit key (HMAC of the forwarded IP, never stored raw), and `errorResponse()` (maps a thrown error to 400/503 without leaking internals) |
| `api/_names.mjs` | — | The one name screen (`blockedLocally` = reserved words + the static pattern file; `blockedName` adds the live `blocked_names` table) plus automatic guest identity: `autoNameCandidates()` drives `js/board/names.js`'s retry ladder with `node:crypto` randomness, and `ensureDevicePlayer()` gives an unbound device a real `players` row. `register`/`claim`/`rename` import the screen from here instead of each keeping a copy |
| `api/_verify.mjs` | — | Server-side replay verification: `verifyReplay()` decodes a stored input trace, rebuilds a `VoxelSandboxSim` for the claimed scene/seed, asserts the ranked tune was not silently swapped, steps it tick-for-tick, and floors `sim.hole.mass` into the score that actually gets published. `drainOnePendingRun()` is the unit the cron endpoint calls |
| `api/health.mjs` | GET | Deployment smoke probe. Reveals no environment state; a 200 means the function bundle booted, nothing more |
| `api/auth/register.mjs` | POST | Password-based account creation: validates the name (blocklist + reserved words + per-IP daily cap of 8), then hands the whole create-and-inherit step to `fw_register_device_player` — which upgrades this device's auto-provisioned guest in place if it has one, adopts every unclaimed run the device's tickets prove it played, and backfills `board_public` for each. `token_hash = HMAC-SHA256(password)` under `FW_TICKET_SECRET` is the password verifier, `session_token_hash = sha256(token)` the bearer credential |
| `api/auth/login.mjs` | POST | Password check against the stored `token_hash`, then mints a fresh bearer `token` and writes `session_token_hash = sha256(token)`. `token_hash` is deliberately left alone — it is the password verifier, and overwriting it would lock the account out of every future login. One session hash per account, so logging in on a second device signs the first out |
| `api/name/claim.mjs` | POST | The guest-first path (ADR-0011): mints a device token, sends only its SHA-256 hash to `fw_claim_name` (Postgres RPC), links the run that earned the claim. No password |
| `api/name/rename.mjs` | POST | Renames an already-claimed player; gated by `playerForToken(player_id, token)`, then patches both `players` and the `board_public` view's cached name. Also the escape hatch for an automatically generated name — an auto-provisioned guest is a device-token account, so the `{player_id, token}` pair `run/start` returned authenticates here with no password and no signup |
| `api/name/transfer/start.mjs` | POST | Mints a 6-character, unambiguous-alphabet transfer code (rejection-sampled to avoid modulo bias) with a 10-minute TTL, for moving a claimed name to a second device |
| `api/name/transfer/redeem.mjs` | POST | Consumes a transfer code via `fw_transfer_redeem`, mints a new bearer token, hashes it server-side into `token_hash` before returning it. Redeeming hands ownership to the redeeming device, so the RPC also nulls `session_token_hash`: a password login on the previous device does not outlive the transfer |
| `api/player/remove.mjs` | POST | Deletes a claimed name via `fw_remove_player`, gated by `playerForToken(player_id, token)` — the browser posts its stored secret verbatim, so `token` is the field that carries the credential (`player_token` is accepted as an alias) |
| `api/run/start.mjs` | POST | Ranked-run ticket issuance: requires `FW_BOARDS_ACCEPTING=true`, checks the scene is in `RANKED_SCENES`, rate-limits per device (12/hr) and per hashed origin (60/hr), returns an HMAC ticket (`makeTicket`) binding run id + seed + scene + tune + issuer + timestamp. Also where a nameless device stops being nameless — see **Nobody plays anonymously** below |
| `api/run/submit.mjs` | POST | Ranked-run submission: validates the ticket signature, re-authenticates the claimed player if the ticket has one, checks the trace shape (tick count, tune id, sim version), is idempotent on `run_id`, rate-limits (20/hr device and origin), and — this is invariant 8 — stores the trace via `fw_accept_run` and returns only a `verdict`, never a browser-computed score. A ticket bound to an `is_auto` guest is accepted with no credentials, on the ticket signature plus the device-key match alone |
| `api/run/status.mjs` | POST | Polls a stored run's verdict for a `(run_id, device_key)` pair the caller must already hold |
| `api/run/verify.mjs` | GET (cron) | Invoked once a minute by Vercel Cron (`vercel.json`), gated on `CRON_SECRET`. Calls `drainOnePendingRun()` — one replay per invocation, bounding CPU per tick while pending submissions stay durable |
| `api/report.mjs` | POST | Player-reports-player moderation intake; one report per reporter/target pair per 24h |
| `api/operator.mjs` | GET/POST | Moderator console API, gated on `FW_OPERATOR_SECRET` (`x-fw-operator` header, timing-safe compare). GET lists recent players + reports; POST applies `rename`/`hide` via `fw_moderate` |
| `api/data/blocked-names.json` | — | Static blocklist patterns consulted by `register`/`claim`/`rename` alongside a live `blocked_names` table query |

## Invariant 8 — no browser-writable score reaches a board

This is what `api/_verify.mjs` and `api/run/submit.mjs` exist to enforce.
`run/submit.mjs` accepts a `claimed_score` from the client, but that number is
**only a cost-control input** — it decides whether a run is worth spending a
replay on (`placementGate()`: skip the queue if the claim would not place in
the scene's top 25 anyway) and, once verified, whether the client and server
disagree (`_verify.mjs` fails a `verified` run as `mismatch` if `claimed_score
!== score`, T-303). The number that actually reaches `v_city_board`/`v_overall`
is `Math.floor(sim.hole.mass)` computed by replaying the stored input trace
through a fresh `VoxelSandboxSim` in `api/_verify.mjs` — the same sim module
the browser and `tools/validate.mjs` import, stepped tick-for-tick against the
same tune the client was pinned to (`RANKED_TUNE`, asserted rather than
re-assigned, so a constructor that silently stopped freezing it would be
caught here). `api/run/verify.mjs`'s cron is the only path that turns a
`pending` run into `verified`/`mismatch`/`unverifiable`; nothing in `api/`
lets a client set its own verdict.

## Nobody plays anonymously

`fw_record_verdict` publishes a verified run to `board_public` only
`when r.player_id is not null`, and `run/start` used to bind `player_id: null`
for anyone who had not typed a name into a signup form. A guest's run was
ticketed, submitted, replayed by the cron, scored — and then dropped, with no
error on any surface. That is the single biggest reason both boards read `[]`.

So `run/start` calls `ensureDevicePlayer()` (`api/_names.mjs`) for any request
that arrives with no player binding, and the device gets a real `players` row
with a Parks-and-Recreation name before it has done anything. Four properties
are load-bearing:

- **One auto player per device, ever.** `ensureDevicePlayer()` first looks for
  the newest `run_tickets` row this device key was issued that carries a
  `player_id`, and re-binds to it. A client that ignores or fails to store the
  credentials we return therefore accumulates scores on one identity instead of
  minting a ghost player per ticket. That, not the hourly ticket limit, is what
  bounds this path.
- **Behind the rate limit.** The call sits after the 12/hr device and 60/hr
  origin checks, so the only path that creates a `players` row without a human
  deciding to cannot be used to mass-create rows faster than tickets are issued.
- **A claimed account is never re-bound.** The re-bind only matches
  `is_auto = true` rows. A run must not be attributed to a real account on the
  strength of a device key alone; a browser that still owns that account sends
  its token instead.
- **It never throws.** Any failure — including the deploy window where this code
  is live and the `is_auto` migration is not, which PostgREST answers with a 400
  — logs and returns null, and the ticket is issued unbound exactly as before.

The response carries `player_name` always and `player_token` only on the request
that created the row, so the browser can store the credential and later rename
itself through `name/rename`.

**`run/submit` had to move with it.** It re-authenticates the claimed player
whenever the *ticket* carries one, and a guest browser has no credential to
send — so provisioning alone would have turned every guest run into a `401` at
submission, which is worse than the silent non-publication it fixes (the outbox
drops a non-retryable failure, so the run would be gone rather than queued).
Submission therefore proves a ticket-bound player two ways: with credentials, if
any were sent, exactly as before; and otherwise by the ticket itself, which is
HMAC-signed over its `player_id` and whose `device_key` was already matched
against the submitting device. That second path is accepted **only** for an
`is_auto` player — a claimed account still requires its token, or a leaked
device key would be enough to submit in someone else's name.

The names come from `js/board/names.js`, imported directly rather than
reimplemented (the same arrangement as `_verify.mjs` importing `js/voxelsim.js`).
`nameCandidates()` returns a retry ladder whose first rung is the clean
undecorated name, so a unique-violation on `name_key` costs one extra INSERT
rather than a failed ticket, and a digit only ever appears after a real
collision.

## There are no weekly seasons

The boards are all-time: one global leaderboard ranked by the sum of a player's
best score on each city (`v_leaderboard`,
`supabase/migrations/20260817113000_add_all_time_leaderboard.sql`). There was
never a working weekly reset — `fw_accept_run` inserts without a `season_id`, so
every row has always defaulted to 1, while `currentWeeklySeasonId()` sat in
`_lib.mjs` imported by `run/start` and called by nothing. It is gone.

The `season_id` **columns stay**. They are one integer per row, they are already
part of `board_public_city_idx` and `runs_board_idx`, and they are the seam a
seasonal board would need if one is ever wanted. Dropping them would be a
destructive migration bought with nothing, and `tools/api-auth.test.mjs` asserts
no migration ever does.

## Invariant 10 — network is optional

- `js/board/player.js`'s `registerPlayer`/`loginPlayer`/`claimName` each try
  their `api/` call and fall back to a `local-*` id/token pair on any failure
  that is not a validation error (bad name, taken name, wrong password) — the
  player keeps a usable identity even if `api/` is unreachable.
- `js/board/outbox.js` queues a finished ranked run (`enqueue`) and only
  drains it (`drain`, which posts to `/run/submit`) at boot/reconnect/focus/
  timer boundaries that `js/main.js` calls into — never from the fixed-step
  sim loop, so a slow or failed request cannot stall a frame. A non-retryable
  failure (bad shape, expired ticket) drops the entry; a retryable one
  (`error.retryable`, e.g. `429`/`503`) leaves it queued for the next drain.
- `js/board/read.js` caches every successful board read in `localStorage`
  (`fw-board-cache`) and serves the cache on a failed fetch, so a flaky
  connection degrades to "last known standings" instead of an error screen.

## Account creation inherits what the device played

`auth/register` used to adopt a prior run with a bare
`PATCH runs?id=eq.<data.run_id>` and **no ownership check of any kind** — no
device match, no `player_id is null`, no verdict check. Any run id a caller
learned was adoptable by a name they had just created. It never fired in
practice only because the shipped client passes no `run_id`, which is also why
creating an account inherited nothing at all.

Both halves are now inside `fw_register_device_player`
(`supabase/migrations/20260817124500_register_adopts_device_runs.sql`), modelled
on `fw_claim_name`, which has had this right since the beginning:

- **The gate is a `run_tickets` join.** The ticket is the only record of which
  device was issued a run, and `run_tickets` is invisible to the browser. Every
  write that moves a run under a player joins it on `t.device_key =
  p_device_key` and takes only rows where `r.player_id is null`.
- **`p_run_id` authorises nothing.** It is reported back as
  `requested_run_adopted` so registration can answer "did the run I just played
  land?" honestly, and it appears in no write.
- **The backfill is the part that publishes.** A guard on the PATCH would not
  have been enough: for an already-`verified` run, `fw_record_verdict` has
  already run, taken the `player_id is not null` branch, skipped the
  `board_public` insert, and will never run again. Re-pointing the run publishes
  nothing on its own.
- **The device's guest is upgraded, not orphaned.** Since `run/start`
  auto-provisions, this device's runs usually are not unclaimed — they belong to
  its guest. Registration takes that same row (`is_auto` and no
  `session_token_hash`, so it has never been claimed by a human), renames it,
  gives it the password, and patches the published name on every `board_public`
  row. Creating a second player and leaving "Meat Tornado" holding the scores
  would be the same invisible failure this change exists to end.

The residual trust boundary is the `device_key` itself: anyone holding it can
inherit that device's guest identity. That is the same trust `fw_claim_name` has
always placed in it (ADR-0011), not a new one.

## Auth posture

- **Public, unauthenticated:** `health`, `run/status` (device-key-scoped, not
  a secret), the read path (`js/board/read.js` hits Supabase PostgREST views
  directly with the publishable key — never through `api/`).
- **Device-key-scoped, no password:** `run/start`, `run/submit`, `name/claim`,
  `report` — gated by a 16-128 char opaque `device_key` the browser generates
  once and keeps in `localStorage` (`js/board/player.js`'s `deviceKey()`),
  used for rate-limiting and ticket binding, not for authenticating a claimed
  identity.
- **Bearer-token-scoped:** `name/rename`, `name/transfer/start`,
  `player/remove`, and the optional player binding on `run/start`/`run/submit`
  — gated by `playerForToken(player_id, token)` in `api/_lib.mjs`, which
  compares `sha256Bytes(token)` against **one of two columns, never both**:
  `players.session_token_hash` when it is non-null, otherwise
  `players.token_hash`. The precedence is exclusive rather than "whichever
  matches", and that is what makes the split safe — see **Two account kinds**
  below. The
  credential arrives under **two different field names**, and which one a
  handler must read is decided by its caller, not by preference: the `name/*`
  and `player/*` handlers are called with the stored secret spread verbatim
  (`{...playerSecret()}` in `js/board/player.js`, i.e. `player_id` + `token`),
  so they read `data.token`; `run/start` and `run/submit` are called with the
  same value explicitly renamed `player_token` (`js/board/run.js`), so they read
  `data.player_token`. `player/remove` and `name/transfer/start` accept either
  spelling. Nothing enforces this by types — a handler reading the name its
  caller does not send gets `undefined` and answers `401 PLAYER_TOKEN_INVALID`,
  which is indistinguishable from a genuine ownership failure, so both sides are
  cross-checked as text by `tools/api-auth.test.mjs` (see **Guards** below).
- **Password-scoped:** `auth/register`, `auth/login` — compares
  `HMAC-SHA256(password)` under the server-only `FW_TICKET_SECRET` against the
  `token_hash` column, which for these accounts holds the password verifier and
  nothing else.
- **Shared-secret-scoped:** `run/verify` (`CRON_SECRET`, Vercel Cron only),
  `operator` (`FW_OPERATOR_SECRET`, timing-safe header compare).
- Every rate limit and lookup key that could otherwise be a raw IP is HMACed
  under `FW_TICKET_SECRET` first (`originRateKey`) or is an opaque
  device/player id — `api/_lib.mjs` has no code path that stores a plaintext
  address.

## Two account kinds, two credential columns

`players` carries two hashes because a player can arrive by two doors, and the
credentials those doors issue are not the same kind of thing.

| | Created by | `token_hash` holds | `session_token_hash` holds |
|---|---|---|---|
| **Device-token account** | `name/claim`, re-issued by `name/transfer/redeem` | `sha256(bearer token)` | null |
| **Password account** | `auth/register`, re-issued by `auth/login` | `HMAC-SHA256(password)` under `FW_TICKET_SECRET` — the password verifier | `sha256(bearer token)` |

`playerForToken()` picks **one** column by account kind: `session_token_hash`
when it is non-null, `token_hash` otherwise. Never "either one matches". Two
things depend on that being exclusive rather than permissive. A password
account's `token_hash` is a password digest, and it must never be reachable as
a bearer target. And nulling `session_token_hash` has to *revoke* a session
rather than quietly fall through to the other column — which is exactly what
`fw_remove_player` and `fw_transfer_redeem` now rely on when they clear it
(`supabase/migrations/20260816214501_add_player_session_token_hash.sql`), so a
retired or transferred name cannot leave the old device holding a token that
still validates.

Before that migration there was only `token_hash`, and it was carrying both
meanings at once. It could not: `auth/register` wrote the password digest and
then handed the browser a random token whose hash was stored nowhere, so
`playerForToken()` was comparing `sha256(token)` against
`HMAC-SHA256(password)` — different function, different input, no value
satisfying both. Every password account was therefore created holding a
credential that authenticated nothing. It could not rename itself, remove
itself or start a transfer, and because `js/board/run.js`'s `startTicket()`
sends the player binding whenever a secret exists and `run/start` rejects an
invalid one outright, it could not get a ranked ticket at all — every run those
players finished was silently `unranked`. The `name/claim` →
`name/transfer/redeem` pair was always correct and is the pattern the password
pair now follows.

Two consequences worth knowing rather than rediscovering:

- **One session hash per account**, so a password login on a second device
  signs the first one out. Deliberate: it is the only way a bearer token the
  browser keeps forever can be revoked.
- **Redeeming a transfer code retires the password.** `fw_transfer_redeem`
  overwrites `token_hash` with the new device token's hash, and for a password
  account that value *was* the password verifier. This predates the session
  column and is unchanged by it, but it means transfer-redeem converts a
  password account into a device-token account.

`playerForToken()` reads the row with `select=*` rather than a column list, and
that is load-bearing: PostgREST rejects an entire request that names a column
the database does not have, so a narrowed list would have taken **device** auth
down on any deployment that reached production before the migration was applied
by hand. Widening the projection is free here — nothing echoes the row to a
client, and callers read `id` and `name` only.

## Known gaps (read the code before trusting these paths)
- `RANKED_SCENES` is declared identically in `api/_lib.mjs` and
  `js/board/config.js` — necessarily, since one ships to the server bundle
  and the other to the browser, but a scene added to one and not the other is
  a silent drift risk with no test catching it today.
- **The `local-*` identity trap.** `js/board/player.js`'s `registerPlayer`,
  `loginPlayer` and `claimName` each fall back to a fabricated
  `{player_id: 'local-…', token: 'local-token-…'}` on any non-validation
  failure, and `savePlayerSecret()` persists it. `js/board/run.js`'s
  `startTicket()` then sends that pair on every later request, and `run/start`
  rejects an invalid binding outright with `401 PLAYER_TOKEN_INVALID` — so one
  offline moment permanently un-ranks the browser until localStorage is
  cleared. The server side cannot fix this (a 401 for a `player_id` that is not
  a UUID is the correct answer), and `js/**` is out of scope for the change
  that documented it. Nothing here makes it worse: auto-provisioning only runs
  when NO binding was sent, so a browser holding a `local-*` secret takes the
  401 branch before reaching it and gets the same result it does today. The fix
  belongs in `js/board/player.js` — do not write a credential the server never
  issued; leave the secret absent and let `run/start` provision a real one.

## Guards

`api/` cannot be exercised by the headless validator: the handlers want
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `FW_TICKET_SECRET` plus a live
Postgres before they do anything, and their callers (`js/board/*.js`,
`js/ui/boards.js`, `js/operator.js`) touch `localStorage` and `document` at
module scope. `tools/api-auth.test.mjs` — spawned by `validateMultiplayer()` in
`tools/validate.mjs`, so it runs under plain `node tools/validate.mjs` — closes
that hole lexically instead. It reads both sides as text and asserts, for every
endpoint and the client call that targets it, that the field names agree in both
directions: no field the browser posts is ignored by the handler, and no
`data.<field>` the handler reads goes unsent. Tolerated reads (the
`player_token` alias) must be declared with a reason, and the table is checked
against a walk of `api/` itself, so a new endpoint cannot ship without declaring
its caller. Its second half asserts that any handler minting a bearer token with
`newDeviceToken()` also persists `sha256Hex(token)` — all four do — and that the
migration adding `session_token_hash` exists, is `if not exists`, clears the
column in both `fw_remove_player` and `fw_transfer_redeem`, and is matched by a
`playerForToken()` that still falls back to `token_hash` for device accounts.
Its `BLOCKED_ON_SCHEMA` list is empty and expected to stay so; entries there
require a stated reason and clear themselves once the endpoint starts
persisting.

Its third section covers automatic identity and adoption, and is part lexical,
part real:

- **Real.** `api/_lib.mjs` and `api/_names.mjs` are both importable headlessly
  (neither touches env or the database at module scope), so the claim "a
  generated name always passes the rules a typed name has to pass" is checked by
  generating 1,200 names and running `normaliseName()` and the blocklist screen
  over them — not by reading the source that is supposed to call them.
- **Lexical.** That `run/start` provisions only on the unbound path and only
  *after* the rate limit; that `register` no longer writes `runs` directly and
  goes through the RPC; that every `update public.runs` in the new migration
  joins `run_tickets` on the device key, takes only `player_id is null` rows,
  and never keys off `p_run_id`; that the migration backfills `board_public`
  idempotently; that its grants are revoked from `anon`/`authenticated`; that
  no `currentWeeklySeasonId` survives under `api/`; and that no migration ever
  drops `season_id`.
- **One class worth naming.** A plpgsql function whose `returns table(...)`
  names a column that also exists on a table it updates makes that name
  ambiguous in any unqualified reference, and `plpgsql.variable_conflict =
  error` raises **at run time** — `create function` never plans the body, so
  the migration applies cleanly and the function fails the first time a real
  player reaches it. `fw_transfer_redeem` shipped that way
  (`token_version = token_version + 1` with a `token_version` OUT column) and is
  re-created with the reference qualified in
  `20260817124500_register_adopts_device_runs.sql`. Both functions that return a
  `token_version` and increment it are now pinned by the test, as is the
  `session_token_hash = null` line the re-creation had to carry forward.

## Applying a migration

There is **no automated path**. The repo has no `.github/` workflow, no
`supabase/config.toml`, and no `package.json`, so nothing runs SQL on push;
`vercel.json` deploys the static site and the functions and never touches the
database. The only tooling evidence is `supabase/.temp/`, the link state written
by a manual `supabase link` (project ref `zrsrvhrkgfuqhcjnjezw`, Postgres 17.6).
A migration is applied by a human running `supabase db push` from a linked
checkout, or by pasting the file into the Supabase SQL editor.

The ordering consequence is the part worth remembering: **code deploys itself,
schema does not.** Push a commit and Vercel serves the new `api/` within a
minute, while the migration sits unapplied until someone runs it. Everything in
`api/` therefore has to survive its own schema arriving late — which is why
`playerForToken()` uses `select=*` and why every other `players?select=` names
only long-standing columns.

Two migrations are currently written and **not yet applied**:

| File | Adds | Behaviour until it is applied |
|------|------|-------------------------------|
| `20260817113000_add_all_time_leaderboard.sql` | `v_leaderboard` (the one global all-time board) + a supporting index | Reads of `v_leaderboard` 404; every existing board is unaffected |
| `20260817124500_register_adopts_device_runs.sql` | `players.is_auto`, `fw_register_device_player`, and a re-created `fw_transfer_redeem` with its ambiguous reference qualified | `ensureDevicePlayer()` catches the PostgREST 400 on the unknown `is_auto` column and issues today's unbound guest ticket; `auth/register` answers `503 SERVICE_UNAVAILABLE` (retryable) on the missing RPC rather than creating a half-account. Degraded, never broken — but no board fills up until it is applied |

## Gotchas

- `api/_verify.mjs` and `api/run/submit.mjs` both import `js/voxelsim.js` and
  `js/replay.js` directly — the server replay is just another caller of the
  same pure-sim module the browser and `tools/validate.mjs` use (ADR-0002),
  not a reimplementation. Anything that breaks determinism there (a
  `Math.random()`, a non-`fwmath.js` transcendental) breaks ranked scoring on
  the server, not only local play.
- `api/_lib.mjs`'s `body()` accepts an already-parsed `req.body` object
  (Vercel's default) or reads and JSON-parses the raw stream itself, capped
  at 64 KB (`MAX_REQUEST_BYTES`) — a request over that limit throws before
  any handler logic runs.
- `errorResponse()` treats a `TypeError`/`RangeError` as a 400 (bad input,
  the caller's fault), a "missing server environment" `Error` as a 503 with
  `retryable: true` (misconfiguration, not the caller's fault), and anything
  else as a 503 with the real error only in server logs — no handler should
  throw a raw error straight to `res` itself.
- `run/submit.mjs`'s `placementGate()` only runs when `fw_accept_run` returns
  `pending` — a run outside the current top 25 for its scene is marked
  `unranked` without spending a server replay on it, and the trace is kept
  regardless so it can be re-verified later if the bar moves.
