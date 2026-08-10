# Score, Combo and Hype — Objective Overview

**Tier:** 2 · **Status:** planning

> The spine of the package. [01-prd.md](01-prd.md) says *what the system must
> do* and [02-requirements.md](02-requirements.md) says *how we will know it
> does it*; only this page says *why in this shape*. Read it first, or the
> literal ask gets built instead of the thing the ask is reaching for.

## What was asked

In the owner's words:

> "player score isn't displayed, that should be, and again we should dress that
> and the combo thing up as meters and have them be nicely graphic matching the
> design aesthetic but being more animated and exciting when like every 100 on a
> combo is hit, 100, 200, 300, so-on. Same for point accumulation there should
> be stages of a word or phrase across the screen to increase excitement and
> hype related to progress like at 15% 'Gettin' there!' - then at 25% 'BAM! 25%
> COMPLETE!', etc… Let's try sprinkling some 'o dat in there as well."

Three things, then: **show the score**, **make the score and the combo read as
meters rather than as text**, and **stage the run with escalating celebration**
as the city goes down.

He also gave a ranking of where the effects should be loudest, and a rule about
how they must differ:

1. how much has been eaten (city consumption),
2. what combo level the player is at,
3. how big the hole is.

> "For any other meters or indicators they should [have] their own FX for goal
> notifications, not share the same style as another metric."

That ranking orders effort and volume. It is not licence to over-build three
components and let the rest of the HUD drift out of family.

## What it really serves

Flywheel already scores the player, and has never told them.

`hole.mass` (`js/voxelsim.js:2338`) is a real, combo-multiplied running total.
It is the number the SIZE ladder is measured against (`js/voxelsim.js:2344-2350`),
so it decides how fast the hole grows and therefore how the whole run feels.
Nothing renders it. `hole.rawMass` — the same total without the multiplier — is
what the goal bar shows, deliberately, because a multiplied number would run
past the city's own mass and break the bar. So the player watches the one number
that *cannot* reward them and never sees the one that does.

The combo has the same shape of problem, one layer worse. `comboMult`
(`js/voxelsim.js:98`) is doing real work on every bite. It is displayed nowhere.
What *is* displayed is a different number wearing the multiplier's clothes: the
HUD prints `⚡ COMBO x{floor((chain-1)/25)+1}` (`js/ui/hud.js:104`), which at a
chain of 26 reads **x2** while the actual multiplier is **1.1**, and at a chain
of 101 reads **x5** while the actual multiplier is **1.4**. The label is a tier
index, not a multiplier, and it has been overstating the reward by a factor that
grows with the chain. This package is the first time the two are reconciled, and
that reconciliation is not cosmetic — it is the difference between a meter that
tells the truth and one that does not.

To be precise about the current state, because the distinction matters: **no
score number is rendered anywhere**, but a combo pill *is* — the sandbox one
described above, from chain 26, and a campaign one at `js/ui/hud.js:74` that
prints the raw chain (`COMBO x{p.chain}`) from chain 2. Two code paths, two
different numbers, both wearing an "x", neither of them the multiplier.

Context worth recording once, and then leaving alone: the campaign sim uses
`comboMultiplier(chain) = min(3, 1 + 0.1 * (chain - 1))` (`js/sim.js:11-13`),
which reaches 3× at a chain of **21**, while the sandbox's reaches 3× at **501**
— and the sandbox's comment (`js/voxelsim.js:96-97`) still describes the two as
the same idea at a coarser grain. They are a factor of twenty-four apart. That
divergence is not this package's to fix (the campaign is a different mode with a
different sim and was not what was asked about), but it is evidence that this
corner of the code has drifted unwatched, which is a reason to make the sandbox's
version explicit and legible rather than to leave a second implicit formula in
place.

So the honest framing of the work is not "add a score readout." It is: **the
game has a reward layer, it has always run headless, and this package gives it a
face.** Every downstream reward system that is designed but unbuilt —
achievements, the 44 easter eggs, the 11 hidden glyphs, the championship belts —
assumes a player who can see what they are being rewarded with. None of them
lands on a HUD that shows no score.

## Where the design is standing

Four existing properties carry almost all the weight here, and none of them was
built for this.

- **The sim/render split** ([ADR-0002](../../adr/0002-sim-render-split.md)). The
  sim already emits a typed event stream (`eat`, `growth`, `milestone`, `coin`,
  `goal` — `js/voxelsim.js:2352-2361`, `:385`, `:2464`) and `js/main.js:550-586`
  already dresses it with sound, camera shake, rings, bursts and pops. Every
  effect in this package hangs off that same stream. Nothing here needs a new
  channel between sim and screen; it needs the existing one to carry more, and
  to be dressed better.
- **The milestone ladder already exists.** `js/voxelsim.js:2357-2361` fires a
  `milestone` event at 25 / 50 / 75 / 100 % of the city, and `js/main.js:573-578`
  already toasts "50% OF THE CITY CONSUMED". The owner is asking for a denser,
  louder, better-written version of a thing that is already wired end to end.
  That is a tuning-and-dressing job on a live path, not a new subsystem.
- **The brand layer** ([ADR-0005](../../adr/0005-shared-brand-layer.md),
  `css/main.css:1-47`). Gold `--fw-gold`, hot orange `--fw-gold-hot`, the CTA
  gradient, the ink outline rings `--fw-ring-2/3`, the chunky block extrude.
  There is an established look and `.wiki/visual-direction.md` is explicit that
  screen chrome already got its pass. The meters are not a new visual language;
  they are the existing one applied to two elements that never received it.
- **`reducedMotion` is already plumbed everywhere.** A persisted setting
  (`js/save.js:12`), an OS media query, and live setters on both the camera
  (`js/camera.js:371`) and the renderer (`js/voxelworld.js:1560`). Any new motion
  inherits an existing switch rather than inventing one.

And one hard limit that shapes the whole design: **no build step**
([ADR-0014](../../adr/0014-vendored-same-origin-runtime.md),
[ADR-0002](../../adr/0002-sim-render-split.md)). Vanilla ES modules served
statically. Everything below is hand-written CSS, DOM, canvas and the existing
three.js particle helpers. No animation library, no bundler, no new dependency.

## The three tracks, and why they must not share a look

The owner's constraint — each metric gets its own effects vocabulary — is the
single most important design instruction in the brief, because the lazy build is
so obviously available. One `<Milestone>` component with a colour prop would
satisfy every literal word of the ask and produce a HUD where a player cannot
tell, without reading, whether they just crossed 25 % of the city or hit combo
level 6. The whole point of celebration is that it is *legible at a glance while
the eyes are on the hole*. Three celebrations that differ only by hue are one
celebration with a palette.

So the package defines three distinct languages, and the differences are
structural rather than decorative — different screen region, different shape,
different motion, different sound family, different duration.

| Track | What it measures | Where it lives | Its own vocabulary |
|---|---|---|---|
| **Consumption** (rank 1, loudest) | `rawMass / totalMass` — the win condition | The existing left-column bar, plus full-width centre-screen phrases | **Horizontal.** Full-width band that sweeps across the screen, phrase typeset in the block-extrude wordmark style, gold. Wide, slow, cinematic. Fires a handful of times per level, so it can afford to be enormous. |
| **Combo** (rank 2) | `chain`, and the multiplier derived from it | A dedicated meter, right-hand side, near the thumb and away from the centre | **Radial and hot.** A charging arc/ring that drains as the 1.5 s window runs out, escalating in heat rather than size. Its celebration is a fast concentric pulse from the meter itself, not a screen banner. Short, sharp, repeatable. |
| **Hole size** (rank 3, quietest of the three) | `size`, `sizeFrac` | The existing SIZE readout | **Vertical and physical.** Stays what it is today — a stepped notch ladder that clunks up one rung, with the existing camera kick and confetti burst (`js/main.js:564-572`). It reads as the world reacting, not as the HUD announcing. |

The reason combo does **not** get screen phrases is frequency, and the reason
consumption does is the same fact from the other side. Consumption crosses a
threshold a handful of times in a whole level; a full-width banner there is an
event. The combo count moves constantly, and any banner-class effect tied to it
would be on screen more often than it is off, which is how a celebration becomes
furniture.

## The multiplier, and what it replaces

Today: `comboMult = min(3, 1 + 0.1 * floor((chain - 1) / 25))`
(`js/voxelsim.js:98`). Every 25 blocks is worth a flat +0.1, forever, and the
ceiling of 3× arrives at a chain of **501**. Flat, and invisible.

The owner's replacement curve, in his words: "x1 would be if you got 2 in a row
of course, but then it'd take 10, then 15, then 25, then 50, then 100, then
every like 250 you'd get 1 more added to the combo meter, and so on."

Read literally, that is a ladder of **combo levels** with thresholds at chain
2, 10, 15, 25, 50, 100, and then every ~250 thereafter, each level granting one
more increment of the multiplier:

| Combo level | Chain reached at | Owner's curve | Today's shipped multiplier |
|---|---|---|---|
| 1 | 2 | ×1 | ×1.0 |
| 2 | 10 | ×2 | ×1.0 |
| 3 | 15 | ×3 | ×1.0 |
| 4 | 25 | ×4 | ×1.0 |
| 5 | 50 | ×5 | ×1.1 |
| 6 | 100 | ×6 | ×1.4 |
| 7 | 350 | ×7 | ×2.2 |
| 8 | 600 | ×8 | ×3.0 (capped) |
| 9 | 850 | ×9 | ×3.0 (capped) |

What the shape buys, and it is the right instinct: the first four levels arrive
inside the first few seconds of any decent run, which is the "this is working"
signal the game currently has no way to give. Then the steps stretch, and the
last ones become genuinely rare. Front-loaded confidence, back-loaded prestige.
The shipped curve gives neither — nothing at all happens for the first 25
blocks, and then the same small nudge repeats twenty times.

**The consequence that must be designed for, not discovered:** `hole.mass` is
not just a score. It is the SIZE ladder's input (`js/voxelsim.js:2344-2350`,
`:319`). Raising the multiplier from ×1.4 to ×6 at a chain of 100 does not only
make the number bigger — it makes the hole grow several times faster, which
changes movement speed (`js/voxelsim.js:2378-2379`), camera height, and how long
a city takes to clear. The SIZE ladder therefore has to be rebalanced in the same
change, and the two are one decision, not two. [01-prd.md](01-prd.md) §11 owns
the mechanism; §2 there names it as the load-bearing invariant, because a
package that ships a beautiful combo meter and quietly turns every city into a
90-second run has failed at the thing it was for.

## How often does this actually fire?

This decides whether the celebrations are events or wallpaper, so it was
measured rather than assumed. The instrument was the shipped sim driven along
Cambridge's own scripted route (`CAMBRIDGE_ROUTE` in
`js/voxelscene-cambridge.js:2495`, the same line `tools/validate.mjs` drives),
with the chain sampled every step.

The chain climbs with SIZE, so the numbers are given at four points along the
same run rather than as one average — a two-minute booth session and a
thirteen-minute full clear are different games and the design has to serve both.

| Elapsed | Eaten | SIZE reached | Chains | Median chain | 90th pct | Longest | Chain alive |
|---|---|---|---|---|---|---|---|
| 120 s | 281 | 1 | 17 | 12 | 36 | 59 | 30.5 % |
| 300 s | 1,767 | 4 | 43 | 26 | 111 | 232 | 39.8 % |
| 500 s | 5,153 | 5 | 75 | 34 | 205 | 343 | 42.1 % |
| 780 s (full route) | 9,261 | 7 | 123 | 47 | 181 | **528** | 44.1 % |

Mapped onto the owner's ladder, over the whole 780-second route — this is how
often each celebration would fire:

| Combo level | Threshold | Times crossed | Roughly |
|---|---|---|---|
| 1 | chain 2 | 116 | every 7 s |
| 2 | chain 10 | 103 | every 8 s |
| 3 | chain 15 | 98 | every 8 s |
| 4 | chain 25 | 82 | every 10 s |
| 5 | chain 50 | 60 | every 13 s |
| 6 | chain 100 | 37 | every 21 s |
| 7 | chain 350 | 1-2 | once or twice a full clear |
| 8 | chain 600 | 0 | never reached on this route |

Four conclusions, and each one lands on a design decision.

**A chain of 100 is routine, not a feat.** Thirty-seven crossings in thirteen
minutes, and eleven crossings of 200. Any celebration attached to the 100-mark
is a thing a player sees several times a minute, which is precisely why the
combo track gets a fast pulse from its own meter and never a screen banner.

**The owner's tail is well-calibrated, and the measurement is what says so.**
Chain 350 was reached once or twice across a complete clear and chain 600 never;
the single longest chain in thirteen minutes was 528. So the first "every 250"
step is exactly where a genuine feat sits, and the second one is at the edge of
possible. That is a good ladder. It also means a *named top level* — decision 2
below — would land naturally somewhere around the 600 mark, reachable by an
exceptional run and by nothing else.

**"Past 400 routinely" is not what the route shows.** The chain crossed 400
once in thirteen minutes and peaked at 528. Large chains are real and reachable;
they are not ordinary. The design should treat the 350+ steps as the rare tier
they measure as, and the recommendation in decision 2 rests on that.

**The early levels are constant and must cost nothing.** Levels 1 through 4
fire every seven to ten seconds from the first moments of a run. A meter tick
and a short sound; no particles, no screen space, no attention. This is the same
chatter-damping discipline `js/skins.js:425` already applies to eat events for
the same reason.

**The caveat, stated plainly:** this is a scripted validator route, not a human.
It never doubles back to farm a dense block and it spends its early legs
crossing open ground, so a deliberate player very likely holds longer chains
than these numbers show, particularly early. What could *not* be established is
the human distribution: there is no telemetry (deliberately — there is no
backend on the single-player path) and the playtest record in `playtests/`
captures UX findings, not chain data. The cheap fix ships with the feature: the
results screen (`js/ui/screens.js:148-161`) already exists and already knows the
run, so putting best combo on it turns every future playtest into a data point.
Cross-checking the route against a second scene is worthwhile too — Upper
Manhattan's Met excursion eats 721 blocks in 62 seconds
(`tools/validate.mjs:1087`, reasoning at `:1063-1070`), around 11.6 per second,
which is a denser feed than any leg of the Cambridge line.

## 20 moves ahead

### Next wants — what gets asked for within days of this shipping

1. **"What was my best combo?"** The moment a meter exists, the run's peak
   becomes a fact worth keeping. `hole.bestCombo` is already tracked
   (`js/voxelsim.js:2335`) and already thrown away at the end of every sandbox
   run — `recordSandboxResult` stores coins, size and elapsed only
   (`js/save.js:315-323`). Cheap to add, and it is the seam every belt and
   achievement hangs from.
2. **"Can I beat my last score?"** A displayed number invites comparison against
   the only opponent available offline: yesterday's self. Per-city bests are
   already stored and already rendered on the title screen
   (`js/ui/screens.js:104`), so the shape exists.
3. **"Can the phrases be different in each city?"** Cambridge's copy wanting to
   sound like Cambridge is a near-certain follow-up. The phrase ladder should
   therefore be *data*, keyed by fraction, with a per-scene override slot that is
   empty on day one.
4. **"Can I turn the shouting off?"** Someone will find it much. `reducedMotion`
   covers the movement but not the volume of the copy; the settings screen
   (`js/ui/screens.js:341`) is where that lands.
5. **"Score on the results screen too."** The results screen currently reports
   coins and percentage cleared and never mentions the score the run was
   actually accumulating.
6. **"Put it on the leaderboard."** The online package
   ([online-flywheel](../online-flywheel/00-objective-overview.md)) already
   specifies belts keyed on `longest_chain`. A combo meter that displays a
   different number from the one the belt is scored on would be a live bug the
   day both ship.

### Breaks at scale / edges — what concedes first, in order

1. **The single toast slot.** `js/ui/hud.js:45-49` has exactly one `#toast`
   element and one timer. A coin toast is 700 ms and a milestone toast is 2200 ms
   (`js/main.js:578-581`), so a coin picked up during a milestone *erases the
   milestone mid-sentence*. This is already true today with four milestones; the
   owner's ladder makes it more frequent. Any denser celebration schedule needs
   the announcement channel to become a small priority queue before it needs
   anything else.
2. **Attention, not frame time.** The hole is centre-screen and is the thing the
   player is watching. The failure mode of this package is not jank, it is a
   player who misses a collapse because a banner was over it. Every effect has a
   clear-space rule and the centre stays clear.
3. **Frame cost at high chain.** At 11+ eats per second, anything that allocates
   per eat is allocating ten-plus times a second forever. The meters must animate
   from a single persistent element whose properties change, never by creating
   and destroying nodes per event — the same discipline `js/skins.js:425` already
   calls "chatter damping" for the same reason.
4. **Small screens.** The HUD's left column is `min(330px, 46vw)`
   (`css/main.css:78`) and the right column already carries two 44 px buttons and
   the coin pill. A third meter competing for the top of a 390 px phone is where
   this layout runs out, and the answer is a smaller meter, not a smaller hole.
5. **Number magnitude.** A score that reaches five digits reads as an arcade
   score; one that sits at 300 reads as nothing. The Met excursion banks 3,680
   over 62 seconds *on today's multiplier* — under the owner's curve the same run
   is several times that, which is comfortable. But the display must be able to
   absorb a digit without reflowing the HUD, so the meter is sized for its
   maximum from the start rather than growing into its neighbours.

### Unlocks — what this opens

- **Every unbuilt reward system gets a surface.** Achievements, the 44 easter
  eggs, the 11 hidden glyphs and the belts all need somewhere to *land* on
  screen. This package builds the announcement channel they will all use. It
  does not build them. That distinction is the scope line, below.
- **A run acquires a shape.** Today a sandbox run is texture-uniform: it feels
  the same at 10 % as at 80 %. A staged phrase ladder gives it an arc — opening,
  middle, home stretch, finish — which is what makes a 90-second booth session
  memorable rather than merely pleasant.
- **The combo becomes teachable.** Nobody currently learns the combo system,
  because nothing shows it. A meter that visibly drains for 1.5 s teaches the
  window without a word of tutorial, and the moment players understand it, coin
  placement (`js/voxelsim.js:366-385`, and Cambridge's 18 bridging coins) becomes
  a strategy rather than scenery.

### Doors kept open vs. shut

**Kept open, deliberately:**

- **The phrase ladder is data.** An ordered list of `{ at, text, tier }`, read at
  runtime. A new phrase, a reworded phrase, or a per-city set is then an edit to
  a table rather than a code change — which matters because the copy is exactly
  the part the owner will want to iterate on, and he should never need an
  engineer to change a word.
- **Celebration tiers are named, not numbered.** Each track's effects are keyed
  by a tier name rather than by a hard-coded threshold, so re-tuning which
  threshold gets which volume is a data edit.
- **The multiplier curve is a table, not a formula.** The shipped `comboMult` is
  a closed-form expression, which is precisely why it could never express the
  owner's front-loaded shape. A threshold array can express both, and can be
  re-tuned after the first playtest without an algebra session.
- **The announcement queue takes a priority and a source.** Anything that ever
  wants to say something to the player — an achievement, an egg, a glyph, a belt
  change — arrives through one door with a rank. Built now for three tracks; free
  for everything after.
- **`bestCombo` and the run score are persisted.** Cheap now, and they are the
  raw material for every comparison, record and belt later.

**Shut, knowingly:**

- **No new dependency, no build step.** Hand-written CSS transitions and one
  `requestAnimationFrame`-driven meter, reusing the existing particle helpers
  (`js/voxelworld.js:1760`, `:1774`). This is not a preference; it is
  [ADR-0014](../../adr/0014-vendored-same-origin-runtime.md).
- **No canvas-based HUD rewrite.** The HUD is DOM and stays DOM. A canvas meter
  would render more prettily and would cost a second render surface, a second
  resize path and a second accessibility story for one bar and one ring.
- **Nothing in the centre of the screen except the consumption banner, and that
  one is transient.** The hole is the game.
- **No score in the campaign HUD.** The campaign (`js/sim.js`) has its own mass
  and its own results screen and is not what was asked about. The meters are
  scoped to `body.mode-sandbox` the way the existing sandbox hierarchy rules
  already are (`css/main.css:138-150`).

## Scope line (pencil test)

Ship the pencil with its eraser and sharpener; never the inkwell and parchment.

### Built silently — completers and precursors

Each of these shares the ask's purpose, the thing is incomplete or wrong without
it, and each is cheap, co-located and removable.

- **The multiplier readout is part of "show the score."** A score you cannot
  explain is a number. The meter shows the count *and* what it is currently
  worth, because the second one is the reason the first one matters.
- **Fixing the combo label's lie.** `js/ui/hud.js:104` prints a number that is
  not the multiplier. Shipping a beautiful meter on top of that arithmetic would
  be shipping the defect in a nicer frame.
- **The announcement priority queue.** Denser milestones plus the existing coin
  toasts means collisions; the collision already happens today. Fixing the
  channel is part of delivering the thing that uses it.
- **`bestCombo` and final score on the results screen and in the save.** The run
  ends and the number vanishes otherwise, which makes every celebration during
  the run retroactively meaningless.
- **Reduced-motion variants of all three vocabularies.** Not optional and not a
  follow-up; the setting exists and is honoured everywhere else.
- **The SIZE-ladder rebalance that the new curve requires.** Not a separate
  project. Changing the multiplier without it ships a broken game.

### Surfaced, not built — the pens

These are new nouns. Each gets a clean seam and a mention here, and no code.

- **Achievements, easter eggs, hidden glyphs, championship belts.** All designed
  elsewhere (`.wiki/features/cambridge-sandbox/04-easter-eggs-and-achievements.md`,
  `.wiki/features/online-flywheel/06-belts-and-achievements.md`), all unbuilt,
  all out of scope here. The seam they get is the announcement queue and the
  persisted `bestCombo`.
- **Per-city phrase sets.** The data shape allows it; day one ships one set.
- **A score multiplier the player can buy in the shop.** The shop exists
  (`js/ui/screens.js:163`) and already sells a `+5% Growth` item, so the idea is
  one step away. Not now.
- **Online score comparison.** [online-flywheel](../online-flywheel/) owns it.
- **A campaign-mode score display.** Different mode, different sim, not asked
  for.

## Decisions that are the owner's

Three, all about what a player feels. Recommendations attached; none of them
should be built until he has said which way.

**1. When you are holding a huge combo, should the hole itself grow faster
because of it, or should the combo only be worth a bigger number?**

Today the combo quietly makes the hole grow faster and shows you nothing. The
new curve makes that effect several times stronger. Growth-linked means a great
run visibly snowballs — you get big fast and the city starts falling in sheets.
Points-only means a great run is worth bragging about but plays at the same pace
as a sloppy one, and the pacing of every city stays exactly as it is today.

*Recommendation: growth-linked, but tuned so a strong run finishes a city
noticeably sooner rather than trivially sooner.* Snowballing is the fantasy the
game is already built around, and a combo that changes nothing you can see is
the problem this whole package exists to fix. The tuning is ours.

**2. Past the first few hundred, should the combo meter keep handing out a new
level roughly every 250 forever, or should it top out at a final level that a
great run reaches and then holds?**

Forever means there is always one more rung, and a truly monstrous run keeps
being rewarded. A top level means the ladder has a summit with a name on it —
something a player can say they reached, and something a booth visitor can be
told about in one sentence.

*Recommendation: a named top level.* An unbounded ladder has no story in it, and
at a booth "get to MAX" is a goal a stranger can understand in three seconds
while an unbounded number is just a number going up. The measurement above also
says where the summit belongs: the longest chain in a complete thirteen-minute
clear was 528, so a top level around the 600 mark is reachable by an exceptional
run and by nothing else — which is exactly what a summit should be.

**3. Should each new combo level be worth a whole extra helping of everything
you eat, or a smaller step?**

A whole extra helping is what he described, and it makes each level-up
unmistakable — the eating visibly speeds up. A smaller step keeps the top of the
ladder closer to the bottom, so a player who never gets past level 3 is not
playing a much weaker game than one who reaches level 8.

*Recommendation: the whole extra helping for the early, cheap levels, and keep
the option of easing the late ones after the first playtest.* Early levels are
where the "it's working" feeling has to land, and they are cheap enough that
being generous costs nothing. The late levels are rare enough that their size is
a tuning detail rather than a design one.

## Package contents

| Doc | What it is |
|---|---|
| **00-objective-overview.md** (this page) | The spine: what the ask really serves, the three effect vocabularies, the multiplier curve, the scope line, and the three decisions that are the owner's. |
| [01-prd.md](01-prd.md) | The normative spec: invariant, functional requirements, the data shapes, the surfaces, performance and accessibility budgets, phasing. |
| [02-requirements.md](02-requirements.md) | User stories with Given/When/Then and EARS criteria. The contract verification checks against. |

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — the sim
  emits events, the renderer dresses them. Every effect here is dressing.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — no `Math.random()` in the sim. Celebration randomness is render-side only.
- [ADR-0005 shared brand layer](../../adr/0005-shared-brand-layer.md) — the
  meters are the existing visual language applied, not a new one invented.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no new dependency, nothing fetched from a third-party host.
- `.wiki/visual-direction.md` — the world-rendering roadmap. This package is
  screen chrome and does not move any of its stages.
