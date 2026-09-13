# Outstanding bug remediation plan

Date: 2026-09-08. Evidence baseline: local HEAD `20ae91c` (2026-08-25).
Status: implementation and verification in progress (2026-09-08). Ranked recovery, countdown layout/lifecycle and sandbox bestSize fixes pass targeted tests. Collision lookup optimization passes legacy parity tests; the final validator after the LOW-quality fix passed all 31 groups in 1867.0 seconds. Performance acceptance and the live server verdict remain incomplete.

## Scope and order

1. Restore ranked recovery after an offline identity fallback.
2. Keep the multiplayer countdown visible in a scrolled mobile lobby.
3. Remeasure Singapore performance; fix remaining bottlenecks only if reproduced.
4. Reconcile status documentation and validation coverage with current code.

The first two defects have matching current source evidence. Performance is an
open investigation, not a confirmed regression on this revision. Each fix is
a separate reviewable change with RED → GREEN → refactor evidence and covering
module/STATUS updates. Preserve the existing unrelated `.gitignore` edit.

## 1. Ranked recovery after offline fallback — high priority

**Evidence:** `js/board/run.js:startTicket()` sends `playerSecret()` unchanged.
`api/run/start.mjs` rejects invalid supplied credentials before reaching
`ensureDevicePlayer()`. `finishRun()` independently reads the secret again,
so fixing ticket creation alone can leave submission broken. See
`../modules/api.md`, “The run/start local-token-401 gap”.

**RED tests first:** add executable client request tests covering known local
fallback credentials, valid server credentials, no credentials, revoked server
credentials, and network failure. Cover the complete start → finish → outbox
retry flow, including account changes during a run and a server response with
no newly issued token. Assert request bodies and persisted identity state,
not merely source strings.

**Implementation direction:** distinguish known offline placeholder credentials
from real server credentials. Do not send placeholders as authentication at
either ticket creation or submission. Use the existing server device-player
provisioning/binding path, preserving the signed ticket's ownership through
submission. Inspect the existing name/credential adoption flow before choosing
where to persist newly issued credentials. Keep a pending requested account
distinct from a generated device identity; never claim that offline sign-in
succeeded. Do not silently downgrade arbitrary real-token 401s to another
account. Preserve local progress and queued runs; do not clear storage or
weaken server authentication. Test any outbox compatibility adjustment first.

**Done when:** an offline fallback followed by restored connectivity can start
and submit a new ranked run without clearing storage; verification attributes
the server-replayed score to the ticket owner. Invalid real credentials remain
rejected, failed submissions remain queued, and offline play still finishes.

**Verification:** identity, run-board, API-auth and outbox suites; live deployed
flow using a dedicated test identity, with request outcomes, final run verdict,
profile attribution and screenshot recorded. Account recovery must not imply
that runs started without a server ticket become retrospectively ranked.

## 2. Multiplayer countdown clipping — high priority

**Evidence:** `js/multiplayer/ui.js` mounts `#mp-countdown-modal` inside
`.screen.mp-lobby-view`; the parent scrolls and carries a backdrop filter.
The existing RCA is `../findings/RCA-2026-08-17-backdrop-filter-captures-fixed-descendants.md`.
`clear()` currently relies on removing the parent to dispose of the modal.

**RED tests first:** browser layout assertions at 360×640, 390×844 and a desktop
viewport, with an overflowing lobby at top/middle/bottom scroll positions.
Assert countdown-card bounds remain inside the viewport throughout 3→2→1.
Add lifecycle assertions for cancel, leave, match start and repeated re-entry.

**Implementation direction:** mount the fixed overlay under `document.body`,
following the respawn overlay precedent. Explicitly remove it in `clear()`;
ensure delayed animation callbacks cannot affect a later lobby. Preserve host
start authority, cancellation and the full three-second countdown.

**Done when:** host and peer both see the countdown regardless of lobby scroll;
cancel/leave/start removes the overlay; repeated sessions create no duplicate
IDs, orphan overlays or blocked clicks.

**Verification:** multiplayer lifecycle tests plus live two-browser host/peer
flow. Capture viewport coordinates, console errors, failed requests and
screenshots; a screenshot alone does not prove scroll stability.

## 3. Singapore performance — measurement before implementation

**Evidence:** STATUS reports 18.03 ms/sim step before the latest debris fix.
That fix materially reduced persistent awake debris elsewhere. The old
measurement covered 11 cities; the current catalog has 24 playable cities.

**Baseline:** run `tools/pw/hero-attack-perf.mjs` with `FW_PERF_GROW=1` for
real-play growth, then separately with pinned size for controlled comparison.
Use all current playable cities, repeated round-robin measurements and the
same machine/revision/seed/settings. Record median, p95, worst step, awake
debris, consumed blocks and post-collapse settling. Extend measurement output
only with test-first coverage. Confirm the displayed run mode is accurate.
Measuring rendered frame time on a representative phone was retired with the
physical-device gate on 2026-09-13; note that a sim result
below 16.67 ms alone does not establish 60 FPS.

**Decision:** if Singapore now meets the frame budget in the tested scenarios,
close the stale finding with new evidence. Otherwise profile support rebuilds,
contacts and active debris separately, then write a deterministic workload
regression test for the demonstrated cause before optimizing it. Consider
incremental support propagation only if the profile supports it. Preserve
approved landmark geometry, destruction behavior and scoring.

**Done when:** repeatable before/after evidence shows the reproduced bottleneck
resolved, with explicit hardware/settings and frame-time results. Use 60 FPS
(16.67 ms total frame) as the target, report remaining misses rather than
declaring success from a sim-only median. Check representative other cities
for regressions and server/browser replay parity. Bump ranked sim version if
physics outcomes change; run debris/storm regression suites.

## 4. Documentation and validation reliability

- Correct INDEX's 11-city claim to the verified 24/29 catalog state.
- Mark the Lab district, HK2, storm rework and debris fix as committed.
  Distinguish committed code from verified deployment and visual acceptance.
- Reconcile HK2's stale 2,804-piece status count against a generated current
  scene (the latest commit reports 2,463); retain its experimental, non-catalog status.
- Close stale open labels for phantom sign-in and Lab tutorial teardown only
  after running their existing regression tests. Retain the narrower ranked
  fallback issue above. Reconcile skinsheet atomicity and the recorded skin decision.
- Replace roadmap's “zero open” claim with this tracked bug inventory.
- Audit `.sop-gates.json`, `tools/validate-changed.mjs` and validator section
  registration. Recheck historical Act II exclusions before changing them;
  ensure new tests are actually invoked and non-empty scope is enforced.
- Document the instruction conflict: user-provided AGENTS requires the full
  validator, while older local gate notes prohibit it as a commit gate. Follow
  the user's requirement; focused tests accelerate RED/GREEN but do not replace
  the required full `node tools/validate.mjs` → `ALL PASS` before a covered commit.
  If runtime prevents completion, report the unfinished gate explicitly.

## Release verification and exclusions

Resolve the deployed URL before live testing; never use localhost or start a
dev server for that step. Verify the deployed revision contains the fixes,
exercise the changed flows, and record console/network failures and screenshots.
On failure report the exact break rather than silently retrying. Close each
item with commit, automated-test results, deployment revision and live evidence.

Do not reopen already-fixed debris, tornado, phantom-identity, tutorial teardown
or skinsheet defects without a failing reproduction. Camera shot choreography,
quake scoring/sequencing, Cambridge 2 and campaign Phase 3 are product decisions
or feature work, not part of this bug-remediation scope.

## Verification checkpoint (2026-09-08)

- Targeted RED/GREEN suites pass for ranked recovery/outbox, countdown layout
  and lifecycle, sandbox SIZE, collision-grid compatibility and support queries.
- All 24 playable cities pass 260-tick collapse parity against the independent
  string grid and original support scan, including score and events.
- Preview `https://flywheel-1w7bmvlek-nicos-projects-896b6ff8.vercel.app`
  passed the real two-peer countdown/match-start flow without browser errors.
- A hardware-rendered 90-second ranked run using offline-placeholder credentials
  received start/submit 200 and reached SAVED - VERIFYING, queue 0, pending profile
  preserved, no console errors or failed requests. Run
  `93885f9f-c560-4f7e-a922-67fe73e220b5` remains pending server verification.
  Exported verifier credentials are redacted; a manual invocation returned 401.
  Server-replayed score and attribution are therefore not yet proven live.
- The final validator after the LOW-quality fix passed all 31 groups in
  1867.0 s (exit 0), including all new registered regression suites. All-city pinned/growing data and the
  actual LOW-quality game measurement are complete; physical-phone acceptance
  was retired by the owner on 2026-09-13 and the synthetic frame-budget target remains unmet.
- Changes are prepared on local review branch
  `fix/legacy-bug-remediation-2026-09-08`. No push or production promotion.

### Additional reproduced defect during mobile verification

The LOW-quality `supportEvery: 2` path could discard deferred coverage work
when movement stopped. This made the initial root-game stress check idle;
those near-60FPS readings are invalid as attack measurements. A failing
scheduling regression and real Singapore reproduction establish the defect.
The pending recalc is now retained; the integration test consumes 2,470 blocks
instead of 0. Default/ranked interval 1 behavior is unchanged. The updated preview `flywheel-azk45ktwb` passed a real stationary LOW-quality
attack: 2,493 consumed blocks, SIZE 14, no console errors or failed requests.
All seven modified application modules match that preview by SHA-256. The
final full validator passed all 31 groups in 1867.0 seconds.

A separate first-solid-column contact optimization was tried with 28,800
legacy-order comparisons, then removed after limited timing benefit. The
contact parity tests remain; the simpler collision implementation is retained.

## Acceptance audit

| Requirement | Current evidence | Status |
|---|---|---|
| Known offline placeholders can start and submit | Client request/outbox regressions; rendered 90-second run, start/submit 200, queue empty | Passed |
| Identity changes preserve ticket ownership and pending profile | Account-switch and issued-token regressions; live pending profile preserved | Passed locally; live replay attribution pending |
| Server recomputes the submitted score | Server tests pass; dedicated live run remains pending | Not proven live |
| Countdown stays visible and cleans up | 27 layout cases; real host/peer start; no overlay after match start | Passed |
| Sandbox bestSize stays finite | Caller/recorder regression covers first result, missing SIZE and corrupt historical value | Passed |
| Performance measured across all 24 cities in both modes | Four datasets in collision-benchmarks JSON, with median/p95/max and final settling data | Complete |
| Physics and scoring preserved by lookup optimization | All 24 cities pass independent grid/support/contact collapse parity | Passed |
| Deferred LOW-quality support executes while stationary | RED/GREEN scheduling test; real Singapore test and deployed attack | Passed |
| Rendered performance reaches acceptance target | Viewer improves; actual LOW game remains over budget under 4x throttle | Not achieved (synthetic); physical-phone gate retired 2026-09-13 |
| Full required validator on final code | Post-LOW-fix run: ALL PASS, 31 groups, 1867.0 seconds, exit 0 | Passed |
| Documentation and gate coverage reconciled | STATUS/module updates, version/city corrections, full gate, registered regression suites | Complete |
| Deployed revision matches reviewed changes | Seven application modules match preview azk45ktwb | Passed |

The work is not complete while the live server verdict and synthetic performance
target remain unresolved. The final automated gate has passed. No production promotion is implied
by these preview checks. The physical-phone acceptance requirement was retired
by the owner on 2026-09-13.

## Deployment identity discovered during acceptance

On 2026-09-08, Vercel's production deployment metadata identifies
`NicoLafakis/Flywheel-v2`, commit `28805e15a6c5ade3dc060f50ceb1acdcd37c85fb`,
as the source of `www.playflywheel.com`. Its entry point imports `js/sim/*`;
this workspace uses `js/voxelsim.js`. Production returns 404 for the legacy
`/api/run/start` and `/api/run/verify` endpoints, and the project's deployed
cron definitions are empty. Those differences are consistent with a separate
successor application, not proof of a failed deployment of this workspace.

The remediation preview belongs to the legacy workspace. Do not promote it
over Flywheel-v2 as a routine completion step. Acceptance needs a designated
legacy deployment with a working ranked verifier; the physical-phone target
was retired by the owner on 2026-09-13.
The user has been asked to identify that environment. Existing preview runs
remain durable/pending; no authentication checks have been weakened.

## Review evidence in this workspace

| Evidence | What it demonstrates |
|---|---|
| [Two-peer countdown](../../tools/pw/_remediation/live-countdown-0.png) | Countdown visible in the deployed mobile lobby |
| [Match started](../../tools/pw/_remediation/live-multiplayer-playing.png) | Match reached gameplay with the countdown overlay removed |
| [Ranked result](../../tools/pw/_remediation/live-ranked-results.png) | 90-second run saved for verification; this is not a verified-score verdict |
| [LOW-quality collapse](../../tools/pw/_remediation/mobile-game-fixed.png) | Updated preview shows 13% cleared, SIZE 14 and a 2,493 chain |
| [All-city benchmark data](../findings/2026-09-08-collision-benchmarks.json) | Four 24-city datasets and their measurement caveats |
| [Performance report](../findings/PERF-2026-09-08-collision-grid.md) | Before/after measurements, correctness finding and remaining budget misses |

Screenshots and raw browser logs are local, ignored verification artifacts;
the plan and benchmark report accompany the local review branch. No push or
production promotion has been performed.
