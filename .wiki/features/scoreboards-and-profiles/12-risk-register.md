# Scoreboards & Profiles — Risk Register

> [Objective overview](00-objective-overview.md) ·
> [Anti-cheat](04-anti-cheat.md) ·
> [Threat model](07-threat-model.md) ·
> [Observability & budgets](09-observability-and-budgets.md) ·
> [Rollout & runbook](10-rollout-and-runbook.md) ·
> [Tasks](13-tasks.md)

**Date:** 2026-08-12 · **Status:** planning, nothing built

---

## How to read this

- **Likelihood / Impact:** Low / Medium / High. Impact is judged against two
  assets, not against a normal software release: the **believability of the
  board** — a board nobody believes is worse than no board, because it converts
  the score plate, which is currently honest, into decoration
  ([00](00-objective-overview.md)) — and the **monthly CPU allowance**, which on
  Vercel Hobby is 4 CPU-hours, roughly 436 verifications at the measured 33 s
  ([09](09-observability-and-budgets.md) §4.1). A bug that would be a Tuesday
  afternoon anywhere else is a High if it spends either.
- **Early-warning signal:** the specific observable that appears *before* the
  risk lands. Several risks here have none — they are binary and discovered by
  measuring — which is exactly why the three measurements
  ([T-901/T-902/T-903](13-tasks.md)) gate the build rather than follow it.
- **Owner:** **Lead** = engineering. **Nico** = product owner: decisions,
  dollars, and the operator page.
- **Contingency trigger:** the pre-agreed condition at which we stop fixing and
  start executing the fallback. The branches for the three measurement risks are
  already decided; the register exists so the rest are too.

Risks are ordered by how much they should shape the build order, not by score.
Every entry names the doc that owns the detail; this register ranks, it does not
re-argue.

---

## The register

### R1 — A submission flood burns the month's CPU allowance (denial of wallet)

| | |
|---|---|
| **Category** | Cost / availability |
| **Likelihood** | Medium — adversary D ([07](07-threat-model.md) §1) needs no skill: 436 replayed requests is the entire Hobby month, and the endpoint is documented in the client everyone can read |
| **Impact** | **High** — the allowance is gone for the month; `pending` rows stop draining; the ranked mode is dark while the game, mercifully, is not |
| **Why** | Replay CPU is the metered resource and an unbounded replay path is a denial-of-wallet vector before it is anything else ([04](04-anti-cheat.md) §5.5). [07](07-threat-model.md) §4.1 names this the highest-severity operational risk in the feature. |
| **Early-warning signal** | Executed replays approaching 500 in an hour (the soft alert); the weekly `verdict` histogram showing `pending` not draining or the `unranked` fraction falling ([09](09-observability-and-budgets.md) §2). A genuinely popular week and an attack look the same at first — only one of them should be throttled, which is why the first lever is an alert, not a block. |
| **Mitigation** | Three independent gates, all structural: the placement gate (most submissions are never re-simulated), rate limits on **ticket issuance** as well as submission counted in Postgres (an in-memory counter across non-shared serverless instances is a limit that does not exist), and a hard ceiling of 20 executed replays per player per hour ([04](04-anti-cheat.md) §7). |
| **Owner** | Lead (limits, alert) · Nico (the plan-tier question in [09](09-observability-and-budgets.md) §4.1) |
| **Contingency trigger** | The allowance is projected to run out ⇒ the [10](10-rollout-and-runbook.md) §3.3 ladder, in order, cheapest first: tighten the placement gate (top 200 → top 50), lower the per-player ceiling, drop the ranked mode to 60 s (~5× cheaper), then `FW_BOARDS_ACCEPTING = off`. The plan tier is considered only after all four. |

### R2 — A determinism regression rejects honest players

| | |
|---|---|
| **Category** | Integrity — the self-inflicted kind |
| **Likelihood** | Medium — physics changes land in this repo constantly, and the fixture is the only tripwire between a sim tweak and a wave of false `mismatch` verdicts |
| **Impact** | **High** — the victim is an honest player, and the failure ADR-0012 itself warned was more likely than any attack is the defence rejecting people who did nothing. PolyTrack shipped *"valid replays being marked invalid"* on a determinism-verified board ([04](04-anti-cheat.md) §3A.4). |
| **Early-warning signal** | The weekly `verdict` histogram: `mismatch` rising is **our bug before their cheat** — a cheat is rare and lumpy, a determinism regression is broad and sudden ([09](09-observability-and-budgets.md) §2). A browser-correlated cluster means the cross-engine hole. The committed three-browser fixture going red after a sim change ([08](08-test-strategy.md) §2). |
| **Mitigation** | `sim_version` discipline with `unverifiable`-never-`rejected` ([03](03-technical-design.md) §3.2); T-102, the ten-call-site `Math.*` fix, landed **before any trace is ever stored** ([11](11-migration-plan.md) §5); a `mismatch` rate above ~1% treated as a defect in this system, not evidence of cheating; nobody is ever accused on the strength of a verdict ([10](10-rollout-and-runbook.md) §3.2). |
| **Owner** | Lead |
| **Contingency trigger** | `mismatch` jumps ⇒ [10](10-rollout-and-runbook.md) §3.2: check for a sim deploy without a `sim_version` bump; reproduce the divergence tick in `board-selftest.mjs` and keep that trace as a permanent fixture; if browser-correlated, widen the tolerance as a stopgap and fix the call site properly. |

### R3 — The ranked tune is not playable for 90 s on a low-end phone

| | |
|---|---|
| **Category** | Measurement / fairness |
| **Likelihood** | Unknown — that is the point of T-901. The tune is the load-bearing assumption of the whole design and **it has never been measured on a phone** ([04](04-anti-cheat.md) §5.2) |
| **Impact** | High if discovered after boards have history: the fallback changes the trajectory, and a tune that differs between players — including between early and late players — is the one thing that must never happen. `tune_id` tags the rows; it does not make two tunes comparable on one board. |
| **Early-warning signal** | None. It is binary and it is discovered by measuring, which is why T-901 gates the build instead of following it ([08](08-test-strategy.md) §4). |
| **Mitigation** | Measure first, on a real low-end touch device, on Chicago **and** Brooklyn — the two extremes — before any board goes live; a city whose 90-second replay busts the budget is simply not offered as a ranked city until it does ([04](04-anti-cheat.md) §9, [03](03-technical-design.md) §2.1). The fallback is written in advance: `contactRounds: 1` for **everyone, verifier included**, re-measured and recorded in `js/voxelsim.js` next to the defaults. |
| **Owner** | Lead |
| **Contingency trigger** | T-901 fails ⇒ apply the fallback tune and record the new constant. What is not allowed is shipping unmeasured, or letting the tune differ between players. |

### R4 — The deployed replay costs more than the budget projects

| | |
|---|---|
| **Category** | Measurement / cost |
| **Likelihood** | Medium — the ~33 s figure is from the development box and is honestly labelled inference; nobody has run it on a serverless vCPU ([04](04-anti-cheat.md) §9) |
| **Impact** | Medium — the fallback is pre-decided and cheap to take, but taking it halves the ranked experience |
| **Why** | The binding constraint is not invocation duration (300 s Hobby / 800 s Pro) but the monthly Active CPU allowance ([04](04-anti-cheat.md) §5.1). At 66 s per replay the Hobby month is 218 verifications, not 436. |
| **Early-warning signal** | T-902's p50/p95 `replay_ms` and per-run Active CPU against the projection ([08](08-test-strategy.md) §4); then the §2 histogram's `replay_ms` average week over week. |
| **Mitigation** | The rule is stated so it is not a matter of taste later: p95 over 120 s, or the allowance projected to run out, drops the ranked mode to 60 seconds — a new value of `runs.mode`, not a new table and not a new decision. T-903 rides the same fixtures and settles the 32 KB reject threshold with real human traces. |
| **Owner** | Lead (measurement) · Nico (if the answer is "the plan", since Hobby is non-commercial-only — [09](09-observability-and-budgets.md) §4.1) |
| **Contingency trigger** | T-902 p95 > 120 s or the projection busts ⇒ drop to 60 s and re-measure. Two months over the allowance ⇒ the same drop, before anything else changes ([09](09-observability-and-budgets.md) §4.1). |

### R5 — The zero-dependency deploy story buckles under `api/`

| | |
|---|---|
| **Category** | Architectural / operational |
| **Likelihood** | Medium that something in it bites — 03 §5 is explicit that the deploy paragraph is inference until somebody deploys one |
| **Impact** | Medium with the fallback, **High without discipline**: a root `package.json` with dependencies is an ADR-0014 supersession, and slipping it in breaks the property that lets the validator import the shipping sim with no transform |
| **Why** | The verifier's whole value is `import { VoxelSandboxSim } from '../js/voxelsim.js'` — one physics implementation. Vercel serves zero-dependency `api/*.mjs` as ES modules, but that has never been done on this project, the function bundle's cold-start parse cost is real (the scene set is ~1.4 MB of source), and which Vercel plan this project is on is unconfirmed ([03](03-technical-design.md) §5, [01](01-prd.md) §20). |
| **Early-warning signal** | None gradual — it is binary and discovered by deploying. That is why the spike goes first (T-300). |
| **Mitigation** | Verify the three §5 items **before T-301 starts**: zero-dependency `api/*.mjs` deploys with no root manifest; the bundle fits and the cold start is counted in the scene-build figure (one function per ranked scene, or lazy `loadScene()`); the plan is confirmed. The only acceptable fallback is a `package.json` scoped **inside `api/`** with no dependencies. |
| **Owner** | Lead · Nico (the plan question) |
| **Contingency trigger** | The zero-dependency deploy fails ⇒ the scoped-`api/` fallback. Anything beyond that gets argued as an ADR-0014 supersession, never slipped in. |

### R6 — A crafted-but-valid trace tops the board

| | |
|---|---|
| **Category** | Integrity — the acknowledged hole |
| **Likelihood** | Low-Medium, rising with any attention the game gets. We ship the greedy bot that beats the game in `tools/validate.mjs`; the tool that proves the game is fair is the tool that would beat it ([04](04-anti-cheat.md) §6) |
| **Impact** | Medium — the one-sentence rule stays technically true (the number *was* recomputed), and the honest framing is published in advance, but a scripted #1 is still a lie about who played |
| **Why** | Replay proves a trace produces a score under our physics over the real duration. It cannot prove a human produced the trace, and no input-replay game has ever closed this — TETR.IO needed handcam forensics; Trackmania's community required hardware attestation ([04](04-anti-cheat.md) §4.2, §6). |
| **Early-warning signal** | `flagged` verdicts rising in the weekly histogram; the heuristics firing on one player repeatedly ([09](09-observability-and-budgets.md) §2). |
| **Mitigation** | Heuristics — input entropy, direction-reversal rate, zero-input fraction, sub-tick timing — **flag into a review state, never reject**, with thresholds server-side only; a false accusation on a public board costs more than a fake score. The one-tap hide removes the visible problem in seconds ([06](06-privacy-and-moderation.md) §4). |
| **Owner** | Lead (thresholds) · Nico (the hide) |
| **Contingency trigger** | A bot is visibly spoiling a board ⇒ [10](10-rollout-and-runbook.md) §3.5: confirm the runs verify (they will), check `flagged`, adjust thresholds server-side, hide the player. **Do not start an arms race** — that position was decided in advance precisely so the moment does not become a project. |

### R7 — An offensive or impersonating name reaches a public board

| | |
|---|---|
| **Category** | Reputational / moderation |
| **Likelihood** | Medium — a public page carrying user-typed strings is a moderation surface whether or not anyone planned for one, and the griefer is likely at least once ([07](07-threat-model.md) §1) |
| **Impact** | High for a board whose entire pitch is trust. The overview's line: a public board with a name field and no moderation is not a finished feature, it is an incident waiting for a date ([00](00-objective-overview.md)) |
| **Why** | Layers 1–5 of the name pipeline (charset, folding, blocklist, reserved list, report-never-hides) will miss something; their job is to reduce how often layer 6 runs, not to replace it ([06](06-privacy-and-moderation.md) §3). The matcher is ~30 lines over a vendored word list, and the best available library says of itself that no filter is perfect. |
| **Early-warning signal** | The operator page's recent-claims list; reports accumulating against one row (N distinct reporters raise it); severity 1–2 blocklist flags ([06](06-privacy-and-moderation.md) §3.1). |
| **Mitigation** | **Phase 5 is built last and enabled first** — moderation ships before the boards are public, not after ([10](10-rollout-and-runbook.md) §1). FORCE RENAME is the default remedy, because the offensive thing is the string, not the score; HIDE removes the player from both views on the next read, no backfill, no deploy. The 60-second target is rehearsed and timed with a stopwatch before launch ([10](10-rollout-and-runbook.md) §5). |
| **Owner** | Lead (the lever) · Nico (pulls it; the page holds a secret only the owner has) |
| **Contingency trigger** | One bad name ⇒ force-rename. Worse than one name ⇒ HIDE. Broader than one player ⇒ `FW_BOARDS_ACCEPTING = off` buys time without taking the game from anyone; add the pattern to `blocked_names` — a table, not a deploy ([10](10-rollout-and-runbook.md) §3.1). |

### R8 — The one convenience edit: a client-writable score path, or a secret in the bundle

| | |
|---|---|
| **Category** | Build-time process |
| **Likelihood** | Medium — "it will be tempting during the build" is the overview's own warning ([00](00-objective-overview.md)); [07](07-threat-model.md) §2.1 names it the residual of the strongest defence in the system |
| **Impact** | **Highest in this document relative to effort** — one `score` column, one pasted key, and the one-sentence rule is no longer true and no number on the board can be believed |
| **Why** | The load-bearing invariant ([01](01-prd.md) §2) is a rule about what must *never* exist, and rules like that are not eroded by attackers but by convenience. |
| **Early-warning signal** | None in production — which is why all three mitigations are scripts, not vigilance. |
| **Mitigation** | `AGENTS.md` invariant 7 plus the three automated gates of [08](08-test-strategy.md) §3: the publishable-key deny test per table by name, the secret grep over everything the browser loads, and the score-path audit over `api/**`. A table added without adding it to the deny list is itself a failure. |
| **Owner** | Lead |
| **Contingency trigger** | A red gate blocks the review — there is no ship-it-and-fix. A leaked `SUPABASE_SECRET_KEY` or `FW_TICKET_SECRET` is a key-rotation incident, not a threat-model event ([07](07-threat-model.md), scope note). |

### R9 — The v17 migration strands an existing player on a dead screen

| | |
|---|---|
| **Category** | Data integrity |
| **Likelihood** | Low-Medium — and this exact trap has already sprung once: migration 10 added `sandbox`, `freshSave()` never did, every save born at v11+ had no `sandbox`, and both buttons on the results screen went dead with nothing but a console TypeError ([11](11-migration-plan.md) §2.2) |
| **Impact** | High for the player it hits — a screen they cannot leave, with their records behind it. And quarantine is *less* recoverable here than `online-flywheel` imagined: there is no cloud copy to restore from ([11](11-migration-plan.md) §2.4). |
| **Early-warning signal** | The key-set parity guard in `tools/validate.mjs` going red — provided it is **extended, not forked**, to walk `player` the way it already walks `settings`. |
| **Mitigation** | The three-part obligation in one commit: `CURRENT_VERSION`, `MIGRATIONS[16]`, `freshSave()` — and the migration commit contains **nothing else**, reviewable in one screenful ([11](11-migration-plan.md) §5.1). Every reader re-establishes its own container with one `\|\|`, the same seatbelt `recordSandboxResult` already wears. |
| **Owner** | Lead |
| **Contingency trigger** | A board problem is **never** fixed by rolling back the client — a v16 client meeting a v17 save quarantines it and wipes visible progress for people who did nothing wrong. The escalation ladder is flags → read-only → permanent retirement with `CURRENT_VERSION` held at 17 ([10](10-rollout-and-runbook.md) §4). |

### R10 — The RUN launches and the boards stay empty

| | |
|---|---|
| **Category** | Product |
| **Likelihood** | Medium — the thing players have always ground is the 50% clear, and the clear is not the ranked unit. [ADR-0016](adr-proposed/0016-bounded-ranked-run.md) names this a real product risk, not a footnote. |
| **Impact** | Medium — empty boards undersell the feature's whole point: a score that means something to somebody else needs somebody else |
| **Why** | Today there is no reason to open the game on a Tuesday ([00](00-objective-overview.md)). The RUN has to *be* that reason: 90 seconds, one city, a target you can see. |
| **Early-warning signal** | There is no client analytics and there will not be ([09](09-observability-and-budgets.md) §5), so the observable is the board itself: verified runs per week, named players per city, PostgREST request counts as the only proxy. |
| **Mitigation** | The copy treats the fresh board as a head start, not a penalty — a player with forty Chicago clears is the best-equipped person in the room to fill it, and it takes ninety seconds to enter ([11](11-migration-plan.md) §3.4). Two scopes (city and THE FLYWHEEL) give two ways to matter. |
| **Owner** | Nico |
| **Contingency trigger** | Boards still thin after the first weeks ⇒ the daily challenge is the designed lever — one city, one seed, the same 90 seconds for everyone, an `insert` against this schema, not a new system ([00](00-objective-overview.md) "20 moves ahead"). |

### R11 — The account-free costs arrive as support requests nobody can answer

| | |
|---|---|
| **Category** | Product / support |
| **Likelihood** | Medium — browsers get cleared, phones get replaced, shared computers exist |
| **Impact** | Low-Medium per case and unfixable by construction: there is no recovery path and none can exist, because a recovery path with no identity to check against is an account-takeover primitive ([05](05-identity-and-names.md) §4.1) |
| **Why** | This is the honest cost of the owner's four-word decision, and [05](05-identity-and-names.md) §6 states all four costs plainly. The risk is not the cost — it is a player discovering it as a surprise. |
| **Early-warning signal** | None in the system: there is no contact channel at all ([06](06-privacy-and-moderation.md) §6), so the first sign is the owner hearing it directly. |
| **Mitigation** | The disclosure line at claim time, unsoftened, at the moment of the decision rather than in a FAQ; the greyed-name state with a CLAIM A NEW NAME action instead of a silent submit failure ([02](02-requirements.md) S4); the transfer code surfaced on the profile *before* it is needed. |
| **Owner** | Nico (the copy) · Lead (the greyed state) |
| **Contingency trigger** | If it happens often ⇒ surface the transfer code earlier ([10](10-rollout-and-runbook.md) §3.6). Never build the recovery path. |

### R12 — The full validator cannot run, so the gates silently don't

| | |
|---|---|
| **Category** | Test infrastructure |
| **Likelihood** | **High — already true.** The Cambridge excursion stalls for hours and the full validator does not currently complete end to end ([RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md), [08](08-test-strategy.md)) |
| **Impact** | Medium — every new gate registered only in `validate.mjs` would be decoration, and a gate that cannot run is not a gate |
| **Early-warning signal** | A check nobody has ever seen fail. |
| **Mitigation** | The new gates live in `tools/board-selftest.mjs`, which runs in seconds, and are *additionally* registered in `validate.mjs` for whenever it is fixed ([08](08-test-strategy.md)). Every check is proved red in both directions — perturb one byte of the fixture and watch it fail ([08](08-test-strategy.md) §2). |
| **Owner** | Lead |
| **Contingency trigger** | None needed beyond the split — the selftest *is* the gate. The validator repair is engine-level work with its own RCA and is not this feature's to absorb. |

---

## The degrade order, if the schedule compresses

**A recommendation for Nico to approve, not a decision already made.** The
phases were ordered so that stopping anywhere leaves a complete product
([10](10-rollout-and-runbook.md) §1), which means the degrade order is the phase
order read backwards:

| # | Cut | What is lost | What survives |
|---|---|---|---|
| 1 | **Phase 4's polish** — PROFILE niceties, the greyed-state copy pass, keyboard-only sweep beyond the basics | Fit and finish | Claim, transfer, RECORDS, the chip lines |
| 2 | **Phase 4 visibility** — boards exist but are never linked; the backend keeps verifying in the dark | The public feature | Every run still verified and stored; turning it on later is a flag, and the history is already there |
| 3 | **Phase 3** — no backend at all this cycle | The boards | Phase 2: a complete 90-second time-attack mode with a local best, worth having on its own |

**Never cut, at any level of compression:**

- **The offline guarantee and the two flags.** They are what make every other
  cut safe to make late; the kill switch is genuinely safe to pull *because*
  nothing in the shipped game depends on the boards, and [07](07-threat-model.md)
  §5 says that property should not be traded away later for convenience.
- **Server-side recomputation**, if there is a board at all. An unverified board
  contradicts the owner's second decision and is R6, R7 and R8 at once.
- **Moderation before public boards** ([10](10-rollout-and-runbook.md) §1).
  Phases 4 and 5 are sequenced but released together; there is no schedule in
  which a public name field ships without the lever.
- **T-102 before any stored trace** ([11](11-migration-plan.md) §5). Every trace
  recorded before the math fix lands becomes unreplayable after it.
