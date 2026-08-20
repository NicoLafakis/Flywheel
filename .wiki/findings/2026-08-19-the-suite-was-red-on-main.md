# Finding: the test suite was red on `main`, and nothing said so

**Date**: 2026-08-19
**Status**: three defects found, all pre-existing on `origin/main` (`c8ac95d`)
**Found by**: attempting to declare Flywheel's real gates in `.sop-gates.json`
**Category**: harness integrity

---

## How it surfaced

Flywheel has no `package.json` — by design, its validator *is* the test suite.
The commit-attestation harness discovered gates exclusively by reading
`package.json` scripts, so in this repo it found none, emitted
`no-gates-applicable`, and wrote a `PASS` receipt. Two full commits in one
session were attested with the line:

```
sop_attest: PASS. 0 gate(s) ran on tree 304764af38.
```

A receipt that reads exactly like a verified commit, for a tree nothing had run
against. Repairing that harness meant writing down what Flywheel's real gates
*are* — and the moment a candidate set was actually run, it came back with
**2 failing suites**.

The relationship is the point: **the blindness and the redness kept each other
invisible.** Nothing ran the gates, so nothing reported them red; nothing
reported them red, so nobody asked why nothing ran them.

## Was it us?

No, and that was established structurally rather than argued. Each suite was
run against clean `git archive` extractions of five trees:

| tree | | `economy-consistency` | `sfx-event-guard` |
|---|---|---|---|
| `c8ac95d` | `origin/main` | **pass** | **FAIL** |
| `dc15a6f` | | FAIL | FAIL |
| `ca90fc6` | | FAIL | FAIL |
| `0319c13` | Singapore ships | FAIL | FAIL |
| `48edfb6` | working head | FAIL | FAIL |

`sfx-event-guard` is red at `origin/main` itself — it is red on the deployed
branch. `economy-consistency` went red between `c8ac95d` and `dc15a6f`, which
is the window containing `94867dc`, the block-count correction.

---

## 1. `sfx-event-guard.test.mjs` — 16 of 32 failing, 15 of them phantom

The suite extracts the shipped event-scoping guard out of `js/main.js` as
literal source text and compiles it with `new Function`, so it executes the
real thing rather than a re-implementation. It slices from `const isLocalHole =`
up to the first line matching:

```js
/^\s*(\} else )?if \(ev\.type ===/
```

The real guard ends at `js/main.js:1569`. Immediately after it sits
`if (tutorialManager) {` (`:1571`), whose *body* contains
`if (ev.type === 'eat' && isLocalHole) tutorialManager.onEat(ev.obj);` at a
deeper indent. That nested line is now the first match, so the slice runs one
line past the opening brace and the extracted fragment is unbalanced.
`new Function` throws, `runGuard` stays `null`, and **fifteen assertions all
fail with `actual: 0`** — every one a cascade of a single boundary error.

The reporting is what makes this expensive. Fifteen failures reading
*"the world event 'crash' carries no hole and must still be voiced for
everyone"* describe a catastrophic audio regression that **does not exist**.
The shipped guard is correct. Anyone reading that output would go looking in
`js/main.js` and find nothing wrong with it.

**The generalisable point**: a harness that extracts source by *positional*
boundaries has a silent dependency on everything that surrounds the extraction,
including code that has nothing to do with it. A `tutorialManager` block gained
`ev.type` arms and broke an audio test. The boundary must assert its own
sanity — balanced braces, expected contents — so a future insertion fails
loudly *as a boundary error* rather than as N phantom logic failures.

**CLOSED.** The boundary is now walked by **indent and by what the statement
does**, not matched by an indent-blind regex: from `const isLocalHole =`, step
over statements at exactly that indent while they continue the dispatch chain
(`else`, `} else`, `}`) or name `audio.`, and stop at the first statement at
that indent or shallower that does neither. Deeper lines are a nested body and
can never be the boundary — the fact the old regex ignored. Four boundary
assertions were added, and if a structural one trips the executable half is
**skipped** rather than run against a slice already known to be mis-sliced:
one loud boundary message instead of fifteen phantom ones. 32 → 34 assertions.

Verified independently of the agent that wrote it. The repaired suite was run
against a clean `git archive HEAD` tree — so the fix is proven to live in the
test, not in some working-tree change to `js/main.js` — then against mutants of
that tree, each mutation asserted to have actually applied:

| arm | mutation | result |
|---|---|---|
| control | none | PASS, 34 assertions |
| A | another **nested** `ev.type` arm added to the `tutorialManager` block — *the exact trigger of the original bug* | **PASS** — immune |
| C | the whole audio dispatch deleted, reproducing `8c3c85d` faithfully | FAIL, and the **first** message named is the RCA-2026-08-17 regression itself |

Arm C is the one that matters: the suite still catches the thing it exists to
catch, and names it *first*, with the boundary assertions correctly worded as
"either the pump is gone or the slice ended before it" rather than guessing.

## 2. `economy-consistency.test.mjs` — a half-retirement

```
AssertionError: coin ladder goes backwards at gallery.coinCount: 70 -> 60
```

The campaign economy ladder used to sort all 29 cities ascending by `blocks`
and assert the coin economy was non-decreasing along it — map size as a proxy
for campaign progression. It was green **only** because two declared block
counts were wrong (gallery understated by 2,115, cambridge overstated by
15,557) and those two errors happened to place the prologue smallest and the
finale largest. Correcting them turned the ladder red without any economy value
changing.

That was diagnosed and fixed — in `tools/validate-campaign.mjs`, which now
asserts the actual design invariant: the PROLOGUE city is the economy **floor**,
`cambridge` is the **ceiling**, and the 27 in between still scale with size.

`tools/economy-consistency.test.mjs` carries a **second copy** of the same
ladder and was never swept. It still sorts by `blocks`. One side of a two-sided
seam was retired and the other kept asserting the retired model — the repo's
recurring defect class, and the fourth instance recorded.

**The generalisable point**: the fix for a wrong shared assumption is not done
when the file you were looking at is green. Grep for every other expression of
the same assumption *before* closing it.

**CLOSED, and closed structurally rather than by copying the fix across.** The
role-based ladder is now **one implementation**, `economyLadderViolations`,
exported from `validate-campaign.mjs` and parameterised by a value accessor.
Two suites, two tables, one ladder:

- `validate-campaign.mjs` runs it over the **declared** `CITY_CATALOG` rows;
- `economy-consistency.test.mjs` runs it over the **paid** `CITY_COIN_TIERS`
  rows the sim actually hands the player — the table that file exists to guard.

A second copy is what caused this; a third copy would have been the same bug
again. It also carries an **anti-vacuity** assertion — `comparisons > 0`, plus
pinned floor/ceiling anchors — because a ladder that compared nothing would
report zero violations and pass.

Mutation-proved independently, each mutation asserted to have applied:

| arm | mutation | result |
|---|---|---|
| control | none | `economy consistency: all assertions passed` / campaign `ALL PASS, 1345` |
| A2 | a **member** (`sydney.coinCount` 70 → 1) dropped below the prologue | fails: *floor: coinCount at sydney (1) is below the PROLOGUE gallery (60)* |
| B | a mid-roster city (`tokyo.goalBonus` → 99999) raised above the finale | fails: *ceiling: goalBonus at tokyo (99999) is above the finale cambridge (500)* |

The first attempt at arm A was **not a valid test and is recorded as such**: it
raised `gallery`'s own `coinCount`, which trips the pinned
*"THE LAB must pay the STARTER tier it advertises"* `deepEqual` earlier in the
file and aborts before the ladder ever runs. It failed, so it *looked* like a
passing mutation test, while exercising a completely different guard. Perturbing
an **anchor** tests whichever assertion reaches it first; to put the floor arm
under test the perturbation has to move a **member**.

## 3. `singapore` is registered but never orchestrated

`tools/validate.mjs` registers a `singapore` section, but that name is absent
from the orchestrator's `groups` array. The orchestrator is the path a bare
`node tools/validate.mjs` takes — one child per group, each with
`FW_VALIDATE_SECTIONS=<group>`. **A section registered and not listed in
`groups` is never run by the full validator.** It fires only when a human names
it by hand, which is exactly what every green Singapore run in this session
did.

The file's own comment inside that array documents this failure mode verbatim,
from five sections that sat dormant until earlier the same day. Singapore is
the sixth instance, added *after* the comment warning about it was written.

**The generalisable point**: a registry with a second, manually-maintained list
of what to actually run will drift, and the drift is silent by construction.
The fix is not to add the missing name — it is a guard asserting the two sets
are equal, so there cannot be a seventh instance.

**CLOSED.** `tools/orchestrator-coverage.test.mjs` extracts the `section('name')`
registrations and the names inside the `groups` array from `validate.mjs`'s own
source text and asserts the two sets are equal **in both directions**. It reads
the file as text rather than importing it, because importing `validate.mjs`
executes it. `singapore` was added to `groups`, and the guard itself registered
as a section *and* added to `core` — a coverage guard left out of `groups`
would be precisely the hole it exists to catch.

Verified independently of the agent that wrote it, by mutating copies in a
scratch dir with each mutation asserted to have actually applied (a `replace`
that silently matches nothing would make all three arms pass vacuously):

| mutant | result |
|---|---|
| `groups` loses `auckland` | fails naming `auckland` |
| `groups` loses `singapore` | fails naming `singapore` |
| `groups` loses the guard itself | **fails naming `orchestratorCoverage`** |

Clean tree: 44 registered, 44 orchestrated, `ALL PASS`.

---

## What was done

All three defects are closed, each with its evidence recorded above the claim
rather than below it. Every mutation proof was re-run **independently of the
agent that wrote the fix**, and every mutation was asserted to have actually
applied — a `replace` that silently matches nothing makes every arm pass
vacuously and reads exactly like a proof.

- The attestation harness now reads `.sop-gates.json` from the repo root, and
  **refuses to attest** a staged set containing source when zero gates were
  discovered. A malformed config raises rather than degrading to "no gates" —
  that silent degradation is the exact failure being removed.
- `.sop-gates.json` declares Flywheel's real gates. Cambridge and the other
  heavy scene sections are deliberately excluded (the full run is ~37 minutes;
  see `project-cambridge-was-meant-to-look-dense-not-be-dense`). **The
  exclusion is named in the file rather than left implicit** — a gate set that
  silently omits coverage reads as "everything was checked" when it was not.
- All three defects above are fixed, each carrying a mutation proof that the new
  guard is armed rather than decorative. See the CLOSED block under each.

## The rule this cost

**A gate nobody runs and a gate that always passes are the same object.** The
receipt said PASS, the suite was red, and both statements were true
simultaneously for an entire session. Before trusting any harness, run the
thing it claims to run and check the count it reports is not zero.
