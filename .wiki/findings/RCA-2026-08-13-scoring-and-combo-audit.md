# Scoring and combo audit: Flywheel

> **Status: findings accepted 2026-08-13, fixes tracked as T-301..T-312 in**
> [`features/timed-runs-and-full-clear/13-tasks.md`](../features/timed-runs-and-full-clear/13-tasks.md).
> Commissioned by the owner's instruction to "ensure that scores are adding up
> properly both single and multiplayer" and to make the multiplier show an
> accurate value.
>
> **The one that stops a release:** ranked runs can publish a different number
> than the player saw, with no cheating, no pause and no network condition — the
> player only has to have used a setting the game offers (A5.1). The server never
> compares its computed score against the claimed one, so the divergence is
> silent by construction even though both numbers already sit in the same table
> row (A5.3).
>
> **The one that most likely prompted the instruction:** the arena decides the
> winner on raw mass and prints combo-multiplied points three lines away, so the
> reveal can read "YOU 3,400 PTS / RIVAL 1,900 PTS" above the headline "RIVAL
> TAKES THE CITY" (A6.4).
>
> **The multiplier is not broken; five readouts are mislabelled.** The true cap
> is 8x and no displayed multiplier can exceed it (B1, B3). But the visually
> dominant number on the HUD is an unlabelled chain count, the word `MAX` sits
> under a number that climbs forever, and two campaign readouts print a bare
> chain with a literal `x` in front of it — on a path whose own ladder caps at
> 3.0, overstating the real multiplier by up to 15.7x (B2 #4, #7).
>
> **A test that could never fail.** The validator assertion ADR-0015 calls load
> bearing compares `comboMult(c)` against that function's own inlined body, so it
> is a tautology that passes on any code including broken code (B5). Same class
> as the float-sum guard recorded in this repo's process notes: a check written
> in the shape of the thing it audits proves nothing.
>
> Line numbers are HEAD numbers at `ef80d83`. The tree was not clean when the
> audit finished — the level-clock implementation landed underneath it — and the
> auditor re-verified every citation against a pristine `git archive ef80d83`
> extraction. See "In-flight work that already touches these findings" at the end.

Date: 2026-08-13
Scope: read only investigation. No repo file was modified by this audit.
Evidence standard: every causal claim below cites `file:line`, or a number produced by driving the shipped sim headlessly (probe scripts listed at the end).

**Baseline: commit `ef80d83` (branch `main`), and every line number below was re-verified against a pristine `git archive ef80d83` extraction after the audit was written.** That verification was not optional: the working tree was clean when this investigation started and was NOT clean when it finished. Another agent landed an in-flight level-clock feature during the audit (`css/main.css`, `index.html`, `js/levels.js`, `js/main.js`, `js/save.js`, `js/ui/hud.js`, `js/ui/screens.js`, `js/voxelsim.js`, plus a new `js/levelclock.js`), which shifted `js/voxelsim.js` line numbers by roughly 23 lines mid-read. Line numbers in this document are HEAD numbers, not working-tree numbers. See "In-flight work that already touches these findings" at the end before writing any fix brief.

Verdict labels used: **CONFIRMED** (traced the values or measured them), **SUSPECTED** (mechanism proven, trigger not demonstrated), **NOT A BUG** (checked, correct).

---

## 0. Headline

1. Ranked scores can be published at a different number than the player saw, and the mechanism needs no cheating and no pause. **CONFIRMED**, with numbers: 2247.9250 client vs 2231.9625 server on one identical input trace. Cause: `perfMode` is a physics lever that `RANKED_TUNE` cannot clear.
2. A second ranked divergence opens the moment the player changes any setting mid run. **CONFIRMED**: up to a 58 percent score swing (2231.96 to 945.95) from one tune key.
3. The true maximum multiplier the sim can ever apply is **8x**, not 100x. **CONFIRMED** from the code and from `comboMult(1e6) === 8`. There is no 100 anywhere in the cap; `100` is the chain threshold for level 6.
4. "Best combo 530" is a **chain count**, not a multiplier. **CONFIRMED**. Three results screens print `bestCombo`, and one of them prints it with an `x` in front of it (`js/ui/screens.js:501`), which is exactly the defect ADR-0015 closed for the HUD, still alive on a results screen.
5. Single player score arithmetic itself is sound: `hole.mass` equals the sum of every award, bit exact. The scoring bugs are all at the display and the ranked/multiplayer boundaries, not in the accumulator.

---

# PROBLEM A: do the scores add up

## A1. The single player accumulator is exact. NOT A BUG

`js/voxelsim.js:3089-3097` is the only writer of score:

```js
_award(h, raw, obj) {
  const prevLevel = comboLevel(h.chain);
  h.chain += 1;
  h.chainTimer = COMBO_WINDOW;
  h.bestCombo = Math.max(h.bestCombo, h.chain);
  const gained = raw * comboMult(h.chain);
  h.mass += gained;      // the SCORE
  h.rawMass += raw;      // the goal bar, milestones, SIZE ladder
```

Measured on a 90 second scripted Chicago route (664 eats, seed `probe-seed`):

| quantity | value |
| --- | --- |
| `hole.mass` (the score) | 2231.962500 |
| sum of `gained` over every `eat` event, in event order | 2231.962500, delta **0.000e+0** |
| same summands reversed | delta -3.183e-12 |
| same summands ascending | delta -4.093e-12 |
| `hole.rawMass` | 662.310937 |
| raw recomputed from the `state === 'consumed'` blocks | 662.310938 (delta below 1e-6, movers excluded from the recompute) |

So the number the player sees is the sum of what they ate. Float order dependence exists but is 1.8e-15 relative, and `Math.floor` is applied before display at `js/ui/hud.js:227` and `js/ui/screens.js:303/326`, so it can never move a displayed digit.

## A2. Nothing is counted twice. NOT A BUG

There are exactly three consumption call sites and each is guarded before it can re-enter:

- chunk member: `js/voxelsim.js:2102` skips `cb.state === 'consumed'` before the void test at `2115`.
- loose debris: `js/voxelsim.js:2222` skips anything whose `state !== 'falling'` before the void test at `2273`.
- mover unit: `js/voxelsim.js:2969` skips `u.phase === 'consumed'`; `_consumeMoverUnit` sets that phase first (`3050`).
- `_consume` sets `b.state = 'consumed'` on its first line (`3063`) and `_syncFalling` (`1660-1666`) compacts the consumed entries out of `_falling` on the next step.

Attribution is single writer by construction: the caller picks the first hole in index order whose void covers the block (`2110-2113`, `2226-2233`), which is what the comment at `3057-3061` claims and what the code does.

## A3. `rawMass` vs `mass` after ADR-0015. NOT A BUG

`rawMass` drives the SIZE ladder (`3108`), the goal fraction (`3132`), the milestone rows (`3133`), the HUD progress bar (`js/ui/hud.js:191`), the results "City cleared" line (`js/ui/screens.js:308`) and the win check (`js/voxelsim.js:3284-3295`). `mass` drives only the score plate (`js/ui/hud.js:216`), the results score (`screens.js:303`), the RUN score (`screens.js:325`), the save (`js/main.js:808`) and the wire (`js/net/snapshot.js:92`). That split matches the ADR exactly. Measured score to raw ratio on the probe route: 3.370.

## A4. Display honesty in single player. Minor, CONFIRMED

- `js/ui/hud.js:223-247`: the score plate is an eased count up toward `Math.floor(mass)`. It lags while the score is climbing and converges when it stops. The results screen reads the authoritative accumulator, so a run that ends mid climb shows a results number slightly above the last HUD number. Working as designed, worth knowing when someone reports "the results screen added points".
- `js/ui/hud.js:199` floors the cleared percentage; `js/ui/screens.js:308` rounds it. The same 49.6 percent reads as `49%` in play and `50%` on the results screen.
- `js/ui/screens.js:295` computes the payout as `sim.coinsCollected * 2 + 35` and `:312` prints `+35`, both as literals, while `js/voxelsim.js:252-253` exports `SANDBOX_COIN_VALUE = 2` and `SANDBOX_GOAL_BONUS = 35`. `screens.js` never imports them (checked: its import block is `levels/save/controls/quality/audio-mix/board-config/blockword/sprocket/skins`). The coin toast does read the constant (`js/voxelsim.js:706` to `js/main.js:722`), so a change to `SANDBOX_COIN_VALUE` would make the toast and the payout disagree. Latent, not currently wrong. **Already fixed in the working tree by the in-flight level-clock work**, which adds the import to `screens.js`.
- THE RUN never writes the local save: `js/main.js:786-803` returns before `recordSandboxResult`, so a RUN never updates `bestScore`, `bestCombo` or the coin bank. The title screen's BEST SCORE therefore never reflects a RUN. Probably intentional, stated here because it looks like a bug from the outside.

## A5. RANKED: the client and the server can compute different scores. CONFIRMED

This is the one that matters, and there are two independent paths. Both were measured by driving the shipped sim over one identical input sequence and changing only the tune.

### A5.1 `perfMode` is a physics lever that `RANKED_TUNE` does not cover. CONFIRMED

`js/voxelsim.js:2579`:

```js
const rounds = (this.tune && this.tune.perfMode) ? 1 : ((this.tune && this.tune.contactRounds) || 2);
```

`perfMode` is written into `sim.tune` by `js/main.js:272` (`applyVoxTuning`, from `save.settings.perfMode`, the SETTINGS toggle "Smoother play" at `js/ui/screens.js:587`). `applyVoxTuning()` runs at `js/main.js:520`, and the ranked guard runs one line later at `js/main.js:527`:

```js
if (mode === 'run90') Object.assign(sim.tune, RANKED_TUNE);
```

`RANKED_TUNE` (`js/voxelsim.js:264-267`) has no `perfMode` key, and neither does the constructor's default tune (`js/voxelsim.js:490-493`). `Object.assign` cannot delete a key it does not carry, so the `true` survives into the ranked run. The server's sim (`api/_verify.mjs:32-33`) is constructed fresh and assigned the same `RANKED_TUNE`, so its `perfMode` is `undefined` and it runs 2 contact rounds.

Measured, same seed, same route, 5400 ticks:

| build | eaten | score |
| --- | --- | --- |
| RANKED_TUNE as the server runs it | 664 | 2231.9625 |
| identical, plus `tune.perfMode = true` | 667 | **2247.9250** |

A player with "Smoother play" ON sees `YOUR RUN 2,247`; the board publishes `VERIFIED 2,231`. No cheating, no pause, no network condition required. The player only has to have used a setting the game offers.

### A5.2 Any mid run settings change re-writes the ranked physics. CONFIRMED

Pause is reachable during a RUN (`js/main.js:909` Escape, `:882` the pause button, `:893` a tab visibility change), and the pause screen offers SETTINGS (`js/ui/screens.js:519-520`). Every toggle and every slider on that screen calls `actions.applySettings()` (`js/ui/screens.js:576, 655, 664, 678, 691, 714, 753, 774`), which at `js/main.js:258-259` calls `startQuality()` then `applyVoxTuning()`. Those write, with no `run90` guard at all:

- `js/main.js:141-146`: `debrisCap`, `contactBudget`, `contactRounds`, `supportEvery` from the device tier (`js/quality.js:99-101`).
- `js/main.js:267-272`: `gravity`, `waveK`, `creak`, `speed`, `attract`, `perfMode` from the save.

The comment at `js/main.js:525-526` ("The ranked tune is deliberately the final physics writer") is true only at run start. Measured deltas against the RANKED_TUNE baseline of 2231.9625 on the same trace:

| tune change | eaten | score | delta |
| --- | --- | --- | --- |
| `contactRounds = 1` (LOW tier value, same effect as perfMode) | 667 | 2247.9250 | +15.96 |
| `supportEvery = 2` (LOW tier value) | 526 | **945.9531** | **-1286.01, a 58 percent loss** |
| `debrisCap`/`contactBudget` to Infinity (HIGH tier values) | 664 | 2231.9625 | 0.00 on this route (max simultaneous debris was 176, under the 280 cap, so the lever never engaged; latent, not inert) |
| `gravity = 100` (ADVANCED dev slider) | 927 | 4438.4328 | +2206.47 |
| LOW tier applied at t=30 s (the realistic mid run case) | 638 | 1853.8000 | -378.16 |

Note the sign: the common phone case (LOW tier, `supportEvery = 2`) makes the client score dramatically *lower* than the server's, so the player is robbed rather than favoured. The dev sliders are behind an ADVANCED disclosure but they persist in the save, so a player who once moved Gravity carries that value into every later RUN's mid run reapply.

### A5.3 The server never checks whether the two numbers agree. CONFIRMED

- `js/board/run.js:31` submits `claimed_score: Math.floor(sim.hole.mass)`.
- `api/run/submit.mjs:66-70` passes it to `fw_accept_run`; `supabase/migrations/20260812204210_scoreboards_profiles.sql:28,155,186,189` stores it.
- `api/_verify.mjs:42-51` computes its own `score` and returns `verdict: 'verified'` without ever reading `run.claimed_score`.
- Nothing in `api/`, `js/board/` or the migration compares them. There is no `mismatch` verdict for a score disagreement (the only `mismatch` reasons are `ranked_shape`, `trace` and `cutoff`, `_verify.mjs:23, 27, 40`).

So the divergence in A5.1 and A5.2 is silent by construction, and the data needed to detect it (both numbers, same row) is already in the table. The results screen does show the swap honestly (`js/ui/screens.js:340` prints `VERIFIED · ${result.verified_score ?? score}`), which is the only reason a player would ever notice.

### A5.4 What is NOT wrong with ranked determinism

Ruled out, so nobody re-walks these:

- Transcendental drift between browser and Node: handled. `js/fwmath.js` replaces `hypot`, `sin`, `cos`, `cbrt` with specified operations, and `js/voxelsim.js` contains zero calls to `Math.sin/cos/pow/atan2/exp/log/tan/hypot/cbrt/random` (grep returns only three comment lines: `:21`, `:300`, `:863`).
- Input quantisation: handled. `js/main.js:664-671` steps the sim from the same int8 pair that is stored, round tripped through `inputAt`, precisely so a float in the browser cannot beat an int8 in Node.
- Sub-step count: not a divergence. `maxSubSteps` (`js/quality.js:100-101`) throttles wall clock catch up only; every recorded tick is still stepped exactly once, and `rankedTicks` increments inside `step` (`js/voxelsim.js:3274-3280`).
- Determinism itself: the control run reproduced 2231.9625 / 664 eats bit identically.

### A5.5 Adjacent, worth one line

`api/run/submit.mjs:18-21` and `:74`: `placementGate` decides whether the server bothers to verify a run by comparing the **client supplied** `claimed_score` against the 25th place verified score. A client that under-reports its score gets its run marked `unranked` without ever being replayed. Not a scoring correctness bug, it is a trust-boundary note for whoever writes the fix.

## A6. MULTIPLAYER

### A6.1 The peer's displayed score is the host's, quantised, and hard clamped at 16383.75. CONFIRMED

`js/net/protocol.js:125` `MASS: 4`, `:134` `MAX_MASS: 16383.75`, encode at `:233` and `:315`:

```js
dv.setUint16(o, clamp(Math.round(h.mass * Q.MASS), 0, 0xffff), true);
```

decode at `:371` `mass: dv.getUint16(o + 6, true) / Q.MASS`.

Consequences, in order of severity:

1. **Saturation.** A host score of 20,000 encodes as `clamp(80000, 0, 65535) = 65535`, decodes as 16383.75. Above 16383.75 the peer's own score readout (`js/demo/arena.js:735-741`, reading `arenaPeer.ownHole().mass` which is `self.mass` from `js/net/peer.js:183`) **freezes** while the host's own HUD (`js/demo/arena.js:728`, reading `sim.holes[0].mass` directly) keeps climbing. The two screens then print different numbers for the same player, permanently, and the end reveal inherits it (`js/demo/arena.js:629-638`).
2. **Reachability: SUSPECTED.** A 180 second scripted Chicago route reaches 7,425 points (peak chain 194, 1183 of 44578 blocks). That is 45 percent of the cap. The default match is 180 s (`js/demo/arena.js:56-59`). A better human line, a denser city or a level 7 chain would need roughly 2.2x the scripted route to cross it. I could not demonstrate a crossing, so this is a real clamp on a value that is currently in the same order of magnitude as the cap, not a bug anyone has hit.
3. **Quantisation.** 0.25 point resolution, plus a round, so up to 0.125 of error. Measured example: 7425.3047 becomes 7425.25 on the wire. Invisible after `Math.floor` except when the true value sits within 0.125 above an integer. Not worth fixing.
4. `js/net/protocol.js:558` validates `h.mass > LIMITS.MAX_MASS` on the decoded value, which has already been clamped into range, so that guard can never fire for this case.

The peer never runs a sim (`js/demo/arena.js:790-793` calls only `arenaPeer.update`, never `sim.step`; `js/net/peer.js:24-27` states the invariant), so there is no peer-side score prediction to diverge. The peer's score is exactly the host's, minus quantisation, minus the clamp, delayed by one snapshot interval (83 ms) plus latency.

### A6.2 Per slot attribution cannot double count. NOT A BUG

First attribution wins is enforced independently in three places, and each one is idempotent under duplicate delivery (an event that also arrives in a keyframe):

- host: `js/net/host.js:266` `if (!this._eaterOf.has(e.objectId))`
- peer: `js/net/peer.js:199` for live events, `:216` for the keyframe streams
- record: `js/rival/attribution.js:52` `if (this.eaterOf.has(id)) return false;`

A keyframe heal therefore cannot inflate a score or a share. `js/net/host.js:328-339` builds the per slot RLE streams from `_eatenIds` plus `_eaterOf`, sorted by slot so the bytes are a pure function of state.

One real bug class was already fixed and is worth not re-opening: `js/net/host.js:250` detects the event drain by array identity rather than by length, after 31 percent of eats were being dropped from both the snapshot and the keyframe.

### A6.3 Attribution can DROP credit, and the tug bar and the reveal use only attributed mass. SUSPECTED

`js/net/protocol.js:42` `EATER_ANON = 0xff`. `js/rival/attribution.js:54` credits only `slot >= 0 && slot < MAX_SLOTS` (8), so anything on the anon stream is recorded as eaten but adds to nobody's `massBySlot` and nobody's `totalMass`. Anon entries arise from `js/net/host.js:331` when a block is in `_eatenIds` with no `_eaterOf` entry, which is the "consumed before this host existed" case (`host.js:83-93`) i.e. host migration or a rebuilt host.

In the shipped two player flow the host exists from tick 0, so there are no anon blocks and the shares are exact. Under a host migration, the successor's keyframe would mark a slice of the city eaten with no owner, and the tug bar plus the end reveal would silently renormalise over the remaining attributed mass. Mechanism confirmed by reading; trigger not reachable in the shipped `js/demo/arena.js` (no migration path there yet), hence SUSPECTED.

### A6.4 The arena decides the winner on a different currency than the one it prints. CONFIRMED

`js/demo/arena.js:680`:

```js
const winIdx = split[0].mass === split[1].mass ? -1 : (split[0].mass > split[1].mass ? 0 : 1);
```

`split` comes from `finalSplit(attribution, [0, 1])` (`js/rival/attribution.js:121-130`), whose `mass` is `record.massBySlot[slot]`, which is **raw, un-multiplied** mass (`attribution.js:55-56`, fed by `cityRawMassOf` at `:106-113`). Three lines later, `js/demo/arena.js:683` prints:

```js
`YOU &nbsp;${mineScore.toLocaleString()} PTS<br>${rivalName} &nbsp;${theirsScore.toLocaleString()} PTS`
```

where those are `Math.floor(hole.mass)`, the **combo multiplied** score.

So the reveal can read "YOU 3,400 PTS / RIVAL 1,900 PTS" above the headline "RIVAL TAKES THE CITY". Concrete scenario: you eat 100 blocks of raw mass 1 in one unbroken chain that crosses level 6, scoring roughly 500 points off 100 raw; your rival eats 150 blocks with chains that keep breaking, scoring 150 points off 150 raw. Rival wins the city 150 to 100 raw while the screen shows you ahead 500 to 150 PTS. The code comment at `js/demo/arena.js:645-649` acknowledges this ("the score lines below it show each side's combo-multiplied points as flavor"), so it is a deliberate design choice, but it is a design choice that puts two contradictory verdicts in one frame and it is a strong candidate for what the owner means by "scores not adding up in multiplayer".

### A6.5 A second, smaller currency split in the same file

The live HUD during the match prints combo multiplied points per side (`js/demo/arena.js:740-741`) while the tug of war bar directly under it shows raw mass shares (`:417-418`, `computeShares(attribution.massBySlot[0], massBySlot[1])`, `js/rival/tugbar.js:23-40`). The bar and the numbers therefore move at different rates and can point opposite ways during a hot chain. Same root cause as A6.4.

---

# PROBLEM B: the multiplier

## B1. The true maximum multiplier is 8x. CONFIRMED

`js/voxelsim.js:194-217`:

```js
export const COMBO_THRESHOLDS = [2, 10, 15, 25, 50, 100, 350, 600];
export const COMBO_STEP = 1;
export const COMBO_MAX_LEVEL = COMBO_THRESHOLDS.length;   // 8
export const COMBO_LEVEL_NAMES = ['', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'MAX'];

export function comboLevel(chain) {
  let level = 1;
  for (let i = 0; i < COMBO_THRESHOLDS.length; i++) {
    if (chain >= COMBO_THRESHOLDS[i]) level = i + 1; else break;
  }
  return level;
}
export function comboMult(chain) {
  return 1 + (comboLevel(chain) - 1) * COMBO_STEP;
}
```

`comboLevel` cannot return more than `COMBO_THRESHOLDS.length = 8` because the loop body is bounded by the array. Therefore `comboMult <= 1 + (8 - 1) * 1 = 8` for every input, including a chain of one million. Measured:

| chain | 0 | 1 | 2 | 9 | 10 | 15 | 25 | 50 | 100 | 349 | 350 | 599 | 600 | 601 | 1000 | 5000 | 100000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| level | 1 | 1 | 1 | 1 | 2 | 3 | 4 | 5 | 6 | 6 | 7 | 7 | 8 | 8 | 8 | 8 | 8 |
| mult | 1 | 1 | 1 | 1 | 2 | 3 | 4 | 5 | 6 | 6 | 7 | 7 | 8 | 8 | 8 | 8 | 8 |

Note `chain === 2` still scores at x1: the level is the count of thresholds **passed**, and passing threshold `[0] = 2` sets level 1, which is also the floor. So the first threshold buys nothing; the first real step is chain 10.

**There is no 100x anywhere in this system.** The number 100 in the ladder is `COMBO_THRESHOLDS[5]`, the chain length required to reach level 6, which multiplies by 6. If the owner believes the cap is 100x, that belief has to come from a readout, and B2 says which one.

## B2. Full inventory: what every combo readout actually renders

| # | Surface | file:line | Renders | Honest? |
| --- | --- | --- | --- | --- |
| 1 | HUD combo ring, big white number | `js/ui/hud.js:259-262` (`cm-chain`), markup `index.html:142`, styling `css/main.css:237-240` | **CHAIN COUNT**, unbounded | Unlabelled. It is the largest, brightest number on the ring (font 18-26px vs 10-13px), so it is what a player calls "my combo". |
| 2 | HUD combo ring, small coloured line | `js/ui/hud.js:263-269` (`cm-mult`), markup `index.html:143`, styling `css/main.css:244-248` | **MULTIPLIER**, as `x${comboMult(chain)}`, or the word `MAX` at level 8 | Honest. Reads the sim's exported `comboMult`, per ADR-0015. |
| 3 | HUD combo ring, arc | `js/ui/hud.js:257-258` | the 1.5 s window draining | Honest |
| 4 | HUD combo pill (campaign only) | `js/ui/hud.js:177-182`: `` `COMBO x${p.chain}` `` | **CHAIN COUNT printed with an x** | **NO.** This is the exact defect ADR-0015 documents, still live on the campaign path. Deliberately hidden in the sandbox (`hud.js:215`). |
| 5 | Sandbox results, "Best combo" | `js/ui/screens.js:304, 310`: `` `Best combo <b>${best}</b>` `` where `best = sim.hole.bestCombo` | **CHAIN COUNT**, no unit | Ambiguous. No `x`, but nothing says it is a block count either. |
| 6 | THE RUN results, "Best combo" | `js/ui/screens.js:329`: `` `Best combo <b>${sim.hole.bestCombo}</b>` `` | **CHAIN COUNT**, no unit | Ambiguous. **This is the screen the owner read as 530x.** A 530 there means 530 blocks eaten inside one unbroken 1.5 s chain, which scored at 7x. |
| 7 | Campaign results, "Best combo" | `js/ui/screens.js:501`: `` `Best combo <b>x${sim.player.bestCombo}</b>` `` | **CHAIN COUNT with an `x` prefix** | **NO, and worse than #4.** The campaign sim's own ladder caps at 3.0 (`js/sim.js:9-12`, `comboMultiplier = min(3, 1 + 0.1*(chain-1))`), so `x47` here overstates the real multiplier by 15.7x. |
| 8 | Combo step announcement | `js/main.js:687-700` | no number at all: a meter pulse, a shock ring at level 5+, a camera shake | Honest by omission |
| 9 | Combo audio | `js/audio/game-audio.js:322-325` | pitch rises with `e.level` | Honest |
| 10 | Milestone band | `js/main.js:709-720`, rows at `js/voxelsim.js:230-240` | consumption percentage copy, no combo | n/a |
| 11 | Arena tug of war bar | `js/demo/arena.js:417-418`, `js/rival/tugbar.js:23-40` | per slot share of **raw** mass, quantised, no digits during play | Honest, but see A6.5 |
| 12 | Arena rival callouts | `js/rival/beats.js`, copy fired at `js/demo/arena.js:369-376` | first blood, lead taken, trailing, landmark. No combo number | Honest |
| 13 | Arena live score / end reveal PTS | `js/demo/arena.js:740-741`, `:683` | combo multiplied score | Honest as a score; see A6.4 for the winner mismatch |
| 14 | Coin payout from a campaign level | `js/levels.js:87-89`: `20 + stars*15 + min(30, bestCombo*2)` | pays on the **CHAIN**, capped at 30 coins | Internal, never shown as a multiplier |
| 15 | Public boards and profile | `js/ui/boards.js:25-35` | rank, name, points, cities. No combo column | n/a |
| 16 | Server run stats | `api/_verify.mjs:46` `best_combo: sim.hole.bestCombo` | **CHAIN COUNT**, stored, never rendered today | Latent: the column name says combo, the value is a chain |

Summary of the inventory: **two readouts are chain counts wearing multiplier clothing** (#4 and #7, both with a literal `x` in front of a chain), **two more are bare chains under a "Best combo" label** (#5 and #6, the RUN one being the reported case), and **one is a bare unlabelled chain that is the visually dominant number on the HUD** (#1). Exactly one readout in the game prints a real multiplier (#2), and it is the smallest text in the combo ring.

## B3. Can a displayed multiplier exceed the cap? No. Can a label say MAX while a number climbs? Yes. CONFIRMED

- **Cannot exceed.** `js/ui/hud.js:266-268` is the only place a multiplier is rendered, and it renders `comboMult(h.chain)`, which B1 proves is bounded by 8. There is no second expression anywhere (the validator's source guard at `tools/validate.mjs:1587-1594` also asserts the old `(chain - 1) / 25` expression is gone from `hud.js`, and it is).
- **The number 8 is never shown.** At level 8 the readout is the word `MAX`, so the visible multiplier ladder is `x1, x2, x3, x4, x5, x6, x7, MAX`. A player who counts the steps will conclude the top multiplier is 7 unless they read the ADR.
- **MAX over a climbing number: literally yes.** `h.chain` has no ceiling (`js/voxelsim.js:3091` is a bare `+= 1`), and `cm-chain` prints it verbatim every time it changes (`js/ui/hud.js:259-262`). So at chain 600 the ring shows `600 / MAX`, and at chain 900 it shows `900 / MAX`. The big number keeps climbing forever while the small label under it says the summit was reached. Given #1 in the inventory, that big climbing number is what most players will read as "the multiplier", which is the most likely origin of "it went above 100".

## B4. What `bestCombo` stores, and whether that survives to display. CONFIRMED

- Written once, in one place: `js/voxelsim.js:3093` `h.bestCombo = Math.max(h.bestCombo, h.chain)`. It is a **CHAIN COUNT**. The campaign sim does the same at `js/sim.js:82`.
- Initialised at `js/voxelsim.js:587` and `js/sim.js:18`.
- Persisted per scene: `js/main.js:808` passes `finished.hole.bestCombo` into `recordSandboxResult`, which stores it at `js/save.js:401` as `bestCombo: Math.max(prev.bestCombo || 0, bestCombo)`. Save schema v16 added the field (`js/save.js:302-303`, comment correctly calls it "the run's longest chain"); `CURRENT_VERSION` is 17 (`js/save.js:14`). So the v17 save stores a **chain**, and the comment in the migration is accurate.
- Read back in exactly two places: the results screen's "is this a new best" comparison (`js/ui/screens.js:306`) and the same screen's printed value (`:310`). Nothing else ever renders the stored value: `personalBest` (`js/ui/screens.js:65-74`) reads `bestSize` and `bestScore` only, the city chips read `completions` and `bestSize` (`:206`), the boards read `bestScore` (`js/ui/boards.js:56`). So the saved `bestCombo` is effectively write only outside one results line.
- Consistency verdict: the value stored is a chain and the two sandbox surfaces that print it print a bare chain, so **the save is internally consistent**. The inconsistency is in the campaign path (`js/ui/screens.js:501` prints the stored chain with an `x`) and in the naming, which invites the misread everywhere: a field called `bestCombo` next to a label called "Best combo" in a game whose combo meter's headline concept is a multiplier.

## B5. The validator does not protect any of this. CONFIRMED

`tools/validate.mjs:1556-1562` is the assertion the ADR calls load bearing:

```js
const m = comboMult(c);
const hudWouldShow = 1 + (comboLevel(c) - 1) * COMBO_STEP;
if (m !== hudWouldShow) { ... }
```

`comboMult`'s entire body is `return 1 + (comboLevel(chain) - 1) * COMBO_STEP;` (`js/voxelsim.js:216`). The right hand side is the left hand side inlined, so this comparison is a tautology over all 1000 iterations and can never fail, on any code, including broken code. The genuine protection is the source text guard at `:1587-1594` (hud.js must import `comboMult`, must not contain `(chain - 1) / 25`), which is real but narrow: it inspects `js/ui/hud.js` only. It would not catch `js/ui/screens.js:501`, it would not catch `js/ui/hud.js:177-182` (that line does not contain the banned expression), and it says nothing about what `bestCombo` means.

The other ladder assertions are real and passing: shape, monotonicity, the front loaded head `[2,10,15,25,50,100]`, `COMBO_MAX_LEVEL === COMBO_THRESHOLDS.length`, one name per level, and `comboMult(1e6) === 8` (`:1568-1570`), which is an independent confirmation of B1.

---

## Evidence log

Examined in full: `js/voxelsim.js` (scoring, consumption, tune, ladder), `js/ui/hud.js`, `js/ui/screens.js`, `js/main.js` (loop, settings, quality, ranked wiring, endSandbox), `js/net/host.js`, `js/net/peer.js`, `js/net/snapshot.js`, `js/net/protocol.js` (mass quantisation), `js/rival/attribution.js`, `js/rival/tugbar.js`, `js/demo/arena.js`, `api/_verify.mjs`, `api/run/submit.mjs`, `api/run/status.mjs`, `js/board/run.js`, `js/save.js`, `js/sim.js` (campaign ladder), `js/quality.js`, `js/fwmath.js`, `tools/validate.mjs` (reward ladder section), `.wiki/adr/0015-*`, `supabase/migrations/20260812204210_scoreboards_profiles.sql`.

Ruled out, with the reason:

- **Float order dependence in the score sum**: measured at 4.1e-12 absolute on 2231.96, and every consumer floors. Not a defect.
- **Double counting a block**: three guarded call sites, single writer attribution, `_syncFalling` compaction. Not possible without editing the guards.
- **Browser/Node transcendental drift in ranked replay**: `js/fwmath.js` closes it and `js/voxelsim.js` contains no implementation approximated math call.
- **Float input drift in ranked replay**: closed at `js/main.js:664-671`, the sim steps the stored int8 pair.
- **Sub-step throttling changing a ranked score**: it changes wall clock pacing only, never the tick count or the per tick inputs.
- **Peer predicting its own score**: structurally impossible, the peer holds no sim and `js/net/peer.js` has no write path to `mass`.
- **Keyframe heal double counting or dropping an eat**: first-attribution-wins in three independent layers, all idempotent. The one real bug in this area (the length based drain cursor) is already fixed at `js/net/host.js:250`.
- **`debrisCap` / `contactBudget` altering the probe route's score**: measured zero delta, because peak simultaneous debris was 176 against a 280 cap. The lever is latent on that route, not proven inert in general.

Probe scripts (scratchpad, not in the repo):
`C:\Users\lafak\AppData\Local\Temp\claude\C--programming-nico-apps-Flywheel\cb5bf456-49b3-40d8-a03e-089e407bccfe\scratchpad\score-probe.mjs`,
`...\score-probe2.mjs`, `...\probe3.mjs`. All three import the shipped modules by absolute `file:///` URL, build Chicago with seed `probe-seed`, and drive the shipped `CHICAGO_ROUTE` waypoints. Node v22.16.0.

---

## Where a fix brief would have to land (not a design, just the addresses)

For the implementer to work from, in severity order:

1. `js/main.js:527` plus `js/voxelsim.js:264-267`: `RANKED_TUNE` does not contain `perfMode`, so `Object.assign` cannot neutralise it. Any fix has to make the ranked tune total over every key `sim.tune` can carry, on both the client and `api/_verify.mjs:33`.
2. `js/main.js:236-260`: `applySettings` has no `run90` guard, so `startQuality()` and `applyVoxTuning()` re-write ranked physics mid run. Both the tier writes (`:141-146`) and the dev writes (`:267-272`) are in scope.
3. `api/_verify.mjs:42-51` and `api/run/submit.mjs:66-70`: `claimed_score` and the verified score are both in the row and are never compared. A comparison would have surfaced 1 and 2 the first time either shipped.
4. `js/ui/screens.js:501`: a chain printed with an `x`, against a campaign ladder whose real cap is 3.0.
5. `js/ui/hud.js:177-182`: the same defect on the campaign HUD pill.
6. `js/ui/screens.js:310` and `:329`: bare chains under a "Best combo" label, one of which is the reported case.
7. `js/ui/hud.js:259-262` plus `index.html:142`: the ring's dominant number is an unlabelled chain.
8. `js/net/protocol.js:125,134`: a u16 at 1/4 resolution caps a peer's readable score at 16383.75.
9. `js/demo/arena.js:680` vs `:683`: winner by raw mass, points by multiplied mass, same frame.
10. `tools/validate.mjs:1556-1562`: the equality assertion compares a value against its own definition and cannot fail.

---

## In-flight work that already touches these findings

The working tree was NOT clean when this audit finished. A concurrent agent is landing a level-clock feature: `js/levelclock.js` (new), `tools/perf/` (new), and modifications to `css/main.css`, `index.html`, `js/levels.js`, `js/main.js`, `js/save.js`, `js/ui/hud.js`, `js/ui/screens.js`, `js/voxelsim.js` (300 insertions, 32 deletions at the time of writing). Read against that diff before acting:

- **A4, coin constants: already fixed there.** `js/ui/screens.js` now imports `SANDBOX_COIN_VALUE` and `SANDBOX_GOAL_BONUS` from `js/voxelsim.js`. Drop that item from the fix brief.
- **A4, the floor/round percentage split: partly changed there.** The sandbox goal line now latches on `sim.won` instead of re-comparing `cleared >= targetFraction`, for a stated float-epsilon reason. The HUD-floors-vs-results-rounds difference is untouched.
- **Save schema is moving.** That work introduces a v18 migration and a new per-scene `runs` field distinct from `completions`. Anything the fix brief wants to do to `recordSandboxResult` or the per-scene record (including `bestCombo`) has to be written against v18, not the v17 described above.
- **`js/voxelsim.js` gained roughly 23 lines above line 260 and more below.** Re-resolve every `js/voxelsim.js` line number in this document against the tree at fix time; the surrounding code is unchanged, the offsets are not.
- Nothing in that diff touches the ranked tune (`RANKED_TUNE`, `perfMode`, `applySettings`), the wire mass quantisation, the arena winner comparison, or any of the four combo readouts named in B2. Every CONFIRMED defect above still stands as written.
