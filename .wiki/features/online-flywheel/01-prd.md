# PRD 0001: Online Flywheel — accounts, belts, live arena, leaderboards

> [Objective overview](00-objective-overview.md) — read first; this document
> assumes its trajectory. · [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md)

- **Status:** Proposed — 2026-08-06
- **Priority:** P0 (hard external date: UNBOUND)
- **Owner surface:** new `js/net/*` and `js/meta/*` modules, `js/save.js`,
  `js/main.js` state machine, `js/ui/screens.js`, `index.html` importmap,
  new `supabase/` directory (migrations + Edge Functions), Vercel static deploy
- **Migration:** localStorage `hole-city-save` v13 → v14; new Supabase schema
  (initial migration set, numbered per Supabase convention)
- **Related docs:** `docs/PRD.md` (single-player, still normative),
  [ADR-0002](../../adr/0002-sim-render-split.md),
  [ADR-0003](../../adr/0003-deterministic-seeded-generation.md), new ADRs
  0009–0012, and every sibling doc listed in [README.md](README.md)

**Note on location.** The repo has no `.wiki/prds/` directory and one normative
product doc, `docs/PRD.md`. Rather than mint a parallel PRD tree for a single
document, this PRD lives inside its feature package as `01-prd.md`, matching
the existing `.wiki/features/<feature>/` pattern. It is numbered `PRD 0001`
because it is the first numbered PRD in the repo.

---

## 1. Overview / problem / goal

Flywheel is a fully static browser game whose entire memory of a player is one
`localStorage` key on one machine. It is about to be played by strangers, on a
booth, at UNBOUND, in front of HubSpot partners — an audience that will play
once and leave with nothing, and leave us with nothing.

This PRD specifies the online layer that fixes both halves of that: **player
accounts** (guest-first, claimable by email OTP, Google, or HubSpot),
**achievements**, a **live shared arena** where everyone who joins eats the same
city at the same time, and **leaderboards across four scopes** ranked by a set
of simultaneously-held **championship belts** rather than one number.

**Primary goal:** a stranger walks up, plays within five seconds, sees
themselves on a board, is offered a reason to give us their name, and is given a
reason to come back before the conference ends.

## 2. Load-bearing invariant

**No score reaches a leaderboard or a belt until the server has recomputed it
by replaying the pure sim from the submitted seed and input trace.**

The client never reports an authoritative score. It reports *what it did*; the
server decides *what that was worth*. A pull request that writes a
client-supplied score value into a ranked surface is wrong by construction and
is rejected on sight, regardless of what else it does well.

This invariant is only affordable because of two existing ones, which it now
depends on and therefore promotes:

- **Determinism** ([ADR-0003](../../adr/0003-deterministic-seeded-generation.md)):
  no `Math.random()` in the pure sim; all randomness through seeded `rng.js`.
  This has been a product requirement. It is now also a **security** requirement.
  Any future change that would weaken it must be reviewed as a security change.
- **The sim/render split** ([ADR-0002](../../adr/0002-sim-render-split.md)): the
  pure sim imports no three.js and no DOM, so it runs in Node — and therefore in
  a Supabase Edge Function — unchanged. Not a fork of the sim. The same modules.

Two supporting invariants, subordinate to the one above:

- **The no-build-step invariant survives.** The Supabase client loads through
  the existing CDN importmap in `index.html`, exactly as three.js does. No
  bundler, no `package.json` for the game.
- **Offline is not a failure state.** With the network absent, the game plays
  exactly as it does today, using localStorage as the source of truth.

## 3. Goals

1. **G1 — Instant play.** A visitor reaches gameplay without authenticating.
   Time from page load to controllable hole is unchanged from today's build.
2. **G2 — Claimable identity.** A player can attach a real identity (first
   name, last name, email, optional company) to their play *after* playing, via
   email OTP, Google, or HubSpot, and their guest progress survives the attach.
3. **G3 — Live shared arena.** Multiple players occupy the same city at the same
   moment, see each other's holes move, and race a shared clock. Booth spectacle
   is the acceptance bar: it must read as impressive to someone watching over a
   shoulder, not merely function.
4. **G4 — Four board scopes.** UNBOUND (event), per city, per level, and
   all-time — each queryable and each rendered.
5. **G5 — Belts.** Several championships held simultaneously, each with a named
   holder, a visible reign length, and a defined way to be taken. Player-facing
   language leans into pro wrestling.
6. **G6 — Achievements.** Unlockable, persistent, visible, and awarded from
   server-validated facts wherever they are competitive.
7. **G7 — Survives conference wifi.** Fully playable offline; degrades legibly;
   queues submissions; never hangs on a spinner.
8. **G8 — One paid service, in the low tens of dollars a month.** Supabase and
   nothing else. Nico approved **$10**; that figure turned out to be a compute
   credit inside Pro rather than a plan price — **Supabase Free is $0 and
   Supabase Pro is $25/month** (verified 2026-08-06). Pro is the
   recommendation, because Free pauses a project after ~7 days of inactivity
   and a paused project on the morning of day two is an outage. **The plan
   decision is open and is Nico's** ([10](10-observability-and-nfr.md) §4.3).
   No other paid service.

## 4. Non-goals (out of scope)

Explicitly not built here. Seams are left where noted in
[00-objective-overview.md](00-objective-overview.md#scope-line-pencil-test).

- Pushing captured leads into the HubSpot CRM as contacts. (HubSpot *sign-in* is
  in scope; HubSpot *CRM writes* are not.)
- Tournaments, brackets, seasons, spectator mode, partner-branded arenas,
  matchmaking or skill rating, public profile pages.
- Mobile-specific live-arena work. Solo mobile play continues to work; a live
  arena is validated on booth hardware only.
- In-game chat, friends lists, voice, clans, any real-money or prize economy.
- A native app, or any cross-title account federation.
- Retiring or replacing the single-player campaign or the sandbox goal runs.

## 5. Personas & user stories

| Persona | Who | What they need |
|---|---|---|
| **Booth walk-up** | A HubSpot partner at UNBOUND with 90 seconds | Play instantly, do something impressive, understand their result |
| **Returning challenger** | The same person, later that day | Find out whether they still hold a belt, and take one back |
| **Remote player** | Someone who finds the link after the conference | Play solo, appear on all-time boards, hold a belt |
| **Booth operator** | Whoever is running the stand | Start an arena, see it is healthy, recover when it is not |
| **Nico** | Product owner | See that people played, and who they were |
| **Validator (non-human)** | A Supabase Edge Function | Replay a submitted run and return the true score |
| **Host client (non-human)** | The first browser in a room | Run the shared sim and broadcast snapshots |

Stories, with full Given/When/Then acceptance criteria, live in
[02-requirements.md](02-requirements.md). That document — not this one — is the
contract the test strategy checks.

## 6. Functional requirements

**Identity**

- **FR-001** The system must let a visitor play with a self-chosen handle and no
  authentication, creating a guest identity local to the device.
- **FR-002** The system must let a guest claim their identity after a run via
  email OTP, Google OAuth, or HubSpot OAuth.
- **FR-003** The system must collect first name, last name, email, and optional
  company as separate normalised fields on claim, pre-filling whatever the
  chosen provider supplies.
- **FR-004** On first successful claim, the system must merge the device's guest
  progress into the account rather than discarding either side.
- **FR-005** The system must treat HubSpot as a custom OAuth flow brokered by an
  Edge Function, since it is not a native Supabase provider.
- **FR-006** The system must let a signed-in player sign out, returning to guest
  play without destroying local progress.

**Live arena**

- **FR-010** The system must let a player create a room, producing a short,
  human-readable, speakable join code.
- **FR-011** The system must let a player join an existing room by code.
- **FR-012** All clients in a room must simulate the same city, from the same
  seed, starting at the same moment.
- **FR-013** The first client in a room is the host: it runs the authoritative
  sim and broadcasts state snapshots at the configured snapshot rate
  (`SNAPSHOT_HZ`, 12 Hz shipped — [04](04-netcode-design.md) §13 owns it).
- **FR-014** Non-host clients must send steering intent to the host and
  interpolate between received snapshots for rendering.
- **FR-015** When the host leaves or stops broadcasting, the system must promote
  a remaining client to host deterministically, without ending the match.
- **FR-016** Each client must render other players' holes with their handles,
  positions, and current size.
- **FR-017** A room must run on a shared clock and end for every participant at
  the same simulated moment.
- **FR-018** Room capacity must be a configuration value, not a constant buried
  in netcode.

**Scoring & validation**

- **FR-020** On run completion (solo or arena), the client must submit a run
  record carrying the seed, the mode, the scope tags, the input trace, and the
  client's own claimed metrics.
- **FR-021** An Edge Function must replay the pure sim from that seed and trace,
  recompute the metrics, and store the *recomputed* values as authoritative.
- **FR-022** A submission whose recomputed metrics diverge from the client's
  claim beyond tolerance must be marked rejected, retained for inspection, and
  excluded from every board and belt.
- **FR-023** Validation must be able to complete asynchronously: the player sees
  their local result immediately and the board confirms shortly after.
- **FR-024** Runs must be stored as immutable event rows. Boards and belts are
  queries over them; no aggregate may be the only record of a run.

**Leaderboards**

- **FR-030** The system must render four board scopes: UNBOUND (event-tagged),
  per city, per level, and all-time.
- **FR-031** Scope must be a tag dimension on a run, not a separate table per
  scope.
- **FR-032** Boards must show only validated runs.
- **FR-033** A player must be able to find their own row without scrolling —
  their position is always surfaced, even when off-page.

**Belts**

- **FR-040** The system must support several belts held simultaneously, each
  defined by a metric, a scope, an evaluation window, and a tie-break rule.
- **FR-041** Belt definitions must be data rows, so a new belt is an insert, not
  a deploy.
- **FR-042** Each belt must have at most one current holder, a reign start
  timestamp, and a displayed reign length.
- **FR-043** When a validated run beats the standing holder on that belt's
  metric, the belt must change hands and both the new and previous holders must
  be recorded in a title history.
- **FR-044** Belt transitions must be announced in-game with wrestling framing
  (a new champion, a title defended, a reign ended).
- **FR-045** A belt must enforce a minimum reign or tie-break rule so that rapid
  churn cannot reduce a championship to a live scoreboard.
- **FR-046** Belt evaluation must be server-side and derived only from validated
  runs.

**Achievements**

- **FR-050** The system must define achievements with an id, a name, a
  player-facing description, and an unlock condition.
- **FR-051** Competitive achievements must be awarded from validated server-side
  facts; purely local ones (settings, exploration) may be awarded client-side
  and synced.
- **FR-052** Achievements earned as a guest must survive the claim in FR-004.
- **FR-053** Unlocks must be visible in-game at the moment they happen and
  reviewable afterwards.

**Offline & degraded**

- **FR-060** With no network, the game must remain fully playable in solo modes,
  with localStorage as the source of truth.
- **FR-061** The system must show a clear, non-alarming connection state and
  never present an indefinite spinner.
- **FR-062** A run completed offline must be queued and submitted automatically
  when connectivity returns, without the player doing anything.
- **FR-063** Every network operation must have a bounded timeout and a defined
  fallback; no user-facing flow may depend on an unbounded await.
- **FR-064** A live arena that loses the network must end the match locally with
  a legible message, not freeze.

## 7. Data model & schema

Full DDL, RLS policies, and index choices live in
[03-technical-design.md](03-technical-design.md). The shape this PRD mandates:

- **`profiles`** — one per account. Separate `first_name`, `last_name`, `email`,
  `company` columns, normalised at write time. Deliberately CRM-shaped so a
  future sync is a mapping, not a cleanup.
- **`guest_links`** — device-scoped guest ids and the account that claimed them.
  Retained rather than deleted, so a claim is auditable and reversible.
- **`runs`** — the event log. Immutable. Carries seed, mode, city, level, scope
  tags (including `event: 'unbound'`), submitted metrics, recomputed metrics,
  validation status, input trace reference, and timestamps. **This is the only
  durable record of play**; everything ranked is a query over it.
- **`belts`** — belt definitions: metric, scope, window, tie-break, display name.
  Rows, not code (FR-041).
- **`belt_reigns`** — the title history: belt, holder, run that won it, start,
  end. Current holder is the open row.
- **`achievements`** / **`player_achievements`** — definitions and unlocks.
- **`rooms`** — arena rooms: code, city/seed, created-at, capacity, current host,
  lifecycle state.

**localStorage** goes v13 → v14, adding the guest identity, the pending
submission queue, and the cloud link. Per `.wiki/conventions.md` hard rule 6,
the new keys go in **both** `freshSave()` and a `MIGRATIONS[13]` entry, and
`tools/validate.mjs` enforces that they agree. Bad or future-version saves
continue to be quarantined, never deleted — the cloud profile inherits the same
posture. Details in [12-migration-plan.md](12-migration-plan.md).

## 8. Surfaces & UX

New and changed screens, all built on the existing `--fw-*` brand tokens and
`.fw-*` primitives in `css/main.css` plus `js/ui/blockword.js` /
`js/ui/sprocket.js` — never a locally reimplemented outline-ring/extrude stack
(`.wiki/conventions.md`, "Brand layer";
[ADR-0005](../../adr/0005-shared-brand-layer.md)).

- **Title screen** — gains a handle field (pre-filled if known), an ONLINE
  entry point, and a connection-state indicator. PLAY remains the largest,
  fastest path; nothing new may sit between load and play.
- **Arena lobby** — create or join by code, the room's city, who is in, and a
  start control. Empty state (waiting for players), loading state, and error
  state (bad code, room full, room gone) all specified.
- **In-arena HUD** — other players' handles and sizes, live standings, the
  shared clock, and a connection pip. Extends `js/ui/hud.js`.
- **Results screen** — extends the existing solo/sandbox results with: your
  placing, what you did to the boards, whether a belt changed hands, and the
  claim prompt. The claim prompt appears **after** the result, never before the
  run.
- **Claim / sign-in** — email + OTP, Google, HubSpot. Per global rule 3, any
  prefix-locked input is pre-filled with its adornment; the player types only
  the unique part, and "must start with…" errors are a bug, not a message.
- **Boards** — a scope switcher across the four scopes, with the player's own
  row always surfaced.
- **Title wall (belts)** — the current champions, their reign lengths, and the
  history of each belt. This is the booth's second screen if there is one.
- **Achievements** — a grid of earned and unearned, reachable from the title
  screen.

**Interaction budget.** Load → playing must stay at one tap. Load → in a live
arena with strangers must be at most three. Claiming an identity after a run
must be at most three taps plus typing, and zero for a returning signed-in
player.

## 9. Interface contract (API / functions)

- **Supabase client** loaded via the existing importmap in `index.html`, pinned
  to an exact version like three.js is. No bundler.
- **Realtime channels** — one per room. Message kinds: `snapshot` (host →
  everyone, 12 Hz shipped), `intent` (client → host, 10 Hz shipped), `presence`
  (join/leave/heartbeat),
  `host_claim` (migration). Wire shapes in
  [04-netcode-design.md](04-netcode-design.md).
- **Edge Functions**
  - `submit-run` — accepts a run submission, replays it, writes the
    authoritative row, evaluates belts and achievements, returns the verdict.
  - `hubspot-oauth` — the custom OAuth broker (start + callback).
  - Any other server work is a Postgres function or a policy-guarded query, not
    a new service.
- **Reads** — boards, belts, and profiles are read through RLS-guarded
  `select`s from the client. No read path may bypass RLS by using a service key
  in the browser; the service role key never leaves the server side.

## 10. Security, authz & access control

- **RLS on every table, no exceptions.** Default deny. A player may read public
  board and belt data; may read and write only their own profile; may never
  write `runs.validated_*` columns, `belt_reigns`, or `player_achievements`
  directly. Those are written by Edge Functions using the service role.
- **Scores are never client-authoritative** — the invariant in §2.
- **Rate limiting** on `submit-run` and on room creation, per identity and per
  IP. A conference is a shared NAT, so per-IP limits must be generous enough not
  to punish the booth's own network; per-identity is the primary control.
- **Input validation at every boundary.** Submission payloads are bounded in
  size (an input trace has a maximum length) and schema-checked before any
  replay is attempted. An unbounded trace is a denial-of-service vector against
  our own CPU budget.
- **Untrusted display strings.** Handles, names, and company names are rendered
  as text, never as markup, and are length-capped and profanity-screened before
  appearing on a booth screen in public.
- **Personal data.** Name, email, and company are personal data. Collection must
  be consented to at the point of capture with a plain statement of what it is
  for. Deletion on request must be possible. See
  [09-threat-model.md](09-threat-model.md).
- **Secrets.** Anon key in the client (that is what it is for); service role key,
  Google secret, and HubSpot secret only in Edge Function / Vercel environment,
  never in the repo, and mirrored into `.env.example` by name only.

## 11. Data integrity & write path

- **One write path for ranked data.** All authoritative writes to `runs`,
  `belt_reigns`, and competitive `player_achievements` go through the
  `submit-run` function. No second path may be added; if a new mode needs to
  score, it extends that function.
- **Idempotency.** Each submission carries a client-generated idempotency key.
  A retried submission (the offline queue will retry) must not create a second
  run, a second belt change, or a duplicated achievement.
- **Belt transitions are transactional.** Closing the outgoing reign and opening
  the incoming one is one transaction. A partial transition would leave a belt
  with two holders or none.
- **Runs are immutable.** Correcting a mistake means a new row and a status
  change, never an in-place edit of a historical result.
- **Rejected runs are retained**, not deleted — the same instinct as `save.js`'s
  quarantine. A deleted rejection is a cheat we cannot learn from.

## 12. Testing strategy

Full mapping in [07-test-strategy.md](07-test-strategy.md). What this PRD
requires exist:

- **The validator stays the spine.** `tools/validate.mjs` already replays the
  pure sim headlessly and enforces determinism and the save-schema agreement.
  It is extended, not forked, to cover the v13 → v14 save shape.
- **Replay parity test.** Given a recorded browser run, the Node replay must
  produce identical metrics. This test *is* the invariant in §2; if it is red,
  the leaderboard is not trustworthy.
- **Netcode tests without a network.** Host migration, snapshot interpolation,
  and intent handling are tested against a mock channel, so the logic is proven
  before any wifi is involved.
- **Degraded-network tests are mandatory, not optional.** Throttled, lossy, and
  fully-offline runs of every player-facing flow. Conference wifi is the
  expected environment, so it gets the coverage of an expected environment.
- **RLS tests.** For each table, assert that an anonymous client, a wrong-user
  client, and the owner each get exactly the access they should.
- **Live verification** against the deployed Vercel URL for anything that only
  exists deployed: OAuth callbacks (bound to a deployed origin), Realtime
  behaviour under real latency, and "is it live." Per global rule 2, local is
  fine for sim, UI, and logic; these three are not.

## 13. Observability & logging

Vercel runtime logs plus Supabase logs plus `error.digest`-style user-facing
error identity. **No new observability SaaS** — Sentry and its equivalents are
permanently banned. Detail in
[10-observability-and-nfr.md](10-observability-and-nfr.md).

- Structured logs from `submit-run`: submission id, identity id, mode, scope,
  verdict, replay duration, and divergence magnitude on rejection. Field names,
  never personal values.
- Room lifecycle events: created, joined, host promoted, ended, and why.
- A rejection rate that spikes is either an attack or a determinism regression,
  and both matter enough to be visible at a glance.
- The booth operator needs one answer to "is it working" — a single health view,
  not a log search.

## 14. Error handling & user feedback

Every failure mode gets a specific, actionable, jargon-free user-visible
response. No leaked internals, no vendor names in copy.

| Failure | What the player sees |
|---|---|
| No network at load | Plays normally; a quiet offline indicator; online entry points explain they need a connection |
| Network lost mid-arena | The match ends locally with a plain message and their result is kept and queued |
| Bad or expired room code | Immediate inline message, focus returned to the field |
| Room full | Told so, and offered to start their own |
| Host left | Nothing — migration is silent by design. Only a total failure to migrate surfaces a message |
| Submission failed | Result is shown and queued; the player is told it will post itself |
| Submission rejected | A neutral message that the run could not be verified, with no accusatory language and no detail that teaches a cheater what tripped |
| OTP not arriving | Resend, with a cooldown, and an explicit alternative path |
| OAuth cancelled or failed | Returned to where they were, still a guest, nothing lost |

Transient upstream failures retry with backoff. Exhausted retries queue rather
than discard. Copy in user-facing strings follows the house rule: **no em- or
en-dashes** in anything the player reads (internal docs like this one are
exempt).

## 15. Performance & cost

- **Frame rate is the first budget.** The live arena must not regress the
  existing 60 fps target on booth hardware. Netcode work happens off the fixed
  timestep; `sim.step(1/60)` remains the only place gameplay state changes
  (`.wiki/conventions.md` hard rule 3). Remote holes are interpolated in the
  render layer, which reads sim state and never writes it
  ([ADR-0002](../../adr/0002-sim-render-split.md)).
- **Snapshot budget.** Snapshot rate × room capacity (12 Hz × 8 shipped), with
  snapshots bounded in size.
  Room capacity is tuned against measured bandwidth on booth wifi, not guessed.
- **Perceived latency.** A remote hole's motion must read as smooth, not
  teleporting, at conference-grade latency and loss. This is the acceptance bar
  for G3 and it is a *look*, not a number.
- **Submission latency.** The player never waits on validation (FR-023). The
  board confirms within a few seconds under normal conditions.
- **Replay cost.** Bounded trace length plus a bounded replay time per
  submission, so a booth rush queues rather than melts.
- **Cost ceiling: one Supabase plan, Free ($0) or Pro ($25/month), and nothing
  else.** The $10 previously approved is a compute credit inside Pro, not a
  plan price; the plan choice is open and is Nico's
  ([10](10-observability-and-nfr.md) §4.3, [03](03-technical-design.md) §7). No
  other paid service is introduced. Free and open-source dependencies are fine
  where they are the better engineering choice; anything with a price tag needs
  approval first and none is requested here.

## 16. Accessibility

- Full keyboard operation of every new screen: lobby, claim, boards, belts,
  achievements. Visible focus rings; focus moved to the first error on a failed
  submit; focus trapped correctly in any modal.
- ARIA labelling on the connection state, the live standings, and belt-change
  announcements — a belt changing hands is a live region, announced once, not on
  every re-render.
- Contrast checked against the brand palette in both the light plate and the
  dark in-game overlay contexts.
- **Reduced motion is already honoured** from both the setting and the OS
  (`js/main.js`, `js/camera.js`, `js/ui/screens.js`). New celebration and
  belt-change animations must honour it too, on the same setting — not a new one.
- Join codes must be readable aloud and unambiguous: no characters that sound or
  look alike.

## 17. Phases / rollout

Each phase is independently shippable and independently useful, ordered so the
riskiest identity work is not blocking the spectacle. Detail and the day-of
runbook in [08-rollout-and-runbook.md](08-rollout-and-runbook.md).

1. **Backbone** — Supabase project, schema, RLS, client via importmap, guest
   identity, save v13 → v14. Nothing visibly changes; everything after depends
   on it.
2. **Runs and boards** — submission, server-side replay validation, all four
   board scopes. The invariant lands here.
3. **Belts and achievements** — definitions as rows, reigns, title history, the
   title wall, unlock moments.
4. **Live arena** — rooms, host authority, snapshots, interpolation, host
   migration.
5. **Identity claim** — email OTP, then Google, then **HubSpot last** because it
   is the highest-risk path and must not be able to delay phases 1 through 4.
6. **Conference hardening** — degraded-network passes, booth rehearsal on the
   real hardware and, if at all possible, on comparably bad wifi.

Every online surface sits behind a flag so the game can be reverted to today's
purely-static behaviour in one setting change. That flag is the rollback plan.

## 18. Reuse-don't-fork

Named explicitly, because forking any of these would be a defect:

- **The pure sim** (`rng.js`, `tiers.js`, `citygen.js`, `levels.js`, `sim.js`,
  `voxelsim.js`). The Edge Function imports the *same modules* the browser runs.
  A server-side reimplementation would break the invariant it exists to serve.
- **`tools/validate.mjs`** — extended for the new save shape, not replaced. It
  is the test suite.
- **`js/save.js` migration discipline** — bump `CURRENT_VERSION`, add a
  `MIGRATIONS` entry, add the same keys to `freshSave()`, quarantine bad data.
  The cloud sync layer adopts this posture rather than inventing one.
- **The brand layer** — `--fw-*` tokens, `.fw-*` primitives,
  `js/ui/blockword.js`, `js/ui/sprocket.js`
  ([ADR-0005](../../adr/0005-shared-brand-layer.md)). Every new screen consumes
  them.
- **`js/ui/screens.js`'s `actions` callback pattern** and `js/main.js`'s state
  machine. Online states join the existing machine; they do not run a parallel
  one.
- **`js/ui/hud.js`** for the in-arena HUD.
- **The CDN importmap** in `index.html` for the Supabase client, same mechanism
  and same pinning discipline as three.js.

## 19. Acceptance criteria

Each line is independently verifiable. Full Given/When/Then form in
[02-requirements.md](02-requirements.md).

- [ ] **AC-1 (invariant)** A run submitted with a tampered score is rejected and
      appears on no board and in no belt. Verified by submitting one.
- [ ] **AC-2 (invariant)** A recorded browser run and its Node replay produce
      identical metrics.
- [ ] **AC-3** `node tools/validate.mjs` prints `ALL PASS`, including the v14
      save-schema agreement check.
- [ ] **AC-4** A first-time visitor is controlling a hole without signing in,
      in the same time as today's build.
- [ ] **AC-5** A guest's coins, achievements, and run history survive a claim,
      through all three sign-in paths.
- [ ] **AC-6** Two or more clients in one room see each other's holes moving in
      the same city on a shared clock.
- [ ] **AC-7** The host closes their tab mid-match; the match continues for
      everyone else and produces valid results.
- [ ] **AC-8** A validated run appears on each of the four board scopes it
      qualifies for.
- [ ] **AC-9** Beating a standing holder transfers the belt, ends the old reign,
      starts the new one, records both in history, and announces it in-game.
- [ ] **AC-10** A new belt can be added by inserting a row, with no code change
      and no deploy.
- [ ] **AC-11** With the network disabled, every solo mode is fully playable and
      no screen shows an indefinite spinner.
- [ ] **AC-12** A run completed offline posts itself when the network returns,
      exactly once, with no player action.
- [ ] **AC-13** RLS blocks an anonymous client and a wrong-user client from
      reading or writing anything they should not, per table.
- [ ] **AC-14** Every new screen is fully keyboard operable, honours reduced
      motion, and passes contrast.
- [ ] **AC-15** One setting reverts the build to today's purely-static
      behaviour.
- [ ] **AC-16** No user-facing string contains an em- or en-dash.

## 20. Dependencies & integration points

- **Supabase** — Postgres, Auth, Realtime, Edge Functions, RLS. Free ($0) or
  Pro ($25/mo); **Pro recommended because Free sleeps after ~7 idle days, and
  the plan choice is still Nico's** ([10](10-observability-and-nfr.md) §4.3).
  Blocking: the project must exist before phase 1.
- **Vercel** — static hosting. Already sanctioned. Flywheel is **not deployed
  anywhere yet**, and it must be, before any OAuth callback can be configured.
  This is the first real blocker in the chain.
- **Google OAuth** — native Supabase provider. Needs a Google Cloud project and
  a client id/secret. Low risk.
- **HubSpot OAuth** — **not** a native Supabase provider. Needs a HubSpot
  developer app and a custom Edge Function broker.
  **Highest-risk item in the package**; scheduled last for that reason.
- **Nico's actions** — creating the accounts and pasting the values. Written for
  him, jargon-free, in [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md).
- **Depends on this PRD:** everything else in the package.
- **No new paid service beyond Supabase is requested.**

## 21. Open questions

Engineering questions are resolved in
[03-technical-design.md](03-technical-design.md) and
[04-netcode-design.md](04-netcode-design.md) rather than left here. What
genuinely remains open:

1. **Belt roster and naming.** The brief names five candidate metrics (biggest
   hole, fastest clear, most mass in a fixed window, longest combo chain, career
   total). The exact roster and their wrestling names are a product/voice call
   and sit with Nico. *Leading option:* ship those five, since belts are rows
   and the roster costs nothing to change afterwards.
2. **Minimum reign / tie-break rule** (FR-045). *Leading option:* the incumbent
   holds ties, plus a short grace window, so a belt cannot flip twice in a
   minute. Needs a rehearsal at booth pace to confirm it feels right.
3. **How long the UNBOUND scope stays live** after the event, and whether it
   freezes into a permanent archive. *Leading option:* freeze it, since a frozen
   event board is a lasting artefact of the conference.
4. **Whether the booth has a second screen** for the title wall. Operational,
   not technical; affects [08-rollout-and-runbook.md](08-rollout-and-runbook.md).

## 22. Companion ADRs

Four genuine decisions, each with a discarded alternative. Cross-linked both
ways; owned by other writers in this package.

- **`../../adr/0009-*` — Supabase as the backend, without a build step.**
  Alternatives: a custom Node service on Vercel functions; Firebase; staying
  fully static and using a third-party leaderboard service.
- **`../../adr/0010-*` — Host-authoritative peer multiplayer over Realtime
  broadcast.** Alternatives: a dedicated authoritative game server; full
  peer-to-peer with WebRTC; server-authoritative simulation in an Edge Function.
- **`../../adr/0011-*` — Guest-first identity with deferred claim, and a custom
  HubSpot OAuth broker.** Alternatives: mandatory sign-in before play;
  email-only capture with no auth; skipping HubSpot sign-in entirely.
- **`../../adr/0012-*` — Server-side replay validation as the sole basis for
  leaderboard trust.** Alternatives: trusting the client; heuristic
  plausibility checks; obfuscation. Promotes
  [ADR-0003](../../adr/0003-deterministic-seeded-generation.md) from a product
  requirement to a security one.

## Amendments to `docs/PRD.md`

`docs/PRD.md` remains the **normative specification for single-player
Flywheel**. This PRD extends it; it does not replace it. Nothing in the size
ladder (§2), level generation (§3), campaign structure (§4), controls and camera
(§6), or the beatability proof (§7) changes. Precisely these statements are
amended:

| `docs/PRD.md` location | Current text | Amendment |
|---|---|---|
| Preamble | "shipped as a **fully static web app** (no backend, no build step)" | Amended to: shipped as a static web app with **no build step**, optionally backed by Supabase for accounts, live arenas, and leaderboards. **No build step is untouched and remains an invariant.** The "no backend" half is what changes, and only for the online layer: with the backend unreachable, the game is exactly the app this sentence describes. |
| §5, Persistence | "`localStorage`, key `hole-city-save`, **schema-versioned** (current v13)" | The doc said v3 while `js/save.js` was at v13; that one stale number was corrected in place on 2026-08-06 and is no longer an amendment. Amended to v14 by this work, with the same discipline: explicit migrations, quarantine rather than deletion. localStorage remains the **offline source of truth**; the cloud profile syncs on top of it and never replaces it. |
| §7, Beatability | "'Provably beatable' is enforced by `tools/validate.mjs`" | Unchanged, and **extended in significance**: the same replay machinery now also enforces score integrity in production. Determinism is no longer only a product requirement. |
| §8, Tech constraints | "No bundler, no server code, no network calls beyond CDN." | Amended: no bundler (unchanged, invariant). Server code now exists as Supabase Edge Functions, and network calls now include Supabase. The Supabase client itself still arrives by CDN importmap, so the loading mechanism this sentence protects is unchanged. |
| §8, Tech constraints | "Must run by opening `index.html` over any static file server." | **Unchanged and deliberately preserved.** The game must still run this way, offline, with every online surface degrading gracefully. This is the sentence that makes bad conference wifi survivable, and it is not negotiable. |
