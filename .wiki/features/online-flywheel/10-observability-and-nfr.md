# Online Flywheel — Observability & Non-Functional Budgets

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) ·
> [Netcode design](04-netcode-design.md) ·
> [Test strategy](07-test-strategy.md) ·
> [Rollout & runbook](08-rollout-and-runbook.md) ·
> [Threat model](09-threat-model.md) ·
> [Risk register](11-risk-register.md)

**Date:** 2026-08-06 · **Status:** planning

---

## 0. Read this before quoting any number in this document

**Every figure below is a budget, not a measurement.** None of the code exists.
Nothing here has been measured, and nothing here may be repeated as if it had
been.

`STATUS.md` sets the standard this project inherits verbatim: *"this box showed
2.0–2.6× median/min noise and a 40 s outlier on a 2.5 s build while agents were
live. No perf number is quotable until the tree is still."* That repo has
already retracted two confident numbers — a "superlinear build, exponent ≈ 2.08"
claim that was noise from a loaded box, and a "38% darker establishing shot"
diagnosis that measurement contradicted. Both retractions are in `STATUS.md`
because being wrong loudly is cheaper than being wrong quietly.

So: budgets are stated as targets with the instrument named. §6 defines how each
one gets measured honestly. Numbers that came from somewhere real — the ones in
`js/quality.js` and `STATUS.md` — are cited as such and marked **[measured]**.

---

## 1. Frame-time budget: the net layer must not cost the sim its budget

### 1.1 What the budget already looks like

The loop is a fixed 60 Hz step (`FIXED_DT = 1/60` in `js/main.js`), so the frame
budget is **16.67 ms**. What is already in it, **[measured]** on the Boston
profile (82,894 blocks, SIZE 5, 45 s, RTX 4060 Ti — see the header comment in
`js/quality.js`):

| Cost | Figure | Note |
|---|---|---|
| `world.render` (35 draw calls, ~1M tris) | 0.60 ms/frame | The sandbox is **CPU-bound**, not GPU-bound |
| Loose-debris physics | 7.11 ms/frame | 47.7% of CPU, and the only cost that grows without bound during a session |
| `_resolveDebrisContacts` | 24.9% of CPU | |
| `_recalcSupport` | 8.6% of CPU | |

Two facts from that table shape the entire netcode budget. First, **rendering is
the cheap part** — a net layer that costs 0.60 ms has cost as much as drawing
the whole city. Second, the expensive part is already unbounded, so there is no
slack to lend.

### 1.2 The budget

| Condition | Net-layer cost per frame | Instrument |
|---|---|---|
| `arena` flag off | **exactly 0** — the code is not imported | Import-graph guard, [07](07-test-strategy.md) §2.4 |
| Arena on, HIGH tier | ≤ **1.0 ms** p95, target ≤ 0.3 ms median | `performance.now()` spans around the net tick, reported by the diagnostics overlay |
| Arena on, LOW / POTATO | ≤ **0.5 ms** p95 | same |
| Any tier, per-frame heap allocation by the net layer | **zero** | conventions: "do not allocate per-frame in hot paths" |

### 1.3 Three structural rules that make the budget achievable

These are design constraints, not aspirations, and each exists because of
something already in this codebase.

1. **Net work never runs inside `sim.step()`, and never inside the catch-up
   `while` loop.** `js/main.js` may run up to `maxSubSteps` sim steps in one
   frame — 6 on HIGH, 1 on POTATO. Anything placed inside that loop is
   multiplied by up to six on exactly the device that could least afford it. The
   loop's own comment documents this as "the single nastiest failure mode on a
   slow device… a positive feedback loop rather than a slow degradation."
   Net send/receive happens once per rendered frame, outside the loop, full
   stop.
2. **Receive work is bounded per frame.** The inbound queue is drained with a
   cap (newest snapshot wins; older ones are discarded, not processed). A
   backlog after a stall must cost one frame, not N frames — otherwise a network
   hiccup creates the same feedback spiral as the sub-step one.
3. **Send is rate-limited independently of frame rate.** At the shipped 12 Hz
   snapshots and 60 fps, only 1 frame in 5 does send work. On a device running
   at 20 fps the send rate must stay 12 Hz (or degrade gracefully), never become
   frame-rate-coupled — the repo has already shipped one frame-rate-dependent
   steering bug (fixed 2026-08-05, `STATUS.md`), and the same class of mistake
   in netcode desynchronises a match.

### 1.4 Interaction with the quality tiers

`js/quality.js`'s watchdog samples the **raw** rAF gap and demotes on a p95 over
42 ms in a 3 s window. Net-layer cost is inside that sample, which is correct —
a net layer heavy enough to hurt should cost the player pixels before it costs
them frames. Two additions:

- Add `arena` state to the diagnostics `levers()` output so a demotion during a
  match can be attributed rather than guessed at.
- Consider the arena a **quality lever of last resort**: if a client sits at
  POTATO and is still missing the frame budget, degrade the arena (drop to
  spectating peers at a lower interpolation rate) before degrading the sim
  further. Playing solo at 60 fps beats playing together at 12.

---

## 2. Network, latency, and the walk-up metric

### 2.1 Snapshot bandwidth per player

Design assumption being budgeted: host broadcasts one snapshot containing all
players at `snapshot_hz` (default 15); each peer sends steering intent at the
same rate on a channel only the host subscribes to.

Per-player state in a snapshot, quantised: position x/z as 2 × int16, radius or
SIZE as uint16, score as uint32, flags as uint8 ⇒ **~13 bytes**. Eight players
⇒ ~104 bytes of payload. Realtime's JSON/base64 envelope roughly doubles-to-
triples it in practice, so budget **~300 bytes per snapshot message**.

| Budget | Value | Why it is the number |
|---|---|---|
| Snapshot message size | ≤ 400 B | Above this, re-check the encoding before re-checking the network |
| Downstream per peer | ≤ **5 KB/s** | 12 Hz × 400 B |
| Upstream per peer (intent) | ≤ **2 KB/s** | 10 Hz × ~200 B |
| Host upstream | ≤ **5 KB/s** | one broadcast, not one per peer |
| Host downstream | ≤ **14 KB/s** | 7 peers × 2 KB/s |
| **Total per player per 90 s match** | ≤ **1 MB** | The figure to hold in mind on conference wifi |
| Input trace stored per run | ≤ **64 KB**, hard cap; expect 1–4 KB | Delta/RLE encoded; a trace above the cap is rejected, not truncated (a truncated trace scores a different run) |

A megabyte per player per match is the number that makes this survivable on a
hostile network. If any encoding decision pushes it toward ten, the arena stops
being viable at a conference and the design has changed, not just a constant.

### 2.2 Latency budgets

| Path | Budget | Instrument |
|---|---|---|
| Leaderboard query, server side | p95 ≤ **300 ms** | Supabase query statistics — *not* a stopwatch on a client, which measures the venue wifi and tells you nothing about the query |
| Leaderboard, click to painted, booth wifi | p95 ≤ **1.2 s** | Manual, timed, on the venue network during Phase 2 |
| Score shown to the player after a run | **immediate**, 0 network dependency | The score is already computed locally; the server confirms it, it does not produce it (`AC-SCORE-5`) |
| Score confirmed on the board | p95 ≤ **5 s** | The board's own "last updated" stamp, cross-checked against a submission timestamp |
| Server-side replay validation, CPU | p95 ≤ **2 s** per 90 s run | Edge Function execution time in the Supabase logs |
| Snapshot age at render (interpolation lag) | ≤ **150 ms** typical, ≤ 400 ms before the peer is shown as "connection poor" | Client-side, diagnostics overlay |
| Host migration, detection to new host serving | ≤ **3 s** | Peer harness, [07](07-test-strategy.md) §4.1 |

The replay-validation budget deserves one note on plausibility rather than
confidence: `tools/validate.mjs` already replays 100 campaign levels *plus* five
voxel scenes with several 62-second excursions run twice each, in roughly 30 s
total. A single 90-second voxel replay is a small fraction of that work. That is
a reason to believe 2 s is not absurd — it is **not** a measurement, and it must
be measured on the real Edge Function runtime before it is relied on for
capacity planning.

### 2.3 Time to first play — a conversion metric, not a vanity one

**Budget: ≤ 12 s** from URL to a hole the player is steering, on booth hardware,
on venue wifi, cold cache.

This is the booth's throughput ceiling. A 90-second match preceded by 30 seconds
of loading is a 25% throughput loss and, worse, the moment a curious visitor
decides to keep walking. Everything else in this document is about the game
being good; this one is about how many people get to find that out.

What is in the budget, and where the risk actually lives:

| Segment | Notes |
|---|---|
| HTML + CSS + `js/` modules | Small, static, edge-cached |
| three.js from CDN importmap | Cached after the first load of the day; **the cold-cache case is the one to measure** |
| Scene build (main-thread blocking) | **The dominant term.** Brooklyn: 39,984 blocks / **4,051 ms** [measured, min-of-9]. Boston is heavier still (82,894 blocks). Booth hardware will be slower than the box those numbers came from. |
| Establishing shot + READY gate | Deliberate, player-controlled, not loading time |
| **Online layer** | **0 ms on the critical path, by construction.** Config fetch is parallel and 1500 ms-bounded; Supabase client import is deferred; no online call is awaited before the first frame ([08](08-rollout-and-runbook.md) §2.3) |

Two consequences worth stating in advance because they are product-visible:

- If the budget is missed on booth hardware, the lever is **which scene the
  booth defaults to**, not the netcode. A lighter scene loads faster and turns
  the queue over faster. That is a call for Nico — it trades the showcase city
  for more people getting to play — and it should be surfaced with a measured
  number attached, after Phase 2, not guessed at now.
- Warming the cache matters: the start-of-day checklist in
  [08](08-rollout-and-runbook.md) §5.1 has the attendant play one run, which
  incidentally pre-warms three.js and the assets for every visitor that day.

---

## 3. Accessibility — WCAG 2.2 AA for the new surfaces

Three new surfaces: the **sign-in / identity form**, the **leaderboards**
(including the big screen), and the **trophy room**. They are the first
conventional UI in a game that has so far been mostly canvas, and they are the
surfaces a partner is most likely to scrutinise.

The bar is **WCAG 2.2 AA**. The criteria below are the ones this specific
feature set actually engages — not the whole standard recited.

### 3.1 Sign-in and identity capture

| Criterion | Obligation here |
|---|---|
| **3.3.8 Accessible Authentication (Minimum)** — AA, new in 2.2 | The email OTP field **must accept paste** and must carry `autocomplete="one-time-code"` so the platform can autofill it. Transcribing a six-digit code from another device by memory is a cognitive function test and fails this criterion outright. This is the single most likely 2.2 failure in the package. |
| **1.3.5 Identify Input Purpose** — AA | `autocomplete` tokens on every field: `given-name`, `family-name`, `email`, `organization`. Free, and it also makes booth sign-in faster, which serves §2.3. |
| **3.3.7 Redundant Entry** — AA, new in 2.2 | Do not ask for the email twice. Do not re-ask for a name the OAuth provider already gave. |
| **3.3.1 / 3.3.3 Error Identification & Suggestion** | Errors in text next to the field, naming the problem and the fix. Never colour alone, never a red border alone. |
| **1.4.3 Contrast (Minimum)** | 4.5:1 for body text against the dark game background. The `--fw-*` gold/orange brand tokens must be **measured**, not assumed — gold on dark is exactly the palette that fails at small sizes. |
| **1.4.11 Non-text Contrast** | 3:1 for input borders, the focus indicator, and any icon carrying meaning. |
| **2.4.7 Focus Visible** + **2.4.11 Focus Not Obscured** — the latter new in 2.2 | A visible focus ring at every stop, and the focused control must not be hidden behind the HUD, a sticky header, or the connection pill. The pill lives in a corner; check it does not sit on top of the last field in the form. |
| **2.5.8 Target Size (Minimum)** — AA, new in 2.2 | 24 × 24 CSS px minimum. Booth touchscreens make this practical, not theoretical; go well above the minimum for the primary buttons. |
| **Global rule 3 (house rule, above WCAG)** | Any company-website field pre-fills `https://` as a non-editable adornment. The player types the unique part only, and no "must start with https://" error is ever shown. |

### 3.2 Leaderboards, including the big screen

- A real `<table>` with `<th scope>` headers — not a grid of `<div>`s. A screen
  reader must be able to say "rank 3, Dana R., 41,200".
- **1.4.1 Use of Colour**: a belt holder is marked with an icon and text, never
  colour alone.
- **4.1.3 Status Messages**: belt changes announce via a polite live region,
  **rate-limited**. An unthrottled live region during a booth rush is a screen
  reader reading a scoreboard aloud continuously, which is worse than silence.
- Big-screen legibility is a distinct requirement from WCAG and is *stricter*:
  readable from ~3 m, no truncated names, no horizontal scroll, and a visible
  "last updated" timestamp so a stalled board is obvious across the aisle
  ([08](08-rollout-and-runbook.md) §5.4).
- **1.4.10 Reflow / 1.4.4 Resize**: the boards must survive 200% zoom and a
  narrow viewport, because someone will open them on a phone.

### 3.3 Trophy room

- **1.4.1**: locked vs unlocked is conveyed by text and shape, not just
  saturation.
- **2.3.3 Animation from Interactions** (AAA, adopted here anyway): the game
  already honours reduced motion from both the setting and the OS
  (`js/ui/screens.js`, `setReducedMotion`). Belt-award and reign-clock animation
  must respect the same flag. Extending an existing, working convention costs
  nothing; inventing a new animation that ignores it is a regression against
  behaviour the game already has.
- Every belt and achievement needs a text alternative describing what it is and
  how it was earned — which is also the copy the trophy room needs anyway.

### 3.4 How it gets checked

The `accessibility-auditor` agent and the `ada-audit` skill run against the
stable preview alias at the Phase 1 exit gate, with a manual keyboard-only pass
over the sign-in form and a screen-reader pass over one board. The spot-checks
in [07](07-test-strategy.md) §8.F are the day-of version, not the audit.

---

## 4. Cost budget — and the line item that does not fit

**What was approved and what things actually cost, kept separate.** Nico
approved **~$10/month** — before anyone had checked, and the $10 turns out to be
a *compute credit inside Pro*, not a plan price. Verified 2026-08-06: **Supabase
Free is $0 and Supabase Pro is $25/month.** He has been told the real figure and
**has not yet chosen a plan**; §4.3 is that question in his terms. Nothing here
records an approval of $25.

So the honest framing is not "how do we stay under $10", it is "which of these
two shapes do we choose", and the answer depends on a number nobody has measured
yet.

### 4.1 The line items

| Line item | Free tier (verify current figures before the event) | Pro ($25/mo) | Our projected use |
|---|---|---|---|
| Realtime concurrent connections | ~200 | ~500 | ≤ 40. **Not the constraint.** |
| **Realtime messages / month** | ~2 M | ~5 M, then ~$2.50/M | **See §4.2 — this is the constraint.** |
| Database size | 500 MB | 8 GB | Runs + traces: tens of MB. Not a constraint. |
| Edge Function invocations | ~500 K | ~2 M | ~2–5 K over the event. Not a constraint. |
| Auth MAUs | 50 K | 100 K | Hundreds. Not a constraint. |
| Egress | modest | larger | Small. Not a constraint. |
| Project pausing after inactivity | **Free pauses after ~7 days idle** | does not pause | A paused project on the morning of day two is an outage. Materially relevant. |
| Vercel static hosting | Hobby $0 | — | Static site, low traffic. $0. |

Everything on that list is comfortable except one row.

### 4.2 The Realtime projection, worked

[03](03-technical-design.md#73-the-realtime-message-math-which-is-the-whole-cost-question)
§7.3 is the canonical version of this arithmetic; this is the same numbers for
the NFR reader. If they ever diverge, 03 is right.

**The shipped constants**, per [04](04-netcode-design.md) §13: snapshots
**12 Hz** host → all, intents **10 Hz** peer → host. Not the 15/20 ceilings.

```
sent      = 12·S + 10·S·(P−1)
delivered = 12·S·(P−1) + 10·S·(P−1)          S = match seconds, P = players
```

| Assumption | Low ([03](03-technical-design.md) §7.1's booth) | High ([07](07-test-strategy.md) §7's booth) |
|---|---|---|
| Match length | 180 s | 90 s |
| Players per room | 6 | 8 |
| Matches over the 2-day event | 120 | 480 |
| Sent per match | 11,160 | 7,380 |
| Delivered per match | 19,800 | 13,860 |
| **Sent over the event** | **1.34 M** | **3.54 M** |
| **Delivered over the event** | **2.38 M** | **6.65 M** |

Against ~2 M/month on Free and ~5 M/month included on Pro, the same shipped
design lands from *comfortably inside Free* to *a third over Pro's included
allowance*. The 5× spread is not netcode. It is three unmeasured assumptions:
**matches per event** (120 vs 480 — 4× on its own, and it is booth throughput,
not engineering), **whether the meter counts sent or sent+delivered** (~1.9×,
and nobody has read it), and **players per room** (6 vs 8, ~1.4×, a runtime
flag).

**The levers**, all runtime flags ([08](08-rollout-and-runbook.md) §2.1):

- **Snapshot rate** 12 → 10 Hz. Not perceivable at the 100 ms interpolation
  delay; ~17% off the downstream half.
- **Concurrent-room cap and room cap** 8 → 6. On the high scenario this alone
  gives **2.68 M sent / 4.75 M delivered** — inside Pro on either accounting.
- **Time-boxing arena hours** to ~4 of each day's 8. Halves the match count
  outright: high scenario becomes **1.77 M sent / 3.33 M delivered**. Biggest
  lever, lowest cost, because a booth cannot supervise sixteen hours of
  continuous arena anyway.

**The conclusion, stated plainly:** solo play, accounts, boards, and belts are
near-free in Realtime terms and fit comfortably whatever plan is chosen. *A
continuously-running live arena, at the default rate and room size, is the only
part of this feature with a cost problem* — and at the high end it does not fit
Pro's included allowance either.

**And the first action is not to pick a number — it is to measure the meter.**
Run one real match at the shipped rates and read the actual message count off
the Supabase dashboard ([07](07-test-strategy.md) §7.2, [13](13-tasks.md)
T-709). One dashboard reading replaces every figure above. **Nobody should
commit a snapshot rate before that measurement exists.**

### 4.3 For Nico — a dollars question, which is his to answer

Two shapes, described without jargon:

- **Free plan, $0/month.** Works, and stays free as long as the live-together
  mode is only running part of the day. Two risks: it can hit a hard ceiling
  mid-event with no warning, and the whole thing goes to sleep if nobody plays
  for a week, which would mean the booth's first visitor on day two hits a dead
  site.
- **Paid plan (Pro), $25/month, cancel after the event (~$25 total).** Roughly
  two and a half times the headroom, no sleeping, and if it is exceeded it
  charges a few dollars rather than stopping. The $10 he approved was a line
  item inside this plan, not the plan; the real price is $25.

Recommendation: **Pro for the event month**, and the deciding reason is the
sleeping, not the headroom — a project that has been quiet for a week is asleep
when the first visitor of day two walks up. The extra $15 buys the difference
between "the booth degraded gracefully" and "the booth stopped." **Not yet
chosen. His call.**

### 4.4 Tripwires — how an overrun gets caught early rather than at the invoice

| Tripwire | Threshold | Action |
|---|---|---|
| Measured messages in one real match | > 20 K | Cut `snapshot_hz` to 10 and `room_cap` to 6 before the event. Re-measure. |
| Day-one end-of-day message count | > 50% of the month's allowance | Day two runs the arena in scheduled windows only. Decided that evening, recorded in [08](08-rollout-and-runbook.md) §5.8. |
| Any single input trace | > 64 KB | Rejected at submission. Something is encoding per-tick instead of per-change. |
| Total stored trace bytes | > 100 MB | Encoding regression; investigate before it becomes a storage line item. |
| Edge Function invocations in a day | > 10 K | Something is retrying. A retry loop is a cost bug and usually also a correctness bug. |
| Supabase billing/usage page | checked **daily** during the event | Manual, in the end-of-day checklist. There is no billing alert that fires fast enough for a two-day event. |

---

## 5. Observability — Vercel logs, Supabase logs, in-product UX. Nothing else.

**Sentry and its equivalents (LogRocket, Datadog, New Relic, Honeybadger,
Rollbar, Bugsnag) are permanently banned on this account.** Not "avoided", not
"deferred" — banned, including free tiers, and never to be proposed again. A
2026-05-18 Sentry install boot-killed every deploy on another project. If an
audit of this package flags "insufficient observability", the fix is better use
of what follows, never a new service.

### 5.1 What each layer can honestly give us

- **Vercel.** The deploy is fully static with zero functions
  ([08](08-rollout-and-runbook.md) §4.1), so there is **no meaningful runtime
  log stream**. What Vercel provides that is genuinely useful: deployment
  history and build logs (relevant to "did the right thing ship"), and traffic
  analytics (relevant to "how many people loaded the page at the booth", which
  is the denominator of the walk-up conversion metric in §2.3). Do not plan to
  debug behaviour from Vercel — plan to answer "what is deployed" and "how many
  visits".
- **Supabase.** This is where the real signal lives: Postgres logs, **Auth logs**
  (per-provider sign-in success and failure — the fastest way to see that
  HubSpot OAuth is broken), **Edge Function logs** (every `console.log` from the
  validating function), the Realtime inspector and message counters, the usage
  and billing pages, and the Security/Performance Advisors.
- **In-product error UX.** The layer that actually matters on a booth floor,
  because the person who needs the signal is standing next to the machine and
  will never open a dashboard.

### 5.2 `ops_events` — native telemetry, no SaaS

One insert-only table, RLS-guarded so any client can insert and no client can
read, written by both the Edge Functions and the browser:

`ts · session_id · event · flags_snapshot · scene · tier · detail (jsonb)`

Rules that keep it from becoming a liability:

- **Client-side rate limit** — at most a handful of events per session, with
  duplicate suppression. An unthrottled error insert on a reconnect loop is a
  cost bug and a self-inflicted denial of service.
- **No personal data in `detail`.** No email, no name, no company. This table is
  operational, and mixing identity into it turns every future data-deletion
  request into a schema archaeology exercise. [09](09-threat-model.md) owns the
  boundary.
- **Retention**: 30 days, then delete. Written down here so it exists as a
  decision rather than as an accident.
- Events worth having, and no more: `boot`, `flags_resolved`, `arena_join`,
  `arena_host_migrated`, `arena_demoted`, `submit_queued`, `submit_drained`,
  `validation_rejected`, `error` (with a short code).

Query it from the Supabase SQL editor. That is the dashboard. A saved query
bookmarked in the booth browser is the entire tooling requirement, and it is
enough for a two-day event.

### 5.3 In-product error UX — the observability that works at a booth

- **The connection pill.** One element, three states, plain language, readable
  from a metre away: **Online** / **Reconnecting…** / **Offline — your run is
  saved and will post when you're back.** This is the highest-value piece of
  observability in the entire package, because it is the only one whose
  consumer is the person who can act on it within ten seconds.
- **Named errors, never spinners.** Every failure state renders a short human
  sentence plus a short code (`FW-AUTH-3`). The code is what a booth attendant
  reads down the phone, and it is what makes the `ops_events` row findable. A
  spinner that never resolves is the worst possible error UI at a booth, because
  it tells the visitor the game is broken and tells the attendant nothing.
- **A queue indicator.** "2 runs waiting to post" — visible, honest, and it
  stops the attendant from clearing the cache and destroying them (§5.3 of the
  runbook explicitly warns against this; the indicator is what makes the warning
  land).
- **A diagnostics overlay behind `?diag=1`**: current tier and why
  (`quality.js` already computes and exposes this), net-layer frame cost,
  snapshot age, queue depth, resolved flags. Not shown to players; the thing a
  developer opens instead of guessing.
- **Big-screen "last updated"** timestamp. A stalled board that says so is a
  known state; a stalled board that looks live is a wrong answer displayed with
  confidence.

### 5.4 Alerting

There is no paging system and there should not be one for a two-day event. The
alerting plan is deliberate and human:

| Signal | Who sees it | Latency |
|---|---|---|
| Connection pill | Booth attendant, continuously | seconds |
| Big-screen "last updated" going stale | Anyone in the booth | ~1 minute |
| Auth failures by provider | Whoever checks the Supabase dashboard | 2-hourly, in the runbook |
| Message/invocation quota | End-of-day check | daily |
| `ops_events` error clusters | End-of-day check | daily |

The 2-hourly dashboard check is in [08](08-rollout-and-runbook.md) §5 as an
explicit task, because an alerting plan that depends on someone remembering is
not a plan.

---

## 6. Measurement methodology

The rule, inherited from `STATUS.md` and non-negotiable: **no perf number is
quotable until the tree is still.**

**Client-side timings** (frame cost, scene build, time-to-first-play):

- Quiet machine. No agents running, no builds, no browser tabs doing work. The
  documented failure mode on this box is 2.0–2.6× median/min noise and a 40 s
  outlier on a 2.5 s build, taken while agents were live.
- **Min-of-N, round-robin** between the variants being compared, N ≥ 5. Not
  N runs of A followed by N runs of B — thermal and cache state drift between
  the blocks and the drift lands entirely on B.
- Report **median and p95**, always. `STATUS.md` records why in one line: Upper
  Manhattan's worst collapse is a 16.6 ms median and a 101 ms p95, and only one
  of those describes the experience.
- State the machine and the scene. A frame cost without a block count is not a
  measurement.

**Server-side timings** (query latency, function duration): take them from
Supabase's own statistics, never from a client stopwatch. A client timing on
venue wifi measures the venue.

**Volume and cost**: read the counters, do not multiply the arithmetic. §4.2's
projection exists to size the risk, and it is explicitly labelled as arithmetic
that a single measured match will replace.

**Retraction is part of the method.** If a number in this document turns out to
be wrong, it gets struck through here with the correction, in the same way
`STATUS.md` carries its two retractions. A doc that only ever accumulates
confident numbers is a doc that is quietly wrong.
