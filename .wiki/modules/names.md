---
covers:
  - "js/board/names.js"
  - "api/data/parks-names.json"
  - "tools/names.test.mjs"
---
# Automatic player names

## Purpose

Nobody is anonymous. Before this module a player had no name until they manually
created an account, and a run with no name is never published to a board — so
the entire guest population was invisible on every leaderboard. This module hands
each arriving player a Parks-and-Recreation joke name (`Meat Tornado`,
`Duke Silver`, `Lil Sebbie`) immediately, with no signup and no typing.

It is a pure module: no DOM, no three.js, no sim imports. It is the client half
of the pairing; the server reads the same word lists from
`api/data/parks-names.json`.

## Files

| File | Role |
| --- | --- |
| `js/board/names.js` | The generator, and the word lists as a JS literal (browser source of truth). |
| `api/data/parks-names.json` | The same lists as data, for the server. |
| `tools/names.test.mjs` | Exhaustive gate; runs inside `validateMultiplayer()`. |

## Why the lists are duplicated

`api/data/parks-names.json` is the shared data file both halves are specified
against, but the browser does **not** read it. This repo has no build step: a
client-side JSON module import requires `with { type: 'json' }`, which cannot be
assumed across the browsers the game targets, and a `fetch()` would make name
generation asynchronous and network-dependent for something that must work fully
offline (invariant 10). So the browser reads a plain JS literal any parser
accepts, and `tools/names.test.mjs` asserts the JSON file is deep-equal to it.
The two cannot drift silently.

If you edit one, regenerate the other and re-run the suite.

## Filter the pairs, not the vocabulary

`normaliseName()` in `api/_lib.mjs` caps a name at 16 characters. The obvious
reading of that — cap the words so that *every possible* pair fits — is stricter
than the requirement and expensive: it forces `Sebastian` (9) down to a stub
purely so it will not collide with `Eagleton` (8), a pairing nothing ever needed
to emit. The requirement is only that every name the generator **emits** is
valid.

So the cross product is filtered once at module load into `VALID_PAIRS`, and
`generateName()` draws uniformly from that set:

* 44 modifiers x 48 subjects = 2,112 raw pairings;
* 42 excluded as over-length;
* **2,070** emittable names, longest `Waffle Sebastian` at exactly 16.

Two consequences worth knowing. An over-length name is unreachable by
construction rather than by a check at the call site, and there is no
rejection-retry loop — a name costs one draw, always, which matters on the boot
path of every session. The trade is that the draw is uniform over *pairs*, not
over *words*: a short modifier appears slightly more often because it has more
partners. That bias is the right way round — it favours names that fit.

The test pins the filter from **both** directions: it must exclude something (or
it has become a no-op that lets an over-length name through) and it must exclude
*only* over-length pairs (or it is quietly gutting variety). It also rebuilds the
expected set independently and compares exactly.

`Li'l Sebastian` still ships as `Lil Sebastian`: the apostrophe is outside the
server's character class (`^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$`).

## Tone

Two registers, deliberately mixed. Show references (`Knope`, `Ludgate`,
`Snakehole`, `Macklin`, `Wamapoke`, `Gergich`) are the joke for anyone who has
seen the show; texture/attitude modifiers (`Feisty`, `Smug`, `Grumpy`, `Burly`,
`Sweaty`) crossed with absurd concrete nouns (`Gizzard`, `Possum`, `Meatloaf`,
`Dumpster`, `Trombone`) are what make a result land for someone who has not.

Bland filler is not welcome in either list — a merely inoffensive name is a
wasted draw. The words the product owner cut for blandness (`Golden`, `Harvest`,
`Muffin`, `Sprinkle`, `Bandit`, `Buffet`, `Pyramid`, `Champ`, `Legend`, `Genius`,
`Beret`, `Steak`, `Yogurt`, `Combo`) are pinned as a negative assertion in the
suite, because taste is the one thing no other gate will catch if someone
re-adds them.

`Wizard` and `Bagel` are the two exceptions, and the reason is worth recording
so nobody re-cuts them on sight: both appear in the tone sample the owner
*selected* (`Chunky Wizard`, `Rowdy Bagel`), so they are signed off by name even
though they read like filler out of context.

Fourteen signed-off names (`Lil Sebastian`, `Janet Snakehole`, `Bert Macklin`,
`Tammy Two`, `Mouse Rat`, `Chunky Wizard`, `Rowdy Bagel`, ...) are pinned by
literal, so a future word-list edit that shortens `Sebastian` or drops
`Snakehole` fails loudly rather than degrading the joke unnoticed.

## Collisions

Names are de-duplicated by a leet-folded key (`0->o 1->i 3->e 4->a 5->s`, then
non-alphanumerics stripped), so `Sn4ke Juice` and `Snake Juice` are one name.
`withDiscriminator(base, n)` appends a numeric tag up to `MAX_DISCRIMINATOR`
(9999), trimming the base from the right so the total still fits, and stripping
any trailing separator the cut exposes (`Waffle Sebastian` + 9999 ->
`Waffle Sebas9999`). `nameCandidates(randomFn, count)` returns a retry ladder
whose first rung is the clean, undecorated name — digits only ever appear after a
real collision — so the claim path can resolve a taken name in one round trip.

## Randomness

`generateName(randomFn)` takes an injectable random source returning a float in
`[0, 1)`.

* The browser default is `cryptoRandom()`, built on `crypto.getRandomValues`,
  matching `deviceKey()` in `js/board/player.js`.
* The server injects `node:crypto` randomness.
* **Not** `rng.js`. That is the seeded world generator, and a player's name must
  not be derivable from a world seed.
* **Not** `Math.random()`, which is banned in `js/` (invariant 2).

A hostile or broken random source (values of `1`, negatives, `NaN`) is clamped
rather than allowed to index off the end of a list; the suite asserts this.

## What the test guards

`tools/names.test.mjs` is registered in `validateMultiplayer()` in
`tools/validate.mjs`. It is exhaustive rather than sampled, because a 1-in-2000
bad name is a name a real player receives on their first run with no retry
surface in front of them. It asserts:

* every one of the 2,070 emittable names passes the real `normaliseName()`
  unchanged, is NFKC-stable, and fits the length and character rules;
* the filter is exactly right in both directions, and every word in both lists
  reaches the emittable set through at least one partner (a word too long to
  pair with anything is dead weight that inflates the list-size floors without
  adding a single name);
* the whole `generateName` index space is swept, so no random source can produce
  an over-length name or one outside the valid set;
* every word, and every emittable name, survives `blockedLocally()` — the
  offline half of the server's screen, **imported** from `api/_names.mjs` rather
  than reproduced, so there is no copy left to drift. Screening the words alone
  is **not** sufficient: the key strips spaces, so the seam where a modifier
  meets a subject can form a banned substring neither word contains;
* all three typed-name handlers (`name/claim`, `name/rename`, `auth/register`)
  still import that shared screen and have not grown a private `RESERVED` copy —
  a fourth copy is how one path quietly stops consulting the live
  `blocked_names` table, and it would also mean this suite is screening the
  generator against a rule one handler no longer applies;
* the discriminator path at the ceiling, and across the range for every base;
* determinism under a fixed random source, and variety across different ones;
* anti-vacuity floors on list sizes and the combination count, so a truncated
  list cannot pass.

The live `blocked_names` table cannot be consulted from a headless test, so the
suite covers `RESERVED` plus `api/data/blocked-names.json` — the parts that ship
in the repo. A word added to the database table is the server's job to reject.

## Server side

`api/_names.mjs` owns the server half: the shared name screen (`RESERVED`,
`blockedLocally`, `blockedName`), `randomUnit()` (a float from `node:crypto`,
mirroring `cryptoRandom()`), and `autoNameCandidates()`, which drives this
module's `nameCandidates()` ladder with server randomness to provision a guest
`players` row at ticket time. It imports `js/board/names.js` directly — the
module is import-safe under Node because it touches `globalThis.crypto` only
inside `cryptoRandom()`, which the server never calls.
