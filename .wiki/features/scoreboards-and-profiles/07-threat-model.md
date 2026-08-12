# Scoreboards & Profiles — Threat Model

> [Objective overview](00-objective-overview.md) · [Anti-cheat](04-anti-cheat.md) ·
> [Identity](05-identity-and-names.md) · [Privacy & moderation](06-privacy-and-moderation.md) ·
> [Technical design](03-technical-design.md)

Who attacks a small game's public leaderboard, and what stops them. Structured
loosely on STRIDE but ordered by what is actually likely.

**In scope:** the client, the two Vercel Function surfaces, the PostgREST read
surface, and the name space. **Out of scope:** a compromised Supabase or Vercel, an
attacker holding `SUPABASE_SECRET_KEY` or `FW_TICKET_SECRET` (that is a key
rotation incident, not a threat to model), and anything requiring physical access
to the owner's machine.

---

## 1. Adversaries

**A. The curious player with devtools open.** Near-certain, probably within the
first week. They will look for a score field, try to POST one, and tell someone
what happened. The bar this design has to clear: **every obvious attempt bounces
immediately and there is nothing interesting to report.**

**B. The griefer.** Likely at least once. Wants an offensive name at the top of a
public board, or wants to spoil somebody else's. This is why
[06](06-privacy-and-moderation.md) §4 exists and why the report button does not
hide anyone by itself.

**C. The scripted attacker.** Lower probability, non-zero. Writes something that
plays the game. **We cannot beat this adversary on score integrity and we say so**
([04](04-anti-cheat.md) §6). We can and must beat them on availability and on
cost.

**D. The cost attacker.** The one most people forget. Does not care about the
board; wants to burn the monthly CPU allowance. On Vercel Hobby that is four
CPU-hours, and a replay is ~33 seconds, so **436 requests is the entire month.**

---

## 2. Score integrity

| # | Threat | Stopped? | Mechanism · residual |
|---|---|---|---|
| 2.1 | Forged score in a POST | **Fully** | There is no score field on any write path. `runs.claimed_score` is read only by the placement gate and never stored as a result. `anon` has no INSERT or UPDATE on any table holding a score. **Residual:** somebody adding a client-writable score column for convenience during the build. This is the single change that silently undoes the whole design and it is named in `AGENTS.md` invariant 7 for that reason. |
| 2.2 | Submitting without playing | **Fully** | The ticket is server-issued, HMAC-signed over `(run_id, seed, scene_id, mode, tune_id, player_id, issued_at)`, single-use by conditional UPDATE, and expires in 15 minutes. |
| 2.3 | Replaying a captured submission | **Fully** | Unique index on `sha256(payload)`; the second submission returns the first result. Same mechanism makes the offline outbox safe. **Residual:** a trivially perturbed trace is a different hash — bounded by best-per-player storage (a thousand variants gain only the best) and by rate limits. |
| 2.4 | Modified client physics | **Fully** | The server runs *our* `js/voxelsim.js` at *our* pinned tune. A modified client produces a trace that does not reproduce. **Residual:** version skew — handled by recording `unverifiable` rather than rejecting, because a false accusation costs more than an unranked run. |
| 2.5 | Choosing a favourable seed | **Fully** | The seed is minted server-side inside the signed ticket. This also closes the grind-offline-submit-the-lucky-one attack that AntGame's design specifically rate-limits against. |
| 2.6 | Time manipulation | **Fully, for the score** | The trace is tick-indexed and the mode's tick count is exact. There is no wall-clock quantity in the score. **Residual:** slow-motion play is undetectable and mildly advantageous, and the elapsed-time check is soft in the slow direction *by design* because `maxSubSteps: 2` means a struggling phone legitimately lags the wall clock. |
| 2.7 | Backdating or rescoping | **Fully** | `created_at` / `verified_at` are server clock and not client-writable. |
| 2.8 | **Hand-crafted valid trace (a bot)** | **No — the acknowledged hole** | Replay reproduces it because it really happened; a machine did it. Heuristics (input entropy, direction-reversal rate, zero-input fraction, sub-tick timing patterns) **flag** into `review_state`, never reject. Thresholds server-side only. This is the same residual every replay-verified game carries; TETR.IO needed handcam forensics to close a real case, and Trackmania's community eventually required hardware input attestation. |
| 2.9 | Cross-engine float divergence causing false rejection | **Mitigated, not closed** | Ten `Math.*` call sites audited ([04](04-anti-cheat.md) §3A.2); the fix is specified and gated as T-102. Until it lands, a comparison tolerance absorbs last-bit drift and unreproducible runs are `unverifiable`, never `rejected`. **This threat's victim is an honest player on Safari, not an attacker** — which is why it is in the must-fix list. |
| 2.10 | Editing `localStorage` | **Fully** | Local records are never ranked. The plaintext save has no path to a board. This was the easiest attack in `online-flywheel`'s entire model and it is closed by the migration decision in [11](11-migration-plan.md) §3 rather than by a check. |

---

## 3. Identity and the name space

| # | Threat | Stopped? | Mechanism · residual |
|---|---|---|---|
| 3.1 | Claiming a name someone already has | **Fully** | Unique on the folded key. Refused with working alternatives. |
| 3.2 | Impersonation via a lookalike name | **Mostly** | UTS-39 skeleton folding plus default-ignorable stripping means `NIСO` (Cyrillic), `ｎｉｃｏ` (fullwidth) and `ni​co` (zero-width) all collide. **Residual:** `NICO_` and `NIC0LAS` are genuinely different names and always will be. With no identity, there is no name anyone is *entitled* to. Falls back to [06](06-privacy-and-moderation.md) §4. |
| 3.3 | Stealing another player's token | **Fully, over the wire** | The token is returned once over TLS and stored hashed. **Residual:** anyone with access to the browser — a shared computer, a borrowed phone — *is* the player, by construction. There is no second factor and none is possible without an account. |
| 3.4 | Hijacking a transfer code | **Mostly** | Single use, ten minutes, live countdown. **Residual:** a code shown on screen can be photographed by someone standing there. Ten minutes and single use bound the window; it cannot be closed further without a second channel we do not have. |
| 3.5 | Mass-squatting good names | **Bounded** | 3 claims per IP per day, one name per token. **Residual:** a determined squatter with many IPs wins slowly. The escalation lever is Cloudflare Turnstile on the claim endpoint — free tier, unlimited challenges, no CDN routing required — held in reserve rather than shipped, because it is friction on the one interaction this feature most needs to be frictionless. |
| 3.6 | Enumerating who exists | **Bounded** | "That name is taken" is the only signal, and it is unavoidable for a unique-name system. It reveals nothing beyond the name itself, which is public on the board anyway. Deliberately **no** sign-in affordance next to it, which would turn it into an account oracle. |
| 3.7 | Offensive or impersonating display name | **Layered** | [06](06-privacy-and-moderation.md) §3. Layers 1–5 will miss something; layer 6 (one-tap force-rename, 60 s, rehearsed) is the one that matters. |

---

## 4. Availability, cost, and abuse

| # | Threat | Stopped? | Mechanism · residual |
|---|---|---|---|
| 4.1 | **Denial of wallet — burning the CPU allowance** | **Bounded, and this is the highest-severity operational risk** | Three independent gates: rate limits on **ticket issuance** as well as submission ([04](04-anti-cheat.md) §7); the placement gate, which means most submissions are never re-simulated at all; and a hard ceiling of 20 executed replays per player per hour. Plus an alert at 500 global replays/hour. **Residual:** a distributed attacker with many device keys can still consume the allowance. The response is the kill switch (§5), not a cleverer limit. |
| 4.2 | Submission flooding | **Bounded** | Rate limits counted in Postgres, not function memory — an in-memory counter across non-shared serverless instances is a limit that does not exist. |
| 4.3 | Board-read flooding | **Bounded** | Reads are cached PostgREST GETs against two views. Vercel WAF rate limiting is available even on Hobby (one rule, IP-keyed) as an escalation. |
| 4.4 | Report-button abuse | **Fully, by design** | A report never hides anyone. One report per device per player per day. |
| 4.5 | The game becoming unplayable because the boards are down | **Fully** | `AGENTS.md` invariant 9. Airplane-mode boot is an acceptance criterion, not a hope. |

---

## 5. The kill switch

`board.enabled` in `js/board/config.js`, plus a server-side flag read by
`/api/run/start`. Turning it off stops ticket issuance, stops verification
spending, and leaves the game **completely playable** — every city, every local
record, every existing behaviour. The boards go read-only, then hidden.

This is the response to a cost attack, a moderation incident bigger than one
name, or any unknown. It is a config change, not a deploy, and **it is rehearsed
before the boards go public.** The one thing worth saying about it: because the
boards are additive and nothing in the shipped game depends on them, the kill
switch is genuinely safe to pull. That property was bought by invariant 9 and it
should not be traded away later for convenience.

---

## 6. Must-fix before the boards are public

1. Automated deny test: the publishable key cannot write to any table
   ([08](08-test-strategy.md) §3). A script, not a paragraph.
2. `SUPABASE_SECRET_KEY` and `FW_TICKET_SECRET` provably absent from everything
   the browser loads — a grep gate in `tools/validate.mjs`.
3. No client-writable score path, verified by reading every endpoint.
4. Ticket redemption atomic and consumed before the seed is usable.
5. The name pipeline: charset, NFKC, default-ignorables, UTS-39 skeleton,
   casefold, blocklist, reserved list.
6. One-tap force-rename and hide, working, **rehearsed and timed**.
7. Rate limits on ticket issuance, in Postgres, tested.
8. Airplane-mode boot verified on the deployed build.
9. T-102 (the deterministic math fix) landed, or the tolerance and the
   `unverifiable` path explicitly accepted with a note saying who accepted it.
10. The kill switch pulled once, in production, on purpose, and the game confirmed
    playable.

## 7. Can follow

Turnstile on name claim · a heuristic review queue UI (ship the `flagged` verdict
and the board filter first; the UI can wait) · Vercel WAF rules · per-city replay
budgets measured for cities beyond the two in T-901 · an appeals flow richer than
one line of copy.
