# Online Flywheel — Requirements

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Test strategy](07-test-strategy.md)

**This document is the contract.** [07-test-strategy.md](07-test-strategy.md)
maps every criterion below to a test, and verification checks against these
lines and not against anyone's memory of what was meant. A behaviour that is not
written here is not verified, and a criterion that cannot be observed is a
defect in this document — say so and fix it here rather than testing something
adjacent.

## Problem & goal

Everything Flywheel knows about a player lives in one browser's `localStorage`.
That is about to be played by strangers at a conference booth, so today's
design loses both the player's progress and our knowledge that they existed.
"Done" means a stranger plays instantly, is scored trustworthily, can attach a
real identity afterwards, can hold a championship someone else can take, and
none of it falls over on conference wifi.

## How to read the criteria

- **GWT-nnn** lines are Given/When/Then, written to be observable.
- **SYS-nnn** lines are EARS-style system requirements: "When `<trigger>`, the
  system shall `<response>`" / "While `<state>`, the system shall `<response>`".
- **FR-nnn** references point at [01-prd.md §6](01-prd.md#6-functional-requirements).
- "The booth machine" means the hardware the game is demonstrated on; where a
  criterion is hardware-sensitive it says so.

---

## Story 1 — Guest play

> As a booth visitor with ninety seconds, I want to start playing immediately
> under a name of my choosing, so that I am not filling in a form while my
> colleagues watch. *(FR-001, FR-006, G1)*

**Acceptance criteria**

- **GWT-101** **Given** a first-time visitor with no saved data, **when** the
  page finishes loading, **then** a handle field is pre-filled with a suggested
  handle and a single PLAY control starts a run, with no sign-in step reachable
  or required on that path.
- **GWT-102** **Given** a first-time visitor, **when** they measure time from
  page load to a controllable hole, **then** it is no greater than the same
  measurement on the current release build, on the same hardware. *(This is a
  regression bar, not an absolute number: the online layer may not make the
  game slower to start.)*
- **GWT-103** **Given** a visitor who types their own handle, **when** they
  play a run and return to the title screen, **then** the handle persists across
  a page reload on that device.
- **GWT-104** **Given** a guest who has played several runs, **when** they
  inspect their coins, achievements, and best results, **then** all are present
  and identical to what a purely-offline build would have recorded.
- **GWT-105** **Given** a handle containing characters that cannot be rendered
  safely or read aloud, **when** it is submitted, **then** it is rejected inline
  with a plain message and focus returns to the field, and the player is never
  shown a raw validation rule.
- **SYS-106** When a guest identity is first created, the system shall persist
  it in the localStorage save under the versioned schema, alongside a stable
  device-scoped guest id.
- **SYS-107** While no account is signed in, the system shall treat localStorage
  as the source of truth for all solo progress.

---

## Story 2 — Claiming an account after a run

> As a player who just finished a run, I want to attach my real identity to it,
> so that my score and my belts are mine and follow me. *(FR-002 … FR-006, G2)*

Three paths: email OTP, Google, HubSpot. The criteria below apply to **all
three** unless a path is named.

**Acceptance criteria — common**

- **GWT-201** **Given** a guest has just finished a run, **when** the results
  screen is shown, **then** the claim prompt appears **after** the result is
  visible and never blocks the player from replaying or leaving.
- **GWT-202** **Given** a guest with local progress (coins, achievements, run
  history), **when** they complete any claim path for the first time, **then**
  every one of those is present on the account afterwards, and nothing on either
  side is silently discarded. *(FR-004)*
- **GWT-203** **Given** a claim has completed, **when** the player's profile is
  read, **then** first name, last name, email, and (if given) company are stored
  as separate normalised fields, not concatenated. *(FR-003)*
- **GWT-204** **Given** any field requiring a fixed prefix or scheme, **when**
  the player focuses it, **then** the prefix is already present as an adornment
  and the player types only the unique part; a "must start with…" error is never
  shown.
- **GWT-205** **Given** a signed-in player, **when** they sign out, **then** they
  return to guest play and no local progress is destroyed. *(FR-006)*
- **GWT-206** **Given** a signed-in player on a second device, **when** they
  sign in there, **then** their profile, achievements, and belts are visible on
  that device.
- **GWT-207** **Given** a player claims on a device whose guest progress has
  *already* been merged into a different account, **when** the claim completes,
  **then** the system merges without duplicating any run, coin, or achievement,
  and both prior histories remain intact.
- **SYS-208** When a claim completes, the system shall record the link between
  the guest id and the account rather than deleting the guest record.

**Acceptance criteria — email OTP**

- **GWT-210** **Given** a player enters a valid email, **when** they request a
  code, **then** a code is sent and the UI states plainly what to expect and
  offers a resend after a cooldown.
- **GWT-211** **Given** a code that is wrong or expired, **when** it is
  submitted, **then** an inline message says so, focus moves to the field, and
  the player remains a guest with nothing lost.
- **GWT-212** **Given** the code does not arrive, **when** the cooldown elapses,
  **then** resend is available and an alternative sign-in path is offered in the
  same view.

**Acceptance criteria — Google**

- **GWT-220** **Given** a player chooses Google, **when** they complete the
  provider flow, **then** they are returned to the results screen signed in,
  with name and email pre-filled from the provider and company left for them.
- **GWT-221** **Given** a player cancels at the provider, **when** they are
  returned, **then** they are still a guest, on the screen they left, with the
  run intact and no error styling implying something broke.

**Acceptance criteria — HubSpot** *(highest-risk path; see
[05-identity-and-accounts.md](05-identity-and-accounts.md))*

- **GWT-230** **Given** a player chooses HubSpot, **when** they complete the
  provider flow, **then** the custom broker exchanges the grant server-side and
  the player is returned signed in, with whatever identity fields HubSpot
  supplies pre-filled. *(FR-005)*
- **GWT-231** **Given** the HubSpot flow fails at any step, **when** the player
  is returned, **then** they are still a guest with the run intact, and the two
  other sign-in paths are offered in the same view.
- **GWT-232** **Given** the HubSpot integration is disabled or unavailable,
  **when** the claim screen renders, **then** the HubSpot option is absent
  rather than present-and-broken, and the other paths are unaffected.
- **SYS-233** The system shall never expose the HubSpot client secret to the
  browser; the grant exchange shall occur only in the Edge Function broker.

---

## Story 3 — Hosting and joining a live arena

> As a booth visitor, I want to drop into the same city as the people next to
> me and race them in real time, so that the booth is worth standing at.
> *(FR-010 … FR-018, G3)*

**Acceptance criteria**

- **GWT-301** **Given** a player creates a room, **when** the lobby appears,
  **then** it shows a short join code that is unambiguous when spoken aloud
  (no characters that sound or look alike) and the city the room will run.
- **GWT-302** **Given** a second player enters that code, **when** they join,
  **then** both players appear in each other's lobby within a visible moment,
  each identified by handle.
- **GWT-303** **Given** two or more clients in a room, **when** the match
  starts, **then** every client simulates the same city from the same seed and
  begins at the same moment. *(FR-012)*
- **GWT-304** **Given** a match is running, **when** one player steers, **then**
  the other clients see that player's hole move smoothly — interpolated, not
  teleporting — at conference-grade latency and packet loss. *(FR-014, FR-016)*
- **GWT-305** **Given** a match is running, **when** any player's hole grows,
  **then** every other client renders the new size within one snapshot interval.
- **GWT-306** **Given** a match is running, **when** the shared clock expires,
  **then** the match ends for every participant at the same simulated moment and
  every client shows the same final standings. *(FR-017)*
- **GWT-307** **Given** a room is at capacity, **when** another player tries to
  join, **then** they are told the room is full and are offered to start their
  own.
- **GWT-308** **Given** a join code that is wrong, expired, or belongs to a
  finished room, **when** it is submitted, **then** an inline message says so
  and focus returns to the field.
- **GWT-309** **Given** a live arena is running on the booth machine, **when**
  frame rate is measured, **then** it does not regress below the current
  release build's 60 fps target on that hardware.
- **SYS-310** The host client shall broadcast state snapshots at the configured
  snapshot rate (`SNAPSHOT_HZ`, 12 Hz shipped, per
  [04](04-netcode-design.md) §13, and a runtime flag); non-host clients shall
  send steering intent at `INTENT_HZ` (10 Hz shipped) and shall not simulate
  authoritative state. *(FR-013, FR-014)*
- **SYS-311** Room capacity shall be read from configuration; a change to the
  cap shall require no change to netcode. *(FR-018)*
- **SYS-312** While a match is running, gameplay state shall change only inside
  the fixed-timestep sim step; interpolation of remote holes shall occur in the
  render layer and shall never write sim state.

---

## Story 4 — Host migration

> As a player in an arena, I want the match to continue when whoever started it
> walks away, so that a stranger leaving does not end my game. *(FR-015)*

At a booth the host **will** leave mid-match — the host is a stranger who has
finished their turn. This is a normal event, not an exception.

**Acceptance criteria**

- **GWT-401** **Given** a match with three or more clients, **when** the host
  closes their tab, **then** the match continues for the remaining clients and
  reaches a normal end with valid results.
- **GWT-402** **Given** the host has left, **when** a new host is promoted,
  **then** exactly one client is promoted and every remaining client agrees on
  which one. *(No split-brain: two hosts broadcasting is a failure.)*
- **GWT-403** **Given** the host has left, **when** the remaining players are
  observed, **then** the promotion is not announced and produces no visible
  disruption beyond at most a brief interpolation gap.
- **GWT-404** **Given** the host's network drops without their tab closing,
  **when** their snapshots stop arriving for longer than the defined timeout,
  **then** migration proceeds exactly as in GWT-401 and the original host, if
  they return, does not resume authority.
- **GWT-405** **Given** the last remaining client is alone in a room, **when**
  the match ends, **then** their result is submitted normally and the room is
  closed.
- **GWT-406** **Given** migration cannot complete, **when** the timeout elapses,
  **then** each client ends the match locally with a plain message and keeps and
  queues its own result rather than freezing.
- **SYS-407** When the host stops broadcasting for longer than the configured
  timeout, the system shall promote a successor by a deterministic rule known to
  every client.

---

## Story 5 — A run is scored and validated

> As a player, I want to know my score is real, and as the product owner I want
> nobody to be able to type themselves onto the board. *(FR-020 … FR-024;
> the load-bearing invariant, [01-prd.md §2](01-prd.md#2-load-bearing-invariant))*

**Acceptance criteria**

- **GWT-501** **Given** a completed run, **when** it is submitted, **then** the
  submission carries the seed, the mode, the scope tags, the input trace, and
  the client's claimed metrics. *(FR-020)*
- **GWT-502** **Given** a submission arrives, **when** the server processes it,
  **then** it replays the **same pure sim modules the browser ran** from the
  seed and trace and stores the recomputed metrics as authoritative, ignoring
  the client's claim for ranking purposes. *(FR-021)*
- **GWT-503** **Given** an honest run, **when** the server replays it, **then**
  the recomputed metrics equal the client's claimed metrics exactly. *(This is
  the determinism invariant observed end to end; a failure here means either a
  cheat or a determinism regression, and both block release.)*
- **GWT-504** **Given** a submission whose score has been altered in the browser
  console, **when** it is processed, **then** it is marked rejected, retained
  for inspection, and appears on no board and in no belt. *(FR-022)*
- **GWT-505** **Given** a rejected submission, **when** the player sees the
  result, **then** the message is neutral, non-accusatory, and reveals nothing
  about which check failed.
- **GWT-506** **Given** a completed run, **when** the player reaches the results
  screen, **then** their result is shown immediately and no part of the screen
  waits on server validation. *(FR-023)*
- **GWT-507** **Given** the same submission is delivered twice (the offline
  queue retries), **when** both are processed, **then** exactly one run row
  exists, no belt changes twice, and no achievement is duplicated.
- **GWT-508** **Given** an input trace longer than the configured maximum,
  **when** it is submitted, **then** it is rejected before any replay is
  attempted.
- **SYS-509** The system shall store every run as an immutable row; corrections
  shall be new rows with a status change, never in-place edits.
- **SYS-510** The system shall write authoritative run, belt, and competitive
  achievement data only through the single server-side write path.
- **SYS-511** While a client is unauthenticated or authenticated as another
  user, the system shall deny all writes to validated score columns, belt
  reigns, and competitive achievement grants.

---

## Story 6 — Appearing on the boards

> As a player, I want to see where I stand — at this event, in this city, on
> this level, and of all time. *(FR-030 … FR-033, G4)*

**Acceptance criteria**

- **GWT-601** **Given** a validated run played at the event, **when** the
  UNBOUND board is opened, **then** the run appears on it, ranked correctly.
- **GWT-602** **Given** a validated run in a given city, **when** that city's
  board is opened, **then** the run appears on it, and runs from other cities do
  not.
- **GWT-603** **Given** a validated run on a given level, **when** that level's
  board is opened, **then** the run appears on it.
- **GWT-604** **Given** a validated run, **when** the all-time board is opened,
  **then** the run appears on it.
- **GWT-605** **Given** a single validated run that qualifies for several
  scopes, **when** each scope is opened, **then** it appears in each without
  having been submitted more than once. *(Scope is a tag dimension, FR-031.)*
- **GWT-606** **Given** a player ranked below the visible page, **when** they
  open any board, **then** their own row is surfaced without scrolling.
  *(FR-033)*
- **GWT-607** **Given** a rejected or pending run, **when** any board is opened,
  **then** it does not appear. *(FR-032)*
- **GWT-608** **Given** a board is opened with no qualifying runs, **when** it
  renders, **then** it shows a purposeful empty state, not a blank panel or a
  spinner.
- **SYS-609** The system shall derive every board from queries over the run
  event log; no board shall be the only durable record of any run. *(FR-024)*
- **SYS-610** When a new scope is required, the system shall accommodate it as a
  new tag value and query, with no schema change to the run log.

---

## Story 7 — Winning and losing a belt

> As a player, I want to be a champion of something specific, and to know
> someone can take it from me while I am at lunch. *(FR-040 … FR-046, G5)*

**Acceptance criteria**

- **GWT-701** **Given** several belts are defined, **when** the title wall is
  opened, **then** each belt shows its current holder and how long they have
  held it, and a player may hold more than one at once. *(FR-040, FR-042)*
- **GWT-702** **Given** a validated run that beats the standing holder on a
  belt's metric, **when** it is processed, **then** the belt changes hands, the
  previous reign is closed with an end time, and a new reign is opened.
  *(FR-043)*
- **GWT-703** **Given** a belt changes hands, **when** the title history is
  read, **then** both the new holder and the displaced holder are recorded with
  the run that decided it.
- **GWT-704** **Given** a belt change occurs while a player is in-game, **when**
  it happens, **then** it is announced with wrestling framing (a new champion, a
  reign ended, a title defended) and announced exactly once. *(FR-044)*
- **GWT-705** **Given** a run that ties the standing holder's metric, **when**
  it is processed, **then** the defined tie-break applies deterministically and
  the outcome is the same on every reader. *(FR-045)*
- **GWT-706** **Given** repeated near-instant challenges, **when** they are
  processed, **then** the minimum-reign or tie-break rule prevents a belt
  flipping so fast that it reads as a scoreboard rather than a championship.
  *(FR-045; verified at booth pace, not in isolation.)*
- **GWT-707** **Given** a new belt definition row is inserted, **when** the game
  is reloaded, **then** the new belt appears and is contested, with no code
  change and no deploy. *(FR-041)*
- **GWT-708** **Given** a run is later marked rejected, **when** belts are
  re-evaluated, **then** any reign it created is undone and the prior holder is
  restored.
- **GWT-709** **Given** a player who holds a belt, **when** they open the game
  on any device signed in as themselves, **then** their belt and its reign
  length are visible to them.
- **SYS-710** The system shall evaluate belts server-side from validated runs
  only. *(FR-046)*
- **SYS-711** The system shall keep at most one open reign per belt, and shall
  close the outgoing reign and open the incoming one in a single transaction.

---

## Story 8 — Unlocking an achievement

> As a player, I want the game to notice the things I did, so that a single run
> leaves a mark even if I never top a board. *(FR-050 … FR-053, G6)*

**Acceptance criteria**

- **GWT-801** **Given** a player meets an achievement's condition, **when** it
  is met, **then** the unlock is shown in-game at that moment and is reviewable
  afterwards from the achievements screen. *(FR-053)*
- **GWT-802** **Given** a competitive achievement, **when** it is granted,
  **then** the grant is derived from a server-validated run, not from a
  client claim. *(FR-051)*
- **GWT-803** **Given** a purely local achievement (settings, exploration),
  **when** it is earned offline, **then** it is granted locally and syncs when
  connectivity returns, without duplicating.
- **GWT-804** **Given** achievements earned as a guest, **when** the guest
  claims an account, **then** all of them are present on the account.
  *(FR-052)*
- **GWT-805** **Given** an already-earned achievement, **when** its condition is
  met again, **then** it is not re-announced and not duplicated.
- **GWT-806** **Given** the achievements screen, **when** it is opened, **then**
  unearned achievements are visible with their descriptions, so there is
  something to aim at.
- **SYS-807** Each achievement shall be defined by an id, a name, a
  player-facing description, and an unlock condition. *(FR-050)*

---

## Story 9 — Offline and degraded play (conference wifi)

> As a player on a shared, saturated, hostile network, I want the game to work,
> and to tell me the truth about what is not working. *(FR-060 … FR-064, G7)*

**This is a first-class requirement, not an edge case.** Conference wifi is the
**expected** operating condition: a shared NAT, hundreds of devices, captive
portals, and a few megabits of real throughput. Every criterion in this story is
release-blocking, and each is verified under deliberate throttling and loss —
see [07-test-strategy.md](07-test-strategy.md).

**Acceptance criteria**

- **GWT-901** **Given** the network is entirely unavailable, **when** the game
  is loaded from cache and played, **then** every solo mode — campaign levels
  and all city sandboxes — is fully playable, exactly as today's build.
  *(FR-060)*
- **GWT-902** **Given** the network is unavailable, **when** any screen is
  opened, **then** no screen shows an indefinite spinner and no control is
  permanently disabled without an explanation. *(FR-061)*
- **GWT-903** **Given** the network is unavailable, **when** the player looks at
  the title screen, **then** a quiet, non-alarming offline indicator is present
  and online entry points explain plainly that they need a connection.
- **GWT-904** **Given** a run is completed while offline, **when** it ends,
  **then** the result is shown normally and the submission is queued, with the
  player told it will post itself. *(FR-062)*
- **GWT-905** **Given** queued submissions exist, **when** connectivity returns,
  **then** they are submitted automatically, exactly once each, with no player
  action. *(FR-062, and GWT-507 for the exactly-once property.)*
- **GWT-906** **Given** queued submissions exist, **when** the browser is closed
  and reopened, **then** the queue survives and still posts.
- **GWT-907** **Given** the network is severely degraded rather than absent,
  **when** any network operation is attempted, **then** it completes, fails, or
  falls back within its bounded timeout; no user-facing flow awaits indefinitely.
  *(FR-063)*
- **GWT-908** **Given** a live arena loses the network mid-match, **when** the
  loss is detected, **then** the match ends locally with a legible message, the
  local result is kept and queued, and the client does not freeze. *(FR-064)*
- **GWT-909** **Given** a captive portal intercepts requests, **when** a network
  call is made, **then** the client treats the response as a failure and
  degrades to offline behaviour rather than rendering or trusting the portal's
  reply.
- **GWT-910** **Given** high latency and packet loss short of disconnection,
  **when** an arena is played, **then** remote holes still read as smooth motion
  and the match still reaches a shared end. *(Overlaps GWT-304; verified here
  under deliberate loss.)*
- **GWT-911** **Given** the Supabase backend is entirely unreachable, **when**
  the game is loaded and played, **then** it behaves as the fully-static app
  described in `docs/PRD.md`, with online surfaces absent rather than broken.
- **SYS-912** Every network operation shall have a bounded timeout and a defined
  fallback. *(FR-063)*
- **SYS-913** While offline, the system shall treat localStorage as the source
  of truth and shall not discard or overwrite local progress on reconnection.

---

## Story 10 — Running the booth

> As the person standing at the stand, I want to know it is working and to fix
> it when it is not, without reading logs. *(Supports G3, G7; runbook in
> [08-rollout-and-runbook.md](08-rollout-and-runbook.md))*

**Acceptance criteria**

- **GWT-1001** **Given** the booth machine, **when** the operator checks the
  game's state, **then** one view answers whether the backend is reachable,
  whether an arena is live, and how many players are in it.
- **GWT-1002** **Given** something has gone wrong, **when** the operator follows
  the runbook, **then** they can reset to a known-good state (end the room,
  reload, start a fresh arena) without a developer.
- **GWT-1003** **Given** the online layer must be disabled, **when** the flag is
  changed, **then** the game reverts to today's purely-static behaviour and
  remains fully playable. *(This is the rollback plan;
  [01-prd.md AC-15](01-prd.md#19-acceptance-criteria).)*
- **GWT-1004** **Given** a handle or company name unsuitable for a public
  screen, **when** it would be displayed, **then** it is screened before it
  reaches the booth display.

---

## Cross-cutting criteria

These apply to every story above and are checked once per surface rather than
restated in each.

- **GWT-X01 (accessibility)** Every new screen — lobby, claim, boards, title
  wall, achievements — is fully operable by keyboard, shows visible focus, moves
  focus to the first error on a failed submit, and traps focus correctly in
  modals.
- **GWT-X02 (accessibility)** Belt changes and connection-state changes are
  announced to assistive technology once, not on every re-render.
- **GWT-X03 (accessibility)** New celebration and belt-change motion honours the
  existing reduced-motion setting and the OS preference, using the same setting
  the game already reads — not a new one.
- **GWT-X04 (accessibility)** All new text passes contrast against the brand
  palette in both the plate and in-game overlay contexts.
- **GWT-X05 (copy)** No user-facing string contains an em-dash or an en-dash.
- **GWT-X06 (brand)** Every new screen consumes the shared `--fw-*` tokens and
  `.fw-*` primitives; no screen reimplements the outline-ring or extrude-shadow
  stack locally.
- **GWT-X07 (invariants)** `node tools/validate.mjs` prints `ALL PASS`,
  including determinism across the pure sim and agreement between `freshSave()`
  and the migration chain at v14.
- **GWT-X08 (invariants)** `index.html` opened over a plain static file server
  still runs the game, with no build step anywhere in the pipeline.
- **GWT-X09 (security)** For each table, an anonymous client, a wrong-user
  client, and the owning user each receive exactly the access the policy
  intends, verified per table rather than assumed from one sample.
- **GWT-X10 (privacy)** Personal data is collected only with a plain statement
  of what it is for at the point of capture, and can be deleted on request.

## Out of scope

Restated from [01-prd.md §4](01-prd.md#4-non-goals-out-of-scope) so this
document can be read alone: no HubSpot CRM contact writes, no tournaments,
seasons, spectator mode, partner-branded arenas, matchmaking, or public profile
pages; no mobile-specific live-arena work; no chat, friends, voice, clans, or
prize economy; no native app. The single-player campaign and sandbox goal runs
are unchanged.

## Open questions

Carried from [01-prd.md §21](01-prd.md#21-open-questions); each shapes criteria
above and is answered before the story it touches is built.

1. **The belt roster and their names** — shapes Story 7. Leading option: the
   five candidate metrics named in the brief, since belts are rows.
2. **The minimum-reign / tie-break rule** — GWT-705 and GWT-706 cannot be made
   numerically precise until it is chosen. Leading option: incumbent holds ties,
   plus a short grace window.
3. **Whether the UNBOUND scope freezes after the event** — shapes GWT-601's
   long-term meaning. Leading option: freeze it as a permanent archive.
4. **Whether the booth has a second screen for the title wall** — operational;
   shapes Story 10 and the runbook.
