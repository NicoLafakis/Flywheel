# Online Flywheel — Test Strategy

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) ·
> [Netcode design](04-netcode-design.md) ·
> [Rollout & runbook](08-rollout-and-runbook.md) ·
> [Observability & NFR](10-observability-and-nfr.md)

**Date:** 2026-08-06 · **Status:** planning

---

## 0. How this doc references acceptance criteria

[02-requirements.md](02-requirements.md) owns the acceptance criteria. This doc
references them by ID using the scheme `AC-<AREA>-<n>`, with these areas:

| Area | Covers |
|---|---|
| `AC-OFF` | Offline / flags-off / degraded behaviour |
| `AC-ID` | Identity, sign-in, guest, claim, merge |
| `AC-ARENA` | Live shared arena, host authority, migration |
| `AC-BOARD` | The four leaderboard scopes |
| `AC-BELT` | Belts, reigns, achievements |
| `AC-SCORE` | Score submission and server-side validation |
| `AC-OPS` | Event-day operability |

Every row below **also states the criterion in words**, so that a renumber in
02 orphans nothing. If an ID here does not exist there, the doc is stale and
02 wins — fix this file, never the requirement.

---

## 1. Where testing stands today, honestly

This repo has **one** test surface: `node tools/validate.mjs`. It is not a
smoke test. It is 960 lines of contract probes that replay the whole game
headlessly — 100 campaign levels through a greedy bot with a 15% time-margin
floor, five voxel scenes through scripted excursions run twice for determinism,
a 19-probe shared scene contract, a `Math.random()` import guard globbed over
`js/voxelscene-*.js`, and a bidirectional save-schema parity check between
`freshSave()` and the `MIGRATIONS` chain. It prints `ALL PASS` or it exits 1.

Two properties of it matter enormously for this project and are worth naming
before anything is added:

1. **It runs the real code.** It imports `js/sim.js`, `js/voxelsim.js`, and the
   scene files directly. There is no test double anywhere in it. That is the
   only reason a server-side replay is cheap: the anti-cheat design in
   [03-technical-design.md](03-technical-design.md) is this harness pointed at
   production traffic.
2. **Its probes are derived, not hand-maintained.** `footprintTops()` computes
   the contract input from the finished scene rather than trusting a list. The
   file's own comments record what happens when that discipline slips — a
   weakened fork of the roadway probe let 46 kerb rims stand in asphalt for
   three passes. **Every new probe in this doc must be derived the same way, and
   no probe may ever be narrowed to make a new subsystem go green.**

What it cannot prove, and what this project adds: anything with a network,
anything with a second player, anything with a database, anything with a
browser. All four are new.

---

## 2. Extending `tools/validate.mjs`

The validator stays the single gate. `ALL PASS` must continue to mean "safe to
commit", and it must keep meaning that for the online layer too — otherwise the
online layer is the untested half of a repo whose whole quality story is that
one command.

Everything below is a **pure function test**. Nothing here touches a network, a
database, or a browser. That is the boundary that keeps the validator fast,
hermetic, and runnable on a plane.

### 2.1 Cloud/local schema parity — `validateCloudSchema()`

*Anchors:* `AC-ID-6` (a signed-in player's cloud profile and local save describe
the same progress), `AC-OFF-4` (cloud state absent leaves local save valid).

This is **the same bug class as hard rule 6**, one layer up. `freshSave()` and
`MIGRATIONS` drifted because they were two independent descriptions of one
object and only one of them got exercised during development. The cloud profile
will be a *third* independent description of that same object, and it will drift
for exactly the same reason: whoever adds a field adds it where they are
looking.

Assert, in both directions:

- Every key in the local→cloud projection map exists in `__freshSave()` (top
  level and inside `settings`). A projection naming a key the save does not have
  is a column that will always be null.
- Every key in `__freshSave()` is either in the projection map or in an explicit
  `LOCAL_ONLY` set with a one-line reason. **The explicit-exclusion list is the
  point** — a key silently absent from both is a field that never syncs and
  nobody notices until a player loses it. Forcing a written reason is what makes
  the omission a decision rather than an oversight.
- The merge function `mergeProgress(local, cloud)` is **total** over the key set:
  run it over a generated matrix of `{key present/absent} × {local newer/cloud
  newer/equal}` and assert the output key set equals `freshSave()`'s exactly.
- `mergeProgress` is **idempotent** — `merge(merge(a,b), b) === merge(a,b)` —
  and **monotone on the fields that must never regress** (coins, stars, unlocked
  skins, best scores). A merge that can lose a coin is a merge that will lose a
  coin at a booth.
- The cloud schema version constant and `CURRENT_VERSION` in `js/save.js` are
  related by a declared table, not by coincidence, and every local version below
  `CURRENT_VERSION` maps to a cloud version.

### 2.2 Replay determinism of the scoring function — `validateReplay()`

*Anchors:* `AC-SCORE-1` (a submitted run is re-scored server-side from seed +
input trace and the recomputed score is authoritative), `AC-SCORE-3` (a tampered
trace or score is rejected).

The scoring path must be a pure function `scoreRun({seed, scene, trace}) →
{score, metrics}` living in a file with no three.js and no DOM imports, so that
the Node validator, the browser, and the Supabase Edge Function all import the
*same file*. Assert:

- **Import purity.** Extend the existing source-grep guard: the scoring module
  and its transitive pure-sim imports must contain no `Math.random(`, no
  `import ... from 'three'`, no `document`/`window` reference, and no
  `@supabase/` import. Same shape as the `voxelscene-*.js` glob guard, same
  fail-hard-if-the-glob-is-empty clause.
- **Byte determinism.** Run the same trace twice; `score` and every metric must
  be identical to full precision (the existing excursion probes compare
  `mass.toFixed(6)` — hold the new one to the same bar).
- **Tick-indexed, not time-indexed.** This is the subtle one and it is a real
  hazard in this codebase. `js/quality.js` gives POTATO `maxSubSteps: 1` and
  HIGH `maxSubSteps: 6`, and `js/main.js` *drops* unaffordable accumulator debt
  (`if (accumulator >= FIXED_DT) accumulator = 0`). A slow device therefore
  advances **fewer sim ticks per wall-second** than a fast one. If the input
  trace records wall time, a run recorded on a phone will not replay on the
  server, every phone player will be flagged as a cheat, and the failure will
  look like an anti-cheat bug rather than a clock bug.

  **Since commit `85a1ff0` a uniformly slow device is no longer the hard case.**
  The quality watchdog used to ratchet a tier down for the whole session; it now
  moves **both directions mid-run**, so `maxSubSteps` — and with it the tick
  rate — can change several times inside one run on one machine. The test must
  cover that, not just a slow-but-steady device.

  Test, two parts, both required:
  1. **Uniform rates.** Replay the same trace with the harness stepping 1, 2, 4,
     and 6 ticks per simulated frame; assert an identical result from all four.
  2. **A tier change mid-run.** Replay the same trace with the step budget
     *changing partway through* — at minimum 6 → 1 → 6 and 1 → 6 → 1, with the
     transitions landing mid-trace rather than on a tick boundary the codec
     happens to like — and assert the result is identical to (1). A regression
     here is a run that scores differently depending on when a laptop got warm.

  **These tests are the reason to record traces in ticks**, and part 2 is the
  reason that reason is no longer theoretical. See
  [09](09-threat-model.md) §3.5, which owns the rule.
- **Codec round-trip.** `decode(encode(trace))` is identical to `trace` for a
  fixture set including: an empty trace, a single-tick trace, a maximum-length
  trace, a trace that is one long unchanged input (the RLE best case), and a
  trace that changes every tick (the worst case, which is also the size-cap
  case — see [10](10-observability-and-nfr.md) on the 64 KB trace ceiling).
- **Tamper rejection.** Fixture traces with: a truncated tail, a flipped byte, a
  tick index out of order, a duplicate tick, an out-of-range steering value, a
  trace longer than the declared match clock. Each must be *rejected*, not
  clamped — a clamping decoder is a decoder that scores an invalid run.
- **Cross-scene coverage.** Run the replay probes on at least Brooklyn and
  Boston, the two heaviest scenes (39,984 and ~82,894 blocks), because the
  structural-zone support path and the debris active-set scans are where a
  divergence would hide.

### 2.3 Belt and achievement rules as pure functions — `validateBelts()`

*Anchors:* `AC-BELT-1` (a belt is held by exactly one player at a time),
`AC-BELT-2` (ties resolve deterministically), `AC-BELT-3` (a reign clock is
monotone and survives a re-evaluation), `AC-BELT-5` (a new belt is a data row,
not code).

Belts are rows describing a metric, a scope, a window, and a tie-break rule
([00](00-objective-overview.md) locked this). That makes belt evaluation a pure
function `evaluateBelts(beltDefs, runs, now) → holders[]`, which is exactly the
kind of thing this validator is good at. Fixture a small synthetic ledger of
runs and assert:

- **Exactly one holder per belt.** Never zero (when at least one qualifying run
  exists), never two.
- **Tie-break totality.** Construct a ledger where two runs tie on the primary
  metric, then tie again on the secondary, then tie again on the tertiary. The
  rule chain must terminate in something total — earliest `created_at`, then row
  id. A tie-break that can return "equal" is a belt that flickers between two
  people on every re-evaluation, which at a booth is two people both being told
  they are champion.
- **Order independence.** Shuffle the run ledger with a seeded RNG (`rng.js`,
  not `Math.random()` — the guard applies) and assert the holder set is
  identical across N shuffles. This catches the classic "first row wins" bug
  that only shows up once Postgres changes its plan.
- **Reign monotonicity.** Re-evaluating with no new runs must not reset, extend,
  or restart any reign clock. Re-evaluating with a new losing run must not
  either.
- **Scope isolation.** A run tagged `unbound` must not move an all-time belt's
  holder unless the all-time belt's own scope filter admits it, and vice versa.
  Test all four scopes (`AC-BOARD-1..4`) against one ledger, since the whole
  point of "scope is a dimension, not a table" is that one row feeds several
  boards — which is also how one row corrupts several boards.
- **Achievement idempotency.** Awarding the same achievement twice from a replay
  of the same run must produce one award. Booth players will double-submit.
- **Data-driven-ness, proved.** Add a synthetic belt row that no code knows
  about and assert it evaluates. If adding a belt to the fixture requires
  touching a `switch`, the belt system is hardcoded and `AC-BELT-5` fails.

### 2.4 Flags-off equivalence — `validateOfflineFallback()`

*Anchors:* `AC-OFF-1` (with online disabled, the game behaves exactly as it does
today), `AC-OFF-2` (a failed or slow config fetch leaves online disabled).

The single most important safety property in the whole package
([08](08-rollout-and-runbook.md) §1) deserves a machine check, not a promise.

- **Import-graph guard.** Grep the module graph reachable from `js/main.js`
  *without* the online entry point and assert it contains no `@supabase/`
  import and no reference to the online config. If an online module can be
  reached at boot, a CDN outage can blank the game. This is the cheapest test in
  the package and it guards the most expensive failure.
- **Default-off assertion.** Import the flags module in Node with no config
  present and assert every flag is `false`. Then feed it a malformed config, a
  config that is valid JSON but the wrong shape, and a fetch that throws — all
  three must still yield every flag `false`. Fail closed, proven three ways.
- **Sim purity, still.** Re-run the existing pure-sim guard with the online
  files present. `sim.js`, `voxelsim.js`, `citygen.js`, `levels.js`, `tiers.js`,
  `rng.js`, `voxelkit.js` and every `voxelscene-*.js` must remain free of any
  network import. The netcode reads sim state and writes intents; it never
  becomes a sim dependency.

### 2.5 Client/server single-source guard

*Anchors:* `AC-SCORE-1`.

Assert that the Edge Function's scoring entry point imports the same relative
path the browser does, and that no second copy of the scoring or belt logic
exists anywhere in the tree (a content hash comparison across the repo, or
simply: the file appears once). A forked scorer is an anti-cheat system that
disagrees with the game, and it will be discovered by a player, publicly.

### 2.6 Keeping it one command

All of the above runs inside `node tools/validate.mjs`, called from the same
bottom-of-file block as `validateSaveSchema()` and friends, and gated by the
same `failures` counter. `AGENTS.md` keeps saying **one** command. The moment
there are two commands, one of them stops being run.

Cost: no new dependency, no runner, no config. These are functions in a file
that already exists. Expect the validator's runtime to grow by a few seconds
(the replay probes are the expensive part — bound them to two scenes, not five).

---

## 3. Do we introduce a test runner?

**Short answer: no new dependency, but yes to `node:test` if and only if the
validator becomes unwieldy — and that judgement is deferred until it does.**

The honest analysis:

| Option | Cost | Verdict |
|---|---|---|
| **Keep everything in `validate.mjs`** | Zero. No install, no config, no package.json, one command, matches `AGENTS.md` as written. Costs: no test isolation (one throw aborts the run), no per-test reporting, and a file that is already 960 lines. | **Chosen for now.** The new probes are ~8 functions in the same idiom as the 20 already there. |
| **`node --test` (built into Node 18+)** | Zero install, zero dependencies, no package.json required — it is the Node binary the repo already requires. Gives isolation, per-test names, and a TAP summary. Costs: a second command unless `validate.mjs` shells out to it, and a `tests/` directory that splits the mental model. | **The escape hatch.** If the online probes push the validator past readability, move *them* (not the scene contracts) to `node --test tests/` and have `validate.mjs` spawn it as its final step so there is still one command. This is the only runner that respects "no build step, no dependencies" completely. |
| **Vitest / Jest** | Free and open-source, so rule 5 permits them. But each brings `package.json`, `node_modules`, a config file, and a transform pipeline into a repo whose defining property is that it has none of those. That is not a dependency, it is a posture change. | **Rejected.** Buys nothing `node:test` does not, costs the invariant. |
| **Playwright for browser E2E** | Free and open-source, genuinely the right tool for testing a browser game's UI. Costs: `package.json`, `node_modules`, browser binaries (~400 MB), and — the real cost — **a week of authoring time we do not have before UNBOUND**, spent on the surface that a human at a booth will exercise a thousand times anyway. | **Rejected before UNBOUND, revisit after.** The `browser-playwright` skill can drive ad-hoc checks against the live URL without any of it living in the repo, which covers the pre-event need. |
| **pgTAP for RLS** | Free, open-source, ships inside Supabase. See §5 — this one is a genuine yes, but it lives in SQL under `supabase/tests/`, not in the JS tree, so it costs the JS invariant nothing. | **Adopt.** |

The rule being applied: cost is the gate, not third-party-ness (global rule 5).
Vitest is free and still wrong here, because its real price is paid in the
repo's architecture, not in dollars.

---

## 4. Testing a live arena without a second human

This is the interesting problem. The arena needs 2–8 simultaneous players and
there is one developer.

### 4.1 The scripted-peer harness — `tools/arena-harness.html`

The design that costs nothing and tests the most: **a browser page that opens N
peer clients in one tab**, each running the real client modules with rendering
disabled and input driven by a scripted trace instead of a keyboard.

Why a browser page rather than a Node script: the Supabase JS client is loaded
from the CDN importmap. Node cannot import from a URL, so a Node harness would
need a `package.json` and `node_modules` — the exact posture change §3 rejects.
A page served by `python -m http.server 8000` uses the *same importmap, same
client, same code path the real game uses*, which also makes it a better test.
This is the rare case where the constraint produces the better design.

Structure:

- A `?peers=6&scene=brooklyn&seed=<s>&trace=<name>` query interface.
- Each peer is a `VoxelSandboxSim` plus a netcode client, stepped by one shared
  `setInterval` at the fixed 60 Hz — **no renderer, no camera, no DOM per peer**,
  so a laptop can carry six.
- Traces are the same tick-indexed format the anti-cheat validates (§2.2), so
  a trace captured from a real play session in the game can be replayed by a
  scripted peer. Recording one is a checkbox in the diagnostics overlay.
- One peer may be flagged `--host` and another `--kills-host-at=45s`.

What it proves, and the criteria it anchors:

| Scenario | Anchors | Assertion |
|---|---|---|
| N peers, one host, 90 s | `AC-ARENA-1` (all players see all holes) | Every peer's view of every other peer's position stays within the interpolation tolerance of the host's authoritative state, at every sampled tick. |
| Host disappears at t=45 s | `AC-ARENA-4` (host migration completes without ending the match) | A new host is elected within the budget, the match clock does not reset, no player's score decreases, and every peer agrees on the new host within one snapshot interval. |
| Host disappears twice | `AC-ARENA-4` | Two migrations in one match do not split the room into two hosts. Run it; split-brain is the failure mode that a single-migration test never finds. |
| A peer joins mid-match | `AC-ARENA-2` | Late joiner gets the correct clock and does not see the world reset. |
| A peer's connection drops and returns | `AC-ARENA-5`, `AC-OFF-3` | Their hole freezes for others rather than teleporting; on return they resync without a score rollback. |
| Snapshot loss injected at 5/20/50% | `AC-ARENA-6` (playable on hostile wifi) | Interpolation degrades visibly but the match completes and final scores still validate server-side. Implemented as a `?drop=0.2` flag in the client's net layer, on in the harness and available in the real client for a booth-floor sanity check. |
| Two peers submit the same run | `AC-SCORE-4` | One row, one award. |
| Clock skew between peers | `AC-ARENA-3` | Peers with a ±3 s wall-clock offset still finish on the same tick, because the match clock is the host's tick count, not anyone's `Date.now()`. |

Cost: roughly a day of work, and it is reusable as the soak harness (§7) and as
the pre-event rehearsal tool (§8). It is the highest-leverage new test surface
in this package.

### 4.2 What the harness cannot prove, and needs a human for

- Whether the interpolation *looks* right. A within-tolerance assertion and a
  smooth-looking hole are different claims. One human, two machines, ten
  minutes, once per phase.
- Whether the arena is *fun* at eight players. Not a test.
- Real radio behaviour. Two tabs on one machine share one wifi association;
  they cannot reproduce eight devices contending for one access point. §7
  covers what can be done about this and §8 covers admitting it cannot fully be.

---

## 5. Testing RLS policies

*Anchors:* `AC-ID-7` (a player can read only their own identity fields),
`AC-BOARD-5` (boards expose display identity but never email), `AC-SCORE-2`
(a client cannot insert or edit a score row directly).

RLS is the entire security boundary of this design — a static site with an anon
key in the page source has no other one. It gets tested as such, and the tests
are written **from the attacker's seat**: the interesting assertion is never
"the owner can read their row", it is "the neighbour cannot".

**Method: pgTAP under `supabase/tests/`, run by `supabase test db`.** Free,
open-source, ships with Supabase, lives in SQL, and touches nothing in the JS
tree. It runs against a local Postgres from the Supabase CLI, or against a
throwaway branch project if Docker is unavailable on the machine.

The test matrix — every table × every role:

| Role | `profiles` | `runs` | `belts` | `rooms` | `ops_events` |
|---|---|---|---|---|---|
| `anon` (not signed in) | read display fields only; **no email, no company** | read validated rows only | read | read open rooms | insert only |
| `authenticated` (self) | read+update own row | insert own via function only; **no update, no delete, ever** | read | read+join | insert only |
| `authenticated` (other user) | display fields only | read validated only | read | read | none |
| `service_role` (Edge Function) | full | full | full | full | full |

Non-negotiable assertions, each written as a test that **expects a failure**:

- Email and company are unreachable from `anon` and from a different
  `authenticated` user, both by direct select and via any view, RPC, or foreign
  key traversal. Test the views too — an RLS-protected table behind an unguarded
  view is the classic Supabase leak, and a leaderboard is exactly the kind of
  thing someone builds as a view.
- A signed-in user cannot `UPDATE runs SET score = 999999` on their own row.
  Score writes go through the validating Edge Function under `service_role` and
  nowhere else.
- A signed-in user cannot insert a `runs` row with someone else's `user_id`.
- A signed-in user cannot write `belts` at all.
- `RLS is enabled` on every table in the schema. A single loop over
  `pg_tables` asserting `rowsecurity = true` — the highest-value four lines of
  SQL in the package, because the real-world failure is not a bad policy, it is
  a table someone added later and forgot to enable RLS on.
- A revoked/expired JWT gets nothing.

Plus: run Supabase's own **Security Advisor** before each phase gate in
[08](08-rollout-and-runbook.md) and treat every finding as a blocker until
explicitly waived in writing.

---

## 6. Testing the three OAuth paths

*Anchors:* `AC-ID-1` (email OTP), `AC-ID-2` (Google), `AC-ID-3` (HubSpot),
`AC-ID-4` (guest progress merges on first sign-in), `AC-ID-5` (a failed sign-in
returns the player to play, never to a dead end).

OAuth is the least automatable thing here and pretending otherwise wastes the
time it would take to find out. Split it three ways.

**What is unit-testable (in `validate.mjs`, pure):**

- The HubSpot flow's state/PKCE generation and verification, as pure functions:
  a state value is single-use, expires, and a mismatched state is rejected.
- The token-exchange handler with a stubbed fetch: success, a 400 from the
  provider, a timeout, a malformed token response, a response missing the email
  scope. Each must produce a *named* error the UI can render, never an unhandled
  rejection.
- The profile-normalisation function for all three providers: Google gives
  `given_name`/`family_name`, HubSpot gives a different shape, OTP gives only an
  email and the player types the rest. All three must land in identical,
  canonical `first_name`/`last_name`/`email`/`company` columns — lowercased
  email, trimmed names, company website normalised to a full `https://` URL per
  global rule 3. Fixture one payload per provider, plus a payload with no name
  at all, plus a payload with a name in a non-Latin script.
- The guest→account merge, which is §2.1's `mergeProgress` reached from the
  auth path. It gets its own fixture: guest has more coins, account has more
  coins, both have played the same level with different scores, account is brand
  new, guest is brand new.

**What is configuration-testable (a checklist, run per environment):**

The redirect URI is the thing that breaks, and it breaks per environment. Vercel
preview deployments get a **new hostname per deploy**, and neither Google nor
HubSpot will accept an unregistered redirect URI — so OAuth simply does not work
on an ad-hoc preview URL. Plan for it rather than discovering it: register a
single stable preview alias (e.g. `staging.<domain>`) and test OAuth only there.

| Check | Local | Stable preview | Production |
|---|---|---|---|
| Supabase Auth redirect allow-list contains the origin | ✓ | ✓ | ✓ |
| Google OAuth client authorised redirect URI | n/a | ✓ | ✓ |
| HubSpot app redirect URI | n/a | ✓ | ✓ |
| HubSpot client secret present in Supabase Function secrets | n/a | ✓ | ✓ |
| Vercel deployment protection **off** for the tested origin | n/a | ✓ | ✓ |
| Sign-in completes and returns to the game screen, not a blank tab | ✓ | ✓ | ✓ |

**What is manual, every time, and cannot be delegated:** the full round trip in
a real browser, per provider, including the cancel path (player clicks "deny"),
the already-signed-in path, and the **shared-kiosk path** — sign in, finish,
sign out, and verify the next person at the machine sees no trace of the last
one. That last one is a privacy obligation at a public booth, not a nicety, and
it is in §8's checklist for that reason.

---

## 7. Load and soak for a booth's worth of players

**Define the load first**, because "a booth's worth" is not a number:

- Peak concurrent players in one arena: **8** (the room cap; a config value, per
  [00](00-objective-overview.md)).
- Peak concurrent players across the venue: **~40** (booth machines plus
  bring-your-own phones if that ever turns on).
- Match cadence: ~90 s play + ~30 s turnaround ⇒ **~30 matches/hour**.
- Event duration: **two days × ~8 hours**. ⚠ **Unconfirmed, and it is a load
  input.** [06](06-belts-and-achievements.md) §3 designs the UNBOUND belt resets
  around a **three-day** show. Whoever has the UNBOUND schedule should settle
  this before the projections are relied on; a third day scales every message
  figure in [03](03-technical-design.md) §7.3 by 1.5×, and it changes how many
  times the UNBOUND belts reset.

Those four numbers drive the cost model in
[03-technical-design.md](03-technical-design.md#73-the-realtime-message-math-which-is-the-whole-cost-question)
§7.3 (canonical) and its restatement in
[10-observability-and-nfr.md](10-observability-and-nfr.md) §4.2, and the point
of load testing is to find out which of them is wrong before the event rather
than during it. Those docs project the shipped **12 Hz / 10 Hz** rates over two
booth shapes and get **1.34 M–3.54 M** messages sent (**2.38 M–6.65 M**
delivered) across the event — a 5× spread driven almost entirely by matches per
event and by the unread meter, not by netcode. **Which is to say: the number is
unmeasured, and test 2 below is the point of this whole section.**

**The tests:**

1. **Room-cap soak.** The §4.1 harness at 8 peers, 90-minute continuous run,
   matches cycling back to back. Watch for: monotonic memory growth in a peer
   (the debris arrays are the suspect — `js/quality.js` already documents debris
   as "the only cost that grows without bound during a session"), Realtime
   channel handles not being released between matches, and reconnect storms.
   A leak that takes 90 minutes to show is a leak that shows at 10:30 a.m. on
   day one.
2. **Message-volume count, not a guess.** Run one full match at the shipped
   rates (12 Hz snapshots, 10 Hz intents) and read the **actual** message count
   off the Supabase Realtime dashboard, not off arithmetic. Multiply out to the
   event and compare with the quota — Free is ~2 M/month, Pro ~5 M/month
   included. This also settles whether the meter counts sent or sent+delivered,
   which is a ~1.9× swing on its own. [03](03-technical-design.md) §7.3 does the
   projection and cannot narrow it further; this test is what turns it into a
   fact. Do it **before** committing to a snapshot rate. Tracked as
   [13](13-tasks.md) T-709.
3. **Submission burst.** Fire 40 score submissions inside 10 seconds at the
   validating Edge Function and measure queue behaviour and the time until the
   board reflects them. The player-visible score must be instant regardless
   (`AC-SCORE-5`); this measures the *confirmation* lag, which is the thing the
   booth screen shows.
4. **Board read under load.** Hammer the four board queries while submissions
   are landing. Boards are the thing on the big screen; a board that takes four
   seconds during a rush is the failure people will actually see.
5. **Hostile-network simulation.** Chrome DevTools throttling at "Slow 3G" plus
   the harness's `?drop=` packet-loss injection plus an abrupt offline toggle
   mid-match. Every one of them must end in a legible state, never a spinner.
   Then, separately, a **captive-portal rehearsal**: connect to a network that
   intercepts the first request and confirm the game still boots and plays
   offline rather than hanging on the config fetch (`AC-OFF-2`).
6. **Cold-start walk-up.** Fresh profile, empty cache, throttled network:
   measure time from URL to controllable hole. This is the conversion metric in
   [10](10-observability-and-nfr.md) §2 and it is measured, not estimated.

**What load testing here honestly cannot do:** reproduce a conference RF
environment. Eight tabs on one laptop share one radio association. The real risk
is 500 devices contending for one access point, and no lab test reaches it. The
mitigation is architectural, not testable — the game must be fully playable
offline (`AC-OFF-1`) — and the contingency is in
[08](08-rollout-and-runbook.md)'s day-of runbook. Say this out loud rather than
producing a green load-test report that means less than it looks like.

---

## 8. Manual pre-event smoke checklist

Run this **twice**: once at the end of the soft-launch phase, and again on the
booth hardware, on the venue wifi, the evening before doors open. The second run
is the one that counts — it is the only test in this document that runs in the
actual conditions.

Print it. A checklist on a laptop is a checklist nobody runs while the laptop is
being set up.

**A. The machine (per kiosk)**

- [ ] Browser updated, then **auto-update disabled** for the event.
- [ ] Sleep, screensaver, and display-off disabled. Battery settings set to
      never sleep **on battery too** — the plug gets kicked.
- [ ] Browser in kiosk/fullscreen, game URL as the home page.
- [ ] Zoom at 100%; no leftover DevTools window.
- [ ] Notifications and OS update prompts silenced.
- [ ] Volume set, then tested from where a visitor stands.
- [ ] Bookmark bar contains: the game, the Supabase dashboard, the Vercel
      dashboard, and the moderation page. Nothing else.

**B. The offline guarantee (do this first, it is the most important test)**

- [ ] Turn wifi **off** on the kiosk. Load the game from cache. It plays.
- [ ] With wifi off, complete a full run. Score is shown. State reads "offline",
      not "loading".
- [ ] Turn wifi back on. The queued run posts to the board without a reload.
- [ ] Set the master kill switch to off (`?online=off`). Confirm the game is
      byte-for-byte today's experience: no sign-in prompt, no board, no arena,
      no error, no empty panel where a board used to be.

**C. Identity**

- [ ] Guest play works with zero prompts before the first hole is moving.
- [ ] Email OTP: request, receive, paste (not retype — `AC-ID-8`), land back in
      the game.
- [ ] Google sign-in round trip.
- [ ] HubSpot sign-in round trip.
- [ ] Cancel/deny path on each of the two OAuth providers returns to the game.
- [ ] Guest progress merges on first sign-in; coins and unlocks do not decrease.
- [ ] **Sign out, then reload.** No previous player's name, email, belt, or
      session remains. Repeat once — the second player is the one who gets the
      leak.

**D. Arena**

- [ ] Two kiosks join the same arena and see each other's holes move.
- [ ] Match clock agrees on both.
- [ ] Close the host's lid mid-match. Match continues; a new host takes over;
      scores survive.
- [ ] Rejoin after being disconnected.
- [ ] Room fills to cap; the ninth person gets a clear "next match starts in…",
      not an error.

**E. Boards, belts, big screen**

- [ ] All four scopes render and are not empty (seed them with rehearsal runs).
- [ ] A new top score changes the belt holder within the expected window.
- [ ] Reign clock counts up and reads correctly.
- [ ] Big screen at real viewing distance: legible names, legible times, no
      truncation, no horizontal scroll, and a visible "last updated" timestamp
      so a stalled board is obvious from across the aisle.
- [ ] **Moderation drill, timed.** Hide a handle from the big screen and
      confirm it disappears. Target: under 60 seconds by someone who is not the
      developer. If it takes longer than that, the tool is wrong — see
      [08](08-rollout-and-runbook.md) §5.4.

**F. Accessibility spot-check** (full obligations in
[10](10-observability-and-nfr.md) §3)

- [ ] Sign-in form completable by keyboard alone; focus ring visible at every
      stop and never hidden behind a sticky header.
- [ ] OTP field accepts paste and offers the platform autofill.
- [ ] Board is a real table with headers, readable by a screen reader.
- [ ] Reduced-motion setting suppresses belt/board animation.

**G. The paper backup**

- [ ] The one-page day-of runbook from [08](08-rollout-and-runbook.md) §5 is
      **printed** and taped inside the booth counter, with phone numbers on it.
- [ ] The person staffing the booth has read it and has personally done the
      kiosk reset and the moderation drill once.

---

## 9. Coverage map — every acceptance area to a test surface

| Area | Validator (pure) | pgTAP (RLS) | Peer harness | Manual |
|---|---|---|---|---|
| `AC-OFF` offline & fallback | §2.4 | — | §4.1 loss/drop | §8.B |
| `AC-ID` identity & merge | §2.1, §6 unit | §5 | — | §8.C, §6 manual |
| `AC-ARENA` live arena | §2.2 tick purity | — | §4.1 (all rows) | §8.D |
| `AC-BOARD` four scopes | §2.3 scope isolation | §5 (no email leak) | §7.4 | §8.E |
| `AC-BELT` belts & reigns | §2.3 | §5 (no client writes) | — | §8.E |
| `AC-SCORE` submission & validation | §2.2, §2.5 | §5 | §7.3 | §8.B, §8.E |
| `AC-OPS` event operability | — | — | §7.1 soak | §8 entire |

Two gaps are deliberate and named rather than hidden: **there is no automated
browser E2E test of the new UI** (§3 — Playwright deferred past UNBOUND; the
manual checklist and a human at a booth cover it), and **there is no test that
reproduces conference RF conditions** (§7 — architecturally mitigated by the
offline guarantee, operationally mitigated by the runbook).

---

## 10. Measurement discipline

Any number this project quotes — a frame cost, a latency, a message count —
inherits `STATUS.md`'s rule verbatim: **no perf number is quotable until the
tree is still.** That box showed 2.0–2.6× median/min noise and a 40 s outlier on
a 2.5 s build while agents were live. Min-of-N round-robin is the minimum
acceptable instrument.

Applied to this package:

- No latency or frame-cost figure goes into a doc, a commit message, or a
  message to Nico unless it was taken on a quiet machine with nothing else
  running, min-of-N, N ≥ 5, round-robin between the variants being compared.
- Server-side numbers come from Supabase's own query statistics and Realtime
  counters, not from a stopwatch on a client, because the client's number
  includes the venue's wifi and tells you nothing about the query.
- Report median **and** p95, always. `STATUS.md` already records why: Upper
  Manhattan's worst collapse has a 16.6 ms median and a 101 ms p95, and only one
  of those two numbers describes the experience.
- A retracted number gets retracted in writing, in the doc that carried it.
  This repo has done that twice (the "exponent ≈ 2.08" claim and the "38%
  darker" diagnosis) and is better for it.
