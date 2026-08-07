# Online Flywheel — Identity and Accounts

> [Objective overview](00-objective-overview.md) ·
> [PRD](01-prd.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design (owns the schema)](03-technical-design.md) ·
> [Threat model](09-threat-model.md) ·
> [Migration plan](12-migration-plan.md) ·
> ADR: `../../adr/0011-guest-first-identity-deferred-claim.md`

This doc owns **who a player is** and **how they become someone we can contact**.
It does not own the tables — column-level truth lives in
[03-technical-design.md](03-technical-design.md); this page states the behaviour
those tables have to support, and names each object it needs.

The organising constraint is one sentence long: **there is a line of people at a
conference booth, and a sign-in wall in front of a 90-second game empties that
line.** Every decision below falls out of refusing to put anything between a
person walking up and a hole eating a building. Lead capture is an explicit goal
of the booth, so this doc is also the honest answer to "how do we get the email
without extorting it."

---

## 1. The ladder

Three rungs. A player can stop on any of them and the game still works. Each rung
up adds something; nothing is taken away by climbing, and nothing is withheld to
force the climb.

### Rung 0 — Anonymous

The state a player is in **before touching anything**, including the very first
frame at the booth.

| What exists | Where it lives | Lifetime |
|---|---|---|
| Save schema v13 (coins, `sandbox` records, `ownedItems`, `equippedSkin`, settings) | `localStorage['hole-city-save']` | Until the browser profile is cleared |
| A `device_id` (random UUID, minted on first boot) | `localStorage['fw-device']` | Same |
| Nothing at all server-side | — | — |

What they can do: the entire single-player game, exactly as it ships today.
Cities, coins, shop, skins, settings. **No network call has been made.**

What they cannot do: appear on any board, hold any belt, enter an arena, or have
an achievement recorded anywhere but this browser.

What is lost if they never climb: nothing they ever had. This rung is the current
product, unchanged. That is deliberate — an offline-capable static game is what
`docs/PRD.md` §8 promises and the online layer is additive to it, not a
replacement (see [ADR-0011](../../adr/0011-guest-first-identity-deferred-claim.md)).

### Rung 1 — Handle (a guest identity)

Reached by typing a handle — 3–16 characters, no email, no password, no
verification — at the moment the player first does something that needs a name:
tapping **JOIN THE ARENA**, or finishing a run good enough to touch a board.

| What exists | Where it lives | Lifetime |
|---|---|---|
| A Supabase **anonymous auth user** (`signInAnonymously`) | Supabase `auth.users` | Indefinite server-side; the local session token is what expires |
| A `profiles` row: `handle`, `is_guest = true`, `device_id`, `created_at` | Supabase | Indefinite |
| Submitted `runs` rows, arena participation, earned achievements, belt reigns | Supabase | Indefinite |
| Save v13 | still `localStorage`, still the offline source of truth | — |

What they can do: **everything competitive.** Enter arenas, appear on all four
board scopes, win belts, hold reigns, unlock achievements. A guest can be the
UNBOUND Heavyweight Champion. This is not a demo tier.

What they cannot do: sign in on a second device, recover their identity after the
browser is cleared, or be contacted by anyone.

**What is lost if they never climb** — state this plainly to the player, once, at
the claim prompt, and never nag it again:

- The handle and everything under it is welded to **this browser on this
  machine**. On a booth kiosk that is minutes, not months.
- Their belts keep their reigns and stay on the board under the handle, but the
  human can never prove they are that handle again.
- No follow-up: no "your record was broken" mail, no post-conference recap, no
  way to find their own name later.

Nothing else. Guest runs are not deleted, downgraded, or asterisked. A leaderboard
that quietly discounts guests would be the sign-in wall again, wearing a costume.

### Rung 2 — Claimed account

Reached by completing any one of the three claim paths in §2. The claim is
**always retroactive** — it attaches to the guest identity that already exists
rather than creating a fresh one, so no run, belt, or achievement is orphaned by
the act of signing in.

| What exists | Where it lives |
|---|---|
| The same `auth.users` row, now carrying a verified email and one or more linked identities | Supabase |
| `profiles`: `is_guest = false`, `first_name`, `last_name`, `email`, `company` (optional), `display_mode`, consent columns | Supabase |
| Everything from rung 1, unchanged and still pointing at the same profile id | Supabase |
| A merged cloud save (see [12-migration-plan.md](12-migration-plan.md)) | Supabase + `localStorage` |

What they gain: sign-in on any device, a durable trophy room, contact (only with
consent — §5), and their real name on the board **if they choose it** (§4).

---

### Ladder invariants

These hold at every rung and are what make the ladder safe to build against:

1. **The profile id never changes.** A claim mutates a row; it never inserts a
   second identity and reparents. Foreign keys from `runs`, `belt_reigns`, and
   `achievement_unlocks` are stable from the instant the handle is typed.
2. **`localStorage` v13 stays authoritative offline.** The cloud is a mirror plus
   the things only a server can know (other people's scores). A player with no
   network still plays, still earns coins, still keeps their skins.
3. **No rung is a paywall for a mechanic.** The only things gated on rung 1 are
   things that are meaningless alone (a board, an arena). Nothing is gated on
   rung 2 at all except contact and portability.
4. **Climbing is never forced and never blocked.** There is no point at which the
   game stops and demands an email, and no point at which a player who wants to
   sign in has to wait for a level to end.

---

## 2. The three claim paths

All three land in the same place: a Supabase session bound to the profile that
already holds the player's runs. They differ only in how the email is proven.

The claim UI is one screen, offered at exactly two moments (§5), and it presents
the paths in this order — cheapest-to-trust first, but with the two social
buttons above the form because at a booth, typing is the tax:

```
        [ Continue with Google ]   [ Continue with HubSpot ]
                     ── or ──
   First name  [                    ]
   Last name   [                    ]
   Email       [                    ]
   Company     [                    ]  (optional)

   [ ] Put my name on the leaderboard   (see §4 for the default)
   [ ] Email me about Flywheel and what ProvenLabs is building  (never pre-ticked)

                  [ Claim my runs ]
                  [ Not now — keep playing ]     ← same size, same weight
```

### 2.1 Email OTP

The baseline, and the only path with **zero third-party dependency**. If
everything else in this document fails, this still works and still captures the
lead.

Flow:

1. Player fills first name, last name, email, optional company. Consent checkboxes
   are separate and unticked.
2. Client calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
   while holding the **existing anonymous session**. Supabase treats this as
   linking an email identity to the current anonymous user rather than creating a
   new one — this is the mechanism that makes the claim retroactive.
3. Supabase mails a 6-digit code. **Code, not magic link**, deliberately: a magic
   link opens a new tab, which on a booth kiosk means the player's game state is
   in the tab behind the one they are now looking at, and on a phone means a
   different browser than the one the game is running in. A code can be typed back
   into the running game with nothing lost.
4. Player types the code; `verifyOtp` upgrades the session in place.
5. An Edge Function (`claim-profile`) writes `first_name`, `last_name`, `company`,
   `display_mode`, and the consent record, and flips `is_guest = false`.

Failure modes and what the player sees:

| Failure | Behaviour |
|---|---|
| Code not received (60 s) | "Resend code" appears; rate-limited to one per 60 s, five per hour per email |
| Wrong code, 3 attempts | Back to the email field, no lockout, no scary copy |
| Typo'd email that belongs to nobody | Nothing happens; the address is never added to any list until the code is verified. **Unverified emails are never stored.** |
| Player abandons mid-flow | Session stays anonymous, runs stay under the handle, no partial row is written |

That last row is a hard rule: **no lead is captured from an unverified email
address.** A list of addresses people mistyped at a booth is worse than no list.

### 2.2 Google OAuth

Supabase's native provider. Almost no design surface, which is the point.

- Provider: `google`, configured in the Supabase dashboard.
- Scopes: `openid email profile`. Nothing else. We do not want their calendar.
- Called as `supabase.auth.linkIdentity({ provider: 'google' })` when an anonymous
  session exists, which attaches the Google identity to the current user rather
  than starting a new one. `signInWithOAuth` is used only on a cold start where
  there is no guest to preserve.
- `first_name` / `last_name` prefill from the Google `given_name` / `family_name`
  claims; `company` is not available and is asked for separately (optional, one
  field, skippable).
- Redirect returns to the game URL with the session in the URL fragment; the
  client restores the pre-claim screen from a `sessionStorage` breadcrumb so the
  player lands back where they were, not on the title screen.

**Consent still happens.** Google gives us a verified address, not permission to
mail it. The marketing checkbox appears on the post-redirect confirmation step,
unticked, exactly as it does on the OTP path. Skipping OAuth's consent step
because "they clicked a Google button" is the dark pattern this doc exists to
refuse.

### 2.3 HubSpot OAuth — custom flow (highest risk in the package)

**Supabase has no HubSpot auth provider.** There is no dashboard toggle. This path
is a bespoke OAuth 2.0 authorization-code exchange running in two Edge Functions,
and it is the single most likely thing in this package to not be ready on time.
Plan accordingly (§2.4).

Why build it anyway: the booth audience is HubSpot partners. A "Sign in with
HubSpot" button in front of a HubSpot partner is not a convenience feature, it is
the reason they trust the booth. It also yields the highest-quality lead in the
set, because the token response tells us their **portal (hub) id** — which
identifies the agency, not just the person.

#### The exchange, step by step

```
Browser                    Edge Fn: auth-hubspot-start        HubSpot            Edge Fn: auth-hubspot-callback
   │                                  │                            │                          │
   │ GET /hubspot/start ─────────────►│                            │                          │
   │   (bearer: anon session JWT)     │ mint state (nonce + user   │                          │
   │                                  │  id + expiry), store it    │                          │
   │◄── 302 to app.hubspot.com ───────┤  server-side, 10 min TTL   │                          │
   │                                                               │                          │
   │ ── user approves ────────────────────────────────────────────►│                          │
   │◄────────────────── 302 back with ?code=&state= ───────────────┤                          │
   │                                                                                          │
   │ GET /hubspot/callback?code&state ───────────────────────────────────────────────────────►│
   │                                                               │  POST /oauth/v1/token   │
   │                                                               │◄─── (code exchange) ─────┤
   │                                                               │──── access_token ───────►│
   │                                                               │  GET /oauth/v1/          │
   │                                                               │   access-tokens/{tok}   │
   │                                                               │──── user email, hub_id ─►│
   │                                                                                          │
   │◄─────────── 302 back to the game with a one-time link token ─────────────────────────────┤
   │ client calls verifyOtp(token) → real Supabase session on the SAME user                   │
```

Concretely:

1. **`auth-hubspot-start`** (Edge Function). Requires the caller's current
   Supabase JWT (anonymous or otherwise). Generates a `state` value = random
   nonce, stores `{ nonce, supabase_user_id, redirect_path, expires_at }` in an
   `oauth_state` table (10-minute TTL, single use), and 302s to:

   ```
   https://app.hubspot.com/oauth/authorize
     ?client_id=<FW_HUBSPOT_CLIENT_ID>
     &redirect_uri=<edge fn callback URL, exact-match registered>
     &scope=oauth
     &state=<nonce>
   ```

2. **Scopes: `oauth` only.** That is HubSpot's minimum identity scope and it is
   all we need — it grants the token-info lookup and nothing else. We are
   deliberately **not** requesting `crm.objects.contacts.write`, even though we
   are doing lead capture, because writing a contact into *the partner's own
   portal* is not what anyone expects a booth game to do. Leads go to our CRM by
   our own process, not by reaching into theirs. If a future integration genuinely
   needs a CRM scope, it is a separate consent screen and a separate decision.

3. **`auth-hubspot-callback`** (Edge Function). Validates `state` against the
   table (exists, unexpired, unused → mark used). Then:

   ```
   POST https://api.hubapi.com/oauth/v1/token
     grant_type=authorization_code
     client_id=<FW_HUBSPOT_CLIENT_ID>
     client_secret=<FW_HUBSPOT_CLIENT_SECRET>   ← server-only secret, never shipped
     redirect_uri=<same exact URI>
     code=<code>
   ```

   Then `GET https://api.hubapi.com/oauth/v1/access-tokens/{access_token}`, which
   returns `user` (the email address), `hub_id`, `hub_domain`, `user_id`, and the
   granted scopes. **This email is verified by HubSpot** — that is the whole value
   of the round trip.

4. **The access token is used once and thrown away.** We do not store it, do not
   store the refresh token, and do not request offline access. We wanted an
   identity assertion, not an API relationship. This is also the cheapest possible
   answer to "what happens if our token store leaks" — there is no token store.

5. **Minting the Supabase session.** With the service-role key, inside the Edge
   Function only:
   - Look up the `supabase_user_id` recorded in the `state` row — this is the
     guest whose runs we are claiming.
   - Attach the HubSpot email to that user via the admin API
     (`auth.admin.updateUserById`, setting `email` and `email_confirm: true`,
     since HubSpot has already verified it), and record the linkage in a
     `linked_identities` row (`provider = 'hubspot'`, `provider_user_id`,
     `hub_id`, `hub_domain`).
   - Generate a one-time token with
     `auth.admin.generateLink({ type: 'magiclink', email })` and return **only the
     `email_otp` / token hash** to the browser via the redirect fragment.
   - The browser calls `verifyOtp({ type: 'magiclink', token_hash })` and now
     holds a genuine, ordinary Supabase session on the same user id it started
     with. From here nothing downstream knows or cares that HubSpot was involved.
   - `hub_domain` prefills the **company** field, which is the one piece of lead
     data that is usually left blank and is the most useful thing on the record.

6. **Collision case.** If that HubSpot email already belongs to a different
   claimed profile, we do **not** silently move it. See §3.

#### Why this shape and not the alternatives

| Option | Verdict |
|---|---|
| Custom Edge Function OAuth + admin-minted session (above) | **Chosen.** Real Supabase session, no bespoke JWT signing, no second auth system to secure. |
| Sign our own JWT with the Supabase JWT secret | Rejected. It works, but it puts us in the business of token expiry, refresh, and revocation — three things Supabase Auth already does correctly and we would get wrong. |
| Treat HubSpot as pure metadata (sign in with OTP, then "connect HubSpot") | Rejected as the primary path — it is two flows where partners expect one. **Kept as the fallback** (§2.4), because it is strictly less code. |
| Skip HubSpot | Rejected. It is the specific reason this audience trusts the booth. |

#### Risks specific to this path

- **App review / approval timing.** A public HubSpot app may need review before
  arbitrary portals can install it. Timeline is outside our control. This is the
  single biggest schedule risk in the package — see
  [11-risk-register.md](11-risk-register.md).
- **Exact-match redirect URIs.** HubSpot requires the `redirect_uri` to match the
  registered value byte-for-byte. Vercel preview deployments have per-deploy URLs
  and will therefore **never** work against a production HubSpot app. The callback
  must live on a stable custom domain from day one, and previews test against the
  fallback.
- **A partner on a free portal, or with no portal at all.** Some booth visitors
  are HubSpot *users* at a company, not admins of a portal. The authorize screen
  can fail for them in ways we do not control. Every failure of this path falls
  back to the email-OTP form with the fields prefilled from whatever we got.
- **Conference wifi and a third-party redirect chain.** Two full page navigations
  to an external origin is the worst possible flow on bad wifi. The QR handoff
  (§6) sidesteps this by moving the claim to the player's own LTE connection.

### 2.4 The HubSpot fallback (must be built first, not last)

Ship behind a flag: `identity.hubspot_oauth = off` by default. When off, the
"Continue with HubSpot" button is still present and still says HubSpot — it just
does something simpler:

- It opens the same claim form, with a **"I'm a HubSpot partner"** toggle
  pre-set, and the company field promoted from optional to prominently requested
  (still not required).
- Verification is email OTP.
- The resulting lead record carries `hubspot_partner_self_declared = true` and no
  `hub_id`.

The lead is captured either way. The difference between the flag on and off is
one round trip and the reliability of the `company` field. **Build the fallback
first, turn the flag on only after a full end-to-end test against a real portal on
the production domain, and be ready to turn it off from the dashboard mid-show
without a deploy** — see [08-rollout-and-runbook.md](08-rollout-and-runbook.md).

---

## 3. Linking, and what happens on an email collision

**One human, one profile, up to three ways in.** A `linked_identities` table hangs
off the profile: `(profile_id, provider, provider_user_id, provider_email,
linked_at)` with a unique constraint on `(provider, provider_user_id)`.

Ordinary case: a player claims with Google, comes back at the after-party and taps
HubSpot. HubSpot returns the same email, the session is already authenticated, so
we add a `linked_identities` row and nothing else changes. Both buttons now work
forever.

The interesting cases are the collisions.

| Situation | Resolution |
|---|---|
| **A: Provider email matches the current session's own email** | Link silently. Same person, second door. |
| **B: Anonymous guest claims with an email that already belongs to a claimed profile** | The honest case: this person played earlier, is playing again on another machine, and is now two profiles. **Do not merge automatically.** Complete the sign-in into the *existing* profile (their history is the valuable thing), and hold the guest's fresh runs in a `pending_merge` state keyed to the existing profile. Show one screen: "You've played before — we found N runs from this session. Add them to your record?" Yes merges; no discards the guest profile. Either way they end up signed in and playing. |
| **C: Claimed player A signs in with a provider whose email belongs to claimed player B** | Refuse the link, do not sign them out, plain-language message: "That email is already on another Flywheel account. Sign out and sign in with it instead." No automatic account takeover, ever — email-address-collision merging is the classic account-takeover primitive. |
| **D: Provider returns no email** (rare; a HubSpot user record without a usable address) | Cannot claim. Fall through to the OTP form with everything else prefilled. |
| **E: Two guests on the same kiosk claim the same email within minutes** | The second one is case B and hits the merge prompt. Kiosk mode (§6) makes this rare by clearing the guest session between players. |
| **F: A player changes their email at the provider** | We key on `provider_user_id`, not email, so the link survives. The `profiles.email` used for contact is updated only on an explicit re-verification. |

**Merge semantics** (case B, "yes"): additive and non-destructive, and the same
merge machinery the localStorage→cloud sync uses — see
[12-migration-plan.md](12-migration-plan.md). Runs are appended. Achievements
union. Coins take the **max**, not the sum, so a merge is never a currency
exploit. Belt reigns transfer with their original `won_at` intact, because a reign
length is a fact about when a score was set and rewriting it would corrupt the
lineage. The discarded profile row is soft-deleted with a `merged_into` pointer so
any board that cached the old handle can resolve it.

---

## 4. The profile, and what a conference can see

### The model

| Field | Source | Required | Default visibility |
|---|---|---|---|
| `handle` | typed at rung 1 | yes | **Public, always** |
| `first_name` | claim form / provider | at claim | Public (see display modes) |
| `last_name` | claim form / provider | at claim | Public initial only, by default |
| `email` | verified at claim | at claim | **Never public. Not to anyone, ever, on any surface.** |
| `company` | claim form / HubSpot `hub_domain` | no | Public if provided |
| `avatar_seed` | derived from the equipped skin | auto | Public |
| `display_mode` | player choice | defaults to `first_last_initial` | — |
| `country` / `city` | not collected | — | — |

### Display modes

A public board showing real names and companies at a conference is a **deliberate
choice**, and it is the right one — half the fun of a booth board is seeing that
someone from an agency you know is three places above you. But it is a choice the
player makes with their eyes open, and it must be reversible in one tap, from the
board itself, at any time.

Three modes, chosen at the claim screen and changeable forever after:

| Mode | Renders as | Notes |
|---|---|---|
| `full` | `Nico Lafakis — ProvenLabs` | Opt-in. The most fun, the most exposed. |
| `first_last_initial` | `Nico L. — ProvenLabs` | **Default.** Recognisable to someone who knows you, not to a stranger with a phone camera. |
| `handle_only` | `SPROCKETLORD` | The opt-down. Company hidden too. |

Rules that hold regardless of mode:

- **The default is `first_last_initial`, not `full`.** Choosing the more exposed
  option is an action the player takes; it is never the state they wake up in.
- Company is shown only in `full` and `first_last_initial`, and only if the player
  supplied it. A `hub_domain` prefill is a *suggestion in an editable field*, not a
  silent publication of where someone works.
- Changing the mode is retroactive across every board, the Titantron, and every
  belt lineage entry, immediately. There is no cached render of a name we cannot
  revoke.
- **Guests are `handle_only` by construction** — there is no other name to show.
- Email never appears in any API response that another player can read. This is
  enforced by RLS on a `public_profiles` view that simply does not select the
  column, not by remembering to omit it at each call site — see
  [03-technical-design.md](03-technical-design.md) and
  [09-threat-model.md](09-threat-model.md).

---

## 5. Lead capture and consent

The booth wants leads. That is a legitimate goal and this doc is not going to
pretend otherwise. What it will not do is get them by confusing anybody.

### What is collected, and when

| Data | When | Why | Player told? |
|---|---|---|---|
| `device_id` | first boot | Keeps a guest's runs attached to one browser | In the privacy note; not consent-gated (strictly functional, no cross-site meaning) |
| Handle | rung 1 | It is the name on the board | Self-evident |
| Run records (score, city, seed, input trace) | on submit | Boards, belts, and anti-cheat replay | Yes, at the claim screen |
| First name, last name, email | at claim | Identity + contact | Yes, explicitly |
| Company | at claim, optional | Lead quality | Yes, marked optional |
| HubSpot `hub_id` / `hub_domain` | HubSpot path only | Identifies the partner org | Yes, named on the claim screen |
| Event tag (`unbound-2026`) | at claim, if claimed at the booth | Scopes the UNBOUND boards and the lead list | Yes |

Not collected: password, phone, job title, IP-derived location, any third-party
analytics or tracking pixel, anything from a HubSpot portal beyond the identity
lookup.

### The consent moment

There is exactly one, and it is **at the claim**, not at first boot and not
buried at the end.

Two separate checkboxes, both unticked, neither blocking:

1. **`consent_leaderboard`** — "Show my name on the Flywheel leaderboards."
   Unticking it does not remove them from the board; it puts them in
   `handle_only`. Competing and being identifiable are different decisions.
2. **`consent_contact`** — "Email me about Flywheel and what ProvenLabs is
   building." This is the marketing consent and it is the only thing that puts an
   address on a list. Plain words, one line, no "and our carefully selected
   partners."

Under them, one line of small-but-legible copy, not a link nobody opens:

> We keep your name, email, and scores so your record follows you. We never sell
> or share it. Delete it any time from Settings, or email
> `privacy@<domain>` — we'll confirm within 30 days.

Recorded per checkbox, not as one blob: `consent_type`, `granted` (bool),
`granted_at`, `source` ('claim-form' | 'kiosk' | 'settings'), `policy_version`.
Withdrawals are inserted as new rows rather than updates, so the consent history
is an append-only ledger — the only shape that survives being asked "what did this
person actually agree to, and when."

### Explicitly forbidden here

Writing these down because at a booth, under time pressure, every one of them
looks reasonable for five seconds:

- Pre-ticked consent boxes.
- Bundling contact consent into "Claim my runs" or a Terms acceptance.
- A **"Not now"** that is smaller, greyer, or lower-contrast than "Claim my runs".
  Same size, same weight, same visual tier.
- Withholding a belt, a board place, an achievement, a skin, or coins from an
  unclaimed player.
- Re-prompting a player who declined more than once per session, or ever after a
  second decline on the same device.
- Treating a Google or HubSpot sign-in as marketing consent.
- Storing an unverified email address for any reason.
- Interstitials during, or immediately before, gameplay. The claim prompt appears
  on the **results screen** and in **Settings**. That is the complete list of
  places.

### Retention and deletion

| Data | Retention |
|---|---|
| `consent_contact = true` profiles | 24 months from last activity, then re-consent or purge |
| `consent_contact = false` profiles | Kept as a game account; **never enters any contact list** |
| Guest profiles with no activity for 90 days | Purged, including their runs |
| Run input traces (the anti-cheat replay payload — the bulky part) | 30 days, then dropped; the score summary is kept |
| Belt lineage entries | Kept indefinitely, but rendered by the deleted profile's `display_mode` at deletion time, or as `[vacated]` |
| `oauth_state` rows | 10 minutes |

**Deletion on request.** A "Delete my account" button in Settings, plus the
privacy address. It hard-deletes the `auth.users` row, the profile, the linked
identities, all consent rows, and every run. Belt reigns are **vacated, not
erased** — the fact that the UNBOUND Heavyweight title changed hands at 2:14pm on
day two is a record about the belt, not about the person, and it is retained with
the name replaced by `[vacated]`. The successor is recomputed from the lineage
(see [06-belts-and-achievements.md](06-belts-and-achievements.md) §5). Confirmed
by email within 30 days, and no dark-pattern retention flow: one confirm dialog,
typed handle, done.

---

## 6. The booth is a shared computer, and that changes everything

Everything above assumes a browser belongs to one person. At UNBOUND, two or three
kiosks will each be used by a hundred people in a day. That inverts several
defaults, so kiosk behaviour is an explicit mode, not an emergent property.

**Kiosk mode** is entered by loading the game with `?kiosk=unbound-2026`. The
event tag both enables the mode and scopes every run to the UNBOUND boards, so
there is one thing to get right on the URL and it is written on a card taped to
the machine.

| Default | In kiosk mode |
|---|---|
| Supabase session persisted to `localStorage` | **In-memory only** (`persistSession: false`). Closing or resetting the tab ends the session absolutely. |
| Save v13 accumulates across sessions | Per-player scratch save, discarded on reset. Coins and skins are **preloaded to a generous booth default** so the shop is fun to browse in 90 seconds and nobody starts from zero. |
| Claim prompt on the results screen | Same, plus the **QR handoff** below. |
| Idle behaviour | 45 s idle on any non-gameplay screen, or 20 s on the results screen → 10-second visible countdown → **NEXT PLAYER** reset. |
| Reset control | A permanent, always-visible **NEXT PLAYER** button in the corner. One tap, one confirm, full wipe. |
| Google / HubSpot buttons | **Hidden by default on kiosks** (see below). |

### The QR handoff — the single most important booth decision here

Doing OAuth on a shared machine is bad in a way that is not fixable by our code:
signing into Google on a kiosk leaves a Google session in that browser that we
cannot clear, because it is a cookie on someone else's origin. The next player
could hit "Continue with Google" and be silently logged in as the previous one.

So on a kiosk, the claim is **moved off the kiosk**:

> **GREAT RUN — 4th on the UNBOUND board.**
> Scan to keep it. *(QR code)*
> Or type your email here and we'll send a code.

The QR encodes `https://<domain>/claim#<one-time claim token>` — a single-use,
5-minute token bound to the guest profile. On the player's own phone, on their
own connection, in their own browser, they get the full claim screen with all
three paths, OAuth included and safe. When it completes, the kiosk (which is
polling on a Realtime channel) shows "Claimed by Nico L." and rolls to NEXT
PLAYER on its own.

Everything good about this: OAuth happens in a private browser; the lead is
verified on a device we know belongs to them; the kiosk queue keeps moving because
the claim is no longer blocking the machine; and the player leaves with the game
already open on their phone.

The typed-email fallback stays on the kiosk for people who will not scan a QR
code, and it is OTP-only — the code arrives on their phone, they type six digits
on the kiosk, done. Never a password, because a password typed on a shared
keyboard at a conference is a password we should not have asked for.

### The reset must be brutal

**NEXT PLAYER** clears: the in-memory Supabase session, the scratch save, the
device id (a **new** `device_id` is minted, so the next player's guest runs cannot
attach to the previous player's), `sessionStorage`, any pending claim token, and
the results screen. It reloads to the title screen with the kiosk query string
intact. There is no "are you sure, you'll lose your progress" — the progress is
either claimed or it is gone, and the countdown already said so.

If a run was unclaimed at reset, the guest profile survives server-side for 90
days holding its board position under its handle. It is unreachable, but the score
on the board is real and someone in the room set it. Deleting it at reset would
be worse: the board would visibly shrink during the show.

### Booth operator affordances

Documented properly in [08-rollout-and-runbook.md](08-rollout-and-runbook.md);
named here because they are identity behaviours:

- A staff-only key chord force-resets to the title screen from any state,
  including mid-run and mid-OAuth-redirect.
- The kiosk works with the network down: it plays, it queues submissions, it
  shows a small honest "offline — scores will post when we reconnect" chip. It
  does not show a claim form it cannot honour.
- The **Titantron** (the big screen showing boards and belts) runs an entirely
  separate read-only anonymous session with no claim UI, so nobody can be signed
  in on the screen everybody is looking at.

---

## 7. What this doc deliberately does not decide

- **Column names and RLS policies.** [03-technical-design.md](03-technical-design.md)
  owns the schema; this page names the objects it needs
  (`profiles`, `linked_identities`, `consents`, `oauth_state`, `claim_tokens`) and
  the behaviour they must support.
- **The merge algorithm's field-by-field rules.** [12-migration-plan.md](12-migration-plan.md).
- **What a belt does when its holder is deleted.** [06-belts-and-achievements.md](06-belts-and-achievements.md) §5.
- **Rate limits, abuse, and impersonation via handle-squatting.** [09-threat-model.md](09-threat-model.md).
- **The exact copy on the claim screen.** It should be written by whoever writes
  the rest of the game's voice, against the constraints in §5, not specified as
  strings here.
