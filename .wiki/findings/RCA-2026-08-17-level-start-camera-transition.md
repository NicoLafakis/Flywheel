# RCA 2026-08-17: the level-start camera is seized by the power-up spawn cinematic before the establishing shot is ever drawn

Date: 2026-08-17
Reporter: repository owner ("when the game starts up ... The way it is now is really jerky and doesn't make any sense. I think it's reacting to the power-ups or something and that's causing it to change positions drastically. This happens between hitting start to start the level or moving, and when the camera is positioned on the player following them.")
Severity: HIGH. Every single-player city start on every scene, plus a recurring 1.5 s camera hijack roughly every 30 s during play. Not a crash; the game is playable, but the authored establishing shot has never once been seen by a player since 2026-08-16, and the mid-game hijack takes the camera off the hole while the sim keeps stepping.
Scope: read only investigation. Nothing under `js/`, `css/` or `tools/` was modified. The only files written are this document and the `.wiki/INDEX.md` link to it.

**Baseline: commit `a74e758` on `main`.** Four other agents were working in the tree during this investigation. Every file this document cites (`js/camera.js`, `js/main.js`, `js/ui/screens.js`, `js/ui/menuscene.js`, `js/voxelsim.js`, `js/powerups.js`, `js/ui/ready.js`) was verified CLEAN against HEAD with `git status --short` at the time of measurement, so every line number below is both a HEAD number and a working-tree number. The one dirty file in the toolchain is `tools/validate.mjs`, which this document references only by function name (`validateMultiplayer`), never by line.

Verdict labels: **CONFIRMED** (traced in code, in git history AND measured live), **HIGH** (mechanism proven, one link inferred), **SPECULATIVE**.

---

## 1. Root cause, in one paragraph

Commit `8818c2d` ("fix: combo meter display and logic sync issues", Nico Lafakis, 2026-08-16 04:02) replaced `Screens.showPokemonEncounterModal` with a legacy stub (`js/ui/screens.js:1505-1508`) that calls its `onSkip` callback **synchronously, on the same tick**, where the modal it replaced only ever called `onSkip` from a click, a keydown or a 10 s timer. Its caller, `playNextPokemonSpawn` in `js/main.js:417-475`, was written against the asynchronous contract and therefore shows the modal FIRST (`js/main.js:456-460`) and arms the camera cinematic SECOND (`js/main.js:462-471`). Under the stub, the completion handler now runs before the thing it is meant to complete exists: its `skipPokemonSpawnCinematic()` finds nothing to cancel, its `finished` latch is already true when the real `onComplete` eventually fires, and `state` is restored to `'playing'` before the cinematic is armed. The result is that `cam.pokeSpawnCinematic` is left running for its full 1.5 s with a dead completion callback and **no code path anywhere that can cancel it**. Because the two map power-ups are created in the `VoxelSandboxSim` constructor and their `powerup_spawn` events are queued there (`js/voxelsim.js:955-959`), and because the frame loop drains events unconditionally even while the READY gate holds the sim (`js/main.js:1369`), this fires on the **very first rendered frame of every level**, overriding the establishing shot before it is ever drawn. **CONFIRMED**: traced in code, bisected to the commit, and measured live in a headless browser against the running app.

Classification: a **timing-contract inversion at a retirement seam**, not a camera-math defect. Every constant in `js/camera.js`'s intro is correct and every establishing-shot calculation produces the right answer; the answer is then overwritten by a cinematic that should not be running.

This is the second defect in two days with the same shape as [RCA-2026-08-17 eat SFX and voxel event audio](RCA-2026-08-17-eat-sfx-and-voxel-event-audio.md): a commit removed ONE side of a two-sided seam and left the other side calling into a shape that no longer behaves the way the caller assumes.

---

## 2. Verdict on the owner's power-up hypothesis

**The owner is right, and more specifically right than the wording suggests.** It is not that the camera is "reacting to the power-ups"; it is that the **power-up SPAWN cinematic is running, uncancellable, during the level intro and again during play**.

| Cinematic | Can it fire while `introPhase !== 'off'`? | Gate | Evidence |
| --- | --- | --- | --- |
| `pokeSpawnCinematic` | **YES, and it always does.** It fires on the first frame of every level. | **None.** `queuePokemonSpawnIntro` (`js/main.js:410-415`) reads no camera predicate at all. | Measured: `startPokemonSpawnCinematic` logged twice with `introPhase: "hold"` at t=42734 ms, 21 ms after `beginIntro`, 20 ms before the first `cam.update` of the level. |
| `quakeCinematic` | **YES, during `'zoom'` only, and rarely.** It requires collecting the quake power-up, which requires sim steps, which the READY gate suppresses (`js/main.js:1288-1289`). Once `releaseIntro()` flips the phase to `'zoom'` the sim runs for 1.4 s, so a player who dashes onto the quake pickup inside that window gets the full 5.8 s earthquake cutscene layered on top of the intro dolly. | **None.** `startEarthquakeCinematic` (`js/camera.js:439`) never reads `introPhase`. | Code inspection. Not reproduced; a 1.4 s window at 12.81 m/s covers 17.9 m and `MIN_POWERUP_SEPARATION` is 26 m (`js/powerups.js:124`), so it is improbable rather than impossible. **HIGH** confidence that no gate exists; **SPECULATIVE** that any player has hit it. |
| `dragonballCinematic` | **NO. It cannot fire at all, ever.** | Not applicable. | `js/camera.js:295` declares the field and nothing in the repository ever assigns or reads it. `8818c2d` deleted `startDragonballCollectCinematic` and `skipDragonballCinematic` from `js/camera.js` and their caller from `js/main.js:476-514`, leaving the field behind. It is dead state. |

Note the symmetry of `8818c2d`: it retired the Dragon Ball cinematic properly on BOTH sides (camera methods and caller both deleted, leaving only a vestigial field) and retired the Pokemon cinematic on ONE side only (the modal became a toast, the camera cinematic and its caller both survived). The half-retirement is the defect.

There is a further irony worth stating because it points at the fix: `js/camera.js:670` exports `introActive()`, which is exactly the predicate that would gate this. **It has zero callers in the repository.** The gate was written and never wired up.

---

## 3. The causal chain

| Link | What happens | Evidence |
| --- | --- | --- |
| **Root cause** | `8818c2d` replaces the blocking `showPokemonEncounterModal` (which called `onSkip` only from `click`, `touchstart`, `keydown` or a 10 s `setTimeout`) with a stub that calls `onSkip()` inline. | `js/ui/screens.js:1505-1508`; `git show 8818c2d -- js/ui/screens.js` shows the deleted `handleSkip` listeners and `autoDismissTimeout` at removed lines 333-361. |
| **Latent design flaw the root cause activated** | `playNextPokemonSpawn` shows the presentation before arming the camera, so a synchronous completion is unrepresentable. | `js/main.js:456` (`screens.showPokemonEncounterModal({ ..., onSkip: finishPokeIntro })`) precedes `js/main.js:462` (`c.startPokemonSpawnCinematic({...})`). |
| **Proximate mechanism 1: the cinematic is orphaned** | `finishPokeIntro` runs inside `showPokemonEncounterModal`. Its `skipPokemonSpawnCinematic()` returns immediately because `this.pokeSpawnCinematic` is still null (`js/camera.js:484`). It sets `finished = true` (`js/main.js:440`), drains the queue, sets `isShowingPokeSpawn = false` and restores `state = 'playing'` (`js/main.js:447-449`). Only then is the cinematic armed, with `onComplete: finishPokeIntro`, which is now a no-op (`js/main.js:439`). | Measured call log, Brooklyn: `skipPokemonSpawnCinematic {"pokeActive":false}` then `startPokemonSpawnCinematic {"alreadyActive":false, "introPhase":"hold"}` then `skipPokemonSpawnCinematic {"pokeActive":true}` then `startPokemonSpawnCinematic {"alreadyActive":false}`, all inside 1 ms at t=42734. |
| **Proximate mechanism 2: it fires on frame 1 of the level** | The sim constructor places two map power-ups and pushes a `powerup_spawn` event for each (`js/voxelsim.js:955-959`, count fixed at 2 in `js/voxelsim.js:1310`). The frame loop calls `sim.drainEvents()` unconditionally, outside the `held` guard, so those two events are consumed on the first `'playing'` frame even though not one sim tick has run. | `js/main.js:1288` `const held = cam.introHolding();`, `js/main.js:1289` `accumulator = held ? 0 : ...`, `js/main.js:1369` `const events = sim.drainEvents();`, `js/main.js:1533-1534` `else if (ev.type === 'powerup_spawn') { if (!isMultiplayer) queuePokemonSpawnIntro(...) }`. No `reason` filter: `'initial'` is treated identically to `'intermittent'`. |
| **Proximate mechanism 3: the override outranks the intro** | The poke override block sits AFTER the whole intro calculation in `update()` and overwrites the frame's look target, distance, pitch and yaw wholesale. | `js/camera.js:1214-1283`; the assignment is `js/camera.js:1269-1275` (`tx = cineLookX; tz = cineLookZ; dist = cineDist; this.pitch = cinePitch; this.yaw = cineYaw;`). `this.pitch` and `this.yaw` are PERSISTENT rig state, not frame locals. |
| **Proximate mechanism 4: the release is unblended** | Phase 3 (`progress >= 0.88`) computes an eased return for all five channels but only two of them are applied. `tx` and `tz` are assigned inside the phase-3 branch (`js/camera.js:1265-1266`) and therefore blend over 0.18 s. `cineDist`, `cinePitch` and `cineYaw` are assigned only under `if (progress < 0.88)` (`js/camera.js:1269`), so at the boundary the distance reverts to the live value in ONE frame and the pitch and yaw simply stop being written and keep the cinematic's last value forever. | `js/camera.js:1255-1275`. Measured as a 213.1 m single-frame camera translation, section 4. |
| **Trigger** | Nothing. It fires unconditionally on every level start. There is no race, no device dependence and no input required. | Reproduced on the gallery and on Brooklyn, three separate runs each. |

Five-whys, terminated at a decision rather than a symptom:

1. Why is the level-start camera jerky? Because a 1.5 s power-up spawn cinematic is driving it.
2. Why is a spawn cinematic driving it? Because two `powerup_spawn` events are drained on the first frame of the level and nothing gates the cinematic on the intro.
3. Why does nobody cancel it? Because its cancel call already ran, before it was armed.
4. Why did the cancel call run early? Because `showPokemonEncounterModal` now invokes `onSkip` synchronously.
5. Why does that break the caller? Because `playNextPokemonSpawn` arms the camera AFTER showing the presentation, a **decision** that is only safe while the presentation is guaranteed asynchronous, and `8818c2d` removed that guarantee without touching the caller.

---

## 4. What was measured, and how

Method: a Playwright probe against the app served from the repository's own static server (`python -m http.server 8000`, already running), driving `window.__screens.actions.startVoxelSandbox(scene)`, which is the identical call the city card's launch button makes (`js/ui/screens.js:622`). The probe wraps `ChaseCamera.prototype.update` on the shared module instance and records the rig's full state after every call, which is the densest sampling possible: the camera position can only change inside `update()`, so a difference between two consecutive samples is exactly one rendered frame of movement. It also wraps `beginIntro`, `releaseIntro`, `skipIntro`, `startPokemonSpawnCinematic` and `skipPokemonSpawnCinematic` to log arming order.

Two accommodations, both stated because both bound the claims:

* `navigator.hardwareConcurrency` is reported as 2, which suppresses the title backdrop (`js/ui/menuscene.js:82`). That property has exactly one reader in `js/` and it is that line, so nothing in the level path is affected. One run deliberately leaves the backdrop enabled, for section 5.
* `VoxelWorld3D.prototype.render` is replaced with a no-op in the runs used for magnitudes. Software rasterisation caps the real run at about 3.6 fps, which cannot resolve a one-frame cut, and a 0.1 s clamped `realDt` distorts the cinematic's own clock. With the draw call removed the run holds 56 fps and every line of camera and sim code still executes. A control run with rendering left on reproduces the same structure at 3.6 fps.

### 4.1 Brooklyn, warm start, GO pressed after 3.5 s (`rca-cam-brooklyn2.json`)

`_introYaw0` = 1.5708 rad = **90.0 degrees**, the azimuth `_bestIntroYaw` chose, sun term included (`js/camera.js:583-614`).

| t (ms, from first level frame) | poke progress | phase | yaw (deg) | pitch | camera position | distance from origin |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 0.001 | hold | 90.0 | **0.380** | (8.0, 3.4, 15.7) | 18.0 m |
| 245 | 0.137 | hold | 90.9 | 0.380 | (8, 3, 16) | 18 m |
| 495 | 0.304 | hold | 77.2 | 0.386 | (6, 3, 18) | 19 m |
| 595 | 0.371 | hold | -6.6 | 0.405 | (-8, 4, 25) | 27 m |
| 762 | 0.482 | hold | -84.4 | 0.453 | (-32, 6, 19) | 37 m |
| 1011 | 0.648 | hold | -85.5 | 0.507 | (-53, 8, 20) | 57 m |
| 1210 | 0.782 | hold | -85.5 | 0.520 | (-42, 3, 19) | 46 m |
| **1711** | **0.871** | hold | -85.5 | 0.520 | **(-43, 3, 20)** | **47 m** |
| **1761** | **0.904** | hold | -85.3 | 0.520 | **(-220, 115, 32)** | **250 m** |
| 2443 | 0.993 | hold | -84.7 | 0.520 | (-191, 115, 13) | 223 m |
| 3944 (GO) | - | zoom | -83.0 | 0.520 | (-184, 113, 17) | 217 m |
| 6299 | - | off | -91.4 | **0.520** | (-5, 3, 16) | 17 m |

Headline numbers:

* **213.1 m of camera travel in a single 16.3 ms frame**, at poke progress 0.873 to 0.880. That is the phase-3 boundary at `js/camera.js:1269`.
* **176.5 degrees of yaw** travelled during the whip-pan, peaking at **16.9 degrees in one 15.7 ms frame**, which is **1076 deg/s**. `js/camera.js:69-70` tunes the chase spring's own rate ceiling at 4.2 to 7.0 rad/s, that is 240 to 400 deg/s, with a comment calling anything near 545 deg/s "a nausea machine". The cinematic exceeds the module's own stated ceiling by 2.7x.
* The establishing hold resumes at **-85.5 degrees**, **175.5 degrees away from the `_introYaw0` = 90.0 degrees** the yaw search selected. `_bestIntroYaw` exists specifically to disambiguate the lit and unlit members of a yaw / yaw+pi pair (`js/camera.js:559-582`); the cinematic lands the camera on the other member, so the shot the search paid distance for is systematically the silhouette.
* `this.pitch` finishes the run at **0.520** against a constructor base of **0.54** (`js/camera.js:234`), and stays there for the rest of the level. `savedPitch` is captured at `js/camera.js:474` and is never read anywhere in the repository.
* Field of view on the first frame is **81 degrees**: 45 base, plus 20 from the intro's `INTRO_FOV` blend, plus **two** 8-degree `fovKick` calls. Shake starts at about 1.2, which is **two** `triggerShake(0.6)` calls. Both cinematics arm and both apply their juice (`js/camera.js:477-480`); only the second one's state object survives.
* The establishing overview at 250 m is not shown until 1.76 s into the level, by which time the player has already been given a hero close-up, a whip-pan and a teleport.

### 4.2 Gallery, same shape (`rca-cam-gallery-nr.json`)

`_introYaw0` = 0. Single-frame position jump at the phase-3 boundary: **165.2 m**, from (-59, 8, 5) to (-198, 95, -16), in a 21.1 ms frame. Peak yaw rate 9.6 deg per frame. Establishing hold resumes at -99.2 degrees, 99.2 degrees off the chosen azimuth. Final pitch 0.520. Shake reaches the 2.00 cap during phase 2, because `js/camera.js:1254` calls `triggerShake(0.35)` on every frame of an 0.27 s window against a decay of `1 - dt*6`.

### 4.3 GO pressed while the cinematic is still running (`rca-cam-gallery-earlygo.json`)

This is the realistic case, not the edge case: the READY card is mounted synchronously at level start (`js/main.js:855`) and the cinematic lasts 1.5 s, so any player who reacts inside 1.5 s lands here. `releaseIntro` was logged with `pokeActive: true`. The intro zoom then runs UNDERNEATH the override, and the release cut lands mid-dolly: **39.8 m in a single 19.4 ms frame**, from (-57, 11, 6) to (-82, 42, 2), at `_introK` 0.67. The cut is smaller only because the intro had already dollied part of the way in.

### 4.4 Mid-play, the second half of the report (`rca-cam-gallery-midplay.json`)

The owner's "and when the camera is positioned on the player following them". Reproduced by pushing the sim's own live power-up object through its own event queue in exactly the shape `js/voxelsim.js:4495` pushes on an intermittent respawn, after the intro had completed (`introPhase === 'off'`):

| t (ms) | poke progress | yaw (deg) | pitch | position | fov | shake |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | - | -105.2 | 0.520 | (-4.9, 3.2, 14.7) | 45 | 0.01 |
| 133 | 0.011 | -105.2 | **0.380** | (-7.3, 3.3, 14.2) | **53** | **0.84** |
| 658 | 0.344 | -55.9 | 0.396 | (-3.7, 3.9, 21.7) | 45 | 0.35 |
| 850 | 0.488 | 69.9 | 0.456 | (24.4, 5.6, 24.7) | 45 | 0.09 |
| 1398 | 0.855 | 70.5 | 0.520 | (38.1, 7.7, 29.9) | 45 | **2.00** |
| 1598 | 0.988 | 70.5 | 0.520 | (5.7, 3.1, 17.8) | 45 | 0.70 |

An 8.0-degree pitch snap in one frame, a **175.7-degree** whip-pan away from the hole, camera shake driven to the 2.00 cap, and 1.5 s during which the camera is 30 m away pointing at a drop site while `state === 'playing'` and the sim keeps stepping. Cadence: `js/voxelsim.js:4500-4502` pushes a fresh 30 s respawn timer whenever fewer than `MAX_MAP_POWERUPS` (2, `js/powerups.js:123`) are on the board or pending, so this recurs roughly every 30 s once the player starts eating power-ups.

The mid-play release looks less violent in position than the level-start one for a precise reason worth recording: with `introPhase === 'off'` the frame's `dist` is the ordinary chase distance, about 16 m, which happens to equal the cinematic's own phase-2 `cineDist` of 16.0 (`js/camera.js:1250`). The unblended distance channel therefore has almost nothing to jump. The pitch and yaw channels are just as unblended as at level start; they simply resolve through the chase spring afterwards instead of being frozen in a hold.

---

## 5. Evidence log, including what was ruled out

### 5.1 FALSIFIED: the menu-to-level azimuth jump

The pre-registered leading hypothesis was that the city menu and the level each run `beginIntro`'s yaw search with different inputs and the camera therefore cuts azimuth at the boundary. **This is not the mechanism, and it cannot be**, on four independent grounds:

1. **There is no camera on the city menu at all.** `showCitySelect` calls `this.actions.menuScene(false)` (`js/ui/screens.js:417`), which reaches `stopMenuScene()` (`js/main.js:339`), which disposes the world and drops `active` (`js/ui/menuscene.js:222-228`). The live 3D backdrop exists only on the TITLE screen (`js/ui/screens.js:162`).
2. **They are two different objects and one is destroyed before the other is built.** The backdrop constructs its own `ChaseCamera` (`js/ui/menuscene.js:138`); the level constructs a fresh one (`js/main.js:745`) after `teardownWorld()` has already called `stopMenuScene()` (`js/main.js:881`). Nothing is threaded between them.
3. **Measured.** A run with the backdrop deliberately enabled recorded two distinct camera instances. The backdrop camera's last `update()` is at t=1582 ms at position (5, 77, 133), yaw 1.6 degrees; the level camera's first `update()` is 65 ms later at t=1647 ms. The backdrop camera never ticks again: it is only driven from `tickMenuScene` (`js/ui/menuscene.js:209`), which is only called from the `state === 'menu'` branch of the frame loop (`js/main.js:1776`), unreachable once `state = 'playing'`.
4. **The boundary is covered.** `screens.showLoading(sceneLabel)` paints an opaque takeover before the two rAFs and the `await loadScene` that precede any of this (`js/main.js:718-726`), so no frame ever shows both.

For completeness: the backdrop is hard-coded to Brooklyn (`js/ui/menuscene.js:37`) regardless of which city is chosen, so even conceptually there is no shared pose to preserve. Any implementation of the requested choreography must therefore SYNTHESISE the "menu angle", not inherit it. See section 7.

### 5.2 FALSIFIED: `dragonballCinematic`

Grepped the entire repository for `dragonballCinematic`, `startDragonball` and `DragonBall`. Exactly one hit: the field declaration at `js/camera.js:295`. `8818c2d` removed both the camera methods and the caller. It is dead state and cannot fire.

### 5.3 NOT the cause, but adjacent and worth knowing

* `Math.random()` at `js/camera.js:1069-1071` is not an invariant violation. `tools/validate.mjs:257-262` documents render-side files as explicitly allowed and scopes the guard to the pure-sim set.
* The intro's own orbit arithmetic does NOT accumulate error under the cinematic's yaw writes. Frame to frame the sequence is `yaw -= osc_prev; yaw += osc_new; ...; yaw = cineYaw`, which telescopes to a bounded offset rather than a drift. Checked because a wind-up here would have been an attractive second explanation; it is not one.
* `screens.showPowerUpShowcase` (`js/ui/screens.js:1214`) is a real screen with its own 10 s countdown and touches no camera state. `playPowerUpCollectCinematic` (`js/main.js:534-543`) is now only a state flip. The collect path is not implicated.

### 5.4 CONFIRMED contributing factor: `realDt` has no lower bound

`js/main.js:1279-1280`:

```js
const rawDt = (ts - lastTs) / 1000 || 0;
const realDt = Math.min(0.1, rawDt);
```

`Math.min` clamps the ceiling and nothing clamps the floor. `finishPokeIntro` rewrites `lastTs = performance.now()` at `js/main.js:449`, from inside the event loop, AFTER `frame()` has already advanced `lastTs` at line 1281 of the same frame. `playEarthquakeCinematic` (`js/main.js:501`) and `playPowerUpCollectCinematic` (`js/main.js:541`) do the same.

In the first Brooklyn run, which was taken across a multi-second main-thread build block, this produced a measured `realDt` of about **-6.2 s** on one frame. Consequences observed in that run: `pokeSpawnCinematic.time` was driven to -6.2, which pinned the cinematic in phase 0 for the entire READY hold with shake stuck at the 2.00 cap; and `_fovKick *= Math.max(0, 1 - dt*6)` (`js/camera.js:1447`) evaluated as a multiply by 38.2, driving the field of view to **344 degrees**.

Honest bounds on this one: the missing floor is confirmed by reading the line. The -6.2 s magnitude was produced under software rasterisation with a multi-second build block and is amplified by that environment; the warm run did not reproduce it. Rated **HIGH**, not CONFIRMED, as a real-device risk. It is a one-line hardening regardless, and it is in the fix spec because a level start on a slow phone is precisely the multi-second block that provokes it.

### 5.5 CONFIRMED contributing factor: the state hold never happens

`playNextPokemonSpawn` sets `state = 'powerup_encounter'` (`js/main.js:435`) and the frame loop has a dedicated branch for it (`js/main.js:1759-1768`) that drives the camera with no input. Under the synchronous stub, `state` is restored to `'playing'` at `js/main.js:448` before `frame()` can ever observe it, so that branch is dead for this path, `controls.cancelPointer()` is never called, and the player steers a hole they cannot see for 1.5 s.

---

## 6. Blast radius and siblings

**In scope today**

* Every single-player start of every scene, authored or gallery. Both branches of `js/main.js:767-873` construct the sim the same way, so both get two constructor-time `powerup_spawn` events.
* Every intermittent respawn during single-player play, roughly every 30 s once power-ups are being eaten.
* Multiplayer is NOT affected: `js/main.js:1534` guards on `!isMultiplayer`.
* Reduced motion is affected but not jarring. The cinematic's reduced branch (`js/camera.js:1219-1225`) does ease its blend out, so there is no hard cut, but it still replaces the establishing shot with a 28 m two-shot for 1.2 s of the READY hold. The intro itself is correct here: `releaseIntro` lands on final framing directly (`js/camera.js:652`).

**Sibling instances of the same pattern**

The pattern is: *show the presentation, then arm the camera, and let the presentation's completion callback cancel the camera*. Grep for `screens.show` immediately followed by `cam.start`:

1. `playNextPokemonSpawn`, `js/main.js:456` then `js/main.js:462`. **Broken today.**
2. `playEarthquakeCinematic`, `js/main.js:511` (`screens.showEarthquakeCinematic`) then `js/main.js:516` (`cam.startEarthquakeCinematic`). **Identical ordering.** It works today only because `showEarthquakeCinematic` is still a real asynchronous overlay (`js/ui/screens.js:1466-1468` delegating to `showCivilDisasterEmergencyCinematic`). It is one stub away from the same failure, and the failure would be worse: 5.8 s of uncancellable camera with eight hard-cut phases.
3. `playPowerUpCollectCinematic`, `js/main.js:539`. Currently safe because there is no camera call left in it.

**Dead or unwired code found while tracing**

* `js/camera.js:295` `dragonballCinematic`, never assigned or read.
* `js/camera.js:474-475` `savedPitch` / `savedDist`, and `js/camera.js:446-447` for the quake, all written and never read. The restore they exist for was never implemented, which is why `this.pitch` leaks.
* `js/camera.js:670` `introActive()`, zero callers.
* `js/ui/screens.js:1510-1512` `dismissPokemonEncounterModal`, a no-op stub still called from `teardownWorld` (`js/main.js:882`).
* `js/main.js:1759`'s `powerup_encounter` arm, unreachable for the poke path.

---

## 7. Fix specification

Ordered so that each step is independently shippable and independently testable. Steps 1 to 3 are the defect (part A of the request). Step 5 is the requested choreography (part B) and must land AFTER steps 1 to 3, because until the cinematic stops seizing the camera, any choreography written into the intro will be overwritten exactly as the current one is.

### Step 1: stop the level intro and the spawn cinematic from ever coexisting

`js/main.js`, `queuePokemonSpawnIntro` (line 410). Two guards, and they are not redundant:

```js
function queuePokemonSpawnIntro(pu, simInstance, camInstance, reason) {
  if (!pu) return;
  // The two map power-ups are placed by the sim CONSTRUCTOR and their events are
  // drained on the first frame of the level, before a single tick has run
  // (js/voxelsim.js:955, js/main.js:1369). They are level furniture, not an
  // arrival, and announcing them costs the establishing shot.
  if (reason === 'initial') return;
  // Belt and braces for every other reason: the intro owns the camera until it
  // says otherwise. introActive() existed for exactly this and had no callers.
  if (camInstance && camInstance.introActive && camInstance.introActive()) return;
  ...
}
```

and at the call site `js/main.js:1534`, pass `ev.reason` through. Do the same at the legacy campaign call site `js/main.js:1705`.

Design note for the owner, flagged rather than decided: dropping `reason === 'initial'` also removes the two "ORBITAL DROP DETECTED" toasts that currently fire at level start. If those are wanted, keep the toast and drop only the camera cinematic, by splitting `queuePokemonSpawnIntro` into an announce half and a cinematic half.

### Step 2: make the arming order correct, so a synchronous completion is representable

`js/main.js`, `playNextPokemonSpawn` (lines 417-475). Arm the camera BEFORE showing the presentation, and make the cancel identity-checked so a stale handler cannot cancel a newer cinematic:

* Move the `if (c && c.startPokemonSpawnCinematic) { ... }` block (currently lines 462-471) to ABOVE the `screens.showPokemonEncounterModal(...)` call (currently line 456).
* Have `startPokemonSpawnCinematic` return the cinematic object (one added `return this.pokeSpawnCinematic;` at `js/camera.js:481`), capture it as `token`, and change `skipPokemonSpawnCinematic()` to `skipPokemonSpawnCinematic(token)` which returns early unless `token == null || this.pokeSpawnCinematic === token` (`js/camera.js:483-488`). Same change for `skipEarthquakeCinematic` (`js/camera.js:455-460`) so the class is covered.
* `finishPokeIntro` (line 438) then passes its own token.

This makes the function correct under BOTH contracts, which is the point: it must not silently depend on the presentation being asynchronous again.

### Step 3: make the cinematic release continuous, and restore what it borrowed

`js/camera.js`, the poke override block (lines 1214-1283).

* Move the three assignments `dist = cineDist; this.pitch = cinePitch; this.yaw = cineYaw;` out from under `if (progress < 0.88)` (line 1269) so that phase 3 actually applies its own blend to all five channels, the way it already applies it to `tx` and `tz` at lines 1265-1266. Phase 3 already computes `cineDist = dist`, `cinePitch = this.pitch` and `cineYaw = this.yaw` (lines 1262-1264); those need to become an eased blend FROM the phase-2 values TO the live ones, using the same `easeU` the look target uses. Concretely, cache the phase-2 exit values (`dist`, `pitch`, `yaw`) on the cinematic object at the moment `progress` first crosses 0.88, then interpolate from them.
* Yaw must be interpolated on the SHORTEST signed angle (`Math.atan2(Math.sin(d), Math.cos(d))`, the idiom already at `js/camera.js:1026`), or a 176-degree return will pick an arbitrary direction.
* Cap the phase-1 yaw rate. The whip-pan currently reaches 1076 deg/s against a module ceiling of 400 deg/s (`js/camera.js:69-70`). Either clamp the per-frame yaw step to `FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP * dt` or lengthen phase 1 until the worst case fits. The worst case is a 180-degree turn, so at 400 deg/s that is 0.45 s of the 0.675 s phase 1 already has: a clamp is sufficient and costs nothing in the common case.
* Restore the borrowed rig state on completion. `savedPitch` and `savedDist` are already captured at lines 474-475 and never read; read them, in the `progress >= 1.0` block at lines 1278-1282 and in `skipPokemonSpawnCinematic`. Do the same for the quake at lines 446-447 and 1206-1210.
* Do NOT restore yaw. The chase spring owns yaw during play and will bring it home on its own; forcing it would be a second discontinuity. During the intro this is moot once step 1 lands.

### Step 4: floor the frame delta

`js/main.js:1280`: `const realDt = Math.max(0, Math.min(0.1, rawDt));`

And remove the three mid-frame `lastTs = performance.now()` rewrites (`js/main.js:449`, `js/main.js:501`, `js/main.js:541`) or move them to the top of the next frame. They exist to avoid charging the paused interval to the resumed sim, but `accumulator` is already zeroed alongside them at `js/main.js:500`, which is the mechanism that actually achieves that; rewriting `lastTs` after `frame()` has advanced it can only under-measure.

### Step 5: the requested choreography (menu angle, then directly overhead, then zoom to the player)

**What currently prevents it.** Six things, all concrete:

1. **There is no menu angle to inherit** (section 5.1). The city menu has no 3D scene, and the title backdrop is a separate, disposed camera showing a different city. The "angle when you're on the city menu" must be synthesised. Recommended reading of the request: it means "the wide establishing angle you are looking at when you press GO", which is `_introYaw0`, and that already exists and is already sun-scored. If the owner literally means the title backdrop's live yaw, the cheapest honest implementation is a module-level `lastMenuYaw` exported from `js/ui/menuscene.js`, written in `stopMenuScene()` before `active` is dropped, and passed as `opts.yaw` to `beginIntro`. That is a two-line change but it discards the level's own sun-scored azimuth, which is a real loss and should be an explicit decision, not a side effect.
2. **The intro has no pitch channel.** `this.pitch` is the constant base 0.54 through the whole intro; only distance, FOV, look target, far plane and the `diveBump` (`js/camera.js:1377`) move. An overhead beat needs pitch to become part of the intro timeline.
3. **`_overviewDist()` is cached on aspect only** (`js/camera.js:689-690`), while `_fitAt` reads `this.pitch` on every call (`js/camera.js:721`). Animating pitch during the intro therefore returns a STALE fitted distance. Either add pitch to the cache key or derive the overhead beat's distance separately.
4. **A true 90-degree pitch is singular.** At `pitch = pi/2`, `cos(effPitch)` is 0, so `cx` and `cz` collapse onto `tx` and `tz` (`js/camera.js:1379-1380`) and `camera.lookAt` has its view direction parallel to the default up vector. three.js r160 does not NaN here (`js/vendor/three.module.js:6181-6197` nudges `_z.z += 0.0001`), but the resulting roll is arbitrary and rotates rapidly near the pole. **Cap the overhead beat at about 1.40 to 1.45 rad, 80 to 83 degrees**, which reads as directly overhead and keeps the roll governed by yaw. Do not use `pi/2`.
5. **One scalar drives five terms.** `_introK` is read by the look-target blend (`js/camera.js:1061-1062`), the geometric distance blend (1104-1105), the dive bump (1377), the FOV blend (1446) and the far plane (1456). A three-beat choreography needs either per-beat curves or a second parameter; reusing `_introK` alone will couple the overhead rise to the FOV and the far plane in ways that were tuned for a straight dolly.
6. **The sim gate is phase-typed.** `js/main.js:1288` holds the sim on `introHolding()`, which is `introPhase === 'hold'` exactly (`js/camera.js:671`). Any new phase name must be added there or the sim will start running under the new beat.

**Recommended shape.** Extend the phase machine to `'off' | 'hold' | 'rise' | 'dive'` rather than adding beats inside `'zoom'`:

* `'hold'` is unchanged: the fitted overview at `_introYaw0`, orbiting within `_introArc`, sim frozen. `releaseIntro()` now enters `'rise'`.
* `'rise'`: over roughly 0.8 s, ease `pitch` from the establishing pitch to the capped overhead value and hold `_introK` at 1, keeping the look target on `_sceneBox`. Yaw holds at `_introYaw0` plus the decaying orbit offset. The sim stays frozen (add `'rise'` to the `held` predicate) so the player has not lost any clock to a camera move.
* `'dive'`: the existing zoom, unchanged in structure, but easing pitch back from overhead to the base 0.54 on the same smootherstep as `_introK`. This is where the sim starts, exactly as `'zoom'` does today.
* `skipIntro()` (`js/camera.js:658-668`) must reset pitch to the base as well as unwinding `_introOscYaw`, or a skipped intro leaves the camera overhead. This is the same class of leak as the `savedPitch` one in step 3, so fix both with one convention: **the intro owns pitch only while `introPhase !== 'off'`, and `skipIntro` is the single place that returns it.**

**Invariants the implementer must not break**, each with its citation:

* Reduced motion must still land on final framing directly. `releaseIntro` at `js/camera.js:652` must skip BOTH new beats, not just the dive, and `setReducedMotion` at `js/camera.js:386` currently tests `introPhase === 'zoom'` and will need to test the new phase names.
* `_introOrbit === 0` must still produce an exactly static pose (`js/camera.js:916-925`). Harnesses depend on it. The rise beat must not introduce any motion that is not gated on the same pin.
* `skipIntro()` must continue to unwind `_introOscYaw` so yaw lands where it would have without the intro (`js/camera.js:662-667`).
* The roof lift is deliberately disabled during `'hold'` on the argument that the fitted overview is provably outside the city (`js/camera.js:1426-1438`). An overhead beat is directly ABOVE the city, so the argument still holds but for a different reason; restate the comment rather than silently inheriting it, and include `'rise'` in the exclusion.
* The far plane term reads `effT` directly and the intro fits its distance against `BLOCKER_EASE` (`js/camera.js:1354-1366`), which is why the standoff filter is bypassed while the intro runs. Keep `'rise'` on the same side of that test as `'hold'`.

### Step 6: regression tests, which must be written first

See section 8. Steps 1 to 5 must not be implemented until each named assertion has been run against the current tree and observed RED.

---

## 8. Tests to write first, and how each is proven RED

New file `tools/cinematic-arming-guard.test.mjs`, registered by appending its path to the `suites` array in `validateMultiplayer()` in `tools/validate.mjs`. That is the section that already spawns standalone suites for exactly this reason (its comment at the top of the function explains why they are spawned rather than imported), and it lands the suite in the `multiplayer` orchestrator group, which is process-startup bound rather than CPU bound.

`js/camera.js` cannot be imported in Node: it imports `three`, which is resolved by the page's import map. So the executable assertions below use the same technique `tools/sfx-event-guard.test.mjs` uses for the audio seam: EXTRACT the shipped source text of the block under test and compile it with `new Function`, so that editing the shipped code changes what the test executes. None of these re-implement the logic they audit.

**A1. The cancel must never precede the arm.** Extract the body of `playNextPokemonSpawn` from `js/main.js`. Compile it against recording stubs for `audio`, `screens`, `triggerHaptic` and a camera whose `startPokemonSpawnCinematic` and `skipPokemonSpawnCinematic` append to a log. Drive `screens.showPokemonEncounterModal` with the SHIPPED behaviour, itself extracted from `js/ui/screens.js` so the test tracks the real method rather than a guess about it. Assert the log contains no `skip` before its matching `start`, and that after the queue drains, the stub camera holds no cinematic.
**RED today, already observed:** the measured call log is `skip(pokeActive:false), start, skip(pokeActive:true), start`, and the camera is left armed. Verbatim from `rca-cam-brooklyn2.json`, all four inside 1 ms at t=42734.

**A2. The cinematic's release must be continuous in every channel.** Extract the poke override block (`js/camera.js:1214-1283`) as a function of `(dt, tx, tz, dist)` over a fake `this`. Step it at 1/60 from `time = 0` to `duration` with `dist` set to a plausible establishing value of 250. Assert the maximum single-step change in `dist` is under 25 percent of the running value, and the maximum single-step change in `yaw` is under `7.0 * dt` radians, which is the module's own `FOLLOW_MAX_RATE * FOLLOW_MAX_RATE_RAMP` ceiling at `js/camera.js:69-70`.
**RED today, already observed:** at the phase-3 boundary the distance goes from 16 to 250 in one step, a 1462 percent change, which the live probe rendered as 213.1 m of camera travel in a 16.3 ms frame. The yaw step measured 16.9 degrees in 15.7 ms, that is 18.8 rad/s against a 7.0 rad/s bound.
Run the same extraction against the quake block (`js/camera.js:1113-1211`) in the same test, so the class is covered rather than the instance. Expect the quake block to fail the distance assertion too, at its own phase boundaries; that is a finding, not a false positive, and it should be triaged with the owner rather than silently exempted.

**A3. The cinematic must return the rig state it borrowed.** In the same harness, record `this.pitch` before stepping and assert it is restored once `progress >= 1.0` and once `skipPokemonSpawnCinematic` has run.
**RED today, already observed:** measured `pitch` is 0.520 at the end of every run against a constructor base of 0.54 (`js/camera.js:234`). `savedPitch` is captured at `js/camera.js:474` and read nowhere.

**A4. No camera cinematic may arm while the intro owns the camera.** Extract `queuePokemonSpawnIntro` and drive it with `reason: 'initial'` and with `reason: 'intermittent'` against a camera stub whose `introActive()` returns true. Assert `startPokemonSpawnCinematic` is never called in either case.
**RED today, by construction:** `js/main.js:410-415` reads no camera predicate, and `introActive()` (`js/camera.js:670`) has zero callers repository-wide. Prove the RED by grep as well as by execution, since a zero-caller predicate is the cleanest possible evidence that no gate exists.

**A5. The frame delta must never be negative.** Extract the two lines at `js/main.js:1279-1280` and evaluate them with `ts < lastTs`.
**RED today:** `Math.min(0.1, -6.2)` returns -6.2. Independently observed live in `rca-cam-brooklyn.json`, where `pokeSpawnCinematic.time` ran to -6.246 s and the field of view reached 344 degrees.

**A6. The class assertion, and the one that would have caught this.** For each of `showPokemonEncounterModal`, `showEarthquakeCinematic` and `showPowerUpShowcase` in `js/ui/screens.js`, extract the method body and assert that its completion parameter (`onSkip` / `onDone`) is not invoked synchronously within it: either it is passed to an event listener or a timer, or it is not called at all in the synchronous path.
**RED today:** `js/ui/screens.js:1507` is a bare `onSkip();` in the synchronous path of `showPokemonEncounterModal`. This is the single assertion that would have failed the day `8818c2d` landed.

**Anti-vacuity floor.** Each extraction must fail loudly if its source anchor is not found, the way `tools/sfx-event-guard.test.mjs:268` fails when its glob matches nothing. A test whose regex silently stops matching after a refactor is a test that always passes.

**Collect, do not throw.** Follow the same convention as `tools/sfx-event-guard.test.mjs`: gather failures and report them together at the end. Aborting on A1 would hide A2 and A3, which are the assertions that distinguish the real fix from the plausible wrong one (deleting the cinematic outright).

---

## 9. Prevention

The class is: **a presentation gate is stubbed out or retired, silently changing a callback's timing contract, and its caller's ordering becomes wrong without any file that caller owns being edited.** Three changes stop the class, not just this instance.

1. **Arm the machine before you announce it.** Make it a stated convention in `.wiki/conventions.md`: any pairing of "show a presentation" with "start a camera or sim cinematic" arms the cinematic FIRST and shows the presentation SECOND, and the cancel is identity-checked against a token. A function written that way is correct whether the presentation completes synchronously, asynchronously or never. Both remaining pairings (`js/main.js:456`/`462` and `js/main.js:511`/`516`) get the treatment in step 2 of the fix, so the convention lands with zero known exceptions.
2. **Assertion A6 as a standing guard.** A callback contract that only exists in a comment is a contract that survives exactly one cleanup commit. A6 turns "this callback is asynchronous" into something the validator holds.
3. **Retire both sides, or neither.** `8818c2d` is a textbook half-retirement: the Dragon Ball cinematic was removed correctly on both sides, and the Pokemon one had its modal replaced while its camera cinematic and caller were left live. A cheap standing guard is a validator assertion that every `cam.start*Cinematic` method on `ChaseCamera` has at least one non-test caller and every `this.*Cinematic` field is both assigned and read. That single assertion would today flag `dragonballCinematic` (`js/camera.js:295`), `savedPitch` and `savedDist` (`js/camera.js:446-447`, `474-475`) and `introActive()` (`js/camera.js:670`), all four of which are symptoms of the same habit.

No new tooling and no new service is required for any of this. The validator is the test suite, and every assertion above runs inside it.

---

## 10. Reproduction artifacts

The probe and its four sample sets are in the session scratchpad, not in the repository. They are reproducible from the description in section 4 against the repository's own `python -m http.server 8000` using the Playwright already vendored at `tools/pw/node_modules`. The load-bearing observation needs no tooling at all and can be confirmed by eye in a browser console:

```js
// with a level running, before pressing GO
window.__cam.introPhase          // 'hold'
window.__cam.pokeSpawnCinematic  // NOT null: an armed, uncancellable cinematic
window.__cam.pitch               // 0.38, not the 0.54 base
```

---

## 11. Resolution (2026-08-17)

**Steps 1 through 5 of the section 7 fix spec are implemented.** Files changed:
`js/camera.js`, `js/main.js`, `js/ui/screens.js`, plus the new guard suite
`tools/cinematic-arming-guard.test.mjs` (registered in `tools/validate.mjs`).
The conventions and the four-phase machine are documented in
[conventions](../conventions.md) rule 8 and [modules/render](../modules/render.md).

| | before (HEAD `54f6f67`) | after |
|---|---|---|
| worst single-frame camera travel, manhattan | 8.4 m (567 m/s) | **5.1 m** |
| worst single-frame camera travel, brooklyn (dt ≤ 50 ms) | 207.9 m in a 16.8 ms frame (12 373 m/s) | **7.6 m** |
| peak yaw rate, manhattan | 1220.1 °/s | **42.5 °/s** (ceiling 400) |
| pitch when `introPhase` reaches `'off'` | 0.5200 (leaked) | **0.5400** (base) |
| frames with a cinematic armed during the start, manhattan | 185 of 350 | **0** |
| establishing shot | absent — pitch 0.380, range 8.3 m | `hold` 1.32 s at pitch 0.540, range 159 m |

The `pitch 0.38 / cinematic not null` console reproduction in section 10 no
longer reproduces: `window.__cam.pokeSpawnCinematic` is `null` through the whole
start and `window.__cam.pitch` reads `0.54`.

Two items from this document were deliberately NOT taken, both stated rather
than silently dropped:

- **`menuscene.js`'s `lastMenuYaw` is not plumbed into the level.** The intro
  keeps resolving its azimuth from the sun-scored `_introYaw0`. Adopting the
  menu's yaw would discard the level's own scored azimuth, which is a shot-design
  decision for the owner, not an implementation detail. Open.
- **The quake cutscene's INTERNAL cuts remain hard cuts** (whole-sequence worst
  285.3% distance and 165.88 rad/s yaw at progress 0.261, against a release-window
  worst of 21.3% and 1.00 rad/s). Section 7 step 3's release continuity IS applied
  to the quake — the same five channels, the same geometric distance blend, the
  same `savedPitch` restore — but the rate cap is scoped to `progress >= 0.94`,
  because capping the authored hit-stop → arcade close-up → launch cuts would turn
  a deliberate 2.76 rad cut into a ~0.4 s pan. Named open item in
  [modules/render](../modules/render.md). Open.

One deviation from the spec: **`savedDist` is not restored.** The cinematics only
ever write the frame-local `dist`, never `this.dist`, so restoring it could only
undo a player's own zoom. `savedPitch` IS read, on both the completion and the
cancel path. Note that this retires two of the three dead fields section 9.3
flags (`savedPitch` is now read; `savedDist` is removed outright), and
`introActive()` (`js/camera.js:670`) now has a real caller in
`queuePokemonSpawnIntro`.

**A defect this fix exposed, and fixed.** Raising the dive so it descends from
directly overhead pushed the camera vertically through the Brooklyn tower canopy,
where the blocker sweep chatters (`0.9200 / 0.4309 / 0.1500 / 0.9200 / 1.0000 /
0.2678 / 0.9200` on seven consecutive frames at ~25 m). The `_effT` first-order
filter that exists precisely for this was gated `introPhase === 'off'` and so was
disabled for the whole intro. The gate is now `!== 'hold' && !== 'rise'`: the
original exclusion's reasoning (the intro FITS its distance against
`BLOCKER_EASE`, so a lagging standoff un-frames the shot) holds for the two beats
that frame the city from outside it and have nothing to smooth, and does not hold
for a dive that goes through it. Brooklyn's worst step fell 10.9 m → 7.6 m. The
two frames that still step ~7.5 m are the `_insideBlocker` hard fallback firing as
designed, trading a jump for not standing inside a building; not defeated.
