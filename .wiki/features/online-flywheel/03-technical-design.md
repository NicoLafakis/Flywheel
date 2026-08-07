# Online Flywheel — Technical Design

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Netcode](04-netcode-design.md) ·
> [Identity](05-identity-and-accounts.md) ·
> [Belts & achievements](06-belts-and-achievements.md) ·
> [Threat model](09-threat-model.md) ·
> [Migration](12-migration-plan.md)

This is the architecture doc. It says where the new code lives, what shape the
data takes, what every call over the wire looks like, and what the game does
when the wire is not there — which, at a conference, is the case that matters
most.

Decisions recorded as ADRs and **not open for relitigation here**:

- [ADR-0009](../../adr/0009-supabase-backend.md) — Supabase + Vercel; the
  no-build-step invariant survives via the importmap.
- [ADR-0010](../../adr/0010-host-authoritative-arena.md) — host-authoritative
  arena over Realtime broadcast, with server-side deterministic replay for
  scores.

---

## 1. The fourth layer

### 1.1 Where it sits

`.wiki/architecture.md` describes three concentric rings and a glue file. The
network is a **fourth ring, outside all of them**, and it is outside on
purpose: everything the game already does must keep working with the entire
ring deleted.

```
                    ┌──────────────────────────────────────┐
   NET (new)        │  js/net/**  — async, I/O, Supabase    │
                    │  never imports three.js               │
                    │  never writes sim state               │
                    └───────┬──────────────────────▲───────┘
                            │ move intent          │ read-only
                            │ (into step)          │ snapshots
                    ┌───────▼──────────────────────┴───────┐
   GLUE             │  main.js — boot, state machine, loop │
                    └───────┬──────────────────────▲───────┘
                            │                      │
        ┌───────────────────▼──────┐   ┌───────────┴───────────┐
   SIM  │ rng tiers citygen levels │   │ RENDER world3d camera │
        │ sim voxelsim  (pure)     │──►│ UI hud screens        │
        └──────────────────────────┘   └───────────────────────┘
                     ▲
                     │ same files, imported by
        ┌────────────┴───────────────────────────────┐
        │ tools/validate.mjs (Node)                  │
        │ supabase/functions/submit-run (Deno)  NEW  │
        └────────────────────────────────────────────┘
```

The bottom box is the whole trick. `tools/validate.mjs` already imports the
pure sim from Node and proves things about it. An Edge Function importing the
*same files* from Deno and proving a *score* about them is the same move,
pointed at a different question. We are not building an anti-cheat system; we
are pointing an existing one at a new target. That is what makes this cheap,
and it is only available because [ADR-0002](../../adr/0002-sim-render-split.md)
and [ADR-0003](../../adr/0003-deterministic-seeded-generation.md) were paid for
a year before there was a leaderboard.

### 1.2 The new non-negotiables

Stated in the voice of `AGENTS.md` § *Non-negotiable invariants*, and to be
appended there as items 7–10 in the same commit as the first `js/net/` file:

> 7. **The net layer never writes sim state.** Nothing under `js/net/` may
>    assign to any field of a `Sim` or `VoxelSandboxSim`. Remote input reaches
>    the simulation only as the `move` argument to `sim.step(1/60)`. Remote
>    *players* are ghost records the renderer draws; the sim never reads them.
>    Invariant 3 is unchanged and now has a second way to be broken.
> 8. **No three.js in `js/net/`.** Same reason the pure sim has none: these
>    files are imported by Deno and by the validator, where three.js does not
>    exist. The net layer talks to `main.js`, never to `world3d.js`.
> 9. **The client's word about a score is never the record.** A number reaches
>    a board only through `submit-run`, which replays the run against the pure
>    sim and writes what *it* computed. `runs.claimed_score` exists solely to
>    be compared against `runs.verified_score`.
> 10. **The network is optional at every point.** `index.html` boots, the
>     campaign runs, and the sandboxes run with `js/net/` never imported and
>     with the machine in airplane mode. Any code path where a network failure
>     can block gameplay is a bug, not a degraded mode.

Three supporting rules that belong in `.wiki/conventions.md` rather than in the
invariant list, because they are style-with-teeth:

- **No `await` inside `frame()`.** The fixed-step loop is synchronous and stays
  synchronous. The net layer deposits into plain objects; the loop reads them.
  A promise in the loop is how the accumulator spiral in `main.js` gets a
  second, worse cousin.
- **`Math.random()` stays banned in `js/net/`.** `tools/validate.mjs` greps
  `js/` indiscriminately (see the wordmark-tilt note in `conventions.md`), so
  this is enforced whether we mean it or not. Room codes and jitter come from
  `crypto.getRandomValues` — which is not `Math.random()` and is the correct
  tool for both — or from `RNG` where reproducibility matters.
- **One concern per file**, as everywhere else. `js/net/arena.js` owning both
  the host loop and the peer loop would be the first file in the repo to break
  that rule; it is split into three.

### 1.3 Where determinism has to hold and where it does not

| Surface | Deterministic? | Why |
|---|---|---|
| `Sim`, `VoxelSandboxSim`, `citygen`, `levels` | Yes, bit-exact | ADR-0003; the replay defense is built on it |
| The input trace encoder (`js/replay.js`) | Yes | Deno replays the bytes the browser wrote |
| Snapshot encode/decode (`js/net/snapshot.js`) | Yes (pure function of state) | So a new host can rebuild from one |
| Interpolation, error smoothing, reconnect timing | **No** | Presentation. Wall-clock, per-client, never fed back into `step()` |

The last row is the one to watch in review. Reconciliation *looks* like it
writes sim state — it moves a hole. It moves a **ghost** hole, which lives in
the net layer's roster, not in `sim.rivals`. The moment someone "simplifies"
that by reusing `sim.rivals`, invariant 7 is gone and the replay defense goes
with it.

---

## 2. Data model

Postgres, in a `public` schema, RLS on **every** table with no exceptions.
Conventions: `uuid` primary keys defaulted `gen_random_uuid()`, `timestamptz`
everywhere (never `timestamp`), `citext` for anything compared
case-insensitively, `created_at`/`updated_at` on every row, and soft state via
nullable `*_at` columns rather than boolean flags where a time is more useful
than a yes.

### 2.1 The subject problem, solved once

A run, an unlock, a belt reign, and a board entry can each belong to a signed-in
profile **or** to a guest who has not signed in yet. Rather than nullable pairs
on six tables, there is one:

**`subjects`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | The identity every other table points at |
| `kind` | `text` NOT NULL | `'guest'` \| `'profile'`; check constraint, not enum (enums need a migration to extend) |
| `merged_into` | `uuid` FK → `subjects.id` | Set when a guest is claimed; NULL otherwise |
| `created_at`, `last_seen_at` | `timestamptz` | |

Everything downstream has one `subject_id`. Claiming a guest is then a single
transaction: repoint `subjects.merged_into`, re-run the board and belt
recomputation for the surviving subject, and never rewrite history rows. Runs
keep pointing at the guest subject forever; queries resolve through
`merged_into` (one level, enforced by a trigger that refuses to merge an
already-merged subject).

This is the "fifth scope costs no schema change" instinct applied to identity
instead of scope. See [12-migration-plan.md](12-migration-plan.md).

**`profiles`** — one row per `auth.users` row.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, FK → `auth.users(id)` ON DELETE CASCADE | |
| `subject_id` | `uuid` NOT NULL UNIQUE, FK → `subjects` | |
| `first_name`, `last_name` | `text` NOT NULL | Locked product decision: real names |
| `display_name` | `text` NOT NULL | What boards show; defaults to `first_name` + last initial |
| `email` | `citext` NOT NULL UNIQUE | Mirrored from `auth.users` by trigger, so PostgREST can read it under RLS without touching the auth schema |
| `company` | `text` NULL | Optional, per product decision |
| `avatar_skin` | `text` NOT NULL DEFAULT `'classic'` | A `js/skins.js` id |
| `hubspot_portal_id` | `bigint` NULL | Set when identity came from the HubSpot flow |
| `is_staff` | `boolean` NOT NULL DEFAULT false | Booth operators; gates the moderation RPCs |
| `created_at`, `updated_at` | `timestamptz` | |

Indexes: unique on `email`, unique on `subject_id`, `btree (lower(display_name))`
for the name-collision check.

**`guests`** — a device that has played but not signed in.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Generated client-side by `crypto.randomUUID()`, stored in localStorage |
| `subject_id` | `uuid` NOT NULL UNIQUE, FK → `subjects` | |
| `display_name` | `text` NOT NULL | The booth asks for a first name and nothing else |
| `auth_uid` | `uuid` NULL, FK → `auth.users(id)` | Supabase anonymous sign-in gives the guest a real JWT, which is what makes RLS work for them at all |
| `event_id` | `uuid` NULL, FK → `events` | Where they were born |
| `created_at`, `last_seen_at` | `timestamptz` | |
| `claimed_at` | `timestamptz` NULL | Mirror of the merge, for reporting |

RLS intent: a guest may `select`/`update` its own row (`auth_uid = auth.uid()`)
and nothing else. Guests are readable by nobody except through the board views,
which expose `display_name` only.

### 2.2 Events — UNBOUND is a row

**`events`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `citext` UNIQUE NOT NULL | `'unbound-2026'` |
| `title` | `text` NOT NULL | `'UNBOUND 2026'` |
| `venue`, `city` | `text` NULL | |
| `starts_at`, `ends_at` | `timestamptz` NOT NULL | A run is event-scoped iff its `submitted_at` falls inside |
| `join_code` | `text` NULL | Typed at the booth to bind a session to the event; NULL means "open" |
| `is_active` | `boolean` NOT NULL DEFAULT true | |
| `config` | `jsonb` NOT NULL DEFAULT `'{}'` | Booth knobs: default scene, match length, capacity override |
| `created_at` | `timestamptz` | |

No `if (event === 'unbound')` anywhere in the codebase. The client reads the
active event from `events` at boot (cached, with a hardcoded *fallback slug* in
`js/net/config.js` and nothing else hardcoded). The second event costs one
`insert`.

RLS: `select` for `anon` where `is_active`; write only via service role.

### 2.3 Runs and the replay trace

**`runs`** — the single record of "someone played something and it ended".

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `subject_id` | `uuid` NOT NULL FK → `subjects` | |
| `event_id` | `uuid` NULL FK → `events` | Resolved server-side at submit, never sent by the client |
| `mode` | `text` NOT NULL | `'campaign'` \| `'sandbox'` \| `'arena'`; check constraint |
| `level_index` | `int` NULL | 1..100 for campaign |
| `scene_id` | `text` NULL | `'brooklyn'`, `'boston'`, … for sandbox and arena |
| `arena_session_id` | `uuid` NULL FK → `arena_sessions` | |
| `seed` | `text` NOT NULL | The exact string handed to `RNG` |
| `build_version` | `text` NOT NULL | Git short SHA, injected into `js/net/config.js` at deploy |
| `sim_version` | `int` NOT NULL | Bumped by hand whenever sim behaviour changes; a replay across versions is *unverifiable*, not *invalid* |
| `duration_ticks` | `int` NOT NULL | `time / (1/60)`, integral by construction |
| `claimed_score` | `numeric` NOT NULL | What the client says. Never displayed as fact |
| `verified_score` | `numeric` NULL | What the server's replay produced. This is the number boards read |
| `stats` | `jsonb` NOT NULL DEFAULT `'{}'` | Server-computed: `mass`, `best_combo`, `stars`, `time_left`, `eaten_count`, `blocks`, `consumed_fraction`. All metrics read out of here, so a new metric needs no column |
| `verdict` | `text` NOT NULL DEFAULT `'pending'` | `pending` \| `verified` \| `attested` \| `mismatch` \| `unverifiable` \| `rejected` |
| `verdict_detail` | `jsonb` NULL | Divergence tick, expected vs. actual, replay ms |
| `submitted_at`, `verified_at` | `timestamptz` | |

Indexes: `(subject_id, submitted_at desc)`; `(mode, scene_id, verified_score desc)
where verdict in ('verified','attested')`; `(event_id, submitted_at)`;
`(verdict) where verdict = 'pending'` for the retry sweeper.

The six verdicts are not decoration. `mismatch` means the replay disagreed —
cheat *or* our bug, and it is important we cannot tell the two apart from the
row alone, which is why `verdict_detail` carries the divergence tick.
`unverifiable` means we could not replay it (sim version drift, host migration
mid-arena) and is **not** an accusation: those runs show on event boards and
never on all-time boards or belts. See [09-threat-model.md](09-threat-model.md).

**The scope rule the verdicts serve**, decided by
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) §6 and stated
in [09](09-threat-model.md) §3.7: **no arena run of any verdict reaches the
all-time or per-level scopes, or any solo-fed belt.** A `verified` arena session
may reach the event and per-city scopes and the two arena-only belts
([06](06-belts-and-achievements.md) §2.6, §2.7); an `attested` one reaches event
and city and no belt. That is a configuration of `boards` and `metrics`, not a
schema difference — see `min_verdict` below, plus the board's own scope filter,
which is what keeps the rule data-driven.

**`run_inputs`** — the trace, in its own table.

| Column | Type | Notes |
|---|---|---|
| `run_id` | `uuid` PK, FK → `runs` ON DELETE CASCADE | |
| `encoding` | `text` NOT NULL | `'rle-i8-v1'` |
| `tick_count` | `int` NOT NULL | Must equal `runs.duration_ticks` or the row is rejected before replay |
| `payload` | `bytea` NOT NULL | |
| `byte_len` | `int` NOT NULL | Cheap guard before decode |
| `sha256` | `bytea` NOT NULL | Of `payload`; the replay is idempotent on it |

Separate table, not a column, for three reasons: board queries must never
accidentally pull a blob; the retention job (§2.9) deletes traces without
deleting scores; and the RLS policy differs — a player may read their own
score forever and their own trace never (nobody reads traces except the Edge
Function via service role, and that includes the player who made it).

**The encoding.** The per-tick input to `sim.step` is a 2-vector that the
client already normalises. Quantise each component to `int8` (−127..127,
÷127 on decode) and run-length encode: `[count:uint16][x:int8][z:int8]`. Human
steering holds a direction for tens of ticks at a time, so a 160-second
campaign run — 9,600 ticks — compresses to roughly 1.5–4 KB. Worst case (a
player wiggling the stick every tick) is 4 bytes × 9,600 = 38 KB, which is
still nothing. Budget the check at **64 KB hard reject**.

The encoder and decoder live in **`js/replay.js`**, in the *pure* set, added to
the `tools/validate.mjs` `Math.random()` guard list, and imported unchanged by
the Edge Function. Two implementations of this format is exactly the bug we
would never find.

### 2.4 Boards, scopes and metrics — all data

The locked product decision is four scopes (event, city, level, all-time) and
several simultaneous titles. The schema must make a fifth scope and a sixth
metric an `insert`.

**`metrics`** — what "best" means.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `'mass'`, `'time_to_target'`, `'best_combo'`, `'consumed_fraction'`, `'blocks_per_minute'` |
| `title` | `text` NOT NULL | `'Most Devoured'` |
| `stat_path` | `text` NOT NULL | JSON path into `runs.stats`, e.g. `'mass'`. The only place a metric touches a column |
| `direction` | `text` NOT NULL | `'desc'` (higher wins) \| `'asc'` (lower wins) |
| `unit`, `format` | `text` | Display hints for the UI |
| `min_verdict` | `text` NOT NULL DEFAULT `'verified'` | Whether this metric will accept `attested` arena runs |

**`boards`** — a scope crossed with a metric.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `citext` UNIQUE NOT NULL | `'unbound-2026-mass'`, `'city-brooklyn-mass'`, `'level-42-time'`, `'all-time-mass'` |
| `title`, `subtitle` | `text` | |
| `metric_id` | `text` NOT NULL FK → `metrics` | |
| `scope_kind` | `text` NOT NULL | `'event'` \| `'city'` \| `'level'` \| `'global'` — **plain text, no enum, no check against a fixed list.** A fifth kind is a row |
| `filter` | `jsonb` NOT NULL DEFAULT `'{}'` | The predicate: `{"event_id":"…"}`, `{"scene_id":"brooklyn"}`, `{"mode":"campaign","level_index":42}`, `{}` for global |
| `window` | `interval` NULL | NULL = all time; `'7 days'` for a rolling board without a new kind |
| `sort_order` | `int` NOT NULL DEFAULT 100 | UI ordering |
| `is_active` | `boolean` NOT NULL DEFAULT true | |

`filter` is applied by one SQL function, `fw_run_matches_board(run, board)`,
which walks the JSONB keys and compares them against `runs` columns and
`runs.stats` paths. Every key is `AND`ed; an unknown key fails closed (the run
does not match) rather than being ignored — a typo in a filter must produce an
empty board, not a wrong one.

**`board_entries`** — materialised best-per-subject.

| Column | Type | Notes |
|---|---|---|
| `board_id` | `uuid` FK → `boards` | PK part |
| `subject_id` | `uuid` FK → `subjects` | PK part |
| `best_run_id` | `uuid` NOT NULL FK → `runs` | |
| `value` | `numeric` NOT NULL | Extracted per `metrics.stat_path` |
| `achieved_at` | `timestamptz` NOT NULL | Tie-break: earlier wins |
| `updated_at` | `timestamptz` NOT NULL | |

Index: `(board_id, value desc, achieved_at asc)` and a mirrored `value asc`
partial for `direction = 'asc'` boards. Rank is *computed at read time* by
`row_number()` in a view, never stored — a stored rank is a column that is
wrong the instant anyone else plays.

Maintained by a trigger on `runs` (`AFTER UPDATE OF verdict WHEN NEW.verdict IN
('verified','attested')`) that loops active boards, tests the filter, and
upserts on improvement. At booth volume this is microseconds; the loop is
bounded by the number of active boards (tens), not by run count.

### 2.5 Belts

The product decision is pro-wrestling titles: several held at once, each with a
holder, a reign length, and a way to be taken. A belt is therefore **a board
plus a claim rule**, not a new ranking system.

**`belts`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `citext` UNIQUE NOT NULL | `'the-heavyweight'`, `'the-sprinter'`, `'the-brooklyn-belt'` |
| `title`, `tagline` | `text` NOT NULL | `'THE HEAVYWEIGHT'` / `'Most mass in a single run'` |
| `board_id` | `uuid` NOT NULL FK → `boards` | The belt is held by whoever is rank 1 on this board |
| `icon` | `text` NOT NULL | A `js/ui/sprocket.js`-family mark id, not an image URL |
| `defend_margin` | `numeric` NOT NULL DEFAULT 0 | Must *beat* the holder by this much. 0 means ties keep the belt with the incumbent — which is the correct wrestling rule and also the correct anti-grind rule |
| `min_verdict` | `text` NOT NULL DEFAULT `'verified'` | Belts do not change hands on an unverifiable run. Ever |
| `event_id` | `uuid` NULL FK → `events` | An event-only belt vacates when the event ends |
| `is_active` | `boolean` NOT NULL DEFAULT true | |

**`belt_reigns`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `belt_id` | `uuid` NOT NULL FK → `belts` | |
| `subject_id` | `uuid` NOT NULL FK → `subjects` | |
| `won_run_id` | `uuid` NOT NULL FK → `runs` | |
| `won_value` | `numeric` NOT NULL | The number that took it |
| `won_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `lost_at` | `timestamptz` NULL | NULL = current holder |
| `lost_to_reign_id` | `uuid` NULL FK → `belt_reigns` | The successor; makes the lineage a linked list you can walk |
| `reign_seconds` | `bigint` GENERATED | `extract(epoch from coalesce(lost_at, now()) - won_at)` — as a generated column this cannot be a stored `now()`, so in practice it is a **view column**, not a table column. Noted here because getting it wrong is the obvious mistake |

Constraint that carries the whole system: `CREATE UNIQUE INDEX ON belt_reigns
(belt_id) WHERE lost_at IS NULL`. One open reign per belt, enforced by the
database, not by application care. A double-title bug at a booth in front of
partners is not recoverable by explanation.

Transitions happen in `fw_settle_belts(run_id)`, called by the same trigger
that updates boards, inside the same transaction: close the old reign, open the
new one, link them, emit a `belt_change` row for the ticker. Because it is one
transaction under the unique index, two simultaneous title-winning runs
serialise — one wins, the other retries and finds it is now the challenger.

**`belt_changes`** (`id`, `belt_id`, `from_subject_id`, `to_subject_id`,
`at`, `run_id`) exists purely so the booth screen has a live feed to render —
"THE HEAVYWEIGHT has a new champion" — without polling the reign table.

### 2.6 Achievements

**`achievements`** (`id text PK`, `title`, `description`, `icon`, `points int`,
`is_hidden bool`, `criteria jsonb`, `sort_order`, `is_active`) and
**`achievement_unlocks`** (`achievement_id`, `subject_id`, `run_id`,
`unlocked_at`; PK on the first two, so a re-unlock is a no-op upsert).

`criteria` is a small declarative predicate evaluated by
`fw_eval_achievement(criteria, run)` — `{"stat":"best_combo","gte":25}`,
`{"mode":"campaign","level_index":100,"stat":"stars","gte":3}`,
`{"count_distinct":"scene_id","gte":4}`. Anything the predicate language cannot
express gets `criteria: {"manual": true}` and is granted by an explicit call
from `submit-run`. Resist growing the language; two or three special-cases in
code are cheaper than a query engine.

The client evaluates the same criteria locally for **instant** feedback (the
toast fires the moment the run ends, offline included) and the server's grant
is the record. When they disagree — offline unlock, run later fails
verification — the server wins and the client silently drops the local unlock
on next sync. A toast that fired is never taken back on screen; only the
persisted state changes. Losing a popup you already saw is worse than a
slightly generous local count.

### 2.7 Arena rooms and sessions

Two tables, because a room is a lobby and a session is a match, and a booth
runs many matches through one room.

**`arena_rooms`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `code` | `text` UNIQUE NOT NULL | 4 chars from a 28-symbol alphabet (no `O`/`0`/`I`/`1`), `crypto.getRandomValues`, retried on collision |
| `event_id` | `uuid` NULL FK → `events` | |
| `scene_id` | `text` NOT NULL | |
| `max_players` | `int` NOT NULL DEFAULT 8 | See [04](04-netcode-design.md) §3 for why 8 |
| `status` | `text` NOT NULL | `'open'` \| `'in_match'` \| `'closed'` |
| `host_session_id` | `uuid` NULL | **The authority record.** Host migration is a conditional UPDATE on this column and nothing else |
| `host_generation` | `int` NOT NULL DEFAULT 0 | Incremented on every migration; peers reject snapshots from a stale generation |
| `created_by_subject` | `uuid` FK → `subjects` | |
| `created_at`, `closed_at` | `timestamptz` | |
| `config` | `jsonb` | Match length, late-join cutoff, spectator cap |

**`arena_sessions`** — one match.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `room_id` | `uuid` NOT NULL FK → `arena_rooms` | |
| `seed` | `text` NOT NULL | `arena:{session_id}` — generated server-side so no client can shop for a favourable city |
| `started_at`, `ended_at` | `timestamptz` | |
| `duration_ticks` | `int` NULL | |
| `host_migrations` | `int` NOT NULL DEFAULT 0 | If > 0, every run in the session caps at `attested` |
| `verdict` | `text` NOT NULL DEFAULT `'pending'` | Session-level: `verified` \| `attested` \| `disputed` |
| `trace_id` | `uuid` NULL FK → `run_inputs` | The host's multi-hole trace |

**`arena_participants`** (`session_id`, `subject_id`, `slot int`, `joined_tick`,
`left_tick`, `was_host bool`, `run_id`, `placement int`, `attest_sha256 bytea`;
PK on the first two). `attest_sha256` is the peer's independent digest of its
own intent stream — the cross-check described in
[04](04-netcode-design.md) §9.

### 2.8 Leads and consent

Lead capture at UNBOUND is an explicit product goal, which makes this the
table most likely to become a legal problem. It is separated from `profiles`
on purpose: a profile is *how you play*, a lead is *permission to contact you*,
and the two must be deletable independently.

**`leads`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `subject_id` | `uuid` NOT NULL FK → `subjects` | |
| `email` | `citext` NOT NULL | Denormalised on purpose: a lead survives profile deletion only if consent says it may |
| `first_name`, `last_name`, `company` | `text` | |
| `source` | `text` NOT NULL | `'booth'`, `'google'`, `'hubspot'`, `'email_otp'` |
| `event_id` | `uuid` NULL FK → `events` | |
| `hubspot_contact_id` | `text` NULL | |
| `synced_at`, `sync_error` | `timestamptz` / `text` | The sync is retryable and idempotent on `email` |
| `created_at` | `timestamptz` | |

**`consents`** (`id`, `subject_id`, `purpose text`, `granted bool`,
`policy_version text`, `granted_at`, `revoked_at`, `evidence jsonb`).
`purpose` is `'marketing'` \| `'leaderboard_display'` \| `'analytics'`.
`evidence` records the exact checkbox label the player saw, so "what did they
agree to" is answerable a year later without archaeology.

**No consent row, no marketing.** The `leads → HubSpot` sync function's first
statement is a join against `consents` where `purpose = 'marketing' AND granted
AND revoked_at IS NULL`. Displaying a name on a leaderboard is a *separate*
purpose and is granted implicitly by entering a name at the booth, with the
copy saying so.

### 2.9 Retention

A scheduled job (`pg_cron`, nightly):

| Data | Kept | Then |
|---|---|---|
| `run_inputs.payload` for `verdict = 'verified'` | 30 days | Deleted; the score and `sha256` stay |
| `run_inputs.payload` for `mismatch` / `disputed` | 1 year | Kept as evidence |
| `runs` | Forever | They are the boards |
| `guests` never claimed, no runs | 90 days | Deleted with their subject |
| `arena_sessions` with no participants | 24 hours | Deleted |
| `belt_reigns` | Forever | The lineage is the product |

### 2.10 RLS policy intent

RLS is on for every table listed. The intent, table by table — the actual
policies belong in the migration, but a reviewer should check them against
this:

| Table | `anon` | signed-in / guest JWT | `service_role` |
|---|---|---|---|
| `events` | select where `is_active` | same | all |
| `boards`, `metrics`, `belts`, `achievements` | select where `is_active` | same | all |
| `board_entries`, `belt_reigns`, `belt_changes` | select **through a view** that exposes `display_name` and `value` only | same | all |
| `subjects` | none | select own (`id = fw_current_subject()`) | all |
| `profiles` | none | select own; update own `display_name`/`company`/`avatar_skin` **only** (column-level grant) | all |
| `guests` | none | select/update own where `auth_uid = auth.uid()` | all |
| `runs` | none | select own; **no insert, no update** | all |
| `run_inputs` | none | **none, including your own** | all |
| `achievement_unlocks` | none | select own | all |
| `arena_rooms` | select by exact `code` (a code is the capability) | same | all |
| `arena_sessions`, `arena_participants` | none | select where you are a participant | all |
| `leads`, `consents` | none | select own; insert own consent | all |

Two things that are easy to get wrong and are load-bearing:

1. **No client-side insert on `runs`.** Not "insert then verify" — *no insert*.
   The only writer is `submit-run` under service role. If a client can insert a
   pending run, the pending list is a spam target and the board trigger becomes
   the security boundary instead of the function. Keep the boundary at one door.
2. **Boards are read through views, not tables.** `board_entries` joins to
   subjects and profiles, which hold emails. A view (`v_board_top`) that
   selects `board_id, rank, display_name, value, achieved_at, avatar_skin` and
   nothing else means a misconfigured policy leaks a ranking, not an email
   list. Set `security_invoker = true` on the views so RLS still applies
   underneath.

---

## 3. API contract

Base: `https://<project>.supabase.co`. Two kinds of call, and the split is
deliberate — **reads go direct to PostgREST, writes that carry consequences go
through an Edge Function.** A read cannot be wrong in a way that survives; a
write can.

### 3.1 Edge Functions

All Deno, all under `supabase/functions/`, all POST with a JSON body and a
`Authorization: Bearer <jwt>` header (the anonymous-session JWT for guests).
All responses share an envelope:

```jsonc
{ "ok": true,  "data": { /* per-endpoint */ } }
{ "ok": false, "error": { "code": "RUN_TOO_LONG", "message": "…", "retryable": false } }
```

`code` is a stable machine string; the client switches on it and never on
`message`. `retryable` tells the offline outbox (§4.3) whether to keep the item
or drop it.

---

#### `submit-run` — the anti-cheat door

The most important function in the system.

**Request**

```jsonc
{
  "mode": "campaign",            // campaign | sandbox | arena
  "level_index": 42,             // campaign only
  "scene_id": null,              // sandbox/arena only
  "seed": "hole-city-level-42",
  "build_version": "a1b2c3d",
  "sim_version": 1,
  "duration_ticks": 7412,
  "claimed": { "mass": 1893.4, "best_combo": 31, "stars": 3, "time_left": 46.2 },
  "inputs": { "encoding": "rle-i8-v1", "tick_count": 7412, "b64": "…" },
  "arena": null,                 // see arena-finalize for the multi-hole case
  "client_run_id": "5f2c…"       // client-generated uuid; idempotency key
}
```

**Behaviour**

1. Resolve the subject from the JWT. Reject if the JWT is absent — even guests
   have one (anonymous sign-in), so there is no unauthenticated path.
2. Idempotency: if a run with this `client_run_id` exists for this subject,
   return it. The offline outbox retries, and a booth network will make it
   retry.
3. Cheap rejects before any work: `byte_len > 65536`, `tick_count !=
   duration_ticks`, `duration_ticks > 60 * 60 * 20` (20 minutes), unknown
   `mode`, `seed` not matching the canonical seed for the declared level.
4. Rate limit: 10 submissions per subject per minute, 200 per hour, counted in
   Postgres (a `submission_log` table with a partial index), not in memory —
   Edge Function instances are not shared.
5. If `sim_version` ≠ the deployed sim version: write the run with
   `verdict = 'unverifiable'`, `verified_score = NULL`, and return. It shows on
   the player's own history and on no board. **Do not** attempt a
   cross-version replay; a false `mismatch` accusing a player at a booth is
   worse than an unranked run.
6. Replay: `import { Sim } from '../../../js/sim.js'` (or `VoxelSandboxSim`),
   construct with the level/scene and seed, decode the trace, loop
   `sim.step(1/60, move[t])` for `tick_count` ticks. No rendering, no DOM,
   nothing to stub — this is the whole payoff of ADR-0002.
7. Compare. Floating point: compare with a **relative tolerance of 1e-9** and
   an absolute floor of 1e-6. In practice V8 in Deno and V8 in Chrome produce
   bit-identical results for this arithmetic; the tolerance exists so a future
   Safari or a JIT difference produces a rounding gap rather than a fraud
   flag. A divergence beyond tolerance is `mismatch` and records the tick.
8. Write `runs` + `run_inputs` in one transaction; the trigger updates boards,
   settles belts, evaluates achievements.

**Response**

```jsonc
{ "ok": true, "data": {
  "run_id": "…",
  "verdict": "verified",
  "verified": { "mass": 1893.4, "best_combo": 31, "stars": 3 },
  "boards": [ { "board_id":"…", "slug":"all-time-mass",
                "rank": 4, "previous_rank": 11, "value": 1893.4 } ],
  "belts_won": [ { "slug":"the-heavyweight", "title":"THE HEAVYWEIGHT",
                   "taken_from": "Dana R.", "previous_reign_seconds": 9412 } ],
  "belts_lost": [],
  "achievements": [ { "id":"combo-30", "title":"CHAIN GANG", "points": 20 } ],
  "replay_ms": 84
} }
```

`taken_from` and `previous_reign_seconds` are in the response because the
title-change screen is the emotional payload of the whole feature and it must
not need a second round trip to render.

**Budget:** a 160-second campaign replay is ~9,600 `sim.step` calls over a
few thousand objects. Measured expectation is well under 200 ms; the function
timeout is 10 s and anything over 2 s logs a warning. A voxel sandbox replay is
the expensive case (`voxelsim.js` is 2,300 lines of physics) — see §7.

---

#### `arena-open`

**Request** `{ "scene_id": "brooklyn", "event_code": "UNBOUND", "max_players": 8 }`
**Response** `{ "room": { "id", "code": "K7QM", "scene_id", "max_players",
"host_session_id", "host_generation": 0 }, "session": { "id", "seed" },
"realtime_topic": "arena:K7QM", "you": { "slot": 0, "is_host": true } }`

The caller becomes host by construction (`host_session_id` set to the caller's
session). The seed is minted here, server-side.

#### `arena-join`

**Request** `{ "code": "K7QM", "display_name": "Sam" }`
**Response** the same room/session block plus
`{ "you": { "slot": 3, "is_host": false }, "roster": [...], "succession": [...],
"build_version": "a1b2c3d" }`

Capacity is enforced here with `UPDATE … SET occupied = occupied + 1 WHERE
occupied < max_players RETURNING` — an atomic check, not a read-then-write. The
client compares `build_version` to its own and refuses to join a mismatched
build (joining as a spectator instead), because two different builds of
`citygen.js` generate two different cities from the same seed and the match
would be silently nonsense.

#### `arena-claim-host`

**Request** `{ "room_id", "expected_generation": 3, "last_seen_tick": 4120 }`
**Response** `{ "granted": true, "host_generation": 4 }` or
`{ "granted": false, "host_session_id": "…", "host_generation": 4 }`

One conditional UPDATE:

```sql
update arena_rooms
   set host_session_id = $me, host_generation = host_generation + 1
 where id = $room and host_generation = $expected
returning host_generation;
```

Zero rows means someone beat you to it. The database is the arbiter; there is
no consensus protocol, no leader election, and no split brain, because there is
exactly one writable row. See [04](04-netcode-design.md) §7.

#### `arena-finalize`

Called by the host at match end. Carries the **multi-hole trace**: every peer's
per-tick intent as the host applied it, plus the roster and the host's computed
standings.

**Request**

```jsonc
{ "session_id": "…", "duration_ticks": 10800,
  "standings": [ { "subject_id":"…", "slot":0, "mass":2041.2, "placement":1 } ],
  "inputs": { "encoding":"rle-i8-multi-v1", "slots": 6, "tick_count":10800, "b64":"…" },
  "host_migrations": 0 }
```

**Response** `{ "session_verdict": "verified", "runs": [ { subject_id, run_id,
verdict, verified_score, placement } ], "belts_won": [...] }`

The server replays the whole arena — one `Sim`, N holes driven by N intent
streams — and recomputes every participant's score. This is why peers get
replay validation at all: **the host's trace validates everyone**. What it
cannot do alone is prove the host did not forge a peer's inputs, which is what
`arena-attest` is for.

#### `arena-attest`

Called by each peer at match end, independently:
`{ "session_id", "intent_sha256": "…", "observed_final": { "mass": 1204.0 } }`

The server compares the peer's digest against the digest of the slot the host
submitted. Agreement → the session stays `verified`. Disagreement, or a missing
attestation from a peer who was present at match end → session drops to
`attested`, which is board-eligible on event and city boards and **never**
belt-eligible. Silence from a peer who disconnected is not a disagreement; it
is expected and handled as such.

#### `claim-guest`

`{ "guest_id": "…" }` under a *freshly signed-in* JWT. Verifies the guest's
`auth_uid` matches a session the caller can prove (a short-lived claim token
minted before the OAuth redirect and stored in `sessionStorage`), merges the
subject, recomputes affected boards and belts. Idempotent. Full flow in
[12-migration-plan.md](12-migration-plan.md).

#### `auth-hubspot-start` / `auth-hubspot-callback`

The custom OAuth flow. `start` returns HubSpot's authorize URL with a PKCE
challenge and a signed `state`; `callback` exchanges the code, fetches the
token's `portalId` and the user's email from HubSpot's token-info endpoint,
then creates or links a Supabase user and returns a session. Detail and risk
analysis in [05-identity-and-accounts.md](05-identity-and-accounts.md); it is
called out as the highest-risk path in the package and this doc defers to it.

#### `lead-sync` (scheduled, not client-callable)

Runs every 5 minutes; upserts consented leads into HubSpot as contacts,
idempotent on email, records `hubspot_contact_id`, backs off on 429. Failure
here never affects gameplay and never blocks a booth.

### 3.2 Direct PostgREST calls

Reads only. All under RLS; all cached client-side with a stale-while-revalidate
window because a booth's network is the constraint, not the database.

| Call | Shape | Cache |
|---|---|---|
| `GET /rest/v1/events?slug=eq.unbound-2026&select=*` | The active event | 1 h, and a hardcoded fallback |
| `GET /rest/v1/boards?is_active=eq.true&select=*,metrics(*)` | Board catalogue | 1 h |
| `GET /rest/v1/v_board_top?board_id=eq.<id>&limit=25` | `{rank, display_name, value, avatar_skin, achieved_at}` | 20 s |
| `GET /rest/v1/v_board_me?board_id=eq.<id>` | Your rank + neighbours ±2 | 20 s |
| `GET /rest/v1/v_belt_current?select=*` | Every belt with holder + reign length | 20 s |
| `GET /rest/v1/belt_changes?order=at.desc&limit=10` | Ticker feed | realtime-subscribed at the booth, polled elsewhere |
| `GET /rest/v1/achievements?is_active=eq.true` | Catalogue | 1 h |
| `GET /rest/v1/achievement_unlocks?subject_id=eq.<me>` | Your unlocks | on change |
| `GET /rest/v1/runs?subject_id=eq.<me>&order=submitted_at.desc&limit=50` | Your history | on change |
| `PATCH /rest/v1/profiles?id=eq.<me>` | `display_name`, `company`, `avatar_skin` only | — |

Realtime is used for reads in exactly two places: the booth big-screen
subscribing to `belt_changes` (Postgres Changes), and the arena channel
(broadcast, §4.2). Nothing else subscribes, because every subscription is a
socket and sockets are the metered resource (§7).

---

## 4. Client module plan

House style is one concern per file and it is enforced by nothing but review,
which is why the split is written down before anything is written.

### 4.1 New files

```
js/replay.js            PURE. Input-trace encode/decode. Imported by the
                        browser, by tools/validate.mjs, and by the Deno
                        Edge Function — one implementation, no drift.
                        Joins the no-Math.random() guard list.

js/net/config.js        Supabase URL, anon key, build_version, event fallback
                        slug, feature flags. The only file a deploy rewrites.
                        No logic.
js/net/client.js        Lazy loader + singleton. Dynamically imports
                        supabase-js on first use, with the CDN→vendored
                        fallback (§5). Owns online/offline state and exposes
                        `isOnline()`, `whenOnline()`, `client()`. Everything
                        else in js/net/ goes through it and nothing else
                        imports supabase-js.
js/net/identity.js      Guest id lifecycle, anonymous sign-in, email OTP,
                        Google, HubSpot handoff, claim-guest. Owns
                        `currentSubject()`.
js/net/outbox.js        The offline queue: durable in localStorage, drained
                        on reconnect, idempotent by client_run_id. The single
                        reason a bad conference wifi costs nothing.
js/net/submit.js        Builds a submission from a finished Sim, hands it to
                        the outbox, resolves with the server's verdict (or
                        with "queued").
js/net/boards.js        Board catalogue + top-N + your-rank queries, with the
                        SWR cache.
js/net/belts.js         Belt state, reign formatting, the change ticker.
js/net/achievements.js  Local criteria evaluation for instant toasts;
                        reconciliation against the server's grants.
js/net/sync.js          Cloud mirror of the localStorage v13 save. localStorage
                        stays the source of truth; this pushes and pulls.

js/net/snapshot.js      PURE. Arena wire format: encode/decode of snapshots and
                        intents. No Supabase import, no three.js — it is a
                        codec, and it is unit-testable from Node because of
                        that.
js/net/arena.js         Room lifecycle and the Realtime channel. Owns join,
                        leave, roster, succession order, and the host/peer
                        role switch. Delegates the per-tick work.
js/net/arena-host.js    The authority loop: apply peer intents, step the sim,
                        broadcast snapshots, emit keyframes, record the
                        multi-hole trace, finalize.
js/net/arena-peer.js    The follower loop: send intent, buffer snapshots,
                        interpolate ghosts, reconcile own hole, watch the host
                        heartbeat, stand in the succession line.

js/ui/screens-online.js Sign-in, profile, leaderboards, belts, achievements —
                        UI layer, not net layer. Consumes js/net/* the same
                        way js/ui/screens.js consumes save.js.
js/ui/arena-hud.js      Roster, live standings, match clock, the
                        "RECONNECTING…" band.

supabase/functions/…    submit-run, arena-open, arena-join, arena-claim-host,
supabase/migrations/…   arena-finalize, arena-attest, claim-guest,
                        auth-hubspot-start, auth-hubspot-callback, lead-sync.
vendor/                 The pinned same-origin copy of supabase-js (§5).
```

### 4.2 Changes to existing files

Kept deliberately small — the point of putting the net layer outside
everything is that the inside barely notices.

| File | Change |
|---|---|
| `index.html` | Two importmap entries (§5). Nothing else |
| `js/main.js` | Record inputs into the trace buffer inside the existing `while (accumulator >= FIXED_DT)` loop (one line); on `endLevel`/`endSandbox`, hand the trace to `js/net/submit.js`; a fourth state, `'arena'`, in the state machine |
| `js/save.js` | v14: `{ cloud: { subject_id, guest_id, last_sync_at, pending } }`. Per hard rule 6, added to **both** `freshSave()` and `MIGRATIONS[13]` |
| `js/ui/screens.js` | Entry points to the new screens; a sign-in affordance on the title |
| `tools/validate.mjs` | `js/replay.js` and `js/net/snapshot.js` added to the guard list; a round-trip property check on the trace codec; a "replay a recorded run and reproduce its score" fixture, which is the local proof that `submit-run` will agree |
| `AGENTS.md` | Invariants 7–10 (§1.2) |

The `main.js` recording line deserves a note, because it is the one place the
net layer touches the hot loop: it appends two `int8` values to a preallocated
`Int8Array` sized `60 * maxSeconds * 2`, with no allocation and no branch on
network state. Recording happens **always**, online or off — a run you could
not submit is a run you can submit later, and the alternative (start recording
when a network appears) means the first run of the day is never rankable.

### 4.3 The outbox

`js/net/outbox.js` is small and load-bearing enough to specify here.

- Queue in `localStorage` under `flywheel-outbox`, capped at **20 items or
  1 MB**, whichever comes first; oldest non-personal-best dropped when full.
- Each item: `{ client_run_id, endpoint, body, attempts, first_queued_at,
  last_error }`.
- Drained on: `online` event, tab focus, successful any-call, and a 60-second
  timer while items exist.
- Backoff: 2 s, 8 s, 30 s, 2 min, 10 min, then hourly. Never blocks the UI,
  never shows a modal, never retries a `retryable: false` error.
- The UI states are exactly three: **synced** (nothing queued), **pending**
  (a small "will submit when online" chip), and **conflict** (server verdict
  disagrees with the local optimistic display, resolved silently in the
  server's favour with the score corrected on the history screen only).

---

## 5. The importmap, the CDN, and bad wifi

### 5.1 What changes in `index.html`

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "@supabase/supabase-js":
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm",
  "@supabase/supabase-js/local": "/vendor/supabase-js-2.45.4.js",
  "three/local": "/vendor/three-0.160.0.module.js"
} }
</script>
```

Exactly the pattern three.js already uses, pinned to an exact version (never a
range — a range is a build step someone else runs on your behalf, on their
schedule).

### 5.2 The fallback, and why it is a second specifier

An importmap maps one specifier to one URL; there is no built-in fallback list.
So the fallback is explicit, in `js/net/client.js`:

```js
async function loadSupabase() {
  try { return await import('@supabase/supabase-js'); }
  catch { return await import('@supabase/supabase-js/local'); }
}
```

`/vendor/supabase-js-2.45.4.js` is the same prebuilt ESM bundle, committed to
the repo and served by Vercel from **our own origin**. Committing a vendored
bundle is not a build step: nobody runs a bundler, the file is downloaded once
by a human and checked in, and `tools/validate.mjs` gains a check that the
vendored file's SHA-256 matches the recorded one so a silent swap is loud.

This matters more than it looks. At a conference the venue's network is
hostile in a specific way: DNS to a third-party CDN resolves slowly or not at
all while the page you are already on keeps working, because it is cached and
same-origin. Making our own origin the fallback converts "the CDN is
unreachable" from a broken feature into a 300 ms slower sign-in. **Mirroring
three.js the same way is the higher-value half of this change** and is why the
`three/local` entry is in the map above — a CDN failure on three.js today is
not a degraded game, it is a black screen. That is a pre-existing single point
of failure that this feature's constraints happen to expose; fixing it is one
line and belongs in the same commit.

### 5.3 What happens when there is no network at all

The rule from §1.2 invariant 10, made concrete:

| Situation | Behaviour |
|---|---|
| Offline at boot | Game boots normally. `js/net/*` is never imported. Title screen shows "Playing offline" as a quiet chip, not a warning |
| Offline mid-campaign | Nothing happens. The run finishes, the trace is recorded, the submission is queued |
| CDN unreachable, our origin fine | Vendored fallback loads. One extra failed request, ~300 ms |
| Both unreachable | Identical to "offline at boot". No sign-in, no boards, full game |
| Online but Supabase down | Same as offline; every call fails fast on a 4 s timeout and the outbox holds |
| Network dies mid-arena match | Peer: sees the host go silent, shows RECONNECTING, then converts to a **solo run on the same seed and clock** and submits it. The player finishes a game rather than watching an error |
| Network returns | Outbox drains. Toasts for anything won: "You took THE HEAVYWEIGHT 4 minutes ago" |

The one thing the booth must never see is a spinner that does not resolve.
Every network call in the client has a timeout (4 s for reads, 10 s for
`submit-run`) and every timeout has a defined non-network behaviour. A call
with no timeout is a review-blocking defect in this feature.

---

## 6. Alternatives considered

Each of these is a reasonable choice that someone will propose again in six
months. Recorded fairly, with the actual reason.

| Option | What it gets right | Why not here |
|---|---|---|
| **Dedicated authoritative game server** (Node/Deno on Fly.io or a Vercel long-running service) | The textbook answer. True authority, no host migration problem, no trust in a peer at all, clean anti-cheat, predictable tick rate | Cost and operations. It is a process that must stay up, be monitored, be scaled, and be paid for — against a budget in the low tens of dollars a month (§7) and a team of one with a conference deadline. It also *ends* the static-hosting story completely, where Supabase leaves the game itself untouched. Genuinely the right call at 1,000 concurrent players; wrong at a booth with eight. Revisit at the first sign of a real player base — the seam is `js/net/arena-host.js`, which is exactly the file a server would replace |
| **WebRTC peer mesh** | No relay, lowest possible latency, zero per-message cost, and it scales *down* beautifully | Conference wifi is the worst possible environment for it. Client isolation on guest networks blocks peer-to-peer outright, so you need TURN, and a TURN server is the dedicated server you were trying to avoid — with worse ergonomics. Signalling would still be Supabase. We would carry both systems and use the fallback most of the time |
| **Deterministic lockstep** (exchange inputs, every client simulates all) | Perfectly tempting given ADR-0003: we already have determinism, so all-clients-agree is nearly free, and bandwidth is tiny | Lockstep advances at the speed of the slowest peer, and every peer must be present. One phone on 4G stalls all eight players; one disconnect stalls the match until a timeout. At a booth, someone walks away mid-match roughly every fourth game. Lockstep is also unforgiving of *any* nondeterminism, including the render-side `Math.random()` we deliberately permit in `camera.js` and `voxelworld.js` — one accidental leak and clients silently desync with no error. Host-authoritative degrades; lockstep breaks |
| **Firebase** (Realtime Database / Firestore + Auth) | Excellent realtime primitives, mature anonymous-auth-then-upgrade flow — exactly our guest-first shape — and a generous free tier | Wrong shape for the rest of the feature. Leaderboards with four data-driven scopes, belt reigns with a one-open-reign constraint, and a replay function that must `import` our own ES modules all want Postgres and a real server runtime. We would end up with Firebase for presence and something else for everything else. And a second vendor is a second bill, a second auth model, and a second thing to explain |
| **PartyKit / Colyseus / Cloudflare Durable Objects** | Purpose-built for exactly this: a stateful room object as the authority, no host migration problem at all, and PartyKit's model is genuinely elegant for a shared arena | Each is a build step and a second deployment target — Colyseus is a server you run, PartyKit and Durable Objects want a bundler and a Workers deploy. That collides head-on with the invariant this whole package is organised around, and it splits hosting across two providers for one feature. Durable Objects is the strongest of the three and the one to reach for if the host-authoritative model proves untenable; note that reaching for it means accepting a build step, which is an ADR, not a refactor |
| **Trust the client's score** (submit a number, rank it) | Two hours of work. Everything else in this doc is downstream of not doing this | A leaderboard at a conference with a competitive audience of technical people is the single most attacked surface we will ever ship, and the attack is `fetch()` in a console. It would be found on day one and it would be found *publicly*. The replay defense costs one Edge Function because determinism was already paid for; declining it would waste the most valuable property the codebase has |
| **Store the whole game state per tick instead of inputs** | Trivially verifiable, no replay needed | Thousands of times larger, and it verifies nothing — a forged state trace is as easy to write as a forged score. Inputs are small *and* are the only thing a cheater cannot fake without actually being able to produce the run |

---

## 7. Cost model

**Plan pricing, verified 2026-08-06: Supabase Free is $0, Supabase Pro is
$25/month.** The "$10" that appears in earlier conversation is a *compute
credit inside Pro*, not a plan price. Nico approved $10 before that was known
and has been told the real figure; **the plan choice is open and is his**
([10](10-observability-and-nfr.md) §4.3 states it in his terms;
[SETUP-FOR-NICO.md](SETUP-FOR-NICO.md) §1 carries the recommendation). Nothing
in this package should be read as approval of $25.

The recommendation is **Pro for the event month**, and the reason is not
headroom — it is that **the Free plan pauses a project after roughly seven days
of inactivity**, which on the morning of day two is an outage in front of the
audience the whole thing exists for.

### 7.1 Assumed load at UNBOUND

Two days, eight hours each. Booth throughput of roughly 40 players per hour is
optimistic for a physical booth and is used deliberately.

| Quantity | Estimate |
|---|---|
| Players over the event | ~600 |
| Runs submitted (solo + arena) | ~2,500 |
| Arena matches (3 min, avg 5 players) | ~120 |
| Peak concurrent Realtime connections | ~20 (2 rooms × 8 + spectators) |
| Trace bytes stored | 2,500 × ~4 KB ≈ 10 MB |
| Total DB size after the event | < 100 MB |

### 7.2 Against Supabase's free tier

Free tier figures move; verify at build time. Approximate current limits and
our projected usage:

| Resource | Free allowance | Projected | Headroom |
|---|---|---|---|
| Database size | 500 MB | < 100 MB | Comfortable |
| Edge Function invocations | 500 K / mo | ~6 K | Comfortable |
| Monthly active users (auth) | 50 K | ~600 | Comfortable |
| Egress | 5 GB | < 1 GB | Comfortable |
| Realtime concurrent connections | 200 | ~20 peak | Comfortable |
| **Realtime messages** | **2 M / mo** | **see below** | **The only tight one** |

### 7.3 The Realtime message math, which is the whole cost question

**This section is the single canonical projection for the package.**
[04](04-netcode-design.md) §4/§13 own the constants, [07](07-test-strategy.md)
§7 owns the load definition and the measurement,
[10](10-observability-and-nfr.md) §4.2 restates this table for the NFR reader,
and [11](11-risk-register.md) R7 carries the risk. If any of those disagree with
what follows, this is the one that is right.

**The shipped constants** ([04](04-netcode-design.md) §13): `SNAPSHOT_HZ = 12`
(host → all), `INTENT_HZ = 10` (peer → host). Everything below uses those, not
the 15/20 ceilings.

**The formula**, for a match of `S` seconds with `P` players (1 host, `P−1`
peers):

```
sent      = 12·S              (host broadcasts)
          + 10·S·(P−1)        (peer intents)
delivered = 12·S·(P−1)        (each broadcast reaches every peer)
          + 10·S·(P−1)        (each intent reaches the host only)
```

**Two honest scenarios, because two writers assumed different booths and the
gap between them *is* the finding.** Both use the shipped rates; they differ
only in match length, players per room, and how many matches a booth actually
runs in sixteen event hours.

| Assumption | Low scenario (§7.1's booth) | High scenario ([07](07-test-strategy.md) §7's booth) |
|---|---|---|
| Match length | 180 s | 90 s |
| Players per room | 6 | 8 |
| Matches over the 2-day event | 120 | 480 |
| Concurrent rooms | 1–2 | up to 2, running back to back |
| **Sent per match** | 11,160 | 7,380 |
| **Delivered per match** | 19,800 | 13,860 |
| **Sent over the event** | **1.34 M** | **3.54 M** |
| **Delivered over the event** | **2.38 M** | **6.65 M** |

Against allowances of roughly **2 M/month on Free** and **5 M/month included on
Pro** (then ~$2.50/M), the same shipped design lands anywhere from *comfortably
inside Free* to *a third over Pro's included allowance*. Nothing in the netcode
explains that 5× spread. Three assumptions do, in order of leverage:

1. **Matches per event (120 vs 480).** 4× on its own. This is booth throughput
   and arena uptime, not engineering.
2. **Whether the meter counts sent or sent+delivered.** ~1.9× on its own, and
   nobody has read the meter.
3. **Players per room (6 vs 8).** ~1.4× on its own, and it is a runtime flag.

**The conclusion both projections independently reach: the number is unmeasured,
and the first action is to measure one real match, not to pick a figure.** Run
one full match at the shipped rates, read the actual Realtime message count off
the Supabase dashboard, and multiply out ([07](07-test-strategy.md) §7.2,
[13](13-tasks.md) T-709). **Do not commit `snapshot_hz` before that number
exists.** Every figure above is arithmetic on assumptions; one dashboard reading
replaces all of it.

**The levers, in order of preference**, all already in the design as runtime
flags ([08](08-rollout-and-runbook.md) §2.1) rather than constants to redeploy:

1. **Snapshot rate.** 12 → 10 Hz. At the 100 ms interpolation delay
   ([04](04-netcode-design.md) §5) this is not perceivable; it is ~17% off the
   downstream half.
2. **Room cap.** 8 → 6. In the high scenario this alone takes 3.54 M sent /
   6.65 M delivered down to **2.68 M / 4.75 M** — inside Pro on either
   accounting.
3. **Time-boxing arena hours.** Arena live for ~4 of each day's 8 hours halves
   the match count outright: the high scenario becomes **1.77 M sent / 3.33 M
   delivered**. This is the biggest single lever and it costs the least, because
   a booth cannot supervise a continuous arena for sixteen hours anyway.

**What is and is not expensive.** Solo play, the four boards, the belts, and
achievements are *near-free* in Realtime terms — they are HTTPS reads and writes
against Postgres, and every other line in §7.2 sits two orders of magnitude
inside Free. **A continuously-running live arena at the default rate and room
size is the only thing in this feature with a cost problem**, and it is the only
thing the levers above touch.

Vercel: static hosting on Hobby is $0 and this feature adds no serverless
functions to Vercel (they are all Supabase Edge Functions). No change.

**Steady state after the conference**, at a realistic ~50 runs and ~2 matches
a day: every line is two orders of magnitude inside Free. The ongoing cost of
this feature is **$0** — the plan question is entirely about the event month.
The one thing that could change that is the Micro compute add-on ($10/mo, the
line item that was mistaken for a plan price) if replay latency under concurrent
load proves unacceptable on a shared instance; the decision point is a measured
p95 on `submit-run`, not a guess made now.

### 7.4 The one cost risk worth naming

A **voxel sandbox replay** is not a campaign replay. `voxelsim.js` is 2,300
lines of structural physics and a 3-minute Boston run is ~10,800 steps over
82,894 blocks. If that replay takes 30 seconds of Edge Function CPU, the free
tier's invocation count stops being the constraint and wall-clock does.

Mitigation, decided now rather than discovered later: **sandbox and arena runs
are verified asynchronously.** `submit-run` writes the run as `pending`,
returns immediately, and a queue worker (a `pg_cron` job invoking the function
in verify-only mode) does the replay within a minute. The player sees their
score instantly with a "verifying" chip; boards update when it clears. Campaign
runs, which are cheap, stay synchronous. This is a one-flag difference in the
same function and it is the difference between a feature that scales and one
that times out on stage.

---

## 8. Open items for the implementer

Not decisions — measurements to take during the build, each with the action it
determines.

1. **Measure a Boston sandbox replay in Deno.** If p95 > 5 s, §7.4's async path
   is mandatory rather than preferred, and the `pending` chip needs design.
2. **Confirm V8-to-V8 float agreement** by replaying 100 recorded browser runs
   in Deno and diffing to the last bit. If any diverge, the tolerance in
   `submit-run` step 7 needs widening and the reason needs recording *here*.
3. **Measure the Realtime meter on one real match** before `snapshot_hz` is
   committed — §7.3's whole point. This also settles whether Supabase counts
   sent or sent+delivered messages, which is ~1.9× on its own. Owned by
   [13](13-tasks.md) T-709.
