# Plan — Cloud progress sync (progress follows the signed-in player)

Status: **proposed, not started** (2026-08-17). No code in this plan exists yet;
every symbol named below was verified against the tree at commit `ba64ea1`.
Product owner decides go/no-go; the technical shape here is decided.

## 0. One-paragraph summary

Today a player who signs in on a second phone gets their leaderboard name and
their published scores back, but arrives with zero coins, no skins, no stars
and default settings, because all of that lives in one localStorage blob per
device. This plan adds a `player_progress` table (one row per `players.id`),
two bearer-authenticated routes (`/api/progress/pull`, `/api/progress/push`),
a merge that can only ever *keep the better of two records* (never sum coins),
a server-side coin plausibility gate so a hand-edited save cannot mint
cosmetics, an offline queue built the same way as the ranked outbox, and a
small amount of menu UI. Rough total: **~46 hours** across four phases.

## 1. Context — what is per-device today, what is already global

### 1.1 Per-device (localStorage only)

`js/save.js` owns one JSON blob under `localStorage['hole-city-save']`
(`KEY`, `js/save.js:19`), schema-versioned at `CURRENT_VERSION = 24`
(`js/save.js:21`), loaded by `loadSave()` (`js/save.js:506`) through the
`MIGRATIONS` chain (`js/save.js:175`) and written by `storeSave()`
(`js/save.js:547`). `freshSave()` (`js/save.js:146-171`) is the authoritative
key set; the `saveSchema` validator section (`tools/validate.mjs:1642`) holds
the migration chain and `freshSave()` to the same shape.

| Key | Written by | Notes |
|---|---|---|
| `coins` | `recordLevelResult` (`save.js:560`), `recordSandboxResult` (`save.js:582`), `recordChallengeResult` (`save.js:619`), `buy()` in `js/main.js:297-308`, `buyUpgrade()` (`save.js:745`) | Only a balance, no ledger |
| `levels` (`{stars,bestMass,bestCombo,won,fastestClear}` per 1-based level) | `recordLevelResult` | max/min semantics already |
| `sandbox` (`{completions,runs,bestSize,bestTime,bestCombo,bestScore,bestPercent}` per scene) | `recordSandboxResult`, `recordChallengeResult` | `completions`/`runs` are COUNTERS |
| `challenges` (`{completed3m,bestTime3m,bestScore3m,completed90s,bestTime90s,bestScore90s}` per scene) | `recordChallengeResult` | |
| `ownedItems` (skin ids) | `buy()` `js/main.js:305` | gated by `isPurchasableSkin(id)` |
| `equippedSkin`, `equippedIndicator` | `equip()` `js/main.js:318` | |
| `upgrades` (`{speed,vortex,growth,duration}` ranks 0-20) | `buyUpgrade` `save.js:745` | cost ladder `upgradeCost()` in `js/upgrades.js` |
| `settings`, `muted` | settings screen | mixes taste (volumes, turn sensitivity) with device capability (`quality`, `perfMode`, `vox*`) |
| `player` (`{id,name,claimedAt,nameSource}`) | `applyIdentity()` `js/board/player.js:41` | PUBLIC identity only |
| `outbox` (ranked submissions) | `js/board/outbox.js` | already the offline-queue pattern |

The bearer secret is deliberately NOT in the save: `localStorage['fw-player']`
= `{player_id, token}` via `playerSecret()`/`savePlayerSecret()`
(`js/board/player.js:22-31`); device identity is `localStorage['fw-board-device']`
via `deviceKey()` (`js/board/player.js:13`).

### 1.2 Already global (server-side, keyed to `players.id`)

- Identity: `public.players` (`supabase/migrations/20260812204210_scoreboards_profiles.sql:5-15`, plus `session_token_hash` from `20260816214501`, `is_auto` from `20260817124500`).
- Auth: `api/auth/register.mjs` (RPC `fw_register_device_player`), `api/auth/login.mjs` (mints a session token, one per account; a second login signs the first device out, `login.mjs:31-42`), `api/name/claim.mjs`, `api/name/transfer/*.mjs`, `api/player/remove.mjs`. All later authenticated calls go through `playerForToken(id, token)` (`api/_lib.mjs:143-178`).
- Scores: `public.runs` / `run_inputs` / `board_public` / `v_leaderboard`; verdicts written by `fw_record_verdict` after `verifyReplay()` (`api/_verify.mjs`), whose stored `stats` today are `{raw_mass, best_chain, eaten, size}` (`_verify.mjs:81-95`). **Coins collected are not stored yet.**
- RLS posture: every raw table has an explicit `deny browser` policy for `anon, authenticated` (`20260812205233_harden_scoreboards.sql:3-20`); only `service_role` (the Vercel functions) reads or writes.

### 1.3 Existing seams the plan reuses

- `post(path, payload)` in `js/board/request.js` (JSON envelope, `error.retryable`, `BOARD_TIMEOUT_MS` = 5 s from `js/board/config.js`).
- `enqueue`/`drain` in `js/board/outbox.js` and the three drain triggers in `js/main.js:36-46` (boot, `online` event, 60 s interval).
- `applyIdentity()` and the create/sign-in form in `js/ui/boards.js:546-700` (`renderProfileTab`, `registerPlayer`/`loginPlayer` at `boards.js:683-684`), reachable from the title screen name plate (`js/ui/screens.js:212-219` → `showProfile()` at `screens.js:950`).
- `ok`/`fail`/`body`/`rest`/`rpc`/`errorResponse` in `api/_lib.mjs`.

## 2. Design

### 2.1 Schema — `player_progress`

New migration `supabase/migrations/2026MMDDHHMMSS_player_progress.sql`:

```sql
create table public.player_progress (
  player_id        uuid primary key references public.players(id) on delete cascade,
  schema_version   integer not null check (schema_version > 0),      -- js/save.js CURRENT_VERSION at push
  blob             jsonb not null check (octet_length(blob::text) <= 65536),
  coins_verified   bigint not null default 0 check (coins_verified >= 0), -- server ledger, 2.4
  coins_ceiling    bigint not null default 0 check (coins_ceiling >= 0),  -- plausibility bound, 2.4
  revision         integer not null default 1 check (revision > 0),       -- bumps on every accepted push
  updated_at       timestamptz not null default now(),
  pushed_by_device text check (char_length(pushed_by_device) between 16 and 128)
);
alter table public.player_progress enable row level security;
create policy "raw progress deny browser" on public.player_progress
  for all to anon, authenticated using (false) with check (false);
-- No grants to anon/authenticated. service_role bypasses RLS, as for every fw table.
-- submission_log.kind check constraint gains 'progress' (same move as 20260812212500).
```

`blob` holds exactly the syncable subset (2.3): never `settings.vox*`, never
`outbox`, never `player`, never the token. `on delete cascade` means
`fw_remove_player` (already deletes the `players` row) also erases progress,
so that function does not change. Rollback note in the file: `drop table
public.player_progress;` plus reverting the `kind` constraint.

### 2.2 API routes (both POST, both behind `playerForToken`)

Both live under `api/progress/` and follow the shape of `api/name/rename.mjs`:
read `body(req)`, require `{player_id, token, device_key}`, `playerForToken()`
→ 401 `NOT_SIGNED_IN` when null, everything else via `errorResponse`.
Guest (`is_auto`) accounts ARE allowed: their bearer token is what `run/start`
handed the device, so an auto-named player is cloud-backed from the moment the
server knows them, and `fw_register_device_player` upgrading the guest in place
(`register.mjs:65-69`) carries the row along for free (same `players.id`).

`POST /api/progress/pull` → `{ found, revision, schema_version, blob, coins_verified, coins_ceiling, updated_at }`. Never 404s: `found:false` is the normal answer on a first sign-in.

`POST /api/progress/push` body `{ player_id, token, device_key, base_revision, schema_version, blob }`:
1. `schema_version > CURRENT_VERSION` (server imports `CURRENT_VERSION` from `../../js/save.js`; that module is Node-importable — the validator already imports it — and only touches `localStorage` inside `loadSave`/`storeSave`) → 409 `CLIENT_TOO_NEW`. `schema_version < stored.schema_version` → 409 `STALE_SCHEMA` (cannot happen after `loadSave` ran, so it is a guard, not a path).
2. `sanitiseBlob()` in `api/_progress.mjs`: strict key allow-list (`SYNCED_KEYS`), finite non-negative numbers, `ownedItems` all pass `isPurchasableSkin` (`js/skins.js`, pure), upgrade ranks in `0..MAX_UPGRADE_RANK`.
3. `base_revision !== stored.revision` → server runs `mergeBlobs(stored.blob, incoming)` (2.5) instead of overwriting, then bumps `revision`. A client never wins by racing.
4. Coin fence (2.4) rewrites `blob.coins`, may trim `ownedItems`/`upgrades`.
5. Upsert; respond with the **canonical** `{revision, blob, trimmed}` the server kept. The client adopts it — the one place server state flows back into the save, always outside `sim.step` (invariant 4).

Rate limit: 60 pushes/hour/player via `submission_log` `kind='progress'`, checked the way `register.mjs:22-27` checks `claim-ip`.

### 2.3 Syncable subset ("blob") and what stays local

| Synced | Local only |
|---|---|
| `coins`, `levels`, `sandbox`, `challenges`, `ownedItems`, `equippedSkin`, `equippedIndicator`, `upgrades`, `muted`, `settings.{musicVolume, sfxVolume, turnSens}` (player taste) | `settings.quality`, `settings.perfMode`, `settings.vox*` dev sliders (device capability), `outbox`, `player`, `cloud`, `version` |

`js/cloud/blob.js: toBlob(save)` / `applyBlob(save, blob)` are the two pure
functions that define the boundary. `SYNCED_KEYS` is one constant exported by
`api/_progress.mjs` and imported by `blob.js`, so client and server cannot
disagree; the validator asserts `Object.keys(toBlob(freshSave()))` against it,
so a future save key becomes a decision rather than an accident.

### 2.4 Coins: the server never trusts a balance

Coins are earned in three places and only one is verifiable:

| Source | Verifiable? | Server rule |
|---|---|---|
| Ranked RUN (`run90`, `RANKED_SCENES`) | Yes — replayed by `verifyReplay()` | Extend `stats` with `coins_collected: sim.hole.coinsCollected` (`js/voxelsim.js:954` tracks it). New RPC `fw_coins_verified(p_player_id)` sums it over `verdict='verified'` rows → `coins_verified`. |
| Campaign levels | Bounded — `coinsForResult(level, stars, bestCombo)` (`js/levels.js:97`) is a pure function of the record | `coins_ceiling += Σ_levels coinsForResult(level, stars, bestCombo) × REPLAY_ALLOWANCE` (3: a level replayed for coins up to three times at its best is accepted) |
| Free-play sandbox, challenges, multiplayer | Bounded — coin count and `coinValue` per scene come from `js/citycatalog.js` | `coins_ceiling += Σ_scenes min(runs, 200) × mapCoinTotal(scene) + result bonus at bestScore` |

**The rule.** `earned_allowed = coins_verified + coins_ceiling`.
`spent = Σ price(ownedItems) + Σ upgradeCost(0..rank-1) per track`.
Server sets `blob.coins = min(client.coins, earned_allowed - spent)`. If that is
negative, purchases unwind newest-first (`ownedItems` is already in purchase
order because `buy()` appends; upgrades unwind top rank first) until it is not,
then `coins = 0`. The server never *adds* coins. `trimmed: [...]` in the
response lets the client say "some purchases could not be verified" once. This
is a plausibility fence against a hand-edited save (`hole-city-save` is
documented as hand-editable, `save.js:113`), not an anti-cheat wall: an honest
player cannot hit it because the ceiling is at least what they could have earned.

### 2.5 Merge semantics — `js/cloud/merge.js: mergeBlobs(a, b, {aChangedAt, bChangedAt})`

One pure function, run identically by the client on pull and by the server on a
stale-revision push. Also imported by `api/_progress.mjs`.

| Field | Rule |
|---|---|
| `levels[i].stars`, `bestMass`, `bestCombo` | max |
| `levels[i].won` | OR |
| `levels[i].fastestClear` | min of non-null |
| `sandbox[s].bestSize/bestCombo/bestScore/bestPercent` | max; `bestTime` min of non-null |
| `sandbox[s].completions`, `runs` | **max**, not sum — two sides advanced from a common base would double-count under sum; max under-counts by at most the smaller delta, the safe error |
| `challenges[s].completed*` | OR; `bestTime*` min of non-null; `bestScore*` max |
| `ownedItems` | set union, `a`'s order first (fence runs after) |
| `upgrades[k]` | max rank |
| `coins` | **never summed.** `max(a, b)` on the client, then the server fence (2.4) is authoritative on the next push. Max is right when one device is simply ahead; double-spend (bought on A, earned on B) is caught by the spend check; double-earn is bounded by the ceiling. |
| `equippedSkin`, `equippedIndicator`, `settings.*`, `muted` | most recent by `changedAt`; equipped must be in merged `ownedItems` or free, else `'classic'` / `'ind-default'` (mirrors the v24 migration fallback, `save.js:500-503`) |

### 2.6 Sync triggers and debounce — `js/cloud/sync.js`

- **Identity change** (register / login / claim / transfer redeem / guest provisioned): `applyIdentity()` (`js/board/player.js:41`) gains one call, `onIdentityChanged(save)` → `pull()` → `mergeBlobs(toBlob(save), remote)` → `applyBlob` → `push()`. If `found:false` and the local save is non-trivial (any star, coin or owned item), the local blob is pushed as revision 1 — the "this phone's progress now belongs to your account" moment (3.3).
- **After each write path**: `recordLevelResult`, `recordSandboxResult`, `recordChallengeResult` (inside `save.js`, so every caller including multiplayer is covered), and `buy`/`buyUpgrade`/`equip` in `main.js` set `save.cloud.dirty = true`, `lastLocalChangeAt = now`, then `scheduleSync()` — trailing-edge debounce of 8 s, at most one push in flight.
- **Menu return** (`state = 'menu'; screens.showTitle()` at `js/main.js:951, 969, 1006, 1044, 1080`) and `visibilitychange → hidden`: `flushSync()` (immediate if dirty).
- **Boot / `online` / 60 s tick**: piggyback on `drainSavedBoardOutbox()` (`js/main.js:39-46`) so both queues share reconnect moments.
- All async, all outside `sim.step` (invariants 4, 9). Nothing under `js/cloud/` is imported by the pure-sim modules (invariant 3).

### 2.7 Offline queue

Progress is a state document, not a stream of deltas, so one pending push
supersedes all earlier ones: `save.cloud.dirty` IS the queue and `flushSync()`
IS the drain. Retry contract copied from `outbox.js:27-45`: `error.retryable`
→ stay dirty and try again on the next trigger; non-retryable (401
`NOT_SIGNED_IN`, 409 schema codes) → stop retrying and surface a state (3.2).
A failed push never blocks play (invariant 10).

### 2.8 Conflict / version handling

- Optimistic concurrency on `revision`; server merges on mismatch (2.5) and returns canonical; client applies. Two devices playing at once converge because every field is commutative except the recency ones, which are timestamp-ordered.
- Blob carries `schema_version`. Server refuses `CLIENT_TOO_NEW` (quarantine semantics: never overwrite what you cannot read, invariant 7). On pull, if `remote.schema_version < CURRENT_VERSION` the client runs the same `MIGRATIONS` chain over `{version: remote.schema_version, ...blob}` before merging — the migrations are already pure functions over a save object, so local and cloud upgrades share one path.
- Second-device login signs the first device out (`login.mjs:36-42`). The signed-out device's next push gets 401 → indicator says "signed out on another device — sign in to keep syncing"; it keeps playing locally.

### 2.9 Save schema change

`CURRENT_VERSION` 24 → **25**; migration `24: (s) => ({ ...s, version: 25, cloud: { lastPushedAt: null, lastPulledAt: null, dirty: false, revision: 0, lastLocalChangeAt: null, firstNoteShownAt: null } })` and the same key in `freshSave()` (the `saveSchema` guard fails otherwise; that is its job, `save.js:131-145`).

## 3. UI

Front-end changes route through the front-end assets (global rule 9). Wireframe only here.

### 3.1 Sign-in / create-account entry in the main menu
The title-screen name plate (`screens.js:212-219`) already opens the profile tab, and `renderProfileTab` (`boards.js:546+`) already holds the create-account / sign-in form. Change: the plate note `SIGN IN TO KEEP IT` becomes `SIGN IN — KEEP COINS, SKINS & STARS EVERYWHERE` for auto names; the profile copy at `boards.js:585-587` and `597` says progress, not only the name, follows you.

### 3.2 "Synced" indicator
A small dot + word beside the name plate: `SYNCED` (green — pushed this session, not dirty), `SYNCING…` (in flight), `OFFLINE — WILL SYNC` (dirty, last error retryable), `SIGNED OUT ELSEWHERE` (401 state). Guests are cloud-backed too (2.2), so they see it as well. Never a modal; never blocks a button.

### 3.3 First-time note for existing named players
On the first successful pull after this ships, one dismissable card on the profile tab: *"Your coins, skins and stars from this device now belong to `<name>`. Sign in on another phone and they will be there."* If the merge changed something visible (coins rose because the other device was ahead, or `trimmed` is non-empty), one extra line says so. Tracked by `cloud.firstNoteShownAt`.

### 3.4 Sign-out
New `SIGN OUT` on the profile tab (today only `removePlayer` exists, which deletes the account — different thing). Sign-out: `flushSync()` (awaited, 5 s cap), remove `fw-player`, reset `player` to a fresh auto name via `playerName(save)`, and — product default baked in — **keep local progress on the device** (a shared family tablet loses nothing; the next sign-in merges by 2.5). Signing in as a different account on the same device merges the tablet's progress *into* that account, which can only add. Called out as a product question in §5.

### 3.5 Invariants restated
- **3** pure sim boundary: nothing under `js/cloud/` or `api/progress/` is imported by `rng.js`, `tiers.js`, `citygen.js`, `levels.js`, `sim.js`. The server imports `js/save.js`, `js/skins.js`, `js/upgrades.js`, `js/levels.js`, `js/citycatalog.js` — all already Node-importable.
- **4** gameplay state changes only in `sim.step`: sync applies to the *save*, never a live `sim`; `applyBlob` is deferred while `state === 'playing'`.
- **7** `CURRENT_VERSION` 24→25 with a migration; a `player_progress` row at an unknown newer schema is left untouched (`CLIENT_TOO_NEW`), never overwritten.
- **9** `js/board/**` and `js/cloud/**` never mutate simulation state and never import three.js; network work is async and outside the fixed-step loop.
- **10** offline players start and finish every city; a failed push leaves `dirty=true` and play continues; sign-in already has its local fallback (`player.js:66-69`).

## 4. Tasks (TDD: every task starts with a red assertion in `tools/validate.mjs`)

New sections join the `core` group (`tools/validate.mjs:2920`) and are registered with `section(...)` near `validate.mjs:3001`. Hours are estimates.

### Phase A — schema + API (~14 h)

1. [x] **Migration `player_progress`** — files: `supabase/migrations/2026…_player_progress.sql`, `.wiki/modules/api.md`. Red first: new section `progressSchema` reads the migration text and asserts `create table public.player_progress`, `enable row level security`, a `deny browser` policy, `on delete cascade`, and `'progress'` in the `submission_log` kind constraint. Accept: red before the file exists, green after; applied per `.wiki/modules/api.md#applying-a-migration` and read back off the PostgREST OpenAPI doc before any code relies on it. **2 h**
2. [x] **`api/_progress.mjs`: `SYNCED_KEYS`, `sanitiseBlob`, `coinFence`** — red first: section `progressApi` asserts (a) an unknown key is stripped, (b) a non-catalog `ownedItems` id is rejected, (c) `{coins: 10000, ownedItems: [priciest skin]}` with `coins_verified=0, coins_ceiling=50` → coins 0 and the item in `trimmed`, (d) an honest fixture (levels 1-3 at 3 stars, coins = Σ `coinsForResult`) passes untouched. **4 h**
3. [x] **`js/cloud/merge.js` `mergeBlobs`** — red first: section `progressMerge` with the 2.5 table as fixtures; commutativity for every non-recency field; idempotence; `coins ≤ max(a,b)`; equipped falls back to `'classic'` when not owned; source-text guard that the file has no DOM/three imports (same `stripComments(read(...))` idiom as `validate.mjs:1934`). **3 h**
4. [x] **`api/progress/pull.mjs`, `api/progress/push.mjs`** — red first: `progressApi` drives each handler with a fake `req`/`res` and stubbed `rest`: 401 without token, `found:false` on empty, revision bump, server-side merge on stale `base_revision`, `CLIENT_TOO_NEW` at `CURRENT_VERSION+1`, 429 on the 61st push. Accept: green; both routes in the `api.md` Files table. **4 h**
5. [x] **`verifyReplay` stores `coins_collected`; `fw_coins_verified` RPC** — red first: the `runBoard` selftest asserts `_verify.mjs` writes `coins_collected` from `sim.hole.coinsCollected` (same guard style as the `best_chain` guard, `validate.mjs:1934-1939`). Existing rows without the key sum as 0. **1 h**

### Phase B — client sync core (~14 h)

6. [x] **`save.js` v25 + `cloud{}`** — red first: `saveSchema` fails until both `freshSave()` and migration 24 carry `cloud` with the six keys. Accept: `FW_VALIDATE_SECTIONS=saveSchema node tools/validate.mjs` green. **1 h**
7. [x] **`js/cloud/blob.js` `toBlob`/`applyBlob`** — red first: section `progressBlob` asserts `Object.keys(toBlob(freshSave()))` equals `SYNCED_KEYS`; `outbox`/`player`/`cloud`/`settings.quality` never appear; `applyBlob(toBlob(s))` round-trips the synced subset. **2 h**
8. [x] **`js/cloud/sync.js`: `pull`, `push`, `scheduleSync`, `flushSync`, `onIdentityChanged`** — red first: section `progressSync` under a fake `fetch` and fake timers: five dirty marks collapse into one push; retryable failure keeps `dirty`; 401 stops retrying and sets `cloud.state='signed-out'`; push during `playing` is deferred; pull merges rather than overwrites; import-guard that the pure-sim modules do not import it. **5 h**
9. [x] **Wire triggers** — `save.js` recorders mark dirty; `main.js` `buy`/`buyUpgrade`/`equip`; the five menu-return sites; `drainSavedBoardOutbox` piggyback; `applyIdentity` hook. Red first: `progressSync` asserts each recorder sets `save.cloud.dirty` and `lastLocalChangeAt`. **3 h**
10. [x] **Cloud-side schema upgrade on pull** — red first: a remote blob at `schema_version=24` pulled by a v25 client passes through `MIGRATIONS[24]` before merge (fixture: `cloud` absent → present, no throw). **1 h**
11. [x] **`signOutPlayer(save)` in `js/board/player.js`** — flush, drop `fw-player`, auto name, keep progress. Red first: `progressSync` asserts the order flush→remove and that `save.coins` survives. **2 h**

### Phase C — UI (~10 h, front-end assets per rule 9)

12. [x] **Menu copy + synced indicator** — `js/ui/screens.js:212-219`, `js/ui/boards.js:585-597`, CSS. Red first: section `progressUi` asserts the four state strings exist in source and none contains `http://`. Accept: rendered check on the live URL by `ui-visual-validator`. **4 h**
13. [x] **First-time note + trimmed notice** — profile tab. Red first: `progressUi` asserts the card shows once (`firstNoteShownAt`, added in task 6 so it is one migration, not two). **2 h**
14. [x] **Sign-out button + signed-out-elsewhere state** — profile tab. Red first: source guard that the button calls `signOutPlayer` (the `tools/sfx-event-guard.test.mjs` idiom of executing lifted source). **2 h**
15. [x] **Help/FAQ entries** — `js/ui/help.js` (`help.js:423` currently ties sign-in to ranked only). Red first: `helpAndWalkthrough` selftest count rises and an answer mentions "coins, skins". **2 h**

### Phase D — rollout + docs (~8 h)

16. [x] **Server flag `FW_PROGRESS_SYNC=true`** (like `FW_BOARDS_ACCEPTING`); unset → 503 `SERVER_NOT_READY`, already `retryable`. Red first: `progressApi` asserts the 503. **1 h**
17. [x] **Docs** — `.wiki/modules/api.md` (routes, fence, RLS), new `.wiki/modules/cloud.md` (`covers: js/cloud/**, api/progress/**`), `STATUS.md`, `.wiki/roadmap.md`, ADR-0021 "Progress is a merged document; coins are fenced, not trusted". **3 h**
18. **Live smoke on playflywheel.com** — sign up on A, earn, sign in on B, see coins/skins; go offline on B, earn, reconnect, converge; hand-edit `coins: 999999` on A, push, watch the fence. Recorded in `.wiki/runbooks/`. **3 h**
19. **Full `node tools/validate.mjs` → ALL PASS**, commit per `coding-sop`. **1 h**

Total ≈ 46 h.

## 5. Risks and open product questions

Risks, in what-the-player-sees terms:
- Someone who edits their own save can still keep coins up to a generous ceiling. That is deliberate so no honest player is ever docked; cosmetics are not a competitive edge, so this is a fairness nicety, not a wall.
- Two devices played offline for a long time keep the better of every best, but "runs" and "clears" counters may read a little low (max, not sum). Nobody loses a record.
- Signing in on a second device signs the first out (already true today). With sync, the first device also stops syncing until you sign in again; it keeps playing fine.
- The progress document is capped at 64 KB per account; today's largest realistic save is far below that.

Product questions (player-visible only; plan assumptions in parentheses):
1. When someone signs **out** on a shared tablet, should coins, skins and stars stay on the tablet for the next person, or should it go back to a blank slate? (Stay.)
2. When a different account signs in on that tablet, should whatever was earned on it before join that account? (Yes, it merges in.)
3. Should the "synced" dot show on the title screen, or only inside the profile screen? (Dot on title, words in profile.)
4. Should guests with an automatic name and no password get their progress backed up too, so it survives if they later add a password from a different phone? (Yes, silently.)
5. If a purchase gets trimmed by the fence, should the player be told which item, or just see the correction quietly? (One line, once, naming nothing.)

## 6. Out of scope

- Any change to how scores are verified or ranked (invariant 8 untouched).
- Multiplayer state, room codes, or per-match coin pools (`js/multiplayer/`).
- Password reset / email; the account model stays name+password / transfer code / device key.
- Syncing `settings.quality`, `perfMode` or the dev `vox*` sliders across devices.
- Rewriting the ranked `outbox`; that queue keeps its own drain.
- Server-side anti-cheat beyond the coin plausibility fence.
- Achievement rows for Cambridge Phase 7 (blocked on this same backend, separate plan).
