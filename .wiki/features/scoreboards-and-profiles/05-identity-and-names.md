# Scoreboards & Profiles — Identity and Names

> [Objective overview](00-objective-overview.md) · [Requirements](02-requirements.md) ·
> [Technical design](03-technical-design.md) · [Privacy & moderation](06-privacy-and-moderation.md)

The owner's decision: **"just pick a name."** No email, no password, no sign-in
wall. The first time a player earns a place, they are asked for a name and they
are on the board.

This doc resolves the tension that creates: anonymous naming plus strong
verification, with nothing stopping a second player from typing a name already on
the board.

---

## 1. Why the tension is smaller than it looks

**Verification concerns the run, not the person.**
[04-anti-cheat.md](04-anti-cheat.md) proves a score by re-simulating the inputs
that produced it. Nothing in that chain asks who the player is. A score is
trustworthy because it was recomputed, not because someone signed in. So the
identity system does not have to carry any of the anti-cheat weight — which is
exactly what makes a no-account model affordable here and would not be true of a
design that trusted the client.

What identity has to do is narrower and entirely solvable: **make sure a name on
the board keeps belonging to the person who claimed it.** That is a question about
possession, not about proving who someone is in the world. And possession has a
cheap, standard answer that involves no sign-in: a secret the device holds.

---

## 2. The model

**One rung. A name, and a token the browser holds.**

- **Before a name exists** the player is fully anonymous, plays every city, keeps
  every local record, and makes no network call at all. A player can stay here
  forever and lose nothing they ever had. This is the game as it ships today.
- **A name is asked for exactly once**, at the moment it becomes useful: the
  player finishes a ranked run that would place on a board. Not at boot, not on
  the title screen, not before a first run. Nothing competitive is withheld to
  force the claim, because there is nothing to withhold — a run that places
  without a name is held in the outbox and submitted the instant one is typed.
- **On claim, the server mints a player token** — 32 random bytes, base64url —
  and returns it once. The browser stores it. Every later submission carries it.
  The server stores only a hash and can never return the token again.

The token is minted **server-side, not client-side.** This is deliberate: it
removes any dependence on the quality of a browser's `crypto` implementation, it
makes the token unguessable by construction, and it means the client never has to
be trusted with the one secret in the system.

### 2.1 Storage

| Key | Contents | Why here |
|---|---|---|
| `localStorage['fw-player']` | `{ player_id, token }` | **Separate from the save, on purpose.** [`online-flywheel/12-migration-plan.md`](../online-flywheel/12-migration-plan.md) §1.3 already rules that no auth token may live in `hole-city-save`, and it is right: the save is quarantined on corruption, exported for a data request, and hand-edited by curious players. A bearer secret must not be in any of those paths. |
| `hole-city-save` → `player: { id, name, claimedAt }` | Public facts only | So the HUD and the title screen can render a name offline with no network call, and so the name survives a `fw-player` read failure as a *display* value even though the ability to submit does not. |

Both are set in the same transaction on the client. If `fw-player` is missing but
`save.player.id` is present, the player is in the **"name shown, cannot submit"**
state, which is a real state and is handled in §5.

---

## 3. Claiming a name

### 3.1 What the player sees

After a ranked run that would place, the results screen shows the score, then one
panel:

> **YOU MADE THE BOARD**
> #4 in Chicago
> `[ what should we call you?        ]`
> **[ PUT ME ON THE BOARD ]**   *not now*

One field. One button. No second screen, no confirmation, no email. "Not now" is
the same size and weight as the button and does not nag: it is offered once per
device and then only from the profile screen.

Below the field, one line, shown at claim time and never again:

> This name lives in this browser. If you clear your browser you will need a new
> one, and your records stay on the board under the old name. Moving to a new
> phone? Get a transfer code from your profile first.

That line is the honest cost of the owner's decision and it belongs at the moment
of the decision, not in a FAQ nobody reads. It is the only place the model's
limitation is stated, and it must not be softened.

### 3.2 Constraints on the name

Inherited from [`online-flywheel/09-threat-model.md`](../online-flywheel/09-threat-model.md)
§6.1, which got this right:

- **3 to 16 characters.**
- Charset `[A-Za-z0-9 _-]` only. No leading or trailing space, no repeated
  spaces.
- **NFKC-normalised** before anything else.
- **Confusables folded before the uniqueness check** (Cyrillic а → Latin a, and
  the rest of the Unicode confusables set), so `NIСO` with a Cyrillic С cannot
  sit next to `NICO`.
- Checked against a blocklist, leet-folded (`4→a`, `1→i`, `0→o`, `3→e`, `5→s`)
  and punctuation-stripped before matching. Contents and sourcing in
  [06-privacy-and-moderation.md](06-privacy-and-moderation.md) §3.
- Checked against a reserved list: `admin`, `moderator`, `official`, `staff`,
  `support`, `system`, `flywheel`, `sprocket`, plus anything the owner adds.

All of it is enforced **server-side, in the claim function**. The client repeats
the length and charset checks for immediate feedback and is never the authority.

### 3.3 Uniqueness and collision

**Names are unique, case-insensitively and confusable-insensitively, and they are
first-come first-served.** The uniqueness key is the folded form; the display form
is what the player typed.

When a name is taken, the panel says so and offers a way through in the same
breath — never a bare error:

> **SPROCKET** is taken.
> Try: **SPROCKET7** · **SPROCKETX** · **THESPROCKET**

Suggestions are generated server-side by appending a discriminator and by
substituting from a small suffix pool, checked for availability before being
offered, so every suggestion shown is one that will work. This is the release
valve the overview names: single names are pleasant at hundreds of players and
ugly at tens of thousands, and the suffix path has to exist from day one or it
gets bolted on during the first weekend the game gets attention.

**No sign-in is ever offered here.** "That name is taken" is not a hint that an
account exists; it does not say who holds it, when they claimed it, or whether
they are still playing. That matters — a "name is taken, sign in to recover"
affordance is precisely the wall the owner ruled out, and it is also an
enumeration oracle.

### 3.4 Rate limiting

Three claims per IP per day, and one per player token ever (a rename is a
different operation, §4.2). A claim that fails validation does not consume the
budget; a claim that succeeds does. This is the only defence against someone
sitting down and reserving every good name, and it is deliberately blunt because
there is no identity to hang anything smarter on.

---

## 4. The three cases the owner asked about

### 4.1 A cleared browser

**The name is not recoverable, and we say so up front.**

The token was the only proof of possession and it is gone. There is no email to
send a reset to, no password to remember, and no support path that can restore
it — anything that could would be an account-takeover primitive, because a
"support" path with no identity to check against is just an unauthenticated name
transfer.

What actually happens:

- The player's rows stay on the board, under the old name, with their scores
  intact. Nothing is deleted and no board position is disturbed. From every other
  player's point of view nothing happened.
- The player is now anonymous again and can claim a new name. The old one stays
  taken until it ages out (§4.4).
- If `hole-city-save` survived but `fw-player` did not (possible: different
  eviction paths, a partial clear, a storage quota eviction), the title screen
  shows the name greyed with a one-line explanation and a **CLAIM A NEW NAME**
  action. It does not silently pretend to be signed in and then fail on submit.

This is the real cost of "just pick a name" and it is not engineered away in this
package. It is stated at claim time (§3.1), stated again on the profile screen,
and mitigated only by making the transfer code easy to find *before* it is
needed.

### 4.2 A second device

**A transfer code moves the name. It is a handoff of a capability we already
have, not a login system.**

On the profile screen, **PLAY ON ANOTHER DEVICE** reveals:

- A six-character code from the same unambiguous alphabet the arena already uses
  (`js/net/arena.js`'s `ROOM_CODE_ALPHABET`, which excludes `O/0/I/1` — reuse it,
  do not mint a second one), plus the same code as a link and a QR block for a
  phone.
- **Single use. Ten minutes.** Displayed with a live countdown so the expiry is
  never a surprise.

On the new device, the player enters the code once. The server:

1. Validates the code, marks it redeemed, and **mints a new token**.
2. Returns the new token to the new device.
3. **Revokes the old token.** The name lives on exactly one device at a time.

That last step is the design decision worth arguing about, and the argument is:
a bearer token with no identity behind it cannot be safely shared, because there
is no way to tell a second holder from a thief. Single-device-at-a-time is the
only rule that stays true. The old device shows "this name moved to another
device" and offers to claim a new one, which is honest and recoverable, whereas
two devices quietly racing each other's board rows is not.

**Rename** uses the same machinery: one rename per 30 days, the board rows follow
the player id (not the name string), and the old name is held for 30 days before
returning to the pool so a rename cannot be used to snipe.

### 4.3 A name collision — two people, one name

Covered by §3.3: it cannot happen, because the second person is refused at claim
time and handed working alternatives. There is no state in the system where two
players hold the same folded name.

The adjacent case — **someone claims a name to impersonate a known player** — is
handled by the confusable fold (so `N1CO` and `NICO` collide) and the reserved
list, and residually by the one-tap hide in
[06-privacy-and-moderation.md](06-privacy-and-moderation.md) §4. It is not fully
solvable and is not claimed to be: with no identity there is no such thing as a
name someone is entitled to.

### 4.4 Name aging

A name held by a player with **no ranked run in 12 months and no runs at all** is
released back to the pool. A name attached to real board rows is **never**
released, because releasing it would make the board's history ambiguous — the
`NICO` at #3 from last year and the new `NICO` at #40 would be visibly the same
name and invisibly different people. Board rows carry the player id and render the
name that player holds; a released-and-reclaimed name would break that.

Consequence, stated plainly: **good names run out slowly and permanently.** That
is the correct trade for board integrity, and it is why §3.3's suffix path is not
optional.

---

## 5. Profiles

A profile is a small thing here — it exists because the ask said it is needed, and
what it is needed *for* is answering "how am I doing" and "how do I keep this."

**PROFILE**, reachable from the title screen's status strip and from the results
screen.

| Section | Contents | Source |
|---|---|---|
| Name | The display name, with **CHANGE NAME** | server, cached in save |
| THE FLYWHEEL | Overall standing and points | server |
| CITY RECORDS | Per city: rank, verified score, date | server |
| YOUR HISTORY | Per city: cleared ×N, best SIZE, best time, best score, best combo — **labelled as this device's own records, not ranked** | `save.sandbox`, local only |
| PLAY ON ANOTHER DEVICE | The transfer code (§4.2) | server |
| REMOVE ME FROM THE BOARDS | The deletion path | [06](06-privacy-and-moderation.md) §5 |

The two record sections sit next to each other on purpose. It is the one screen
where the distinction between "verified and ranked" and "yours and local" is
visible side by side, which is the cheapest possible way to teach it.

**Offline, the profile still renders** — the local half in full, the server half
from the last cached copy with a quiet "last updated" line. It never shows a
spinner and never shows an error page.

---

## 6. What this model gives up, honestly

Four things, so nobody discovers them as surprises:

1. **A lost browser is a lost name.** §4.1. No recovery exists and none can
   without an account.
2. **One device at a time.** §4.2. Two phones cannot both be logged in, because
   there is no "logged in" — there is a token, and a token has one holder.
3. **Names are permanent squats.** §4.4. First-come-first-served plus never
   recycling a name with history means the good short names go and stay gone.
4. **We cannot tell you who anyone is.** No email means no way to contact a
   player about anything — not a moderation notice, not a record broken, not a
   season ending. Every communication this feature will ever want has to happen
   inside the game or not at all.

Numbers 1 and 4 are the ones a future feature is most likely to run into. When
that day comes, the door this design leaves open is that **the player id is
stable and independent of the name** — so an optional account could later be
*attached* to an existing player without reparenting a single board row. That is
the whole reason the token is separate from the id. Nothing in this package builds
it, and doing so would supersede
[ADR-0011](../../adr/0011-guest-first-identity-deferred-claim.md) rather than
reviving it, since that ADR's rung 2 was ruled out by the owner.
