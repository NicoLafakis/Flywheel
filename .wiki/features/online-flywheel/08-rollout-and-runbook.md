# Online Flywheel — Rollout & Runbook

> [Objective overview](00-objective-overview.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) ·
> [Identity & accounts](05-identity-and-accounts.md) ·
> [Test strategy](07-test-strategy.md) ·
> [Observability & NFR](10-observability-and-nfr.md) ·
> [Risk register](11-risk-register.md) ·
> [Migration plan](12-migration-plan.md) ·
> [Setup for Nico](SETUP-FOR-NICO.md)

**Date:** 2026-08-06 · **Status:** planning

---

## 1. The safety property everything else hangs off

> **A dead backend must never mean a dead game.**

At a booth, the failure that matters is not "the leaderboard is stale". It is
"a HubSpot partner walked up to a black screen." Every architectural choice in
this document is downstream of preventing that one outcome, and the flag system
exists to make it *impossible* rather than *unlikely*.

Three properties, in priority order:

1. **Fail closed to offline.** Any ambiguity — config missing, config malformed,
   config slow, Supabase unreachable, CDN blocked, token expired, unknown error
   — resolves to *online off*. There is no code path where uncertainty resolves
   to "keep trying".
2. **Online code is never on the boot path.** Online modules are dynamically
   imported *after* the game is playable and only if their flag is on. The
   import-graph guard in [07](07-test-strategy.md) §2.4 machine-checks this.
   Consequence: a blocked or slow `@supabase` CDN fetch cannot delay the first
   frame, because the fetch has not been issued yet.
3. **Flags-off is today's game, not a degraded version of tomorrow's.** No empty
   board panels, no greyed-out sign-in button, no "offline" watermark. The
   title screen, the city picker, the READY gate, and the results screen render
   exactly as they do on today's build. `AC-OFF-1`.

---

## 2. Feature-flag strategy

### 2.1 The flags

One module, `js/net/flags.js`, exporting a frozen object read once at boot.

| Flag | Off means | Notes |
|---|---|---|
| `online` | **Master kill switch.** Nothing online loads, at all. | Every other flag is ANDed with this one. Flipping this alone is the whole-system rollback. |
| `accounts` | No sign-in UI, guest only, no identity capture. | |
| `arena` | No live shared arena; solo play only. | The heaviest and riskiest subsystem — first to be switched off under load. |
| `boards` | No leaderboards rendered anywhere. | |
| `belts` | No belts, no reigns, no trophy room. | Depends on `boards`; enforced, not assumed. |
| `submit` | Runs are not sent to the server. Local score still shown. | Lets scoring stay off while boards stay readable — the right state during a moderation incident. |
| `event_tag` | No event scope applied to runs (value, not boolean: `null` or `"unbound"`). | Turning UNBOUND scoping on is a config edit, not a deploy. |
| `room_cap` | Numeric (default 8). | The bandwidth/cost lever, changeable in seconds. |
| `snapshot_hz` | Numeric (default 15). | The other bandwidth/cost lever. See [10](10-observability-and-nfr.md) §4. |

`room_cap` and `snapshot_hz` are flags on purpose. They are the two dials that
convert "the arena is struggling" into "the arena is fine but slightly less
smooth", and on the booth floor that conversion has to be available without a
deploy.

### 2.2 Where the values come from — precedence, highest first

1. **URL parameter** — `?online=off`, `?arena=off`, `?diag=1`. Instant, per-tab,
   no persistence. This is what a booth attendant is told to type when a
   kiosk misbehaves, and what a developer uses to demo a specific state.
2. **localStorage override** — set by the diagnostics overlay, persists on that
   machine. Used to pin a kiosk into a known-good configuration for a whole day.
3. **`/online-config.json`** — a static file on Vercel, fetched at boot with a
   **hard 1500 ms timeout** and a short cache TTL. This is the remote control:
   editing it and redeploying (a static file change, seconds) flips flags for
   every machine on the next page load.
4. **Compiled default** — every flag `false`, `event_tag` `null`. What ships in
   the repo.

The precedence order matters operationally: a kiosk that has been manually
pinned (2) will not be un-pinned by a config change (3), which is correct — a
machine someone has already had to fix should not silently re-break.

### 2.3 Fail-closed mechanics

- The config fetch is `AbortController`-bounded at 1500 ms. Timeout, non-200,
  non-JSON, or a shape that fails validation ⇒ all flags stay at the compiled
  default. Three separate tests in [07](07-test-strategy.md) §2.4.
- The fetch happens **in parallel with** the scene build, never before it. The
  scene build is the long pole (Brooklyn measured at 4,051 ms; Boston is
  heavier), so 1500 ms of config fetch is free wall-clock — but only if it
  cannot block. It must not be awaited before the first frame.
- **Runtime demotion.** If the arena subsystem throws, or the Realtime channel
  fails N reconnects, the client demotes itself: `arena` off for the rest of the
  session, a one-line explanation in the connection pill, and the game continues
  solo. It does not retry forever, and it does not take the rest of online with
  it.
- **The dead-man default on a new build.** Any newly deployed build starts with
  the compiled defaults until the config is fetched. A deploy therefore cannot
  turn something on by accident; it can only fail to turn something on.

### 2.4 Proving the off-path stays honest

The flags-off equivalence test is a gate, not a habit
([07](07-test-strategy.md) §2.4). It runs inside `node tools/validate.mjs`, so
it runs before every commit that touches `js/`. The day someone imports a
Supabase module at the top of `js/main.js` "just for a second", the validator
goes red and this whole strategy survives.

---

## 3. Phased rollout

Each phase has an entry gate, a duration, and an exit gate. A phase does not
start because the calendar says so; it starts because the previous exit gate
passed.

### Phase 0 — Internal (flags off in config, on by URL)

- **Deployed to:** production URL, `online-config.json` with everything `false`.
- **Enabled by:** `?online=on&arena=on&...` on the developer's machine only.
- **Duration:** the length of the build.
- **Entry gate:** the site is deployed and today's offline game works on it
  (§4). Nothing online is required for this gate — this is the "prove the deploy
  path" phase, and it should happen **first, before any online code exists**.
- **Exit gate:** `node tools/validate.mjs` prints `ALL PASS` with all new probes
  in; pgTAP RLS suite green; Supabase Security Advisor clean or waived in
  writing; peer harness passes the §4.1 matrix in [07](07-test-strategy.md);
  OAuth round trip works on the stable preview alias for all three providers.

### Phase 1 — Soft launch (online on, small audience, real world)

- **Enabled by:** `online-config.json` set to `accounts`, `boards`, `belts`,
  `submit` = true; `arena` **false**; `event_tag` null.
- **Audience:** a link sent to a handful of people, on their own devices and
  networks. This is the first time the system meets hardware and connections we
  do not control, and it is deliberately arena-free so that identity, boards,
  and submission are proven independently of the riskiest subsystem.
- **Duration:** at least **one full week**, including a weekend, and including
  at least one deliberate period with the arena flipped on for a scheduled hour
  with real people on real networks.
- **Watch:** Supabase Auth logs for failed sign-ins by provider; the
  `ops_events` table for client-reported errors; the Realtime message counter
  against the projection in [10](10-observability-and-nfr.md) §4; the queued-
  submission drain rate.
- **Exit gate:** zero unexplained sign-in failures over 24 h; no email or
  company field reachable from an anon session (re-run the RLS suite against
  *production*, not just local); the message-volume projection re-derived from
  measured data rather than arithmetic; one full arena hour with ≥ 4 real
  players completing without a manual intervention.

### Phase 2 — Pre-event rehearsal (the dress rehearsal, not a phase to skip)

- **Where:** on the actual booth hardware, ideally on a network that is not the
  office one. Then again on the venue wifi the evening before doors.
- **What:** the entire §8 checklist in [07](07-test-strategy.md), timed. The
  moderation drill and the kiosk reset are done **by the person who will staff
  the booth**, not by the developer.
- **Exit gate:** the booth staffer can, unaided: reset a kiosk between players,
  read the connection pill and say what it means, hide a handle from the big
  screen in under a minute, and switch a kiosk to offline-only.

### Phase 3 — UNBOUND

- **Enabled by:** `event_tag: "unbound"`, everything else on, `room_cap` and
  `snapshot_hz` set to whatever Phase 1's measurements justified.
- **Change freeze:** **no code deploys during event hours.** Config-file flag
  changes only. If a code fix is genuinely required, it ships during a scheduled
  gap, gets the full validator, and gets a rollback plan written down before it
  goes out. The pressure to hotfix in front of an audience is exactly the
  pressure that produces the outage.
- **Daily:** a start-of-day checklist and an end-of-day quota/cost read (§5.6).

### Phase 4 — After

- Event tag off. Boards keep the `unbound` scope as history (that is the point
  of scope being a dimension). Belts continue on the other three scopes.
- Post-event review: what the runbook was missing, written down while it still
  hurts.

---

## 4. The first-ever deploy of this repo

**This repo has never been deployed anywhere.** That is a real risk
([11](11-risk-register.md) R8), and the mitigation is to do it early, before any
online code exists, so that a deploy problem and an online problem can never be
the same problem.

### 4.1 What makes this deploy unusual (and easy)

There is no `package.json`, no build step, no framework, and no server code.
Vercel will try to detect a framework and find nothing, which is the correct
outcome. The whole deploy is: serve these files.

- **Framework preset:** Other.
- **Build command:** none (explicitly blank, not the default).
- **Output directory:** repo root.
- **Install command:** none.
- **Node version:** irrelevant — nothing runs on Vercel. Every server-side
  behaviour in this project lives in Supabase Edge Functions. Vercel is a CDN
  with a domain attached.

That last point has a consequence worth stating plainly because it shapes
[10](10-observability-and-nfr.md): **a static Vercel deploy produces almost no
runtime logs**, because there is no runtime. Vercel gives deployment logs and
traffic/analytics; the actual behavioural observability has to come from
Supabase and from in-product UX.

### 4.2 `vercel.json`

The things that will bite, each of which is a one-line fix that is much cheaper
before the event than during it:

- **MIME types.** `.mjs` and `.js` must be served as `text/javascript`. An ES
  module served as `text/plain` fails silently-ish in a way that reads as "the
  game is broken", and `tools/` uses `.mjs`.
- **Caching.** `index.html` and `online-config.json` must be
  `no-cache`/short-TTL — the config file is the remote control and a 1-hour edge
  cache on it makes the remote control useless. Hashed-immutable is not
  available (no build step, so no content hashing), which means **`js/`, `css/`
  and `assets/` need a short-to-moderate TTL with revalidation**, not a
  year-long immutable one. A stale `js/main.js` against a fresh `index.html` at
  a booth is unfixable from the booth.
- **Security headers.** `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Content-Security-Policy` that must explicitly allow the three.js CDN, the
  Supabase CDN, and the Supabase project origin (`connect-src` for REST +
  Realtime websocket). Get the CSP wrong and the symptom is a blank game. Test
  it on the stable preview alias before production.
- **No SPA rewrite.** This is a single `index.html` served at `/`; do not add a
  catch-all rewrite that turns a 404 into a game screen.

### 4.3 `.vercelignore`

Exclude `.wiki/`, `docs/`, `tools/`, `CHANGELOG.md`, `STATUS.md`, `AGENTS.md`.
The existing runbook notes they are harmless if included; they are not harmless
*now*, because `docs/` and `.wiki/` will contain the threat model, the schema
design, and the event operations plan. Not secret, but not public either.

Nothing in the repo may contain a service-role key or a client secret at any
point — see §5.7 and [09-threat-model.md](09-threat-model.md).

### 4.4 Domain and protection

- Custom domain on production. A `*.vercel.app` URL on booth signage is worse
  than it sounds: it is longer, less trustworthy, and harder to read from three
  feet away if someone wants to play on their phone.
- **Deployment protection ON for previews, OFF for production.** Note the
  interaction with OAuth: a protected preview cannot complete an OAuth callback,
  and every preview deploy gets a fresh hostname that is not in the provider's
  allow-list anyway. Hence the **single stable preview alias** in
  [07](07-test-strategy.md) §6 — one hostname, registered once, protection off,
  used for all OAuth testing.

### 4.5 The one thing to verify on day one of the deploy

Load the production URL on a phone, on cellular, cold cache, and play a level to
completion. Before any online work starts. If the three.js importmap, the
assets, or the CSP are wrong, that is the moment to find out — not in week
three, and not at a booth.

---

## 5. Day-of-event runbook

**Audience: the person standing at the booth.** Not a developer. Written to be
printed on one page, taped inside the counter, and followed while someone is
waiting to play.

### 5.0 The one rule

> **The game always works. If anything online is broken, turn online off and
> keep playing.**

Typing `?online=off` at the end of the address and pressing Enter makes the
kiosk today's plain game: no sign-in, no board, no arena. It cannot fail. Do
this any time you are unsure, and deal with the cause afterwards.

### 5.1 Start of day (10 minutes, per kiosk)

1. Power on, plug in, confirm the plug is actually in the wall.
2. Open the browser. It should already be on the game.
3. Check the **connection pill** in the corner. Green "Online" is good. Amber
   "Reconnecting" means wait 30 seconds. Grey "Offline" means see §5.3.
4. Play one 30-second run yourself. Confirm your score appears on the board
   within a few seconds.
5. Check the big screen shows a **"last updated"** time that is less than a
   minute old.
6. Confirm no one's name from yesterday is still signed in (§5.2).

### 5.2 Reset a kiosk between players

The 5-second version, and the version to do every time:

- **Press the RESET button on screen** (bottom corner, deliberately reachable
  and deliberately not next to anything else). It signs the previous player out,
  clears the sign-in form, and returns to the title screen.
- Every ~10 players, or any time something looks odd: **reload the page**
  (Ctrl+R / Cmd+R). This is free and fixes almost everything transient.

**Never leave a player signed in when they walk away.** Their email is on that
machine until you reset. If a player asks you to delete their details, take
their name and email on paper and hand it to the person in §5.7 — do not try to
do it from the kiosk.

### 5.3 The wifi dies

**What you will see:** the pill turns grey and says "Offline — your run is saved
and will post when you're back". The game keeps playing normally.

**What to do:**

1. Nothing, for 60 seconds. It usually returns.
2. Tell the next player, honestly: *"The board's offline for a minute — your
   score is saved and it'll post itself."* It will. Runs queue locally and drain
   automatically.
3. If it is still down after 5 minutes: switch the kiosk to `?online=off` (§5.0)
   so nobody sees a stale board, and put the "scores will update shortly" card
   on the big screen.
4. If the venue wifi is fine but the game is not, it is not the wifi — §5.5.

**What NOT to do:** do not clear the browser cache or use a private/incognito
window to "start fresh". That throws away every queued run on that machine.

### 5.4 The leaderboard stalls

**How you know:** the "last updated" timestamp on the big screen stops
advancing, or a score you just watched someone set never appears.

1. Reload the big screen page. This fixes the majority of cases and costs
   nothing.
2. If it is still stale, check a kiosk's pill. Green pill + stale board means
   the board, not the network.
3. Turn the **`submit`** flag off in the config (§2.1) so kiosks stop queueing
   against a broken board, and put up the "scores updating shortly" card.
   Queued runs are not lost; they post when submission is re-enabled.
4. Call §5.7.

### 5.5 The host laptop sleeps mid-match

**What should happen:** the match continues. Another player's machine takes over
as host automatically, within a couple of seconds. Players may see a brief
stutter.

**If instead the match ends or freezes for everyone:**

1. Everyone reloads. Start a new match. Apologise once, move on — nobody at a
   booth minds a 20-second hiccup, they mind a five-minute debugging session.
2. If it happens **twice**, turn the **`arena`** flag off in the config. Solo
   play and the boards keep working. The arena is the riskiest subsystem and it
   is designed to be the first thing sacrificed.
3. Prevention, which is why §7's checklist disables sleep: the kiosks must never
   sleep, on power or on battery. If a laptop slept, check that setting again —
   an OS update can quietly restore it.

### 5.6 Hide an offensive or cheated name from the big screen — fast

**Target: under 60 seconds, by anyone at the booth.** This is a partner event;
a slur on a screen behind a HubSpot logo is the single worst outcome in this
document, and it beats every technical failure here for consequence.

1. Open the **moderation page** from the bookmark bar (it requires a sign-in;
   the booth lead has it).
2. Find the entry. Press **Hide**.
3. The big screen removes it on its next refresh (under 15 seconds). Verify with
   your eyes before you walk away.

**Hide, never delete.** The row stays for the record; only its visibility
changes. Deleting destroys the evidence and can re-open a belt to a run that
should not hold it.

**If the moderation page will not load:** blank the big screen. Switch it to the
game's title screen or the "scores updating shortly" card. **An offline board is
always better than an offensive board.** Then call §5.7.

Preventive, in place before doors: a profanity filter on display names at write
time, a length cap, and — the highest-leverage one — display names defaulting to
the player's real first name and last initial from their sign-in rather than a
free-text handle. Free-text handles are the thing that needs moderating; not
offering one removes most of the problem. If free-text handles are wanted
anyway, that is a product call for Nico and it comes with this operational cost
attached.

### 5.7 Who to call

Fill this in before the event. A runbook with an unfilled contact block is not a
runbook.

| Situation | Who | How |
|---|---|---|
| Anything technical, first call | Nico | phone / text |
| Offensive content on screen | Booth lead — **blank the screen first, call second** | in person |
| Someone asks to delete their data | Booth lead, on paper, same day | — |
| Venue network | Conference IT desk (note the location and hours) | — |

Escalation rule for the booth: **you are allowed to turn things off without
asking.** Turning a flag off is never the wrong call in the moment. The only
unforgivable action is leaving something broken visible while waiting for
permission.

### 5.8 End of day

1. Read the Supabase dashboard's Realtime message count and Edge Function
   invocation count for the day. Write both down. Compare with the daily budget
   in [10](10-observability-and-nfr.md) §4. **If day one used more than half the
   month's allowance, day two runs with `arena` on only during scheduled
   windows** — that is the tripwire, and it must be decided in the evening, not
   at 2 p.m. on day two.
2. Skim the `ops_events` table for repeated client errors.
3. Note anything that surprised you. Post-event review depends on it.

---

## 6. Rollback, layer by layer

Ordered by speed. Always reach for the fastest one that fixes the symptom, and
never reach past the DB layer during an event.

| Layer | Action | Time | Reverses | Data risk |
|---|---|---|---|---|
| **1. Per-kiosk** | `?online=off` in the URL bar | ~5 s | that machine, that tab | none |
| **2. Flags** | Edit `online-config.json`, redeploy the static file | ~60 s | every machine on next load | none — queued runs persist |
| **3. Static deploy** | Vercel dashboard → previous deployment → Promote to Production | ~1 min | the client code | none; localStorage saves are untouched by deploys, and schema migrations run on load |
| **4. Edge Function** | `supabase functions deploy <name>` from the previous git tag | ~2 min | server-side scoring / OAuth exchange | none if the function is stateless — and it must be |
| **5. Auth provider** | Supabase dashboard → disable the misbehaving provider | ~30 s | one sign-in path; the other two keep working | existing sessions survive |
| **6. Database schema** | **Forward-fix only.** No `DROP`, no destructive down-migration, ever, and never during an event. | hours | — | high; this is why it is last |
| **7. Content** | Moderation hide flag on a row | ~15 s | one entry's visibility | none — nothing is deleted |

Notes that make these real rather than aspirational:

- **Layers 1–3 are the event-hours toolkit.** 4 and 5 are for a soft-launch
  problem. 6 does not happen during an event, full stop.
- **Migrations are expand-contract.** Add columns and tables; never rename or
  drop in the same release as the code that stops using them. A rollback of the
  client (layer 3) must be able to run against the *new* schema, or layer 3 is
  not actually available. [12-migration-plan.md](12-migration-plan.md) owns the
  detail; this is the constraint it must satisfy.
- **Client save data is out of scope for rollback.** `localStorage` v13 is the
  offline source of truth and deploys do not touch it. If a bad client version
  wrote a bad local save, the fix follows the existing convention: bump
  `CURRENT_VERSION`, add a repairing migration, never delete, quarantine under
  `hole-city-save.quarantine`.
- **Rolling back the client does not roll back the data it wrote.** A client
  that submitted malformed runs leaves those runs behind; they get hidden by the
  moderation flag (layer 7) or re-validated later, not deleted.
- **Practise layer 2 and layer 3 once, during Phase 1.** A rollback path that
  has never been executed is a rollback path that does not exist. The person who
  will need it at the event should be the one who executes the rehearsal.

---

## 7. Environments and secrets

Three environments, one repo, no build step — which changes the shape of this
problem from the usual one.

| | Local | Preview (stable alias) | Production |
|---|---|---|---|
| Host | `python -m http.server 8000` | `staging.<domain>` on Vercel | `<domain>` on Vercel |
| Supabase project | `flywheel-dev` | `flywheel-dev` | `flywheel-prod` |
| Flags source | URL params + local config file | `online-config.json` (staging copy) | `online-config.json` |
| OAuth redirect registered | localhost only | yes | yes |
| Deployment protection | n/a | **off** (OAuth needs it) | off |
| Test data | freely | freely | never |

### 7.1 What is public, and why that is fine

A static site has **no server-side environment**. The Supabase project URL and
the **anon** key are compiled into a file the browser downloads. This is normal
and correct for Supabase: the anon key is an identifier, not a credential, and
**RLS is the entire security boundary**. That is precisely why
[07](07-test-strategy.md) §5 treats RLS tests as the load-bearing security
tests and why "RLS enabled on every table" is asserted in a loop rather than
trusted.

Environment selection is by hostname in `js/net/config.js`: `localhost` and
`127.0.0.1` → dev project; the staging alias → dev project; anything else →
prod. Hostname-based, not build-based, because there is no build.

### 7.2 What is actually secret, and where it lives

| Secret | Lives in | Never in |
|---|---|---|
| Supabase `service_role` key | Supabase Edge Function secrets only | the repo, the client, `online-config.json`, a `.env` that gets committed |
| HubSpot client secret | Supabase Edge Function secrets (`supabase secrets set`) | anywhere else, ever |
| Google OAuth client secret | Supabase Auth provider config | the repo |

The repo already has the right instinct on this and it should be stated as the
house pattern rather than re-derived: `tools/gen-partner-logo.mjs` reads
`LEONARDO_API_KEY` from `process.env` at call time and never writes it to a
file, *because this repo has no build step and no server, so anything under it
is served verbatim to every browser*. That reasoning applies unchanged to every
secret in this project.

Practical guards: `.env*` in `.gitignore` (verify, do not assume); a
`.env.example` listing names with empty values so the shape is documented; a
secret scan before the first public deploy; and a rule that the day the
`service_role` key appears anywhere outside Supabase, it gets rotated, not
apologised for.

### 7.3 Drift

Dev and prod projects will drift — different tables, different policies,
different providers enabled. The tripwire is running the **pgTAP RLS suite
against production** at every phase gate, not just locally
([07](07-test-strategy.md) §5). A policy that exists in dev and not in prod is
the exact shape of a data leak, and it is invisible to every other check here.

---

## 8. Change control during the event

| Change | Allowed during event hours? | Requires |
|---|---|---|
| URL-param flag on one kiosk | Yes, freely | nothing |
| `online-config.json` flag edit | Yes | tell the booth staff what changed |
| Moderation hide | Yes, immediately | nothing — do it first, log it after |
| Rollback to a previous deployment | Yes | say so out loud to the booth |
| **New code deploy** | **No** | a scheduled gap, full validator green, a written rollback plan, and Nico's say-so |
| Database migration | **No** | after the event |

The freeze is the point. Everything above the line is reversible in under a
minute by one person; everything below it is how a booth loses an afternoon.
