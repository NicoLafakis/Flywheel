# Scoreboards & Profiles — Requirements

> [Objective overview](00-objective-overview.md) · [PRD](01-prd.md) ·
> [Technical design](03-technical-design.md) · [Test strategy](08-test-strategy.md)

The testable contract. If a behaviour is not in here, it is not verified.
Acceptance criteria are Given/When/Then; system requirements use EARS phrasing.

---

## Problem & goal

A Flywheel score is currently a private fact in one browser's `localStorage`.
Nobody has a reason to beat one. **Done** means: a player can put a name on a
score, see where it stands against everyone else's per city and overall, and have
no reason to doubt any number on either board — while the game keeps working
exactly as it does today with no network at all.

---

## S1 — Playing a ranked run

**As a player, I want a run that counts, so that my score means something to
other people.**

- **Given** the title screen and a city chip, **when** I choose RUN, **then** the
  run starts within the same time it does today and a 90-second clock is visible
  from the first frame.
- **Given** a ranked run in progress, **when** the clock reaches zero, **then**
  the run ends on the tick boundary at exactly 5,400 ticks, and the results screen
  shows my score immediately, labelled as mine and not yet verified.
- **Given** a ranked run, **when** it runs on any device at any graphics setting,
  **then** it uses one pinned physics tune, and the graphics setting changes only
  what is drawn.
- **Given** I am offline, **when** I choose RUN, **then** the run starts anyway,
  plays identically, and the results screen says it was saved but not ranked.
- **Given** the city clear (the existing 50% goal), **when** I finish it, **then**
  it behaves exactly as it does today and is labelled as a personal record.

**EARS.** When a ranked run is requested, the system shall obtain a run ticket
before the first tick and shall start the run whether or not it obtains one.
While a ranked run is in progress, the system shall append the per-tick move
intent to a preallocated buffer without allocating.

---

## S2 — Submitting and being verified

**As a player, I want my score checked, so that the board is worth being on.**

- **Given** a finished ranked run and a working network, **when** the results
  screen appears, **then** my score shows instantly and a chip resolves within a
  minute to a verified score and a rank, without me pressing anything.
- **Given** a finished run and no network, **when** the results screen appears,
  **then** the chip says the run will be submitted later, and **when** the network
  returns, **then** it is submitted with no action from me.
- **Given** a submission that the server cannot reproduce, **when** verification
  completes, **then** the run does not appear on any board, my own history shows
  it without a rank, and **no message accuses me of anything.**
- **Given** the same trace submitted twice, **when** the second arrives, **then**
  the first result is returned and no second row exists.
- **Given** a run that could not place on any board, **when** it is submitted,
  **then** it is recorded and not re-simulated.

**EARS.** When a submission is received, the system shall verify the ticket, the
tick count, the payload size and the rate limits before performing any
simulation. When a submission's declared sim version does not match the deployed
one, the system shall record the run as unverifiable and shall not attempt a
cross-version replay.

---

## S3 — Claiming a name

**As a player who just did well, I want to put my name on it in one tap, so that
I do not lose the moment to a form.**

- **Given** a verified run that places on a board and no name yet, **when** the
  results screen appears, **then** one panel asks for a name, with one field and
  one button, and no email, password, or sign-in appears anywhere on it.
- **Given** the claim panel, **when** I type a free name and confirm, **then** I
  am on the board under that name within a second, and the run that earned it is
  the run that appears.
- **Given** the claim panel, **when** I choose "not now", **then** the run is
  kept, nothing is lost, the panel is not shown again this session, and the run
  is submitted the moment I later claim a name.
- **Given** a name already held by someone, **when** I try to claim it, **then** I
  am told it is taken and offered at least three alternatives that are free, and
  I am not offered a way to sign in or told anything about the holder.
- **Given** a name on the blocklist or reserved list, **when** I try to claim it,
  **then** it is refused with "that name isn't available" and no explanation of
  which rule fired.
- **Given** any of `NICO`, `nico`, `ｎｉｃｏ`, `NIСO` with a Cyrillic С, or `ni​co`
  with a zero-width space, **when** one is claimed, **then** the others are taken.
- **Given** the claim panel, **when** it is shown, **then** it states once that
  the name lives in this browser and points at the transfer code.

**EARS.** When a name is claimed, the system shall mint a bearer token
server-side, return it exactly once, and store only its hash. The system shall
never present a sign-in, a password field, or an email field on any surface.

---

## S4 — Keeping a name

**As a player with a name, I want to keep it when I change device, and to know
where I stand when I cannot.**

- **Given** my profile, **when** I choose PLAY ON ANOTHER DEVICE, **then** I get a
  six-character code with a visible countdown, valid ten minutes and once.
- **Given** that code on a second device, **when** I enter it, **then** my name
  moves there, and the first device stops being able to submit and tells me so
  plainly with an offer to claim a new name.
- **Given** an expired or already-used code, **when** I enter it, **then** it is
  refused clearly and I can mint another.
- **Given** a cleared browser, **when** I return, **then** I am anonymous, my
  existing board rows are untouched under the old name, and I am told the name
  cannot be recovered and offered a new one.
- **Given** a save that survived but a lost token, **when** the title screen
  renders, **then** my name shows greyed with one line of explanation and a
  CLAIM A NEW NAME action — **not** a silent state that fails on the next submit.

---

## S5 — Reading the boards

**As a player, I want to know where I stand, so that the next run has a target.**

- **Given** any city board, **when** I open it, **then** I see the top 25 with
  rank, name and score, and my own row with two neighbours either side.
- **Given** a city I have never ranked in, **when** I open its board, **then** I
  see the top 25 and no row of my own — **not** a zero and not a placeholder.
- **Given** THE FLYWHEEL, **when** I open it, **then** I see points, city count,
  and rank per player, and my own row shows the per-city ranks the points came
  from.
- **Given** two players where one ranks in one city and the other in several,
  **when** both appear on THE FLYWHEEL, **then** the difference is explicable from
  the ranks shown without any other information.
- **Given** the title screen and a name, **when** it renders, **then** the status
  strip carries one cell with my name and overall standing, and each city chip I
  am ranked in carries my rank and score on its existing progress line.
- **Given** no name and no ranked run, **when** the title screen renders, **then**
  nothing about boards appears — no prompt, no empty cell, no call to action.
- **Given** no network, **when** I open a board, **then** the last cached copy
  renders with an "as of" line, and never a spinner or an error page.

**EARS.** The system shall compute rank at read time and shall never store a rank.

---

## S6 — Personal history

**As a long-time player, I want my existing records to survive.**

- **Given** a save with `sandbox` records from before this feature, **when** the
  game loads after the update, **then** every `completions`, `bestSize`,
  `bestTime`, `bestCombo` and `bestScore` is intact and unchanged.
- **Given** those records, **when** I open my profile, **then** they appear under
  YOUR HISTORY, labelled as this device's own records and visibly distinct from
  the ranked section.
- **Given** those records, **when** boards arrive, **then** none of them appears
  on any board.
- **Given** the first time boards are shown, **when** I see them, **then** one
  line explains that my records stay mine and that ranked scores start fresh
  because they are re-run by the server.

---

## S7 — Moderation and privacy

**As the operator, I want a bad name gone fast. As a player, I want to know what
is public.**

- **Given** an offensive name visible on a board, **when** I use the operator
  page, **then** it is gone from every board within 60 seconds with no deploy and
  no code change.
- **Given** a force-rename, **when** it is applied, **then** the player's scores
  and ranks are unchanged and only the name changes.
- **Given** a board row, **when** anyone anywhere views it, **then** the only
  player data visible is the name they chose, their score, their rank, and when
  they set it.
- **Given** a player who wants out, **when** they use REMOVE ME FROM THE BOARDS,
  **then** their rows stop appearing immediately and their name is released or
  anonymised per [06](06-privacy-and-moderation.md) §5.
- **Given** any board row, **when** it renders, **then** it can be reported in one
  tap, and reporting does not immediately hide anyone.

---

## S8 — The network is optional

**As any player, I want the game to work.**

- **Given** airplane mode from boot, **when** I play, **then** the game boots,
  every city loads, every local record is written, and no network request is
  attempted at all.
- **Given** a server outage, **when** I play, **then** nothing blocks, every call
  times out with a defined behaviour, and no modal appears.
- **Given** a rate limit, **when** I hit it, **then** the run still plays and is
  saved, and the message does not read as an error in the game.

**EARS.** The system shall boot and run with `js/board/**` never imported. Every
network call shall have a timeout, and every timeout shall have a defined
non-network behaviour.

---

## Out of scope

Ranking the city clear · accounts of any kind · belts, reigns and achievements ·
ranking the live arena · ghost replays · daily challenges · seasons (the column
exists, nothing reads it) · friend boards · chat or any free text beyond the name
· cross-device play without a transfer code · recovering a name after a cleared
browser.

## Open questions

Both are measurements with pre-decided branches; see [01-prd.md](01-prd.md) §21.

1. Is the ranked tune playable for 90 seconds on a low-end phone? (T-901)
2. What is the deployed replay p95, and does it fit the monthly CPU allowance?
   (T-902)
