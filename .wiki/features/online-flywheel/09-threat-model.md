# Online Flywheel — Threat Model

> [Objective overview](00-objective-overview.md) ·
> [Technical design](03-technical-design.md) ·
> [Netcode](04-netcode-design.md) ·
> [Identity & accounts](05-identity-and-accounts.md) ·
> [Risk register](11-risk-register.md)

Flywheel has spent its whole life as a game that could not lie to anybody,
because there was nobody to lie to. Everything lived in one browser tab. The
moment this package ships, three things become true at once: there is a public
scoreboard with a **#1** on it, there is a table with real people's names and
email addresses in it, and there is an open realtime channel that anyone
holding the anon key can join. Each of those is a different kind of target and
they need to be reasoned about separately.

This document is the security review for that transition. It is deliberately
pessimistic about our own defences — in particular it does **not** claim the
deterministic-replay validator is airtight, because it isn't, and the places it
leaks are written down here rather than discovered at a booth.

---

## 1. Assets and trust boundaries

### What is actually worth protecting

| Asset | Why it matters | Blast radius if lost |
|---|---|---|
| **Leaderboard integrity** | It is displayed on a screen at a partner event. A fake #1 is not a game bug, it is a credibility problem in front of people we are trying to impress. | Reputational. Recoverable only by visibly wiping and re-running the board, which is itself embarrassing. |
| **Player PII** (first/last name, email, optional company) | Real identities of HubSpot partners, collected as leads. | Legal + reputational. This is the one asset whose loss cannot be undone. |
| **Displayed handles** | Rendered large on a booth screen, unattended, in front of a professional audience. | Immediate and public. A slur on the big screen is the worst 10 seconds of the conference. |
| **Auth tokens / sessions** | Account takeover; the takeover of a *belt holder* is also a scoreboard-integrity event. | Per-user, but compounding. |
| **The service-role key** | Bypasses every RLS policy in the project. | Total. Full read/write of all PII and all scores. |
| **HubSpot OAuth client secret + any HubSpot access tokens we hold** | These are credentials into a *third party's* CRM, granted by a partner who trusted a game. | Catastrophic and not ours to absorb. |
| **Supabase quota / spend** | A single Supabase plan — Free ($0) or Pro ($25/mo), still to be chosen — with finite Realtime messages, Edge Function invocations, and egress. | Denial of wallet, then denial of service, mid-conference. |

### Trust boundaries

```
  [ browser: game client ]        <-- FULLY UNTRUSTED. Ships the anon key.
        |                             Source is readable, sim is editable,
        |                             every request it makes is forgeable.
        |  https / wss
  [ Supabase edge: PostgREST, Realtime, Auth, Edge Functions ]
        |                         <-- the ONLY place a trust decision may be made
        |
  [ Postgres + RLS ]              <-- last line; assume every query arriving here
                                      was written by an attacker
```

Two rules follow from that picture and everything else in this document is a
consequence of one of them:

1. **The client is a rendering surface and an input device. It is never an
   authority.** Not for scores, not for identity claims beyond its JWT, not for
   who won a match, not for what a room's roster is.
2. **The anon key is public.** It ships inside a static file served from Vercel;
   anyone can read it with View Source. It is an *identifier of the project*,
   not a secret, and no policy anywhere may treat possession of it as
   authorisation. RLS is the authorisation system. If a table's protection story
   is "well, you'd have to know the URL", that table is public.

---

## 2. Adversaries

We model three, and we should design for the first two while acknowledging the
third.

**A. The bored partner with devtools open.** *(realistic, near-certain)*
A technically-literate HubSpot partner waiting for their turn at the booth,
who opens devtools out of curiosity or mischief. They will: read the JS, find
the Supabase URL and anon key, try `fetch` against a table, try to POST a score
of 999999999, try to set their handle to something rude, and try to join a room
they aren't in. They are not persistent and they are not malicious in the legal
sense — they are showing off, possibly to the person next to them. **The
mitigation bar for this adversary is that every obvious attempt bounces
immediately and visibly.** They will stop when the first three things fail.

**B. The griefer.** *(likely at least once)*
Wants to ruin someone else's game rather than win. Floods a room, spams
presence, joins under a confusing name, disconnects as host mid-match to void
the round, or types a slur into the handle field specifically because it will
appear on the big screen. Not necessarily skilled. **This adversary is the one
the moderation plan (§6) exists for**, and they are the reason "moderation is
optional if we're nice about it" is not an acceptable position.

**C. The scripted attacker.** *(worst case, low probability at the event,
non-zero afterwards)*
Reads `js/sim.js`, understands the replay validator, and writes a program that
produces a *legitimate* input trace by search — a bot that plays better than any
human and submits its perfectly valid trace. Or scrapes the whole `profiles`
table if a policy lets them. Or hammers an Edge Function to burn the monthly
quota. We cannot beat this adversary on score integrity (see §3.7); we can and
must beat them on PII and on availability.

Explicitly **out of scope**: a compromised Supabase, a malicious Vercel, an
attacker with the service-role key (that is a containment scenario, §5.4), and
physical attacks on the booth laptop beyond "someone walked up and typed".

---

## 3. Score integrity

The core defence, per [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md):
a score submission carries the **level/scene seed plus the input trace**, an
Edge Function re-runs the pure sim over that trace in Node, and the
**server-computed score is the only number that ever reaches the board**. The
client's own idea of its score is discarded on arrival, not compared and
warned about — discarded.

This works only because of [ADR-0003](../../adr/0003-deterministic-seeded-generation.md):
no `Math.random()` in the pure sim, a seeded `mulberry32`, a fixed `1/60`
timestep, and a sim importable by Node — `tools/validate.mjs` already replays
the sim headlessly for all 100 levels, so the machinery is not speculative, it
is the test suite with a different caller.

Below is the full taxonomy. For each: what it is, whether replay catches it,
and what leaks.

### 3.1 Forged score POST

*The attack:* `fetch` the scores endpoint directly with `{score: 999999999}`.

*Caught: completely.* There is no field on any write path that accepts a score.
The submission shape is `{ mode, level_or_scene, seed, trace, client_version }`
and the score column is written by the Edge Function under service role, never
by the client. RLS on `leaderboard_entries` grants the `authenticated` and
`anon` roles **no INSERT and no UPDATE at all** (§5). The attacker's POST is
rejected by policy before any application logic runs.

*Residual:* none, provided nobody ever adds a "score" column to a client-writable
table for convenience. This is the single easiest way to undo the whole model
and it will be tempting during the build. Guard it in review.

### 3.2 Replayed / duplicated trace

*The attack:* capture one genuine great run, submit it fifty times; or capture
another player's trace off the wire and submit it as your own.

*Caught: mostly, by construction rather than by cleverness.* Every submission is
keyed by a **content hash of (seed, trace, mode)** with a unique constraint, so
the same bytes can only ever produce one row. A resubmission is an idempotent
no-op that returns the original result, which also makes the retry path safe on
conference wifi (§10 in the netcode doc) — the same mechanism does double duty.

*Residual, and it is real:*
- **Trivial perturbation.** Change one tick of input in an irrelevant moment and
  the hash changes while the score does not. Deduplication by hash cannot catch
  a near-duplicate. Mitigated in depth by (a) per-player-per-level *best-only*
  storage — a duplicate of your own best does not improve your own best, so the
  attack yields nothing on a "best score" board; and (b) rate limiting (§4.4).
  A board that ranked by *number* of good runs would be far more exposed; we
  do not build one.
- **Cross-player theft.** Traces are submitted over TLS and are not broadcast on
  the realtime channel, so lifting another player's trace requires access to
  their machine. But at a shared booth kiosk that is not a fanciful requirement
  — see the kiosk problem in [12-migration-plan.md](12-migration-plan.md#4-the-shared-booth-kiosk).
  Binding the submission to the JWT's `sub` at insert time means a stolen trace
  scores *for the thief's account*, which is a nuisance, not a compromise of
  someone else's record.

### 3.3 Hand-crafted input trace that beats the replay

*The attack:* do not play. Write a script that emits move vectors and search for
a sequence that scores well. Submit it. It replays perfectly because it *is*
valid input.

*Caught: no. This is the acknowledged hole in the model and it must not be
papered over.* A replay validator proves that a trace, run through our own sim,
produces the claimed score. It does not and cannot prove a human produced the
trace. The sim's own greedy bot in `tools/validate.mjs` already beats every
level with ≥15% time to spare — we ship, in the repo, a program that generates
superhuman valid traces.

*What we do about it, honestly:*
- **Plausibility screening in the Edge Function, as a filter and not a proof.**
  The move intent is a normalised world-space vector per tick. Real human input
  from a keyboard, a joystick, or a pointer has properties a naive script does
  not: it has hold durations, it has reaction latency after an event, it does
  not change direction by 180° on consecutive ticks indefinitely, and it does
  not produce inputs at a rate uncorrelated with the 60 Hz tick boundary. Cheap
  checks: tick count must equal elapsed clock × 60 exactly; direction-reversal
  rate over the run; distinct-heading entropy; fraction of ticks with zero
  input. These are **flags, not rejections** — a flagged run is stored with
  `review_state = 'flagged'` and excluded from the *displayed* board until
  cleared, which is a moderation decision, not an automated one.
- **Accept that a determined scripter wins.** The prize is a name on a screen at
  a partner conference. The correct posture is to make casual cheating
  impossible, scripted cheating *visible and removable within a minute*
  (§6.3's takedown path applies to scores too), and to not spend a week of build
  time on an arms race whose stakes are a novelty belt.
- **Do not tell the world the thresholds.** The screening constants live in the
  Edge Function, never in the client bundle.

### 3.4 Modified client sim

*The attack:* edit `js/sim.js` in devtools or a local copy — make the hole eat
anything, make the clock stop, make mass multiply — then play "normally" and
submit.

*Caught: completely, and this is the defence at its best.* The attacker's
modified sim never touches the score. The Edge Function loads **our** copy of
`sim.js`, `citygen.js`, `tiers.js`, `levels.js`, and `rng.js` from the server
side, feeds it the submitted trace against the submitted seed, and gets whatever
that trace really produces under the real rules. A trace recorded against a
modified sim replays against the real one as a mediocre, incoherent run — the
inputs were chasing objects that, in the real city, were never edible or never
there.

*Residual:*
- **Version skew is the crack.** The replay must run the *same sim version* the
  client ran, or an honest player's legitimate run fails validation after any
  gameplay tuning change. Submissions therefore carry `client_version`, the
  Edge Function pins a sim version per submission, and the board records which
  version produced each entry. This is a correctness requirement first and a
  security requirement second — but note the security direction: an attacker
  who can *choose* the version can choose an old one with a known-exploitable
  tuning. Mitigation: the server keeps an explicit allow-list of validatable
  versions and retires old ones; an unknown version is rejected, not trusted.
- **Floating-point divergence across engines — flagged as a must-verify.**
  The pure sim uses `Math.hypot`, `Math.cos`, and `Math.sin`. IEEE-754 pins
  `+ - * /` and `sqrt` exactly, but the ECMAScript spec explicitly permits
  implementation-defined precision for the transcendental functions and for
  `hypot`. A run recorded in Safari (JavaScriptCore) and replayed in Node (V8)
  can therefore diverge in the last bits, and this sim has *thresholds*
  (`isEdible`, `inMouth`, the `holeSpeed > 10.0` bounce gate) where a
  last-bit difference can flip a branch and cascade. Determinism has held so
  far because the validator and the game have only ever been compared V8-to-V8.
  **Before UNBOUND we must either (a) prove bit-identical replay across the
  browser engines actually present at the booth, or (b) accept a bounded score
  tolerance on validation, or (c) remove the implementation-defined calls from
  the pure sim.** Option (c) is the durable fix and the cheapest form of it
  touches only `sim.js`'s `Math.hypot` calls (replaceable by
  `Math.sqrt(x*x+z*z)`, which is exactly specified and does not consume RNG);
  the `Math.cos`/`Math.sin` in `citygen.js` and in rival spawn placement are
  harder because changing them changes generated cities and forces a validator
  retune per ADR-0003's consequences. Decision and execution belong to
  [03-technical-design.md](03-technical-design.md) and
  [07-test-strategy.md](07-test-strategy.md); it is listed here because it is
  the difference between "the replay defence works" and "the replay defence
  rejects honest iPhone players."

### 3.5 Time manipulation

*The attack:* slow the client's clock, or override `performance.now()`, and take
ten real minutes over a 90-second level.

*Caught: completely, and for a structural reason worth stating.* The sim is
**not** wall-clock driven. `sim.step(1/60)` advances `this.time` by a fixed
amount per call and `timeLeft` is derived from it (`level.clock - this.time`).
Game time is therefore a *count of ticks*, and the trace **is** that count.
Wall-clock time never enters the score. A player who took ten minutes of real
time submits a trace of exactly `clock × 60` ticks, and the replay runs it in
milliseconds and returns exactly what those inputs produce.

**Tick-indexing is the rule, and this document owns it.** A trace records tick
indices, never timestamps, and the Edge Function replays by tick. Commit
`85a1ff0` promoted that from prudent to load-bearing: `js/quality.js` used to
ratchet a device's quality tier down for the whole session, so the tier — and
with it `maxSubSteps` (HIGH 6 … POTATO 1) — was effectively fixed once a run
started. It now moves **both directions mid-run**, and `js/main.js` drops
accumulator debt it cannot afford, so **a single run can advance sim ticks at
several different rates per wall-second while the player never notices.** A
wall-clock-indexed trace would now be non-replayable for an ordinary player on
an ordinary warm laptop, and the resulting rejections would look like an
anti-cheat bug rather than a clock bug. Test coverage:
[07](07-test-strategy.md) §2.2.

*Residual:*
- **Slow-motion play is genuinely undetectable and genuinely an advantage.**
  Nothing in the submission distinguishes a player who ran the tab at 6 fps
  (with intent sampled per tick, giving them ten times the thinking time per
  tick) from one who played at 60. This is an inherent property of accepting an
  input trace instead of a live session. Partial mitigation: the client
  timestamps submission start/end and the Edge Function compares wall-clock
  elapsed against `clock`; wildly inflated wall time is a **flag**, not a
  rejection, because a legitimate player on a bad laptop or a backgrounded tab
  will trip it. Since `85a1ff0` that flag has to be *loose*: a quality tier that
  steps down mid-run cuts the tick rate legitimately, so honest wall-clock
  elapsed can be several times the game clock on exactly the warm booth laptop
  we expect. Set the threshold from measured booth runs, not from `clock` × a
  small factor. Accept the residual; a booth PC has no incentive to do this.
- Note the inverse is *not* a problem: fast-forwarding gains nothing, since
  tick count is fixed.

### 3.6 Clock / ordering attacks on the board itself

*The attack:* submit with a backdated timestamp to claim an earlier belt reign,
or to appear inside the UNBOUND event window from outside it.

*Caught:* yes, by never accepting a client timestamp. `created_at` is
`default now()` and is not client-writable; the UNBOUND event scope is decided
by **server** time against the event window row, not by anything in the payload.
Belt reigns (see [06-belts-and-achievements.md](06-belts-and-achievements.md))
are ordered by the server-assigned `created_at` of the validated entry.

### 3.7 The hard case: a peer's score in a live arena

This is the one that does not fit the model, and it deserves its own honest
treatment rather than a sentence.

*The situation:* per [04-netcode-design.md](04-netcode-design.md), the arena is
**host-authoritative** — the first client into a room runs the sim and
broadcasts snapshots at 12 Hz; peers send steering intent at 10 Hz and
interpolate. So
the authoritative simulation of a peer's hole runs **on another player's
machine**. When the clock expires, the natural implementation is for the host to
report the results table. That means a *player* is reporting other players'
scores, which is precisely the thing §3.1 forbids the client from doing.

*Can replay validate it?* Not directly, and not the way single-player is
validated. In single-player the submitter owns the entire input stream, so seed
+ trace fully determines the outcome. In a shared arena, one player's outcome
depends on every other player's inputs *and* on the interleaving the host chose.
A peer cannot submit a self-sufficient trace, because their own trace is not a
complete description of what happened to them.

*The decision — and it is a scope decision as much as a security one:*

1. **Arena results and the *records* are separated, and the line is drawn by
   verdict.** A live arena round produces a **match result** — a per-room,
   per-round scoreboard that is displayed, celebrated, and stored as match
   history. That is the product ask: "same city, live, together, race to eat the
   most before the clock" is a *moment*, and the moment is the point. Beyond the
   match result, per
   [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) §6 and the
   verdict semantics in [03](03-technical-design.md) §2:
   - **Never, at any verdict:** the **all-time** and **per-level** scopes, and
     every solo-fed belt. Those are fed only by replay-validated single-player
     runs, where the trust model is sound and the host-advantage problem below
     does not exist.
   - **A `verified` round** (whole-room replay + every present peer attested +
     no host migration) may feed the **event (UNBOUND)** and **per-city** scopes
     and the two arena-only belts ([06](06-belts-and-achievements.md) §2.6 Main
     Event Belt, §2.7 Tag Team Titles), which exist to rank arena play and
     nothing else.
   - **An `attested` round** (a peer disconnected and never attested, or the
     host changed hands) may feed event and city, and **never** a belt.
   - **A `disputed` round** is voided; nothing is written anywhere.
2. **The host's report is validated as a whole, not trusted per-player.** The
   host submits the full round record: room seed, round length, and the
   **per-tick intent stream for every participant** as it applied them (the host
   already has this; it is what it simulated). The Edge Function replays the
   *whole room* — the same pure sim, N holes, the recorded intents — and
   recomputes every participant's score. A host who fabricates "I got 90,000,
   everyone else got 12" has to fabricate an intent stream that actually
   produces that under replay, which reduces the attack from "type a number" to
   §3.3's crafted-trace problem, applied to five players at once and with a
   32-way-consistency constraint. That is a large step up in difficulty for a
   modest amount of extra payload.
3. **Peers corroborate.** Each peer independently submits a short digest of what
   *it* believes happened: its own intent stream (which it authored) and its
   final mass as it saw it. The Edge Function checks the host's record against
   each peer's own intent stream. A host who rewrites a peer's inputs is caught
   by a cheap set comparison; a host who merely reports a wrong final number is
   caught by the replay. **A round where corroboration fails is voided, not
   adjudicated** — we do not attempt to determine who lied. A voided round shows
   "round could not be verified" and nothing is written. At a booth, a voided
   round costs 90 seconds; a wrong belt costs credibility.
4. **A peer who disconnects mid-round scores nothing persistent** and appears in
   match history as "left". This closes the "rage-quit to void the record"
   variant by making it a no-op rather than an erasure.

*Residual, stated plainly:*
- **A colluding room is unbeatable.** If every client in a room is controlled by
  the same person, corroboration corroborates a lie. Bounded by decision 1: the
  prize is an event-board row, a city-board row, and at most a novelty arena
  belt — never an all-time record. Accepted, and it is the honest boundary named
  in [ADR-0010](../../adr/0010-host-authoritative-arena.md).
- **The host has real, unavoidable competitive advantage:** zero latency to its
  own authoritative sim while peers eat a round trip. This is inherent to
  host-authoritative peer networking and is a *fairness* problem, not a security
  one. It is another independent reason arena results must never reach the
  all-time scope, and it is why the arena belts are separate belts rather than
  arena runs competing for the solo ones.
- **Host migration** (host closes their laptop mid-round) produces a
  discontinuity in the authoritative stream. Play continues — that is the whole
  point of migration — but the round caps at `attested`: event and city boards
  only, never a belt. The security position, unchanged: **a round whose
  authority changed hands is not a record.**

### 3.8 Score-integrity summary

| Attack | Replay catches it? | Residual |
|---|---|---|
| Forged score POST | **Yes, fully** | Only if someone adds a client-writable score column |
| Replayed / duplicated trace | **Yes** (content-hash uniqueness) | Near-duplicates; best-only storage removes the incentive |
| Hand-crafted valid trace | **No** | The real hole. Heuristic flagging + fast human takedown |
| Modified client sim | **Yes, fully** | Version pinning required; cross-engine float divergence is unproven |
| Time manipulation | **Yes** (tick-counted, not wall-clock) | Slow-motion play is undetectable and mildly advantageous |
| Backdated / rescoped submission | **Yes** (server timestamps only) | None |
| Peer score in live arena | **Partially** (whole-room replay + corroboration) | Collusion; bounded by keeping arena results off the all-time and per-level scopes and off every solo-fed belt (§3.7 decision 1) |

---

## 4. Realtime channel abuse

The Realtime channel is the least-defended surface in the system, because RLS
does not apply to broadcast payloads the way it applies to rows. Supabase
Realtime Authorization (channel-level RLS on `realtime.messages`) is the control
we have, and it must be turned **on**; the default of "any anon key holder can
join any topic and send anything" is not acceptable for a public event.

### 4.1 Room flooding

*The attack:* script the creation of thousands of rooms, or join one room from
hundreds of tabs, exhausting concurrent-connection and message quota on a
single small Supabase plan mid-conference. This is denial of wallet followed by denial of service and
it is the most likely *technical* thing to actually ruin the booth.

*Mitigations:*
- Room creation goes through an **Edge Function**, never a direct table insert:
  N rooms per player per hour, hard cap on total concurrently-open rooms.
- **Fixed room capacity** enforced server-side at join (an Edge Function issues
  the room token), not by the client counting presences.
- **Anonymous sign-ins are rate-limited** per IP at the Supabase Auth level; a
  guest-first product makes account creation free, so this control is doing real
  work.
- A **kill switch**: a `feature_flags` row that disables arena join without a
  redeploy. The booth runbook needs a "turn multiplayer off, campaign still
  works" lever, because static single-player Flywheel is a complete product and
  falling back to it is a five-second recovery. See
  [08-rollout-and-runbook.md](08-rollout-and-runbook.md).

### 4.2 Presence impersonation

*The attack:* Realtime presence state is *self-reported by the client*. Nothing
in the protocol stops me from tracking presence as `{name: "Nico Lafakis",
avatar: ...}` or as your exact display name and id.

*Mitigations:*
- **Presence payloads are display hints, never identity.** The room's roster of
  record is a server-side table (`room_participants`) written by the join Edge
  Function from the JWT `sub`. The renderer draws holes for participants in that
  roster; a presence entry with no matching roster row is ignored, not drawn.
- **Join is token-gated.** The Edge Function returns a short-lived room token
  bound to `(room_id, user_id)`; Realtime Authorization policy on the topic
  checks it. Knowing a room code is not sufficient to join.
- Display names in-room come from the **server's** copy of the profile, resolved
  by user id, not from the payload. This also means moderation (§6) takes effect
  in-room immediately.

### 4.3 A malicious host reporting fake results for everyone

Covered in §3.7. Summarised: the host reports the whole room's intent streams,
the server replays them, peers corroborate their own streams, mismatch voids the
round, and arena results do not feed ranked boards.

One addition specific to the channel: **the host role must be server-assigned,
not self-claimed.** "First client in the room runs the sim" is the *policy*, but
the room record must record who the host is, assigned by the join function on
the first successful join. Otherwise a peer can broadcast a "I am the host now"
message and hijack the authoritative sim mid-round. Any snapshot broadcast from
a sender that is not the recorded host is dropped by every client, and the
server rejects a result submission from a non-host.

### 4.4 Griefing and message-rate limits

*The attacks:* spamming snapshot messages to drown the real host; broadcasting
malformed payloads to crash peers' renderers; joining and leaving repeatedly to
churn presence; sitting in a room doing nothing to occupy a slot.

*Mitigations:*
- **Supabase Realtime's per-client message rate limit is set explicitly**, not
  left at default. The legitimate ceiling is known and small: the host sends
  ~15 snapshots/sec, a peer sends intent at most at the same rate. Set the limit
  just above that. Anything faster is not a player.
- **Clients validate every inbound payload before use** — shape, numeric
  finiteness, participant id in roster, tick monotonicity. The renderer must not
  be reachable by an unvalidated message; `NaN` coordinates from a hostile peer
  should produce a dropped message, not a wrecked scene. (The existing sim
  already has `probeFinitePositions` discipline in the validator; extend that
  instinct to the wire.)
- **Snapshots older than the last applied tick are dropped**, which incidentally
  kills replay-on-the-wire griefing.
- **Idle eviction**: a participant with no intent messages for N seconds is
  removed from the roster, freeing the slot.
- **There is no chat.** Not in this scope, not as a stretch goal. Free-text
  broadcast between strangers at a corporate event is a moderation surface we
  have no budget to staff. Handles are the only user-authored text in the
  system and §6 covers them.

---

## 5. RLS policy review

**Assume the anon key is public and design as if every table were exposed at a
guessable URL, because it is.** The tables below must match
[03-technical-design.md](03-technical-design.md); where they differ, that doc
owns the schema and this one owns the *intent*. Every table listed has RLS
**enabled** — a table with RLS off and a public anon key is a public table.

### 5.1 Table-by-table

| Table | anon / guest | authenticated (self) | authenticated (others) | service role only |
|---|---|---|---|---|
| `profiles` — id, handle, created_at, is_hidden, moderation_state | SELECT of a **public view** only (see 5.2) | SELECT own row incl. private columns; UPDATE own `handle` (constrained, §6) | SELECT via public view only | UPDATE `moderation_state`, `is_hidden` |
| `profile_private` — first/last name, email, company, marketing consent | none | SELECT own; UPDATE own | **none. ever.** | full |
| `consents` — user_id, kind, granted_at, revoked_at, policy_version, source | none | SELECT own; INSERT own | none | full |
| `runs` — submission record: user_id, mode, level/scene, seed, trace, client_version, trace_hash | none | INSERT own (`user_id = auth.uid()` **with check**); SELECT own | none | full; UPDATE only by validator |
| `run_results` — validated score, review_state, validator_version | none | SELECT own | none | **INSERT/UPDATE service role only** |
| `leaderboard_entries` — the ranked, validated, best-per-scope rows | SELECT (filtered, see 5.3) | SELECT | SELECT | **all writes** |
| `belts` / `belt_reigns` | SELECT | SELECT | SELECT | all writes |
| `achievements` (definitions) | SELECT | SELECT | SELECT | all writes |
| `player_achievements` | SELECT via public view (handle + achievement only) | SELECT own | public view only | all writes |
| `rooms` | none | SELECT rooms it is a participant of | none | INSERT/UPDATE (via join/create function) |
| `room_participants` | none | SELECT rows of own rooms | same room only | all writes |
| `room_results` | none | SELECT own rooms | same room only | all writes |
| `moderation_queue` | none | none | none | full — **no client role has any access** |
| `handle_blocklist` | none | none | none | full |
| `events` (UNBOUND window, venue flags) | SELECT | SELECT | SELECT | all writes |
| `feature_flags` | SELECT | SELECT | SELECT | all writes |
| `deletion_requests` | none | INSERT own; SELECT own | none | full |
| `audit_log` | none | none | none | full |

### 5.2 The public-profile view is the load-bearing piece

A public leaderboard needs to show *something* about a player, and the naive
implementation — `select * from profiles` with a permissive read policy — is how
an entire attendee list of names, emails and employers walks out of the booth in
one `curl`. Therefore:

- PII lives in a **separate table** (`profile_private`), not in a column of a
  publicly-readable one. Column-level protection via views is easy to undo by
  accident; a table boundary is not.
- The public surface is a **view** (`public_profiles`) exposing exactly
  `id, handle, moderation_state`, defined `security_invoker = off` with a
  restrictive underlying policy, and it **excludes** rows where
  `is_hidden or moderation_state <> 'ok'`.
- **A name is never the handle by default.** Sign-up collects first/last name
  for lead capture and separately asks what to *display*. Defaulting the public
  handle to "Firstname L." is acceptable only if the player is shown, in plain
  words, that this is what a room full of people will see — see
  [05-identity-and-accounts.md](05-identity-and-accounts.md), which owns the
  consent copy.
- **Email is never in any view, any board payload, any realtime message, or any
  client-reachable query.** There is no product feature that needs it client-side
  after auth.

### 5.3 Leaderboard read policy

The board is public by design, so its read policy is permissive — but it reads
through a view that:
- joins `public_profiles` (so hidden/moderated players vanish from the board the
  instant they are hidden, with no backfill job);
- filters `review_state = 'clean'` (flagged runs are invisible until cleared);
- exposes score, handle, scope, and `created_at` — nothing else. No user id
  leaves the server on the board payload; a stable public id is fine, the auth
  `sub` is not.

### 5.4 The service-role key

**The service-role key must never be present in anything the browser loads.**
Not in `index.html`, not in an importmap, not in a JS module, not in a Vercel
`NEXT_PUBLIC_`-style variable, not in a comment, not in a wiki page, not in a
committed `.env`. Its only homes are Supabase Edge Function secrets and the
project dashboard.

Concrete guards, all cheap:
- The repo has **no build step**, so there is no bundler-injected env — every
  string in the client is literally in a committed file. That is actually a
  security *advantage* here: a leak would be visible in the diff. Add a grep for
  the key prefix and for `service_role` to `tools/validate.mjs` so the guard is
  mechanical rather than remembered. The validator is already the project's
  enforcement surface for invariants (`Math.random`, save-schema parity); this
  belongs in the same list.
- Everything that needs elevated rights is an **Edge Function**. If a feature
  seems to need the service key in the client, the feature is designed wrong.
- If it leaks: rotate immediately, then treat every row in `profile_private` as
  disclosed and follow the notification obligations in §6.4. There is no
  partial-containment story for this key.

### 5.5 Policy review checklist

Before UNBOUND, walk this and record the result in
[07-test-strategy.md](07-test-strategy.md):
1. For every table: `rowsecurity = true`? (query `pg_tables`; do not eyeball.)
2. For every policy: is `with check` present on every INSERT/UPDATE, not just
   `using`? A missing `with check` is the classic hole that lets a row be
   inserted for someone else.
3. Does any policy compare against a client-supplied value rather than
   `auth.uid()`?
4. Is there an automated test that runs the *anon key* against every table and
   asserts the expected deny? This is the only form of RLS review that does not
   rot. It is a script, not a paragraph.
5. Are `SECURITY DEFINER` functions justified one by one, with a pinned
   `search_path`?
6. Does the anon role have any `EXECUTE` grant it does not need?

---

## 6. PII, handles, and abuse

### 6.1 The big-screen problem

A handle field plus a projector at a professional conference is a well-known way
to have a bad afternoon. Someone will try `HubSpot Admin`, someone will try a
competitor's name, and someone will try a slur. **A moderation plan is
mandatory, not optional**, and it needs to work at booth speed with the person
staffing the booth possibly being Nico with a phone.

The plan, in layers:

1. **Constrain the input.** Handles: 3–16 characters, `[A-Za-z0-9 _-]` only, no
   leading/trailing space, no repeated spaces, NFKC-normalised, and confusable
   characters folded before uniqueness checks. This alone removes the
   zero-width/homoglyph impersonation class and most of the ASCII-art class.
2. **Blocklist on write, server-side.** A `handle_blocklist` table checked by
   the Edge Function that sets a handle. Contents: a standard profanity list
   (leet-folded — `a→4`, `i→1`, `o→0`, `e→3`, `s→5` before matching), plus a
   protected-terms list seeded with `hubspot`, `unbound`, `admin`, `moderator`,
   `official`, `staff`, `support`, and the names of the sponsoring
   organisations. Rejection is at the moment of typing with a plain message
   ("that name isn't available"), never after the fact.
3. **Impersonation defence.** Reject exact and confusable-fold collisions with
   an existing handle; append a discriminator rather than allowing a duplicate.
   A handle that matches a protected term with punctuation removed is rejected
   too (`H_u_b_S_p_o_t`).
4. **Default to safe.** A player who has not chosen a handle gets a generated
   one from a curated word list — the game already has a voice for this
   ("Sprocket 41"). Nobody is ever *forced* to type a name to appear on a board.
   Fewer typed names is less moderation surface.
5. **A human kill switch that takes one tap.** A `moderation_state` column on
   `profiles` with `ok | hidden | banned`, plus an operator page (a static page,
   auth-gated to a hard-coded operator list, calling an Edge Function) with one
   button: **hide this player**. Because the public board and the in-room name
   both read through the view that filters on this column, hiding is
   instantaneous and global — screen, board, room, belts. **Target: from "that's
   on the screen" to "it's gone" in under 15 seconds, verified as a rehearsed
   drill before the doors open.** Verifying this is a test-strategy item, not an
   aspiration.
6. **A screen-safe display mode for the booth projector.** The big-screen view
   renders only handles that have been through the pipeline above **and** are at
   least N seconds old, giving the blocklist's misses a short window to be
   caught by a human before they are projected. A few seconds of delay on a
   leaderboard costs nothing.

Layer 5 is the one that actually matters. Layers 1–4 will miss something; the
question is not whether but how fast we recover, and that is a rehearsal
question.

### 6.2 Name and email on a public board

**Email never appears anywhere public.** Full legal names should not either:
what the board shows is the *handle*, which may be a real name only because the
player chose it. Company is optional, opt-in, and displayed only if given — for
a partner audience it is a nice touch, but "Firstname Lastname, Acme Corp"
projected next to a score is a disclosure the player must have consciously
agreed to.

### 6.3 Consent, lead capture, and the honest framing

The explicit product goal is **lead capture at UNBOUND**. That makes this a
marketing data collection, and it must be built as one:

- **A separate, unticked consent checkbox** for "contact me about ProvenLabs /
  Flywheel", distinct from account creation. Playing the game must never require
  agreeing to be emailed. Bundled consent is not consent.
- **A consent record**, not a boolean: `consents(user_id, kind, granted_at,
  revoked_at, policy_version, source)`. The record of *when* and *against which
  version of the policy* is the part that is worth anything later.
- **A real privacy notice**, linked from the sign-up screen, that says in plain
  words: what is collected, why, who it goes to (us; and HubSpot if the player
  used the HubSpot sign-in), how long it is kept, and how to get it deleted.
- OAuth does not launder consent. Signing in with Google to play a game is not
  agreement to marketing contact; the checkbox is still required and still
  separate.

### 6.4 GDPR-shaped obligations

There will be EU attendees. Build for the obligations regardless of where the
event is:

| Obligation | How it is satisfied |
|---|---|
| **Lawful basis** | Contract (account/leaderboard) for gameplay data; explicit consent for marketing. Recorded per §6.3. |
| **Deletion / erasure** | A self-service "delete my account" that writes to `deletion_requests` and a scheduled Edge Function that hard-deletes `profile_private`, `consents`, and auth user; **anonymises** rather than deletes leaderboard rows (handle → `Retired Sprocket`, user link severed) so the board's history stays coherent. Say this in the privacy notice — "your scores remain, anonymised" — because it is a choice, not a default. |
| **Export / access** | An Edge Function returning the player's own rows as JSON. Small to build, and the honest version of "you can have your data". |
| **Rectification** | Handle and profile fields are editable by the player; that is most of it. |
| **Minimisation** | We collect first name, last name, email, optional company. Nothing else. No IP logging beyond Supabase's own operational logs, no device fingerprinting, no analytics SaaS (per the standing build-don't-buy and no-new-observability-SaaS rules — see [10-observability-and-nfr.md](10-observability-and-nfr.md)). |
| **Processor transparency** | Supabase and Vercel are the processors; named in the notice. |
| **Children** | Not directed at children; a professional conference audience. No age gate, but no behavioural profiling either. |

### 6.5 Retention after the conference

This is the obligation most likely to be forgotten, so it gets a date attached:

- **Input traces** are the bulk of storage and have a short useful life. Retain
  for **90 days**, then drop the `trace` column contents while keeping the
  validated result and the hash. After 90 days a score cannot be re-validated,
  which is an accepted trade against unbounded storage growth; the hash still
  prevents resubmission. Automate it — a retention job, not a reminder.
- **UNBOUND-scoped leaderboard rows** stay (they are the memento) but the
  event scope is frozen at the window's close so nobody adds a row in November
  claiming a conference belt.
- **PII of players who did not consent to marketing** is retained only as long
  as the account exists. A guest account that was never claimed and has no
  activity for 12 months is purged.
- **The lead list** — those who *did* consent — is exported to wherever leads
  are worked, and the consent record travels with it. The game's own copy is
  still subject to deletion requests, so the export must not become an
  unreachable shadow copy; note the destination in the privacy notice.
- **Write the retention schedule into `08-rollout-and-runbook.md` as a dated
  post-conference task with an owner**, or it will not happen.

---

## 7. OAuth and sign-in risks

Three paths, three different risk profiles. Full flows live in
[05-identity-and-accounts.md](05-identity-and-accounts.md); this is what can go
wrong.

### 7.1 Common to all paths

- **Redirect URI allow-listing is the whole ballgame.** Every provider's console
  and Supabase's own `Site URL` / additional-redirect-URL list must contain the
  exact production origin and nothing loose. **No wildcards.** Vercel preview
  deployments generate a new hostname per push, and the tempting fix —
  `https://*.vercel.app` — hands token interception to anyone who can deploy a
  project to Vercel, which is everyone. Use a single stable preview alias if
  previews need auth at all, or accept that auth only works on production.
- **PKCE on every flow**, which is the Supabase JS default; do not switch to the
  implicit flow to work around a static-site quirk. Tokens in a URL fragment on
  a page served from a CDN is how tokens end up in `Referer` headers.
- **`state` must be validated**, not merely sent. This is the CSRF defence for
  the login itself; the custom HubSpot flow (§7.4) is where we own this and can
  get it wrong.
- **Open-redirect on return.** The post-login `redirect_to` must be validated
  against an allow-list of same-origin paths. A `?next=` that accepts an
  absolute URL turns the login page into a phishing relay wearing our domain.
- **Session storage.** Supabase's default is localStorage, which is XSS-readable.
  Given a no-build-step static site with a CDN importmap, the XSS surface is
  small but the importmap is a genuine supply-chain dependency: a compromised
  CDN serving a modified three.js can read the session. Mitigations that cost
  nothing: **subresource-integrity / pinned versions on the importmap entries**
  (pin exact versions, never a range or `latest`), and a **CSP** that restricts
  `script-src` to self plus the exact CDN origin and `connect-src` to self plus
  the Supabase project. This is worth doing before the event; it is a header and
  a few pinned URLs.
- **Account linking is where identity systems get broken into.** If a player
  signs in with Google using `nico@example.com` and later with HubSpot using the
  same address, do **not** auto-merge on matching email unless the provider
  asserts the email is verified — and even then, prefer an explicit "link these
  accounts?" confirmation while signed in. Silent email-match merging is a
  well-worn account-takeover path: create an unverified account at the victim's
  address on the weaker provider, wait for the merge.
- **Enumeration.** Email-OTP sign-in must return the same response for a known
  and an unknown address, and handle-uniqueness checks must not become an
  attendee-list oracle (rate-limit them and return a neutral "not available").

### 7.2 Email OTP

Lowest risk, and it is the fallback when conference wifi eats an OAuth round
trip. Watch: OTP length and expiry (6 digits, ≤10 minutes), **attempt
rate-limiting per address and per IP** (otherwise a 6-digit code is guessable),
and Supabase's own email-sending rate limits — which on a small plan are low
enough to *become the outage* if a queue forms at the booth. Test the sending
limit against the expected sign-up rate before the event and, if it is close,
pre-warm by encouraging Google sign-in at the booth. A rate-limited email
provider at 10am on day one is a plausible failure and it belongs in the risk
register.

### 7.3 Google

Well-trodden. Risks are configuration, not protocol: correct client id/secret in
Supabase, the exact authorised redirect URI, the consent screen actually
published (an unpublished "testing" app rejects everyone who is not on a list —
a classic day-of failure), and requesting **only** `email` and `profile`. Do not
request anything else; a game asking for calendar access is a trust event.

### 7.4 HubSpot — the highest-risk path

HubSpot is not a Supabase built-in provider, so this is a **custom OAuth flow we
implement ourselves in Edge Functions**, which means every protocol guarantee
that Supabase would have given us for free is now our own responsibility. That
is the reason this is flagged as the riskiest thing in the package.

What we own, and therefore what we can get wrong:
- **The client secret lives only in Edge Function secrets.** The token exchange
  is server-side. A client-side exchange leaks the secret to every player.
- **`state` is generated server-side, single-use, short-TTL, and bound to the
  browser session** (cookie or a signed value), then verified on callback. A
  `state` that is only echoed is not CSRF protection.
- **PKCE** even though HubSpot's server-side flow does not require it.
- **Exact-match `redirect_uri`** registered in the HubSpot app, identical string
  on both legs.
- **Minimum scopes.** Almost certainly just enough to read the authenticated
  user's identity. Every additional scope is us asking a partner for access to
  their company's CRM in exchange for playing a game about eating buildings, and
  the reputational asymmetry there is severe. If identity requires a scope that
  reads CRM data, **prefer dropping HubSpot sign-in over requesting it** — that
  is a product trade worth surfacing rather than a technical detail.
- **Do not store HubSpot access or refresh tokens at all** unless a feature
  genuinely needs them. Exchange, read the identity, mint our own Supabase
  session, discard. Tokens not stored cannot be stolen, and holding another
  company's CRM credentials in a booth game's database is a liability with no
  matching benefit.
- **The identity assertion must be verified**, not parsed. Fetch the token's
  metadata from HubSpot's own endpoint and confirm the app id matches ours
  before trusting any claim — otherwise a token minted for a *different* HubSpot
  app can be replayed against ours (the "confused deputy" of OAuth).
- **Bridging into Supabase Auth.** After verifying identity, the Edge Function
  must create/sign in the corresponding Supabase user using the **service role**,
  server-side only, and hand back a session. This function is the single most
  security-sensitive piece of code in the project: it can mint a session for any
  user id. It needs its own review, its own tests, and a hard rule that it
  derives the user id from the *verified* HubSpot response and never from
  anything in the request body.
- **Have a fallback.** If the HubSpot flow is not solid a week before the event,
  ship without it. Email OTP plus Google covers sign-in completely; HubSpot
  sign-in is a delight, not a requirement, and a broken custom OAuth flow in
  front of HubSpot partners is worse than its absence.

---

## 8. Prioritised mitigations

### Must have before UNBOUND

These are the ones where "we'll do it after" means the event itself is the
incident.

1. **RLS enabled on every table, with an automated anon-key deny test.** Not a
   review, a script that runs and fails loudly.
2. **PII in a separate table from anything publicly readable**; email absent
   from every view, payload, and message.
3. **Service-role key provably absent from the client**, enforced by a grep in
   `tools/validate.mjs` alongside the existing invariant guards.
4. **No client-writable score path.** Scores written only by the validating Edge
   Function.
5. **Replay validation live for single-player submissions**, with version
   pinning and an allow-list of validatable client versions.
6. **Cross-engine determinism resolved** (§3.4) — proven, tolerated, or removed.
   An honest player whose valid run is rejected because they used an iPhone is
   both a correctness bug and, at a booth, a visible one.
7. **Handle pipeline**: charset constraint, server-side blocklist with leet
   folding, protected-terms list, confusable folding, safe generated default.
8. **One-tap hide, rehearsed.** Operator page, `moderation_state` filtering
   through the public view, and a timed drill before doors open.
9. **Realtime Authorization on**, room join token-gated through an Edge
   Function, server-assigned host, explicit per-client message rate limits.
10. **Arena results separated from records by session verdict** (§3.7 decision
    1) — never the all-time or per-level scopes, never a solo-fed belt, and
    belts only from a `verified` round. This is a design decision that must land
    before the netcode is written, not after.
11. **Consent checkbox separate from sign-up, with a consent record and a real
    privacy notice.**
12. **Redirect-URI allow-list with no wildcards**, on all three providers, plus
    validated `state` and PKCE on the custom HubSpot flow.
13. **Multiplayer kill switch** (`feature_flags`) reachable without a redeploy.
14. **The kiosk data-leak fix** from
    [12-migration-plan.md](12-migration-plan.md#4-the-shared-booth-kiosk) — a
    booth machine must not offer the previous player's progress, or their
    session, to the next player.
15. **Pinned CDN importmap versions + a CSP header.** Cheap, and it is the only
    thing standing between a CDN compromise and every session token.

### Can follow

16. Heuristic bot-detection scoring on traces, and the flagged-review queue UI.
    Ship the `review_state` **column** and the filtering before the event; the
    scoring can arrive later.
17. Self-service export and deletion endpoints. Have the *process* (an email
    address that reaches a human who can run it) before the event; automate
    after.
18. Peer corroboration for arena rounds (§3.7 decision 3). Whole-room replay is
    the must-have; per-peer corroboration hardens it.
19. Retention automation. Have the schedule written and dated; the cron job can
    land in the weeks after.
20. Account-linking UX for a player who used two providers with one email.
    Before that lands, the safe behaviour is "two separate accounts", which is
    confusing but not dangerous — and that is the right order.
21. Audit logging on moderation and administrative actions.
22. A more sophisticated anti-collusion model for arenas. Only worth building if
    arena results are ever allowed past the event/city scopes and the two arena
    belts — into the all-time scope or a solo-fed belt — which §3.7 decision 1
    forbids today.

---

## Related

- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — the invariant this entire defence rests on.
- [ADR-0012 server-side replay validation as the sole basis for leaderboard
  trust](../../adr/0012-replay-validated-leaderboard-trust.md).
- [12-migration-plan.md](12-migration-plan.md) — the kiosk problem and the
  retroactive-score admission decision, both of which are security decisions
  wearing migration clothing.
- `AGENTS.md` invariants 1–3 — the reason any of this is possible.
