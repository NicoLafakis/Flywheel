# Roadmap — what is real, what is designed, and what is blocked

This page exists to answer one question in one place: **of everything written
down for Flywheel, what can a player actually do today?**

A lot of this project's design work is far ahead of its code. That is on
purpose — the planning packages under [features/](features/) are deliberately
written before the build so the build is not guesswork. The cost of working
that way is that a folder full of confident, detailed documents can read like a
description of a finished game. It is not. This page draws the line.

**How to read it.** Every area below says four things: what a player gets, what
exists today, what it is waiting on, and roughly how big the remaining job is.
Sizes are bands, not estimates in hours — *small* is a sitting, *medium* is a
few days of focused work, *large* is a couple of weeks, *very large* is a
project of its own. Where a size cannot be given honestly, it says so and why.

**The single most useful distinction on this page** is the last column of the
summary table: whether something is *blocked on somebody else* or *could start
this afternoon*. Most of what follows is not blocked.

---

## The one-screen summary

| Area | What the player gets | Exists today? | Waiting on | Size |
|---|---|---|---|---|
| Scoring and combos | A chain that builds while eating, scaling multipliers, and coin refresh | **Yes — shipped & active** | Nothing | Done |
| Score / combo meters and milestone hype | Live HUD meters, combo pulses, golden sparkles, SIZE triggers, and full-width milestone banners | **Yes — shipped & active** | Nothing | Done |
| Shop & Character Upgrades | 5 icon category tabs, 7 free color skins, 4 stat upgrade tracks (20 ranks) | **Yes — shipped & active** | Nothing | Done |
| Multiplayer | 6-player synchronized invite lobby, PvP hole eating, 10s respawn, per-player coins, zero-storage Supabase broadcast | **Yes — shipped & active** | Nothing | Done |
| Public scoreboards and player names | Ranked RUN leaderboards, replay verification, device-token profile management, offline fallback | **Yes — shipped & active** | Nothing | Done |
| Cambridge map | A tenth-of-a-square-mile HubSpot Cambridge to drive around and eat | **Yes — complete and playable** | Nothing | Done |
| Cambridge hidden content | 44 hidden things and 11 giant ground drawings to find | No | Nothing (Phase 7) | Large |
| Achievements | A trophy list that remembers what you have done | No — 96 designed, 0 built | The online backend, for the *saving* half only | Medium (per batch) |
| Championship belts | Named titles somebody holds until you beat their number | No | The online backend | Large |
| Known defects | Fewer ways for the game to break in front of somebody | Zero open | Nothing | Small each |

Two things are worth pulling out of that table before the detail.

**Core gameplay and multiplayer are complete.** Multiplayer, character progression, cosmetic collections, and server-replayed scoreboards are live and fully verified.

**The remaining roadmap focuses on level secrets and achievements.** The 96 designed achievements need somewhere to remember that you earned one, while the level content (Phase 7 Cambridge secrets, rooms, and glyphs) can be authored directly.

---

## 1. Scoring and combos

**What a player gets.** Keep eating without pausing and a chain builds. While
the chain is alive each bite is worth more, so a clean uninterrupted run through
a dense street is worth materially more than the same blocks eaten one at a
time. Coins scattered around the map keep a live chain from lapsing while you
cross an empty stretch — they buy you time without counting as part of the
chain.

**What exists today.** Fully implemented, saved, and rendered with live feedback:
- Live HUD combo counter, multiplier pills (`x1`..`x8`), and uncapped Frenzy multipliers.
- Real-time milestone announcements (`25%`, `50%`, `75%`, `100%`) with shockwaves and audio stingers.
- SIZE level-up alerts and FOV kicks on the player's hole.
- Save files (`save.js`) persist high scores, best combos, stars, and coin bank balances across all sessions.
Re-tuning the combo curve so the 3× cap is actually reachable is a feel
decision that wants playtesting, which is where the time goes.

---

## 2. The score and combo meters, and the milestone moments

A separate planning package is being written for exactly this: putting the
score and the combo on screen, making the combo readable while it is happening,
and giving the 25/50/75/100-percent city-consumption milestones — which the
simulation already fires as events (`js/voxelsim.js:2357-2361`, surfaced in
`js/main.js:578`) — a moment worth watching.

That package owns the design. This page deliberately does not pre-empt it, and
it is the thing to read rather than this section. It will land in
[features/](features/); link it here when it does.

**Blocked on.** Nothing.

---

## 3. Easter eggs, ground glyphs, and achievements

Designed in full in
[features/cambridge-sandbox/04-easter-eggs-and-achievements.md](features/cambridge-sandbox/04-easter-eggs-and-achievements.md).
**None of it is built.** Not one egg, not one glyph, not one achievement.

This is the area where the gap between the documents and the game is widest,
and also the area where the least is genuinely blocked.

### 3a. The 44 easter eggs — not blocked

**What a player gets.** Forty-four hidden things placed in the Cambridge map,
graded on one axis: how many people who work in that building say "no way" per
hour of work. A tofu factory that is really there. The lawn chair somebody left
to save a parking space. A police cruiser on MIT's Great Dome, with something
under it. The interior of Two Canal Park cut open — bleachers, kitchen,
ping-pong room, beer garden, patio, café — revealed by eating the wall in front
of it. The catalogue is E1–E44; three entries are deliberate *non*-eggs, ideas
considered and refused with the reasons written down.

**Exists today.** No. The map they sit in is finished; the props are not
authored.

**Blocked on.** Nothing whatsoever. This is level content in one scene file
(`js/voxelscene-cambridge.js`) and it needs no backend, no schema and no new
engine capability. It is the single largest piece of unblocked, high-value work
in the project.

**Size.** Large — about 1,500–1,800 voxel pieces of content, most of it small
props riding on buildings that already exist, with one expensive item (the
cut-open interior, at 600–900 pieces on its own). It parallelises cleanly by
district.

### 3b. The 11 ground glyphs — not blocked

**What a player gets.** Eleven large marks drawn into the ground and roofs of
the map: HubSpot's sprocket on a garage roof, a river frontage of partner
logos, a ghost sprocket under the wrong building's cladding, "UNBOUND" along an
edge band, a NECCO wafer roll revealed by eating a DNA helix off a tower, and
an anamorphic mark that only resolves into a readable shape from one specific
platform. The design principle behind all of them is that a logo you drive past
is decoration, but a logo that appears *because you ate the thing covering it*
is a moment — and eating things is the entire game.

**Exists today.** No. District 10 built the ground and kerbs the marks sit on
and labelled which apron belongs to which mark, so the placement work is
already done; the marks themselves are not drawn.

**Blocked on.** Nothing. One glyph carries real risk — the anamorphic one only
works from a camera pose that has not been prototyped, and the design flags it
as the one to prove before committing.

**Size.** Medium — roughly 1,740 pieces, two to four percent of the scene.

### 3c. The achievements — half blocked, and only the half you would expect

**What a player gets.** A trophy list. Ninety-six of them across the whole
game: fifty-eight designed in the online-flywheel package's
belts-and-achievements document (§6 — that package was retired along with
the legacy multiplayer stack on 2026-08-16 and has no replacement yet) and
thirty-eight more for Cambridge, numbered 59–96, twenty of them secret
— shown as a locked `???` slot with no hint, because on a discovery level the
secrets are the pitch. They range from "clear the hero building to nothing" to
"eat the police cruiser's licence plate without eating the cruiser".

**Exists today.** None. There is no achievement system in the game at all — no
`js/meta/` directory, no rules evaluator, no storage, no locker-room screen.

**Blocked on.** The place they get *saved*. An achievement is a permanent,
personal record, and the design makes it a database row evaluated by one shared
rule engine — which is the online backend, and the online backend is waiting on
the three things listed in §5 below. That is an inherited blocker, not a
Cambridge one; it would exist even if Cambridge did not.

**But the earning conditions are not blocked.** The design's one load-bearing
decision is that forty-four eggs do *not* become forty-four new things for the
game to measure. Instead one field — a per-scene bitmask of named discoveries —
carries all of them, so every achievement becomes a data row over a metric that
already exists. Across all thirty-eight Cambridge achievements exactly *one*
asks for a genuinely new measurement. The consequence for sequencing: build the
eggs and glyphs now, have each one set its bit, and the achievement rows are a
later insert rather than a later rewrite.

**Size.** Medium for the plumbing (the bitmask field, the discovery registry,
and a validator check that no achievement is unreachable and no bit index is
ever reused). Small per batch of rows after that. The rows themselves are the
cheap part by design.

**One flagged conflict, already surfaced by the design and still unresolved:**
achievement #35, "Road Warriors — complete all five city goals", becomes untrue
the moment Cambridge ships as a sixth city. The recommendation on the table is
to leave #35 alone and mint a new Cambridge-specific one rather than quietly
move a goalpost. Nobody has decided.

---

## 4. Championship belts

Designed in the online-flywheel package's belts-and-achievements document,
which was retired along with the legacy multiplayer stack on 2026-08-16 and
has no replacement yet. **Nothing built.**

**What a player gets.** Not one leaderboard with one winner, but a roster of
named championships held simultaneously by different people — the framing is
pro wrestling, deliberately. Each belt has one holder, a reign that is ticking
right now, a public number the holder set, and one way to take it: beat that
number. The design's own test is that if a player cannot explain to the person
behind them in line how to take the belt off them, the belt is designed wrong.

Nine belt types across four scopes come to **twelve live belts** at the
conference — a Heavyweight, four Sprint Straps (one per city), a Two-Minute
Title, an Unbroken Chain, an Iron Sprocket, a Main Event Belt, Tag Team Titles,
a 24/7 Belt, and a Rookie Strap. Twelve is a chosen number: enough that a dozen
people leave holding something, few enough that somebody walking past reads the
whole board in ten seconds.

**Exists today.** No belts, no leaderboards, no reigns, no board screen. Two of
the twelve are arena-only and so also depend on multiplayer.

**Blocked on.** The online backend, twice over. A belt needs somewhere to store
a holder and a reign, and — more importantly — the design says a run only takes
a belt after the server has re-played it from its seed and inputs and agreed
with the score. That replay check is the entire basis of trusting a leaderboard
at a conference, and it cannot exist client-side.

**Note for the Unbroken Chain belt specifically:** it ranks the longest chain,
and the game currently neither shows nor saves your best chain outside the
retired campaign (§1). Fixing §1 is a precursor to that belt meaning anything.

**Size.** Large, and it sits on top of the very large backend below rather than
beside it.

---

## 5. Multiplayer

Shipped in [features/multiplayer/](features/multiplayer/README.md), with the architecture decision recorded in [ADR-0019](adr/0019-six-player-invite-lobby-multiplayer.md).

### Shipped Architecture & Capabilities

1. **Direct Single-Player Map Parity**: Uses identical voxel city definitions, starting with the catalog levels:
   - Level 1: *The Lab* (`gallery`, 12k blocks)
   - Level 2: *Lower Manhattan* (`manhattan`, 25k blocks)
   - Level 3: *Brooklyn* (`brooklyn`, 40k blocks)
2. **Up to 6 Players (Host + 5)**: Configurable room capacity $N \in [2..6]$.
3. **Invite Links**: 5-character alphanumeric room codes (`?room=CODE`) with 1-tap clipboard copying and automatic URL routing.
4. **Staging Lobby & Deliberate Start**: Pre-game staging room with real-time player roster. Reaching capacity ($N/N$) does not start the match — the host presses start, or the non-hosts vote unanimously once the host has been idle 45s (needs $\ge 3$ seated). Either arms the same unskippable 3.0s synchronized countdown.
5. **Ephemeral Lobby Chat (Zero Storage / In-Memory Only)**: Real-time text messaging in the lobby. Zero database or disk persistence; completely unmounted on match launch with strictly zero in-game chat.
6. **Authoritative Host Simulation**: Host machine integrates fixed-step physics (`sim.step(1/60)`) and broadcasts compressed `STATE_SYNC` at 60 Hz over Supabase Realtime Broadcast.
7. **Authoritative PvP Hole Swallowing & Respawn Penalty**: Pairwise collision ($r_\text{large} > r_\text{small} \times 1.05$) consumes smaller rival, awards +50% mass bounty to killer, and puts victim into a 10.0-second timeout with fullscreen countdown overlay before perimeter respawn.
8. **Isolated Presentation & Coin Accounting**: Local controls, chase camera, audio listener, and HUD meters strictly follow `sim.localHole`. Coin pick-ups, toasts, and combo audio are strictly isolated to the collecting player with 0 cross-player coin leakage.
9. **Free Basic Color Skins**: 7 free 0-cost baseline skins (`baseline-cyan`, `baseline-crimson`, `baseline-amber`, `baseline-emerald`, `baseline-purple`, `baseline-orange`, `baseline-magenta`) assigned by slot.

**Status.** Shipped, fully playable, and verified with 100% automated test suites (`js/multiplayer/multiplayer.test.mjs`, `js/voxelsim.multihole.test.mjs`, `tools/validate.mjs`).

---

## 6. Cambridge — what is done and what is left

The map is **complete**. Ten districts, 72,943 blocks against an
under-75,000 target, no empty ground anywhere, and it loads from the free-play
picker on the title screen. The full validator run reports ALL PASS, and a
scripted drive through it reaches SIZE 7 against a floor of 4. That is Phases
0–6 of
[features/cambridge-sandbox/05-build-tasks.md](features/cambridge-sandbox/05-build-tasks.md),
all shipped.

What is left is Phase 7 — the hidden content covered in §3 above — and Phase 8,
which is sign-off rather than content:

- Re-run the full probe suite once Phase 7's content exists, and settle a patch
  of ground that currently belongs to no declared district. *Small.*
- Confirm the no-empty-ground result still holds after Phase 7 adds things.
  *Small.*
- A twelve-pose visual comparison of the two ways District 2 was authored, for
  you to look at and pick. This is the one gate whose answer is a judgement
  call rather than a number, and it is a genuine product question — what the
  city should look like. *Medium.*
- Fix the three shared building-block problems listed in §7. *Medium.*
- Documentation tidy-up in the same commit as the last code change. *Small.*

Two items sit outside the critical path because they are backend rows: the
Cambridge achievement rows (§3c) and adding Cambridge as a fifth Sprint Strap
scope, which takes the live belt count from twelve to thirteen and costs one
row and no design.

---

## 7. Known defects and debts worth surfacing

These are things already known to be broken or fragile, kept here because they
are small, unblocked, and the kind of thing that goes wrong in front of an
audience.

### A bad save file leaves the game stuck on "BUILDING CITY…" forever

The worst of the lot, because there is no error message and no way out. When a
city starts loading, the loading screen goes up and the game then reads three
settings straight out of the saved file without checking they are there
(`js/main.js:346-349`). If the saved file is present but its settings section is
missing or damaged, that read fails, and nothing catches it — the boot watchdog
in `index.html` is deliberately switched off once the game has started, so the
failure is silent. The player is left staring at "BUILDING CITY…"
(`js/ui/screens.js:136-142`) with the only trace in a console they will never
open.

This is not hypothetical. The same class of bug already shipped once and is
written up in the code: a missing section of the save file killed both buttons
on the results screen and stranded the player there (`js/save.js:49-56`). The
save loader does quarantine files it cannot parse, but a file that *claims* to
be the current version is handed through untouched (`js/save.js:277`), which is
exactly the case that reaches this line. **Size: small.**

### Three of the twelve building shapes do not do what their names say

The Cambridge scene introduced twelve named building-block shapes. Three of them
are recorded as unusable and were left that way deliberately, to be settled
together because they touch shared files and any change re-measures every
district:

- **The corbelled arch has been imported and never called since it shipped.**
  Not because it is broken, but because the shared quality check that looks for
  wrongly-spaced pieces fires on every arch — the "gap" it objects to *is* the
  arch's opening. It is a false alarm, but a red check is a red check, and two
  districts wanted an arch and both went without. Somebody has to decide: teach
  the check about arches, or drop the shape from the twelve and say so
  (`js/voxelscene-cambridge.js:9897-9907`, `tools/validate.mjs:657-690`).
  *(Correction to how this is sometimes described: there is no probe belonging
  to the arch that fails. It is the general placement check, and the arch trips
  it.)*
- **The half-dome only ever builds half a dome.** It skips every cell on one
  side of centre, so it works as an alcove against a wall but cannot close a
  dome on a rotunda, and the two mirrored calls that would close it write the
  same cells twice (`js/voxelkit.js:1774-1795`). MIT's Great Dome was built out
  of stacked rings instead.
- **The obelisk costs three and a half times what it should.** It is left over
  from before blocks could be stretched, so it stacks cubes: 1,480 blocks for a
  420-block job (`js/voxelkit.js:1627-1652`). The Bunker Hill Monument was built
  out of stacked piers instead.

Both the half-dome and the obelisk are still called in the Upper Manhattan
scene, so they are not dead code — they are shapes that quietly cost more or
look wrong wherever they are used. **Size: medium, as one job.**

### The automated check cannot see the picture

`tools/validate.mjs` is the project's entire test suite, and it drives the rules
of the game with no graphics attached — it never builds the renderer and never
draws a frame (`tools/validate.mjs:5-28`). That is a deliberate and valuable
design, but it means the check has a blind spot exactly where the player looks.

The cost was paid twice in one day. Once, the game shipped pointing at an
internet address for its 3D library; the fetch failed on a live connection, no
code ran at all, and the game sat on "LOADING…" forever — now fixed by shipping
the library with the game ([ADR-0014](adr/0014-vendored-same-origin-runtime.md)).
And once, a shader change collided with an internal name inside three.js, every
building material failed to compile, and the cities rendered ground, water and
birds — and not one building. Both passed a full ALL PASS run
(`.wiki/modules/render.md:503-529`).

There is no fix to "make the validator see the renderer" that is worth building
right now. The honest mitigation is the one the render notes already state:
**look at the picture** after any change to how things are drawn. Worth writing
down as a rule rather than leaving as a lesson. **Size: unknown as a code task
— a genuine automated screenshot check is a project of its own and has never
been scoped here.**

### Smaller, already recorded

- The shared building kit still holds Brooklyn-only builders, has two
  overlapping mechanisms for the same job, and contains builders nothing calls.
  An audit was asked for and never finished (`STATUS.md:11-30`). *Small–medium.*
- The list of files that require a validator run before committing is out of
  date: it omits three files the validator now exercises, including the whole
  Cambridge scene (`AGENTS.md:9-12`). *Small, and it protects everything else.*
- Deferred by decision and still open: a 101 ms stutter on the single worst
  collapse in Upper Manhattan, shadow edges going ragged at the largest sizes,
  and a road colour that reads as near-black gashes through Central Park
  (`STATUS.md:300-306`). *Small each; each is a trade rather than a bug.*
- Three Upper Manhattan authoring notes left for whoever next opens that scene —
  a bronze angel that reads near-black, a pond that is hard to find, and a
  castle standing too close to a wall (`STATUS.md:164-175`). *Small.*
- Two visual questions have been waiting on you and are genuinely yours: how low
  the sun sits, and whether the opening camera drifts or holds still
  (`STATUS.md:145-155`). *No build cost either way.*

---

## 8. Public scoreboards and player names

**What a player gets.** A board per city and one overall standing (THE
FLYWHEEL), a name claimed in a single field the first time a run earns a place —
no account, no email, no sign-in — and the knowledge that every number up there
was recomputed server-side from the run that produced it, so a score on the
board is a score somebody actually played.

**What exists today.** ADRs 0016 and 0017 are accepted and implemented. THE
RUN is Chicago-only, fixed at 90 seconds / 5,400 ticks, and emits a compact
quantized input trace. Vercel Functions mint/redeem tickets and replay the
shared pure sim; Supabase's additive private tables plus public rank-at-read
views publish only verified server scores. RECORDS / PROFILE, optional name
claim, transfer, reporting, moderation, deletion, and the durable offline
outbox are all present. The planning package remains the operational record.
Its central finding is that
[ADR-0012](adr/0012-replay-validated-leaderboard-trust.md)'s full re-simulation
of every ranked run is not affordable for the shipped voxel game, so 0016
narrows it: ranked scores come only from THE RUN, a bounded 90-second format
with a server-issued seed and one pinned tune, which puts a fixed, known price
on verification.

**What it is waiting on.** The release checks in the delivery spec, including a
real low-end touch-device measurement for the declared performance gate. The
Supabase project exists and is paid for; this feature is independent of the
remaining online-Flywheel phases.

**Size.** Large — five phases of T-tasks plus three measurement gates, with a
documented degrade order if any gate fails.

---

## If you want a suggested order

Nothing here is a commitment; it is what the dependencies suggest.

1. **Show the score.** The scoring system already works and the player cannot
   see any of it. It is the cheapest gap between "the game does this" and "the
   player knows the game does this" on the whole page, and the meters package
   in §2 is already being designed.
2. **Guard the save read.** One afternoon, and it removes a failure mode where
   the game simply never starts.
3. **Build Cambridge's eggs and glyphs.** The largest genuinely unblocked
   thing, the highest payoff with the specific audience the level was made for,
   and it needs nothing from anybody. Have each one set its discovery bit as it
   is built, so the trophy list is a later insert rather than a later rewrite.
4. ~~**Unblock the backend when you are ready**~~ **Done 2026-08-10** — the
   Supabase project and the Vercel deploy both exist now. Everything in the
   achievements, belts and multiplayer sections still needs building, but it
   is no longer waiting on you for this.
5. **Decide whether multiplayer is a race or a team job** (§5). It does not
   block the networking, but it does decide what gets built on top of it, and
   deciding late means building the scoring and results screens twice.
