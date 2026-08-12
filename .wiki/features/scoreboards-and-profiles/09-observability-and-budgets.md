# Scoreboards & Profiles — Observability and Budgets

> [Objective overview](00-objective-overview.md) · [Technical design](03-technical-design.md) ·
> [Anti-cheat](04-anti-cheat.md) · [Threat model](07-threat-model.md)

How we see a problem, and the numbers this feature is not allowed to exceed.

**No new observability SaaS.** Sentry, LogRocket, Datadog, New Relic and their
kind are permanently banned in this codebase's house rules; the 2026-05-18 Sentry
install boot-killed every deploy. The tooling is **Vercel runtime logs +
Supabase logs + honest UI states**, and that is sufficient here because the whole
system is six endpoints and two views.

---

## 1. What gets logged

**One structured line per verification**, from the Vercel Function:

```
fw.verify run=<uuid> scene=chicago mode=run90 tune=ranked-v1 sim=3
          ticks=5400 verdict=verified score=12480 replay_ms=31240
          build=a1b2c3d cold=false
```

**One line per rejected write**, carrying the error `code` and nothing else about
the request. Never the name, never the token, never the payload.

**Nothing at all from the browser.** No telemetry endpoint, no beacon, no error
reporting. If a client-side bug needs diagnosing, it is diagnosed the way every
other bug in this repo is: reproduce it in a browser.

**What is never logged, and this is a rule not a preference:** the bearer token,
`token_hash`, the raw trace payload, an IP address, a user agent, or a name in any
line that is not a moderation audit row. The name appears in exactly one log: the
operator audit trail in [06](06-privacy-and-moderation.md) §4.

Vercel retains runtime logs for **1 hour on Hobby and 1 day on Pro**, which is
short enough that anything wanted for longer has to be a database row. Hence §2.

---

## 2. The health signal

**A weekly histogram of `runs.verdict` is the single most informative thing in
this system.** It is a SQL query, not a dashboard:

```sql
select verdict, count(*), avg((verdict_detail->>'replay_ms')::int)
  from runs where created_at > now() - interval '7 days'
 group by verdict order by 2 desc;
```

Read it like this:

| Signal | What it means | Action |
|---|---|---|
| `mismatch` rising | **Our bug before their cheat.** A cheat is rare and lumpy; a determinism regression is broad and sudden. | Check whether a sim change landed. Pull a `verdict_detail` divergence tick and reproduce it in `board-selftest.mjs`. |
| `unverifiable` rising | A build shipped without bumping `sim_version`, or with it bumped when it should not have been | Check the deploy. |
| `flagged` rising | Either a bot arrived or a heuristic threshold is wrong | Look at the traces before touching the thresholds. |
| `pending` not draining | The verify queue is stuck or the CPU allowance is exhausted | §4. |
| `unranked` fraction falling | The placement gate is letting more through than expected — a cost problem forming | Tighten the gate before the allowance runs out. |

**A `mismatch` rate above ~1% is treated as a defect in this system, not as
evidence of cheating.** That posture is deliberate: PolyTrack shipped
*"valid replays being marked invalid"* on a determinism-verified leaderboard, and
the cost of getting this backwards — accusing honest players — is far higher than
the cost of an unranked cheat.

---

## 3. What the player sees, which is also observability

The UI states are the user-facing half of the same signal, and there are exactly
three plus one:

- **verified** — a rank.
- **verifying** — a chip. Resolves or ages out into "saved".
- **pending submission** — "will submit when online".
- **saved, not ranked** — for an offline run, a rate-limited ticket, or an
  `unranked` verdict.

There is no fifth state, no error state, and no modal. A player never sees the
word `mismatch`, never sees a stack, and is never told a number was rejected —
because we cannot distinguish their cheat from our bug, and the row already
carries that ambiguity honestly ([03](03-technical-design.md) §3.2).

---

## 4. Budgets

### 4.1 The binding one — CPU

| | Hobby | Pro |
|---|---|---|
| Included Active CPU | **4 CPU-hours / month** | higher; confirm on the plan page |
| Per-invocation max duration | 300 s | up to 800 s |
| Memory / vCPU | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU |

At the measured ~33 s per 90-second Chicago replay, **4 CPU-hours is about 436
verifications a month.** That is the number that shapes the design:

- The placement gate ([04](04-anti-cheat.md) §5.5) means most submissions never
  become a replay.
- 20 executed replays per player per hour is the hard per-player ceiling.
- **Alert at 500 executed replays in an hour** — a soft signal, not a block,
  because a genuinely popular week and an attack look the same at first and only
  one of them should be throttled.
- If the projection exceeds the allowance two months running, the mode drops to 60
  seconds (≈5× cheaper) before anything else is changed.

Which plan this project is on is unconfirmed and is a blocking item
([03](03-technical-design.md) §5). Hobby is also non-commercial-only.

### 4.2 Latency

| Path | Target (p95) | If exceeded |
|---|---|---|
| `POST /api/run/start` | 300 ms | The run starts anyway; the ticket arrives or it does not. |
| `POST /api/run/submit` | 500 ms | It returns before verification; if this is slow, the write path is slow, not the replay. |
| Board read (cache hit) | 0 ms | — |
| Board read (network) | 400 ms | Cached copy renders; "as of" line appears. |
| Verification end to end | 60 s | The chip ages out to "saved"; the rank appears on the next board read. |
| **Every call** | **timeout defined** | 4 s reads, 10 s writes. **A call with no timeout is a review-blocking defect.** |

### 4.3 Storage

| | Estimate |
|---|---|
| Trace, per ranked run | 1–4 KB (**unmeasured** — T-903) |
| 10,000 ranked runs | tens of MB |
| Everything else | negligible |

Supabase Pro's 8 GB is not a constraint at this scale. Retention (180 days for
verified traces) is set by the **ghost-replay product goal**, not by storage
pressure ([04](04-anti-cheat.md) §8).

### 4.4 Client

| | Budget |
|---|---|
| New JS shipped to the browser | **< 25 KB uncompressed, total, across `js/board/**` + `js/ui/boards.js` + `js/replay.js` + `js/fwmath.js`** |
| New runtime dependencies | **zero.** No SDK, no CDN import, no vendored bytes. Plain `fetch`. |
| Added boot cost | **zero.** `js/board/**` is dynamically imported on first use, never at boot, the same lazy-singleton pattern `js/net/client.js` already uses. |
| Frame-time cost of trace recording | Two `int8` writes into a preallocated array, no allocation, no branch. Must not appear in a profile. |

That last row is the one to hold the line on. The recording line lives inside
`main.js`'s fixed-step loop, and this feature does not get to make the hot loop
slower.

### 4.5 Cost in money

**$0.** Supabase and Vercel are already paid for and already sanctioned. No paid
third-party service is introduced. The name blocklist is a vendored MIT JSON file.
Turnstile, if it is ever needed, is a free tier
([07](07-threat-model.md) §3.5) — and it would be the first hosted third party any
player data touches, so it gets a decision of its own if that day comes.

---

## 5. What we will not be able to see

Stated so nobody plans around a capability that does not exist:

- **We cannot tell how many people saw a board**, because there is no client
  analytics and there will not be. PostgREST request counts in the Supabase
  dashboard are the only proxy.
- **We cannot tell why a player stopped**, for the same reason.
- **We cannot contact anyone** ([06](06-privacy-and-moderation.md) §6). Every
  message goes to a returning player inside the game, or nowhere.
- **We cannot distinguish a bot from a very good player** from any signal in this
  system ([04](04-anti-cheat.md) §6). The heuristics narrow it; nothing closes it.
