# AI Players — Objective Overview

**Tier:** 3 · **Date:** 2026-08-10 · **Status:** planning

> The spine of the package. Every other doc inherits this trajectory. Read this
> before [01-prd.md](01-prd.md); the spec answers *what*, and only this page
> answers *why in this shape*.

## What was asked

Put five or more AI opponents of mixed difficulty into the voxel sandbox.
Bigger hole eats smaller hole; the eaten player respawns small after a few
seconds. Change every scene's goal to 100% consumption and put the match on a
clock — resolved to three minutes. Target Boston and Cambridge; develop in the
Sandbox. Build it so a bot's slot can later be occupied by a networked human.

## What it really serves

**Flywheel has no opponent, and therefore no match.** Everything the game
currently produces is a solo performance against geometry: the city does not
push back, the clock does not exist, and the only failure state is boredom. The
shipped [score-combo-and-hype](../score-combo-and-hype/) layer made the
performance *legible* — you can finally see the number going up — but a number
going up with nobody else in the room is a screensaver with a scoreboard. A
rival is the cheapest possible source of the one thing this game has never had:
**a reason for the next thirty seconds to matter differently than the last
thirty.**

The 100%-goal amendment and the clock are the same move made twice. Today a
`targetFraction 0.5` scene ends when you have eaten half a city, which means
the back half of every map Nico has built is content nobody has a reason to
visit. Cambridge is 72,943 blocks across ten districts and the shipped goal
retires the player at block 36,472. Moving every scene to 1.0 and bounding the
run with a clock converts the goal from *a finish line you cross* into *a
ceiling you race toward*, and every block in every district becomes worth
something for the first time.

**But the deepest thing this package serves is not gameplay at all — it is the
shape of the sim.** Right now `js/voxelsim.js` line 252 says `this.hole = {...}`,
singular, and roughly forty call sites downstream say `const h = this.hole`.
That singular is a structural commitment: it says *this game has one
participant, forever*. This package's original strategic argument was that
the fully designed, ADR-backed [multiplayer](../multiplayer/README.md)
package could not begin its first line of sim work until that singular
became a plural, and it was blocked on backend credentials it did not
control. Multiplayer has since shipped its own multi-hole sim independently
([ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)), so this
refactor is no longer multiplayer's blocker; the remaining value of this
package is the AI-opponent gameplay itself.

That is the whole strategic argument for building this now: the multi-hole
refactor is on the critical path of a blocked project, and this package is the
unblocked way to pay for it.

## The driver seam — the whole point

A hole today is a state bag that `sim.step(dt, move)` mutates, where `move` is
the human's steering vector. The refactor introduces exactly one new idea:

> **A hole is an entity with a driver. A driver is anything that, when asked,
> returns a steering vector for its hole.**

```
sim.step(dt)
  for each hole h in this.holes:
    intent = h.driver.decide(h, worldView, dt)   // {x, z}, unnormalised
    applySteering(h, intent)
  ... existing physics, eating, collapse ...
```

Three implementations, one interface:

| Driver | `decide()` reads | Exists when |
|---|---|---|
| `humanDriver` | the input latch already in `js/main.js` | today (this is the current game) |
| `botDriver` | sim state + its own seeded RNG stream + a difficulty parameter set | this package, P1 |
| `peerDriver` | the last steering intent received over Realtime | [multiplayer](../multiplayer/README.md), which already ships its own host-authoritative equivalent |

This is not speculative architecture. [ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)'s
host-authoritative model has the arena host run the canonical sim and apply
every player's steering — a multi-slot sim with pluggable steering sources is
exactly what that architecture presumes. This package's driver abstraction
covers the same ground for bots specifically.

The seam earns its keep four ways at once:

1. **Determinism survives.** A driver is a pure function of `(hole, world,
   seeded stream)`. Same seed plus same human input trace still yields the same
   run, so [ADR-0003](../../adr/0003-deterministic-seeded-generation.md) holds
   and [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md)'s
   server-side replay stays viable — the replay only needs the human's trace,
   because the bots re-derive themselves.
2. **The reference implementation already exists.** `tools/validate.mjs:64`
   ships a greedy bot — *"steer toward nearest currently-edible object; re-plan
   continuously"* — that has been driving campaign levels to a win for months.
   It is currently test-only scaffolding. It becomes the P1 bot brain's `HARD`
   parameter set with the greed radius and re-plan cadence lifted out as
   parameters. We are not inventing a bot; we are promoting one.
3. **Zero bots is today's game.** One hole, `humanDriver`, no clock — the
   single-player fallback is not a compatibility mode, it is the degenerate
   case of the general model.
4. **A bot slot and a peer slot are the same slot.** Which is the ask.

## What the genre already answered

Per repo rule 11, the mechanics below were read off shipped games rather than
derived. Sources at the foot of this section.

- **Match length is two minutes, not five.** Hole.io Classic and Solo Run are
  both 120-second rounds; that is the hyper-casual genre's settled answer.
- **Opponent count.** Hole.io Classic puts *seven holes in one level* (six
  opponents); the Battle Royale variant runs twenty. Nico's "5+" sits squarely
  inside the shipped range.
- **Bots are the default population, not a fallback.** *"Most matches include
  both real players and computer bots, so you can always enjoy a full and
  exciting game."* The genre does not gate the bot fleet behind an offline
  mode, and neither should we — a bot slot backfilling a missing human is the
  normal case in shipped .io games.
- **Bot target selection is nearest-edible with a threat override.** *"Bots
  seek the best target — if a bigger one locks on, you have seconds to move."*
  The threat-flee behaviour is what makes a bot read as an opponent rather than
  a vacuum cleaner, and it is one clause.
- **The player-facing decision rule is two lines.** *"If it's smaller than you →
  eat it. If it's bigger than you → run."* This is the entire hole-vs-hole
  rule, and it is worth stating that plainly in the HUD design: the player must
  be able to answer "bigger or smaller than me?" at a glance, which is what the
  size tags in [01](01-prd.md) §7 exist for.
- **Respawn is a fixed delay at a reset size, and the delay is dead time the
  player is expected to use.** Holey.io Battle Royale: *"you will be out of the
  game for 10 seconds and will return to your original size"*, and the shipped
  advice is *"keep moving during the time it takes to resurrect and use these
  precious seconds to scout out a strategic place to respawn."* That last
  clause is a design instruction, not a tip: the respawn window should show the
  world, not a modal.
- **Eating a hole is the highest-value action in the game.** *"Holes give you
  the most points per eating session."* Our swallow rule must therefore
  transfer real mass, not a token bonus, or nobody will hunt.
- **Rubber-banding is rejected, with a source.** The design literature is
  explicit that score-coupled catch-up AI *"is sometimes used as a fix-all for
  games with poor AI, as a way to avoid having to redesign or make a competent
  AI in the first place,"* and that the field has moved toward *"changing AI
  behavior based on difficulty settings"* instead. We take the second road: a
  fixed mixed-difficulty fleet, parameter sets on one brain, no coupling to the
  player's score. This is also the only road compatible with determinism — a
  bot that reacts to the player's performance is still deterministic, but it
  makes every replay divergence catastrophic instead of local.

Sources:
[Hole.io (Wikipedia)](https://en.wikipedia.org/wiki/Hole.io) ·
[Hole.io modes guide (WriterParty)](https://writerparty.com/party/hole-io-all-modes-guide-how-to-win-in-classic-battle-and-solo-modes/) ·
[Holey.io Battle Royale (CrazyGames)](https://www.crazygames.com/game/holey-io-battle-royale) ·
[Holey.io Battle Royale rules (holeonline.io)](https://holeonline.io/holeyio-battle-royale) ·
[Hole.io tips (Level Winner)](https://www.levelwinner.com/hole-io-cheats-tips-tricks-hints-to-get-a-super-high-score/) ·
[Rubber-banding as a design requirement (Game Developer)](https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement) ·
[Explaining rubber-banding AI (Game Wisdom)](https://game-wisdom.com/critical/rubber-banding-ai-game-design) ·
[A Rubber-Banding System for Gameplay and Race Management, Game AI Pro ch. 42](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf)

## Owner decisions, resolved 2026-08-10

Nico, in session. **These are normative** and override any recommendation
elsewhere in this package.

1. **Every map's goal changes to 100% consumption**, from today's `0.5`
   `targetFraction` cities, **and play becomes timed**: how much can you eat in
   a limited window. **The match clock is 180 s (3 minutes)** —
   **RESOLVED 2026-08-10**, revised down from the provisional 5 minutes after
   the genre flag below. Verbatim: *"we have a lot more pieces and larger game
   map to consume so I'd say 3min then if anything."* The constant remains
   explicitly **tunable** in [01](01-prd.md) §10 and must not be inlined
   anywhere; the 120/180/300 playtest note stays live, with 180 s as the
   shipped default rather than the open question.
2. **Bigger hole eats smaller hole** (the Hole.io rule). **The eaten player
   respawns small after a few seconds** — **RESOLVED 2026-08-10** as the gentle
   rule: 5 s delay (tunable), radius resets to `START_RADIUS`, `rawMass`
   resets, and banked score is kept. Verbatim: *"we're not trying to be a
   hardcore game - take it easy."*
3. **Five or more AI opponents per map, mixed difficulty.**
4. **Target maps are Boston and Cambridge specifically.** The Sandbox (the
   `gallery` scene) is the development launching pad.
5. **Human multiplayer is a separate, already-shipped package**
   ([multiplayer](../multiplayer/README.md)). AI players must be built so a
   bot's driver slot can later be filled by a networked peer — same hole
   entity, different input source. **That seam is the whole point.**

## Where the genre disagreed with us — all three now resolved

Three places research contradicted a ruling. All three were put back to Nico
and **all three are resolved as of 2026-08-10**; the resolutions are normative
and are reflected in the decisions block above and in [01](01-prd.md).

| Flag | What the genre does | Resolution |
|---|---|---|
| **The timer was 5 minutes** | Hole.io ships **2 minutes** for both Classic and Solo Run. Two minutes is the settled hyper-casual answer, and it is what makes "one more round" cheap. Five minutes is 2.5× that, and Flywheel's holes move on a `SPEED_MULT` of 1.4 — the pacing risk is a long dead midgame after the easy blocks are gone. | **RESOLVED: 180 s.** Nico split the difference upward from the genre norm on content-density grounds — *"we have a lot more pieces and larger game map to consume so I'd say 3min then if anything."* Cambridge at 72,943 blocks is an order of magnitude more content than a Hole.io street grid, so the genre's 120 s does not transfer directly. Still tunable; the 120/180/300 playtest remains worth running in Cambridge, but 180 s is the shipped default, not an open question. |
| **100% goal in a timed round** | Hole.io's Solo Run *asks* for 100% in two minutes and essentially nobody achieves it — it is an aspirational ceiling, not an expected outcome. | **RESOLVED: proceed as designed — the goal is a ceiling, not a gate.** A match-end screen is mandatory in every case, and when the player does not clear, it tells them how much they took and where they placed (*"you took 34% of Cambridge, first place"*), never as a loss. [01](01-prd.md) FR-039 makes that binding. Nico's own answer to the reachability question is **power-ups**, recorded as a forward move below rather than designed here. |
| **Respawn "small after a few seconds"** | Holey.io BR: **10 seconds**, respawning at the player's **original** (starting) size — a full reset, not a partial one. | **RESOLVED: the gentle rule stands** — 5 s delay (tunable), radius resets to `START_RADIUS`, `rawMass` resets, banked score is kept. Verbatim: *"we're not trying to be a hardcore game - take it easy."* A death is therefore expensive in the currency that drives growth and cheap in the currency that drives the leaderboard, so a run is never unrecoverable. |

## 20 moves ahead

### Next wants — asked for within days of this shipping

1. **"Can I turn the bots off?"** Immediately, from someone who wanted to build
   the sculpture. The bot count is a scene/session option from P1, not a
   constant.
2. **"Can I play just against one really good one?"** A duel. Falls out for
   free if difficulty is a parameter set per slot rather than a fleet-wide
   enum.
3. **"Why did that bot go there?"** The first time a bot does something stupid
   on camera. There must be a debug overlay showing each bot's current target
   and state, or every balance conversation becomes archaeology.
4. **"Give them names."** Instantly, because a leaderboard strip with
   `BOT 3` on it is a bug report. The partner-skin work
   (`tools/gen-partner-logo.mjs`, `nameText` agency labels) already produces
   named, branded holes — bots should draw from that pool, which makes the
   leaderboard a wall of partner logos eating Cambridge, which is a booth demo.
5. **"Can the bots play the campaign?"** No — and the answer needs to be
   architectural, not a promise. The campaign is `js/sim.js` and is untouched.
6. **"What's my best time to 50%?"** A timed mode invents speedrun metrics the
   moment it exists.

### Breaks at scale / edges — what concedes first, in order

1. **Per-step cost, N× over.** Every bot runs a target scan. The greedy
   reference scans `sim.city.objects` whole-map when nothing is near, which at
   72,943 Cambridge blocks × 6 holes × 60 Hz is not survivable. The decision
   cadence (a bot re-picks every `repick` seconds, not every frame) is a
   **performance requirement disguised as a difficulty parameter**, and it is
   the first thing to measure.
2. **The support graph is keyed to one hole.** `_prevProx`, `_leanSet`,
   `_restIdx`, `_dirtyComps` and the whole zone-proximity recalc are written
   around "zones the hole can perturb" (singular, see `js/voxelsim.js` §_buildZones
   comments). Six holes means six proximity sets, and the recompute set is
   their union. This is the single largest hidden cost in the refactor and it
   is the one most likely to be discovered late.
3. **Two holes overlapping the same blocks.** The eating pass assumes one
   consumer per block. Two rims touching the same voxel needs a deterministic
   tie-break (lowest hole index wins) or the block is double-counted and mass
   is created from nothing.
4. **The float-equality win check.** Already found: `h.rawMass >= totalMass *
   targetFraction` fails at `targetFraction 1.0` because incremental summation
   lands ~1e-12 below the `reduce()` total. An epsilon fix is queued with
   another agent. **At 100% goals everywhere this moves from a curiosity to
   load-bearing** — it is the difference between "PERFECT CLEAR" firing and
   never firing, in every scene. This package does not fix it; it depends on it.
5. **Camera and bounds.** `this.bounds = 24` clamps hole movement. Six holes in
   a 48 m box is a mosh pit, not an arena; per-scene bounds have to widen with
   the population, and Boston/Cambridge bounds were authored for one hole.
6. **Respawn placement.** A bot respawning inside the player's rim is an instant
   free meal; respawning in already-cleared ground is a dead bot. Placement
   needs a rule (farthest-from-any-hole among cells with remaining mass), and
   it needs to be seeded.

### Unlocks — the adjacent capability this opens

- **The multiplayer sim, already unblocked.** [multiplayer](../multiplayer/README.md)
  shipped its own host-authoritative multi-hole sim independently of this
  package, so this item has already happened by another route.
- **A leaderboard that means something offline.** A ranked finish against five
  bots is a score with a context, which is the first score in this game that
  could go on a board without a network.
- **Difficulty as a product surface.** Parameter sets on one brain means a
  future "Nightmare" is a table row, not a class.
- **Bots as content pacing.** A bot is a deterministic consumer of city mass,
  which means it is also a *tuning instrument*: `tools/validate.mjs` can ask
  "does a MEDIUM bot clear 40% of District 7 inside the match clock" and get a
  number.
  Every future map gets a pacing probe for free.
- **The booth demo runs itself.** Six named partner holes eating Cambridge with
  no human at the keyboard is an attract mode, and attract mode is just this
  package with zero human drivers.
- **Power-ups have somewhere to plug in.** Nico's answer to "is 100% reachable
  in three minutes" is a later power-up layer — consume more, move faster, suck
  in boxels at range. That is **surfaced here, not designed here** (see the pen
  below), but it changes what this package must leave open: a hole's effective
  eat radius, its speed multiplier, and its vacuum reach must all be *derived
  per hole per step* rather than read from constants at the use site, so a
  future modifier can multiply them without touching the eating or movement
  code. That is a naming discipline, not a system, and it costs nothing now.

### Doors kept open vs. shut

**Kept open, deliberately:**

- **Driver is an interface, not an enum.** A fourth driver (replay playback,
  attract mode, a recorded ghost) costs one file.
- **Difficulty is a row of numbers.** `{greedRadius, reactionTime, repick,
  aggression, speedScale}` — a table the way
  [ADR-0015](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md) made
  the scoring ladder a table. New difficulty = new row.
- **Every bot owns a private RNG stream derived from `(seed, slotIndex)`.**
  Adding, removing or reordering bots therefore cannot change any *other*
  bot's decisions, which is what keeps balance work from being a whack-a-mole.
- **Per-hole state is on the hole, never on the sim.** `mass`, `rawMass`,
  `chain`, `chainTimer`, `size`, `sizeFrac`, `bestCombo`, `eatenCount` move
  wholesale from `sim.hole` to `holes[i]`. Anything that stays on the sim is a
  future bug where bot 3's combo pulses the player's meter.
- **The clock is a match property, not a scene property.** So a future
  untimed/endless/battle-royale mode is a config value, not a redesign.
- **Hole-vs-hole is one predicate in one place.** `canSwallow(a, b)`. A future
  rule change (shields, immunity frames, size-difference tiers) is one function.

**Shut, knowingly:**

- **No navigation mesh, no pathfinding.** Bots steer directly at targets and
  are blocked by the same geometry the player is. This will occasionally look
  dumb against a building corner. Accepted: pathfinding over a city that is
  actively collapsing is a research project, and the genre's bots do not have
  it either.
- **No score-coupled rubber-banding**, per the sourced argument above.
- **No bot learning, adaptation, or per-player tuning.** Deterministic
  parameter sets only.
- **No campaign integration.** `js/sim.js` and `LEVELS` are out of scope
  entirely.

## Scope line (pencil test)

### Building silently — completers and precursors

Same purpose as the ask, frustrating or broken without them, cheap and
removable.

- **The multi-hole refactor itself.** Not a bonus; it is the pencil.
- **Deterministic per-slot RNG streams.** Without them, balance is unrepeatable
  and replay is dead. One line at construction.
- **A bot-count-of-zero path.** The single-player fallback. Free, and it is the
  regression test that the refactor did not change today's game.
- **Named, skinned bot holes.** A leaderboard strip is unreadable without
  names, and the skin/`nameText` machinery already exists. This is the eraser
  on the pencil.
- **The debug overlay for bot target and state.** Every balance conversation
  needs it, and it is a few lines behind an existing debug flag.
- **Respawn placement rule + a brief invulnerability window.** Without the
  window, a respawn next to a big hole is an instant re-death loop, which reads
  as a broken game rather than a hard one.
- **A `validate.mjs` probe that runs an all-bot match to completion.** The only
  way to know the refactor did not NaN out the physics, and the harness already
  exists.
- **Timer, leaderboard strip and size tags as one HUD change.** A clock with no
  standings is anxiety without information.

### Surfacing for Nico's call — pens, not built

| Pen | Why it is a pen, and what the seam is |
|---|---|
| **Power-ups (consume more, move faster, suck in boxels)** | **Owner-flagged 2026-08-10 as coming later**, and as his answer to 100% reachability inside a short clock. It is a pen because it is a new noun with its own spawn rules, pickup entity, duration model, HUD language and balance surface — and because a power-up that bots can also collect changes the bot brain's target selection, which is a P4-sized change on its own. Not designed here. Seam: per-hole derived eat radius / speed / vacuum reach (see Unlocks above), plus the fact that the driver already sees full world state, so a pickup is just another target kind. |
| **Battle-royale mode (no respawn, last hole standing, shrinking map)** | A different win condition, a different match length (endless), and a shrinking-bounds mechanic the collapse sim has never been asked to survive. Genuinely fun and genuinely a new noun. Seam: the clock is a match property and `canSwallow` is one predicate, so BR is a rules profile, not a rewrite. |
| **Bots in the campaign** | The campaign is a different sim file with a different content model and a tuned difficulty curve that opponents would invalidate. Seam: `js/sim.js` already has the greedy driver in the validator; the driver interface could be lifted there later. |
| **Attract mode / booth demo (zero human drivers)** | Nearly free once this ships, but it is a *presentation* product with its own camera direction, and camera work is not in this package. Seam: a match with zero human drivers already runs. |
| **Bot personalities, taunts, chat** | New content and a moderation surface at a public booth. Seam: names and skins exist. |
| **Difficulty auto-selection from the player's history** | Needs a player-history store, which is [multiplayer](../multiplayer/README.md)'s territory. Seam: difficulty is a per-slot parameter set, so the selector is a function that returns rows. |
| **Team modes (2v2, humans + bot allies)** | A new noun (a team), new scoring, new HUD. Seam: a hole could carry a `teamId` field; it does not today and should not until asked. |
| **Server-side bot simulation for fairness in arenas** | Only meaningful for [multiplayer](../multiplayer/README.md)'s arena ([ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)), and it is that package's call, not this one's. Seam: bots are deterministic from the seed, so every client can compute the same bots without any of them being sent over the wire — which is a genuinely valuable property and the reason determinism is non-negotiable here. |

### Dropping — the parchment workshop

Not built, not seamed: machine-learned bots, behaviour trees or a GOAP planner
(a five-line greedy driver with a threat override is the genre's own answer),
voice lines, bot difficulty achievements, a bot editor, and any AI that
consults a model at runtime.

## Companion ADR (draft) — not created as a file

> **Draft only.** Per this package's brief, the ADR file is deliberately *not*
> written into `.wiki/adr/`. This section is the proposal for whoever creates
> it.

**ADR-0016: A hole is an entity with a driver; drivers are human, bot, or peer.**

- **Status:** proposed
- **Deciders:** Nico, and whoever implements P1

**Context.** `js/voxelsim.js` models exactly one participant (`this.hole`), and
~40 downstream sites read `const h = this.hole`. Three separate initiatives all
need more than one: AI opponents (this package), the live shared arena
([ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)), and any future
attract or ghost-replay mode. Each of them, taken alone, would justify a
bespoke solution — a "bot hole" special case, a "remote hole" special case —
and three bespoke solutions in the same file is how the sim becomes
unmaintainable. Meanwhile
[ADR-0003](../../adr/0003-deterministic-seeded-generation.md) forbids
`Math.random()` anywhere in the sim path, and
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) makes
determinism a *security* property, so whatever decides a non-human hole's
movement must be reproducible from a seed.

**Decision.** The sim owns an ordered array `holes[]`. Every hole carries all
of its own state and a `driver`. A driver implements one method, `decide(hole,
world, dt) → {x, z}`, returning an unnormalised steering intent, and is the
*only* channel by which anything outside the sim influences a hole's movement.
Three drivers are sanctioned: `human` (reads the input latch), `bot` (reads sim
state plus a private RNG stream derived from `(seed, slotIndex)` plus a
difficulty parameter row), and `peer` (reads the last intent received over the
network). `holes[0]` is the local human by convention. A hole's index is its
identity for the life of a match, including across death and respawn.

**Consequences.** The pure-sim boundary gains a precise definition of "outside
influence": any write to hole state outside `sim.step()` is a violation
regardless of which driver made it, the same invariant CLAUDE.md states
plainly ("Gameplay state changes only in `sim.step(1/60)`") and that
host-authoritative multiplayer
([ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)) depends
on. Bots cost nothing on the wire,
because every client can derive them from the seed. Replay stores only human
input traces. The cost is that the refactor touches the most delicate file in
the repo, and that per-hole proximity/support recomputation is now a union over
N holes rather than one set — a real performance obligation, recorded in
[01-prd.md](01-prd.md) §8.

**Alternatives considered.** *A `bots[]` array parallel to `this.hole`* —
rejected: it makes the human structurally special, so the peer case has to be
invented a third time and hole-vs-hole eating needs two code paths. *Bots as
render-side actors* — rejected outright: it violates
[ADR-0002](../../adr/0002-sim-render-split.md), and a bot that cannot eat is
not an opponent. *Bots driven by recorded human traces* — rejected: charming,
but it needs a corpus that does not exist and cannot react to the player at
all.

## Caliber & package

**Tier 3.** The refactor is invasive, touches the file every other system reads
from, changes a normative goal (`targetFraction`) in every scene, and creates
the seam a separately-designed Tier 3 package depends on. Docs in this package:
[README.md](README.md) · this overview · [01-prd.md](01-prd.md) ·
[02-requirements.md](02-requirements.md), plus the drafted ADR-0016 above.
</content>
