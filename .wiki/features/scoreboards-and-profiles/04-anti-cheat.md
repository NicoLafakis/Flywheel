# Scoreboards & Profiles — Anti-Cheat Design

> [Objective overview](00-objective-overview.md) · [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) · [Threat model](07-threat-model.md)

This is the doc the feature turns on. The owner's requirement is that the server
be able to establish that a submitted score was **actually achievable from how the
run was played**, not merely that it looks plausible. This doc says what we
measured, what we decided, and — the part that matters most — exactly what the
decision does not stop.

---

## 1. The problem, stated precisely

The score originates in a browser the player fully controls. The client is a
static site with no build step, no minification and no obfuscation
([ADR-0014](../../adr/0014-vendored-same-origin-runtime.md)): every module is
readable in devtools, and `js/net/supabase-config.js` ships the publishable key
in a comment block explaining that it is public by design. A naive
`POST {name, score}` is forgeable in ten seconds by anyone who opens the network
tab, and the realistic first adversary is not a determined attacker but a curious
player who wanted to see what happened.

The asset that makes a real defence affordable is
[ADR-0003](../../adr/0003-deterministic-seeded-generation.md): all randomness runs
through a seeded `mulberry32`, `Math.random()` is banned in `js/`, and the
timestep is fixed at 1/60. Same seed, same inputs, same result. `tools/validate.mjs`
already imports the shipping sim into Node and drives it headlessly — server-side
replay is not a capability we have to invent, it is the test suite with a
different caller.

So the question was never "can we replay". It was "**what does replaying cost, and
does the guarantee still hold across the devices people actually play on**". We
measured both. Both answers changed the design.

---

## 2. Measurement A — what a replay costs

### 2.1 Method

A probe (`replay-cost-probe.mjs`, run from a scratchpad, not committed)
constructs `VoxelSandboxSim({ seed: 'validator', scene: 'chicago' })` and drives
the scene's own exported `CHICAGO_ROUTE` with exactly the loop
`tools/validate.mjs:1388-1398` uses, logging wall time per 10 sim-seconds. Chicago
was chosen because at 23,151 blocks it is the **cheapest** real city in the game —
Cambridge is 72,943 and Upper Manhattan 73,393. The route is 135 s, which is the
validator's own excursion length and far shorter than a real completed run.

Run on the development box, Node v24.18.0, with other agents active on the tree.
Per `STATUS.md`'s own measurement precondition, this box shows 2.0–2.6× noise
while it is busy, so **treat every figure below as an upper bound on a quiet
machine**. The conclusion survives that: it is two orders of magnitude, not two
times.

### 2.2 Result

Chicago, 135 s route, 8,100 steps, default (untiered) physics — the exact
configuration a server would have to reproduce:

```
scene build   6,167 ms
replay       75,836 ms     = 0.56x realtime
total        82,003 ms
```

Per 10 sim-seconds, showing the curve rather than the average:

| simT | wall (ms) | awake debris | eaten | SIZE |
|---:|---:|---:|---:|---:|
| 10 | 169 | 6 | 40 | 1 |
| 20 | 334 | 14 | 67 | 1 |
| 30 | 325 | 14 | 69 | 1 |
| 40 | 578 | 16 | 87 | 2 |
| 50 | 1,063 | 28 | 115 | 3 |
| 60 | 3,621 | 158 | 175 | 3 |
| 70 | 6,973 | 108 | 191 | 3 |
| 80 | 6,831 | 163 | 426 | 4 |
| 90 | 7,435 | 135 | 662 | 4 |
| 100 | 9,394 | 259 | 736 | 5 |
| 110 | 12,260 | 174 | 834 | 5 |
| 120 | 10,776 | 177 | 1,017 | 6 |
| 130 | 10,909 | 212 | 1,153 | 7 |

**The cost of a sim-second rises ~65× across a 135-second run.** The mechanism is
already documented and is not a bug we can optimise away in this feature:
[RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md) §2
establishes that the awake-debris population grows monotonically during sustained
eating (rubble resting on rubble is deliberately never slept, or it would hang in
the sky when its support rolls away), and per-step cost is proportional to
*awake bodies × pile height*. The RCA's recommended fix is an engine-level debris
retirement change that "needs its own design-and-regression pass" and has not
landed.

### 2.3 What a completed run actually costs — measured directly

The shipped goal is **clearing 50% of a city**, so the question is not what the
validator's 135-second excursion costs but what a *finished run* costs. A second
probe (`clear-cost-probe.mjs`) drove Chicago's waypoints cyclically until either
50% consumption or a wall-clock budget ran out:

```
scene build 5,482 ms | totalMass 124,047 | blocks 44,578
…
simT 590 s   wall 432.5 s   consumed 2.91%   awake 462   eaten 2,170   SIZE 8
WALL BUDGET EXHAUSTED at simT=590 s (432.5 s wall) — consumed 2.91%
```

**Nearly ten minutes of sim time cost over seven minutes of CPU and got 2.91% of
the way to the goal.** Reaching 50% is roughly seventeen times further along a
curve that is still climbing — the last 20 sim-seconds of that run cost 39.8 s of
wall time against 0.04 s for the first 20.

The corroborating datapoint is Cambridge, where the same pattern over the scene's
780 s route consumed **78 CPU-minutes and 2.33 GB before being killed at 41% of a
single excursion**, with
[RCA-2026-08-11](../../findings/RCA-2026-08-11-cambridge-validator-stall.md)
projecting 1–2+ hours per excursion.

*(Reconciled 2026-08-13: this probe's `blocks=44578` was right and `STATUS.md`
was stale. Chicago was rebuilt on the Cambridge method on 2026-08-11
(`b843c34`), 23,151 → 44,578 blocks, and the board had not caught up; it has
since been corrected. The conclusion here holds at either figure.)*

> **Finding 1. Full re-simulation of a completed Flywheel city run is not
> viable — not on Vercel, not on Supabase Edge Functions, not on any runtime this
> project would pay for. Re-simulating a run costs more than playing it.**

This is not a tuning problem. It is not fixed by a faster instance or a bigger
plan. `ADR-0012` §7.4 anticipated the shape of it ("a voxel sandbox replay is not
a campaign replay") and proposed asynchronous verification as the mitigation —
but async only moves *when* the CPU is spent, not *how much*. At hours per
submission there is no schedule that works.

---

## 3. Measurement B — the determinism guarantee has a device-shaped hole

### 3.1 The lever

`js/quality.js` is explicit that the graphics tier is also a **sim-trajectory**
tier, and says so in its own comments:

```js
high: { …, debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1, maxSubSteps: 2 },
low:  { …, debrisCap: 280,      contactBudget: 200,      contactRounds: 1, supportEvery: 2, maxSubSteps: 2 },
```

> "HIGH keeps every SIM-TRAJECTORY lever of the pre-tier build … a default-tier
> sim must stay byte-identical, and `tools/validate.mjs` never constructs a tier
> at all."

`maxSubSteps` is correctly excluded from that set — it lives in `main.js`'s
wall-clock catch-up loop and changes how much game time a second buys, never what
a given sequence of steps computes. The other four are inside `sim.tune` and
change the physics.

And LOW is the **default on every touch device**: `defaultTierForDevice()` returns
`'low'` for `(hover: none) and (pointer: coarse)`.

### 3.2 Result

Same probe, same seed, same 8,100 inputs, the only difference being the four tune
values:

| | HIGH (Infinity/Infinity/2/1) | LOW (280/200/1/2) |
|---|---:|---:|
| blocks eaten | 1,173 | 976 |
| score (`hole.mass`) | 7,228.357813 | 5,762.934375 |
| SIZE reached | 7 | 6 |
| replay wall time | 75.8 s | 52.0 s |

Divergence is visible by simT 10 (40 eaten vs 37), well below the `debrisCap` of
280 and the `contactBudget` of 200 — because `contactRounds` and `supportEvery`
apply on **every** step regardless of population, not only when a cap binds.

> **Finding 2. Two honest players producing identical inputs score ~25% apart
> depending on their device tier. This is not a floating-point tolerance
> question; it is a different run.**

ADR-0012 §7 specified a relative tolerance of `1e-9` for replay comparison,
sized for cross-engine float drift. It is off by nine orders of magnitude for
this. A server replaying at HIGH would flag **every honest phone player** as a
mismatch, which is precisely the failure ADR-0012 itself warned was more likely
than any attack.

It is also, independently of any leaderboard, a **fairness bug that exists in the
shipped game today**. Nobody has noticed because there is nothing to compare
against. A board is the thing that would make it visible.

---

## 3A. Measurement C — the cross-engine hole is real, and it is small and fixable

ADR-0012 flagged that the pure sim calls `Math.hypot`, `Math.cos` and `Math.sin`,
whose precision ECMAScript leaves implementation-defined. That flag was correct
and it has never been actioned. This section closes it, because the finding is
better than expected: **the spec divides the world cleanly, and this sim is
almost entirely on the safe side of the line.**

### 3A.1 What the spec actually guarantees

ECMA-262 §6.1.6.1 defines the Number type as *"the double-precision floating
point IEEE 754-2019 binary64 values as specified in the IEEE Standard."*
`Number::add`, `::multiply` and `::divide` each state they perform the operation
*"according to the rules of IEEE 754-2019 binary double-precision arithmetic"*
and return the exactly-rounded real result. **`+ - * /` are bit-identical across
every conforming engine.** So are `Math.sqrt` (§21.3.2.33, `Return 𝔽(the square
root of ℝ(n))` — exactly specified, *not* approximated), `Math.fround`,
`Math.imul`, and all the integer and bitwise operations.

Against that, §4.4.1 defines a second category verbatim:

> *"An **implementation-approximated** facility is one that defers its definition
> to an external source while recommending an ideal behaviour. While conforming
> implementations are free to choose any behaviour within the constraints put
> forth by this specification, they are encouraged to strive to approximate the
> ideal."*

`Math.sin`, `Math.cos`, `Math.exp`, `Math.pow`, `Math.hypot` and `Math.cbrt` are
all in it, each ending in *"Return an implementation-approximated Number value…"*.
There is **no ULP bound anywhere in the spec** — an engine returning zero from
`Math.cos` would be conformant.

This is not theoretical. Firefox's 2021 intent-to-implement for switching trig to
fdlibm exists specifically because *"Firefox used the platform libm for trig,
making results differ across OSes"*; FingerprintJS ships a `math.ts` fingerprint
component built entirely on these divergences; and V8's `Math.tanh` regressed to
the host libm as recently as V8 14.8.57, producing three different values on
glibc, macOS and Windows. Different browsers mean different engines: your Safari
players run JavaScriptCore, your Firefox players run SpiderMonkey, and a Vercel
Node function runs V8.

Sources: <https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-add>,
<https://tc39.es/ecma262/multipage/overview.html#sec-terms-and-definitions-implementation-approximated>,
<https://tc39.es/ecma262/multipage/numbers-and-dates.html>,
<https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI>,
<https://github.com/fingerprintjs/fingerprintjs/blob/master/src/sources/math.ts>,
<https://scrapfly.dev/posts/browser-math-os-fingerprint/>.

### 3A.2 The audit of `js/voxelsim.js`

Counted this session:

| Call | Count | Spec status | In the ranked path? |
|---|---:|---|---|
| `floor`, `min`, `round`, `max`, `abs`, `ceil` | 141 | exact | — |
| `Math.sqrt` | 2 | **exact** | safe |
| `Math.hypot` | **6** | approximated | **yes** — `:299`, `:669`, `:1522`, `:2046`, `:2111`, `:3154` |
| `Math.cos` / `Math.sin` | **4** | approximated | **yes** — `:2079-2080`, chunk tumble |
| `Math.cbrt` | 3 | approximated | `:847` guarded, `:2825` not |
| `Math.random` | 0 | — | the two grep hits are comments. Invariant 1 holds. |

**Ten call sites, not a systemic problem.** And the file already knows about this
class of bug — `:844` carries the comment *"`Math.cbrt` is implementation-
approximated in the spec and every existing scene is cubes — this makes their
bit-identity structural instead of a property of whichever cbrt the engine
ships."* Somebody has already reasoned this through once and applied the right
fix in one place. This is that reasoning applied to the rest.

### 3A.3 The fix, per call site

- **`Math.hypot(a, b)` → `Math.sqrt(a*a + b*b)`** (and the three-argument case at
  `:2111` likewise). `sqrt` is exactly specified and `*`/`+` are exactly
  specified, so the composition is bit-identical everywhere. `hypot`'s only real
  advantage is overflow and underflow avoidance at extreme magnitudes, which is
  irrelevant in a world clamped to roughly ±100 metres.
- **`Math.cos` / `Math.sin` at `:2079-2080`** take `c.rotX` / `c.rotZ`, which
  `:2075-2076` clamp to **[-0.7, 0.7]**. A bounded domain that tight is the easy
  case: a fixed-degree minimax polynomial in `+ - *` only is accurate to well
  under a ULP over that interval and is exactly reproducible by construction. Ship
  it as `fwSin`/`fwCos` in the pure set, next to `rng.js`.
- **`Math.cbrt` at `:2825`** — apply the same structural trick `:847` already
  uses, or route it through the polynomial helper.

**This is not free and the cost must be stated.** Changing any of these changes
the numeric result slightly, which changes the trajectory, which means validator
re-runs and possibly retuned gates — exactly the consequence
[ADR-0003](../../adr/0003-deterministic-seeded-generation.md) warns about for any
change to the RNG stream. It is a deliberate, gated piece of work
([13-tasks.md](13-tasks.md) T-102), it should land **before** any board has
history on it, and it is much cheaper now than after.

### 3A.4 If it is not done

The design still functions, with a stated tolerance instead of bit-exactness, and
the failure mode is the one the industry has already shipped. PolyTrack — a
browser racing game with a determinism-verified leaderboard — has a changelog
entry containing both *"Improved the determinism test to be more accurate to
prevent invalid replays being submitted"* and *"Fixed: A rare problem where some
valid replays would be marked as invalid"* **in the same release**
(<https://kodub.itch.io/polytrack/devlog/627690/polytrack-031>). Honest players
get rejected. That is why §6's verdicts are a visible per-row status rather than a
silent accept-or-drop, and why an unreproducible run is `unverifiable` and never
`rejected`.

---

## 4. The design space, and why the obvious alternatives fail

| Approach | What it would buy | Verdict |
|---|---|---|
| **Trust the client's score** | Two hours of work | Fails the owner's stated requirement outright. It is one `fetch` in a console and it would be found immediately. |
| **Sign or obfuscate the client score** | Raises the bar an hour | A shared secret in a static bundle is not a secret. Worse, it costs the honesty of the model: you end up believing a number you cannot recompute. |
| **Full re-simulation of the clear** | Everything, if it worked | Dead. §2. Measured. |
| **Async full re-simulation** | Moves the CPU off the request path | Moves *when*, not *how much*. Hours per submission has no schedule. |
| **Verify a random segment of a long run** | Bounded CPU, unpredictable to the attacker | Dead, and the reason is worth writing down (§4.1). |
| **Statistical outlier detection** | Cheap, catches the crude | Cannot distinguish a very good player from a forger; needs a history of honest play to calibrate, which a new board does not have; and produces false accusations, which are the one thing a public board cannot afford. Kept as a **secondary** layer only. |
| **Server-authoritative live simulation** | The textbook answer | A persistent game server is a different product and a different bill. And it does not even work here: it would have to run 73,000-block physics per concurrent player. |
| **Bounded ranked run + full re-simulation** | Everything ADR-0012 wanted, at fixed cost | **Chosen.** §5. |

### 4.1 Why segment sampling fails, specifically

The tempting construction is: the client records the trace plus periodic state
digests; the server picks a random window and replays only that. Bounded CPU,
unpredictable to the attacker.

It fails on a single fact: **to replay a window starting at tick N, the verifier
needs the sim state at tick N.** There are exactly two ways to get it, and both
are dead ends.

1. **The client supplies it.** A `VoxelSandboxSim` state is tens of thousands of
   blocks with position, damage, support and sleep state — hundreds of kilobytes
   to megabytes per checkpoint, times dozens of checkpoints. Worse, it is
   *client-supplied*, so an attacker simply hands over a forged mid-run state in
   which the hole is already enormous. The window replay then verifies a
   transition that is locally consistent and globally fictional. A hash chain
   over the digests does not save this: a chain prevents *editing* a sequence you
   did not author, it does not prevent *authoring* a fake tail.
2. **The server derives it** by replaying from tick 0. That is full
   re-simulation, which is §2.

Random spot-checking only works when altering the result requires altering many
segments. Here it requires altering exactly one — the splice point — so with N
windows and k checks the catch probability is k/N, which at realistic N is
indistinguishable from zero. Recorded here so it is not re-proposed.

### 4.2 Precedent — who else does this, and what they learned

The chosen design is not novel. It is the standard answer for a deterministic
browser game, and the useful part of the prior art is the failure modes.

**TETR.IO** is the closest precedent and the strongest one. Its developer:
*"TETR.IO's codebase is shared perfectly between client and server, so the server
can check precisely what a potential cheater may be doing - one discrepancy and
you're out!"* World-record badges are awarded *"through a rather strict replay
validation protocol involving every input being played back serverside alongside
the exact RNG seed to ensure the run wasn't hacked."* And the honest limit, from
a real case the developer wrote up: anti-cheat flagged *"inconsistent replay
timings"*, but the case was only closed by forensic analysis of the runner's
handcam video, because *"We avoid taking decisions based on anti-cheat data alone
without further investigation, to prevent false positives."*
(<https://blog.osk.sh/post.php?p=5df9463f716867.05060790>,
<https://tetrio.wiki.gg/wiki/Badges>,
<https://blog.osk.sh/post.php?p=62841a37b50519.59122575>)

**AntGame.io** is open-source JavaScript and independently arrived at this exact
architecture: *"AntGame runs are deterministic. Given the same map, home
locations, and run seed, AntGame will always produce the exact same score… when a
run is submitted, the server can take that information and simply re-simulate a
run. This makes it impossible to submit a forged run."* Critically it pairs
re-simulation with **server-issued seeds bound to the user** and rate limits on
*seed issuance* (20/min) as well as submission (2/min) — so a player cannot grind
seeds offline and submit only the lucky ones. §5.3 and §7 are the same two moves.
(<https://github.com/Cuzzo01/antgame.io>)

**Trackmania** validates replays and also analyses the input trace statistically
(steering direction changes per second: legitimate 3–6, suspects 11+) — the
§6 heuristics, already proven to work on real cheaters. Note what it concedes,
though: the community eventually required a Competition Patch that *"overrides the
input system of TrackMania so that it can verify that all inputs come from a real
hardware device"*, i.e. replay validation alone was not enough to settle bot
suspicion. (<https://donadigo.com/tmx1>, <https://donadigo.com/tmcp>)

**Factorio** is the cautionary tale about determinism as a maintained property
rather than a fact: a threading determinism bug lived from 2017 to 2024 in a
codebase whose entire multiplayer model depends on determinism, because chunk
generation results depended on CPU core count.
(<https://www.factorio.com/blog/post/fff-415>)

**Zachtronics community leaderboards** (Opus Magnum's `omsim`, SpaceChem's
`SChem`) re-run the submitted solution and compare against the claimed metrics —
the same "recompute, do not trust" rule, and both are open source.
(<https://github.com/ianh/omsim>,
<https://github.com/spacechem-community-developers/SChem>)

**The negative results are worth stating too.** speedrun.com does not verify runs
automatically at all — it is human video review. Wordle sidestepped the problem by
never having a leaderboard. And a long trail of HTML5 postmortems shows what
happens without server-side recomputation: a signed-score scheme broken by calling
the game's own encryption function from the console
(<https://palone.blog/hacking-websites-with-javascript-part-2/>), a
"sanity check hash" reimplemented in Python from the Firefox debugger
(<https://javacakegames.itch.io/unipop/devlog/306546/re-hacking-the-leaderboards>),
and a Flappy Bird clone whose session tokens *and* rate limiting were both present
and both irrelevant because the backend never verified that gameplay occurred
(<https://bly-coder.github.io/Hacking-Flappy-Bird-Score-Manipulation-EN/>).
The vendors agree: PlayFab's docs say *"we would recommend that you never post
statistics from the client"*, and CrazyGames' say client-side submission means
*"scores can be manipulated since the client is not a trusted environment."*

**The 2026 datapoint that shapes §6's honesty.** "Hormuz Havoc" was overrun by
LLM-driven bots within 24 hours: the scoring formula was read out of `game.js` by
a browser extension, and after the developer moved the whole engine server-side a
second bot exploited replayable session tokens to *"branch from one exact game
state repeatedly and continue from the luckiest high-value outcome each turn."*
They ended up running separate human and AI-assisted leaderboards.
(<https://news.ycombinator.com/item?id=47729477>) Two lessons are baked into this
design: consume the run ticket **atomically at issue**, and do not pretend the bot
problem is solved.

---

## 5. The design

### 5.1 The unit: THE RUN

**A ranked score comes from a 90-second run, on one city, from a server-issued
seed, at a fixed physics tune.** Nothing else is ranked.

- **90 seconds.** From the §2.2 table, the first 90 sim-seconds of Chicago cost
  ~27.3 s of replay plus ~6.2 s of scene build ≈ **33 s** on the (busy)
  measurement box. At 120 s it is ~60 s + 6 s = 66 s.

  Per-invocation duration is not the binding constraint: Vercel Functions with
  Fluid compute allow **300 s on Hobby and up to 800 s on Pro**, at 2 GB / 1 vCPU
  (<https://vercel.com/docs/functions/limitations>). **The binding constraint is
  the monthly CPU allowance** — Hobby includes **4 Active CPU-hours per month**
  (<https://vercel.com/docs/limits>). At 33 s per verification that is roughly
  **436 verifications a month**, and at 66 s it is 218. That is what makes the
  placement gate in §5.5 structural rather than an optimisation, and it is why
  90 s beats 120 s: it doubles the number of ranked runs the game can afford.

  The rule, stated so it is not a matter of taste later: **if the measured p95
  replay on the deployed function exceeds 120 s, or the monthly CPU allowance is
  projected to run out, the bound drops to 60 s** (which the same table puts at
  ~6 s of replay plus build — roughly 2,000 verifications a month on Hobby).

  Note also that Hobby is *"restricted to non-commercial, personal use only"* per
  Vercel's own plan page. Which plan this project is on needs confirming before
  T-301; `.vercel/project.json` carries an `orgId` beginning `team_`, which
  suggests Pro, but nobody has checked.
- **Fixed length, so cost is fixed.** The single property that makes this design
  work is that a better player does not cost more CPU. A 90-second run by a world
  record holder and a 90-second run by a beginner cost the same to verify.
- **Server-issued seed.** The client asks to start a run; the server returns the
  seed. A player cannot shop for a favourable city layout, and a daily challenge
  later is the same mechanism with a date in it.
- **The clock is ticks, never wall time.** 5,400 ticks at 1/60. The trace's tick
  count *is* the run length; there is nothing to stretch.

The **city clear stays exactly as it is** — the 50% goal, offline, local records
on the card shelf — and is labelled as personal rather than ranked. See
[11-migration-plan.md](11-migration-plan.md) §3 for what existing players see.

### 5.2 The pinned ranked tune

A ranked run does not use the player's graphics tier for physics. It uses one
tune, the same for everyone:

```js
export const RANKED_TUNE = Object.freeze({
  debrisCap: 280, contactBudget: 200, contactRounds: 2, supportEvery: 1,
});
```

The reasoning, lever by lever:

- `contactRounds` and `supportEvery` are **unconditional** — they change every
  step regardless of load, which is why divergence appeared at simT 10. They are
  pinned to the HIGH values (2, 1) because those are the values
  `tools/validate.mjs` gates and the pre-tier sim used, and because the cheaper
  settings buy little at 90 seconds.
- `debrisCap` and `contactBudget` are **population-triggered**. The §2.2 table
  shows awake debris peaking around 163 across the first 90 seconds of Chicago —
  comfortably under LOW's 280/200. So pinning to LOW's caps costs a HIGH-tier
  desktop essentially nothing over a 90-second run while giving a phone the
  bound it needs if a collapse spikes.

Net effect: one trajectory, one score, one thing to replay. Graphics tier
continues to control `dpr`, `shadows`, `ambient` and `maxSubSteps` and no longer
touches the ranked result at all.

**This is the load-bearing assumption of the whole design and it is not yet
measured on a phone.** Gate T-901 in [13-tasks.md](13-tasks.md) requires a
90-second Chicago and Brooklyn run at `RANKED_TUNE` on a real low-end touch
device holding a steerable frame rate. If it does not, the fallback is stated in
advance rather than improvised: drop `contactRounds` to 1 for *everyone*
(including the verifier), re-measure, and record the new constant. What must
never happen is the tune differing between players.

### 5.3 The submission

A submission carries **inputs and a ticket. It does not carry a score.** There is
no score field on the wire, in the request body, or in any column any client role
can write. That rule is inherited verbatim from
[ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) and it is the one
sentence in this package that must survive the build.

```jsonc
POST /api/run/start        →  { run_id, seed, scene_id, issued_at, ticket }
POST /api/run/submit
{
  "run_id":   "…",
  "ticket":   "…",                 // HMAC, server-issued, single-use
  "scene_id": "chicago",
  "tick_count": 5400,              // must equal the mode's exact length
  "inputs":  { "encoding": "rle-i8-v1", "b64": "…" },
  "client_build": "a1b2c3d",
  "player_token": "…"              // the device-held bearer, see 05
}
```

Five things happen before a single sim step runs, in this order, because each is
cheaper than the next:

1. **Ticket check.** HMAC-SHA256 over `(run_id, seed, scene_id, player_id,
   issued_at)` with a server-only secret. Invalid, expired (>15 min), or already
   redeemed → reject. This alone kills the console-`fetch` attack: you cannot
   submit a run the server never started.
2. **Shape check.** `tick_count` must equal the mode's exact tick count (5,400).
   Payload > 32 KB → reject. Unknown `scene_id` → reject. Unknown
   `client_build` → recorded as `unverifiable`, never rejected (see §6).
3. **Elapsed-time sanity.** `now - issued_at` must be at least the run's real
   duration less a slack (90 s minus 10 s) and at most a ceiling (15 min). This
   catches submitting a 90-second run 400 ms after starting it. It is a **flag**
   in the slow direction and a **reject** in the fast direction, because slow has
   an honest explanation (a phone catching up at `maxSubSteps: 2` runs the game
   clock behind the wall clock) and fast does not.
4. **Rate limits.** §7.
5. **Placement gate.** §5.5 — the cost lever.

Only then does the verifier construct the sim and step it 5,400 times.

### 5.4 Idempotency and replay-of-a-replay

The unique key on a submission is `sha256(seed || inputs || scene_id)`. A
resubmission returns the original result rather than creating a second row. This
kills trace-replay as an attack, and — the same mechanism, for free — makes the
offline retry queue safe on a flaky network, which is why the outbox can retry
forever without a dedupe problem.

A trivially perturbed trace produces a different hash and is a genuinely
different run, so it is not caught here. It is bounded instead by the fact that
boards store **best-per-player**, so submitting a thousand slight variations of
the same run gains nothing but the best of them, and by the rate limits.

### 5.5 The placement gate — replay is not run on every submission

Replay CPU is the metered resource and an unbounded replay path is a
denial-of-wallet vector before it is anything else. So:

**A run is only replayed if its claimed placement could matter.** Concretely: the
client's *unverified* local score is used for one purpose only — deciding whether
to spend CPU. If it does not beat the player's own verified best on that city
**and** would not enter the top 200 of that city's board, the run is recorded as
personal history with `verdict = 'unranked'` and never replayed.

This is safe because the direction of the incentive is right: claiming a *low*
score to avoid verification gains an attacker nothing, and claiming a high one is
exactly what triggers verification. It is stated explicitly because it is the one
place a client-supplied number is read at all, and a reviewer should be able to
confirm it never reaches a stored score.

### 5.6 Where it runs

**Vercel Functions (Node), not Supabase Edge Functions.** The decisive fact is a
documented limit rather than a preference: a Supabase Edge Function's **maximum
CPU time is 2 seconds** per request, with 256 MB of memory
(<https://supabase.com/docs/guides/functions/limits>). A 90-second replay needs
30–60× that. Vercel Functions give 300 s of duration and 2 GB, which is 150× the
CPU budget, so this is not a close call.

The second reason is structural. The verifier's whole
value is that it imports the *shipping* `js/voxelsim.js` and the scene modules by
relative path — the same trick `tools/validate.mjs` uses, and the reason
[ADR-0002](../../adr/0002-sim-render-split.md)'s sim/render split pays off here.
On Vercel that is `import { VoxelSandboxSim, loadScene } from '../js/voxelsim.js'`
and there is exactly one physics implementation in the repository. On Supabase's
Deno runtime the functions live in a separate deploy root and the sim would have
to be copied or fetched, which creates the second implementation that is exactly
the bug nobody would ever find.

Constraints and open items on this choice are in
[03-technical-design.md](03-technical-design.md) §5, including the one real
tension: Vercel Functions want an `api/` directory, and ADR-0014 committed this
repo to no `package.json` and no build step. §5 states the resolution and what
must be verified before T-301 starts.

---

## 6. What this does and does not stop

This section is the honest one. It is written to be read out loud.

### Stopped completely

| Attack | Why it fails |
|---|---|
| `POST {name, score}` from devtools | There is no score field. Nothing on any write path accepts a number. |
| Editing `localStorage` | Local records are never ranked (§[11](11-migration-plan.md) §3). The plaintext save is not connected to the board. |
| Submitting without playing | The ticket is server-issued, HMAC-signed, single-use, and time-bounded. |
| Re-submitting a good run for more places | Content-hash idempotency; boards are best-per-player. |
| Stealing another player's run | Submission is bound to the player token that opened the run. |
| Modifying the client's physics | The server runs *our* `voxelsim.js` at *our* pinned tune. A modified client produces a trace that does not reproduce. |
| Claiming a different city or seed | Both are inside the signed ticket. |
| Backdating a submission | `created_at` is server-side and not client-writable. |
| Slowing the clock down | The trace is tick-indexed. There is no wall-clock quantity in the score. |

### Not stopped, and we are not going to fix it

**A crafted-but-valid input trace is indistinguishable from real play.** If
someone writes a program that drives our sim well and submits the trace it
produces, the replay reproduces it exactly, because it really did happen — a
machine just did it. We ship a greedy bot in `tools/validate.mjs` that beats the
game; the tool that proves the game is fair is the tool that would beat it.

This is the same residual ADR-0012 accepted and it is inherent to input-replay
verification everywhere it is used. The honest framing is: **this design proves a
score was produced by our physics from a real sequence of inputs over the real
duration. It cannot prove a human produced the inputs.**

The residual defences are heuristic, and they **flag** rather than reject,
because a false accusation on a public board costs more than a fake score:

- Input entropy and distinct-heading count over the run.
- Direction-reversal rate (a human's steering has a characteristic band; a
  solver's does not).
- Fraction of zero-input ticks.
- Sub-tick-perfect timing patterns.

Thresholds live server-side and never in the client bundle. A flagged run is
stored with `review_state = 'flagged'`, kept off the *displayed* board, and is
visible to whoever holds the operator page. Combined with the one-tap hide in
[06-privacy-and-moderation.md](06-privacy-and-moderation.md), the posture is:
**casual cheating is impossible, scripted cheating is visible and removable in
under a minute, and no further engineering is spent on the arms race.**

### Two things that are weaker than they look

1. **The elapsed-time check is soft.** `maxSubSteps: 2` means a struggling phone
   legitimately runs the game clock behind the wall clock, so we cannot bound
   elapsed time tightly from above. A patient attacker who waits the full 90
   seconds before submitting a crafted trace passes it. It is worth having
   anyway — it is free and it catches the impatient — but it is not load-bearing
   and should not be described as if it were.
2. **The placement gate reads a client number.** §5.5. It decides only whether
   to spend CPU, never what is stored, but it is the single place in the system
   where a client assertion is read at all, and any future change there needs
   this paragraph re-read first.

---

## 7. Rate limiting and denial of wallet

Replay is CPU, and CPU is the bill. Limits are counted in Postgres (a
`submission_log` table with a partial index), not in function memory, because
function instances are not shared.

| Limit | Value | Reason |
|---|---|---|
| Open runs per player | 1 | A ticket must be redeemed or expire before another is issued. |
| `run/start` per player | 40 / hour | ~90 s a run plus menu time; 40 is generous for a human. |
| `run/start` per IP (unnamed player) | 60 / hour | Blunt, and the only lever available before a name exists. |
| `run/submit` per player | 40 / hour | Matched to starts. |
| **Replays actually executed** per player | **20 / hour** | The placement gate (§5.5) should make this unreachable in honest play. It is the hard ceiling on spend. |
| Replays executed globally | soft cap, alerting at 500 / hour | An alert, not a block. §[09](09-observability-and-budgets.md). |
| Name claims per IP | 3 / day | §[05](05-identity-and-names.md). |

Exceeding a limit returns a stable error code and the client's outbox holds the
item rather than dropping it. The player sees a chip, never a modal, never a
blocked game.

---

## 8. Retention

| Data | Kept | Then |
|---|---|---|
| Input trace for a `verified` ranked run | **180 days** | Deleted; score and content hash remain. Longer than ADR-0012's 30/90 day figures on purpose: **the trace is the ghost replay** (§[00](00-objective-overview.md) "Unlocks"), so it is a product asset, not just evidence. |
| Input trace for a `flagged` or `mismatch` run | 1 year | Evidence. |
| Ranked rows | Forever | They are the boards. |
| Unranked local-history rows | Never stored server-side | They stay in `localStorage`. |
| A player with no runs and no name | 90 days | Purged. |

At 90 seconds and RLE-quantised `int8` pairs, a trace is on the order of 1–4 KB.
Ten thousand ranked runs is tens of megabytes. This is not a cost problem at this
scale, which is why the retention window is set by the ghost-replay product goal
rather than by storage.

---

## 9. What was checked against the repo, and what is inferred

Per the discipline this package is held to:

**Verified by reading the code or running it:**
- `js/quality.js` tier values and the comment that names them sim-trajectory
  levers, including `maxSubSteps`'s exclusion.
- `js/voxelsim.js` `sim.tune` defaults (`Infinity/Infinity/2/1`,
  `voxelsim.js:472-476`) and the `debrisCap !== Infinity` guard at `:2358`.
- `tools/validate.mjs`'s excursion drive loop (`:1388-1398`).
- `defaultTierForDevice()` returning `'low'` on coarse pointers.
- Both measurements in §2 and §3, by execution.
- `js/replay.js` does **not** exist; the trace codec is new work.
- No `api/` directory, no `package.json`, no Supabase functions or migrations
  exist in the repo today.
- `js/net/client.js` vendors `@supabase/realtime-js@2.112.2` only — there is no
  auth client and no PostgREST client in the browser.

**Inferred, and labelled as such wherever it appears:**
- That a 90-second replay on a Vercel serverless vCPU costs 1–3× what it costs on
  the development box. Nobody has run it there. T-902 measures it, and §5.1's
  fallback exists because of it.
- That awake-debris population over the first 90 seconds of *other* cities
  resembles Chicago's. Brooklyn (39,984 blocks) and Cambridge (72,943) are
  heavier and were not measured at 90 s. T-901 measures the two extremes before
  any board goes live; a city whose 90-second replay busts the budget is simply
  not offered as a ranked city until it does.
- That the RLE encoding compresses a human 90-second trace to 1–4 KB. That figure
  is carried over from `online-flywheel` [03 §2.3](../online-flywheel/03-technical-design.md)
  and has never been measured against real human input.
- Cross-engine float agreement (§3.3) — unproven in either direction.
