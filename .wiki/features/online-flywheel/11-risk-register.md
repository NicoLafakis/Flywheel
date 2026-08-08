# Online Flywheel — Risk Register

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Netcode design](04-netcode-design.md) ·
> [Identity & accounts](05-identity-and-accounts.md) ·
> [Test strategy](07-test-strategy.md) ·
> [Rollout & runbook](08-rollout-and-runbook.md) ·
> [Threat model](09-threat-model.md) ·
> [Observability & NFR](10-observability-and-nfr.md) ·
> [Tasks](13-tasks.md)

**Date:** 2026-08-06 · **Status:** planning

---

## How to read this

- **Likelihood / Impact:** Low / Medium / High. Impact is judged against *the
  booth at UNBOUND*, not against a normal software release — a bug that would be
  a Tuesday afternoon at any other time is a High if it happens in front of a
  partner.
- **Early-warning signal:** the specific observable that appears *before* the
  risk lands. A risk with no early-warning signal is a risk we will only find
  out about from a visitor, and that is itself worth noting.
- **Owner:** who watches it. **Lead** = engineering lead. **Nico** = product
  owner, decisions only, never technical. **Booth lead** = the person staffing
  the booth on the day.
- **Contingency trigger:** the pre-agreed condition at which we stop trying to
  fix and start executing the fallback. Deciding this now is the whole value of
  the register — nobody makes a good cut decision at 9:40 a.m. on the conference
  floor.

Risks are ordered by how much they should shape the next two weeks of work, not
by score.

---

## The register

### R1 — HubSpot OAuth custom flow does not land in time

| | |
|---|---|
| **Category** | Schedule / integration |
| **Likelihood** | **High** |
| **Impact** | Medium |
| **Why** | It is the only path with no managed provider behind it. Supabase ships Google out of the box; HubSpot needs a custom Edge Function doing the authorisation-code exchange, plus a HubSpot app that has to be created, configured with scopes, and approved for the redirect URI. Every step of that depends on a third party's console behaving the way its docs say. [00](00-objective-overview.md) already names it the highest-risk path. |
| **Early-warning signal** | The HubSpot app is not created and a token exchange has not succeeded once, by end of week one. That single milestone is the whole tell. |
| **Mitigation** | Build it **first**, not last — a spike that does nothing but exchange a code for a token, before any UI exists. Keep the provider-specific code behind the same profile-normalisation seam as Google and OTP ([07](07-test-strategy.md) §6) so the button is additive. Ship the other two providers independently; nothing else blocks on this. |
| **Owner** | Lead |
| **Contingency trigger** | **No successful live token exchange by T-10 days.** Then: ship with Google + email OTP, and the HubSpot button is simply absent (not greyed out, not "coming soon" — absent). Flag: `accounts` stays on, HubSpot provider off. |

### R2 — Conference wifi is hostile to a realtime protocol

| | |
|---|---|
| **Category** | Environment |
| **Likelihood** | **High** — this is the expected operating condition, not an edge case |
| **Impact** | Medium (with the offline guarantee) / Catastrophic (without it) |
| **Why** | Shared NAT, hundreds of devices per access point, captive portals, aggressive idle timeouts, and websockets that get quietly severed. A persistent websocket is the single most fragile thing to run on a conference network. |
| **Early-warning signal** | Reconnect count per session climbing in `ops_events`; the connection pill flickering during the Phase 2 rehearsal on venue wifi. |
| **Mitigation** | The architecture, not a workaround: the game is fully playable offline (`AC-OFF-1`), runs queue locally and drain on reconnect, all online init is off the boot path, and the config fetch is 1500 ms-bounded and fails closed ([08](08-rollout-and-runbook.md) §2.3). Plus a wired/hotspot fallback for the booth machines, and packet-loss injection testing at 5/20/50% ([07](07-test-strategy.md) §4.1). |
| **Owner** | Lead (architecture) · Booth lead (on the day) |
| **Contingency trigger** | Reconnects exceed ~1 per player per match during the rehearsal ⇒ drop `snapshot_hz` to 10 and `room_cap` to 6. Arena unusable on venue wifi ⇒ `arena` off; the booth runs solo play with live boards, which is still a complete product. |

### R3 — Host migration fails mid-match, in front of an audience

| | |
|---|---|
| **Category** | Technical / netcode |
| **Likelihood** | Medium |
| **Impact** | **High** — this is the failure with the largest audience |
| **Why** | Host-authoritative with no dedicated server means the authority is a laptop a stranger can close. At a booth the host *will* leave mid-match, because the host is whoever started the match and they finished their turn. The nasty variant is not a failed migration but a **split brain**: two clients both believing they are host, producing two divergent matches. |
| **Early-warning signal** | Any harness run where two peers report different host IDs for even one snapshot interval. Any migration test that passes on the first migration but was never run twice. |
| **Mitigation** | Deterministic election (lowest stable peer ID, or an explicit server-arbitrated claim), a single-writer lock on the room row so two claimants cannot both win, and a harness matrix that includes **two migrations in one match** — the single-migration test is the one that gives false confidence ([07](07-test-strategy.md) §4.1). Booth kiosks never sleep, which removes the most common cause. |
| **Owner** | Lead |
| **Contingency trigger** | Migration fails twice on the floor ⇒ Booth lead turns `arena` off, per [08](08-rollout-and-runbook.md) §5.5. No debugging during event hours. |

### R4 — A cheated or offensive entry tops the board at a partner event

| | |
|---|---|
| **Category** | Reputational |
| **Likelihood** | Medium (cheating) / Medium (offensive handle) |
| **Impact** | **Highest in this document.** A slur on a big screen behind a HubSpot logo outranks every technical failure here for consequence. The audience is also technical, which raises the cheating likelihood specifically — a browser console at a developer conference is not an exotic threat. |
| **Early-warning signal** | Validation rejections appearing in the Edge Function logs; a score wildly outside the distribution of every other run on the same scene; someone at the booth laughing at the screen. |
| **Mitigation** | Two independent lines. **Cheating:** every submitted run is re-scored server-side from seed + input trace; the recomputed score is the only one that reaches a board; determinism is now a *security* property, not a convenience ([00](00-objective-overview.md)). Plus a plausibility ceiling per scene, so an impossible-but-internally-consistent run is still caught. **Offensive content:** default display names to first name + last initial from the sign-in rather than a free-text handle — not offering the field removes most of the problem; profanity filter and length cap on any free text that remains; a one-click **Hide** (never delete) that clears the big screen in under 15 s, drilled and timed by the Booth lead ([08](08-rollout-and-runbook.md) §5.6). |
| **Owner** | Lead (validation) · Booth lead (moderation, on the day) · Nico (whether free-text handles exist at all) |
| **Contingency trigger** | Moderation page unreachable ⇒ **blank the big screen immediately**, then call. Any offensive entry that reaches the screen at all ⇒ free-text handles off for the rest of the event via flag. |

### R5 — The no-build-step invariant buckles under the new dependency

| | |
|---|---|
| **Category** | Architectural |
| **Likelihood** | Medium |
| **Impact** | High — a build step is a build that can break, and a broken build at 8 a.m. on the conference floor is the most expensive failure this project can have ([00](00-objective-overview.md)) |
| **Why** | The pressure comes from several directions at once: a Node-side test harness needs `@supabase/supabase-js` and Node cannot import from a URL; someone will want TypeScript for the Edge Functions; someone will want to bundle for a faster cold load. Each is individually reasonable and collectively fatal to the property that makes this repo resilient. |
| **Early-warning signal** | A `package.json` appearing in a diff. A `node_modules` in `.gitignore`. An import in `js/` that resolves to a local path rather than the importmap. |
| **Mitigation** | Supabase client loads from the CDN via the existing importmap, like three.js. The peer/soak harness is a **browser page**, not a Node script, specifically to avoid needing a package ([07](07-test-strategy.md) §4.1) — the constraint produces the better test, since the harness then exercises the real client path. Edge Functions are Supabase's own runtime and are outside the game tree entirely. The import-graph guard in the validator ([07](07-test-strategy.md) §2.4) makes a violation a red build. |
| **Owner** | Lead |
| **Contingency trigger** | If a `package.json` becomes genuinely unavoidable, it is scoped to `tools/` only, the game root stays dependency-free, and it comes with an ADR and a note in `AGENTS.md`. It never becomes a prerequisite for running the game. |

### R6 — Scope does not fit before UNBOUND

| | |
|---|---|
| **Category** | Schedule |
| **Likelihood** | **High** |
| **Impact** | Medium — mitigated entirely by having decided the cut order in advance, which is what §"What we would cut first" is for |
| **Why** | Four new subsystems (accounts, arena, boards, belts), a backend that does not exist, a deploy path that has never run, and an immovable public date. Historical note from `STATUS.md` worth heeding: four parallel agents on work of this size produced real coordination waste — stale numbers relayed from task descriptions, and a decision invalidated by a change landing underneath it. The process note there is one word: *fewer agents*. |
| **Early-warning signal** | The Phase 1 exit gate slipping. Any single subsystem consuming more than its planned share by the midpoint. The first time someone says "we can polish that at the event". |
| **Mitigation** | Phase gates with explicit exit criteria ([08](08-rollout-and-runbook.md) §3), independent flags so each subsystem can ship or not ship on its own, and a pre-agreed cut order below. Build in dependency order — deploy path first, then identity, then boards, then belts, then arena — so that stopping at any point leaves a coherent product. |
| **Owner** | Lead (tracking) · Nico (approving cuts) |
| **Contingency trigger** | **T-14 days:** any subsystem not feature-complete is a cut candidate and Nico is shown the cut list. **T-7 days:** feature freeze; only bug fixes. **T-3 days:** code freeze; config-only changes. |

### R7 — Cost overrun, driven by Realtime message volume

| | |
|---|---|
| **Category** | Cost |
| **Likelihood** | Medium-High at the default settings |
| **Impact** | Medium (a bill) / High (a hard quota wall mid-event, which reads as an outage) |
| **Why** | [03](03-technical-design.md#73-the-realtime-message-math-which-is-the-whole-cost-question) §7.3 works it at the **shipped** rates (12 Hz snapshots, 10 Hz intents): an eight-hour-a-day, two-day event projects to **1.34 M–3.54 M messages sent / 2.38 M–6.65 M delivered**, against ~2 M/month on Free and ~5 M/month included on Pro. The 5× spread is not netcode — it is three unmeasured assumptions: matches per event (120 vs 480), whether the meter counts sent or sent+delivered (~1.9×), and players per room (6 vs 8). At the low end this fits Free; at the high end it is a third over Pro's included allowance. **The number is unmeasured and no rate should be committed until it is measured.** A continuously-running arena at default settings is the only part of the feature with a cost problem; solo play, boards, and belts are near-free. |
| **Early-warning signal** | The measured message count from a single real match ([07](07-test-strategy.md) §7.2, [13](13-tasks.md) T-709). Day-one end-of-day usage above 50% of the month's allowance. |
| **Mitigation** | **Measure the meter before choosing a rate — T-709, and it gates committing `snapshot_hz`.** Then the three levers, all runtime flags turnable in 60 seconds: `snapshot_hz` 12 → 10; `room_cap` / concurrent-room cap 8 → 6 (high scenario becomes 2.68 M sent / 4.75 M delivered, inside Pro on either accounting); time-boxing arena hours to ~4 a day (high scenario becomes 1.77 M / 3.33 M, the biggest lever). Daily usage check in the end-of-day runbook. |
| **Owner** | Lead (measurement, dials) · Nico (the plan-tier dollars question in [10](10-observability-and-nfr.md) §4.3 — Free $0 vs Pro $25/mo, **still open**) |
| **Contingency trigger** | >50% of the monthly allowance consumed on day one ⇒ day two runs the arena in scheduled windows only, decided that evening. Quota exhausted ⇒ `arena` off; boards and solo play continue unaffected. |

### R8 — The repo has never been deployed; the entire deploy path is unproven

| | |
|---|---|
| **Category** | Operational |
| **Likelihood** | Medium that *something* in it bites; near-certain that at least one small thing does |
| **Impact** | High if discovered late, Low if discovered first |
| **Why** | Not one risk but a cluster of small ones that all surface at once: framework auto-detection finding nothing, `.mjs` MIME types, a CSP that blocks the three.js CDN and produces a blank game, caching a stale `js/` against a fresh `index.html` with no content hashing to save us, the importmap resolving differently behind a CDN, and OAuth redirect URIs that cannot work on per-deploy preview hostnames. Every one is a one-line fix and every one is expensive to find at a booth. |
| **Early-warning signal** | There is none — this risk has no gradual onset. It is binary and it is discovered by looking. That is exactly why it goes first. |
| **Mitigation** | **Deploy the game as it exists today, before writing a single line of online code** ([08](08-rollout-and-runbook.md) §4, Phase 0). Then load the production URL on a phone, on cellular, cold cache, and play a level to completion. A deploy problem and an online problem must never be able to be the same problem. Then: stable preview alias for OAuth, `.vercelignore` for `.wiki/`/`docs/`/`tools/`, explicit MIME and cache headers, CSP tested on the alias before production. |
| **Owner** | Lead |
| **Contingency trigger** | The static deploy is not working on a real device within **the first three days** ⇒ stop online work, fix the deploy. Nothing else in this package matters if the page does not load. |

### R9 — Booth hardware cannot hold the frame rate

| | |
|---|---|
| **Category** | Performance |
| **Likelihood** | Medium |
| **Impact** | Medium — a visibly janky game is a bad demo even if nothing is "broken" |
| **Why** | The sandbox is **CPU-bound** ([`js/quality.js`](../../../js/quality.js) header: `world.render` 0.60 ms against 7.11 ms of debris physics, measured on an RTX 4060 Ti). A kiosk laptop, warm, on battery-saver, after four hours, is a different machine than the one those numbers came from. Debris cost also grows without bound during a session, and a booth session is effectively continuous. |
| **Early-warning signal** | Visibly poor frame rate during the Phase 2 rehearsal on the actual hardware — there is no classifier or watchdog anymore to demote a tier automatically and log the event, so this has to be caught by eye or by the diagnostics overlay, not by an automatic signal. |
| **Mitigation** | `js/quality.js` is now a player-chosen HIGH/LOW binary with no classifier and no watchdog (commit `b9af8bf`, 2026-08-08) — the old mitigation of "let the tier system already handle this" no longer applies. The new work is (a) not spending the frame budget on netcode (§1 of [10](10-observability-and-nfr.md)) and (b) setting booth kiosks to LOW by hand before the event, since nothing will do it automatically if a kiosk struggles mid-session. Kiosks plugged in, power profile set to performance, reload every ~10 players (already in the runbook). |
| **Owner** | Lead · Booth lead (the reload habit) |
| **Contingency trigger** | Rehearsal on booth hardware is visibly janky on HIGH ⇒ default the booth build to LOW and default the booth to a lighter scene. That is a product-visible trade and goes to Nico with a measured number attached. |

### R10 — The CDN is blocked or slow on the venue network

| | |
|---|---|
| **Category** | Environment / dependency |
| **Likelihood** | Low-Medium |
| **Impact** | **High** — the symptom is a blank page, which is the worst possible booth failure |
| **Why** | The game's only external dependency today is the three.js CDN importmap, and this project adds a second (the Supabase client). Corporate and venue networks do block CDNs, and a captive portal intercepting the first request produces exactly the same symptom. Neither dependency has a fallback today. |
| **Early-warning signal** | Any load failure on the venue network during the Phase 2 rehearsal. Worth testing deliberately rather than waiting for. |
| **Mitigation** | **Self-host both libraries from the same origin** as a pinned, checked-in vendored file. This costs nothing architecturally — it is still a static file loaded through the importmap, still no build step — and it removes two third-party origins from the critical path along with a whole class of CSP problems. Also: the online client is deferred, so a Supabase CDN failure degrades to offline rather than blanking the page; only three.js is fatal, which makes vendoring *it* the priority. |
| **Owner** | Lead |
| **Contingency trigger** | Any CDN failure observed on venue wifi ⇒ vendor immediately. Better: vendor before the event and never find out. |

### R11 — Personal data mishandled at a public kiosk

| | |
|---|---|
| **Category** | Privacy / legal |
| **Likelihood** | Medium |
| **Impact** | High |
| **Why** | Real names, real emails, real company names, collected on a shared machine in public, at an event with an international audience. Three distinct failure modes: a session left signed in so the next visitor sees the last one's details; an RLS gap exposing emails through a board or a view; and no route for "please delete my details". |
| **Early-warning signal** | Any pgTAP RLS test that had to be relaxed. A kiosk found signed in during a spot check. No named person owning deletion requests. |
| **Mitigation** | A prominent RESET button that signs out and clears the form, plus reset-between-players in the runbook and a spot check in the start-of-day list. RLS tests written from the attacker's seat — the interesting assertion is that the *neighbour* cannot read the email, and views get tested too ([07](07-test-strategy.md) §5). A visible, plain-language consent line at the point of capture saying what the details are used for. `ops_events` carries no personal data at all. A paper route for deletion requests with a named owner. |
| **Owner** | Lead (technical) · Booth lead (on the day) · Nico (what the consent line promises) |
| **Contingency trigger** | Any confirmed exposure ⇒ `accounts` flag off immediately, guest-only play, and the affected people contacted. |

### R12 — The guest→account merge damages a player's local progress

| | |
|---|---|
| **Category** | Data integrity |
| **Likelihood** | Low-Medium |
| **Impact** | Medium at a booth (visitors have little local progress) / High for the existing single-player audience, who have all of theirs |
| **Why** | localStorage v13 stays the offline source of truth and the cloud syncs on top. The merge runs at first sign-in, on data nobody has a backup of. `js/save.js` and the validator have already caught one drift of exactly this shape — migration 10 created `sandbox`, `freshSave()` never did, and every save born at v11+ was missing it until `recordSandboxResult` threw. A third independent description of the save object is a third chance to drift. |
| **Early-warning signal** | The cloud/local key-set parity check in [07](07-test-strategy.md) §2.1 going red. Any merge fixture where a monotone field decreases. |
| **Mitigation** | Merge is a pure, tested function: total over the key set, idempotent, and **monotone on coins, stars, unlocks, and best scores**. Snapshot the pre-merge local save into a quarantine key before merging — the repo's existing instinct (`hole-city-save.quarantine`, never delete) applied to a new failure mode. Validator-enforced parity in both directions, matching hard rule 6's posture. |
| **Owner** | Lead |
| **Contingency trigger** | Any report of lost progress ⇒ `accounts` off, restore from the quarantine key, fix, re-enable. |

### R13 — One person holds the operational knowledge

| | |
|---|---|
| **Category** | Operational / human |
| **Likelihood** | Medium |
| **Impact** | High |
| **Why** | A runbook that only its author can execute is documentation, not an operational capability. The booth is staffed by people who did not build this, at a time when its author may be unreachable. |
| **Early-warning signal** | The Phase 2 exit gate cannot be met — the Booth lead cannot reset a kiosk, read the pill, or hide a handle unaided. |
| **Mitigation** | The Phase 2 gate **is** the mitigation: the Booth lead personally performs the kiosk reset, the moderation drill (timed, under 60 s), and the offline switch, before doors. The runbook is printed and taped inside the counter, with phone numbers filled in. Booth staff are explicitly authorised to turn things off without asking — the only unforgivable action is leaving something broken visible while waiting for permission. |
| **Owner** | Lead (training) · Booth lead (competence) |
| **Contingency trigger** | Gate not met at T-1 day ⇒ the event runs with `arena` off and boards read-only, which needs far less intervention. |

### R14 — Kiosk sleeps, updates, or is otherwise reclaimed by its operating system

| | |
|---|---|
| **Category** | Operational |
| **Likelihood** | Medium |
| **Impact** | Medium (a dead kiosk) / High (if it was the host — see R3) |
| **Why** | Sleep on battery is enabled by default and gets silently restored by OS updates. Browser auto-update restarts the tab. Notification popups land over the game. A kicked power cable is a fact of booth life. |
| **Early-warning signal** | A kiosk found asleep or updated during a spot check. |
| **Mitigation** | Start-of-day checklist covers sleep, screensaver, display-off (**on battery too**), browser auto-update disabled, notifications silenced, kiosk fullscreen. Re-verified each morning, because an overnight update undoes it. Host migration (R3) is the safety net for the case where it happens anyway. |
| **Owner** | Booth lead |
| **Contingency trigger** | Recurring sleeps on one machine ⇒ retire it from hosting duty; it plays as a peer only. |

### R15 — Supabase project is paused or degraded at the worst moment

| | |
|---|---|
| **Category** | Vendor |
| **Likelihood** | Low |
| **Impact** | Medium (with the offline guarantee) |
| **Why** | Free-tier projects pause after ~7 days of inactivity — a real hazard for a project that goes quiet between build and event. Beyond that, any hosted service can have a bad hour. |
| **Early-warning signal** | The project dashboard showing a pause warning; any 5xx cluster in the Edge Function logs. |
| **Mitigation** | The dollars decision in [10](10-observability-and-nfr.md) §4.3 — a paid plan for the event month does not pause. Failing that, a scheduled keep-alive query. And, always, the offline guarantee: an unreachable Supabase is a degraded booth, never a dead one. |
| **Owner** | Lead · Nico (plan tier) |
| **Contingency trigger** | Supabase unreachable for >10 minutes at the event ⇒ `online` off entirely; the booth runs today's game, which is a complete product on its own. |

---

## What we would cut first, if the schedule compresses

**This is a recommendation for Nico to approve, not a decision already made.**
It is written down now so that if the call is needed at T-14 days it can be made
in five minutes against a list agreed while everyone was calm — which is the
only condition under which cut decisions are made well.

The ordering principle: cut the thing whose absence a booth visitor is least
likely to notice, and never cut something that another kept item depends on.
Note that the order is roughly the **inverse** of the build order in
[08](08-rollout-and-runbook.md) §3 — build in dependency order, cut from the top
of the stack down, so that stopping anywhere leaves a coherent product.

| # | Cut | What is lost | What survives | Saves |
|---|---|---|---|---|
| **1** | **Achievements** (keep belts) | The collectible layer and the trophy room | Belts, which are the part that drives return visits — the trophy room is the nice-to-have on top | Meaningful UI and content-authoring time |
| **2** | **The all-time and per-level leaderboard scopes** (keep UNBOUND and per-city) | Two of four boards | The two boards a booth visitor actually cares about: "how did I do at this event" and "how did I do on this city". Scope is a dimension, so the other two are a later query over data we are already storing — this cut is genuinely reversible after the event | Board UI and query-tuning time |
| **3** | **HubSpot sign-in** | One of three sign-in buttons | Google and email OTP — full identity capture, full lead capture, unchanged | Removes R1 entirely, which is the highest-likelihood schedule risk in this register |
| **4** | **The live shared arena** | The "same city, live, together" mode — the most exciting thing in the package and the biggest single loss on this list | Solo play against live leaderboards and belts, which is still a complete, competitive, socially-driven booth game. "Beat the person before you" works without anyone being on screen at the same time | The largest block of remaining work, plus it removes R2, R3, and R7 (the cost problem is almost entirely the arena) |
| **5** | **Cloud save sync** (keep accounts and score submission) | Progress does not follow a player between devices | Sign-in, lead capture, scores, boards, belts. localStorage v13 keeps doing exactly what it does today | Removes R12 and a chunk of merge complexity |
| **6** | **Accounts entirely** — capture a name on the results screen instead | No sign-in, no verified identity, weaker lead capture | Boards and belts keyed to a typed name; the booth still produces a leaderboard and a champion | Removes R1 and R11, but guts the second of the two purposes in [00](00-objective-overview.md) — this is a serious cut, not a trim |

**Never cut, at any level of compression:**

- The **offline guarantee** and the **feature flags**. They are what make every
  other cut safe to make late, including on the morning of the event. Cutting
  them to save time is cutting the parachute to save weight.
- **Server-side score validation**, if there is a leaderboard at all. An
  unvalidated board at a developer conference is an invitation, and R4 is the
  highest-consequence risk in this register.
- **The static deploy working on real hardware.** Not a feature.

**Cut lines by date** (the trigger from R6):

- **T-14 days** — anything not feature-complete becomes a cut candidate; Nico
  sees this list and picks the line.
- **T-7 days** — feature freeze. Bug fixes only.
- **T-3 days** — code freeze. Config-flag changes only.
- **Event hours** — flags, moderation, and rollback only. No deploys.
