---
covers:
  - "js/voxelscene-*.js"
---
# Cambridge sandbox — the package index

A sixth voxel sandbox scene, centred on **2 Canal Park** — the building HubSpot
leases in East Cambridge — and the debut vehicle for a new voxel authoring
vocabulary. It is being made for an audience that works in the building and will
play it at UNBOUND, which is why the research is separated from the design and
why every factual claim carries a confidence marker.

**Status: the map is complete and playable.** ADR-0013's engine change, the
primitive layer (`js/voxelforms.js`), the coin-anchor and chain changes, the new
validator probes and all ten districts are written and committed —
`js/voxelscene-cambridge.js` is about 11,000 lines today — and the scene is
registered, so it loads from the free-play picker. `node tools/validate.mjs`
reaches `ALL PASS`: 72,943 blocks against the under-75,000 target, dead ground
zero, and the scripted excursion reaching SIZE 7. Still ahead: the hidden
content, glyphs and achievements of Phase 7, and the Phase 8 sign-off. Phase 7's
achievement and belt rows remain blocked on the online-Flywheel backend, which is
an inherited blocker rather than a Cambridge one.

| Doc | What it is | Why you'd open it |
|---|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What the level actually serves, what the vocabulary unlocks, what it forecloses, and whether the two ship together. | Read this first if you are deciding *whether* and *in what order*, not *what*. |
| [01-voxel-primitive-vocabulary.md](01-voxel-primitive-vocabulary.md) | The capability audit and the toolkit: twelve named primitives, the cost model traced line by line, the two-hand rule, the ~9.7 m grade ceiling, the one-bite hazard, and the measurement plan. *Built — `js/voxelforms.js` ships all twelve.* | Every "can a block do that?" question is answered here, with a file and a line. |
| [02-cambridge-reference.md](02-cambridge-reference.md) | The verified reference brief: the two HubSpot buildings, the measured street bearings, a 25-row scale/offset table, neighbouring buildings, landmarks ranked by recognizability, palette, easter-egg seeds, sensitivities, and a list of what could **not** be established. *Reference — stable.* | Before you place anything real, check it here. An item marked Unverified stays Unverified until someone verifies it. |
| [03-level-design.md](03-level-design.md) | The level design proper: map extent, the scale law, ten districts with their block estimates, the two hero buildings member by member, the landmark shelf, the play route, the ≤15 m density floors, validator compliance, and the authoring plan. *In use — all ten districts built from it, and reconciled against the built tree.* | This is the build spec. It is the long one. |
| [04-easter-eggs-and-achievements.md](04-easter-eggs-and-achievements.md) | The catalogue of hidden things: what is hidden, where, what it rewards, and how it is found. *Designed, not yet built — Phase 7.* | 03 reserves the slots and states the placement principle; 04 fills them. |
| [05-build-tasks.md](05-build-tasks.md) | The dependency-ordered task list an implementer works from: nine phases from the ADR-0013 decision gate through engine change, primitive layer, district-by-district authoring, hidden content, to validator sign-off. *The live tracker — Phases 0–6 done, Phase 7 next.* | When the question is "what do I do next". |
| [../../adr/0013-anisotropic-voxel-primitives.md](../../adr/0013-anisotropic-voxel-primitives.md) | **ADR-0013** — a block becomes an axis-aligned *box*, not a cube, and nothing else. The decision, its four behavioural consequences, and the four alternatives that were refused. *Accepted and shipped.* | The one file to read if you only read one, and the one to argue with if you disagree. |

## The three ideas that govern everything else

**Skin, not fill.** A solid piece replaces a *surface*, never an *interior* — a
floor is a 0.25 m plate, not a 1 m solid cube — because fine-cell cost is linear
in occupied volume, not in block count.

**Block budget: aim to come in under 75,000.** That is a ceiling we would like
to stay beneath, not a quota to hit. Under is good, well under is better. If the
scene or a district runs over, that is the cue to look at which buildings could
be built more efficiently — not a reason to thin the map out. The per-district
numbers in `03` §4 are starting estimates to author against, not contracts, and
they turned out wrong in two directions: districts that built *buildings* to a
§4 list landed at 65–73% of it because the figures are cube-era, and districts
that had to add *ground* landed over because §4 never priced pavement. The
finished scene came in at 72,943. §4 now carries both corrections.

**Density is what we actually protect.** The thing we care about is that no part
of the map reads as empty, and that is checked directly:
`probeDistrictDensity` in `tools/validate.mjs` measures eatable pieces per m²
and inter-piece gap per district, coins excluded. Nothing in the validator looks
at the block count at all. That is why a lower total is safe: the thing worth
protecting has a check of its own, and it is a better one.
