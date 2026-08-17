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
| `api/_verify.mjs` | — | Server-side replay verification: `verifyReplay()` decodes a stored input trace, rebuilds a `VoxelSandboxSim` for the claimed scene/seed, asserts the ranked tune was not silently swapped, steps it tick-for-tick, and floors `sim.hole.mass` into the score that actually gets published. `drainOnePendingRun()` is the unit the cron endpoint calls |
| `api/health.mjs` | GET | Deployment smoke probe. Reveals no environment state; a 200 means the function bundle booted, nothing more |
| `api/auth/register.mjs` | POST | Password-based account creation: validates the name (blocklist + reserved words + per-IP daily cap of 8), stores `token_hash = HMAC-SHA256(password)` under `FW_TICKET_SECRET`, mints a bearer `token` for the response, optionally links a just-played `run_id` to the new player |
| `api/auth/login.mjs` | POST | Password check against the stored `token_hash`, mints a fresh bearer `token` for the response. See **Known gaps** below — this token is not usable the way the name-claim token is |
| `api/name/claim.mjs` | POST | The guest-first path (ADR-0011): mints a device token, sends only its SHA-256 hash to `fw_claim_name` (Postgres RPC), links the run that earned the claim. No password |
| `api/name/rename.mjs` | POST | Renames an already-claimed player; gated by `playerForToken(player_id, token)`, then patches both `players` and the `board_public` view's cached name |
| `api/name/transfer/start.mjs` | POST | Mints a 6-character, unambiguous-alphabet transfer code (rejection-sampled to avoid modulo bias) with a 10-minute TTL, for moving a claimed name to a second device |
| `api/name/transfer/redeem.mjs` | POST | Consumes a transfer code via `fw_transfer_redeem`, mints a new bearer token, hashes it server-side before returning it — this is the pattern `auth/login.mjs` is missing |
| `api/player/remove.mjs` | POST | Deletes a claimed name via `fw_remove_player`, gated by `playerForToken`. See **Known gaps** — the field name it reads does not match what the client sends |
| `api/run/start.mjs` | POST | Ranked-run ticket issuance: requires `FW_BOARDS_ACCEPTING=true`, checks the scene is in `RANKED_SCENES`, rate-limits per device (12/hr) and per hashed origin (60/hr), returns an HMAC ticket (`makeTicket`) binding run id + seed + scene + tune + issuer + timestamp |
| `api/run/submit.mjs` | POST | Ranked-run submission: validates the ticket signature, re-authenticates the claimed player if the ticket has one, checks the trace shape (tick count, tune id, sim version), is idempotent on `run_id`, rate-limits (20/hr device and origin), and — this is invariant 8 — stores the trace via `fw_accept_run` and returns only a `verdict`, never a browser-computed score |
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
  compares `sha256Bytes(token)` against the `players.token_hash` column.
- **Password-scoped:** `auth/register`, `auth/login` — compares
  `HMAC-SHA256(password)` under the server-only `FW_TICKET_SECRET` against the
  same `token_hash` column. See **Known gaps**: this is a second, incompatible
  meaning for one column.
- **Shared-secret-scoped:** `run/verify` (`CRON_SECRET`, Vercel Cron only),
  `operator` (`FW_OPERATOR_SECRET`, timing-safe header compare).
- Every rate limit and lookup key that could otherwise be a raw IP is HMACed
  under `FW_TICKET_SECRET` first (`originRateKey`) or is an opaque
  device/player id — `api/_lib.mjs` has no code path that stores a plaintext
  address.

## Known gaps (read the code before trusting these paths)

- **`api/player/remove.mjs` reads the wrong field.** It calls
  `playerForToken(data.player_id, data.player_token)`, but
  `js/board/player.js`'s `removePlayer()` posts `secret` verbatim — a
  `{player_id, token}` object, never `player_token`. `data.player_token` is
  therefore always `undefined` and every remove request fails with
  `401 PLAYER_TOKEN_INVALID`. Compare `api/name/rename.mjs`, which reads
  `data.token` and works with the same client shape. Not fixed here — this is
  a wiki, and `api/` is out of this pass's scope — but it means "remove my
  claimed name" is currently unreachable from the shipped client.
- **`auth/register.mjs`/`auth/login.mjs` mint a token that cannot later
  authenticate.** Both store/check `token_hash` as `HMAC-SHA256(password)`
  and then hand back an unrelated random `token = newDeviceToken()` for the
  browser to keep. `js/board/player.js` saves that token as the player's
  bearer secret (`savePlayerSecret`) and later calls (`name/rename`,
  `name/transfer/start`, `player/remove`, the optional player binding on
  `run/start`/`run/submit`) all present it to `playerForToken()`, which
  hashes it with plain `sha256Bytes` and compares to `token_hash` — the
  *password's* digest, computed with a different (keyed HMAC) function over a
  different input. No token value satisfies both, so a player who registers
  or logs in with a password, rather than the device-token `name/claim` path,
  gets `PLAYER_TOKEN_INVALID` on every subsequent authenticated call. The
  `name/claim` → `name/transfer/redeem` pair does this correctly (mints a
  token, stores `sha256Hex(token)`, later checks match) — it is the pattern
  the password pair should follow.
- `RANKED_SCENES` is declared identically in `api/_lib.mjs` and
  `js/board/config.js` — necessarily, since one ships to the server bundle
  and the other to the browser, but a scene added to one and not the other is
  a silent drift risk with no test catching it today.

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
