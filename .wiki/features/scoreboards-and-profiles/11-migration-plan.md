# Scoreboards & Profiles — Migration Plan

> [Objective overview](00-objective-overview.md) · [Technical design](03-technical-design.md) ·
> [Anti-cheat](04-anti-cheat.md) · [Identity](05-identity-and-names.md)

Two migrations: the save schema, and what happens to the records existing players
already have. The second is the one with a product decision in it.

> **Applied 2026-08-12:** `js/save.js` now migrates v16 to v17 and initializes
> the same shape for fresh saves. The forward-only Supabase migrations
> `20260812204210_scoreboards_profiles.sql`,
> `20260812205233_harden_scoreboards.sql`, and
> `20260812211000_add_overall_board_rank.sql` are applied to the live Flywheel
> project. They create a private raw-record surface, a browser-readable derived
> publication, and rank-at-read-time views; no local score was backfilled.

---

## 1. The governing position

**`localStorage` stays the source of truth for everything it holds today. The
boards are an additional, optional thing on top.** Nothing that works offline
today starts needing a network, and nothing in the save is replaced by a server
copy. This is `AGENTS.md` invariant 9 stated as a migration rule.

There is deliberately **no cloud save sync** in this package. `online-flywheel`
designed a full join-semilattice merge of the save across devices, and that design
is good — but it exists to serve accounts, and accounts were ruled out. With one
device holding one name, there is nothing to merge. The transfer code
([05](05-identity-and-names.md) §4.2) moves the *name*; the local save stays with
the device, and the profile screen says so.

---

## 2. Save schema v16 → v17

### 2.1 What is added

```js
// Public facts only. The bearer token is NOT here — see §2.3.
player: { id: null, name: null, claimedAt: null },
// Submissions recorded while offline or rate-limited, awaiting upload.
outbox: [],
```

### 2.2 The three-part obligation, and the trap it exists to avoid

`AGENTS.md` invariant 6 and `.wiki/conventions.md` require: bump
`CURRENT_VERSION`, add `MIGRATIONS[16]`, **and add the same keys to
`freshSave()`.** All three, in the same commit.

`js/save.js` already carries a long comment explaining exactly why, and it is not
hypothetical: migration 10 added `sandbox`, `freshSave()` never did, migrations
only run for saves *older* than `CURRENT_VERSION` — so every save born at v11 or
later had no `sandbox` object at all, `recordSandboxResult` threw on the first
statement of the results-screen callback, and **both buttons on the sandbox
results screen went dead with no symptom other than a console TypeError. The
player was stuck on the screen.**

`player` and `outbox` are the same shape of key. Every player who installs after
this ships is born at v17, skips the migration, and hits `save.player.id` on the
first claim. The validator's key-set guard is what catches this and it must be
**extended, not forked**, to walk `player` as a nested container the way it
already walks `settings`.

```js
16: (s) => ({
  ...s,
  version: 17,
  player: { ...defaultPlayer(), ...(s.player || {}) },
  outbox: Array.isArray(s.outbox) ? s.outbox : [],
}),
```

Every reader also re-establishes its own container (`if (!save.player)
save.player = defaultPlayer();`) — one `||` to guarantee a screen can always be
left, which is the same seatbelt `recordLevelResult` and `recordSandboxResult`
already wear and for the same reason.

### 2.3 What is deliberately not in the save

**The bearer token.** It lives in `localStorage['fw-player']`, separately, because
the save is quarantined on corruption, is a candidate for export, and is
hand-edited by curious players. `online-flywheel/12-migration-plan.md` §1.3 got
this right — no auth token in `hole-city-save` — and it holds here.

Also not in the save: cached board data (a separate disposable cache key, so
clearing it is free and it never bloats the quarantine blob), and any server
score.

### 2.4 Version discipline

`CURRENT_VERSION` only ever goes up, and a released version number is never reused
for a different shape. A v17 save handed to a v16 client quarantines and returns
fresh, which is correct and which is why the quarantine key must never be
repurposed. Note that quarantine is *less* recoverable here than
`online-flywheel` imagined, because there is no cloud copy of the save to restore
from — so if a player trips it, they lose local progress. That is unchanged from
today and this feature does not make it worse, but it also does not fix it.

---

## 3. Existing local records — the product decision

### 3.1 What exists

`js/save.js` `recordSandboxResult` writes, per scene:

```js
save.sandbox[scene] = { completions, bestSize, bestTime, bestCombo, bestScore };
```

`bestCombo` and `bestScore` are new as of v16 and older rows simply do not have
them, which is honest — they were never measured. The title screen's card shelf
already renders `CLEARED ×N · BEST SIZE n` from this, via
`js/ui/screens.js`'s per-chip progress line.

### 3.2 The decision

> **Existing local records are kept, displayed, and never ranked.**

They are preserved byte for byte by the migration, they continue to render exactly
where they render today, and they gain a home on the new profile screen under
**YOUR HISTORY**. They do not seed any board.

### 3.3 Why not admit them, flagged

Three reasons, in increasing severity:

1. **They are unverifiable and always will be.** No build has ever recorded an
   input trace, so there is nothing to re-simulate. Admitting them would mean the
   board contains numbers we cannot recompute, which is the exact thing the
   owner's second decision rules out.
2. **They are also from a different game.** They are records of the *50% city
   clear*, which is a run of minutes to tens of minutes. The board ranks a
   90-second run. A `bestScore` from a full clear and a `verified_score` from a
   90-second run are not the same measurement and putting them in one column would
   be wrong even if both were verified.
3. **`hole-city-save` is a plaintext JSON blob at a guessable localStorage key.**
   Setting `bestScore` to a large number and reloading would be the easiest attack
   in the entire threat model, aimed at the most visible asset, and it would
   invert the whole design — the weakest entry point writing to the most public
   surface. `online-flywheel/12-migration-plan.md` §6.3 reached this conclusion
   first and it is even more clearly right here.

### 3.4 What the player is told

Once, the first time boards appear, in one line on the results screen:

> Your city records stay yours. The leaderboards start fresh — every score on
> them is one we re-ran ourselves.

And permanently, as the section heading on the profile: **YOUR HISTORY (this
device)** sitting directly above **ON THE BOARDS (verified)**. Two headings next
to each other is the cheapest possible way to teach the distinction, and it is
cheaper than any amount of explanation.

`online-flywheel` justified this decision partly on the grounds that the campaign
was "100 levels of replayable content, so a returning player can re-post any of
their bests in a minute." **That justification is gone** — the campaign is
retired. The replacement is better: a 90-second run is the most re-postable thing
this game has ever had. A player with forty Chicago clears behind them is the
best-equipped person in the room to fill a fresh board fast, and the fresh board
takes ninety seconds to enter. It is a head start, not a penalty, and the copy
should carry that tone rather than an apologetic one.

---

## 4. The database migration

One Supabase migration, forward-only, additive, creating the eight tables and two
views in [03](03-technical-design.md) §3 plus their RLS policies and the
`fw_rank_points` function.

There is **nothing to backfill** — no existing rows, no existing users, no
existing scores. That is a genuine luxury and it will not be available again: this
is the cheapest moment the "no historical scores on the board" decision will ever
be available, because there is no incumbent history to protect. Making it now
costs nothing; making it in six months costs somebody their #1.

**Rollback:** dropping the tables loses only board data, and the game is
unaffected because of invariant 9. There is no destructive operation, no lock
hazard on an existing table, and no column removal. Run it past the
migration-safety review anyway — the RLS policies are the part worth a second pair
of eyes, not the DDL.

---

## 5. Order of operations

Deliberately not "all at once", and the first item is deliberately alone.

1. **The save migration, in a commit with nothing else in it.** `CURRENT_VERSION`,
   `MIGRATIONS[16]`, `defaultPlayer()`, `freshSave()`, and the extended validator
   key-set guard. This is the change most likely to strand a player on a dead
   screen and it should be reviewable in one screenful.
2. **The determinism work** ([04](04-anti-cheat.md) §3A.3, T-102) — `js/fwmath.js`
   and the ten `Math.*` call sites. This changes the trajectory, so it re-runs the
   validator's gates and possibly retunes them. **It must land before any trace is
   ever stored**, because every trace recorded before it becomes unreplayable
   after it.
3. **The trace codec and recording**, still with no network. Recording ships
   *before* verification so that real human traces exist to measure (T-903) and to
   build fixtures from.
4. **The database migration and the verifier**, with boards not yet shown.
5. **Names, boards and the UI.**
6. **Moderation, before the boards are public** — not after.

Steps 2 and 3 are the ones with an ordering constraint that is easy to get wrong
and expensive to discover late. Everything else can move.

## 6. Delivery reconciliation

The implementation deliberately kept the plan's ordering constraint inside one
reviewable release: deterministic math and the trace codec landed before a
network path could persist a trace; the schema and verifier landed before the
title screen exposes RECORDS; moderation and deletion endpoints are present
before public records are shown. Existing `save.sandbox` rows are retained
unchanged and appear only under **YOUR HISTORY (THIS DEVICE)**.
