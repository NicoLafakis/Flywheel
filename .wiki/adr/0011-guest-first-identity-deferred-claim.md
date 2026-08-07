# ADR-0011: Guest-first identity with deferred account claim

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Nico

## Context

Flywheel is going to UNBOUND on a booth, in front of HubSpot partners, with
accounts, leaderboards, belts, and a live shared arena arriving at the same time.
Two goals collide there, and the collision is the whole decision:

1. **The queue.** A person walks past a booth, sees a hole eating Brooklyn, and
   has maybe fifteen seconds of curiosity to spend. Anything between them and the
   first bite spends it. A sign-in wall — even a good one, even "just Google" —
   costs a redirect to a third-party origin over conference wifi, on a machine
   that is not theirs, before they have any reason to care. The players we lose
   there are not lost from a funnel step; they never enter the funnel and they
   never play the game. Meanwhile the person behind them in line is watching an
   empty kiosk display a login form.
2. **Lead capture is an explicit goal of the booth.** Nobody is taking a game to
   a conference for its own sake. We want first name, last name, email, and
   ideally company, and we want to be able to mail these people afterwards with
   their consent.

The naive reading is that these are in direct opposition and one has to lose. The
usual industry answer is that goal 2 wins — gate the game, capture the lead, and
accept the drop-off — because the lead is the measurable thing and the person who
walked away was never counted.

There is a third fact that makes a better answer available: **the game already
runs entirely offline.** `docs/PRD.md` §8 makes static hosting and zero server
dependency a hard requirement, and today the whole product — 100 levels, four
voxel cities, coins, shop, skins — lives in `localStorage` under save schema v13
with nothing behind it. There is no technical reason to know who someone is before
they play. The only reason to ask is that asking later feels harder to build.

There is also a fourth, less comfortable one: **the moment we have something worth
keeping is the moment after a good run, not the moment before a first one.** A
stranger asked for their email in exchange for nothing gives a bad address or
walks. The same person who just took the Sprint Strap off somebody, with their
name sitting fourth on a screen in front of a room, has an actual reason to want
that record to persist — and gives the real address.

Finally, the kiosk is a **shared machine**. Whatever identity model we choose is
going to be exercised a hundred times a day by a hundred different people on the
same browser profile, which rules out a few things that would otherwise be fine.

## Decision

**Play first. Claim after. Consent at the claim.**

Identity is a three-rung ladder, and every rung is a complete, non-degraded state
of the product. Full behavioural detail lives in
`../features/online-flywheel/05-identity-and-accounts.md`; the load-bearing
commitments are:

- **Rung 0 — anonymous.** No network call. The game as it ships today, on
  `localStorage` v13. A player can stop here forever and lose nothing they ever had.

- **Rung 1 — a handle.** Typed at the first moment a name is genuinely needed
  (entering the arena, or touching a board), 3–16 characters, no email, no
  password, no verification. Backed by a Supabase **anonymous auth user** and a
  `profiles` row with `is_guest = true`. **This rung is competitively complete:** a
  guest can enter arenas, appear on all four board scopes, unlock achievements, and
  hold championships. A guest can be the UNBOUND Heavyweight Champion. The only
  things a guest lacks are portability to another device and the possibility of
  being contacted.

- **Rung 2 — a claimed account.** Three paths, all landing on the same profile:
  **email OTP** (name / email / optional company, a six-digit code rather than a
  magic link so the running tab is never abandoned), **Google** via Supabase's
  native provider, and **HubSpot** via a custom authorization-code flow through two
  Edge Functions, since Supabase has no HubSpot provider. HubSpot returns a
  verified email and a portal id, and the Edge Function converts that into an
  ordinary Supabase session on the *existing* user via an admin-generated one-time
  token. The HubSpot path ships behind a flag with an email-OTP fallback that
  captures the same lead one round trip later.

- **The claim is retroactive by construction.** Claiming mutates the profile that
  already holds the player's runs; it never creates a second identity and reparents
  history. The profile id is stable from the instant the handle is typed, so every
  foreign key from runs, belt reigns, and achievement unlocks is stable too.

- **Consent happens at the claim, and only there.** Two separate, never-pre-ticked
  checkboxes — leaderboard visibility and marketing contact — recorded as an
  append-only ledger with source and policy version. An OAuth sign-in is not
  marketing consent. An unverified email address is never stored. "Not now" is the
  same size and weight as "Claim my runs". Nothing competitive is ever withheld to
  force a claim.

- **On a kiosk, the claim moves off the kiosk.** Kiosk mode (`?kiosk=<event-tag>`)
  holds the Supabase session in memory only, mints a fresh `device_id` on every
  NEXT PLAYER reset, and hides the OAuth buttons — because signing into Google on a
  shared browser leaves a cookie on an origin we cannot clear, and the next player
  would inherit it. Instead the results screen offers a QR code carrying a
  single-use, five-minute claim token; the player completes the claim on their own
  phone, on their own connection, in their own browser, with all three paths safely
  available. The kiosk watches a Realtime channel, confirms, and rolls to the next
  player.

## Consequences

**What gets better.**

The booth queue never stops. Time from walking up to eating a building is
unchanged from the offline game: zero network calls, zero forms. The competitive
layer — the thing that actually makes a booth game worth standing at — is available
to everyone in the room without an account, which means the boards fill up and the
belts change hands, which is what makes the next person want to play. The leads we
do capture are captured after the player has a reason to want them kept, which is
the condition under which people type their real address. And the offline
invariant from `docs/PRD.md` §8 survives intact rather than being quietly traded
away: the cloud is a mirror on top of `localStorage` v13, never a prerequisite.

**What gets worse, honestly.**

- **Orphaned guest runs are now a permanent, designed-in category.** Most booth
  players will not climb to rung 2. Their profiles sit server-side holding real
  board positions under handles nobody can ever sign into again. We purge them at
  90 days of inactivity, but during the show the board will contain scores set by
  people we cannot identify and cannot mail. That is the price of the queue moving,
  and it is the right price, but it means **"players on the board" and "leads
  captured" are two different numbers and the first will be much larger.** Anyone
  measuring this feature needs to be told that in advance rather than discovering
  it on day two.

- **The merge is real complexity and it is not optional.** A guest who played
  earlier at another kiosk and now claims with an email that already belongs to a
  profile is the common case, not the edge case, and it forces a genuine merge
  path: runs appended, achievements unioned, coins taken as `max` rather than
  summed so a merge is never a currency exploit, belt reigns transferred with their
  original `won_at` intact so the lineage does not get rewritten, and the discarded
  profile soft-deleted behind a `merged_into` pointer. Every one of those rules is
  a place a bug can hide, and the localStorage-to-cloud merge in
  `../features/online-flywheel/12-migration-plan.md` shares the machinery, so a
  defect there shows up in two places.

- **We deliberately refuse automatic account merging on email collision**, which
  means some players will hit a "that email is already on another account" wall and
  have to sign out first. That is worse UX than merging silently and it is not
  negotiable: email-collision merging is the standard account-takeover primitive,
  and a leaderboard is exactly the kind of thing people try to steal.

- **Anonymous auth is an abuse surface.** Free, unauthenticated user creation with
  the ability to post scores is precisely what a leaderboard attacker wants. It is
  survivable only because ADR-0003's determinism lets the server replay a submitted
  seed and input trace and reject anything that did not actually happen — the guest
  rung is affordable *because* verification does not depend on identity. Rate
  limiting and the rest of that argument live in
  `../features/online-flywheel/09-threat-model.md`.

- **Two identity paths must be built and kept working, not one.** The HubSpot flow
  is bespoke OAuth in Edge Functions with an exact-match redirect URI that Vercel
  preview deployments structurally cannot satisfy, plus app-review timing we do not
  control. The fallback is therefore built first and is the default, and the flag
  must be flippable from a dashboard mid-show without a deploy. That is duplicated
  surface area for one button — accepted because a HubSpot button in front of a
  HubSpot partner is the specific reason this audience trusts the booth.

- **`display_mode` becomes a cross-cutting rendering rule.** Because guests are on
  the boards, and because names on a public conference screen are a deliberate
  choice, every surface that renders a player — board rows, belt lineages, the
  arena, the Titantron — has to resolve the current display mode with no cached
  copies anywhere. One missed call site publishes a full name somebody opted down
  from. It is enforced at the data layer via a `public_profiles` view that simply
  does not select `email`, rather than by remembering.

**What we are now committed to.**

Guests are first-class forever. Any future feature that gates a mechanic behind a
sign-in reintroduces exactly the wall this ADR removed, and would need to supersede
it rather than carve out an exception.

## Alternatives Considered

- **Sign-in wall before play (the conventional booth funnel).** Rejected: it trades
  the queue for the lead, and at a booth the queue *is* the lead — an empty kiosk
  captures nothing. It also breaks the offline invariant in `docs/PRD.md` §8 for a
  game that has never needed a server to run.

- **Purely local play, submit-to-leaderboard-only-if-signed-in.** Rejected: it
  moves the wall rather than removing it, and it puts the wall at the single worst
  moment — the instant after a good run, when the player is being told that the
  thing they just did does not count. A guest who cannot appear on the board has no
  reason to care about the board, which drains the boards, the belts, and the
  arena all at once.

- **Device-only identity, no accounts at all.** Rejected: it satisfies goal 1
  perfectly and goal 2 not at all, and on a shared kiosk a device identity is
  worthless within minutes. It also gives players no way to keep anything.

- **Email-only, no OAuth.** Genuinely tempting — it is far less code and OTP alone
  captures the lead. Rejected on audience grounds: "Sign in with HubSpot" in front
  of HubSpot partners is a trust signal that a form is not, and Google is a
  measurable amount of typing saved on a kiosk keyboard. Kept as the fallback for
  both, which is why the fallback is built first.

- **OAuth on the kiosk itself.** Rejected on a fact we cannot engineer around: a
  Google session established in a shared browser leaves a cookie on Google's
  origin, which our reset cannot clear, so the next player could be silently signed
  in as the previous one. The QR handoff to the player's own phone is not a
  workaround for that — it is a better flow anyway, because it verifies the lead on
  a device we know is theirs and it stops the claim from blocking the kiosk.

- **Magic links instead of OTP codes.** Rejected: a magic link opens a new tab. On
  a kiosk that strands the game behind the mail client; on a phone it may open a
  different browser than the one holding the session. A six-digit code is typed
  back into the running game and nothing is lost.

## Related

- 0002 sim/render split — the pure sim that makes headless replay possible
- 0003 deterministic seeded generation — the anti-cheat foundation that makes
  first-class guest identity affordable
- 0005 shared brand layer — the `.fw-*` primitives the claim and belt surfaces
  consume rather than reimplement
- `../features/online-flywheel/05-identity-and-accounts.md` — the full identity design
- `../features/online-flywheel/06-belts-and-achievements.md` — what a guest can hold
- `../features/online-flywheel/09-threat-model.md` — abuse of anonymous auth and boards
- `../features/online-flywheel/12-migration-plan.md` — the localStorage v13 merge
