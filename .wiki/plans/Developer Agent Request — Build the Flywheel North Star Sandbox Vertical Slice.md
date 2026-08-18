# Developer Agent Request — Build the Flywheel North Star Sandbox Vertical Slice

Implement a new, fully playable experimental sandbox vertical slice in the Flywheel repository that demonstrates this creative North Star:

> **Flywheel is a tiny, mischievous storybook world about a little creature that eats cities, collects their stories, and accidentally discovers how to get the world moving again.**

The player fantasy is:

**Eat everything.  
Find everything.  
Keep everything.  
Discover why.**

This is not a planning exercise. Inspect the current repository, architecture, wiki, status, tests, sandbox implementation, rendering system, skin system, power-up system, save model, UI, audio system, and current visual language, then implement the vertical slice end-to-end.

The goal is to produce one sandbox that lets us experience what Flywheel would feel like if this North Star were the actual game rather than simply a lore document.

## 1. Do Not Rewrite the Existing Game

Preserve the existing game, cities, campaign, multiplayer, boards, economy, ranked play, current The Lab, and progression.

Create a **separate experimental sandbox**.

Recommended internal scene ID:

`storybook`

Recommended player-facing identity:

**THE LITTLE CITY**  
**GET THINGS MOVING**

This experimental scene must not:

- alter the city progression ladder;
- count toward city unlock requirements;
- count toward challenge completion;
- change ranked modes;
- change multiplayer balance;
- alter existing city payouts;
- replace The Lab;
- require backend connectivity;
- break offline play.

Give it an obvious **CONCEPT** or **EXPERIMENTAL** entry point from the Free Play experience.

The exact UI implementation should follow the existing Flywheel design system rather than creating a parallel application shell.

## 2. Story Premise

The Little City has stopped.

No trains move.

No signs swing.

No clocks tick.

No fountains run.

No little machines turn.

Sprocket wakes up beside a tiny workshop with almost no memory of what it is supposed to do.

The only clue is a simple instruction associated with the workshop:

**TAKE IT IN.  
KEEP IT SAFE.  
GET IT MOVING.**

Do not explain all of this through exposition.

The player should understand the story primarily by playing.

Sprocket initially appears to be destroying things by swallowing them.

Very early in the run, reveal that swallowed things are actually being **kept**.

They are appearing as tiny collected memories/objects inside Sprocket's Workshop.

The emotional reinterpretation is:

**Sprocket doesn't erase things. Sprocket takes them with it.**

The Little City itself can therefore be dismantled while its story is gradually reconstructed inside the Workshop.

By the end of the sandbox, the Workshop contains a charming miniature memory of the city the player just consumed.

## 3. Sprocket Must Become a Character

For this sandbox, the player's hole is not merely a hole.

It is **Sprocket**.

Do this without compromising gameplay readability.

Respect the existing skin-system rule that the void must remain clearly visible and readable.

Add subtle expressive character features around the rim.

Minimum emotional states:

- idle blink;
- curious;
- excited when a newly edible object is nearby;
- determined when facing something too large;
- delighted after discovering a secret;
- dizzy or overwhelmed after an enormous combo;
- proud after completing a collection;
- sleepy/relaxed during the ending.

Do not make Sprocket obnoxious or constantly animated.

Think expressive desk-toy character rather than children's television mascot.

Sprocket should communicate primarily through animation, timing, body language, small sounds, and visual reactions rather than dialogue.

The player should be able to form an emotional impression of Sprocket within the first 60 seconds.

## 4. Change the Aesthetic Target for This Sandbox

The visual target is:

**premium miniature toy world + architectural model + modern picture-book charm.**

Not photorealism.

Not retro.

Not pixel art.

Not generic low-poly prototype art.

Not childish candy-land.

The world should feel like something an adult might genuinely want sitting on their desk.

Prioritize:

- chunky recognizable silhouettes;
- slightly exaggerated proportions;
- rounded/soft visual rhythms where technically reasonable;
- miniature trees;
- tiny storefronts;
- benches;
- awnings;
- rooftop details;
- signs;
- bicycles;
- tiny vehicles;
- construction details;
- roof gardens;
- café furniture;
- mailboxes;
- traffic furniture;
- amusing tiny environmental props;
- small moving details;
- visual density at close range.

There should frequently be something that makes the player think:

**“Oh, look at that little thing.”**

Use the existing voxel primitives, anisotropic forms, procedural surfaces, instanced rendering and rendering infrastructure aggressively before introducing a new dependency.

## 5. Design The Little City as Five Compact Districts

Build a compact sandbox suitable for approximately a 3–5 minute exploratory run.

Do not optimize for geographic realism.

Optimize for density, readability, personality and discovery.

Suggested districts:

### A. The Workshop

Sprocket's home.

The player starts here.

Include:

- a little workbench;
- shelves;
- empty display spaces;
- a miniature diorama table;
- gears/flywheels/mechanical clutter;
- six empty homes/perches for Momentum Friends;
- visible empty collection spaces.

The Workshop should immediately create the question:

**“What goes in all those empty spaces?”**

The Workshop itself should be protected/non-edible where necessary.

### B. Market Street

Dense small-object paradise.

Include recognizable cute things such as:

- café;
- produce stand;
- bakery;
- hot dog/cart equivalent;
- delivery vehicle;
- umbrellas;
- bicycles;
- sidewalk tables;
- flower boxes;
- little signs;
- crates;
- street trees.

This should be the strongest early-game swallowing area.

### C. Pocket Park

A calmer area with:

- tiny pond or fountain;
- bridge;
- benches;
- picnic scene;
- hidden garden;
- unusual trees;
- birds or bird-like environmental storytelling;
- one ridiculous secret.

This district should make the sandbox feel cozy rather than purely destructive.

### D. Office Row

A playful professional/city district.

Include understated jokes that professional marketers will recognize while remaining funny or visually interesting to everyone else.

Examples:

- billboard: **MAKE THE LOGO BIGGER**
- a stack/object labeled conceptually as `FINAL_FINAL_v8`
- meeting room themed around **QUICK CALL**
- a literal funnel somewhere in the environment
- a tiny “ALIGNMENT” construction zone
- a mysterious golden lead/MQL-style object
- absurdly overcomplicated presentation wall
- abandoned QR-style environmental mark
- tiny notification machine

Do not turn the entire game into a marketing parody.

These are secondary-layer jokes.

Someone outside marketing should still enjoy Office Row.

Someone inside marketing should occasionally say, “Oh no.”

### E. The Clockworks

The largest structures and final destination.

Include:

- clock tower;
- small rail terminus;
- mechanical factory/workshop;
- large central flywheel;
- tall landmark suitable for the final SIZE progression;
- visually obvious machinery that is initially completely motionless.

This district contains the final narrative reveal.

## 6. The World Must Visibly Regain Momentum

At the beginning, almost everything is still.

As the player discovers and completes things, motion gradually returns to the world.

Implement approximately five restoration beats.

Examples:

1. café sign begins swinging;
2. fountain begins running;
3. little clock begins ticking;
4. train starts moving;
5. central Flywheel starts turning.

These events should occur because of player progress/discovery rather than arbitrary timers.

Use existing deterministic mover/rendering systems where appropriate.

This is essential.

The player must physically see:

**My actions made something happen to this world.**

## 7. Implement “Discover → Swallow → Keep”

Eating alone is not enough.

Create a lightweight collectible/story layer for this sandbox.

Suggested collection taxonomy:

### Things
Approximately 18–24 distinctive ordinary objects.

Examples:

- tiny taxi;
- mailbox;
- café chair;
- bicycle;
- water tank;
- park bench;
- delivery cart;
- street lamp;
- umbrella;
- newspaper box;
- rooftop planter;
- toy train car.

The first time a distinctive Thing is consumed, surface a tasteful discovery moment.

Do not interrupt play with a large modal every time.

### Stories
Approximately 5 environmental micro-stories.

Each must be discovered through the game's existing verb.

The rule is:

**Reveal beats placement.**

Examples:

- consume a storefront facade to reveal a tiny after-hours birthday setup;
- clear rooftop clutter to expose a miniature rooftop garden;
- swallow an office wall to reveal the world's longest “quick meeting”;
- uncover a hidden picnic;
- remove a construction shell to reveal something unexpectedly charming underneath.

A Story should be meaningful because the player uncovered it.

### Secrets
Approximately 5.

At least:

- one immediately funny secret;
- one marketer-specific secret;
- one visual/camera secret;
- one secret requiring unusual exploration;
- one genuinely mysterious lore secret.

### Legendary Find
Exactly one major hidden discovery.

This should hint that Sprocket is not the only Sprocket, or that The Little City is part of something much larger.

Do not fully explain the mystery.

## 8. Create the Pocket Collection / Workshop Payoff

This is one of the most important requirements.

Objects Sprocket discovers must appear to be **kept**, not deleted.

Implement a practical prototype of the Workshop collection.

It does not need literal one-to-one geometry for every swallowed voxel.

Proxy miniatures are acceptable.

The Workshop should visibly populate as the player discovers:

- Things;
- Stories;
- Secrets;
- Momentum Friends;
- the Legendary Find.

At minimum, revisiting the Workshop during the run should show that it has changed.

The results/ending should showcase the completed or partially completed collection.

Ideal ending:

Camera returns to the Workshop.

The previously empty diorama table now contains a tiny reconstructed memory of The Little City assembled from the player's discoveries.

Little pieces move.

The clock ticks.

The tiny train runs.

Momentum Friends inhabit the scene.

Sprocket watches it.

The central miniature Flywheel begins to turn.

Do not require the player to have found 100% of optional content for the narrative ending.

Missing collectibles should leave visibly empty spaces, encouraging another run.

This is how destruction becomes collection.

## 9. Turn Existing Power-Ups Into Momentum Friends for This Sandbox

Do not change their underlying simulation effects.

For `storybook`, create an alternate presentation layer mapping the existing effects into six small original creatures.

Suggested mappings:

### GULP
Maps to Vortex Vacuum.

Personality: hungry, round, vacuum-like.

### ZIP
Maps to Turbo Overdrive.

Personality: hyperactive, fast, difficult to keep still.

### BIGGIE
Maps to Titan Surge.

Personality: tiny creature with inexplicably enormous confidence.

### RUMBLE
Maps to Fault Line Rupture.

Personality: sleepy rock creature that creates chaos when startled.

### LOOP
Maps to Chain Frenzy.

Personality: continuously chases its own tail/orbit.

### NAP
Maps to Chrono Freeze.

Personality: sleepy cold puff that makes everything stop.

Names can be improved during implementation if something materially better emerges.

Important:

For this sandbox, do **not** use the existing Pokémon/Dragon Ball/anime imitation vocabulary or presentation.

Create original Flywheel interaction language.

When a Friend appears, it should feel like:

**“Oh! What is that?”**

When caught:

**“I found a little friend.”**

Keep the presentation short enough that collecting one feels delightful instead of interruptive.

Once discovered, its home/perch in the Workshop becomes occupied.

## 10. Original Flywheel Visual Language Only

This sandbox should intentionally test whether Flywheel can stand on its own identity.

Do not use presentation that deliberately evokes:

- Pokémon;
- Dragon Ball;
- anime title cards;
- kanji super-move language;
- recognizable UI treatment from another game/IP.

Create original Flywheel equivalents.

Warm.

Playful.

Kinetic.

Polished.

Small.

Specific.

Avoid religious and political content.

## 11. Make the Environment React to Sprocket

Add small contextual reactions.

Examples:

- a sign wobbles when Sprocket passes;
- birds scatter;
- loose papers flutter;
- tiny lights blink;
- awnings bounce;
- a train bell reacts;
- a large locked object subtly reacts when Sprocket is still too small;
- collection shelves give a tiny acknowledgement when something new arrives.

Prefer lots of inexpensive micro-reactions over several expensive cinematics.

## 12. Add a Lightweight Storybook HUD Layer

Do not redesign all Flywheel UI.

For this sandbox, adapt the HUD so it communicates:

- current SIZE;
- overall clear/progression;
- Things found;
- Stories found;
- Secrets found;
- Friends found;
- current restoration/momentum state.

Use concise language.

Do not cover the screen in counters.

Consider a tiny book/shelf icon that opens the collection state if appropriate.

A player should always be able to ignore the lore layer and enjoy swallowing things.

## 13. Narrative Text Must Be Extremely Light

No lengthy dialogue boxes.

No lore dumps.

No narrator constantly talking.

Use tiny pieces of writing.

Examples of appropriate scale:

**The Little City stopped.**

**Sprocket didn't.**

or

**FOUND: Tiny Taxi**  
*It had somewhere important to be.*

or

**STORY FOUND: The Last Meeting**  
*It was supposed to be fifteen minutes.*

That is approximately the maximum tonal density.

Let environmental storytelling do most of the work.

## 14. End With a Genuine “Aww” Moment

The sandbox should not finish merely with:

`100% CLEARED`

It needs an emotional ending.

After meaningful narrative completion:

- return to the Workshop;
- show the collected Little City;
- populate discovered Friends;
- activate movement;
- have Sprocket react;
- allow one quiet beat;
- then show results.

The feeling should be:

**“Oh. I didn't destroy it. I kept it.”**

That is the entire vertical slice in one moment.

## 15. Full-Clear Players Still Need Their Satisfaction

Do not weaken the existing satisfying destruction simulation.

The player should still:

- begin tiny;
- grow dramatically;
- undermine structures;
- collapse buildings;
- swallow absurdly large structures;
- trigger satisfying physics;
- chase high combos;
- reach ridiculous scale.

We are adding emotional reasons around the loop, not replacing the loop.

The physical destruction should remain one of the star attractions.

## 16. Art / Asset Policy

Do not block this prototype waiting for bespoke art.

First attempt the entire vertical slice using:

- existing voxel geometry;
- `voxelkit`;
- `voxelforms`;
- Three.js primitives;
- canvas-generated textures;
- procedural icons;
- existing audio where stylistically appropriate;
- new WebAudio-generated micro-SFX where appropriate;
- simple geometry-based character features;
- instanced renderer-side decorative meshes.

External assets are allowed when they create a large improvement at low technical cost.

For externally sourced art:

- prefer CC0/public-domain assets;
- download assets into the project rather than introducing runtime asset-service dependencies;
- document the source and license;
- do not introduce copyrighted franchise content;
- simulation-relevant objects still need proper deterministic voxel/block representation;
- renderer-only art must never become authoritative gameplay state.

Potential CC0 sources worth evaluating if useful:

- Kenney City Kit — Suburban;
- Kenney City Kit — Commercial;
- Kenney City Kit — Roads;
- Kenney Mini Characters;
- Kenney Mini Market;
- Quaternius Downtown City MegaKit;
- Quaternius Simple/Nature/vehicle assets where appropriate;
- Poly Haven only where a texture/HDRI materially improves presentation.

Do not integrate an external asset merely because it exists.

A coherent procedural Flywheel art direction is preferable to an obvious mixture of asset packs.

## 17. No New Framework Is Required

Remain compatible with Flywheel's current browser/ES-module/Three.js architecture unless repository inspection proves a particular small addition is clearly beneficial.

Do not migrate the project to React, Unity, Godot, a bundler, or another engine for this experiment.

Do not add a large dependency stack.

This prototype is specifically intended to determine how far the current engine can be pushed creatively.

## 18. Determinism and Architecture Remain Non-Negotiable

Follow `AGENTS.md`.

Strict TDD.

Tests first.

No `Math.random()` in `js/`.

All gameplay randomness uses the existing seeded RNG.

Simulation remains pure.

Three.js and DOM state remain renderer/UI concerns.

Gameplay changes occur through the fixed-step simulation contract.

External decorative animation may be deterministic from sim time.

Any persistent collection state must follow the existing save-schema/version/migration rules.

Do not compromise ranked or server replay guarantees.

## 19. Prototype Persistence

Persist `storybook` discoveries between sessions if it can be done cleanly.

Persist at least:

- Things discovered;
- Stories discovered;
- Secrets discovered;
- Momentum Friends discovered;
- Legendary Find status;
- best completion percentage.

Use the existing save system correctly.

Bump/migrate the save schema if required.

If persistence introduces disproportionate risk, the run must still fully demonstrate the mechanic without it, but do not silently omit it: document the tradeoff.

## 20. Required Automated Coverage

Before implementation, create failing tests for the new behavior.

Cover at minimum:

- scene builds deterministically;
- no `Math.random()`;
- scene is spawn-stable;
- no unintended unsupported blocks at time zero;
- all required progression sizes are reachable;
- narrative-critical objects are reachable/consumable;
- all five Story reveals can fire;
- all six Momentum Friends can appear and be collected;
- restoration beats fire in deterministic order;
- collection counts cannot double-count;
- Legendary Find can be discovered;
- Workshop state reflects discoveries;
- sandbox can reach its intended narrative completion;
- full-clear remains possible;
- existing city catalog progression is unchanged;
- existing challenges do not suddenly require `storybook`;
- existing ranked modes are unchanged;
- existing validation remains green.

Run all relevant focused tests and the full validator.

The final state must produce `ALL PASS` where required by the repository.

## 21. Performance

Target the same practical performance standards as Flywheel.

Use:

- instancing;
- shared geometry;
- shared materials;
- cached assets;
- bounded particles;
- inexpensive deterministic animation;
- renderer-only decorative effects where appropriate.

Do not solve “cute” by adding hundreds of independent draw calls.

The world should feel detailed because of smart composition and repeated systems.

## 22. Documentation

Update:

- `STATUS.md`;
- the relevant voxel/UI/render wiki pages;
- any new Storybook sandbox module documentation;
- tests/tooling docs where necessary.

Add a short concept page explaining the experiment and the design rules learned from it.

Document which parts are intentionally scoped only to `storybook`.

## 23. Developer Judgment Is Encouraged

The exact examples above are not sacred.

If repository inspection reveals a better implementation that satisfies the emotional objective with less risk or a significantly better player experience, use it.

The non-negotiable outcomes are:

1. **Sprocket feels alive.**
2. **The city feels adorable and worth inspecting.**
3. **Swallowing reveals things rather than merely removing things.**
4. **The player discovers that swallowed objects are being kept.**
5. **There are small original characters to care about.**
6. **The world visibly regains motion because of the player.**
7. **Professional marketers occasionally encounter jokes that feel uncannily specific to them.**
8. **The experience has an emotional ending.**
9. **The existing destruction loop remains deeply satisfying.**
10. **The prototype feels like Flywheel rather than references to other games.**

## 24. Definition of Done

The work is not complete because the map loads.

It is complete when a first-time player can enter this experimental sandbox with no explanation and experience this sequence:

**“Cute little city.”**

→ **“Oh, the hole has a personality.”**

→ **“What is that little creature?”**

→ **“Wait, that was hidden under there.”**

→ **“LOL, make the logo bigger.”**

→ **“The things I ate are showing up in the Workshop.”**

→ **“The city is starting to move.”**

→ **“I need to know what I'm missing.”**

→ **“Ohhh. Sprocket was saving it.”**

That emotional sequence is the acceptance test.

Build the smallest technically sound version of the sandbox capable of delivering it convincingly, then polish that vertical slice rather than broadening scope.