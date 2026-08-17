# RCA 2026-08-17: the eat gulps, and eleven other sound effects, are never requested in the voxel city

Date: 2026-08-17
Reporter: repository owner ("the block-eating sound effects are missing; there are three variants eat-1, eat-2, eat-3 that are meant to intermix and I hear nothing")
Severity: HIGH. Not a crash, but the entire event-driven sound layer of the shipped game mode is inert. Every city run and every multiplayer match has been playing without gulps, without the combo ladder, without SIZE stings, without milestone fanfares, without the Chicago derailment and without the tornado siren.
Scope: read only investigation. No file under `js/`, `tools/` or `assets/` was modified.

**Baseline: commit `29e0dfd` on `main`.** The working tree was NOT clean during this investigation (another agent was landing partner-gating work: `js/main.js`, `js/save.js`, `js/skins.js`, `js/ui/screens.js`, `js/upgrades.js`, `tools/economy-consistency.test.mjs`, `tools/validate.mjs`, plus new `js/skinapproval.js` and `tools/partner-approval.test.mjs`). Its `js/main.js` edits insert 24 lines above line 325, which shifts the whole frame loop down by 24 in the working tree. **Every line number in this document is a HEAD number at `29e0dfd`, re-verified against a pristine `git archive 29e0dfd` extraction.** Add 24 to reach the working-tree line if the in-flight branch is still applied.

Verdict labels: **CONFIRMED** (traced in code and in git history), **HIGH** (mechanism proven, one link inferred), **SPECULATIVE**.

---

## 1. Root cause, in one sentence

Commit `8c3c85d` ("feat(multiplayer): multi-hole sim, 10s combo meter with 5s/3s flash, 7 color skins & coin isolation", Nico Lafakis, 2026-08-16 17:15) deleted the single unconditional line `audio.handleEvent(ev);   // gulps, combo ladder, tiered collapses, stingers` from the voxel sandbox event loop in `js/main.js` (it was `js/main.js:1197` in `8c3c85d~1`) while re-scoping that loop's per-event handlers behind a new `isLocalHole` guard, and never reinstated it, so `GameAudio.handleEvent()` is now called from exactly one place in the codebase, `js/main.js:1576`, which is the **legacy campaign branch** that the shipped city game never enters. **CONFIRMED.**

Classification: **never requested.** Not "requested but unregistered", not "registered but no asset", not "played but inaudible". The registry, the file mapping and the assets are all correct and all verified below; the caller is simply gone.

---

## 2. The chain from block eaten to sound, and where it breaks

| # | Hop | Evidence | State |
| --- | --- | --- | --- |
| 1 | The voxel sim consumes a block and emits the event | `js/voxelsim.js:4368` `this.events.push({ type: 'eat', obj, hole: h, gained, chain: h.chain });` | OK |
| 2 | The frame loop drains the batch | `js/main.js:1344` `const events = sim.drainEvents();` | OK |
| 3 | The voxel branch iterates the batch | `js/main.js:1345` `if (isVoxelSandbox) {`, `js/main.js:1349` `for (const ev of events) {` | OK |
| 4 | **The batch is handed to GameAudio** | **nothing. `js/main.js:1349-1546` contains zero `audio.handleEvent` and zero `ev.type === 'eat'`** | **BREAKS HERE** |
| 5 | `GameAudio.handleEvent` maps 'eat' onto a gulp | `js/audio/game-audio.js:484` `case 'eat': {`, `js/audio/game-audio.js:488` `e.playRandom(EATS, { vol: quiet ? 0.25 : 0.65, rate: gulpRate(radius) });` | never reached |
| 6 | The engine picks one of the three variants and plays it | `js/audio/game-audio.js:53` `const EATS = ['eat-1', 'eat-2', 'eat-3'];`, `js/audio/engine.js:256` `playRandom` | never reached |
| 7 | The buffer was preloaded at unlock | `js/audio/game-audio.js:43` (in `ALL_SOUNDS`), `js/audio/game-audio.js:167` `this.engine.load(ALL_SOUNDS)` | OK, the buffers are loaded and then never used |

The events themselves are not lost. The same batch is passed to the renderer one line after the loop closes (`js/main.js:1547` `world.update(realDt, events);`) and `js/voxelworld.js:3533` reads `ev.type === 'eat'` for its visual response, which is why the eat juice on screen still works while the sound does not. That asymmetry is the fingerprint of a missing audio hop rather than a missing event.

Confirmed by machine scan of the pristine `git archive 29e0dfd` extraction, not by eye. Verbatim output (the scanned window runs to the line before the legacy branch's `updateListener`; the `for` loop body itself closes at 1546):

```
voxel event loop: js/main.js:1349..1569
voxel event loop calls audio.handleEvent: false
legacy branch calls audio.handleEvent: true
voxel event loop ev.type arms: combo, crash, growth, milestone, coin, clock,
  powerup_collect, powerup_spawn, disaster, disaster_teleport, quake,
  pvp_kill, pvp_respawn
```

`eat` is absent from that list. Cross-checked directly: `awk 'NR>=1349 && NR<=1546' js/main.js | grep -c "ev.type === 'eat'"` returns `0`.

---

## 3. Causal chain, labelled

**Trigger.** The owner played a city run after 2026-08-16 and noticed the gulps were gone. There is no environmental trigger: the defect fires on every run, on every machine, from the first block swallowed.

**Proximate cause.** `GameAudio.handleEvent()` is never invoked for any event produced by `VoxelSandboxSim`. The only surviving call site, `js/main.js:1576`, sits inside the `} else {` arm at `js/main.js:1570`, which runs only when `isVoxelSandbox === false`. That flag is set false in exactly one place, `startLevel()` at `js/main.js:520` (the legacy campaign `Sim` from `js/sim.js`), and true in the two functions that start real play: the sandbox city start and `startMultiplayerMatch()`. The shipped game therefore always takes the branch with no audio pump.

**Root cause.** Commit `8c3c85d` rewrote that loop to isolate per-player effects in multiplayer. The diff for `js/main.js` is unambiguous:

```
-        audio.handleEvent(ev);   // gulps, combo ladder, tiered collapses, stingers
+        const isLocalHole = !isMultiplayer || ev.hole === sim.localHole || (ev.hole && ev.hole.slot === (sim.localSlot ?? 0));
```

The blanket pump was replaced, line for line, by the guard variable that was supposed to qualify it. Auditing every `audio.` line the commit touched shows five moved or added and exactly one deleted with no replacement anywhere in the commit:

```
-      audio.updateListener(sim.hole.x, sim.hole.z, sim.moverSim);
+      audio.updateListener(sim.localHole.x, sim.localHole.z, sim.moverSim);
-        audio.handleEvent(ev);   // gulps, combo ladder, tiered collapses, stingers   <-- deleted, never restored
-          audio.playCoin();
+            audio.playCoin();                                                          <-- reindented only
-          if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });
+            if (isChrono) audio.playChronoFreeze({ vol: 0.95, delay: 0.25 });          <-- reindented only
-            audio.playFaultLineQuake();
+              audio.playFaultLineQuake();                                              <-- reindented only
+            if (audio.playPowerUpCollect) audio.playPowerUpCollect();                  <-- new, pvp_kill
```

Occurrence count of `audio.handleEvent` in `js/main.js` across history: 0 before `85fd38b`, then 2 for thirty commits, then 1 from `8c3c85d` onward and still 1 at `29e0dfd`. One commit, one dropped line.

Why the line was dropped rather than adapted: the author was converting a loop whose audio was unconditional into one whose effects are per hole, and the two concerns share the same statement position. `handleEvent` was the only handler in that loop that was not already inside an `if (ev.type === ...)` arm, so it had no arm to be re-guarded into. It fell out of the refactor with nothing left behind to mark its absence, which is the ordinary way a whole-loop statement dies during a per-branch rewrite.

**Contributing factor 1: no gate watches the sim-event to audio seam.** See section 5.

**Contributing factor 2: the failure is silent by construction.** `AudioEngine.play()` returns early with no log on a missing buffer, a non-running context or a muted engine (`js/audio/engine.js:239-243`), and `GameAudio` warns on nothing. A sound that is never requested is indistinguishable, from the console, from a sound that plays. There is no `music: unknown cue` equivalent on the effects path because there is no lookup to fail: the event just never arrives.

**Contributing factor 3: the SFX default mix is very low, which softens the "did it ever work" signal.** With the shipped defaults (`js/audio/mix.js:29-31`, master 0.50, effects 0.30) the gulp's peak bus gain is `0.65 x 0.30 x (0.9 x 0.50) = 0.088`, about 21 dB down before per-name fatigue ducking. This is NOT the cause (the sound is never requested at all), but the implementer should expect a quiet gulp after the wiring is fixed and should verify audibility at defaults rather than at a raised slider.

---

## 4. Evidence log, including what was ruled out

Four competing hypotheses were formed before any conclusion, and three were falsified.

**H1: the assets are missing or misnamed on disk. FALSIFIED.** All three masters exist and are real MP3s:

```
eat-1.mp3: 49791 bytes, magic 494433 (ID3)
eat-2.mp3: 55478 bytes, magic 494433 (ID3)
eat-3.mp3: 46954 bytes, magic 494433 (ID3)
```

The name to file resolution was traced end to end, not assumed. `js/audio/game-audio.js:59-61` maps each `eat-N` to the string `'.mp3'`; `js/audio/engine.js:212-213` reads `let target = this._ext[name] || (name + '.ogg'); if (target.startsWith('.')) target = name + target;` so `'eat-1'` resolves to `assets/audio/eat-1.mp3`. Present. The whole of `ALL_SOUNDS` (`js/audio/game-audio.js:41-51`) was resolved against the directory listing the same way and every one of the 40 names lands on a file that exists, including the eight aliases that share a master (`glass-1`, `glass-2` and `glass-shatter` all map to `Flywheel-glass-shatter.mp3`). There is no missing-asset defect anywhere in the SFX library.

**H2: the sound name is requested but not registered, the "unknown cue victory" class. FALSIFIED.** `'eat-1'`, `'eat-2'` and `'eat-3'` are in `ALL_SOUNDS` (`js/audio/game-audio.js:43`), so they are preloaded, and in `EATS` (`js/audio/game-audio.js:53`), which is what `playRandom` draws from. Registry, caller argument and disk file all agree. This is the opposite defect from the podium one: there the caller existed and the registry entry did not, here the registry entry exists and the caller is gone.

**H3: a volume, mute or autoplay gate is suppressing effects specifically. FALSIFIED as the cause.** The engine unlock (`js/audio/engine.js:160-174`) is shared by music and effects, and the owner hears music, so the context is running. The SFX bus carries its own persisted level (`js/audio/engine.js:142-144`) but at a non-zero default of 0.30, and mute is global rather than per bus. No reduced-motion or accessibility path touches audio: `save.settings.reducedMotion` is read at `js/main.js` only for camera shake. Retained as contributing factor 3 above for audibility, not as cause.

**H4: the sound is requested but throttled or fatigued to nothing.** Not reached, because the request never happens. For the record, the eat throttle at `js/audio/game-audio.js:485` (`now - this._lastEat < 0.055`) admits about 18 gulps a second, and `playRandom` spreads fatigue across three names, so neither would ever produce total silence. Noted so nobody re-walks it.

**H5, the survivor: the caller is missing on the live path.** Confirmed by three independent means: the lexical scan of the pristine tree in section 2; a repository-wide grep showing `handleEvent`/`handleEvents` appears in only four files (`js/audio/game-audio.js`, its own test, `tools/` nothing, and `js/main.js` once at line 1576); and the git occurrence-count bisect that lands on `8c3c85d`. Also checked and confirmed negative: neither `js/voxelworld.js` nor `js/world3d.js` holds any reference to the audio layer at all (grep for `audio` in both returns zero hits), so there is no second, presentation-side route by which an eat could have been voiced. `js/skins.js` receives the eat via `skin.onEat` (`js/voxelworld.js:3157`) and is likewise audio-free.

**Also checked and NOT a defect:** `js/audio/engine.js:641` calls `Math.random()`. This looks like an invariant 2 violation but is not: the validator's guard (`tools/validate.mjs:216-241`) deliberately scopes to pure-sim files and explicitly permits render-side randomness. Reported here only so the next reader does not re-open it.

---

## 5. Why no existing test caught it

Three guards were candidates. Each has a specific blind spot, and this defect fits through all three.

**`tools/music-cue.test.mjs` (runs in the gate, via the multiplayer suite list at `tools/validate.mjs:2630`).** It is the right idea aimed at the wrong layer. Its `CALL_SITE_PATTERNS` (lines 81-88) match only `setMusicCue('x')`, `actions.music('x')` and `music.request('x')`. It cross-checks those literals against `MUSIC_CUES`. It has no concept of a sound effect, no concept of a sim event type, and, decisively, it can only catch a caller that asks for **the wrong name**. It cannot catch a caller that has **stopped asking**, because a deleted call site simply drops out of its `requests` array. Its own anti-vacuity assertion (`requests.length >= 8`) protects against the scanner reading nothing, but eight music cues elsewhere in `js/main.js` keep that count healthy while the effects pump is gone.

**`tools/music-assets-selftest.mjs` (in the gate).** Pins disk equals manifest equals registry with SHA-256 per file, but its root is `assets/music/` (line 6) and its registry is `MUSIC_CUES`. `assets/audio/` has no manifest and nothing pins it. Irrelevant here anyway, since the assets are fine, but worth recording: the SFX library has no equivalent guard at all.

**`js/audio/game-audio.test.mjs`.** It does assert the exact behaviour that broke, at line 250: `eq(eng.count('eat-1'), 1, 'gulps are untouched by the crash pooling');`. It passes today and it will pass forever, because line 245 calls `g.handleEvents([...])` directly against a `GameAudio` instance built in-test. It proves the mapping from event to sound is correct; it says nothing about whether anything delivers the event. That is the blind spot: **the test owns both sides of the seam it is testing, so it can never see the seam break.** And it would not have failed the build in any case, because `tools/validate.mjs` never runs it. `js/audio/game-audio.test.mjs` and `js/audio/engine.test.mjs` are listed only in `tools/diagnostics.mjs:92-93`, which is not a gate. Note the irony recorded in the validator's own comments at `tools/validate.mjs:2635-2645`: `js/audio/music.test.mjs`, `tracklist.test.mjs` and `music-assets-selftest.mjs` were each pulled into the gate for precisely this reason ("until now no gate ran at all"). The two effects suites were left behind in the same sweep.

---

## 6. Blast radius

The defect is structural, not specific to eat. Every event type that `GameAudio.handleEvent` can voice, and that the voxel sim actually emits, and that `js/main.js` does not separately call an `audio.*` method for, is silent in the shipped game. Machine-enumerated from the pristine tree:

| Sim event | GameAudio case | Sound lost | Status in the voxel game |
| --- | --- | --- | --- |
| `eat` | `game-audio.js:484` | `eat-1` / `eat-2` / `eat-3`, pitched by hole radius | SILENT (the reported symptom) |
| `combo` | `game-audio.js:538` | `combo-tick`, `combo-alt` every third level, `combo-big` at level 5+ | SILENT |
| `growth` | `game-audio.js:564` | `milestone` sting on every SIZE up | SILENT |
| `milestone` | `game-audio.js:567` | `milestone` / `milestone-roar` plus ambience and music ducking | SILENT |
| `goal` | `game-audio.js:576` | `goal` plus a 2.5 s music duck | SILENT |
| `derail` | `game-audio.js:580` | `derail-screech`, the synthesised crowd scream, `derail-crash`, plus the el-train loop shutdown | SILENT, and the train loop now never stops on derailment |
| `storm_warning` | `game-audio.js:511` | `tornado-siren` + `tornado-loop` + ducking | SILENT |
| `storm_active` | `game-audio.js:517` | tornado loop at full level | SILENT |
| `storm_cleared` | `game-audio.js:520` | siren and loop fade-out | SILENT (moot, they never start) |
| `powerup_spawn` | `game-audio.js:497` | `powerup-spawn` chime | SILENT |
| `disaster_teleport` | `game-audio.js:531` | warp whoosh and zap | SILENT |
| `crash` | `game-audio.js:548` | the whole collapse pooling path | SILENT twice over: no events reach the pool, and `enableCrashSounds` defaults false (`game-audio.js:132`, `:460`) |
| `coin` | `game-audio.js:491` | coin chime | AUDIBLE, `js/main.js:1422` calls `audio.playCoin()` directly |
| `powerup_collect` | `game-audio.js:494` | collect fanfare | AUDIBLE, `js/main.js:1441` calls `audio.playPowerUpCollect()` directly |
| `quake` | `game-audio.js:500` | `earthquake` master plus 3.5 s ambience and music duck | PARTIAL: the quake power-up path plays it via `js/main.js:1447`, and the cinematic adds `audio.playAnimeHitStop()`, but the `quake` event's own ducking never fires |
| `clock` | none | n/a | AUDIBLE, `js/main.js:1430` calls `audio.countdownTick()` directly |

So eleven event classes beyond `eat` lost their voice in the same commit. The four that still work are exactly the four that happened to have a hand-written `audio.*` call in their own `else if` arm, which is why the game is not completely silent and why the regression reads as "the eat sounds are missing" rather than "all sound is gone".

**Related defects found in the same sweep, same class, different origin.** These are not caused by `8c3c85d` and must not be conflated with it, but an implementer touching this seam will hit them:

1. **Seven dead switch arms in `GameAudio.handleEvent`.** `time_freeze_start`, `time_freeze_end`, `storm_end`, `meteor_incoming`, `meteor_impact`, `siren`, `police_siren` are handled at `js/audio/game-audio.js:503-536` and are emitted by nothing in `js/`. This is the caller/registry mismatch class in its other direction. `meteor_incoming` and `meteor_impact` are the sharpest case: the sim emits `type: 'meteor'` (one site in `js/voxelsim.js`), which no case matches, so a meteor would be silent even with the pump restored. `time_freeze_start` and `time_freeze_end` are also read by `js/voxelworld.js:3524-3527`, so two consumers are both waiting on an event nobody sends.
2. **Nine voxel event types have no GameAudio case at all**: `dragonball_aura`, `fault_line`, `disaster`, `meteor`, `pvp_respawn`, `powerup_despawn`, `clock`, `timeup`, `pvp_kill`. Some are deliberate (`clock` and `pvp_kill` are voiced by hand in `js/main.js`); `meteor` and `disaster` look like genuine gaps. Confirming which are intentional is a design question for the owner, not a defect finding.
3. **`js/main.js:1547` carries a truncated comment**, `// to eats, SIZE-ups and consumption milestones.`, whose first two lines were lost in `a2f0368` (the sentence originally read "The sandbox used to drop the event stream on the floor here ... the equipped skin does: it reacts to eats, SIZE-ups and consumption milestones", introduced in `fd2be86`). Cosmetic, but it sits three lines below the deleted audio call and reads like the wound it is not.
4. **`.wiki/modules/audio.md` is stale in two places that matter to this diagnosis.** Line 28 states "There is no master volume" and the table rows at lines 34-36 give Effects 0.7 / Ambience 0.4 / Music 0.3; `js/audio/mix.js:29-32` ships master 0.50, effects 0.30, music 0.25, ambience 0.15 at `MIX_VERSION 3`. Separately, lines 150-156 assert that any surface inside the `js/main.js` frame loop "needs no extra wiring" because the pool is pumped from `updateListener()` and `handleEvents()`. That sentence is now false for the main game: `handleEvents` is not called there, so only the `updateListener()` half of the pump survives.

---

## 7. Fix specification

All line numbers are HEAD `29e0dfd`. If the partner-gating working-tree changes are still applied, add 24.

### 7.1 Restore the pump (the fix proper)

> **Revised 2026-08-17 after review.** The first version of this section prescribed a bare `if (isLocalHole) audio.handleEvent(ev);`. That is wrong, and wrong in this document's own subject class: it fixes single player completely and leaves five sound families still silent in multiplayer. The corrected guard and the reasoning are below. Anyone who read the earlier revision should re-read this subsection.

**File: `js/main.js`. Anchor on the `const isLocalHole = ...` statement inside `for (const ev of events) {` in the `if (isVoxelSandbox)` branch, and insert one statement immediately after it**, before the `if (ev.type === 'combo')` arm. Anchor on that line, not on a number: it is 1350 at HEAD `29e0dfd`, 1374 with the partner-gating working tree applied, and it will move again.

```js
        // Every sim event gets its voice. Restored 2026-08-17: 8c3c85d deleted
        // this line while introducing isLocalHole above it, which silenced the
        // gulps, the combo ladder, SIZE stings, milestones, the derailment and
        // the tornado in every city run. See .wiki/findings/RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md
        //
        // `ev.hole == null` IS the world-event marker: a tornado, a derailment,
        // a collapse or a power-up spawning belongs to everybody in the match,
        // while a gulp belongs to whoever took the bite. Gating a world event on
        // hole ownership is what would leave it silent in multiplayer, because
        // isLocalHole is false whenever there is no hole to own. Single player is
        // unaffected either way: `!isMultiplayer` short-circuits it true.
        //
        // Three scopes, not two. The fault-line quake is hole-scoped but its
        // CONSEQUENCES are not: `crash` is world-scoped, so a hole-gated quake
        // would let a player hear a rival's fault line demolish buildings while
        // the rumble that caused it stayed silent. That reads as a missing
        // sound, not as isolation. Rivals get it quiet, not muted.
        if (!ev.hole || isLocalHole) audio.handleEvent(ev);
        else if (ev.type === 'quake') audio.handleEvent(ev, { quiet: true });
```

Do NOT use the bare `audio.handleEvent(ev)` that was deleted. It predates multiplayer isolation and would voice a rival's coins and gulps at full level, reintroducing the exact defect `8c3c85d` set out to fix. If rival gulps are wanted at a reduced level later, `GameAudio` already supports it: `handleEvent(ev, { quiet: true })` scales the eat to 0.25 (`js/audio/game-audio.js:488`). That is a design call for the owner, not part of this fix.

And do NOT use `isLocalHole` alone. `js/main.js:1350` reads `!isMultiplayer || ev.hole === sim.localHole || (ev.hole && ev.hole.slot === (sim.localSlot ?? 0))`, so in a multiplayer match an event carrying no `hole` fails every arm and evaluates false. Six of the emitters whose sound this fix is restoring are world-scoped and carry no hole, so `isLocalHole` alone ships the tornado, the derailment, the collapse pool and power-up spawns still silent in every match: the same defect one scope narrower.

**Which events carry a `hole`, brace-matched from every `events.push({` in `js/voxelsim.js` at HEAD `29e0dfd`.** Read this table before touching the guard; two of these are counterintuitive.

| Hole-scoped (gated by `isLocalHole`) | World-scoped (always voiced) |
| --- | --- |
| `eat` :4368, `coin` :1303, `combo` :4378, `growth` :4371, `milestone` :4392, `goal` :4704, `powerup_collect` :1640, `clock` :4733, `pvp_respawn` :4438, `timeup` :4742 | `crash` :3259, `derail` :4231, `storm_warning` :132, `storm_active` :154, `storm_cleared` :182, `powerup_spawn` :958 and :4495, `disaster` :1540 and :1602, `dragonball_aura` :1420, `powerup_despawn` :4483 |

**Two events look world-scoped and are not.** `quake` (`js/voxelsim.js:1426`) carries `hole,` at `:1435` even though it also carries bare `x`/`z` copied off that hole at `:1429-1430`, and `disaster_teleport` (`:1464`) carries `hole,` at `:1466`. Both are therefore gated by ownership under the corrected guard. For `disaster_teleport` that is right: the warp whoosh is personal.

**`quake` was escalated to the owner and is now DECIDED (2026-08-17): world-audible, attenuated for rivals.** The deciding argument is `crash`. Collapses are world-scoped and always voiced, so under a hole-gated `quake` a player would hear a rival's fault line demolish buildings across the map while the rumble that caused it stayed silent: the consequence without the cause, which reads as a missing sound rather than as isolation. Attenuating rather than muting also keeps the event doing useful work ("something big just happened over there") without masking the player's own feedback the way full volume would.

That is the `else if` arm already shown in the guard above. There is one authoritative snippet for this fix, the block at the top of 7.1; do not copy a second version from anywhere else in this document.

#### The `quiet` flag does not reach this sound, and making it do so is part of the fix

This is not an assumption to carry forward, and it is the half of the change most likely to be waved through. `handleEvent` destructures `{ quiet = false }` (`js/audio/game-audio.js:479`), but `quiet` is read in exactly ONE place in the whole file, `:488`, the eat case. `case 'quake'` (`:500-502`) calls `this.playFaultLineQuake()` with no argument, and `playFaultLineQuake()` (`:311-315`) takes no parameters at all:

```js
  playFaultLineQuake() {
    this.engine.play('earthquake', { vol: 1.0 });
    this.engine.duckAmbience(3.5, 0.2);
    this.music.duck(3.5, 0.3);
  }
```

So `handleEvent(ev, { quiet: true })` against today's code changes nothing and ships a rival's quake at FULL volume. Worse than the volume, and this is the part that survives review because nobody looks past the `vol:` line: it also **ducks the local player's ambience to 20 percent and their music to 30 percent for 3.5 seconds**. A rival's quake would dip your score on a timer you did not cause, in every match, which is precisely the "re-ducked the bed every few frames" failure the collapse pooling was built to eliminate (`js/audio/game-audio.js:96-101`).

The required shape, with the current values kept as defaults so the existing no-argument call sites are untouched:

```js
  /** `quiet` is a rival's quake in a multiplayer match: audible, because the
   *  collapses it causes are world-scoped and already audible, but subordinate
   *  and non-ducking. The ducks exist to clear space for the LOCAL player's big
   *  moment, and they are most of what makes it feel like it happened to YOU;
   *  spending them on a rival's event is the jarring re-duck this module's
   *  collapse pooling already rejects. */
  playFaultLineQuake({ quiet = false } = {}) {
    this.engine.play('earthquake', { vol: quiet ? 0.35 : 1.0 });
    if (quiet) return;
    this.engine.duckAmbience(3.5, 0.2);
    this.music.duck(3.5, 0.3);
  }
```

then thread it at the case: `case 'quake': this.playFaultLineQuake({ quiet }); break;`

**Both numbers stated explicitly rather than left to the implementer.** Rival level `0.35`: it follows the only existing precedent in the file, the eat case's 0.25 against a 0.65 base (a 0.385 ratio), applied to the quake's 1.0 base and rounded. Rival ducking: **none at all**, per the reasoning in the doc comment above, rather than a shallower duck. Both are judgement calls rather than derivations, so they are the two things to tune by ear; the level is the single constant to change if the owner wants it louder or softer.

**Sibling finding, same root, recorded so it is not rediscovered later as a bug.** Before this fix `quiet` was honoured at `:488` and nowhere else: **1 of 22** `handleEvent` cases, counted by the guard suite rather than by eye. The quake change takes that to 2 of 22, and the option remains silently inert for the other twenty. A future caller passing `{ quiet: true }` for a rival's combo, milestone, growth, goal or coin gets full volume with no warning: the same "silent by construction" class this entire RCA is about, sitting one layer inside the audio module. Fixing it wholesale is out of scope here because it needs a per-case level decision nobody has been asked for, but the quake change establishes the pattern, and `tools/sfx-event-guard.test.mjs` now prints the ratio and names the cases on every run, so the gap is visible instead of latent.

Note that `crash` being world-scoped is correct and deliberate: the collapse pool's distance attenuation (`js/audio/game-audio.js:255-256, 461-462`) is exactly the mechanism for hearing a rival's tower come down across the map at the right level, and it only works if the events reach the pool at all.

### 7.2 Remove the duplicates the restored pump creates

Restoring the pump makes three hand-written calls fire twice. Each must be deleted in the same edit, or the player hears a doubled, phase-smeared version of that sound. First column line numbers are HEAD `29e0dfd`; add 24 for the partner-gating working tree (independently confirmed against that tree during review: 1446, 1465, 1471, 1454).

| Delete | At (HEAD / working tree) | Because `GameAudio.handleEvent` now covers it |
| --- | --- | --- |
| `audio.playCoin();` | `js/main.js:1422` / 1446 | `case 'coin'` at `game-audio.js:491` |
| `audio.playPowerUpCollect();` | `js/main.js:1441` / 1465 | `case 'powerup_collect'` at `game-audio.js:494` |
| `audio.playFaultLineQuake();` | `js/main.js:1447` / 1471 | the sim emits a separate `quake` event (`js/voxelsim.js:1426`) on the same fault-line effect, and `case 'quake'` at `game-audio.js:500` plays the same `earthquake` master plus ducking |

**Keep** `audio.countdownTick();` at `js/main.js:1430` / 1454 (no `clock` case exists, so nothing would replace it), **keep** `if (isChrono) audio.playChronoFreeze(...)` at `js/main.js:1445` / 1469 (no chrono case on the `powerup_collect` path), and **keep** `if (audio.playPowerUpCollect) audio.playPowerUpCollect();` at `js/main.js:1537` / 1561 (that is the `pvp_kill` arm, an event `GameAudio` has no case for).

**One deliberate behaviour change, and it must not be discovered later as a regression.** `audio.playPowerUpCollect()` at `:1441` is today called unconditionally, before the `isMultiplayer` split, so a RIVAL's power-up pickup is currently audible at full level in a match. `powerup_collect` is hole-scoped (`js/voxelsim.js:1640` carries `hole`), so under the corrected guard it becomes local-only. That is consistent with the coin-isolation intent of `8c3c85d` and is the right default, but it IS a change in multiplayer behaviour: state it in the commit message.

Verify by ear or by counting `window.__audio.engine` buffer starts: after the edit, collecting a coin must produce exactly one chime and collecting the quake power-up exactly one earthquake.

### 7.3 Close the guard gap (required, per TDD)

Per the repo's non-negotiable invariant 1, the failing test comes first. Two pieces, in this order.

**a. New file `tools/sfx-event-guard.test.mjs`, written to fail on the current tree.** This is the effects-side sibling of `tools/music-cue.test.mjs`, and it must catch the class the music guard cannot: a caller that has stopped asking. Lexical, for the same documented reason (`js/main.js` touches `document` at module scope and can never be imported headlessly). It should:

1. Import `GameAudio` from `js/audio/game-audio.js` (pure enough to import in Node; `js/audio/game-audio.test.mjs` already does) and read the source of `js/audio/game-audio.js` as text to extract every `case '<type>':` in `handleEvent`, giving the set of event types the audio layer claims to voice.
2. Read `js/voxelsim.js` and `js/sim.js` as text and extract every `type: '<name>'` inside an `events.push(`, giving the set of event types the sims actually emit.
3. Read `js/main.js` as text, locate the `if (isVoxelSandbox) {` frame-loop branch and its `for (const ev of events)` body, and assert the body contains a call matching `/audio\.handleEvents?\s*\(/`. **This single assertion fails on today's tree and passes after 7.1.** It is the assertion that matters; write it first and watch it go red.
4. Assert the same for the legacy `} else {` branch, so a future refactor cannot silence the campaign path the same way.
5. Anti-vacuity, mandatory (the music guard's own precedent at its lines 119-127, and the tautology defect recorded in `RCA-2026-08-13-scoring-and-combo-audit.md` section B5): assert the extracted case set is non-empty and contains `'eat'`, and assert the emitted set is non-empty and contains `'eat'`. A scanner that found zero of either would pass forever against any code.
6. Report, as a non-fatal listing rather than a failure, the two set differences: cases with no emitter (currently the seven dead arms in section 6) and emitted types with no case (currently nine). Making either of those fatal today would block on design decisions that are the owner's, not the implementer's. Print them so they cannot keep hiding.
7. **Pin the guard's scoping in BOTH directions, as two separate assertions.** In a simulated multiplayer batch: a hole-scoped event belonging to a rival hole must NOT reach `handleEvent`, AND a world-scoped event carrying no `hole` MUST reach it. A suite that checks only the first half passes against the `isLocalHole`-only spec that review caught, which would have shipped the tornado and the derailment silent in every match. One-directional checking is how the original deletion survived three guards; do not repeat the shape here. The natural place for the behavioural half is `js/audio/game-audio.test.mjs`, driving a `GameAudio` with a batch containing one rival-hole `eat` and one hole-less `derail`, and asserting `eng.count(...)` on each. The lexical half belongs in the new guard: assert the inserted statement's condition is not the bare `isLocalHole`, so a future simplification back to it fails the build.
8. **Pin the rival quake in both directions too, and for the same reason.** A rival-hole `quake` must REACH `handleEvent` (it must not be filtered out by the guard) AND must arrive attenuated. A test that asserts only that it fires passes against a build that plays a rival's quake at full volume, which is the exact failure mode 7.1 documents: the `quiet` flag is accepted and then discarded, so the wiring looks correct and sounds wrong. Assert the level, not merely the count. While there, assert `playFaultLineQuake({ quiet: true })` performs no ambience or music duck, since the ducking is the larger intrusion and the easier one to reintroduce by accident.

**b. Register the effects suites in the gate.** In `tools/validate.mjs`, add to the `suites` array in `validateMultiplayer()` (the list running from line 2612 to 2681), alongside the music entries at lines 2630-2645 and following their comment convention:

```js
    // The effects side of the same seam. RCA-2026-08-17: a multiplayer refactor
    // deleted js/main.js's one `audio.handleEvent(ev)` and took the gulps, the
    // combo ladder, every stinger and the derailment with it, for a day, with
    // ALL PASS printing throughout. js/audio/game-audio.test.mjs asserts the
    // event-to-sound mapping but calls handleEvents() itself, so it owns both
    // sides of the seam and can never see it break; the guard below watches the
    // seam, and these two watch the behaviour behind it.
    'tools/sfx-event-guard.test.mjs',
    'js/audio/game-audio.test.mjs',
    'js/audio/engine.test.mjs',
```

Confirm both effects suites pass standalone before adding them: they have only ever been run by `tools/diagnostics.mjs:92-93`, so neither has faced the gate.

### 7.4 Documentation, same commit (doc hygiene rule)

- `.wiki/modules/audio.md` lines 150-156: correct the claim that a frame-loop surface "needs no extra wiring". State plainly that `js/main.js` must call `audio.handleEvent(ev)` per drained event in BOTH frame-loop branches, and that `tools/sfx-event-guard.test.mjs` now enforces it.
- `.wiki/modules/audio.md` lines 28-36: the mix table is two generations stale. Master exists and defaults to 0.50; effects 0.30, music 0.25, ambience 0.15, `MIX_VERSION 3` per `js/audio/mix.js:29-34`.
- `STATUS.md`: record the regression and its fix.
- `js/main.js:1546`: restore the truncated comment to a whole sentence while in the file.

### 7.5 Verify

After the fix, in a browser on the deployed or locally served build, `window.__audio` is exposed for exactly this (`.wiki/modules/audio.md:175`). Start a city run and confirm, in order: a gulp on the first block, three distinguishable gulp variants over a dozen blocks, a deepening pitch as SIZE climbs (`gulpRate` maps radius 1.1 to rate 1.25 and radius 6.6 to rate 0.70, `js/audio/game-audio.js:126-129`), the combo tick ladder, one SIZE sting per level up, and exactly one coin chime per coin. Then check audibility at the shipped defaults rather than at a raised slider: peak gulp gain is about 0.088 (section 3, contributing factor 3). If it is too quiet to hear at defaults, that is a mix decision for the owner, and it is a separate change from this fix.

---

## 8. Prevention

The class is: **a caller deleted during a refactor, on a seam no gate watches, failing silently by design.** Three changes, in decreasing order of value.

1. **Guard seams, not just names.** The repo already learned half of this lesson: `tools/music-cue.test.mjs` exists because a caller asked for a name the registry lacked. It cannot catch a caller that vanished, and that is now the second defect of this family to ship (the silent podium, then this). The guard in 7.3 is written the other way round: it asserts a call site EXISTS, not merely that its argument is valid. Every future cross-file agreement where one side can be deleted without a link error deserves an existence assertion, not only a validity assertion.

2. **A test that constructs both sides of a seam does not test the seam.** `js/audio/game-audio.test.mjs:245` calls `handleEvents` itself and then asserts the gulp fired. It is a good unit test and it is structurally incapable of catching this bug. Whenever a suite has to supply the input that production supplies, add a second, separate assertion that production still supplies it. This is the same shape as the tautological combo assertion in `RCA-2026-08-13-scoring-and-combo-audit.md` section B5 and the float-sum guard in this repo's process notes: a check written in the shape of the thing it audits proves nothing.

3. **A suite that no gate runs is not a test.** `js/audio/game-audio.test.mjs` and `js/audio/engine.test.mjs` were reachable only through `tools/diagnostics.mjs`. The 2026-08-16 sweep that pulled `music.test.mjs`, `tracklist.test.mjs` and `music-assets-selftest.mjs` into `tools/validate.mjs` walked right past them. When a suite is written, it goes into `tools/validate.mjs` in the same commit, or it does not exist. Worth one grep during review: every `*.test.mjs` in the tree should appear in the validator's suite list or have a written reason at its call site for why it does not.

4. **Refactor rule, narrow and cheap.** When a loop body is converted from unconditional to per-branch handling, statements that were unconditional have no branch to land in and are the ones that get dropped. Before landing such a change, list every statement in the old body that was not already inside a conditional and account for each one explicitly in the diff. In this case that list had exactly one entry.
