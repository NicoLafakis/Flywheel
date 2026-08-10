# Legal Scaffolding — the documents Flywheel does not have

**Status:** planning · **DRAFT — NEEDS LEGAL REVIEW**

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Requirements](02-requirements.md)

---

## ⚠️ Read this before anything else on this page

**None of the text on this page is legal advice, and none of it may ship.**

It was drafted by an engineering agent, not by a lawyer. Its purpose is to
**scope the work and give an attorney something concrete to redline**, which is
faster and cheaper than starting from a blank page. Every drafted clause below
is marked `DRAFT` and must be reviewed, rewritten as needed, and approved by a
qualified attorney licensed in the relevant jurisdiction before it is shown to
a single real user.

Two specific reasons this is not a "close enough" situation:

1. **Alcohol is a regulated category.** Content that could be construed as
   promoting or advertising alcohol consumption is regulated differently in
   nearly every jurisdiction, and some prohibit it outright. This is not the
   same risk profile as a generic web-app ToS.
2. **Flywheel is aimed, in part, at a conference booth in front of business
   partners.** The reputational exposure is concentrated in exactly the place
   the product is being shown.

---

## 1. What exists today: nothing

Flywheel currently ships with **no EULA, no terms of service, no privacy
policy, no disclaimer, and no acceptance flow of any kind**. Today it is a
static single-player toy that stores a save in `localStorage`, which is close to
the minimum-risk configuration a web game can have. Two changes end that:

- **[online-flywheel/05-identity-and-accounts](../online-flywheel/05-identity-and-accounts.md)**
  introduces accounts collecting first name, last name, email, optional company,
  consent flags, and a `device_id`, plus a HubSpot OAuth path. That is personal
  data processing and it needs a privacy notice regardless of party mode.
- **Party mode** introduces an alcohol-adjacent mechanic and an age
  affirmation, which needs terms to sit inside.

Party mode is the forcing function, not the whole problem. **The legal set is
owed to the game with or without it** — which is why PRD §10 puts it in P0,
independent of every other phase.

---

## 2. The artifact set

| # | Artifact | Needed because | Blocking for |
|---|---|---|---|
| 1 | **EULA / Terms of Service** | The game has none; every other document hangs off it | Everything |
| 2 | **Privacy Notice** | Accounts collect name, email, company, consent flags, `device_id` | online-flywheel account launch |
| 3 | **Party Mode Disclaimer & Age Affirmation** | Alcohol-adjacent mechanic, 21+ self-affirmation, liability | Party mode |
| 4 | **Acceptable Use / Conduct Policy** | Party mode puts a named player on eight screens; display names are player-supplied | Party mode, arena chat if it ever exists |
| 5 | **Cookie / local-storage note** | `localStorage` save + `device_id`; may fold into #2 | Account launch |
| 6 | **Third-party notices** | Three.js and any vendored runtime carry licences (ADR-0014) | Cheap; do it with #1 |
| 7 | **Contact / notice address** | Every document above needs a real one | All |

Artifacts 1, 2, 6 and 7 are owed anyway. Only 3 and 4 are party-mode-specific.

---

## 3. Where each one appears

| Surface | What appears |
|---|---|
| Title screen | Persistent footer links: Terms · Privacy · Conduct |
| First run | One-time acceptance of the Terms, recorded with version and date |
| Version bump | Re-acceptance prompt on next launch (PRD FR-011) |
| Account creation | Privacy notice link beside the consent checkboxes that already exist in [05](../online-flywheel/05-identity-and-accounts.md) §5 |
| Party lobby | A one-paragraph plain-language summary of what party mode does, with a link to the full disclaimer |
| **Age gate** | The 21+ affirmation, the not-verified statement, the responsible-play line, and links out |
| Settings | Revoke affirmation; re-read every document; contact address |
| Results (party) | The unranked notice (product, not legal, but it lives here too) |

The age gate is the only surface that must carry legal copy *inline* rather
than by link. Everything else can link, and should: legalese inside a gate
makes it less likely to be read, not more.

---

## 4. The age gate — copy and mechanics

### 4.1 What the gate must and must not do

**Must:** require a deliberate affirmative action; offer an equally prominent
decline; state that it is unverified self-affirmation; be dismissible without
penalty; persist locally; be revocable.

**Must not:** pre-check anything; default-focus the affirm control; proceed on
a timer; collect a date of birth (see §4.3); make the decline path feel like a
punishment; announce a decline to other players.

### 4.2 DRAFT gate copy — NEEDS LEGAL REVIEW

```
DRAFT — NEEDS LEGAL REVIEW

  PARTY MODE

  Party mode is a social party game feature intended for adults. During a
  party match, tokens appear in the city. A player whose hole reaches one is
  briefly paused while the other players are shown a callout.

  Flywheel does not tell you to drink anything, does not measure anything,
  and does not know whether you do. What you do away from the screen is
  entirely your decision and your responsibility.

  Please do not drink and drive. Please look after the people you are
  playing with.

  By continuing you affirm that you are at least 21 years old, or the legal
  drinking age where you are, whichever is higher. We do not verify this.

  [ I AM 21 OR OLDER — CONTINUE ]      [ NO THANKS — PLAY WITHOUT IT ]

  Full terms · Party mode disclaimer · Privacy
```

Notes for the attorney reviewing this:

- "or the legal drinking age where you are, whichever is higher" is the
  engineering-side attempt at owner decision 5 without collecting location. It
  may not be sufficient in jurisdictions requiring an actual local threshold or
  prohibiting the content entirely.
- The decline label deliberately does not say "I am under 21". Forcing a minor
  to self-identify in a room full of people is both a design failure and,
  plausibly, a data-collection problem. The consequence is that a decline is
  not evidence of anything — which is the correct posture for an unverified
  gate anyway.

### 4.3 Why no date of birth

Collecting a date of birth is a common pattern and it is the wrong one here:

- A DOB is personal data. Collecting it expands the privacy notice, the
  retention policy, and the breach surface, in exchange for a number the user
  can type incorrectly on purpose.
- If a DOB is ever entered by someone who is a minor, we now knowingly hold a
  minor's personal data, which is a substantially worse position than not
  knowing (COPPA in the US, and equivalents elsewhere, turn on knowledge).
- A boolean affirmation, stored locally, with no identity attached, keeps this
  at the floor.

**Open question for counsel:** if a player has a claimed account, must the
affirmation be recorded server-side against that account (evidence of
affirmation), or is a local-only record preferable (minimal data)? Engineering
prefers local-only; this is a legal call. See §7.

---

## 5. DRAFT clauses — NEEDS LEGAL REVIEW

Placeholders in `{{BRACES}}` are for counsel and the owner to fill.

### 5.1 EULA / Terms of Service — skeleton

```
DRAFT — NEEDS LEGAL REVIEW

1.  Acceptance. Who we are ({{LEGAL ENTITY}}), what the service is, that using
    it means accepting these terms, and that continued use after a posted
    change means accepting the change.
2.  Licence. A personal, non-exclusive, non-transferable, revocable licence to
    play. No reverse engineering, no redistribution, no commercial exploitation
    of the client. Reserve all rights not granted.
3.  Eligibility. Minimum age to use the service at all ({{13/16/18 — counsel}});
    the separate, higher affirmation for party mode.
4.  Accounts. Accuracy of information, responsibility for the account,
    suspension and termination grounds, and what happens to data on
    termination. Cross-reference the Privacy Notice.
5.  User content. Display names and any player-supplied text. Licence to
    display them; right to remove; the Conduct Policy by reference.
6.  Acceptable use. Cheating, automation, exploiting the arena, harassment.
    Cross-reference §5.4 below.
7.  Third-party services. {{Supabase, HubSpot OAuth, hosting}} — that they are
    third parties, and their terms apply to their parts.
8.  Availability. No uptime guarantee. The service is provided "as is" and
    "as available" to the extent permitted by law.
9.  Disclaimer of warranties. {{Counsel — jurisdiction-specific; some consumer
    protections cannot be disclaimed.}}
10. Limitation of liability. {{Counsel. This is the clause that matters most
    for party mode and it must be drafted, not templated.}}
11. Indemnity. {{Counsel.}}
12. Changes to the service and to these terms; versioning and notice.
13. Governing law and venue. {{JURISDICTION}}. Note that a choice-of-law
    clause does not displace mandatory local consumer law in many places.
14. Contact. {{NOTICE ADDRESS}}.
```

### 5.2 Party Mode Disclaimer — draft body

```
DRAFT — NEEDS LEGAL REVIEW

PARTY MODE — IMPORTANT INFORMATION

What it is. Party mode is an optional social feature of Flywheel. During a
party match, tokens appear in the game world. A player whose hole reaches a
token is briefly paused and a celebratory callout is shown to the other
players in the match. That is the entirety of what the software does.

No instruction. Flywheel does not instruct any player to consume alcohol or
any other substance, does not specify or measure any quantity, does not track
consumption, and has no knowledge of whether any consumption occurs. Any
association between an in-game callout and an off-screen action is a social
convention chosen by the players themselves, and is not directed by, required
by, or known to {{LEGAL ENTITY}}.

Age affirmation. Party mode is offered only to players who affirm that they
are at least 21 years of age, or the legal drinking age in their jurisdiction
if that is higher. This affirmation is a self-declaration. {{LEGAL ENTITY}}
does not verify age and does not represent that any player's affirmation is
accurate.

Availability. Party mode may not be available in all jurisdictions, and
{{LEGAL ENTITY}} may disable it at any time and for any reason. Players are
responsible for compliance with the laws applicable to them.

Responsible use. Alcohol consumption carries health and safety risks,
including risks that can be serious or fatal, and those risks increase with
consumption speed and volume. Do not drive or operate machinery after
drinking. Do not play if you are pregnant, taking medication that interacts
with alcohol, in recovery, or have any medical condition affected by alcohol.
Look after the people you are playing with. If you or someone else needs help
with alcohol use, contact a qualified professional or a local support service.

Opting out. Any player may decline party mode at any time, before or during a
match, and continue playing normally. Declining is not shown to other players.

No liability for off-screen conduct. To the maximum extent permitted by
applicable law, {{LEGAL ENTITY}} is not liable for any injury, illness, loss,
or damage arising from any player's decision to consume alcohol or any other
substance, or from any conduct of any player, whether or not connected to
their use of party mode. {{Counsel: this clause is the core of the exercise
and must be drafted for the governing jurisdiction, with attention to the
limits on excluding liability for personal injury.}}

Not medical advice. Nothing in Flywheel is medical, health, or safety advice.
```

### 5.3 Privacy Notice — skeleton

```
DRAFT — NEEDS LEGAL REVIEW

Controller identity and contact. {{LEGAL ENTITY}}, {{ADDRESS}}, {{EMAIL}}.

What we collect, and why:
  - Local save data (progress, settings, cosmetics) — stored in your browser,
    not transmitted. Purpose: the game working.
  - device_id (a random identifier minted in your browser) — purpose: keeping
    a guest's runs attached to one browser. Not cross-site.
  - Party-mode age affirmation and opt-out — stored in your browser.
    {{Whether this is also stored server-side for account holders is an open
    decision — see §7.}}
  - Account data (first name, last name, email, optional company) — only if
    you create an account. Purpose: leaderboards, and contact if you consent.
  - Consent records (leaderboard display, contact) — purpose: proving what
    you agreed to.
  - Gameplay records (scores, replays) — purpose: leaderboards and validating
    that a score is real.

Legal basis {{if GDPR/UK GDPR applies}}. Contract for account operation,
consent for marketing contact and leaderboard display, legitimate interests
for anti-cheat validation. {{Counsel to confirm.}}

Processors. {{Supabase (hosting/database), HubSpot (if OAuth used), hosting
provider}}. Where data is stored and transferred.

Retention. How long each category is kept, and what happens on deletion.

Your rights. Access, correction, deletion, objection, portability, withdrawal
of consent, complaint to a supervisory authority. How to exercise them.

Children. The service is not directed to children under {{AGE}}; party mode
is offered only to players affirming 21+.

Changes. Versioning and how you are told.
```

### 5.4 Acceptable Use / Conduct — draft points

```
DRAFT — NEEDS LEGAL REVIEW

- Display names: no impersonation, slurs, sexual content, or content that
  targets a person or protected group. We may change or remove a name.
- No harassment of other players, in any surface the game provides.
- No cheating: no modified clients, no automation, no exploiting the arena or
  the host role, no attempting to manipulate another player's session.
- No use of the service to promote alcohol, any regulated product, or any
  commercial offering.
- Enforcement: removal of content, suspension, termination. No obligation to
  give notice where doing so would be unsafe or unlawful.
- Reporting: {{HOW A PLAYER REPORTS SOMEONE — this needs to exist as a real
  route, not just a clause.}}
```

---

## 6. Jurisdiction caveats

Flagged, not resolved. Each is a question for counsel, and several are
business decisions rather than legal ones.

- **Legal drinking age varies** — 21 (US), 18 or 19 (most of Canada, much of
  Europe, Australia), 20 (Japan, Iceland), 16–18 for some categories in
  parts of Europe, and **prohibition or near-prohibition** in a number of
  countries. A single hardcoded 21 is over-strict almost everywhere and
  wrong-but-safe rather than wrong-and-exposed — but it is not safe in a
  jurisdiction where the *content itself* is restricted.
- **Alcohol advertising and promotion rules** — several jurisdictions regulate
  content that promotes consumption, including rules against associating
  alcohol with competition, speed, or achievement. A game mode that rewards a
  drinking callout with a celebratory animation is squarely in the territory
  those rules were written about. This is the single strongest argument for the
  abstract token art in owner decision 1, and for the no-instruction language
  in §5.2.
- **"Drinking game" as a category** — some jurisdictions and some venues
  regulate or prohibit drinking games specifically. A conference venue may have
  its own rules independent of the law.
- **App store policies do not apply today** (Flywheel is a static web app) but
  **would apply immediately** if it were ever wrapped for iOS or Android, where
  alcohol-related content carries rating requirements and, in places, outright
  rejection. Worth knowing before someone proposes a wrapper.
- **Consumer protection limits on liability waivers** — in many jurisdictions,
  liability for personal injury cannot be excluded by contract. The §5.2 clause
  must be drafted knowing this rather than templated from a US SaaS ToS.
- **GDPR / UK GDPR / US state privacy laws** — triggered by the account layer,
  not by party mode. Already owed.
- **COPPA and equivalents** — the reason §4.3 argues against collecting a date
  of birth.

---

## 7. Open questions for counsel and the owner

1. **Is a local-only, unverified 21+ affirmation sufficient**, or must the
   affirmation be recorded against an account? (Engineering prefers local-only;
   PRD FR-010.)
2. **Should party mode be geo-restricted?** Requires a location signal we do
   not currently collect. (Owner decision 5.)
3. **Does the celebratory framing of the callout create advertising exposure**
   in any target jurisdiction, and does the abstract token art materially
   change that answer?
4. **What is the governing law and venue**, and does the product plan to
   restrict availability accordingly?
5. **Is the "whichever is higher" formulation acceptable**, or is a per-region
   threshold required?
6. **Does the soft-drink vocabulary** (owner decision 4) change any of the
   above? Engineering's read: it does not remove the need for the gate, because
   the mode's identity is unchanged and the vocabulary is per-player.
7. **Does the booth context** (a professional conference, partners present)
   add obligations beyond the general case — venue rules, event terms?
8. **What is the notice address and legal entity name** for every `{{BRACE}}`
   above? Nothing can be finalised without these.

---

## 8. Sequencing

1. Owner picks the legal entity, notice address, and governing jurisdiction.
2. Owner decides §7.2 and §7.4 (availability and law) — these change what
   counsel drafts.
3. Counsel drafts or redlines artifacts 1, 2, 6, 7 (owed regardless of party
   mode) — this is the long-lead item and should start before any party code.
4. Counsel drafts or redlines artifacts 3 and 4.
5. Engineering builds the acceptance surface, version stamping, and the gate
   (PRD P0 and P1) against the approved text.
6. Approved text is committed with a version string; `legal.acceptedVersion`
   keys off it, and any future edit bumps it and re-prompts.

**Step 3 does not depend on any of the party-mode engineering and should not
wait for it.**
