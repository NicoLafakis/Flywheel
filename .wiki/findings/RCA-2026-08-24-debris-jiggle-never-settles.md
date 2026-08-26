# RCA 2026-08-24: fallen debris clips into itself and jiggles forever, dragging the frame rate

- **Date:** 2026-08-24
- **Reporter:** Nico, observed in real play, not level specific.
- **Severity:** High. It is the steady-state performance floor of every long session: STATUS.md's perf finding (sim cost tracks blocks concurrently in motion at exponent about 1.80) is this bug seen from the cost side.
- **Status:** FIXED 2026-08-25 (local tree, with the tornado/power-up rework's
  `RANKED_SIM_VERSION` 3 → 4 bump). Fixes 1 and 2 of §6 implemented in
  `js/voxelsim.js` (`_sepFloor` stamp in `_pushAxis`, jam-latch alternative
  eligibility in `_latchJammed`, grounded bodies never pushed below support in
  `_separate`/`_pushAxis`); optional fix 3 (grounded-test tolerance) NOT taken.
  Pinned by `tools/debris-settle.test.mjs` (standalone, opt-in): RED pre-fix
  (17 awake at +40 s, 162 at +60 s after the delayed secondary collapse, 1
  full-window jiggler), GREEN post-fix with final awake = 0 — matching §4's
  ablation-B numbers. Post-storm sustained sim cost measured 5.700 ms/step
  (145 awake, forever) pre-fix vs 0.002 ms/step (0 awake) post-fix on Tokyo.

## 1. Symptom

As reported: "when collapsed geometry hits the ground, fallen pieces clip into each other and never settle, they jiggle in place indefinitely; the jiggling drags the frame rate, and the moment the player eats the jiggling blocks performance snaps back."

Precise characterization (measured, Boston, seed `probe`, hole parked 20 s at (-96, -56) r 4.5 then retreated out of bounds): 60 s after all activity ends, 243 to 299 loose bodies are still awake and are simulated every step, permanently. The population never decays (flat at 243 through +160 s). Sub-populations measured at +60 s: 274 never-grounded bodies (most visually still, held in a millimetre-scale gravity/push-out micro-cycle; a minority ping-pong laterally with up to 2.0 m positional amplitude and zero velocity), 5 grounded-but-in-contact bodies (one pair pumping a visible ~1.0 m vertical oscillation), 20 grounded contact-free bodies (slow sliders that eventually settle). Awake-awake interpenetration deeper than 1 cm at rest: none (the clipping the player sees is the transient re-penetration inside each step, plus the pumping pair).

## 2. Root cause

**Confirmed** (reproduced deterministically in Node, mechanism proven by ablation: turning the predicate change on drops the permanent awake floor from 243 to 2, adding the secondary clamp reaches 0, and a later fresh collapse settles 70 to 0 under the ablations while the baseline plateaus forever).

The stationarity retirement predicate (ADR-0018, including the T-402 jam latch built specifically to retire stuck bodies) is structurally unable to examine the population it exists for. Every retirement path requires the body to be `_grounded` by the walk's own landing test, and that test (`b.y <= rest`, `js/voxelsim.js:4027`) has zero tolerance, while the contact separator that actually supports these bodies deliberately leaves a 2 percent separation skin (`pen *= 1.02`, `js/voxelsim.js:4551`). A body resting on a static surface via the separator therefore sits a fraction of a millimetre above the support height the landing test computes (measured on body 3319: rest = 1.5, y = 1.5003), is never `_grounded`, and so is ineligible for the walk's sleep path (`js/voxelsim.js:4075`), the jam latch (`js/voxelsim.js:4205`), and `_capDebris` (`js/voxelsim.js:4276`) alike. It is then simulated forever: gravity re-penetrates it each step, the separator pushes it back out with the skin, and the cycle reproduces itself. The root is a design contradiction between two subsystems: T-402 chose to make the jam latch "strictly more conservative than the walk's own sleep path" by reusing the walk's grounded eligibility, but the walk's grounded flag derives from support probes and a tolerance-free snap test that cannot see support provided by the separation solver, which is exactly how a wedged body is supported.

A secondary, independently proven injector produces the visibly violent jiggle: `_pushAxis` applies its full-penetration correction downward through a grounded body when a fast body sits embedded above it (fast bodies are excluded from the movable set at `js/voxelsim.js:4309`, so the slow lower body absorbs the entire correction, and the `upBlocked` gate direction means the resolution axis is minus y). The lower body is shoved below its own support, the next step's ground snap and the partner's fall re-create the overlap, and the pair pumps a ~1 m vertical cycle indefinitely (measured pair 3861/4298: per-step downward pushes growing 0.26 to 0.65 m, body y driven from +0.50 to -0.16, i.e. through the floor).

## 3. Causal chain

- **Trigger:** any collapse that leaves debris wedged against standing structure or stacked coincident with other debris, i.e. supported by the contact solver rather than by a clean landing snap. Every real play session produces these.
- **Proximate cause (mechanism A, the population):** grounded is false forever for separator-supported bodies. Chain for traced body 3319: `_topAt` returns the column max (9 m, the wall in the same column), rejected by the pre-move-base gate at `js/voxelsim.js:3986`; `_supportBelow` correctly returns the footing top (1.0), so rest = 1.5; but the separator skin left y at 1.5003, so `b.y <= rest` fails by 0.3 mm (`js/voxelsim.js:4024-4035`). Not grounded means `_wantSleep` is never set (`js/voxelsim.js:4075-4081`), jam eligibility fails on `_groundT !== this.time || !b._grounded` (`js/voxelsim.js:4205-4208`), and the debris cap skips it (`js/voxelsim.js:4276`). The body re-penetrates under gravity by 1.4 to 1.9 cm and is ejected each step (trace: alternating `axis=y+ pen=0.0142/0.0192` pushes from static 3050, forever); the vy reflection at `js/voxelsim.js:3998` participates in the cycle (post-step vy alternates 0 and +0.292). Post-solve position is stable to within one ULP for most of this population, which is precisely what the jam latch was built to retire and is never allowed to test.
- **Proximate cause (mechanism B, the visible jiggle):** full-pen minus-y positional correction applied to a grounded body (`js/voxelsim.js:4540-4553` via `_separate` `js/voxelsim.js:4509-4538`), partner made immovable by the speed filter at `js/voxelsim.js:4309`. Position moves far beyond JAM_EPS (1e-3, `js/voxelsim.js:373`) every step, so no predicate can catch the pair while the pump runs, and `_inContact` blocks the normal sleep commit (`js/voxelsim.js:4104`).
- **Root cause:** the ADR-0018/T-402 decision to gate all retirement on the walk's `_grounded` flag, combined with the separator's 1.02 skin making that flag unreachable for solver-supported bodies. Two subsystems each locally correct, jointly deadlocked.
- **Contributing factors:** the tolerance asymmetry (the topHit probe allows 0.05 m at `js/voxelsim.js:3988`, the grounded snap test allows zero); fast-body exclusion from the movable set concentrating full corrections on the slow partner; `_capDebris` requiring `_grounded` so the device-tier lever also cannot shed exactly the population that grows; eating debris removes the bodies entirely, which is why performance "snaps back" the moment the player eats the pile.

## 4. Evidence log

Harnesses (throwaway, scratchpad only): `jiggle-repro.mjs` (population and amplitude survey), `jiggle-trace.mjs` (classification plus per-push trace of representative ids), `jiggle-ablate.mjs` / `jiggle-long.mjs` (ablation A/B counts over 160 s), plus two one-off probes (hole clamp check, support-term probe for id 3319). All on Boston, seed `probe`, `dt = 1/60`, default tier (contactBudget Infinity, debrisCap Infinity, 2 contact rounds, perfMode false). Node-only, deterministic, no rendering.

Key numbers:

- Baseline awake count every 10 s after the hole retreats: `20 20 20 20 141 299 243 243 ... 243` (the mid-run jump is a second, legitimate delayed collapse mid-map at about simT 70 s; its debris also never settles under baseline).
- Position-only stationarity latch (ablation A: retire on 30 steps within 1e-3 m per axis, keeping the `_budgetHold` exclusion, dropping the grounded requirement): `2 2 2 2 70 104 2 2 ... 2`.
- A plus grounded-body minus-y push clamp (ablation B): `0 0 0 0 70 100 1 0 ... 0`. The second collapse fully settles.
- Body 3319 support probe at +60 s: `_topAt` = 9 (rejected), `_supportBelow` = 1, rest = 1.5, y = 1.5003. No static overlap deeper than 0 at read time (skin holds it separated); per-step pushes `y+ pen 0.0142/0.0192` alternating, from the same static block, indefinitely.
- Pair 3861/4298 trace: `push b=3861 o=4298 axis=y- pen=0.9708 movO=true`, then partner turns immovable and pen grows 0.26 to 0.65 across steps while 3861's y runs +0.50 down to -0.16; measured window amplitude 0.995 m in y, `_inContact` true, jamSteps pinned at 1.

Falsified hypotheses (do not re-walk these):

- **Restitution (REST = 0.25, `js/voxelsim.js:4541`) as the injector.** Falsified for the dominant population: the lateral ping-pong bodies oscillate up to 2.0 m per window with velocity exactly 0; `_pushAxis` only reflects velocity above 1 m/s and zeroes it otherwise. The energy is positional (full-pen correction re-created by gravity), not restitutive.
- **contactBudget / debrisCap parking churn.** Both are Infinity at the default tier in the repro; `_budgetHold` count was 0. The bug is tier-independent.
- **Hole vacuum keeping piles churning.** Hole parked at (500, 500), outside the bounds rect (±96 / -124..92), radius eats nothing; population is flat at 243 for 100+ s regardless.
- **Bad harness hole state.** `hole.radius` is derived (a manual write is recomputed next step: 0.5 became 6.71), and the parked hole is out of bounds, so phase 2/3 measurements are free of hole influence. The +50 s awake spike was located at (-14..-19, 1.3, 30), a delayed secondary collapse of structure damaged in phase 1, i.e. fresh legitimate debris, which the ablated sims settle and the baseline does not.
- **Deep resting interpenetration.** Awake-awake penetration deeper than 1 cm at rest: zero pairs. The reported "clip into each other" is the per-step transient re-penetration plus mechanism B's pumping pair, not a resting overlap.

Open micro-detail (does not affect the verdict): the exact per-step kinematics of mechanism A's two-step limit cycle (which of the vy writers produces the observed alternating +0.292) was not fully attributed; the participating sites are the gravity integration at `js/voxelsim.js:3954`, the reflection at 3998, and `_pushAxis` velocity handling at 4554-4556.

## 5. Blast radius and siblings

- Every scene, every session with collapses. This is the standing cost floor behind STATUS.md's "cost tracks blocks in motion, exponent 1.80" finding and RCA-2026-08-11's superlinear debris churn; T-402 fixed the grounded-and-jammed sub-case and left the never-grounded case, which Boston shows is the larger population (274 of 299).
- Sibling of the same pattern, same file: `_capDebris` eligibility requires `_grounded` (`js/voxelsim.js:4276`), so the device-tier "settle sooner" lever cannot touch never-grounded bodies either; on capped tiers the uncappable population is exactly the one that accumulates.
- Sibling: the chunk landing path uses the same probe pair (`js/voxelsim.js:4082` area uses `_supportBelow` with the same pre-move-base gate); no defect measured there in this investigation, but any fix that adds grounding tolerance should re-run chunk landing checks.
- Mechanism B's enabling filter (`js/voxelsim.js:4309`, fast bodies immovable) is also what makes "fast rain" cheap; the fix must not re-admit airborne rain into the O(n squared) pair phase.

## 6. Fix specification (for the implementer; not implemented here)

All changes in `js/voxelsim.js`. Physics outcomes change (retirement timing and pumped-pair positions), so bump `RANKED_SIM_VERSION` (currently 3, `js/voxelsim.js:659`) and expect validator eat-count gates to shift; re-baseline them by measurement, not by loosening.

1. **Primary: make the jam latch position-proof instead of grounded-proof.** In `_pushAxis`, when a body receives a plus-y positional correction from a non-movable partner (`axis === 'y' && sign > 0 && !movableO`), stamp `b._sepFloor = this.time` (this is the solver's own support evidence; the `_scFloorHit`/`_restLoose` machinery at `js/voxelsim.js:4575-4578` is the pattern to extend). In `_latchJammed` (`js/voxelsim.js:4183`), extend eligibility: a body qualifies either by the existing grounded rule or by `b._sepFloor === this.time` (supported by the solver this step), keeping the `_budgetHold` exclusion exactly as is (parked bodies satisfy stillness by construction and must never retire, see the T-402 comment at `js/voxelsim.js:4194-4199`) and keeping the low-speed gate. The JAM_EPS/JAM_STEPS position test then does the real work; measured, this retires the 274-body population (243 awake to 2). `_sleepSupport = b.y - b.sy / 2` as the latch already does; the existing `_sleepers` column wake (`js/voxelsim.js:3459-3488`) covers support removal the same way it does for T-402 retirees. Do not retire bodies with neither grounded nor `_sepFloor` evidence: a hovering body must stay awake.
2. **Secondary: never push a grounded body below its support.** In `_pushAxis` (or `_separate` before axis choice), when `axis === 'y' && sign < 0` and `b._grounded`, do not apply the positional correction to `b`; give the movable partner the full correction if there is one, otherwise resolve on the best lateral axis. Measured with fix 1 in place, this takes the residual pumped pairs from 2 to 0 and lets fresh collapses settle to zero. Take care to preserve `_inContact` stamping so the pair cannot sleep mid-overlap before it actually separates.
3. **Optional hardening, needs its own measurement:** add a small tolerance to the grounded test (`b.y <= rest + 0.01` at `js/voxelsim.js:4027`) so the 1.02 skin residue cannot defeat grounding. Not ablation-tested in this investigation; if adopted, verify the tip/repose branches (`js/voxelsim.js:4039-4082`) still behave and eat counts stay within gates.

**Regression test (write it first, TDD):** new opt-in validator section (run via `FW_VALIDATE_SECTIONS`, keep it out of any default full run): Boston, seed `probe`, park the hole 20 s at (-96, -56) r 4.5, move it out of bounds, then assert (a) awake non-`_budgetHold` loose bodies decay to at most 5 within 40 s of quiet and never rise again except during a fresh collapse, and (b) no body remains awake for a full 300-step window with positional amplitude at or above 0.05 m. Both assertions are RED on the current tree (243 bodies, amplitudes up to 2.0 m) and GREEN under the ablations, so they pin exactly this defect class. Runtime is about one minute in Node.

## 7. Prevention

The class here is: a retirement/settling predicate whose eligibility precondition is computed by a different subsystem than the one holding the body in place. Any "prove it is stationary" path must be satisfiable by a stationary body no matter which subsystem supports it; when a solver provides support, the predicate must consume the solver's own evidence (a stamp set at the push site), never a parallel probe that can disagree by a skin factor. Concretely: whenever a new support or correction path is added to the contact code, extend the settle-decay validator section above and re-run it; it is cheap, deterministic, and it fails on exactly this deadlock shape. This also closes the standing perf finding's mechanism rather than tuning around it, using the existing validator, no new tooling.
