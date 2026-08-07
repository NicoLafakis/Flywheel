# Online Flywheel — Migration Plan

> [Objective overview](00-objective-overview.md) ·
> [Technical design](03-technical-design.md) ·
> [Identity & accounts](05-identity-and-accounts.md) ·
> [Threat model](09-threat-model.md) ·
> [Rollout & runbook](08-rollout-and-runbook.md)

Every existing Flywheel player has one thing: a `hole-city-save` entry in one
browser's localStorage, at schema v13. That entry is currently the *entire*
universe of their progress — there is nowhere else it exists, no way to move it,
and no way to get it back if it goes. This plan is about that object stopping
being the only copy without ever stopping being *a* copy.

The governing position, locked in the brief and repeated here because every
decision below follows from it:

> **localStorage v13 stays the offline source of truth. The cloud syncs on top.
> Guest progress merges into an account on first sign-in.**

Flywheel must still be a complete game with the network unplugged. It is a
static site with no backend today and it stays playable as one — at a
conference, on venue wifi, that is not a philosophical position, it is the
fallback plan.

---

## 1. What changes in the save, and what does not

### 1.1 The bump: v13 → v14

One schema bump, adding **one** top-level key. Per `AGENTS.md` invariant 6 and
`.wiki/conventions.md` hard rule 6, that means all three of: bump
`CURRENT_VERSION`, add a `MIGRATIONS[13]` entry, and add the same key to
`freshSave()`. Quarantine, never delete.

New top-level key, `cloud`:

```
cloud: {
  userId:      null,   // Supabase auth uid once claimed; null while a pure guest
  claimedAt:   null,   // ISO timestamp of first successful merge
  lastSyncAt:  null,   // ISO timestamp of the last successful pull/push
  lastPushHash: null,  // content hash of the last state we pushed; skip no-op pushes
  pendingRuns: [],     // score submissions recorded offline, awaiting upload
  coinsEarned: 0,      // ledger half — see §3.3
  coinsSpent:  0,      // ledger half — see §3.3
}
```

`MIGRATIONS[13]` is `(s) => ({ ...s, version: 14, cloud: { ...defaultCloud(), ...(s.cloud || {}) } })`,
in the same shape as the settings merges already in the chain — the spread over
a defaults function is what makes the *next* bump cheap, because adding a field
to `defaultCloud()` then reaches both a fresh save and an upgrading one through
the same line.

**Nothing else changes.** `coins`, `levels`, `sandbox`, `ownedItems`,
`equippedSkin`, `muted` and every `settings` key keep their exact current shape
and meaning. That is deliberate: a migration that both restructures existing
data *and* introduces a new subsystem gives you two failure modes that look
identical when a player reports "my stars are gone".

### 1.2 Why a nested object rather than flat keys

Flat keys (`cloudUserId`, `cloudLastSync`, …) would each need their own bump
later. A single container with an internal defaults function means the *save
schema* stops churning while the online subsystem is still being built, and the
online subsystem is exactly the part we expect to change weekly up to the event.
Cost: the validator's parity guard does not currently look inside nested
objects, which is why §1.5 extends it.

### 1.3 What must never enter the save

Hard rules, because localStorage is readable by any script on the origin and
because the next player at a booth kiosk can read it (§4):

- **No auth tokens.** The Supabase client owns its own session storage key; the
  game save must not copy, cache, or mirror it.
- **No PII.** No email, no first/last name, no company. The display handle *may*
  be cached for offline rendering of the player's own HUD; nothing else.
- **No scores the server has validated.** Cached leaderboard rows for offline
  display are fine in a separate, disposable cache key — not in the save. The
  save is the thing we promise never to lose; a cached board is the thing we
  throw away without a second thought. Mixing them means the disposable thing
  inherits the sacred thing's migration burden.

### 1.4 The drift trap, stated for whoever writes the migration

`js/save.js` carries a long comment about `sandbox`, and it is not decoration.
Migration 10 added `sandbox`; `freshSave()` never did; migrations run only for
saves *older* than `CURRENT_VERSION`, so every player born at v11+ — every
**new** player, never an upgrading one — had no `sandbox` object, and
`recordSandboxResult` threw on the first sandbox completion and stranded them on
a screen whose buttons then did nothing.

The failure mode is structural, not careless: whoever adds the key adds it to
the migration, tests by reloading their own older save, sees it work, and ships.
The path they never ran is the one every new player takes.

`cloud` is the same shape of key as `sandbox` was: a container that later code
will index into without checking. If `cloud` is added to `MIGRATIONS[13]` and
not to `freshSave()`, then **every player who installs after this ships** — i.e.
everyone at UNBOUND, the entire audience this feature exists for — signs in and
hits a throw on `save.cloud.userId`. This is not a hypothetical repetition of an
old bug; it is the same bug with a worse blast radius.

Two consequences:

1. `freshSave()` gets `cloud: defaultCloud()` in the same commit as the
   migration. The validator enforces this today at the top level, so getting it
   wrong fails `node tools/validate.mjs` rather than a booth.
2. Every reader of `cloud` re-establishes its own container the way
   `recordLevelResult` and `recordSandboxResult` do (`if (!save.cloud)
   save.cloud = defaultCloud();`). The existing comment in `save.js` calls this
   the seatbelt for a save that arrived down a path neither `freshSave()` nor
   the validator covers — a hand-edited entry, a partial write, a future
   migration bug. A booth kiosk plus curious partners with devtools open makes
   hand-edited entries a *likely* input, not an exotic one.

### 1.5 What must be added to `tools/validate.mjs`

`validateSaveSchema()` today walks v1 → `CURRENT_VERSION`, and checks (a) no
migration adds a top-level or `settings` key that `freshSave()` /
`defaultSettings()` lacks, and (b) at the end of the chain the two key sets are
*exactly equal* at the top level and inside `settings`, plus the chain's own
integrity (every version below current has a migration returning exactly the
next version). That covers `cloud` **as a key**. It does not cover `cloud`'s
*contents*, which is precisely where the next instance of this bug will live.

Add:

1. **Nested parity for `cloud`.** A third key-set comparison, exactly parallel to
   the `settings` one, over `cloud`. Ideally generalise: keep a list of
   "container keys whose inner key sets must match" (`settings`, `cloud`) and
   loop, so the fourth container someone adds is one array entry rather than a
   copy-pasted block. The failure message should keep the current tone —
   name the migration, name the key, say what it means for which player.
2. **A no-secrets assertion on the save shape.** Walk the fresh save and the
   end-of-chain save and fail on any key matching `/token|jwt|email|password|
   secret|apikey|access|refresh/i`. Cheap, mechanical, and it is the guard that
   stops a well-meaning "just cache the session here" commit. Pair it with the
   service-role-key grep from
   [09-threat-model.md §5.4](09-threat-model.md#54-the-service-role-key) — same
   spirit, same file, same one-line failure.
3. **A merge-function test.** The guest→account merge (§3) is pure, takes two
   save-shaped objects, and returns one. It is therefore exactly the kind of
   thing this repo's validator already tests: import it, run it over fixtures
   (empty ⊕ full, full ⊕ empty, divergent ⊕ divergent), and assert the
   properties the design depends on — **idempotent** (`m(m(a,b),b) = m(a,b)`),
   **commutative** on every synced field, and **monotonic** (no field decreases).
   Those three properties are what makes §5's multi-device story work; an
   assertion is the only thing that keeps them true after the fourth field is
   added.
4. **A quarantine round-trip check.** Feed `loadSave`-shaped inputs — a v99
   save, a truncated JSON string, a `{}` — through the load path and assert the
   quarantine key is written and a fresh save is returned. This exists today as
   code with no test, and §7 makes the quarantine path load-bearing for
   rollback, so it stops being acceptable to leave it unproven.
5. **Keep it in the `ALL PASS` line.** The existing schema check prints a
   one-line summary; extend it rather than adding a second reporting style. The
   validator is the test suite (`AGENTS.md`), and its output is read at a
   glance.

None of this needs a test runner. It is the same `fail()`-and-count pattern the
file already uses for 100 levels and four voxel scenes.

---

## 2. The sync model in one paragraph

The client is offline-first and the cloud is a merge target, not a master.
On boot: load local (v14), and if `cloud.userId` is set, pull the cloud profile
and merge it into local using the rules in §3; local is what the game reads,
always. On every result: write local first (the existing `recordLevelResult` /
`recordSandboxResult` path is unchanged), then enqueue a push. If the push
fails — venue wifi will make this common — it stays in `cloud.pendingRuns` and
retries. Nothing in the game loop ever waits on the network. **A failed sync is
never allowed to produce a visible failure state**; the player at a booth must
not see a spinner, and must never see "could not save".

Because every synced field merges monotonically (§3), the order in which pushes
land does not matter and a retried push is harmless. That is the property that
makes the offline queue safe, and it is why §1.5 asks the validator to assert it.

---

## 3. Guest → account merge

### 3.1 The scenario that must work

A player has been playing for weeks. 60 levels beaten, stars, best combos,
several skins bought, a pile of coins. They have never signed in. Today they
sign in for the first time. **Nothing may be lost, and nothing may be
double-counted.** If signing in can cost a player 60 levels, the correct product
behaviour is to never offer sign-in — so this section is the price of the
feature existing.

### 3.2 Two distinct cases, and they are not the same

**Case A — the claim (cloud profile is brand new).** The account has no
progress. The local save is adopted wholesale: it becomes the initial cloud
state. No conflict is possible. This is the overwhelmingly common case at
UNBOUND and it should be instant and silent — no dialog, no "we found local
progress, keep it?" question. Of course we keep it.

**Case B — the reunion (cloud profile already has progress).** The account has
played elsewhere. Both sides have real history and it must be merged field by
field, per §3.3, and the result pushed back. This is the laptop-and-phone case
(§5) and, critically, it is also the **kiosk** case (§4) — which is why case B
can never be silent.

### 3.3 Field-by-field merge rules

| Field | Rule | Why |
|---|---|---|
| `levels[i].stars` | `max` | Monotonic best. Commutative, idempotent. |
| `levels[i].bestMass` | `max` | Same. |
| `levels[i].bestCombo` | `max` | Same. |
| `levels[i].won` | logical OR | Once beaten, always beaten. |
| `levels` key set | union | A level record present on one side appears in the result. |
| `sandbox[s].completions` | **`max`, not sum** | Sum is not idempotent: a retried merge inflates it forever. `max` under-counts a player who genuinely played on two devices, and that is the correct trade — a wrong-but-stable count beats a number that grows every time the network hiccups. |
| `sandbox[s].bestSize` | `max` | Monotonic best. |
| `sandbox[s].bestTime` | `min`, nulls lose | Lower is better; `null` means never completed. |
| `ownedItems` | union | Never take something a player owns. |
| `equippedSkin` | last-write-wins by `lastSyncAt` | Pure preference, no value at stake. Ties go to local — the device in the player's hand is the one they just made a choice on. |
| `coins` | **ledger, see below** | The only field where naive merging is exploitable. |
| `muted`, all of `settings` | **not synced at all** | Device-local by nature. `quality`, `perfMode`, `invertX/Y`, `camDist`, `turnSens`, `pointMove` describe *this machine and these hands*, not this player. Syncing them means a phone's `quality: 'low'` lands on a desktop, or the booth PC inherits a stranger's inverted-Y. Leaving settings out of the cloud entirely is both simpler and better behaved, and it shrinks the merge surface to the fields that actually represent achievement. |
| `version` | always `CURRENT_VERSION` after merge | The merge output is written through `storeSave`, which stamps it. |
| `cloud.*` | recomputed, never merged | Bookkeeping about the sync itself, not player data. |

**Coins.** `max` lets a player buy an item on device A, sync, then re-merge an
older snapshot and get the coins back with the item. `sum` double-counts every
re-merge. So coins become **derived from a two-sided monotonic ledger**:

```
coinsEarned  = max(local.cloud.coinsEarned,  cloud.coinsEarned)
coinsSpent   = max(local.cloud.coinsSpent,   cloud.coinsSpent)
coins        = coinsEarned - coinsSpent
```

Both halves are monotonic, so the merge stays commutative and idempotent, and
the balance is a derived value rather than a merged one. A v13 save has neither
half, so the v13→v14 migration **seeds them from what is knowable**:
`coinsSpent = sum(price of ownedItems)` and `coinsEarned = coins + coinsSpent`.
That reconstruction is exact for any player who only ever earned and spent
in-game, which is every honest player.

A dishonest player who hand-edited `coins` in localStorage before signing in
carries that number up. This is accepted: coins are a cosmetic-shop currency, the
shop sells skins, and nothing on any leaderboard is purchasable. Spending build
time defending a currency with no competitive effect would be defending the
wrong asset — see [09-threat-model.md §1](09-threat-model.md#1-assets-and-trust-boundaries)
for what actually needs defending.

### 3.4 Conflict resolution has a shape, not a policy

Notice that every rule above is `max`, `min`, `union`, or `OR` — a
join-semilattice. There is no timestamp arbitration, no "server wins", no
last-writer-wins except on one cosmetic preference. That is a deliberate design
choice and it is the single most valuable thing in this document: **conflicts
cannot occur, because merge is order-independent and repeat-safe.** Two devices
that have never seen each other converge on the same state regardless of who
syncs first, how many times, or in what order. Offline queues, retries,
duplicate pushes, and the kiosk's aggressive resets all become non-events.

The price is that data which is genuinely *not* monotonic cannot live in the
synced set. Today only `equippedSkin` and settings are non-monotonic, and both
are handled by exclusion. **Any future synced field must be monotonic or must
justify itself against this section.** The validator property test in §1.5 item 3
is what holds this line after everyone has forgotten it was a line.

---

## 4. The shared booth kiosk

This is the highest-severity item in this document and it is not a merge
problem, it is a **data-leak and identity problem**.

### 4.1 What goes wrong

Partner A plays at the booth, signs in with Google, sets a great score, walks
away. Partner B sits down. On that machine there is now: (a) a localStorage save
containing A's full progress, and (b) **a live Supabase session for A**. In the
naive implementation:

- B plays and their score is submitted as A;
- B can see A's account screen, and depending on what that screen shows, A's
  email and name;
- if B signs in with their own account, the "guest → account merge" fires and
  **A's 60 levels are pushed into B's cloud profile**, permanently, with no
  signal to either of them;
- B's own device history is now polluted, and A's is fine but B's board entry is
  built on A's play.

Every part of that is bad, and the last one is a leak in both directions:
progress flows A→B and, on the next sign-in, A's identity is what B's score was
attributed to.

### 4.2 The fixes, all of which are required together

1. **A real kiosk mode, not an assumption.** A booth machine boots the game with
   an explicit kiosk marker (a URL flag captured into `sessionStorage` at boot,
   so it survives navigation and dies with the browser). Kiosk mode is a
   *declared* state; the game never guesses it from screen size or user agent.
2. **In kiosk mode, sign-out is the end of the session and the session has a
   defined end.** An always-visible **"I'm done"** button, plus an idle timeout
   on any non-gameplay screen (~60 s), plus an automatic end after the results
   screen. Ending a session performs, in this order: push any pending runs,
   `supabase.auth.signOut()` (which clears the Supabase session key), remove
   `hole-city-save`, remove the quarantine key, remove any cached board data,
   and hard-reload to the attract screen. The next person gets a machine with
   nothing on it.
3. **In kiosk mode the local save is not durable.** Writes go to a session-scoped
   shim rather than `localStorage`, so even a crashed browser or a skipped
   sign-out cannot leave one player's progress for the next. The save module's
   storage target becomes injectable — this is a small change and it is the
   structural version of fix 2, which is a behavioural one. Behavioural fixes
   fail when someone walks away mid-round; structural ones do not.
4. **Case B merge is never silent — anywhere, kiosk or not.** When a player signs
   in and *both* sides have progress, the game asks, in plain language, before
   merging: *"There's already progress saved on this device — 60 levels, 3
   skins. Is that yours?"* with **"Yes, add it to my account"** and **"No, that's
   someone else's — start fresh"**, and the safe option is the visually
   secondary but *pre-selected-safe* one: refusing costs nothing, accepting
   wrongly is irreversible. This is the actual fix; kiosk mode makes the
   question rare, and this makes the rare case survivable. Note it inverts the
   usual dialog instinct — we are not confirming a destructive action, we are
   confirming an *acquisitive* one, because acquiring someone else's history is
   the destructive outcome here.
5. **Attribution is never inherited.** A score submission carries the JWT of the
   session that produced it, established **at round start**. If the session
   changes mid-round, the round is discarded, not re-attributed.
6. **Sign-out purges, always, everywhere.** Not just in kiosk mode. Signing out
   clears the local save after a final push. The cloud copy is the backup, and
   signing back in restores it — which is exactly why the cloud copy is worth
   having.
7. **A visible "who is playing" chip** on every screen once signed in. Cheap,
   and it is the thing that lets Partner B notice they are about to play as
   Partner A. Most kiosk leaks are noticed by the *next honest person* if you
   give them anything to notice.

### 4.3 The pure-guest booth path

The best kiosk experience for most attendees is: play immediately as a guest,
and only sign in at the results screen if the score is worth putting on the
board. That keeps sign-in tied to a *reason*, keeps the queue moving, and means
a player who never signs in leaves nothing behind but a session-scoped save that
dies with fix 3. Guest-first is already the locked identity decision; the kiosk
is where it earns its keep.

---

## 5. Multi-device

Same account, laptop and phone, both with local saves that have diverged since
the last sync.

Because §3.3's merge is a join-semilattice, this needs no special machinery:
each device pulls, merges, plays, pushes. Order does not matter. Two devices
that were offline for a week and both pushed produce the same converged state
whichever lands first, and a device that pushes twice changes nothing the second
time (`cloud.lastPushHash` skips it entirely).

Specifics worth pinning:

- **Merge on pull, not on push.** The client merges cloud into local, then pushes
  the merged result. The server-side write is a *whole-profile upsert guarded by
  the same monotonic rules in SQL*, so a client that pushes a regressed value
  (stale, buggy, or hostile) cannot lower a stored best. **Client-side merge is
  for correctness; server-side monotonicity is for trust** — never rely on the
  client to have merged honestly.
- **Settings are not synced** (§3.3), so the phone keeps `quality: 'low'` and the
  laptop keeps `'auto'`, which is the behaviour a player actually wants and
  never has to think about.
- **`pendingRuns` are per-device** and never merged. They are an outbox, not
  state. Uploading a run twice is already a no-op server-side by trace hash
  ([09-threat-model.md §3.2](09-threat-model.md#32-replayed--duplicated-trace)),
  so the outbox can be crash-simple: retry forever, never dedupe locally, cap
  the queue length and drop oldest.
- **Clock skew is irrelevant** because nothing arbitrates by client timestamp
  except `equippedSkin`, where the worst outcome is wearing the wrong hat.
- **Simultaneous play on two devices** converges on bests and produces one
  slightly odd coin balance if both spent at once. Bounded, cosmetic, ignored.

---

## 6. Retroactive seeding of leaderboards and achievements

### 6.1 The problem

An existing player's `levels[i].bestMass` and `sandbox[s].bestSize` are real
achievements they really earned. They also have **no input trace**, because no
build has ever recorded one. Under
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) a score reaches
the board only by being recomputed from a replay. These numbers cannot be
recomputed from anything.

### 6.2 Decision

**Historical local bests are EXCLUDED from all four ranked leaderboard scopes.**
They are imported, kept, and displayed as the player's **personal history** —
"your best" on the level select, in the profile, and in the campaign progress
UI — and they seed **progress-shaped achievements only** (levels beaten, cities
eaten, total play). They never seed a **belt**, never appear in UNBOUND / per
city / per level / all-time, and are never mixed into a ranked view.

### 6.3 Why not "admitted but flagged"

Flagging is the tempting middle and it is wrong here for three reasons, in
increasing order of severity:

1. **The board is projected at a partner conference.** Any distinction subtler
   than absence — an asterisk, a paler row, a legend — is invisible on a screen
   across a booth and meaningless to someone glancing at it while walking past.
   The audience reads "who is #1", not the footnote.
2. **It is a ten-second attack for the most likely adversary we have.** Adversary
   A in [09-threat-model.md §2](09-threat-model.md#2-adversaries) is a bored
   partner with devtools open. `hole-city-save` is a plaintext JSON blob at a
   guessable key. Setting `bestMass` to a large number and signing in is easier
   than any other attack in the entire threat model — easier than forging a POST,
   incomparably easier than crafting a valid trace. Admitting unvalidated
   local numbers to the board would mean the *single weakest* entry point is the
   one that writes to the *most visible* asset. That inverts the whole design.
3. **It breaks the one sentence the model rests on.** ADR-0012's value is that
   "every number on this board was recomputed by us" is true without
   qualification. A flagged tier makes it "every number except those ones", and
   a rule with an exception is a rule that gets argued about at the moment it
   matters. The board is small, new, and has no incumbent history worth
   protecting — this is the cheapest moment this decision will ever be available.

### 6.4 What existing players are told, and what they get instead

Bluntly and early, in the sign-in flow: *"Your progress comes with you. Scores on
the leaderboards start fresh — every ranked score is verified by replaying your
run, and your old runs happened before that existed."* Framed as verification
rather than as loss, which is also the truth.

And then make it costless: the campaign is 100 levels of *replayable* content,
so a returning player can re-post any of their bests in a minute by playing the
level again — this time with a trace. A player with 60 levels of history is the
best-equipped person in the room to fill a fresh board fast. That reframes the
exclusion from a penalty into a head start, and it is the reason this decision
is affordable.

**Achievements** are handled the other way round on purpose: retroactive unlocks
are *generous*, because an achievement is a statement about a player's own
history and nothing is ranked on it. Beat 60 levels before this shipped? The
badges appear at first sign-in, all at once, which is a good moment rather than a
grind. The only exceptions are achievements defined in terms of a *ranked
position* ("held a belt"), which by construction cannot be retroactive.

---

## 7. Forward and backward compatibility

A static site behind a CDN, played on conference wifi, on other people's
laptops, means **stale clients are guaranteed**. Someone will be holding a cached
`index.html` from three weeks ago while the backend has moved.

### 7.1 Client older than backend

- **Every submission carries `client_version`,** and the Edge Function keeps an
  explicit allow-list of validatable versions
  ([09-threat-model.md §3.4](09-threat-model.md#34-modified-client-sim)). A run
  from an allow-listed old version is replayed against *that version's* sim and
  is perfectly valid. A run from an unknown version is **rejected, not
  trusted** — and rejected with a message the client can show as "update to
  submit this score", not as a generic failure.
- **`feature_flags.min_client_version`,** fetched at boot. Below it, online
  features switch off and the game says so once, plainly, with a reload button.
  **Local play never switches off.** A stale client degrades to exactly the
  product Flywheel is today, which is a complete game.
- **Cache headers do the real work.** `index.html` and the JS modules must be
  served `no-cache` (revalidate every load) with the CDN doing the caching by
  ETag; the importmap pins exact three.js versions
  ([09-threat-model.md §7.1](09-threat-model.md#71-common-to-all-paths)). With no
  build step there are no content-hashed filenames to lean on, so revalidation
  is the mechanism. Verify this against the deployed URL before the event —
  "did the fix actually reach the booth laptop" is a question local testing
  cannot answer.
- **Additive-only wire changes.** New fields in server responses must be ignorable
  by an old client. No renames, no type changes, no removals inside the event
  window. If a breaking change is unavoidable, it is a new endpoint, not a
  changed one.

### 7.2 Backend older than client, and the save from the future

A player who used a new build on their phone and then loads a cached older build
on a laptop hands a **v14 save to a v13 client**. `loadSave` sees
`data.version > CURRENT_VERSION`, quarantines the raw string, and returns a
fresh save. To the player, that is "all my progress is gone".

That path already exists and is already correct in isolation — the data is
preserved under the quarantine key, not deleted, exactly as invariant 6 demands.
Two things change now:

1. **The cloud makes quarantine recoverable for the first time.** A signed-in
   player who trips the future-save path can be restored from their cloud
   profile on the next successful pull. The stranding is a bad ten seconds
   instead of a permanent loss. This is, quietly, one of the strongest arguments
   for the whole feature.
2. **A guest who trips it is still stranded**, and always was. Mitigation: when
   `loadSave` quarantines a *future-versioned* save (as distinct from corrupt
   data), the UI should say so — "this device has newer progress that this
   version of the game can't read; reload to update" — rather than silently
   presenting an empty game. One string and one flag on the load result. Cheap,
   and it converts a terrifying symptom into an instruction.

### 7.3 The rule that follows

**`CURRENT_VERSION` only ever goes up, and a released version number is never
reused for a different shape.** A save shape that shipped to one real player is
permanent. This is the same append-only discipline the ADRs run on, applied to
data.

---

## 8. Rollback

Backing the whole feature out and returning to pure-local play, without losing
anyone's progress.

### 8.1 The trap: do not roll back the client

The instinct — `git revert` the online work and redeploy — is the one action
that *causes* data loss. A reverted client is a v13 client. Every v14 save it
meets is "from a newer build", so it quarantines and shows an empty game. **A
code rollback wipes the visible progress of every player who had already played
the new build.** That is a worse outcome than every failure mode it would be
trying to fix.

### 8.2 The rollback that is actually safe, in order of escalation

**Level 1 — flag off (seconds, no deploy).** `feature_flags` disables online:
no sign-in, no arena, no submissions, no board. The client falls back to local
play, which is the whole game. This is the booth-hours lever and it is the only
one anyone should touch during the event. Sync code still runs to *drain*
`pendingRuns` if the backend is healthy; if it is not, the queue just sits there
harmlessly.

**Level 2 — read-only backend (minutes).** Keep the board visible, stop
accepting writes. Right response to a validation bug, a moderation incident, or
a quota emergency: the screen keeps working, nothing new lands, nothing is lost.

**Level 3 — permanent retirement of the online feature (deliberate, later).**
Ship a client that **keeps `CURRENT_VERSION = 14`, keeps `MIGRATIONS[13]`, keeps
`cloud` in `freshSave()`, and simply contains no online code.** The `cloud` key
becomes vestigial and inert. Nobody's save is from the future, nobody is
quarantined, nobody notices. Invariant 6 says never delete; this is what "never
delete" buys you — the ability to remove a feature without removing a field.
Removing the key would require a v15 migration that drops it and would break any
client still running v14 in a cache, which is the §7.2 problem again by another
route.

**Before level 3, give players their data.** A one-click JSON export of the
cloud profile, plus the existing local save as the offline copy. The export also
satisfies the GDPR access obligation
([09-threat-model.md §6.4](09-threat-model.md#64-gdpr-shaped-obligations)), so it
is one build serving two requirements — which is the reason it is worth building
before it is urgent.

### 8.3 Data disposition on retirement

Retiring the feature does not license keeping the data. The retention schedule
in [09-threat-model.md §6.5](09-threat-model.md#65-retention-after-the-conference)
still runs: traces expire, unconsented PII is purged, leaderboard rows are
either frozen as an archive or anonymised. **A retired feature with a live PII
table is the worst of both worlds** — all of the liability, none of the product.

### 8.4 Rollback rehearsal

Level 1 gets rehearsed before the doors open, on the actual booth machines, on
the actual venue wifi, alongside the moderation drill in
[09-threat-model.md §6.1](09-threat-model.md#61-the-big-screen-problem). A kill
switch nobody has pulled is a hypothesis. The person standing at the booth needs
to have pulled it once, with their own hands, and watched the game keep working.

---

## 9. Order of operations

The sequencing that keeps every intermediate state shippable — each step is a
state we could stop at without breaking a player:

1. **v13 → v14 migration + `freshSave()` + `defaultCloud()`,** with the extended
   validator guards from §1.5. Ships alone, changes nothing a player can see.
   Do this first and separately: it is the step where the historical bug lives,
   and it deserves a commit with nothing else in it.
2. **Coin-ledger seeding** in the same migration (§3.3), also invisible.
3. **The merge function, pure and tested** (§1.5 item 3), with no caller yet.
4. **Guest-first sign-in and the claim path (case A)** — the common case, and
   the whole of it at UNBOUND for a new attendee.
5. **The reunion path (case B) with the merge dialog** (§4.2 fix 4).
6. **Kiosk mode** (§4.2 fixes 1–3, 6, 7). Before any booth rehearsal, not after.
7. **Trace recording and submission**, then the replay validator, then the
   boards. Recording traces can and should ship *before* validation exists —
   traces recorded early are traces available for testing the validator against
   real human play, which is the only honest source of tuning data for the
   plausibility heuristics in
   [09-threat-model.md §3.3](09-threat-model.md#33-hand-crafted-input-trace-that-beats-the-replay).
8. **Retroactive achievement seeding** (§6.4), once achievements exist.
9. **Arena**, last, because it is the only part that is not required for a
   leaderboard to work and the only part whose failure at a booth is visible to
   a crowd rather than to one player.

---

## Related

- `js/save.js` — the schema, the chain, and the `sandbox` drift comment that
  this plan is largely an elaboration of.
- `tools/validate.mjs` — `validateSaveSchema()`, the guard this plan extends.
- `.wiki/conventions.md` hard rule 6, `AGENTS.md` invariant 6.
- [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) — the reason
  §6 excludes historical bests.
- [09-threat-model.md](09-threat-model.md) — the kiosk leak, retention, and the
  score-integrity model this plan defers to.
