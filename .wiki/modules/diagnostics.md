# Diagnostics

## Quick reference

```bash
# Full diagnostics (skips live/network tests)
node tools/diagnostics.mjs --skip-live

# Full diagnostics including live API tests
node tools/diagnostics.mjs

# Full diagnostics with remediation report written to a specific file
node tools/diagnostics.mjs --skip-live --report path/to/report.md
```

## What it does

`tools/diagnostics.mjs` is the single entry point for every test, selftest, and
validator in the project. It runs them in six ordered phases, flags failures as
they happen, and optionally emits a markdown remediation report.

## Phases (run order)

| Phase | Name | What | ~Time |
|:---:|:---|:---|:---:|
| 1 | **SYNTAX** | `node --check` on every `.js`/`.mjs` under `js/` | <2 s |
| 2 | **UNIT TESTS** | Audio, rival, multiplayer (config/protocol/lobby/sim/session/e2e) | <5 s |
| 3 | **SELFTESTS** | Board replay, cinematic VFX, earthquake, music assets, train derail, import graph | <5 s |
| 4 | **PHYSICS** | Voxel drain, gravity, multi-hole regression | 5–15 s |
| 5 | **FULL SUITE** | `validate.mjs` orchestrator (18 sections, 9 parallel groups) | 15–45 s |
| 6 | **LIVE** | Board live API, live profile auth (requires network) | 30–180 s |

Phase 6 is skipped with `--skip-live` and should be omitted for local dev
iterations.

## Remediation report

When failures are found:
- A `tools/diagnostics-report.md` is auto-generated (or written to `--report` path).
- The report contains: phase summary table, each failure's error output, and
  suggested remediation steps.
- This report can be used as a task list for fixing issues.

## Convention: "run a diagnostic check"

When the user says **"run a diagnostic check"** or **"run diagnostics"**, the
agent should:

1. Run `node tools/diagnostics.mjs --skip-live --report <artifact-dir>/diagnostics-report.md`
2. Present the remediation report as an artifact if there are failures.
3. If ALL PASS, confirm the clean result with the phase timing summary.
4. If failures exist, triage them by severity (syntax → unit → physics → full suite)
   and begin remediation starting from the earliest failing phase.
