# Cloud progress sync — live smoke, 2026-08-17

Plan task: `.wiki/plans/cloud-progress-sync.md` task 18. Target: production
`https://www.playflywheel.com` after commit `25b824f` (the apex
`playflywheel.com` 308s to `www`, so the game and every relative `/api/...`
fetch were driven on `www`). Method: two isolated headless Chromium contexts
(browser-playwright skill) as "device A" and "device B", plus direct `curl`
probes and `POST /api/progress/pull` with the device's own token.

## Result: PASS (steps 1–4). Step 5 (offline) skipped as optional.

**Provisioning note.** The first attempt found the Vercel project
(`prj_Pgk78mcsRo1wlOFfleLWLBCgjkFf`, team `nicos-projects-896b6ff8`) with no
environment variables at all — every database-backed route (`auth/register`,
`auth/login`, `run/start`) answered `503 SERVER_NOT_READY "The boards service is
not configured yet."`, so nothing online had ever worked on the live site. The
variables named in `.env.example` were provisioned and the project redeployed
on 2026-08-17 as part of this smoke; the run below is against that deploy.
`/api/health` reads no env (`api/health.mjs:4`), so its `ready:true` never
proved configuration — `POST /api/auth/login` with an unknown name answering
`404 PLAYER_NOT_FOUND` is the cheap "DB is wired" probe from now on.

## Per step

| # | Step | Result | Seen |
|---|------|--------|------|
| 1 | `POST /api/progress/pull` | PASS | Empty body → `400 BAD_REQUEST` (the gate validates the body before auth); a well-formed body with an unknown player → `401 NOT_SIGNED_IN`. Never 503: `FW_PROGRESS_SYNC` default is on and the routes are deployed. |
| 2 | Device A registers a fresh account (`smk*` name) | PASS | `auth/register 200`, then `progress/pull 200` (`found:false`) and `progress/push 200`. Save: `cloud.state: synced`, `revision 1`; title/profile dot read SYNCING… then SYNCED; the one-time "SAVED TO YOUR ACCOUNT" card appeared. `pull` with A's token: `found:true, revision 1, schema_version 25`, full blob (settings, upgrades, equipped classic / ind-default) — the `player_progress` row exists. |
| 3 | Device B (fresh context) signs in with the same name/password | PASS | `auth/login 200`, `pull 200`, `push 200`; B's save adopted the account document (`revision 2`, `synced`, SYNCED dot). Coins/skins/stars matched the server row. Side effect by design (`login.mjs`, plan §186): A's token was rotated, A's next push got `401` and A showed "SIGNED OUT ELSEWHERE — sign in again to keep syncing"; A kept playing locally. |
| 4 | Fence: hand-edit `hole-city-save` to `coins: 999999`, `ownedItems: ['galaxy']` (500-coin skin, never earned), `equippedSkin: 'galaxy'`; reload so the boot flush pushes | PASS | Push reply `revision 4`: `coins 0`, `ownedItems []`, `equippedSkin 'classic'`, `trimmed` non-empty; `coins_verified 0`, `coins_ceiling 0` (no levels played, so nothing could have been earned). Local save adopted the canonical blob (coins 0, galaxy gone). Profile tab showed SYNCED plus the card **"SOME ITEMS COULD NOT BE VERIFIED — Some coins or items on this device could not be verified by the server, so they were left out of your account. Everything you earn from here on counts."** `pull` afterwards agrees (`coins 0`). |
| 5 | Offline on B, earn, reconnect, converge | SKIPPED | Optional; not run. |
| — | Cleanup | DONE | "REMOVE IDENTITY FROM BOARDS" on the signed-in device → `player/remove 200`; `pull` with the old token → `401 NOT_SIGNED_IN`; `on delete cascade` erases the `player_progress` row (`.wiki/modules/api.md`). No test rows remain. |

## Observations (no blockers)

1. **Coin-only inflation is corrected silently.** In an earlier pass A carried
   `coins: 40` with no levels; the fence clamped it to 0 (`coins_ceiling 0`)
   and, because no purchase or upgrade had to be unwound, `trimmed` was empty
   and no notice appeared. The notice only fires when an item/upgrade is
   removed (`api/_progress.mjs:182-230`) — matches plan §2.4 / open decision
   5. Anyone re-running step 4 must include an unaffordable paid item to see
   the card; assert `coins <= coins_ceiling` on the pull reply otherwise.
2. **A 503 on sign-in reads as success** (seen in the pre-provisioning run,
   still true in code): `registerPlayer`/`loginPlayer`
   (`js/board/player.js:61-96`) fall back to a `local-*` identity on any
   non-4xx failure, and the profile then says *"Signed in as X. Your coins,
   skins, stars and verified scores are credited to this account on every
   device."* (`js/ui/boards.js:742-745`) with no cloud dot at all — nothing
   can sync, and on a second device any password "signs in" to a name that
   does not exist. Only the 600 ms toast (`js/ui/boards.js:730-732`,
   "Local/Offline Mode") hints otherwise. Intended by invariant 10 (offline
   players keep an identity), but the copy over-promises; a "not connected yet
   — will connect when the service is reachable" line and an OFFLINE — WILL
   SYNC dot for `local-*` secrets would be honest.
3. **Second-device sign-in signs the first device out** — designed
   (`login.mjs`, plan §186), copy is clear ("SIGNED OUT ELSEWHERE"), and the
   signed-out device keeps its local progress. Worth knowing when reading a
   smoke log: after step 3, drive the fence from the *last* device to sign in.

## Re-run recipe

Scripts in the session scratchpad: `smoke.js` (A registers, API pull, B logs
in, fence, remove) and `fence.js` (single device: log in, inflate, reload,
read `.fw-sync-word` + profile text + push reply, remove). Expected: A SYNCED +
`found:true`; B SYNCED with the same blob; fence reply `coins == coins_ceiling`,
inflated paid item absent, `trimmed` non-empty, "SOME ITEMS COULD NOT BE
VERIFIED" card; `player/remove 200` then `pull → 401`.
