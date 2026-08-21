---
covers:
  - "js/cloud/**"
  - "api/progress/**"
  - "js/ui/sync-copy.js"
---
# Cloud progress sync

## Purpose

Coins, skins, stars and upgrades follow the signed-in player across devices —
built from `.wiki/plans/cloud-progress-sync.md`. Before this, only the
leaderboard identity was global; the local save (`js/save.js`) was per-device.
This module is the client half of that plan (the server half,
`api/_progress.mjs` and `api/progress/*.mjs`, is documented in
[api.md](api.md)'s "Cloud progress" section — read that first for the schema,
the coin fence and the merge rule, since both sides import the same
`mergeBlobs()` from `js/cloud/merge.js`).

On by default: the server routes answer `503 SERVER_NOT_READY` only while
`FW_PROGRESS_SYNC=false` is set on Vercel (`.env.example`), the emergency pause. A player never
notices either way — the sync indicator (2.6 below) only appears once a save
has something to say.

## Key files

| File | Purpose |
|------|---------|
| `js/cloud/blob.js` | The boundary. `SYNCED_KEYS` (`coins`, `levels`, `sandbox`, `challenges`, `ownedItems`, `equippedSkin`, `equippedIndicator`, `upgrades`, `muted`, `settings`) and `SYNCED_SETTINGS_KEYS` (`masterVol`, `sfxVol`, `musicVol`, `ambVol`, `turnSens` — taste, not device capability) are defined HERE, not in `api/_progress.mjs`, because Vercel does not serve `api/` as static files: the browser can import from `js/`, the server can import from `js/` too, so one definition settles which keys travel. `toBlob(save)` deep-copies exactly that subset out of a save; `applyBlob(save, blob)` writes it back, touching nothing else. Never `outbox`, `player`, `cloud`, `version`, or a settings key outside the taste list (`quality`, `perfMode`, `vox*` dev sliders stay on the device) |
| `js/cloud/merge.js` | The ONE merge, `mergeBlobs(a, b, {aChangedAt, bChangedAt})`. Pure — no DOM, no clock, no randomness; recency is decided by the timestamps the caller passes. The client runs it on pull (local vs remote); the server runs it on a stale-revision push (stored vs incoming) via `api/_progress.mjs`'s re-export, so the two sides cannot disagree. See the field-by-field table below |
| `js/cloud/sync.js` | The client state machine: `pull`, `push`, `scheduleSync`, `flushSync`, `onIdentityChanged`, `resetForSignOut`, wrapped as `createSync(deps)` (the seam `tools/progress-sync.test.mjs` drives with a fake clock) and instantiated once as the game's `instance`. Debounces writes, defers pushes while `state === 'playing'`, and never touches a live `sim` (invariant 4) |
| `js/ui/sync-copy.js` | Pure words-and-state-mapping for the sync surface: `SYNC_LABELS`/`SYNC_DETAIL` (five states, `synced`/`syncing`/`offline`/`signed-out`/`not-connected`; `idle` deliberately renders nothing rather than a sixth "NOT SYNCED" label on a fresh install), `syncIndicator(status)`, `shouldShowFirstNote`/`markFirstNoteShown`/`firstNoteText`, and `trimmedNoticeText(trimmed)`. No DOM, no three.js — `js/ui/boards.js` is a thin renderer over this |

## Merge rules (`mergeBlobs`)

Every field keeps the BETTER of the two sides — never a sum, because two
devices that both advanced from a common base would double-count under sum:

| Field | Rule |
|---|---|
| `levels[i].stars`, `bestMass`, `bestCombo` | max |
| `levels[i].won` | OR |
| `levels[i].fastestClear` | min of non-null |
| `sandbox[s].bestSize/bestCombo/bestScore/bestPercent` | max; `bestTime` min of non-null |
| `sandbox[s].completions`, `runs` | **max, not sum** |
| `challenges[s].completed*` | OR; `bestTime*` min of non-null; `bestScore*` max |
| `ownedItems` | set union, `a`'s order first |
| `upgrades[k]` | max rank |
| `coins` | **max, never summed** — the server's coin fence (`api.md`) is authoritative on the next push |
| `equippedSkin`, `equippedIndicator`, `settings.*`, `muted` | whichever side's `aChangedAt`/`bChangedAt` is newer; an equipped id that ends up neither owned nor free falls back to `'classic'` / `'ind-default'` (the same rule the v24 migration in `js/save.js` uses) |

## Sync triggers and the state machine (`js/cloud/sync.js`)

- **Identity change** — register, login, claim, transfer redeem, guest
  provisioning (`applyIdentity()`, `js/board/player.js:41`) calls
  `onIdentityChanged(save)` → `pull()`. On a first sign-in with nothing stored
  server-side (`found:false`) and a non-trivial local save (`hasProgress()`:
  any coin, owned item, star, sandbox run/completion, challenge win, or
  upgrade rank), the local blob becomes the account's first document at
  revision 1 — "this phone's progress now belongs to your account."
- **After each write path** — `save.js`'s `onProgressDirty(fn)` seam is the one
  place every recorder (`recordLevelResult`, `recordSandboxResult`,
  `recordChallengeResult`) and `buy`/`buyUpgrade`/`equip` (`js/main.js`) reach
  through: `markProgressDirty(save)` sets `save.cloud.dirty` +
  `lastLocalChangeAt`, then calls the registered listener, which is
  `js/cloud/sync.js`'s `scheduleSync` — a trailing-edge 8 s debounce
  (`SYNC_DEBOUNCE_MS`), so five dirty marks in a row collapse into one push.
- **Menu return / tab hidden / reconnect** — `flushSync(save)` pushes
  immediately if dirty; called from `js/main.js` at the menu-return sites and
  from `js/board/player.js`'s `signOutPlayer` (awaited, 5 s cap, before the
  local secret is dropped).
- **Deferred while playing** — `push()` returns `null` if `d.isPlaying()`
  (invariant 4: sync never touches a live `sim`, and `main.js` wires
  `isPlaying` through `configureSync`); a canonical/merged blob that arrives
  mid-level is held in `pendingApply` and applied on the next menu return
  (`drainPending`).
- **Failure contract** (mirrors `js/board/outbox.js`) — a retryable error (5xx,
  429, network failure) leaves `dirty` set and `state: 'offline'`; the next
  trigger retries. `401 NOT_SIGNED_IN`, `409 CLIENT_TOO_NEW`, `409
  STALE_SCHEMA` (`STOP_CODES`) stop retrying and set `state: 'signed-out'` (the
  UI shows "SIGNED OUT ELSEWHERE" even for the schema codes — the distinction
  does not matter to the player). `onIdentityChanged` clears the stop. A
  failed push never blocks play (invariant 10).
- **Remote schema upgrade** — `upgradeRemoteBlob(schemaVersion, blob)` runs a
  pulled document at an older `schema_version` through the same
  `__MIGRATIONS` chain (`js/save.js`) a local save would use, wrapped in a
  try/catch that falls back to the blob as-is on any throw (the merge still
  keeps the better field either way).
- **Sign-out** (`resetForSignOut`, called from `js/board/player.js`'s
  `signOutPlayer`) clears the timer and in-flight bookkeeping, resets
  `revision`/`dirty`/`state`, but — product default — **leaves local
  progress on the device**. A shared family tablet loses nothing; signing in
  as a different account merges the tablet's progress into that account
  (only additive, per the merge table above).

## Sync indicator and copy (`js/ui/sync-copy.js`, wired in `js/ui/boards.js`)

Five visible states, `SYNC_LABELS`: `SYNCED` (green), `SYNCING…` (gold,
breathing dot, disabled under `prefers-reduced-motion`), `OFFLINE — WILL SYNC`
(amber), `SIGNED OUT ELSEWHERE` (red), `NOT CONNECTED — SIGN IN AGAIN` (red).
`idle` renders nothing — a guest who never attempted to sign in, or a save
with nothing dirty yet, shows no dot, because a "NOT SYNCED" label on first
launch reads as a fault. `usable()` in `sync.js` still rejects any `local-*`
secret (the server cannot know an offline-minted id), but `status()` now tells
apart WHY it is unusable: a `local-*` secret paired with `save.player.nameSource
=== 'pending'` means `registerPlayer`/`loginPlayer`/`claimName`
(`js/board/player.js`) genuinely could not reach the server and minted an
offline-only fallback identity (RCA-2026-08-20) — that reports `'not-connected'`,
not `'idle'`. Before this fix the two cases were indistinguishable: a phantom,
never-verified "signed in" identity showed the exact same nothing as a guest
who had never tried, which is how a player could look signed in on a second
device while holding zero of their real progress. The dot lives
on the profile tab's name plate (`.fw-sync`, right-aligned via
`.fw-name-plate .fw-sync`, `css/main.css`); guests are cloud-backed too and see
it once their bearer token is real. A one-time dismissable card
(`shouldShowFirstNote`/`markFirstNoteShown`, gated on `player.nameSource ===
'claimed'` and `cloud.lastPulledAt` — never shown before the server has
actually answered once) reads `firstNoteText(name)`. `trimmedNoticeText(trimmed)`
renders one calm line, never naming an item, when the server's coin fence
(`api.md`) trimmed something the last push. A `SIGN OUT` button
(`js/ui/boards.js`) is a distinct action from `removePlayer` (which deletes
the account): it flushes, drops the bearer secret, and returns the device to
an auto-named guest with local progress intact.

## Save schema

`CURRENT_VERSION` is 25 (`js/save.js`); migration 24 adds `cloud{}`
(`defaultCloud()`: `dirty`, `lastLocalChangeAt`, `lastPushedAt`,
`lastPulledAt`, `state`, `revision`, `firstNoteShownAt`) to any save at v24 or
older, and `freshSave()` carries the same shape. See
[campaign.md](campaign.md) for the full migration chain and `save.js`'s
save-schema guard.

## Invariants this module holds to

- **3** pure sim boundary — nothing under `js/cloud/` is imported by
  `rng.js`/`tiers.js`/`citygen.js`/`levels.js`/`sim.js`; the server side
  imports `js/save.js`, `js/skinprices.js`, `js/levels.js`,
  `js/citycatalog.js`, `js/upgrades.js`, `js/voxelsim.js` — all already
  Node-importable, none of them DOM- or three.js-touching.
- **4** gameplay state changes only in `sim.step` — sync applies to the SAVE,
  never a live `sim`; `adopt()` defers while `isPlaying()`.
- **7** `CURRENT_VERSION` 24→25 with a migration; a stored document at a newer
  schema than the server understands is refused (`CLIENT_TOO_NEW`), never
  overwritten.
- **9** `js/cloud/**` never mutates simulation state and never imports
  three.js; all network work is async, outside the fixed-step loop.
- **10** a failed push never blocks play; `dirty` stays true and the next
  trigger retries; sign-in already has a local fallback — narrowed
  (RCA-2026-08-20) to fire ONLY on a genuine network failure or a
  server-flagged-`retryable` `5xx`/`429` (`isRetryableOffline()`,
  `js/board/player.js`), never on an unrecognized real answer like `404`, and
  the fallback identity is marked `nameSource: 'pending'` so it never reads as
  a verified sign-in.

## Guards (`tools/validate.mjs`, `core` group)

`progressBlob` (`tools/progress-blob.test.mjs`) — `Object.keys(toBlob(freshSave()))`
equals `SYNCED_KEYS`; `outbox`/`player`/`cloud`/`settings.quality` never
appear; round-trip through `applyBlob`.
`progressMerge` (`tools/progress-merge.test.mjs`) — commutativity for every
non-recency field, idempotence, `coins ≤ max(a,b)`, equipped-not-owned
fallback, an import-source guard that the file has no DOM/three.js imports.
`progressSync` (`tools/progress-sync.test.mjs`) — fake `fetch` + fake timers:
five dirty marks collapse into one push; retryable failure keeps `dirty`; 401
stops retrying and sets `signed-out`; push during `playing` is deferred; pull
merges rather than overwrites; a remote blob at an older schema is migrated
before merge; an import-source guard that the pure-sim modules do not import
this file.
`progressUi` (`tools/progress-ui.test.mjs`) — the five state strings exist in
source, none contains `http://`; the first-time card and trimmed notice each
render once; the sign-out button calls `signOutPlayer` (checked by executing
lifted source, the `tools/sfx-event-guard.test.mjs` idiom); `main.css` carries
a `.fw-sync--<tone>` rule for every state including `not-connected`.
`playerIdentity` (`tools/player-identity.test.mjs`, run inside the
`progressSync` section since it covers `js/board/player.js`) —
RCA-2026-08-20's regression suite: `isRetryableOffline()`'s deny-list logic
directly; a `404 PLAYER_NOT_FOUND` on `loginPlayer` rejects (no `local-*`
secret written, no fake success); a plain network error (no `error.status`)
still resolves with the offline fallback but `nameSource` is `'pending'`, not
`'claimed'`; a server-flagged-`retryable` `503` also falls back; a
NOT-retryable `503` rejects; `registerPlayer`/`claimName` share the same
deny-list; `renamePlayer`'s fallback stays `'claimed'` (it relabels an
already-real identity, it does not mint a new one); and a UI-facing check that
a `'pending'` fallback identity's `syncIndicator` is never `null` while
`nameSource` is simultaneously `'claimed'`.
