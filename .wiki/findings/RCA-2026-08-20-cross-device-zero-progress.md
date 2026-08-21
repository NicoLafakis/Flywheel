# RCA — Same player name, empty progress on a second device (2026-08-20)

**Reporter:** Nico, product owner. Signed in as "Cr4sh0veRide" on two devices;
one shows real coins/stars, the other shows the same name but zero of
everything, as if it were a brand-new account.

**Severity:** High. This is the exact feature (cross-device progress) the
2026-08-17 cloud-progress-sync plan shipped to guarantee, and the failure mode
is silent: nothing in the UI tells the player their "sign-in" did not connect
to their real account.

**Status:** diagnosis only, not fixed. Confirmed at the code level; the exact
trigger on Nico's second device is not confirmed from logs (none were queried
against a known timestamp — see section 5).

---

## 1. Symptom

**As reported:** same player name shown on both devices; one device has full
progress, the other shows zero as though it were an empty/new account, despite
being "signed in" under the same name.

**Precise characterization:** the second device's local save has
`player.name === "Cr4sh0veRide"` and `player.nameSource === 'claimed'`, but its
`player.id` is not the server's real player id for that account and its
`fw-player` token in `localStorage` is not a token the server ever issued. The
device believes it is signed in; the server has never heard of this
`player_id`, so no pull/push against the real account ever happens.

## 2. Root cause

**Confidence: high on the mechanism, medium on the exact trigger.**

`registerPlayer`, `loginPlayer` and `claimName` in `js/board/player.js` each
wrap their server call in a try/catch whose catch block only re-throws for a
short whitelist of expected 4xx outcomes (`400`/`409` name conflicts,
`401` bad credentials, a couple of named codes). **Any other failure —
including a 404 for "no such player," a 5xx, a timeout, or a dropped
connection — falls through to a fallback that fabricates a brand-new local
identity** (`local-<random>` id, `local-token-<random>` token), stores it as
the device's player secret, and then calls `applyIdentity(save, { player_id:
localId }, name)` with the name the player actually typed. `applyIdentity`
sets `nameSource = 'claimed'` and stores that name — so the UI afterwards
looks and reads exactly like a real, successful sign-in to the typed name,
even though nothing was verified against the server and no real account was
ever touched.

This is not a new discovery in isolation: `.wiki/runbooks/cloud-progress-smoke-2026-08-17.md`
observation #2 already caught the same mechanism ("A 503 on sign-in reads as
success... on a second device any password 'signs in' to a name that does not
exist") during a pre-launch smoke test, when Vercel's env vars were briefly
unconfigured and every DB route answered 503. Nico's report is the same code
defect surfacing again, in production, for a player rather than a smoke
script.

The most likely concrete trigger for `loginPlayer` specifically is a **404
`PLAYER_NOT_FOUND`** response, which is not in the login whitelist at all
(only `400`/`401` and two named codes are). A 404 is exactly what
`api/auth/login.mjs:20-22` returns when the queried `name_key` has no row —
i.e., the server genuinely has never seen an account by that name. `login.mjs`
looks the player up **by name only** (`name_key=eq....`, `api/auth/login.mjs:18`),
so a 404 there means "no such account," not "wrong device."

## 3. Causal chain

- **Trigger:** on the second device, the player used the Profile screen's
  sign-in form (`js/ui/boards.js:650-740`), which defaults to the "SIGN IN"
  tab, typed the name "Cr4sh0veRide" and some password, and submitted. The
  call `loginPlayer(save, name, password)` (`js/board/player.js:79-95`) went
  to `POST /api/auth/login` and did not come back with one of the whitelisted
  outcomes.
- **Proximate cause:** `js/board/player.js:85-94` — the catch-all fallback
  minted a fresh `local-*` identity and unconditionally applied the *typed*
  name to it via `applyIdentity` (`js/board/player.js:47-59`), which stamps
  `nameSource = 'claimed'` regardless of whether the identity is real.
- **Root cause:** a design/implementation decision (visible in the same
  fallback shape repeated three times — `registerPlayer`, `loginPlayer`,
  `claimName`) to treat "the player must never be left without SOME
  identity" (invariant 10: an offline player can always keep playing) as
  license to fabricate a *successful, named, "claimed"* identity on ANY
  unrecognized error, rather than distinguishing "keep playing as a local
  guest" from "we told you that you were signed in." The whitelist approach
  (allow-list a few expected codes, treat everything else as an outage)
  inverts the safer default — it should deny-list the small set of errors
  that are genuinely safe to paper over (no network at all) and treat
  everything else, including any unrecognized status, as a loud failure.
- **Contributing factor 1 — no visual difference between a real and a
  phantom "claimed" account.** `js/cloud/sync.js:96-101` (`usable()`) treats
  any `local-*` player_id as unsyncable and `syncStatus()` returns `'idle'`
  for it. `js/ui/sync-copy.js:29-32` (`syncIndicator`) maps `'idle'` to `null`
  — no dot at all, the same as a never-touched guest. `js/ui/boards.js:742-745`
  then unconditionally prints "Signed in as 'X'. Your coins, skins, stars and
  verified scores are credited to this account on every device," which is
  false for a `local-*` identity. The only honest signal is the toast at
  `js/ui/boards.js:730-732` ("...Local/Offline Mode)"), which is on-screen for
  600 ms and easy to miss or dismiss.
- **Contributing factor 2 — possible upstream compounding.** If device 1's
  own original register/login/claim call also silently fell into this same
  fallback at some point (plausible before 2026-08-17, when the Vercel
  project had no environment variables and every DB route 503'd — see the
  runbook), device 1's progress, while completely real on that device, was
  *also* never actually pushed to a real server-side account. In that case
  the second device's 404 is not a fluke; it is the server correctly
  reporting that no such account has ever existed, and device 1 has been
  living in the same "looks synced, isn't" state the whole time without
  Nico noticing (because local progress always displays correctly
  regardless of cloud sync).

## 4. Competing hypotheses considered

1. **Wrong password on device 2, whitelisted 401, loud error shown.**
   Falsified by code: `loginPlayer`'s catch explicitly rethrows on
   `error.status === 401`, so a genuine wrong-password attempt surfaces
   "Incorrect password for this player name" and does NOT create a phantom
   identity or overwrite the displayed name. Ruled out as the explanation
   for what Nico saw (a matching name with zero progress, not an error
   message).
2. **Player typed the name into the post-run "claim" screen
   (`mountClaim` / `claimName`) instead of signing in, and the name was
   already taken.** Falsified for the "already taken" case: `api/name/claim.mjs`
   returns `409 NAME_TAKEN` for a name that already belongs to a registered
   account, and `claimName`'s catch explicitly rethrows on `409`/`NAME_TAKEN`
   — so this path is loud, not silent, when the account genuinely exists
   server-side. It remains a live (if less likely) hypothesis only if the
   `claimName` call itself hit a non-4xx error (network blip, 5xx), which
   falls into the exact same fallback family as `loginPlayer`'s. Not
   preferred over the login hypothesis because the Profile screen (the
   obvious "sign in on my other device" affordance) defaults to the SIGN IN
   tab, which is the more natural action for a returning player.
3. **`device_key` collision or mismatch misrouting the account lookup.**
   Falsified by code: `api/auth/login.mjs:18` resolves the account by
   `name_key` alone; `device_key` is validated for shape
   (`isDeviceKey`) and stored/rate-limited but never used to select which
   player row is returned. A device_key issue cannot produce "signed in as
   the right name, wrong account."
4. **Name-casing/leet-normalization mismatch making the server look up a
   different key than device 1's account used.** Checked and set aside:
   `normaliseName` (`api/_lib.mjs:196-204`) and the client's `nameKey`
   (`js/board/names.js:98-101`) apply the identical leet-fold + lowercase
   transform and are pinned equal by `tools/names.test.mjs`. A name typed
   identically to how it displays folds to the same key both times. Would
   require an actual typo, which the reported symptom ("same name shown")
   argues against, since the fallback always displays back exactly what was
   typed.
5. **Second-device login legitimately signs the first device out (by
   design), and Nico is misreading that as "no progress."** Ruled out:
   `api/auth/login.mjs:35-38` documents that a second-device login rotates
   the session token and signs the first device's session out, but it never
   touches `player_progress`, coins, or stars, and the first device keeps
   its local save untouched. This design only affects the FIRST device's
   *sync status* going forward, not either device's displayed progress
   figures.

## 5. Evidence log

- Read in full: `js/board/player.js`, `js/cloud/sync.js`, `js/ui/boards.js`,
  `js/board/names.js`, `js/save.js` (name/`nameSource` handling),
  `js/ui/sync-copy.js`, `api/auth/login.mjs`, `api/auth/register.mjs`,
  `api/name/claim.mjs`, `api/_lib.mjs`.
- Confirmed the login/register/claim fallback whitelist boundaries by direct
  read of each catch block (`js/board/player.js:68`, `:86`, `:104`).
- Confirmed `api/auth/login.mjs` looks a player up by `name_key` only (line
  18) and returns `404 PLAYER_NOT_FOUND` (line 21) for an unmatched name —
  a status not in `loginPlayer`'s whitelist.
- Confirmed the sync status/indicator path treats a `local-*` secret as
  `'idle'` with no visible dot (`js/cloud/sync.js:96-101`,
  `js/ui/sync-copy.js:29-32`), so a phantom "claimed" identity is
  indistinguishable at rest from a genuinely synced one, aside from the
  600 ms sign-in toast.
- Cross-checked against `.wiki/runbooks/cloud-progress-smoke-2026-08-17.md`
  observation #2, which independently found and documented the same
  mechanism ("A 503 on sign-in reads as success... on a second device any
  password 'signs in' to a name that does not exist") during a live smoke
  test before this bug report.
- **Not done, and the thing that would fully settle the exact trigger:**
  querying Vercel runtime logs for `POST /api/auth/login` (and
  `/api/name/claim`) requests whose `name` body field folds to the
  `cr4shoveride` name-key, filtered to the window Nico noticed the problem,
  to see the actual status code(s) returned (404 vs 5xx vs none at all). No
  report timestamp was supplied, so this query was not run; it is the
  concrete next step if the fix needs to be proven against Nico's real
  incident rather than the class of bug.
- Falsified hypotheses: wrong password (2 above), claim-name-taken (2
  above), device_key mismatch (3), name-casing mismatch (4), and
  second-device-sign-out-explains-it (5) — see section 4 for each with its
  falsifying evidence, so a future investigator does not re-walk them.

## 6. Blast radius

**Every caller of the fallback pattern is affected, not just login:**

| File:line | Call | Whitelisted (loud) | Falls silently local on |
| --- | --- | --- | --- |
| `js/board/player.js:61-77` | `registerPlayer` | 400, 409, `NAME_TAKEN`, `PASSWORD_SHORT`, `NAME_BLOCKED` | any other status/code (404 impossible here, but 5xx/timeout/network are not) |
| `js/board/player.js:79-95` | `loginPlayer` | 400, 401, `NAME_INVALID`, `INVALID_CREDENTIALS` | **404 `PLAYER_NOT_FOUND`**, 5xx, timeout, no response |
| `js/board/player.js:97-113` | `claimName` | 400, 409, `NAME_TAKEN`, `NAME_BLOCKED` | 5xx, timeout, no response |
| `js/board/player.js:115-129` | `renamePlayer` | 400, 409, `NAME_TAKEN`, `NAME_BLOCKED` | 5xx, timeout, no response (lower severity: does not change `player_id`, only re-labels the existing identity locally) |

`redeemTransfer` (`js/board/player.js:137-142`) has no catch at all — a
transfer-code redemption failure propagates as a real error, which is the
correct shape and a useful contrast: it shows the pattern is a choice made
per-call, not a shared necessity.

Every one of these silent-fallback sites shares the same downstream symptom
class: a "claimed," name-bearing, UI-confident identity that the server does
not recognize, invisible until the player compares two devices.

## 7. Fix specification

**File: `js/board/player.js`**

1. Replace the "whitelist the safe errors, fall back on everything else"
   shape with a deny-list of the ONLY conditions that should silently mint a
   local identity: a genuine network failure (`fetch` threw / `error.status`
   is undefined) or a `5xx`/`429` that the server itself flags `retryable`
   (the `fail()` helper in `api/_lib.mjs` already stamps a `retryable`
   boolean on 429s and 503s — thread it through `post()`'s error object if
   it is not already). Every other outcome, including `404`, must re-throw
   and surface a real error to the player, not fabricate success.
   - `registerPlayer` (`:61-77`), `loginPlayer` (`:79-95`), `claimName`
     (`:97-113`), `renamePlayer` (`:115-129`): same change in each, ideally
     factored into one shared `isRetryableOffline(error)` helper so the four
     call sites cannot drift again.
2. For `loginPlayer` specifically: a `404 PLAYER_NOT_FOUND` must never fall
   back to a local identity under a name that is not the player's own. Show
   the server's message ("No player found with that name. Please create an
   account.") so the player is told plainly instead of being handed a
   silently-empty phantom account under their own name.
3. When a genuinely offline fallback DOES fire (no network at all), do not
   set `nameSource = 'claimed'`. Either add a distinct `nameSource` state
   (e.g. `'pending'`) or otherwise mark the save so the UI in `js/ui/boards.js`
   can render "not yet signed in — will retry when you're back online"
   instead of "LOGGED IN ACCOUNT... credited to this account on every
   device." This closes contributing factor 1: an honest fallback must look
   different from a real sign-in, not just say so for 600 ms.

**File: `js/cloud/sync.js` / `js/ui/sync-copy.js`**

4. `syncIndicator('idle')` currently returns `null` for both "never tried to
   sign in" and "tried, only got a local fallback." Once (3) distinguishes
   the two states, give the fallback state its own label (e.g. "NOT
   CONNECTED — sign in again" ) rather than folding it into the silent
   `'idle'` bucket.

**Regression tests (write first, per this repo's TDD rule):**

5. `tools/*.test.mjs` (wherever `js/board/player.js` is currently covered,
   or a new `tools/player-identity.test.mjs`): mock `post()` to reject with
   `{ status: 404, code: 'PLAYER_NOT_FOUND' }` and assert `loginPlayer`
   rejects (does not resolve with `isOffline: true`), and that no
   `local-*` secret is written to storage.
6. Same harness: mock `post()` to reject with a plain network error (no
   `status` at all) and assert the OLD offline behavior is preserved —
   `loginPlayer` resolves with a fallback identity, `isOffline: true`, and
   (post-fix-item-3) `nameSource` is NOT `'claimed'`.
7. Mock a `503` with `retryable: true` and assert it also takes the offline
   fallback path (this is the legitimate case invariant 10 protects).
8. A UI-facing check (`tools/progress-ui.test.mjs` or sibling) that a
   fallback identity's `syncIndicator` is never `null`/absent alongside a
   `nameSource === 'claimed'` card — i.e., the UI cannot claim "credited to
   this account on every device" for an identity that is not.

## 8. Prevention

The class of bug is "a client-side try/catch turns an unrecognized server
failure into a fabricated success," which is exactly the shape already
flagged once (2026-08-17 runbook observation #2) and not fixed before it
reached a real player. Two process changes, not new tooling:

1. **Findings and runbook observations that describe a live defect (not just
   a smoke-test curiosity) need a tracked follow-up, not just a paragraph.**
   Observation #2 in the 2026-08-17 runbook described this exact mechanism
   accurately three days before Nico hit it in production. Add a short
   "Open defects observed during smoke/RCA work" list to `STATUS.md` (or
   equivalent) that any RCA/runbook with a live (non-hypothetical) defect
   appends to, so "we already knew this could happen" turns into "we already
   scheduled the fix."
2. **Any error-handling fallback that changes what the UI *claims* about
   account state (signed in / synced / claimed) is a candidate for a
   dedicated test, not just a try/catch reviewed by eye.** The four sites in
   section 6 were added in one shape and never re-verified against the
   growing set of server error codes as `api/auth/login.mjs`,
   `api/auth/register.mjs` and `api/name/claim.mjs` gained more specific
   `fail()` codes over time. When a server route adds a new error code,
   check whether the client's catch already covers it explicitly, rather
   than trusting the `else` branch.
