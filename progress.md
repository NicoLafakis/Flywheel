Original prompt: Complete the implementation of the bug remediation plan.

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
