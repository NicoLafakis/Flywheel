# ADR-0017: A name is owned by a device-held bearer token; there are no accounts

- **Status:** accepted
- **Date:** 2026-08-12
- **Deciders:** Nico, Kimi
- **Context package:** [.wiki/features/scoreboards-and-profiles/](../00-objective-overview.md)

## Context

The owner's decision is four words: **"just pick a name."** No email, no
password, no sign-in wall. The first time a player earns a place on a board,
they are asked for a name, and they are on the board. Everything in this ADR is
that sentence, defended.

The sentence is affordable because identity carries none of the anti-cheat
weight. [ADR-0016](0016-bounded-ranked-run.md) proves a score by re-simulating
the inputs that produced it, and nothing in that chain asks who the player is.
A score is trustworthy because it was recomputed, not because somebody signed
in. What identity has to do is narrower and entirely solvable: **make sure a
name on the board keeps belonging to the person who claimed it.** That is a
question about possession, not about proving who someone is in the world — and
possession has a cheap, standard answer that involves no sign-in: a secret the
device holds.

What came before is
[ADR-0011](../../../adr/0011-guest-first-identity-deferred-claim.md)'s three-rung
ladder: anonymous play, then a handle backed by Supabase anonymous auth, then a
claimed account via email OTP, Google or HubSpot, with a consent ledger and a
kiosk claim handoff. That ladder was designed for the UNBOUND booth, where lead
capture was an explicit goal of the event. Both halves of that motivation are
gone: the owner has ruled accounts out, and the booth plan they served is no
longer the product being built. The rungs above anonymous play are machinery
for a goal that no longer exists — and rung 1's machinery, an auth SDK in the
browser, now cuts against
[ADR-0014](../../../adr/0014-vendored-same-origin-runtime.md): `js/net/client.js`
vendors Realtime only, a CDN import fails the offline-boot validator by design,
and vendoring an auth client is hundreds of kilobytes to do badly what a random
string does well.

## Decision

**Identity is one rung: a display name, claimed in a single field at the moment
a run earns a board place, owned by a bearer token the server mints and the
device holds. There is no account, no email, no password, and no sign-in
surface anywhere in the game.**

1. **Anonymous until a name is earned.** Before a name exists the player makes
   no network call at all, plays every city, and keeps every local record —
   the game as it ships today, and a state a player can stay in forever and
   lose nothing they ever had. The name is asked for exactly once: when a
   ranked run would place. Never at boot, never before a first run, and nothing
   competitive is withheld to force it — a run that places without a name waits
   in the outbox and is submitted the instant one is typed.

2. **The token is minted server-side and stored as a hash.** On claim the
   server mints 32 random bytes (base64url), returns the token exactly once,
   and stores only its SHA-256 hash (`players.token_hash`). Every later
   submission carries the token. Server-side minting is deliberate: it removes
   any dependence on the quality of a browser's `crypto` implementation, makes
   the token unguessable by construction, and means the client is never trusted
   to produce the one secret in the system. The `players` table is the entire
   identity system — no email column, no password hash, no auth-provider
   column, no `auth.users` foreign key
   ([03-technical-design.md](../03-technical-design.md) §3.1).

3. **The token lives outside the save.** `localStorage['fw-player']` holds
   `{ player_id, token }`; the save holds only the public facts
   (`player: { id, name, claimedAt }`), so the title screen can render a name
   offline with no network call. The separation is on purpose and predates this
   package
   ([`online-flywheel/12-migration-plan.md`](../../../features/online-flywheel/12-migration-plan.md)
   §1.3): the save is quarantined on corruption, exported for data requests,
   and hand-edited by curious players, and a bearer secret belongs in none of
   those paths. Board rows point at the stable player id, never at the name
   string.

4. **Names are first-come first-served on a folded key.** Uniqueness is
   case-insensitive and confusable-insensitive — NFKC, default-ignorables
   stripped, UTS-39 confusable skeleton, casefolded — so `NICO`, `ｎｉｃｏ`,
   `NIСO` (Cyrillic С) and `ni​co` (zero-width) are one name. The display form
   is what the player typed. The constraints (3–16 characters, charset
   `[A-Za-z0-9 _-]`, the blocklist, the reserved list) are enforced server-side
   in the claim function; the client repeats the length and charset checks for
   feedback and is never the authority. A taken name is refused with at least
   three alternatives that have been checked available before being offered —
   the discriminator suffix is the release valve that keeps single names
   livable as the player count grows, and it exists from day one rather than
   being bolted on during the first busy weekend. The refusal never says who
   holds the name and never offers a sign-in: "that name is taken" is not a
   hint that an account exists, and a "sign in to recover" affordance is both
   the wall the owner ruled out and an enumeration oracle.

5. **A lost browser is a lost name, and we say so at claim time.** The token is
   the only proof of possession; when it is gone there is no recovery, because
   any path that could restore a name with no identity to check against is an
   unauthenticated name transfer — an account-takeover primitive, not a support
   feature. The player's rows stay on the board under the old name, with their
   scores intact; the player is anonymous again and claims a new one. The claim
   panel states this in one unsoftened line at the moment of the decision, not
   in a FAQ nobody reads.

6. **Moving devices is a handoff, not a login.** The profile mints a
   six-character transfer code from the same unambiguous alphabet the arena
   already uses (`js/net/arena.js`'s `ROOM_CODE_ALPHABET` — reused, not a
   second alphabet), single-use, ten-minute expiry. Redeeming it mints a new
   token, increments `token_version`, and revokes the old device: **a name
   lives on exactly one device at a time**, because a bearer token with no
   identity behind it cannot tell a second holder from a thief, and two devices
   quietly racing each other's board rows is the only alternative. Rename rides
   the same machinery — one per 30 days, the board rows follow the player id,
   and the old name is held for 30 days before returning to the pool, so a
   rename cannot be used to snipe.

7. **Names with history are never recycled.** A name is released only when the
   player has had no ranked run in 12 months and no runs at all. A name
   attached to board rows is never released: rows render the name their player
   id holds, and a recycled name would make the board's history ambiguous — the
   old `NICO` at #3 and the new one at #40 visibly the same name, invisibly
   different people. The consequence, stated plainly, is that good names run
   out slowly and permanently. That is the correct trade for board integrity,
   and it is why the suffix path in item 4 is not optional.

8. **Claiming is rate-limited, bluntly.** Three claims per IP per day, one per
   player token ever (a rename is a different operation), and a claim that
   fails validation does not consume the budget. It is the only defence against
   someone sitting down and reserving every good name, and it is deliberately
   blunt because there is no identity to hang anything smarter on.

## Relationship to ADR-0011

This ADR **supersedes the upper rungs of ADR-0011's ladder**. Rung 0 —
anonymous, offline, complete — survives untouched; it is the state every player
occupies until a run places. The handle backed by Supabase anonymous auth and
the claimed account above it (email OTP, Google, HubSpot, the consent ledger,
the kiosk QR handoff) are superseded: the owner ruled accounts out, and the
lead-capture goal that motivated them went with the booth plan. (The package
PRD phrases this as "rungs 2 and 3"; ADR-0011 numbers its three rungs 0, 1 and
2, so in that ADR's own numbering the superseded rungs are 1 and 2.) What
replaces the handle rung is strictly less machinery: our own bearer token,
minted and checked by our own function, with no auth SDK in the browser at all.
Anonymous auth was an abuse surface ADR-0011's own consequences named; nothing
here reopens it.

One door is deliberately left open. The player id is stable and independent of
the name, so an optional account could later be *attached* to an existing
player without reparenting a single board row — which is the whole reason the
token is separate from the id. Nothing in this package builds that, and doing
so would supersede ADR-0011 rather than revive it.

## Consequences

**What becomes easier.** There is no sign-in surface to design, secure, or lose
players to: the claim is one field and one tap at the moment of maximum
motivation, which is the condition under which people type the name they
actually want on the board. The identity system is one table with no
credentials in it, which collapses the personal-data posture to a self-chosen
display name and a random device key — no email, no fingerprinting, no
analytics, nothing to breach but names people made up. The token being a bearer
capability rather than an account makes the transfer code a handoff of
something we already have, not a login system we had to build. And verification
and identity stay decoupled: each is cheap because the other does not depend on
it.

**What it costs, stated so nobody discovers it as a surprise**
([05-identity-and-names.md](../05-identity-and-names.md) §6). A cleared browser
is a lost name, with no recovery and no support path that could honestly offer
one. One device at a time — two phones cannot both hold a name, because there
is no "logged in", only a token with one holder. Good short names are
permanently squatted once they carry history. And we cannot contact a player
about anything — not a moderation notice, not a record broken, not a season
ending — so every communication this feature will ever want has to happen
inside the game or not at all. There is also one real degraded state to render
honestly: if `fw-player` is lost but the save survives, the title screen shows
the name greyed with a one-line explanation and a **CLAIM A NEW NAME** action,
rather than silently pretending to be signed in and failing on submit.

**What we are now committed to.** Never offering a sign-in affordance from a
name collision. The suffix path existing from day one. The single-device rule,
until a future ADR supersedes it. And the claim-time disclosure line, which is
part of this decision and must not be softened.

## Alternatives Considered

- **Keep ADR-0011's rung 2 — real accounts.** Rejected by the owner in four
  words. It is also the most code, the most personal data, and the most attack
  surface, for a game whose entire identity need is possession of a name.
- **Keep rung 1 — Supabase anonymous auth under the handle.** Rejected: it
  ships an auth SDK to the browser against ADR-0014 (a CDN import fails
  `validateOfflineBoot()` by design; vendoring is ~500 KB for two headers'
  worth of job), and anonymous auth is the abuse surface ADR-0011's own
  consequences name. A server-minted bearer checked by our own function does
  the same job with less machinery and less trust.
- **Client-minted token.** Rejected: it depends on the quality of whichever
  `crypto` implementation a browser ships, and it trusts the client to produce
  the one secret in the system.
- **One name on many devices at once.** Rejected: with no identity behind the
  token there is no way to tell a legitimate second holder from a thief, so the
  only possible outcome is two devices quietly racing each other's rows.
  Single-device is the rule that stays true, and the transfer code makes it
  cheap to live with.
- **A recovery path for lost names.** Rejected: any "support can restore it"
  flow with no identity to check against is an unauthenticated name transfer —
  the standard account-takeover primitive, gift-wrapped.
- **Discriminator-by-default handles** (`NAME#1234` for everyone). Rejected as
  the primary surface: single names are pleasant at the scale this game is
  actually at, and the suffix appears precisely where it earns its keep — as
  checked-available suggestions at a collision — which is the release valve,
  present from day one.

## Related

- [ADR-0011](../../../adr/0011-guest-first-identity-deferred-claim.md) — the
  ladder this ADR cuts to one rung.
- [ADR-0016](0016-bounded-ranked-run.md) — the companion: verification carries
  the trust weight that makes account-free identity affordable.
- [ADR-0014](../../../adr/0014-vendored-same-origin-runtime.md) — why no auth SDK
  joins the browser bundle.
- [05-identity-and-names.md](../05-identity-and-names.md) — the full design:
  claim UX, the folding rules, transfer, aging, profiles.
- [06-privacy-and-moderation.md](../06-privacy-and-moderation.md) — blocklist
  sourcing, the one-tap hide, and deletion.
- [03-technical-design.md](../03-technical-design.md) — the `players` table
  this entire system fits into, and the claim/transfer endpoints.
- [`online-flywheel/05-identity-and-accounts.md`](../../../features/online-flywheel/05-identity-and-accounts.md)
  — the superseded design, kept for its reasoning.
- [`online-flywheel/12-migration-plan.md`](../../../features/online-flywheel/12-migration-plan.md)
  — §1.3, the rule that no auth token lives in the save.
