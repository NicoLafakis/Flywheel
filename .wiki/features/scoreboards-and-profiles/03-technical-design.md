# Scoreboards & Profiles — Technical Design

> [Objective overview](00-objective-overview.md) · [Requirements](02-requirements.md) ·
> [Anti-cheat](04-anti-cheat.md) · [Identity](05-identity-and-names.md) ·
> [Threat model](07-threat-model.md) · [Migration](11-migration-plan.md)

Where the code lives, what shape the data takes, what every call over the wire
looks like, and what the game does when the wire is not there.

Decisions recorded elsewhere and **not relitigated here**:
[ADR-0002](../../adr/0002-sim-render-split.md) (the pure-sim boundary that makes
headless verification possible), [ADR-0003](../../adr/0003-deterministic-seeded-generation.md)
(determinism), [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md)
(vendored, same-origin, no build step), and the two new ADRs in
[`adr-proposed/`](adr-proposed/).

---

## 1. Shape of the thing

```
   BROWSER (static, no build step)
   ┌──────────────────────────────────────────────────────┐
   │  js/main.js  ── state machine, fixed-step loop        │
   │      │ records intent into a preallocated Int8Array   │
   │      ▼                                                │
   │  js/board/*  ── NEW. fetch() only. No SDK, no socket. │
   │      run tickets · trace codec · outbox · board reads │
   └───────┬──────────────────────────────▲───────────────┘
           │ POST (writes)                │ GET (reads)
           ▼                              │
   ┌───────────────────┐        ┌─────────┴─────────────────┐
   │  Vercel Functions │        │  Supabase PostgREST        │
   │  /api/run/start   │        │  read-only views, RLS,     │
   │  /api/run/submit  │──────► │  publishable key           │
   │  /api/name/claim  │ secret └────────────────────────────┘
   │  … imports js/voxelsim.js directly, same as
   │    tools/validate.mjs does. One physics impl.
   └───────────────────┘
```

**Two rules govern the split, and they are the same rule in two directions.**
Reads go straight to PostgREST under RLS, because a read cannot be wrong in a way
that survives, and because a board view is the cheapest thing in the system.
Writes go through a Vercel Function under the secret key, because a write can be
wrong permanently and because the verification has to happen somewhere the client
cannot reach.

### 1.1 New invariants

To be appended to `AGENTS.md` § *Non-negotiable invariants* as items 7–9, in the
same commit as the first `js/board/` file:

> 7. **No client-writable score.** No request body, no column, no view, and no
>    RPC accepts a score from a client. A number reaches a board only by being
>    recomputed inside `/api/run/submit`. `runs.claimed_score` exists for exactly
>    one purpose — deciding whether to spend CPU verifying — and is never
>    displayed, compared, or stored as a result.
> 8. **The board layer never writes sim state and imports no three.js.**
>    `js/board/**` talks to `js/main.js` and to the network. It is imported by
>    Node (the verifier) where three.js does not exist.
> 9. **The network is optional at every point.** `index.html` boots, every city
>    runs, and every local record is written with `js/board/**` never imported and
>    the machine in airplane mode. A code path where a network failure can block
>    gameplay is a bug, not a degraded mode.

Plus one convention with teeth, for `.wiki/conventions.md`: **no `await` inside
`frame()`.** The fixed-step loop is synchronous and stays synchronous. The board
layer deposits into plain objects and the loop reads them.

---

## 2. What "per city" and "overall" mean

### 2.1 Per city — CITY RECORDS

One board per ranked city, ranked on **verified score** (the combo-multiplied
`hole.mass` that [ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md)
already made the game's one score), descending, over a **90-second RUN**
([04](04-anti-cheat.md) §5.1). Best-per-player: one row per player per city, their
best verified run. Ties break by who got there first.

A city is ranked only once its 90-second replay has been measured inside the
budget (T-901). Cities that have not been measured are simply not offered as
ranked cities yet; they remain fully playable.

### 2.2 Overall — THE FLYWHEEL

**Decision: the overall standing is a points table across the per-city boards,
not a sum of scores and not a single best run.**

The reason is a fact about the game, not a matter of taste: **raw scores are not
comparable between cities.** The cities differ by several times in total mass and
in how densely that mass is packed, so the same 90 seconds of equally good play
produces wildly different numbers in Chicago and in Brooklyn. Two obvious
definitions both break on this:

- *Sum of your per-city bests* is dominated by whichever city has the biggest
  numbers. It reads as a measure of skill and is actually a measure of which city
  you played.
- *Your single best score anywhere* collapses to the same thing, and worse: within
  a week everyone plays only the highest-scoring city and the other six boards die.

So the overall board has to normalise, and the legible way to normalise is to rank
first and score the ranks:

> **THE FLYWHEEL.** You earn points for where you finish on each city's board.
> Your overall standing is your points added up.

| Place on a city board | Points |
|---|---|
| 1st | 100 |
| 2nd | 80 |
| 3rd | 65 |
| 4th | 55 |
| 5th | 45 |
| 6th–10th | 40, 36, 32, 28, 24 |
| 11th–25th | 20 down to 6, by ones and twos |
| 26th and below, on the board at all | 3 |

Why this and not something cleverer:

- **It is explainable in one sentence to someone who has never seen a leaderboard
  before**, which no weighted-average or percentile scheme is.
- **It rewards breadth without punishing depth.** A player who is 1st in one city
  and nowhere else has 100. A player who is 8th in all seven has 224. Both are
  real achievements and both are visibly reachable from the other.
- **A new player can see the next step.** "You are 12th in Chicago. Ninth is worth
  4 more points." A summed-score board cannot say that.
- **It self-normalises when a city is added.** Chicago shipped this month; an
  eighth city will ship eventually. Points tables absorb that; sums do not.

The costs, named:

- **Your standing changes when other people play**, because a rank can be taken
  from you without you doing anything. This is correct for a competition and it is
  the same property every sports table has, but it must be *shown* rather than
  discovered: the profile says "12th in Chicago" next to the points, so a drop has
  a visible cause.
- **Rank is computed at read time, never stored.** A stored rank is a column that
  is wrong the instant anyone else plays. `row_number()` in a view.
- **A deep board inflates cheaply.** Being 300th in seven cities is 21 points. The
  floor value of 3 is deliberately small so that "on the board" is worth
  something and worth almost nothing.

Deferred deliberately: a season reset. `season_id` exists on every ranked row from
day one so that a reset is an `insert` and a `where`, and nothing else.

---

## 3. Data model

Postgres, `public` schema, RLS on **every** table with no exceptions. `uuid` PKs
defaulted `gen_random_uuid()`, `timestamptz` everywhere, `citext` for anything
compared case-insensitively, `created_at` on every row.

### 3.1 `players`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | The stable public identity. Board rows point here, never at a name. |
| `name` | `text` NOT NULL | What the player typed. Display form. |
| `name_key` | `text` NOT NULL UNIQUE | The folded uniqueness key — see [05](05-identity-and-names.md) §3.2. Never displayed. |
| `token_hash` | `bytea` NOT NULL | SHA-256 of the device-held bearer. The token itself is never stored. |
| `token_version` | `int` NOT NULL DEFAULT 1 | Incremented by a transfer; invalidates the old device. |
| `moderation_state` | `text` NOT NULL DEFAULT `'ok'` | `ok` \| `renamed` \| `hidden`. See [06](06-privacy-and-moderation.md). |
| `created_at`, `last_seen_at` | `timestamptz` | |

Indexes: unique on `name_key`; `btree (last_seen_at)` for the purge job.

There is deliberately **no email, no password hash, no auth-provider column, and
no `auth.users` foreign key.** This table is the entire identity system.

### 3.2 `runs`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `player_id` | `uuid` NULL FK → `players` | NULL until a name is claimed; backfilled on claim so a pre-name run still counts. |
| `season_id` | `int` NOT NULL DEFAULT 1 | The cheap future-proofing. Nothing queries it yet. |
| `scene_id` | `text` NOT NULL | `'chicago'`, `'brooklyn'`, … |
| `mode` | `text` NOT NULL DEFAULT `'run90'` | Check constraint. A 60-second fallback or a daily is a new value, not a new table. |
| `seed` | `text` NOT NULL | Server-minted. |
| `tick_count` | `int` NOT NULL | Must equal the mode's exact length. |
| `tune_id` | `text` NOT NULL | Which pinned physics tune this was run and verified at. See [04](04-anti-cheat.md) §5.2. |
| `sim_version` | `int` NOT NULL | Bumped by hand when sim behaviour changes. A cross-version replay is *unverifiable*, never *invalid*. |
| `client_build` | `text` NOT NULL | Git short SHA. |
| `claimed_score` | `numeric` NOT NULL | **Read once, by the placement gate. Never displayed, never ranked.** |
| `verified_score` | `numeric` NULL | What the server computed. The only number a board reads. |
| `stats` | `jsonb` NOT NULL DEFAULT `'{}'` | Server-computed: `raw_mass`, `best_combo`, `eaten`, `size`, `consumed_fraction`. A new metric needs no column. |
| `verdict` | `text` NOT NULL DEFAULT `'pending'` | `pending` \| `verified` \| `unranked` \| `unverifiable` \| `mismatch` \| `flagged` |
| `verdict_detail` | `jsonb` NULL | Divergence tick, expected vs actual, replay ms. |
| `created_at`, `verified_at` | `timestamptz` | Server clock. Not client-writable. |

Indexes: `(scene_id, season_id, verified_score desc) where verdict = 'verified'`;
`(player_id, created_at desc)`; `(verdict) where verdict = 'pending'`.

**The six verdicts are load-bearing and each says something different.**
`unverifiable` means we could not replay it (sim version drift) and is **not an
accusation** — it shows in the player's own history and on no board.
`mismatch` means the replay disagreed, which is a cheat *or our bug*, and the row
alone cannot tell them apart, which is why `verdict_detail` carries the divergence
tick. `unranked` means we chose not to spend CPU because it could not place
([04](04-anti-cheat.md) §5.5). `flagged` means it verified but the heuristics
dislike it; it is kept off the displayed board and is not deleted.

### 3.3 `run_inputs`

| Column | Type | Notes |
|---|---|---|
| `run_id` | `uuid` PK, FK → `runs` ON DELETE CASCADE | |
| `encoding` | `text` NOT NULL | `'rle-i8-v1'` |
| `payload` | `bytea` NOT NULL | |
| `byte_len` | `int` NOT NULL | Cheap guard before decode. Hard reject above 32 KB. |
| `sha256` | `bytea` NOT NULL UNIQUE | Content address; the idempotency key. |

A separate table, not a column, for three reasons that have not changed since
`online-flywheel` first wrote them down: board queries must never accidentally
pull a blob, the retention job must be able to delete traces without deleting
scores, and the RLS policy differs — nobody reads a trace, including the player
who made it, except the verifier under the secret key.

**The trace is also the ghost replay** ([00](00-objective-overview.md)
"Unlocks"), which is why retention is 180 days rather than ADR-0012's 30.

### 3.4 `run_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | The `run_id` the client will submit under. |
| `player_id` | `uuid` NULL FK → `players` | |
| `device_key` | `text` NOT NULL | For rate-limiting a player who has no name yet. |
| `scene_id`, `seed`, `mode`, `tune_id` | | The signed contents. |
| `issued_at` | `timestamptz` NOT NULL | |
| `redeemed_at` | `timestamptz` NULL | **Set atomically at redemption.** A ticket is single-use by a conditional UPDATE, not by application care. |

### 3.5 `name_transfers`

| Column | Type | Notes |
|---|---|---|
| `code` | `text` PK | Six chars from `js/net/arena.js`'s existing `ROOM_CODE_ALPHABET`. Reuse it; do not mint a second alphabet. |
| `player_id` | `uuid` NOT NULL FK → `players` | |
| `expires_at` | `timestamptz` NOT NULL | +10 minutes. |
| `redeemed_at` | `timestamptz` NULL | Single use. |

### 3.6 `blocked_names` and `moderation_reports`

`blocked_names` (`pattern text PK`, `severity int`, `category text`, `is_exact bool`)
— seeded from a vendored copy of a permissively-licensed list; see
[06](06-privacy-and-moderation.md) §3. No client role has any access.

`moderation_reports` (`id`, `player_id`, `reporter_device_key`, `created_at`) —
insert-only from the client, readable by nobody except the operator page.

### 3.7 `submission_log`

`(player_id | device_key, kind, at)` with a partial index, for rate limiting.
Counted in Postgres and not in function memory, because function instances are not
shared and an in-memory counter is a limit that does not exist.

### 3.8 The read views

Boards are read through views, never tables, and the views select exactly the
columns a board needs.

```sql
-- v_city_board: rank computed at read time, never stored.
create view v_city_board with (security_invoker = true) as
select r.scene_id, r.season_id,
       row_number() over (partition by r.scene_id, r.season_id
                          order by r.verified_score desc, r.verified_at asc) as rank,
       p.id as player_id, p.name, r.verified_score as score, r.verified_at
  from runs r join players p on p.id = r.player_id
 where r.verdict = 'verified' and p.moderation_state = 'ok'
   and r.id = (select id from runs r2
                where r2.player_id = r.player_id and r2.scene_id = r.scene_id
                  and r2.season_id = r.season_id and r2.verdict = 'verified'
                order by r2.verified_score desc, r2.verified_at asc limit 1);

-- v_overall: THE FLYWHEEL. Points per §2.2, summed.
create view v_overall with (security_invoker = true) as
select player_id, name, sum(fw_rank_points(rank)) as points,
       count(*) as cities, min(rank) as best_rank
  from v_city_board group by player_id, name;
```

`fw_rank_points(int)` is an immutable SQL function holding the §2.2 table. It is a
function and not a literal so the curve can be changed in one place, and it is
`immutable` so the planner can inline it.

**Two things a reviewer must check.** The views filter on
`moderation_state = 'ok'`, so hiding a player removes them from every board
instantly with no backfill job. And `security_invoker = true` means RLS still
applies underneath rather than the view becoming a hole around it.

### 3.9 RLS intent

| Table / view | `anon` (the publishable key) | secret key |
|---|---|---|
| `v_city_board`, `v_overall` | `select` | all |
| `players`, `runs`, `run_inputs`, `run_tickets`, `name_transfers`, `submission_log`, `blocked_names` | **none** | all |
| `moderation_reports` | `insert` only, rate-limited at the edge | all |

**`anon` has no insert and no update on any table that holds a score, a name, or
a token.** The publishable key already ships in the browser — `js/net/supabase-config.js`
says so explicitly and correctly — so this is the boundary that matters, and it
is verified by an automated deny test rather than by reading the policies
([08-test-strategy.md](08-test-strategy.md) §3).

---

## 4. API contract

Envelope, shared by every endpoint:

```jsonc
{ "ok": true,  "data": { /* … */ } }
{ "ok": false, "error": { "code": "TICKET_EXPIRED", "message": "…", "retryable": false } }
```

`code` is a stable machine string; the client switches on it and never on
`message`. `retryable` tells the outbox whether to hold the item or drop it.

### `POST /api/run/start`

**Request** `{ scene_id, mode: "run90", device_key, player_token? }`
**Response** `{ run_id, seed, scene_id, mode, tune_id, issued_at, ticket }`

`ticket` is `HMAC-SHA256(secret, run_id|seed|scene_id|mode|tune_id|player_id|issued_at)`.
The `run_tickets` row is written **before** the seed is returned, and redemption
is a conditional UPDATE on `redeemed_at is null` — the ordering matters, and the
reason is a 2026 postmortem where an attacker branched repeatedly from one game
state because the token was consumed too late
([04](04-anti-cheat.md) §4.2).

Rate limits per [04](04-anti-cheat.md) §7. On failure the client **still starts
the run** — the player plays, the run is recorded locally, and it simply is not
ranked. A rate limit must never look like a broken game.

### `POST /api/run/submit`

**Request** — the shape is in [04](04-anti-cheat.md) §5.3. There is no score
field beyond `claimed_score`, whose only reader is the placement gate.

**Response**

```jsonc
{ "ok": true, "data": {
  "run_id": "…", "verdict": "verified", "verified_score": 12480,
  "city": { "scene_id": "chicago", "rank": 4, "previous_rank": 11 },
  "overall": { "points": 178, "rank": 22, "previous_rank": 31 },
  "replay_ms": 31240
} }
```

Rank and previous rank are in the response because the results screen is the
emotional payload of the whole feature and it must not need a second round trip
to render it.

**Verification is asynchronous.** The function writes the run as `pending`,
returns immediately with the local score marked as unverified, and a queue drain
does the replay. At ~33 s of CPU, holding an HTTP request open is neither
necessary nor kind. The client shows "VERIFYING" and resolves on the next board
read or a short poll. This is the same call ADR-0012 §7.4 made for sandbox runs,
and here it applies to everything.

### `POST /api/name/claim`

**Request** `{ name, device_key, run_id? }`
**Response** `{ player_id, token, name }` — or
`{ ok: false, error: { code: "NAME_TAKEN", suggestions: ["SPROCKET7", …] } }`

The token is returned exactly once and is never retrievable again. If `run_id` is
present, the run that triggered the claim is backfilled with the new `player_id`
in the same transaction, so the run that earned the name is the run that shows up
on the board.

### `POST /api/name/transfer/start` · `POST /api/name/transfer/redeem`

[05](05-identity-and-names.md) §4.2. Redeem mints a new token, increments
`token_version`, and returns the new token; the old device's token stops
verifying on its next call.

### `POST /api/report`

`{ player_id }`. Insert-only, one per device per player per day.

### Reads — direct to PostgREST, no function invocation

| Call | Cache |
|---|---|
| `GET /rest/v1/v_city_board?scene_id=eq.chicago&order=rank&limit=25` | 30 s SWR |
| `GET /rest/v1/v_city_board?player_id=eq.<me>` | 30 s SWR |
| `GET /rest/v1/v_overall?order=points.desc&limit=25` | 30 s SWR |

Plain `fetch` with an `apikey` header. **No Supabase SDK is added to the
browser.** `js/net/client.js` vendors `@supabase/realtime-js` only, for the arena,
and nothing here needs a socket. Adding `supabase-js` would mean either a CDN
import (which `validateOfflineBoot()` in `tools/validate.mjs` fails by design) or
~500 KB more vendored bytes for two GET requests.

---

## 5. Where the server code lives, and the one real tension

The verifier must `import` the shipping `js/voxelsim.js`. On Vercel that is an
`api/` directory with relative imports and it is the whole reason Vercel was
chosen ([04](04-anti-cheat.md) §5.6).

**The tension.** [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md)
committed this repo to *"No `package.json`, no lockfile, no bundler"*, and its
reasoning is load-bearing: what is committed is byte-for-byte what the browser
gets, which is what lets `tools/validate.mjs` import the shipping modules with no
transform in between.

**The resolution, and why it is not a violation.** Vercel's Node runtime serves
`api/*.mjs` as ES modules. A function that imports only relative paths from this
repo and no npm package needs no dependency manifest and no bundler. The static
site is untouched: `index.html` still has one importmap entry pointing at
`./js/vendor/three.module.js`, the browser still gets raw ES modules, and
`validateOfflineBoot()` still passes because it inspects `index.html` and nothing
in `api/` is a boot dependency. The deploy story changes from "copy the repo root
to any static host" to "copy the repo root to any static host, and the boards need
Vercel" — which is honest, and which the game degrades gracefully without.

**What must be verified before T-301 starts**, because this paragraph is inference
until somebody deploys one:

1. That a zero-dependency `api/*.mjs` function deploys on this project with no
   root `package.json`. If it does not, the fallback is a `package.json` scoped
   **inside `api/`** with no dependencies, which leaves the repo root and the
   static-host story intact. This is the only acceptable fallback; a root
   `package.json` with dependencies is an ADR-0014 supersession and needs to be
   argued, not slipped in.
2. That the function bundle stays inside Vercel's 250 MB uncompressed limit.
   `js/voxelscene-cambridge.js` alone is 680 KB and the scene set is ~1.4 MB of
   source, so this is comfortable — but the **cold-start parse cost** of that much
   module source is real and is part of the ~6 s scene-build figure in
   [04](04-anti-cheat.md) §2.2. Mitigation: the verifier is one function per
   ranked scene, or it lazy-`loadScene()`s exactly the one it needs — `voxelsim.js`
   already exposes `loadScene(scene)` returning a cached builder, so the machinery
   exists.
3. Which Vercel plan this project is on. Hobby's 4 CPU-hours/month is the binding
   budget and Hobby is non-commercial-only.

---

## 6. Client modules

```
js/replay.js         PURE. Trace encode/decode. Imported by the browser, by
                     tools/validate.mjs, and by api/. One implementation.
                     Joins the no-Math.random() guard list.
js/fwmath.js         PURE. Deterministic sqrt-based hypot and the bounded-domain
                     sin/cos polynomial (04 §3A.3). Joins the guard list.

js/board/config.js   API base, publishable key, build sha, ranked-scene list,
                     feature flags. The only file a deploy rewrites. No logic.
js/board/player.js   Name claim, the fw-player token, transfer codes.
                     Owns currentPlayer().
js/board/run.js      Ticket lifecycle: start a ranked run, hold the trace,
                     build a submission.
js/board/outbox.js   Durable localStorage queue, drained on reconnect.
                     Idempotent by run_id. The reason bad wifi costs nothing.
js/board/read.js     Board queries + the SWR cache.

js/ui/boards.js      The RECORDS screen and the PROFILE screen. UI layer, not
                     network layer — consumes js/board/* the way js/ui/screens.js
                     consumes save.js.
```

### 6.1 Changes to existing files, kept deliberately small

| File | Change |
|---|---|
| `js/main.js` | Append two `int8`s to a preallocated `Int8Array` inside the existing fixed-step loop — one line, no allocation, no branch on network state. Recording happens **always**, online or off. A `'run90'` mode that stops the clock at 5,400 ticks. |
| `js/save.js` | v16 → v17: `player: { id, name, claimedAt }` and `outbox: []`. Added to **both** `freshSave()` and `MIGRATIONS[16]`. See [11](11-migration-plan.md). |
| `js/ui/screens.js` | One status-strip cell, one line per city chip, one panel on `showSandboxResults`, one entry point to RECORDS. |
| `js/quality.js` | Nothing. The ranked tune lives in `js/voxelsim.js` next to the existing defaults, so the graphics tier and the ranked tune cannot be confused for each other. |
| `tools/validate.mjs` | `js/replay.js` and `js/fwmath.js` on the guard list; a trace-codec round-trip property check; and the fixture that is the real gate — record a run in a browser, replay it in Node, assert the same score. |
| `AGENTS.md` | Invariants 7–9 (§1.1). |

---

## 7. Surfaces

Everything lands in surfaces that already exist. `.wiki/modules/ui.md` states the
rule this design is built to: everything the landing screen says about the player
comes from functions that read the save, and **a record never set renders no cell,
not a zero.** The same rule applies to every board field.

- **Title screen status strip.** One more cell, only once a name exists:
  `NICO · THE FLYWHEEL #22 · 178 pts`. Before that, nothing — no prompt, no
  "sign in", no empty state.
- **Title screen card shelf.** Each city chip already renders
  `CLEARED ×3 · BEST SIZE 7` into `.fw-chip-progress`. When the player is on that
  city's board, a second line: `#4 IN CHICAGO · 12,480`. Same slot, same class, no
  new layout.
- **Results screen (`showSandboxResults`).** The local score shows **instantly**,
  as it does today, labelled `YOUR RUN`. A chip beneath it resolves a beat later
  to `VERIFIED · #4 IN CHICAGO`, or holds at `WILL SUBMIT WHEN ONLINE`. It never
  blocks, never spins indefinitely, and never moves the buttons.
- **RECORDS screen** (new, `js/ui/boards.js`). Tabs: THE FLYWHEEL, then one per
  ranked city. Top 25, then a gap, then your row with two neighbours either side.
- **PROFILE screen** (new). [05](05-identity-and-names.md) §5.
- **Brand.** All of it uses the existing `.fw-*` layer — `.fw-status`, `.fw-stat`,
  `.fw-chip`, `.fw-chips`, `.fw-group`, the `--fw-*` tokens, the 660 px content
  column. [ADR-0005](../../adr/0005-shared-brand-layer.md) says do not fork it,
  and there is nothing here that needs a new primitive.

---

## 8. What happens when the wire is not there

| Situation | Behaviour |
|---|---|
| Offline at boot | Game boots normally. `js/board/**` is never imported. No chip, no warning, no empty board. |
| Offline when a ranked run is requested | **The run starts anyway**, at the ranked tune, and is recorded. There is no ticket, so it cannot be ranked; it becomes a personal record and the results screen says `SAVED — NOT RANKED (NO CONNECTION)`. |
| Offline at submission | The trace goes to the outbox. Drains on `online`, on tab focus, on any successful call, and on a 60 s timer while items exist. Backoff 2 s, 8 s, 30 s, 2 min, 10 min, then hourly. |
| Server down or slow | Every read has a 4 s timeout and every write a 10 s one, and **every timeout has a defined non-network behaviour**. A call with no timeout is a review-blocking defect. |
| Board data stale | Cached values render with a quiet "as of …" line. Never a spinner, never an error page. |
| A name was claimed offline | Impossible by construction — the claim is the one thing that needs the server. The panel says so and the run waits in the outbox, which is the correct order: the run is not lost, only unnamed. |

Outbox cap: 20 items or 1 MB, whichever comes first; the oldest non-personal-best
is dropped when full. Three UI states and no more: **synced**, **pending**, and
**verifying**. There is no fourth state, and in particular there is no modal.
