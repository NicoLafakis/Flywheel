# ADR-0021: Progress is a merged document; coins are fenced, not trusted

- **Status:** accepted
- **Date:** 2026-08-17
- **Deciders:** Nico, Ares

## Decision

Cloud progress sync (`.wiki/plans/cloud-progress-sync.md`, `.wiki/modules/cloud.md`)
stores one `player_progress` row per `players.id` — a syncable subset of the
local save (`coins`, `levels`, `sandbox`, `challenges`, `ownedItems`,
`equippedSkin`, `equippedIndicator`, `upgrades`, `muted`, taste `settings`) —
and moves it between devices under two rules that hold everywhere in the
system, client and server alike:

1. **Two records never overwrite; they merge.** `mergeBlobs()` (`js/cloud/merge.js`)
   is the ONE merge function, imported by both the client (on pull) and the
   server (`api/_progress.mjs`, on a stale-revision push). Every field keeps
   the *better* of two sides — max of bests, min of times, OR of flags, union
   of owned items, max of upgrade ranks. Counters (`sandbox[s].runs`,
   `completions`) also take max, not sum, because two devices that both
   advanced from a common ancestor would double-count under sum; max
   under-counts by at most the smaller delta, which is the safer error to
   make on a number nobody is competing over.

2. **The server never trusts a coin balance, and never adds coins.** A save is
   documented as hand-editable (`js/save.js`), so `blob.coins` from a push is
   a claim, not a fact. The server computes `earned_allowed = coins_verified +
   coins_ceiling` — `coins_verified` from `fw_coins_verified()`, the sum of
   `coins_collected` over the player's server-replayed RANKED runs (the one
   coin source that is actually proven); `coins_ceiling` from a pure function
   of the record itself (`coinsForResult(level, stars, bestCombo) ×
   REPLAY_ALLOWANCE` for campaign levels, capped run counts × max payout for
   sandbox/challenges) — and stores `min(client.coins, earned_allowed −
   spent)`. If that is negative, purchases unwind (upgrades top-rank first,
   then items newest-first) until it is not, and the client is told what was
   trimmed in one line, naming nothing.

## Why

Coins were multi-sourced from the start (ranked runs, campaign stars,
free-play sandbox, challenges) and only one of those sources is independently
verifiable — the others are the client reporting its own math. A naive "last
write wins" sync would let a hand-edited `hole-city-save` (`save.js:113`
documents it as such) simply overwrite a legitimate cloud balance on the next
push. A naive "sum on merge" would let the *same* honest progress get counted
twice the moment two devices both advance from one shared cloud snapshot —
runs, completions and coins would inflate every time a player opened the game
on a second phone.

The fence is deliberately generous — `coins_ceiling` assumes every level was
replayed at its best result three times, every sandbox/challenge scene run its
capped count at maximum payout — because cosmetics are not a competitive edge
and docking an honest player is judged the worse failure than letting a
determined edit keep coins up to what they plausibly could have earned
honestly. This is a plausibility fence, not an anti-cheat wall.

## Rejected alternatives

- **Last-write-wins on `revision`.** Simple, but a device that has been
  offline for a week and comes back with a stale `base_revision` would either
  silently lose everything it earned meanwhile, or (if it always won) erase
  what the other device did in the meantime. Merge is the only rule under
  which two devices playing the same account, online or not, always converge
  on the union of what both of them actually did.
- **Sum coins across devices, sum counters across devices.** The double-count
  failure above. Rejected outright — it is not a tuning question, it is wrong
  by construction the moment two devices share a base revision.
- **Trust the client's coin balance and validate only the delta since last
  push.** Still lets a single hand-edited save mint an arbitrarily large
  one-time delta; the ceiling has to be a function of the whole record, not
  the change, to bound what a single edit can do.
- **A full anti-cheat pass (device attestation, behavioral heuristics).** Out
  of scope by design (`.wiki/plans/cloud-progress-sync.md` §6) — cosmetics are
  the only thing at stake, and the ceiling already makes an honest player
  unable to hit the fence.

## Consequences

- `js/cloud/merge.js` and `api/_progress.mjs`'s `coinFence()`/`coinsCeiling()`/
  `spentCoins()` are the only places this logic exists; the client applies the
  server's canonical response rather than re-deriving trust locally.
- A player who edits their own save keeps coins up to a generous, honestly-
  earnable ceiling — cannot be docked below what they actually did, cannot
  mint past what they plausibly could have.
- Two devices played offline for a long stretch converge to the better of
  every best on the next sync; run/completion counters may read a little low
  (max, not sum) rather than double-counting. Nobody's record regresses.
- Adding a new synced field later means adding it to `SYNCED_KEYS`
  (`js/cloud/blob.js`), a merge rule in `mergeBlobs()`, and a sanitiser rule in
  `sanitiseBlob()` — three places, one guarded set
  (`tools/progress-blob.test.mjs` pins `toBlob()`'s keys to `SYNCED_KEYS`), so
  a forgotten field fails the validator rather than silently not traveling.

See `.wiki/modules/cloud.md` for the full mechanism and `.wiki/modules/api.md`'s
"Cloud progress" section for the server-side schema and RLS posture.
