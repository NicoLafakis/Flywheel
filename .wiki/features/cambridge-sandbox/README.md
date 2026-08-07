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

**Status: paperwork only.** Nothing in this package is built. No code has
changed.

| Doc | What it is | Why you'd open it |
|---|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What the level actually serves, what the vocabulary unlocks, what it forecloses, and whether the two ship together. | Read this first if you are deciding *whether* and *in what order*, not *what*. |
| [01-voxel-primitive-vocabulary.md](01-voxel-primitive-vocabulary.md) | The capability audit and the toolkit: twelve named primitives, the cost model traced line by line, the two-hand rule, the ~9.7 m grade ceiling, the one-bite hazard, and the measurement plan. **Final.** | Every "can a block do that?" question is answered here, with a file and a line. |
| [02-cambridge-reference.md](02-cambridge-reference.md) | The verified reference brief: the two HubSpot buildings, the measured street bearings, a 25-row scale/offset table, neighbouring buildings, landmarks ranked by recognizability, palette, easter-egg seeds, sensitivities, and a list of what could **not** be established. **Final.** | Before you place anything real, check it here. If it says Unverified, it stays unverified. |
| [03-level-design.md](03-level-design.md) | The level design proper: map extent, the scale law, ten districts with block budgets, the two hero buildings member by member, the landmark shelf, the play route, the ≤15 m density floors, validator compliance, and the authoring plan. | This is the build spec. It is the long one. |
| [04-easter-eggs-and-achievements.md](04-easter-eggs-and-achievements.md) | The catalogue of hidden things: what is hidden, where, what it rewards, and how it is found. *Owned by another author, written concurrently.* | 03 reserves the slots and states the placement principle; 04 fills them. |
| [05-build-tasks.md](05-build-tasks.md) | The dependency-ordered task list an implementer works from: nine phases from the ADR-0013 decision gate through engine change, primitive layer, district-by-district authoring, hidden content, to validator sign-off. **New.** | When the design is signed off and the question becomes "what do I do on Monday". |
| [../../adr/0013-anisotropic-voxel-primitives.md](../../adr/0013-anisotropic-voxel-primitives.md) | **ADR-0013** — a block becomes an axis-aligned *box*, not a cube, and nothing else. The decision, its four behavioural consequences, and the four alternatives that were refused. | The one file to read if you only read one, and the one to argue with if you disagree. |

**Reconciliation pass, 2026-08-07.** Coin placement (`sim.coinAnchors`) was
filed as a pen in `00` while `04`'s hidden-content design depended on it
throughout; it is now a prerequisite in `00`, `03` and `04` alike, with the
RNG-sequence and coin/chain constraints stated once and cross-referenced. A
counting error in `04`'s secret-achievement tally, an unclosed cross-doc flag
on the NECCO reveal, an arithmetic gap in the Davenport's block count, and an
unchecked grade-ceiling assumption on the Stata Center's base masses were also
found and fixed — see `05` §Phase 5/6 and the docs themselves for detail. A
minimal note was added at achievement #35 in
`../online-flywheel/06-belts-and-achievements.md` recording that Cambridge
makes it a five-of-six-cities achievement by name, deliberately left
unrenumbered.

**Second reconciliation pass, 2026-08-07.** A follow-up sweep against this
first pass's own edits found further drift, now fixed: `03` §6.4/§9.4 gained
an explicit colour-key exception (`HERO_SIGNAGE_GHOST`) so G3's ghost sprocket
doesn't trip `probeHeroIdentity`; the district budget table (`03` §4) grew
from 72,000 to **74,060 blocks** — 1,850 for six previously-unbudgeted
glyph/egg reserve items, plus a further 210 once `03` §8.3 was rewritten from
a four-mark placeholder to describe `04`'s actual five-item, ~930-piece
edge-band gallery — with `03` §8.2's density-floor figures recalculated to
match (2.28→2.34 median, 1.14→1.17 floor); `03` §9.2's `probeCellOwnership`
row was corrected to match `01` §5's actual claim (larger pieces make
overlaps easier to author but **no more expensive to detect**, not "no
cheaper"); seven achievement-number citations in `04` §1.3's glyph catalogue
were brought in line with `04` §3.3's table (G1→A68, G2→A91/A92, G3→A67,
G4→A80, G6→A90, G7→A79, G8→A77); and `05` gained three tasks the phase list
was missing — P6.12 (scene registration in `AUTHORED_SCENES`/`FREE_PLAY`,
without which the finished scene has no way to load), P7.2b (the `belt_taken`
registry field achievement 94 needs), and P7.4b (`CAMBRIDGE_COIN_ANCHORS`
authoring) — plus a softened Phase 3/Phase 4 independence claim, now
consistent between the section headers and the parallelization notes, that
names their one real join point (P4.3 depends on P3.4).

## The two sentences that govern everything else

**Skin, not fill.** A solid piece replaces a *surface*, never an *interior* — a
floor is a 0.25 m plate, not a 1 m solid cube — because fine-cell cost is linear
in occupied volume, not in block count.

**Spend it back.** Every block a primitive frees is budget owed back to the
scene, not banked. Cambridge lands in the same block neighbourhood as the
existing authored scenes and reads as *more* place for it. A falling block count
is a warning sign, not a result.
