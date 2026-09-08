Original prompt: Complete the implementation of the bug remediation plan.

## New request: implement the two remediation plans (2026-09-08)

Commit/push requested explicitly. Redundant full validator session 59523 was
stopped after the user objected to another long run. Existing evidence remains:
30 groups passed in the full run and corrected core ALL PASS in 172.9 s, with
no subsequent runtime edits. Preserve pre-existing .gitignore changes unstaged.
Push target: origin/fix/legacy-bug-remediation-2026-09-08. No production promotion.

### Current checkpoint (supersedes chronological session notes below)

User watched the visible playthrough and reported no visible FPS drops or
performance problems. Sustained desktop rates agree with that observation;
recorded RAF gaps are not yet attributed to visible gameplay defects. Do not
make speculative performance changes from those gaps alone or claim the strict
timing gate passed. Physical-device acceptance remains separate.

Visible Chrome three-run benchmark finished (session 21931, exit 1).
Runs averaged 73.93, 73.36 and 72.95 FPS; p95 13.5 ms each; max RAF gaps
266.7, 680.9 and 493.5 ms. All reached SIZE 24. Storm averages 73.74, 71.51,
73.77 FPS. Evidence: `_tokyo-remediation/headful/result.json`.
Some navigation requests were aborted; preserve these in the result rather than
claiming a clean network run. The separate functional browser check was clean.

The final bare validator finished in 2091.6 s: 30/31 groups passed, core failed
only because the progress-and-lab HUD test double lacked classList.remove.
Corrected the fixture (no runtime change); all four dedicated tests passed.
The complete core group passed in 172.9 s (session 7271, exit 0), log
`_tokyo-core-final.log`. All 31 groups now have passing results across the full
run and corrected-core rerun. No runtime implementation changed after that full
run; only the test fixture gained its missing DOM method.
Full-run evidence is `tools/pw/_tokyo-full-final.log`. No final monolithic ALL
PASS is established. Latest preview is `flywheel-448ypdw2r`; changes uncommitted.

User approved Tokyo first, architectural rather than arbitrary divisions,
meaningful breakup, growth around three minutes, direct fixed-orientation WASD
and floating touch stick, and major-only anime-style sequences. Target 60 FPS
across 2019-onward iPhone/Pixel/Galaxy devices; physical hardware is unavailable
and an asynchronous question for access remains pending.

Current work is uncommitted on the existing branch; preserve user `.gitignore`.
Two plan documents and ADRs 0025/0026 record implementation and open acceptance.
Controls, portrait FOV, presentation controller, Tokyo consolidation/bounds
queries, assembly limits, conserved base points and gradual earned growth were
implemented after RED tests. Piece count 84,122 -> 34,796, storage 39,955 entries.
15,360 bounds contacts and Tokyo collapse oracle parity passed. Initial paced
routes hit SIZE 24 at 157.2, 187.48, 157.2 simulation seconds.

Latest preview: https://flywheel-1gnaacogw-nicos-projects-896b6ff8.vercel.app
Browser flow passed actual A motion, CDP touch origin/reversal/release, three
major skips, three routine powers, natural completion, reduced motion and scene
replacement during a sequence, with no browser errors/failed requests. Additional
RED tests fixed brief feedback swallowing a major and added results-entry cleanup.
Matched whole-city/five-district images were inspected. They exposed texture
stretching: per-face WebGL2 tile repeat now preserves original density. Final
images rechecked. Bundled web-game client passed and screenshot was inspected.
RenderBudget now provides bounded render-only fallback with recovery hysteresis.

Final targeted mobileZoomControls/surfaceTiles/tokyo validator passed in 160.5 s,
including all three complete five-minute no-power growth routes. Latest UI rerun
also passed after results cleanup. Full validator finished with 29/31 groups
passing in 2118.9 s (Cambridge alone took 2118.8 s). Core stopped on stale Tokyo
help count; multiplayer failed its economy validator because it sorted by physical
count. Fixed help count and added stable Tokyo economyWeight (84122), preserving
all rewards and existing story order. New geometry-economy test went RED then GREEN.
Re-running ALL sections in both failed groups exposed an obsolete source assertion
for adaptive FOV; corrected it to require persistent baseline wiring, supported
by the actual-camera behavior test. Both complete failed groups then printed ALL
PASS in 291.8 s: tools/pw/_tokyo-retest-failed.log. No monolithic all-green rerun
has been done; do not claim one or commit without the required full commit gate.

Browser pinch check then exposed inert zoom caused by the context distance floor.
Added failing actual-camera zoom test, fixed neutral-distance scaling (0.7..1.5)
with default zoom 8, and passed mobileZoomControls/mobileCameraClarity/cameraSmoothing.
Final browser passed all flows plus two-finger spread (8 -> 13.65) and cancellation.
Harness now waits for __screens initialization (one startup race was reported).
Quiet THREE five-minute rendered sessions completed (session 37963), log
tools/pw/_tokyo-render-final.log. FPS 74.161 / 72.720 / 71.843; p95 13.5 ms in
all; p99 13.8 / 26.6 / 26.8 ms. ALL FAIL the max-stall gate: 165.8 / 1120.5 /
440.3 ms, 7 / 14 / 22 stalls >100 ms. Two storms each, major/routine collections
recorded. Last two runs activated rendering fallback. Do not claim 60-FPS
acceptance. Validators were stopped. Results/screenshots in
tools/pw/_tokyo-remediation/perf/. A SINGLE 300-second CPU-profile repeat is now
running in session 84880; tools/pw/_tokyo-late-profile.log. It will write into
_tokyo-remediation/profile (separate from acceptance evidence) and then run
tokyo-profile-report.mjs into _tokyo-profile-report.log. New instrumentation
records per-stall wall time and sim/world/camera/render costs, plus power/storm/
quality-change timeline, to locate the stalls. Hypothesis ONLY: setQuality toggles
shadows and marks every material.needsUpdate, which may cause runtime shader
compile stalls; world has no compile/compileAsync warmup. Local three r160 DOES
support compileAsync and compile traverses all mesh materials, including hidden.
Profile finished: 21 stalls, max 293.4 ms, 72.58 FPS; most CPU sample windows
were predominantly `(idle)`, with measured sim/world/render work ~2-10 ms.
Shader-compile hypothesis NOT supported. One 106.7 ms interval included a real
1023-falling-piece burst (~39 ms of sim work). Don't attribute all gaps to game
JS or claim an external cause proven: browser/compositor/GPU pacing remains open.
Retired the legacy full-screen power overlays/glows in HUD (already superseded
by major camera sequences and duration pills), after RED behavior test
tools/power-overlay-retirement.test.mjs. MobileZoomControls/gameplayEnhancements
passed. Latest preview now https://flywheel-448ypdw2r-nicos-projects-896b6ff8.vercel.app
and final functional browser test PASSED including old overlay classes hidden.
One 300-second NO-OVERLAY comparison is RUNNING in session 8371, log
_tokyo-render-no-overlays.log; current evidence writes perf/. Original three-run
evidence preserved at perf-before-overlay/. Benchmark now supports FW_HEADFUL=1
and writes headful/ separately, to compare visible Chrome frame delivery if
headless stalls persist. No headful window launched yet. Profile report is
_tokyo-profile-report.log; profiles in profile/. No shader warmup implemented.
Session 10497 did not start because
the first full run failed; earlier queued session 73153 was cancelled.

Two 90-second desktop diagnostic runs while validator was active: 74.10 FPS/
226.7 ms maximum (FAIL stall gate), then CPU-profile repeat 74.60 FPS/40.1 ms max
(PASS short gate). Both used RTX 4060 Ti hardware Chrome. Neither proves phone
performance or sustained acceptance. Profile mostly idle; support/world/HUD were
the largest game costs. Keep both outcomes. Artifacts tools/pw/_tokyo-remediation/.

Remaining: quiet sustained desktop measurement, a monolithic full pass before any
commit, physical
device sessions, visual/audio acceptance and any further airborne-budget work
required by the frame target. No other-city rollout before Tokyo acceptance;
no production promotion over Flywheel-v2. No implementation changes planned unless
validation exposes a fault. Review/stage explicit files only after checks; preserve
the pre-existing .gitignore changes.

## Current implementation

- Ranked runs filter known offline placeholder credentials, retain ticket-owner
  credentials through account changes, and keep network-failed replays queued.
- Multiplayer countdown is viewport-mounted, disposed on clear/match start,
  and protected from stale lobby callbacks.
- Sandbox result recording supplies SIZE and repairs non-finite historical maxima.
- Numeric collision-cell keys and indexed support queries preserve legacy
  physics, score and event results across all 24 playable cities.
- LOW-quality deferred coverage remains pending when movement stops, so
  unsupported buildings still collapse on the scheduled tick.
- Documentation distinguishes implemented v25 behavior from the v26 design,
  and the legacy workspace from production's separate Flywheel-v2 application.

## Verification

Tests were written and observed failing before implementation. Targeted
regressions, 28,800 contact comparisons and expanded all-city collapse parity
pass. The final full validator passed all 31 groups in 1867.0 seconds (exit 0),
including every new registered suite. Its evidence log is
`tools/pw/_remediation-full-validator-final.log`. No validator is still running.

Preview `https://flywheel-azk45ktwb-nicos-projects-896b6ff8.vercel.app`
matches all seven changed application modules. Its LOW-quality stationary
attack consumed 2,493 blocks with no console errors or failed requests.
Earlier matching countdown code passed a real two-peer match start; ranked
recovery completed a rendered 90-second run and submitted successfully.
Screenshots were inspected. The bundled browser client also ran.

## Remaining acceptance

- Local review branch: `fix/legacy-bug-remediation-2026-09-08`. Preserve the
  user's existing `.gitignore` changes and keep them unstaged. No push or
  production promotion.
- Ranked run `93885f9f-c560-4f7e-a922-67fe73e220b5` still awaits verification.
  The preview verifier credential export is redacted; manual invocation got 401.
- Production is Flywheel-v2 commit 28805e1 and has no legacy ranked API/cron.
  The user has been asked to designate a legacy acceptance environment. Do not
  replace the successor with this preview as a routine release step.
- Physical-phone acceptance is unavailable. The 4x-throttled actual game still
  misses the frame target (98.4 ms median, 309.2 ms p95 during concurrent validation).
  The full objective is not complete while these acceptance gaps remain.

See `.wiki/plans/bug-remediation-2026-09-08.md` for the requirement audit and
`.wiki/findings/PERF-2026-09-08-collision-grid.md` for all performance caveats.
Raw logs, screenshots and the chronological working log are local ignored
artifacts under `tools/pw/_remediation/` and matching `.log` files.
