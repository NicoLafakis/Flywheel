# Scoreboards & Profiles — Test Strategy

> [Requirements](02-requirements.md) · [Anti-cheat](04-anti-cheat.md) ·
> [Threat model](07-threat-model.md) · [Tasks](13-tasks.md)

The repo has no test runner and no `package.json`. **`tools/validate.mjs` is the
test suite** (`AGENTS.md`), plus a family of focused `tools/*-selftest.mjs`
scripts. This feature adds to both rather than introducing a framework.

One inherited constraint matters: per
[RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md), **the
full validator does not currently complete end to end** — the Cambridge excursion
stalls for hours. So new gates go in a standalone `tools/board-selftest.mjs` that
runs in seconds, and are additionally registered in `validate.mjs` for whenever it
is fixed. A gate that cannot run is not a gate.

---

## 1. Coverage map

| Criterion (from [02](02-requirements.md)) | Level | Where |
|---|---|---|
| S1 fixed tick count, ranked tune applied | unit | `tools/board-selftest.mjs` |
| S1 offline run starts and is saved unranked | integration | manual + live |
| S2 trace codec round-trips any input sequence | property | `board-selftest.mjs` |
| **S2 a browser-recorded run reproduces in Node** | **integration — the gate** | `board-selftest.mjs` fixture |
| S2 tier divergence: HIGH ≠ ranked tune | unit | `board-selftest.mjs` |
| S2 idempotency, ticket single-use | integration | `tools/board-live-selftest.mjs` |
| S2 unverifiable on version skew | integration | live |
| S3 name folding collisions | unit | `board-selftest.mjs` |
| S3 blocklist and reserved list | unit | `board-selftest.mjs` |
| S3 taken name returns free alternatives | integration | live |
| S4 transfer code single-use, old token dies | integration | live |
| S5 rank computed, ties by earliest | unit (SQL) | migration test |
| S5 overall points arithmetic | unit (SQL) | migration test |
| S5 never-ranked renders no row | UI | live |
| S6 v16 → v17 preserves every record | unit | `validate.mjs` schema guard |
| S6 fresh/migrated key-set parity | unit | `validate.mjs` schema guard |
| S7 hide removes from both boards | integration | live, timed |
| S7 force-rename preserves score and rank | integration | live |
| S8 airplane-mode boot | manual | live, on the deployed build |
| RLS: publishable key cannot write | **automated** | `board-live-selftest.mjs` §3 |
| No secret in the browser bundle | grep gate | `validate.mjs` |

---

## 2. The one test that matters most

**Record a run in a real browser. Replay it in Node. Assert the same score.**

Everything else in this package is downstream of that working. It goes in
`tools/board-selftest.mjs` as a committed fixture — a base64 trace, its seed,
scene, tune and expected score — and it must fail loudly if the sim changes, which
is the point: **when someone retunes physics, this test is the thing that tells
them every stored trace just became unreplayable.** That is not a nuisance, it is
the `sim_version` bump reminding you it exists.

Fixtures for at least: Chicago and Brooklyn (the light and heavy ends of T-901),
one run recorded in Chrome, one in Safari, one in Firefox. **The three-browser set
is the cross-engine determinism check** ([04](04-anti-cheat.md) §3A) and it is the
only way to find out whether T-102 is sufficient.

A check never seen to fail is not a check, so it is proved in both directions:
perturb one byte of the fixture trace and confirm the test goes red.

---

## 3. Security gates, automated

Three, all scripted:

1. **The deny test.** With the publishable key only, attempt INSERT, UPDATE and
   DELETE against every table, and SELECT against every table that is not one of
   the two views. Every one must fail. It runs per table by name from a list, so
   adding a table without adding it to the list is itself a failure.
2. **The secret grep.** `tools/validate.mjs` walks `index.html`, `js/**` and
   `css/**` for `sb_secret_`, `service_role`, `FW_TICKET_SECRET` and the literal
   value of each env var it can see. This is the same shape as
   `validateOfflineBoot()`'s existing external-origin check and belongs next to
   it.
3. **The score-path audit.** A grep over `api/**` asserting that no handler reads
   a request field named `score`, `verified_score` or `points` into anything that
   reaches a database write. Crude, and crude is right: it will catch the exact
   convenience change [07](07-threat-model.md) §2.1 warns about.

---

## 4. The two measurements that gate the build

Neither is a decision. Both have their branch written in advance.

**T-901 — is the ranked tune playable on a phone?**
Run a full 90-second ranked run on a real low-end touch device (the reference is
the Pixel-5 profile at 4× CPU throttle that `js/quality.js` already cites as its
own evidence base) on Chicago and on Brooklyn. Record median and p95 frame time.
- **Pass:** a steerable frame rate throughout. Ship the tune.
- **Fail:** set `contactRounds: 1` for **everyone, verifier included**, re-measure,
  record the new constant in `js/voxelsim.js` next to the defaults, and update
  [04](04-anti-cheat.md) §5.2. The tune must never differ between players.

**T-902 — what does a replay cost where it actually runs?**
Deploy the verifier and replay the fixture runs on Vercel. Record p50/p95
`replay_ms` and the per-run Active CPU.
- **Pass** (p95 ≤ 120 s and the monthly allowance projects comfortably): ship 90
  seconds.
- **Fail:** drop the ranked mode to 60 seconds — measured at roughly a fifth of
  the CPU ([04](04-anti-cheat.md) §2.2) — and re-measure.

**T-903 — the trace size, which nobody has ever measured.** The 1–4 KB figure is
inherited from `online-flywheel` and has never been checked against real human
input. Measure the encoded size of the T-902 fixtures. If a 90-second human trace
exceeds 32 KB the reject threshold moves; if it is far under, nothing changes.

---

## 5. Critical paths and error cases to exercise by hand

Automation cannot reach these; they are a checklist for the live pass.

- Airplane mode from boot → play a city → play a ranked run → results screen →
  reconnect → the run appears on the board with no user action.
- Kill the network mid-run. The run finishes.
- Claim a name while the server is returning 500s.
- Claim a name that is taken; take one of the offered alternatives.
- Transfer a name to a second browser profile; confirm the first can no longer
  submit and says so.
- Clear `localStorage` entirely; confirm the greyed-name state and the
  claim-a-new-name path, not a silent failure on the next submit.
- Force-rename a player from the operator page **with a stopwatch running**. The
  target is 60 seconds to gone from both boards.
- Report a row; confirm nothing visible happens.
- Open every new screen with the keyboard only.
- Open every new screen with reduced motion on.

---

## 6. Where it is verified live

Per global rule 2, local is the right surface for the sim, the codec, the
migration and the UI — all of which are equivalent locally and deployed, and all
of which run headless or in a browser against `python -m http.server`.

**Live is required** for: the deployed replay measurement (T-902 — local proves
nothing about serverless CPU), RLS behaviour against the real project, the
function deploy question in [03](03-technical-design.md) §5, and the
airplane-mode-on-the-real-build check. The URL is
<https://flywheel-woad.vercel.app>. The existing
`tools/net-live-selftest.mjs` is the precedent for a live suite kept out of the
default chain, and `tools/board-live-selftest.mjs` follows it.

**Never on localhost:** anything asserting "is it live", the RLS deny test, or the
CPU budget.

---

## 7. Regression tests this feature owes

- The `freshSave()` / `MIGRATIONS` key-set parity guard already exists in
  `validate.mjs` because a missing `sandbox` key once killed both buttons on the
  sandbox results screen. **Extend it to `player`, do not fork it.**
- Any bug found during the build gets a fixture in `board-selftest.mjs` before it
  gets a fix.
- If a `mismatch` verdict is ever traced to our own bug rather than a cheat, the
  trace that produced it becomes a permanent fixture. That is the highest-value
  test data this system can generate and it should never be thrown away.
