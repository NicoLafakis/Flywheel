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
| Scoring and combos | A chain that builds while you keep eating and pays out more per bite | The rules run; almost none of it is shown or saved | Nothing | Small–medium |
| Score / combo meters and milestone hype | Seeing the number go up, and the game reacting when it does | No | Nothing — being specced now | See its own package |
| Easter eggs and ground glyphs (Cambridge) | 44 hidden things and 11 giant ground drawings to find | No | Nothing | Large |
| Achievements | A trophy list that remembers what you have done | No — 96 designed, 0 built | The online backend, for the *saving* half only | Medium (per batch) |
| Championship belts | Named titles somebody holds until you beat their number | No | The online backend | Large |
| Multiplayer | Share a link, others join, everyone in the same city at once | No | The online backend, plus one product decision | Very large |
| Cambridge map | A tenth-of-a-square-mile HubSpot Cambridge to drive around and eat | **Yes — complete and playable** | Nothing | Done |
| Cambridge hidden content | The things worth finding inside that map | No | Nothing (except the achievement rows) | Large |
| Known defects | Fewer ways for the game to break in front of somebody | Several open | Nothing | Small each |

Two things are worth pulling out of that table before the detail.

**Almost nothing here is actually blocked.** Only three rows need something
from outside: the achievement rows, the belts, and multiplayer — and all three
are waiting on the *same* thing, which is the online backend being switched on.
Everything else, including every piece of hidden content in Cambridge and every
scoring fix, could start immediately.

**The achievements are half-blocked, not blocked.** The 96 designed
achievements need somewhere to remember that you earned one, and that place is
the online backend. But the *things you do to earn them* — eating the trolley,
finding the ping-pong room, opening the six rooms of Two Canal Park — are level
content that needs no backend at all. That content can be built now, and the
trophy list bolted on later. Building it in the other order would be the
mistake.

---

## 1. Scoring and combos

**What a player gets.** Keep eating without pausing and a chain builds. While
the chain is alive each bite is worth more, so a clean uninterrupted run through
a dense street is worth materially more than the same blocks eaten one at a
time. Coins scattered around the map keep a live chain from lapsing while you
cross an empty stretch — they buy you time without counting as part of the
chain.

**What exists today.** All of the rules, and essentially none of the feedback.

The simulation genuinely tracks, per run: how many things you have eaten, your
mass, your position on the twelve-rung SIZE ladder, the current chain, the best
chain of the run, and a combo multiplier
(`js/voxelsim.js:170-174`, `:2332-2361`). Eating something starts or extends a
chain and resets a 1.5-second window; letting the window lapse drops the chain
to zero (`:95`, `:2370-2373`). Picking up a coin refreshes that window without
adding to the chain, exactly as designed — the code goes out of its way to keep
coins out of the chain count (`:363-386`, and the only line that increments a
chain anywhere in the file is `:2333`).

Two separate mass figures are kept, and the distinction matters: the
combo-multiplied figure is what drives your growth up the SIZE ladder, while an
un-multiplied figure drives the "percent of the city cleared" bar and the win
condition (`:2338-2339`, `:2461`). That is a good design — combos make you grow
faster without letting you win the level by comboing.

**What is missing, and it is most of the point.**

- **There is no score anywhere on screen.** Not in the HUD, not on the results
  screen, not in the stylesheet. The sandbox HUD shows percent cleared, your
  SIZE, and a coin count (`js/ui/hud.js:82-114`; the DOM is
  `index.html:35-62`). The number the whole scoring system produces is never
  shown to the player at any point.
- **The combo cap is effectively unreachable.** The multiplier is capped at 3×,
  but it climbs by one tenth for every twenty-five things eaten
  (`js/voxelsim.js:98`), so reaching 3× needs a chain of about five hundred
  without a 1.5-second gap. In practice a good run tops out near 1.2×. The
  campaign's version of the same rule steps per bite and reaches 3× at
  twenty-one (`js/sim.js:8-13`), and a comment in the sandbox still claims the
  two mirror each other. They have not for some time.
- **The one combo readout that exists is wrong.** A pill appears once your
  chain passes twenty-five and reads "COMBO x2" (`js/ui/hud.js:104`) at a
  moment when the real multiplier is 1.1×. It is showing a tier number, not the
  multiplier, so the number the player sees is not the number the game is
  using.
- **Nothing about a run's scoring is remembered.** Your best chain and your
  eaten count are dropped when the run ends — the sandbox save records only
  completions, best SIZE and best time (`js/save.js:315-325`, called from
  `js/main.js:638-639`). The campaign *does* save best combo and even pays
  coins for it (`js/save.js:302-313`, `js/levels.js:87-89`); the sandbox, which
  is the part of the game people actually play, saves neither.
- **The sandbox results screen says nothing about how you played** — only the
  goal name, percent cleared, coins and bonus (`js/ui/screens.js:148-161`). The
  retired campaign's results screen does show best combo (`:258`).

**Blocked on.** Nothing.

**Size.** Small to medium. Making the numbers visible and saving them is small.
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
game: fifty-eight designed in the online package
([features/online-flywheel/06-belts-and-achievements.md](features/online-flywheel/06-belts-and-achievements.md)
§6) and thirty-eight more for Cambridge, numbered 59–96, twenty of them secret
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

Designed in
[features/online-flywheel/06-belts-and-achievements.md](features/online-flywheel/06-belts-and-achievements.md).
**Nothing built.**

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

Designed across fourteen documents in
[features/online-flywheel/](features/online-flywheel/README.md), with the
architecture decision recorded and **accepted on 2026-08-06** in
[ADR-0010](adr/0010-host-authoritative-arena.md). **As of 2026-08-10 this is
live and playable, on a standalone page, not wired into the game.** Phase 6
(the live arena, `13-tasks.md`) shipped substantially ahead of Phases 1-5 by
product decision — Nico chose "two phones ASAP" over building the plan in
order. `js/net/host.js` (the authority loop) and the new `js/net/peer.js`
(the follower loop) are wired end to end: proven first over a loopback
simulator (`netdemo.html`), then over real Supabase Realtime in a two-device
arena (`arena.html`, `js/net/arena.js` — 5-char codes, JOIN/WELCOME/REJECT/
ROSTER handshake, no server-side room minting yet), played to a real,
completed match at https://flywheel-woad.vercel.app/arena.html. Still not
called from `js/main.js` or any campaign/sandbox screen. Still open: host
migration/succession, server-minted rooms, spectators, more than two seated
players (the netcode supports up to 8), and everything in Phases 1-5
(accounts, boards, belts) that a booth arena would want to sit on top of.
`tools/net-match-selftest.mjs` (48 checks incl. a bit-exact host replay),
`tools/arena-selftest.mjs` (48 offline checks) and `tools/net-live-selftest.mjs`
(18/18 against the live project) cover it.

### The shape

The shape you asked about is the shape that is designed. One player opens a
room and gets a short code — four characters, with the letters and digits that
sound alike removed — plus a shareable join URL that the booth screen also
renders as a QR code. Others join by typing the code, pasting the URL, or
tapping a single **quick join** button that finds the newest open room for
them; the design's own line is that a player at a booth should never have to
know what a room code is. The room stays alive at the same code all day, so a
card on the table keeps working between rounds
(`04-netcode-design.md` §2, `01-prd.md` FR-010/FR-011).

Under it, the first person into a room becomes the authority: their machine
runs the one true simulation and broadcasts the state twelve times a second;
everyone else sends steering and draws what they are told. If the host closes
their laptop, the database picks a replacement in about two seconds and the
match continues (ADR-0010).

**What actually shipped 2026-08-10 is the demo-grade cut of this shape, not
the full design above.** `js/net/arena.js` mints a **5**-character code (the
design specifies four) client-side rather than server-side, so there is no
atomic capacity check and no quick-join button yet; there is no QR code on
the join screen; and closing the host's laptop today **freezes the match**
("HOST LEFT") rather than electing a replacement — succession is T-606, still
open. What is real: two people on different devices, anywhere on the
internet, race the same deterministically-seeded city and see each other
move, live, over Supabase Realtime.

### The open product decision: are we racing each other, or helping each other?

This is the one genuine product question on this page, and it belongs to you,
not to the engineering.

**What is designed is a race.** Everyone drops into the same city at the same
moment and competes to eat the most before a shared clock runs out
(`01-prd.md` G3, FR-017). The whole belt and leaderboard structure sits on top
of that: somebody wins, somebody holds a title, and the board is the point.

**What you described is a team job.** Everyone in the same city working
together to clear the whole thing to 100%.

They are both good, and they are not the same product.

| | Racing each other | Clearing it together |
|---|---|---|
| What it feels like | Competitive, loud, a winner every two minutes | Companionable, a shared bar filling |
| Who it suits at a booth | Two strangers who want a quick contest | A group who arrived together |
| What it does for the belts | Feeds them directly — the whole title roster assumes a winner | Produces no ranking of its own; belts would need a separate solo mode to feed them |
| Failure mode | One strong player makes it a non-contest for the rest | One strong player does most of the work and nobody minds — the weakest link never spoils it |
| Cost to build | It is what the fourteen documents specify | Same networking; different scoring, different end condition, different results screen |

The networking is identical either way — the expensive part is unaffected by
this choice. What changes is scoring, the end condition, and what the results
screen says. It is also entirely possible to ship both as two buttons, since
they share everything below the scoring layer; that is a scope call rather than
an architectural one.

**One correction to the assumption behind the question.** The sandbox goals
have *not* all been switched to 100% clearing. Only the generic SANDBOX gallery
scene requires clearing everything; Cambridge, Brooklyn, Boston, and both
Manhattans still end at 50% of the map (`js/voxelsim.js:99-106`). So "everyone
works together to clear 100%" would be a new goal shape for the real city maps,
not the existing one.

### Why avoiding a backend is not the cheap path

It is reasonable to ask why several people in one city needs a paid service at
all. ADR-0010 looked at this directly and the honest answer is that the
alternatives cost more, not less.

- **Connecting players directly to each other, browser to browser,** is the
  obvious cheap answer and it was rejected for a specific reason: conference
  guest wifi isolates clients from one another, so two people on the same
  network cannot reach each other. Making it work needs a relay server sitting
  in the middle — which is exactly the always-on server that avoiding a backend
  was meant to avoid, with worse ergonomics on top.
- **Three other options were rejected for adding a server or a build step.** A
  dedicated game server is the textbook right answer and was refused on cost
  and operations, not correctness. Off-the-shelf multiplayer services
  (PartyKit, Colyseus, Cloudflare Durable Objects) each add a build step and a
  second thing to deploy, which collides with the decision that this game ships
  as plain files with no build. Running the authority inside a serverless
  function was rejected because those are request-scoped and cannot hold a
  match open — it is the dedicated server again, worse.
- **A fourth option, lockstep,** was rejected for a product reason rather than
  a technical one: it advances at the speed of the slowest player and stalls
  when anyone walks away, and somebody walking away mid-match is the normal
  case at a booth.

There is also an honest limit written into the decision: because the host's
machine is the authority, a host colluding with a friend could produce a
consistent fake result. Closing that fully needs the dedicated server that was
declined. It is written down rather than hidden.

**Blocked on.** Down to one thing now, tracked in `STATUS.md`: the actual
UNBOUND dates and booth hours, which several capacity numbers depend on. The
credential handover that used to block everything is done as of
2026-08-10 — Supabase project `flywheel` (ref `zrsrvhrkgfuqhcjnjezw`,
us-east-1, Pro plan — the $25/month figure, confirmed, not the $10/month one
from an earlier conversation) and Vercel project `flywheel`
(https://flywheel-woad.vercel.app, GitHub-connected) both exist, per
[SETUP-FOR-NICO.md](features/online-flywheel/SETUP-FOR-NICO.md).

**Size.** Very large — 88 ordered tasks across eight phases, of which
multiplayer itself is the seventh. The plan is explicitly built to be cut from
the tail: a booth with leaderboards, belts and sign-in but no live arena is
still a good booth.

**Partly started, incidentally.** One task from the plan's first phase is
already done for unrelated reasons — three.js now ships with the game instead
of loading from the internet ([ADR-0014](adr/0014-vendored-same-origin-runtime.md)).
One number in the plan has also drifted: it specifies a save-file upgrade from
version 13 to 14, and the game is already on version 15 (`js/save.js:5`). That
is a renumbering, not a redesign.

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
- Audio is still placeholder blips (`STATUS.md:298`). *Unknown — depends
  entirely on what "real audio" should be, which is a product question.*
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
