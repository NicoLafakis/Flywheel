# RCA — The Lab: post-level buttons dead, then pause-menu RESTART hangs at 98% (2026-08-20)

**Status: FIXED (2026-08-20).** Both call sites in `js/main.js`
(`teardownWorld()` at line 1104, `buildSandbox()` at line 1014) now call
`tutorialManager.teardown()` instead of the nonexistent `.unmount()`. A
regression test (`tools/tutorial.test.mjs`, section `tutorialOnboarding`)
scans `js/main.js` for every `tutorialManager.<method>()` call and asserts
it exists on `TutorialManager.prototype`; it was confirmed to fail against
the pre-fix code (`tutorialManager.unmount(), but TutorialManager has no
such method`) and passes after the fix. `node tools/validate.mjs` prints
`ALL PASS`. The section-7 "defense in depth" (per-subsystem try/catch in
`teardownWorld()`) and the section-6 unrelated `bestSize: NaN` bug were not
addressed by this fix — both remain open, see section 7/8 below.

**Status (original, pre-fix):** root cause confirmed by live reproduction
against production (www.playflywheel.com), one bug, not two. Not fixed by
this document (diagnosis only).

**Reporter:** Nico Lafakis, playtest report, 2026-08-20.
**Severity:** high. Any new or tutorial-eligible player who finishes or
restarts The Lab (the first, mandatory city) can be soft-locked on a frozen
screen with no in-game recovery. This is the player's first five minutes with
the game.

---

## 1. Symptom

**As reported:** After winning "The Lab," neither of the two results-screen
buttons (return to main menu, go to city select) responded to clicks. The
player then opened the pause menu and pressed RESTART instead, which showed a
loading/percentage bar that climbed and then hung at 98%, never completing.

**Precise characterization:** Both results-screen buttons and the restart
path are wired through the same teardown function, `teardownWorld()`
(`js/main.js:1094`), and that function throws every time it is called while a
tutorial overlay is active. The Lab is the only city that ever activates a
tutorial overlay for a given player, so the failure is scoped to The Lab (or,
more precisely, to any city played while `save.tutorialCompleted` is still
false). "Buttons do nothing" and "restart hangs at 98%" are the same defect
surfacing at two different call sites of the same throwing function.

---

## 2. Root cause (confirmed, not speculative)

`js/ui/tutorial.js` defines `class TutorialManager` with a teardown method
named **`teardown()`** (`js/ui/tutorial.js:286-292`). It has never had a
method named `unmount`.

`js/main.js` calls the wrong name at both of its two call sites:

- `js/main.js:1104` (`teardownWorld()`, the shared teardown every navigation
  path funnels through):
  ```js
  if (tutorialManager) { tutorialManager.unmount(); tutorialManager = null; }
  ```
- `js/main.js:1013-1015` (`startVoxelSandbox`'s `buildSandbox()`, the branch
  that tears down a stale tutorial manager when the player launches a
  non-tutorial scene):
  ```js
  } else if (tutorialManager) {
    tutorialManager.unmount();
    tutorialManager = null;
  }
  ```

`tutorialManager` is only ever non-null when `shouldShowTutorial(save, scene)`
returned true at level start (`js/ui/tutorial.js:46-51`), which is true only
for `scene === 'gallery'` (The Lab) and only until `save.tutorialCompleted` is
set. For every other city, or for a returning player who has already cleared
the tutorial, `tutorialManager` is `null` and `teardownWorld()` returns
cleanly — which is why this defect is invisible everywhere except The Lab, and
why it did not surface until now.

**Confidence: confirmed.** Reproduced live against production with the game's
own debug hooks (`window.__sim`), not inferred from reading code alone (see
section 5).

---

## 3. Causal chain

**Trigger:** A player (new guest, or anyone with `save.tutorialCompleted`
still false) plays The Lab, which is the only scene that constructs a
`TutorialManager` (`js/main.js:1006-1012`).

**Proximate cause 1 — dead results buttons.** The Lab is played via the
"voxel sandbox" path (`isVoxelSandbox = true`), so ending the level calls
`endSandbox()` (`js/main.js:2033`), which renders
`screens.showSandboxResults()` (`js/ui/screens.js:1057`). Both of its
buttons' `onclick` handlers funnel into the same `onContinue` callback
(`js/main.js:2057-2085`), and both the "menu" and "cities" branches call
`teardownWorld()` first (`js/main.js:2079` and `js/main.js:2081`).
`teardownWorld()` throws at `js/main.js:1104` on
`tutorialManager.unmount is not a function` before it ever reaches
`backToTitle()` or `screens.showCitySelect()`. The click handler dies mid-way;
the results screen never advances; from the player's side, the button "does
nothing."

**Proximate cause 2 — restart hangs at 98%.** The pause menu's RESTART calls
`screens.actions.restart()` (`js/main.js:314-318`), which for a sandbox scene
calls `startVoxelSandbox(lastSandboxScene, lastSandboxMode)`
(`js/main.js:852`). `startVoxelSandbox` immediately shows the loading screen
(`screens.showLoading(...)`, `js/main.js:864`) — a purely cosmetic,
time-scripted progress bar that is hardcoded to sit at 98%
("INITIALIZING PHYSICS GRAPH…") from ~340 ms onward regardless of the real
work underneath (`js/ui/screens.js:1024-1046`) — and then asynchronously runs
`buildSandbox()`. `buildSandbox()` calls `teardownWorld()` at
`js/main.js:877`, which throws the same `tutorialManager.unmount is not a
function` TypeError. That rejection IS caught, by
`buildSandbox().catch((err) => failSceneLaunch(scene, err, 'cities'))`
(`js/main.js:1051-1053`) — confirmed live by the console line
`Flywheel: cannot launch scene 'gallery' — the world was not built...`
(`js/main.js:1072-1076`). But `failSceneLaunch()` itself calls
`teardownWorld()` again, unconditionally, at `js/main.js:1084`, with no
try/catch around it — and `tutorialManager` is still the same non-null,
still-broken reference (the earlier throw happened before
`tutorialManager = null` could run). This second call throws the identical
TypeError, this time with nothing downstream to catch it: it is a genuine
uncaught exception inside a `.catch` handler. `failSceneLaunch()` dies before
it reaches `screens.showCitySelect()` / `backToTitle()` at the end of the
function, so the screen is never replaced. The loading screen's own
`animate()` loop only stops when `this.current !== 'loading'`
(`js/ui/screens.js:1038`), which never happens — so the cosmetic bar is left
frozen at whatever it had climbed to (measured live at 96%, settling toward
its scripted 98% ceiling), forever.

**Root cause:** a method-name mismatch introduced when `TutorialManager` was
authored — `js/ui/tutorial.js` shipped with `teardown()` as the real method
name, while both call sites in `js/main.js` were written calling `.unmount()`.
This is a naming/contract drift between the two files, not a runtime edge
case — the two call sites in `main.js` never matched the class's actual API
at any point in its history, so the defect is confirmed **as old as
`TutorialManager` itself**, latent until a fresh (or tutorial-incomplete)
player exercised The Lab's teardown path.

**Contributing factors:**
1. `teardownWorld()` has no try/catch around any of its per-subsystem
   teardown calls (`js/main.js:1094-1113`), so one broken call (the
   tutorial manager) takes down every navigation path that funnels through
   it — pause-menu RESTART, CITIES, MAIN MENU, and (per this RCA) the failure
   recovery path itself.
2. `failSceneLaunch()`, whose entire purpose is to be the safety net for a
   throw during scene construction (`js/main.js:1056-1071`, its own comment:
   *"Uncaught, that is an unhandled promise rejection under a loading screen
   that never resolves"*), calls the very same unguarded `teardownWorld()`
   that can throw — so the safety net is exposed to the identical failure
   mode it exists to catch, with nothing behind it. The fix that was meant to
   guarantee "never leave the player on a dead loading screen" is bypassed by
   this bug.
3. This is the second time this exact class of bug — an uncaught throw as
   the first statement of a shared results/teardown callback, silently
   killing every button that shares it — has shipped. Commit `d20c64e`
   ("fix(save): freshSave never created `sandbox`, stranding players on the
   results screen," 2026-08-06) fixed the identical symptom for a different
   cause (a missing `save.sandbox` container) and added a validator guard for
   *that* cause, but the pattern itself (unguarded first-statement throw in a
   shared callback) was not generalized into a structural guard, so it
   recurred here via a different unguarded call.

---

## 4. Why only The Lab, and why now

- `shouldShowTutorial()` (`js/ui/tutorial.js:46-51`) gates the tutorial to
  `scene === 'gallery'` only — no other city ever constructs a
  `TutorialManager`, so no other city's teardown path touches the broken
  call.
- Once a player finishes the tutorial (`save.tutorialCompleted = true`, set
  in `TutorialManager._complete()`, `js/ui/tutorial.js:275-280`), the manager
  is never constructed again, and the bug goes permanently dormant for that
  save. A tester or long-time player whose save already carries
  `tutorialCompleted: true` cannot see this at all, which is almost
  certainly why it shipped unnoticed.
- Any BRAND NEW player (a fresh guest save, or anyone who clears
  `localStorage`) hits this on their very first Lab session, every time,
  with no workaround short of a full page reload.

---

## 5. Evidence log

Reproduced against **production** (`https://www.playflywheel.com`), via
`browser-playwright`, headless Chromium, fresh guest save (no prior
localStorage), using the game's own debug hooks
(`window.__sim`, exposed at `js/main.js:889`) to fast-forward the level clock
rather than waiting out real time — the code path exercised is identical
production code either way; only the wall-clock wait was skipped.

**Run A — results-screen click, forced win via `sim.clockTicks = sim.clockLimit`:**
```
BUTTONS_ON_SCREEN: ["🔊","","RETRY","CHANGE MAP","MAIN MENU"]
CHANGE_MAP_FOUND: true
... click .results-btn-cities ...
PAGEERROR: tutorialManager.unmount is not a function
TypeError: tutorialManager.unmount is not a function
    at teardownWorld (https://www.playflywheel.com/js/main.js:1104:42)
    at https://www.playflywheel.com/js/main.js:2081:7
    at s.querySelector.onclick (https://www.playflywheel.com/js/ui/screens.js:1135:60)
SCREEN_AFTER_CLICK: screen results-screen | TIME'S UP! ... (unchanged)
```
Confirms proximate cause 1 exactly: the click handler at
`js/ui/screens.js:1135` fires, calls into `js/main.js:2081`, and dies inside
`teardownWorld()` before the screen changes.

**Run B — mid-game pause-menu RESTART (no results screen involved at all,**
**tutorial manager active from a live, in-progress Lab session):**
```
RESTART_BTN_VISIBLE: true
CONSOLE error: Flywheel: cannot launch scene 'gallery' — the world was not
  built, so the player has been returned to the menu rather than left on the
  loading screen. TypeError: tutorialManager.unmount is not a function
    at teardownWorld (https://www.playflywheel.com/js/main.js:1104:42)
    at buildSandbox (https://www.playflywheel.com/js/main.js:877:5)
PAGEERROR: tutorialManager.unmount is not a function
LOADING_PCT_AFTER_2S: 71%
LOADING_PCT_AFTER_8S: 96%
LOADING_SCREEN_GONE: false
```
This is the stronger of the two reproductions: it shows the RESTART hang
occurring independently of the dead results-screen buttons (no results screen
was ever reached in this run — RESTART was pressed mid-play), which is what
proves this is **one root cause with two exposure points**, not "results
screen breaks state, which then poisons restart." Both symptoms are
independently reachable from the same unguarded call.

**Falsified/ruled-out hypotheses**, recorded so the next investigator does
not re-walk them:
- *Missing `sim.goal` / `SCENE_GOALS.gallery` entry* — checked
  `js/voxelsim.js:557`, present and correctly falls back
  (`js/voxelsim.js:1036`). Not the cause.
- *`recordSandboxResult` throwing on a missing container* — `js/save.js:624`
  has the `if (!save.sandbox) save.sandbox = {}` seatbelt added by the prior
  RCA (`d20c64e`); does not throw. (It DOES silently write `bestSize: NaN`
  because `size` is never passed by its only caller — a real but unrelated
  cosmetic bug; see section 6.)
- *An exception during template construction in `showSandboxResults`*
  (e.g. `sim.goal.name`, `cityEntry.debrief`) — read line by line, all
  guarded with `||`/`&&` fallbacks; none throws for a fresh save or for
  the gallery scene specifically.
- *The fake 98%-cap loading bar itself being the bug* — it is cosmetic and
  behaves exactly as designed (`js/ui/screens.js:1024-1046`); it never
  reaches 100% on its own by construction and is meant to be silently
  replaced the instant the real build finishes. It correctly exposes the
  real hang (the screen it is on is never dismissed) rather than causing one.
- *Headless-browser rAF throttling as an explanation for slow game-clock
  progress during the first, non-forced playtest attempt* — an artifact of
  the test harness (backgrounded/headless tabs throttle
  `requestAnimationFrame`), not a product bug; abandoned in favor of driving
  the debug hooks directly, which exercises the same production code
  without depending on real wall-clock timing.
- *ADR-0022's Lab-only camera occlusion / 3-tower testbed geometry* being
  implicated — read in full; it is pure camera math and scene geometry, no
  DOM/click involvement, and instance state resets on every `new
  ChaseCamera()`. Not the cause, though it does confirm The Lab is
  structurally unique (only scene with `smoothOcclusion` and its own
  synthetic skyscraper testbed) — a red herring worth documenting since it
  is the most visible "why is Lab special" answer, but not this bug's cause.

---

## 6. Blast radius and sibling instances

**Both call sites share the defect** (same file, same wrong method name):
- `js/main.js:1104` — `teardownWorld()`, used by MAIN MENU, CHANGE MAP/CITIES,
  quit-to-map from pause, and (per this RCA) `failSceneLaunch`'s own recovery
  path. This is the one reproduced live.
- `js/main.js:1014` — inside `startVoxelSandbox`'s `buildSandbox()`, fires
  when a player finishes The Lab's tutorial-eligible session and then
  launches ANY other city or the ranked run mode while `tutorialManager` is
  still active (i.e., left The Lab without completing the size-2 tutorial
  milestone that calls `_complete()`). Not yet reproduced live in this
  session, but it is the identical `tutorialManager.unmount()` call against
  the identical class, so it is expected to fail identically. Should be
  covered by the same fix and the same regression test.

**Structural sibling (same class of bug, already fixed once before):**
commit `d20c64e` fixed the same symptom (both results buttons dead) for a
different cause. Grep confirms `recordLevelResult`/`recordSandboxResult`
still both carry the defensive seatbelt from that fix
(`js/save.js:600`, `js/save.js:624`), but `teardownWorld()` and
`failSceneLaunch()` were never given the equivalent guard — this bug lives in
the part of the shared callback the previous fix did not touch.

**Separate, unrelated bug found in passing (not this RCA's cause, worth its**
**own ticket):** `js/main.js:2067-2076`'s call to `recordSandboxResult` never
passes a `size` field, and `js/save.js:633`
(`bestSize: Math.max(prev.bestSize, size)`) has no default for either side —
`Math.max(undefined, undefined)` evaluates to `NaN`, so `save.sandbox[scene].bestSize`
is silently written as `NaN` on every sandbox completion, for every city, for
every player. It does not throw (NaN is falsy, so the one display site,
`js/ui/screens.js:728`, degrades gracefully to `'—'`), so it is cosmetic, not
part of this bug's blast radius, but it is a second, independent
"caller/schema drift" defect in the exact same function this RCA already had
open. Flagging for a follow-up fix rather than folding it in here.

---

## 7. Fix specification

**File: `js/main.js`**

1. Line 1104 — change `tutorialManager.unmount();` to
   `tutorialManager.teardown();`.
2. Line 1014 — change `tutorialManager.unmount();` to
   `tutorialManager.teardown();`.
3. Defense in depth, because this is the second time an unguarded throw in
   a shared teardown/callback has taken out every navigation button that
   shares it: wrap each independent subsystem teardown inside
   `teardownWorld()` (`js/main.js:1094-1113`) so that one subsystem's
   failure cannot block the others from running, e.g.
   ```js
   function safeTeardown(label, fn) {
     try { fn(); } catch (e) { console.error(`Flywheel: teardown step '${label}' threw`, e); }
   }
   ```
   and call each of `stopMenuScene()`, `screens.dismissPokemonEncounterModal()`,
   `screens.dismissEarthquakeCinematic()`, the `readyGate.dismiss()` branch,
   the `tutorialManager.teardown()` branch, `world.dispose()`, `mpHost.destroy()`,
   `mpPeer.destroy()`, and `mpUI.hideRespawnOverlay()` through it. This is the
   generalization the section-3 "contributing factors" note says the prior fix
   (`d20c64e`) should have made but didn't: no single subsystem's teardown
   should be able to strand the player.
4. `failSceneLaunch()` (`js/main.js:1071-1092`) calls `teardownWorld()` at
   line 1084 with no guard of its own; once (3) is done this becomes moot
   (teardownWorld can no longer throw), but if (3) is deferred, at minimum
   wrap this specific call in a try/catch so the function is guaranteed to
   reach `screens.showCitySelect()`/`backToTitle()` even if teardown fails.

**File: `js/save.js`** (separate, unrelated fix, not required to close this
RCA but found in the same audit — see section 6): add `size` to the fields
`recordSandboxResult`'s only caller passes (`js/main.js:2067-2076`), sourcing
it from `finished.hole.size` (the same object `bestCombo`/`mass` are already
read from), or give `recordSandboxResult`'s destructure a `size = 0` default
matching the pattern already used for `bestCombo`/`score`/`won`/`percent`.

**Regression tests to add** (this repo's test suite is
`node tools/validate.mjs`; UI/main.js is not currently covered by it, so this
also means deciding where a DOM-level regression test for `js/main.js` lives
— flagging as a gap rather than guessing):

1. A test that constructs a `TutorialManager`, then asserts every method
   `js/main.js` calls on it (`.teardown`, `.onEat`, `.onSizeUp`, `.onCombo`,
   `.onCollapse`, `.onPowerUpSpawn`, `.onPowerUpCollected`) actually exists on
   the class — a cheap static contract check that would have caught this
   without needing to reach The Lab at all. Natural home: a small assertion
   in `tools/validate.mjs` or a dedicated `js/ui/tutorial.contract.test.mjs`
   that imports both `TutorialManager` and greps/lists the call sites, or
   simply instantiates the class and calls each method name main.js is known
   to call.
2. A live/browser-level regression (Playwright, against a preview deployment,
   never localhost) that: starts The Lab on a fresh save, forces the level to
   end (the game already exposes `window.__sim` for exactly this), clicks
   each results button, and asserts the screen actually changes
   (`document.querySelector('.results-screen')` becomes null). This is the
   test that would have caught BOTH symptoms in this report, because it
   exercises the real `teardownWorld()` call, not a mock.
3. Once (3) in the fix spec (per-subsystem try/catch) lands, a test that
   deliberately breaks one subsystem's teardown (e.g. injects a throwing stub
   for `world.dispose`) and asserts the other subsystems still tear down and
   navigation still completes — proving the isolation actually isolates.

---

## 8. Prevention

**The class of bug, not the instance:** a shared callback or teardown
function where the FIRST statement can throw silently kills every UI control
that funnels through it, and nothing in the UI layer tells the player
anything happened — no error toast, no fallback state, just a dead button.
This has now shipped twice (`d20c64e`, and this RCA) from two unrelated
causes hitting the identical failure shape. The fix in section 7.3 (isolate
each teardown step) addresses the shape once, for every future subsystem
added to `teardownWorld()`, rather than requiring a third RCA to catch the
next unrelated cause.

**Process gap:** neither call site (`js/main.js:1104`, `js/main.js:1014`) nor
the class they call (`js/ui/tutorial.js`) has ever been covered by
`tools/validate.mjs`, and both drifted from day one. The project's own
CLAUDE.md requires `node tools/validate.mjs` before any commit touching
`js/citygen.js`, `js/sim.js`, `js/tiers.js`, `js/levels.js`, `js/voxelsim.js`,
the voxelscene files, or `js/voxelkit.js` — `js/main.js` and
`js/ui/tutorial.js` are outside that required list entirely, so a UI-layer
contract break like this one has no gate that would ever have caught it,
independent of whether anyone remembered to run the validator. Recommend
extending the validator's required-file list (or adding a lightweight
UI-contract check per item 7's regression test 1) to cover `js/main.js`'s
calls into `js/ui/*.js` classes, since this is exactly the seam where a
rename in one file and a stale call in another goes unnoticed — the two
files are edited independently, by different authors/sessions, with nothing
structural holding their contract together.
