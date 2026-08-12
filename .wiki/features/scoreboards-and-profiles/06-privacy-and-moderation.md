# Scoreboards & Profiles — Privacy and Moderation

> [Objective overview](00-objective-overview.md) · [Identity](05-identity-and-names.md) ·
> [Threat model](07-threat-model.md) · [Technical design](03-technical-design.md)

A name typed by a player is user data on a server, and a public page carrying
user-typed strings is a moderation surface whether or not anyone planned for one.
This doc covers what is public, what happens when a name is offensive, and how a
player gets out.

---

## 1. What personal data exists

Deliberately, almost none. The complete list:

| Datum | Why it exists | Public? |
|---|---|---|
| `players.name` | The player typed it, to be shown on a board | **Yes.** That is its only purpose. |
| `players.name_key` | The folded uniqueness key | No. Never rendered. |
| `players.id` | Stable identity for board rows | Yes, as an opaque uuid |
| `players.token_hash` | Proof of device possession | No, and the token itself is never stored |
| `runs.verified_score`, `verified_at` | The board | Yes |
| `run_inputs.payload` | Verification, and later ghost replays | No |
| `device_key` (random, client-minted) | Rate-limiting a player with no name | No, and never rendered |

**There is no email, no password, no phone number, no IP log, no user agent, no
device fingerprint, no analytics, and no third-party tag.** The lawful basis for
holding a name is that the player typed it into a field whose one stated purpose,
in the label above it, is to put that name on a public board.

This is a much smaller surface than
[`online-flywheel/09-threat-model.md`](../online-flywheel/09-threat-model.md) §6.4
had to cover, and the reason is the owner's decision: no accounts means no PII.
The one rule that package got right and this one inherits — **PII lives behind a
table boundary, not a column-level view filter** — has nothing to guard here,
because there is no private column to leak. If that ever changes, restore the
boundary first.

## 2. What is publicly exposed

A board row is exactly: **rank, name, score, date.** Nothing else leaves the
server. This is enforced structurally, by the view's select list
([03](03-technical-design.md) §3.8), not by remembering — `v_city_board` and
`v_overall` are the only relations `anon` can read, and neither selects a token
hash, a device key, or a trace.

**A player is told this, once, in the claim panel**, in one line under the field:

> This name will be shown publicly on the Flywheel boards, next to your score.

That is the whole privacy notice for the common case, and it is deliberately at
the point of collection rather than behind a link. A fuller page lives at
`/privacy` and says the same thing at length, plus §5.

## 3. Offensive names

### 3.1 The posture

Six layers, and **only the last one actually matters**. Layers 1 to 5 will miss
something; the point of building them is to reduce how often layer 6 has to run,
not to replace it.

1. **Constrain the input.** 3–16 characters, `[A-Za-z0-9 _-]` only, no leading,
   trailing or repeated spaces. A charset this narrow removes emoji abuse, RTL
   override tricks, and most of the Unicode surface at zero cost.
2. **Normalise before comparing.** NFKC → strip default-ignorable characters
   (the zero-width joiner/space/non-joiner family, which are documented as being
   used specifically *"to create usernames that appear identical to existing
   ones"*) → **UTS-39 `skeleton()`** → casefold. UTS #39 defines it exactly:
   *"The strings X and Y are then defined to be confusable if and only if
   skeleton(X) = skeleton(Y)"*, which is a drop-in uniqueness key.
   (<https://www.unicode.org/reports/tr39/>, data file
   <https://www.unicode.org/Public/security/latest/confusables.txt>, v17.0.0.)
   Vendor the subset of `confusables.txt` that maps into the allowed charset; the
   full file is not needed once the charset is ASCII-bounded.
3. **Blocklist on write, server-side.** Matched against the *leet-folded*
   (`4→a`, `1→i`, `0→o`, `3→e`, `5→s`) and punctuation-stripped form, so
   `f_u_c_k` and `fu4k` fold together. Source: a vendored copy of
   **`@dsojevic/profanity-list`** (MIT), which is the right pick because it ships
   **severity ratings 1–4** and **category tags** and **documented exception
   patterns** rather than a flat list. Vendored as JSON under `js/vendor/` or
   `api/data/`, following the ADR-0014 pattern — pinned, same-origin, never
   edited, replaced wholesale — so no npm dependency is introduced.
   (<https://github.com/dsojevic/profanity-list>)
   Severity 4 auto-rejects. Severity 1–2 is allowed and flagged for review, which
   is the concession to the **Scunthorpe problem** — AOL blocked the residents of
   an English town from creating accounts in 1996 and the class of bug has not
   improved since (<https://en.wikipedia.org/wiki/Scunthorpe_problem>).
4. **Reserved terms.** `admin`, `moderator`, `official`, `staff`, `support`,
   `system`, `flywheel`, `sprocket`, matched with punctuation removed so
   `a_d_m_i_n` fails too.
5. **Report, don't auto-hide.** One tap on any board row files a report. Reports
   accumulate; **a report never hides anyone by itself**, because a report button
   that hides is a griefing weapon aimed at whoever is in first place. N distinct
   reporters raises it in the operator queue.
6. **One-tap human action.** §4.

The honest caveat, which the best available library states about itself and which
belongs in the design rather than being discovered: *"As with all swear filters,
Obscenity is not perfect (nor will it ever be). Use its output as a heuristic, and
not as the sole judge of whether some content is appropriate or not."*
(<https://github.com/jo3-l/obscenity>) The matcher here is ~30 lines over a
vendored word list rather than a dependency, for the same reason ADR-0014 gives:
one pinned data file does not need a package manager.

### 3.2 What is deliberately not built

No ML classifier, no hosted moderation API. **Perspective API is a dead end
regardless of price** — it carries a first-party notice that *"Perspective API is
sunsetting and service is officially ending after 2026."* Detoxify (Apache-2.0,
self-hostable) is a real option if the list-based layer proves insufficient, and
its authors' own warning is the reason it is not the first move: *"If words
associated with swearing … are present, it will likely be classified as toxic,
regardless of tone or intent."* On a 3–16 character ASCII name, a list plus
normalisation is the better instrument.

## 4. The operator page — the layer that matters

A static page, one route, gated on a secret held only by the owner, listing
recently claimed names and reported players. Two buttons per row.

**FORCE RENAME is the default remedy, not deletion.** This follows Xbox's
published practice, whose sanction for an inappropriate gamertag is *"Automatic
assignment of a new gamertag"* rather than removing the account
(<https://www.xbox.com/en-US/legal/community-standards>). The reasoning is exactly
right for a leaderboard: the offensive thing is the string, not the score, and
deleting the score punishes the wrong thing and also punishes everyone below them
who moves up for the wrong reason. A force-rename sets `name` to a generated
neutral name (`Sprocket 41`), sets `moderation_state = 'renamed'`, and leaves
every rank and score exactly where it was.

**HIDE** is the emergency lever: `moderation_state = 'hidden'` removes the player
from `v_city_board` and `v_overall` on the next read, because both views filter on
it. No backfill job, no cache purge, no deploy.

**The target is 60 seconds from "that is on the screen" to "it is gone", and it is
rehearsed before the boards are public, not after.** A lever nobody has pulled is
a lever nobody knows the latency of.

**Appeals.** Both Xbox and Roblox document an appeals path, and a false-positive
rename with no recourse is the worst failure mode of the whole system. At this
scale the appeal is: the game shows a renamed player one line — "your name was
changed by a moderator" — with a way to pick a new one immediately. That is the
smallest thing that is not silent, and silence is what makes moderation feel
arbitrary.

**Every operator action writes an audit row** (`who`, `what`, `when`, `why`).
Not for compliance — for the case six months from now where somebody asks why a
name changed.

## 5. Deletion

**REMOVE ME FROM THE BOARDS**, on the profile screen, one button, one
confirmation, no email required and none possible.

It does, immediately and in one transaction:

- Sets `moderation_state = 'hidden'`, so the player leaves every board on the
  next read.
- Replaces `name` with `Retired Sprocket` and clears `name_key`, releasing the
  name back to the pool.
- Deletes `token_hash`, which is the only credential and makes the action
  irreversible by construction.
- Deletes every `run_inputs.payload` for that player. The traces are the only
  behavioural data we hold.
- **Keeps the `runs` rows with their scores, unlinked and anonymous.** The reason
  is honest and should be stated on the button: deleting the scores would silently
  promote everyone below them, rewriting other players' history. What is deleted
  is the identity; what remains is an anonymous number with no way back to a
  person.

Because there is no email, **this cannot be requested by anyone but the device
holding the token** — which is a real limitation and also a real protection: there
is no support channel to social-engineer, because there is no support channel.

**Retention, absent a request:** a player with no runs and no activity for 90 days
is purged. A player with ranked runs is kept, because the board is the product.
Traces expire per [04](04-anti-cheat.md) §8.

## 6. What we cannot do, and it is worth knowing

**We cannot contact anyone about anything.** No email means no moderation notice,
no "your record was broken", no season announcement, no breach notification.
Every message this feature will ever want to send has to be delivered inside the
game to a returning player, or not at all. That is a direct consequence of the
owner's identity decision and it is the correct trade for the frictionless claim —
but any future feature that assumes it can reach a player is assuming something
that is not true.
