# Online Flywheel — Belts and Achievements

> [Objective overview](00-objective-overview.md) ·
> [PRD](01-prd.md) ·
> [Requirements](02-requirements.md) ·
> [Technical design (owns the schema)](03-technical-design.md) ·
> [Netcode](04-netcode-design.md) ·
> [Identity](05-identity-and-accounts.md) ·
> [Rollout & runbook](08-rollout-and-runbook.md)

This is the content design for meta-progression: the **belts** (contested,
transferable, one holder at a time) and the **achievements** (permanent, personal,
unlimited holders). Two different jobs, deliberately kept apart.

The framing is the owner's, verbatim: *"Multiple titles are up for grabs just like
in pro wrestling."* Not one leaderboard with one number at the top — a **roster of
championships held simultaneously by different people**, each with a holder, a
reign that is ticking right now, and a specific way to be taken. That framing is
not decoration on top of a scoreboard; it is the thing that makes a booth board
work, because a single-number board has one winner all day and a roster of belts
has a dozen people in the room who can each truthfully say they are a champion.

Lean into it in every player-facing string. Internally, keep the nouns exact.

---

## 1. What a belt is

A **belt** is a named championship over one metric, at one scope, with one holder.

| Property | Meaning |
|---|---|
| **Name** | Wrestling-flavoured, player-facing. The one string everybody quotes. |
| **Metric** | A single number reported by a completed, server-verified run (§7). |
| **Direction** | `max` (most mass) or `min` (fastest time). |
| **Scope** | Which population it is contested in (§3). |
| **Qualifier** | The floor below which a run cannot take the belt at all. Stops a belt being held on a fluke or an empty field. |
| **Holder** | Exactly one profile — or a pair, for the tag belts — or `VACANT`. |
| **Reign** | `won_at`, and for a closed reign `lost_at`. Reign length is a **displayed fact, never a tiebreaker** (§5). |
| **Standing number** | The metric value that won it. Always public. This is the number a challenger is chasing, and it is shown everywhere the belt is shown. |
| **Lineage** | The full ordered history of reigns, plus a live top-N contenders list used for instant re-award (§5). |

Non-negotiables that make the whole thing legible:

1. **You take a belt by beating the number.** Not by points, not by an average,
   not by a ranking formula. One number, one comparison, done. If a player cannot
   explain to the person behind them in line how to take the belt off them, the
   belt is designed wrong.
2. **Only verified runs count.** A run takes a belt after server-side
   deterministic replay of its seed and input trace passes — see
   [09-threat-model.md](09-threat-model.md),
   [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md) and ADR-0003.
   The belt-change moment fires optimistically on the client and is reconciled
   within seconds; a failed replay strips it (§5). **Ten of the twelve belts are
   fed only by replay-validated single-player runs.** The two arena-only belts
   (§2.6, §2.7) are the named exception: they rank arena play, so they are fed by
   arena rounds — and only by rounds whose session verdict is `verified` (whole-
   room replay, every present peer attested, no host migration). An `attested`
   or `disputed` round never moves a belt of any kind.
3. **Guests can hold belts.** A rung-1 guest with a handle is a full champion. Any
   other rule turns the belt roster into the sign-in wall that
   [ADR-0011](../../adr/0011-guest-first-identity-deferred-claim.md) exists to
   avoid.
4. **The number is never rewritten after the fact.** No decay, no ageing, no
   inflation adjustment. What someone did is what they did.

---

## 2. The roster

Nine belt *types*. Each type is minted at one or more scopes (§3), which is what
turns nine types into roughly a dozen live titles at the show.

### 2.1 The Heavyweight Championship
> *"The biggest hole in the building."*

- **Metric:** peak SIZE reached in a single run (SIZE 1–12 plus its fraction, so
  ties are rare). `max`.
- **Qualifier:** SIZE 6.
- **How it is taken:** exceed the standing SIZE in any single run, any city.
- **Why it leads the roster:** it is the fantasy of the game stated as a number.
  It is also the slowest belt to take, so it is the one that produces long reigns
  and a recognisable champion — which is exactly what a roster needs one of.

### 2.2 The Sprint Strap
> *"Nobody eats a city faster."*

- **Metric:** elapsed time to the city goal (50% cleared). `min`.
- **Qualifier:** the goal must actually be reached; no partial runs.
- **How it is taken:** beat the time in the same city. **City-scoped by nature** —
  Brooklyn and Boston are not the same race and pretending they are would make the
  belt meaningless.
- **Character:** the skill belt. Changes hands most often among repeat players,
  because it rewards route knowledge, which is the thing that improves fastest.

### 2.3 The Two-Minute Title
> *"Cash it in before the clock does."*

- **Metric:** total mass eaten in the **first 120 seconds** of a run. `max`.
- **Qualifier:** the run must last the full 120 s.
- **How it is taken:** out-eat the number in a fresh run's opening two minutes.
- **Why this belt exists at all:** it is the belt for a person who has ninety
  seconds and a conference badge. It does not require finishing anything. It is
  the most winnable serious belt at a booth, and it should be advertised on the
  kiosk as such.

### 2.4 The Unbroken Chain
> *"Never stopped eating."*

- **Metric:** longest single combo chain in one run. `max`. The sandbox awards a
  combo level per 25 blocks and the window is 1.5 s (`js/voxelsim.js`), so this is
  a real, continuous-pressure skill and not a lucky moment.
- **Qualifier:** chain of 100.
- **Character:** the style belt. Uncorrelated with the Heavyweight, which is the
  point — a player who cannot out-grow anyone can out-flow everyone.

### 2.5 The Iron Sprocket
> *"Eats a city a day."*

- **Metric:** career total mass across every verified run. `max`.
- **Qualifier:** 10 completed runs.
- **How it is taken:** by playing more, and only by playing more.
- **Character:** the grind belt, the only cumulative one. Deliberately included
  because it is the one belt a player can take *while losing every other race*,
  and every roster needs a title the crowd's favourite can actually win.
- **Reign note:** the Iron Sprocket changes hands quietly and often. It is
  announced on the results screen, never on the Titantron, or it would drown
  everything else out.

### 2.6 The Main Event Belt  *(live arena only)*
> *"Won in front of everybody, or not at all."*

- **Metric:** arena match wins. Held by whoever won the most recent arena match
  that the holder was in — i.e. **you keep it until someone beats you in a live
  arena.** `max` on wins, with the live-match tiebreak.
- **Qualifier:** an arena match with at least 3 human players.
- **How it is taken:** be in the same arena as the holder and finish above them.
  If the holder is not present, winning the match makes you **#1 contender**, not
  champion, and the Titantron says so by name. Contender status expires at the end
  of the conference day.
- **Why it is the belt that cannot be won alone:** every other belt in this roster
  is a number you can set by yourself in a corner. This one requires the holder to
  be in the room, which is precisely what a booth has and a website does not. It
  is the reason the arena exists as a product rather than a feature.
- **Defence pressure:** the holder is prompted, once per hour they are online, with
  "OPEN CHALLENGE — defend the Main Event Belt" as a one-tap arena entry.

### 2.7 The Tag Team Titles  *(live arena only, two holders)*
> *"Two holes, one city."*

- **Metric:** combined mass of a two-player team in a single arena match. `max`.
- **Held by a pair.** Both names on the belt, one reign, one lineage entry.
- **Team formation:** pair up in the arena lobby, or — the booth version — the two
  kiosks are adjacent, and a **TEAM UP** button on each pairs them for the next
  match. Two strangers in a queue becoming a tag team for ninety seconds is the
  best social moment available at a booth and it costs one button.
- **Taking it:** any pair beating the combined number. **The pair does not have to
  be the same two people** — teams are ad hoc, which keeps the belt live all day
  instead of dying when one holder leaves.
- **UNBOUND scope only.** A persistent all-time tag title with ad-hoc pairs would
  reward whoever happened to queue next to the best player.

### 2.8 The 24/7 Belt
> *"No rules, no waiting, no ceremony."*

- **Metric:** most recent run, anywhere, above a **deliberately low** floor
  (Heavyweight SIZE 4 equivalent, or any completed city goal). `latest`, not `max`.
- **How it is taken:** finish a qualifying run. That is the entire rule. It changes
  hands constantly — dozens of times an hour at a booth — and it is *supposed* to.
- **Reign length is the whole joke and the whole point.** The Titantron shows the
  24/7 reign clock in seconds, and the shortest reign of the day is its own
  celebrated stat ("**shortest reign: 41 seconds**").
- **Why it earns its slot:** it is the pressure-release valve on the entire system.
  Every single person who plays at the booth can hold a championship for at least a
  moment, and can watch someone take it from them in real time, which makes the
  serious belts read as aspirational rather than closed.

### 2.9 The Rookie Strap
> *"First time in the building."*

- **Metric:** best Heavyweight-equivalent peak SIZE, **restricted to a player's
  first three runs ever.** `max`.
- **Structurally unwinnable by anyone who has played four times.** Not a handicap,
  not a hidden multiplier — a different, honestly-labelled competition that
  veterans have aged out of. It reads as "best debut", which is a real wrestling
  category.
- **UNBOUND scope only.** It is a first-day-of-the-show belt.
- This is one of the four answers to the day-one-champion problem (§5.3), and the
  cleanest one, because it does not distort any other belt.

---

## 3. Belts and the four board scopes

The four leaderboard scopes are UNBOUND (event), per city, per level, and
all-time. **Belts are not minted at all four**, and this is a real decision, not
an omission.

**Per-level scope has boards but no belts.** 100 levels × even three belt types is
300 championships, which is not a roster, it is a spreadsheet. A belt is valuable
in exact proportion to how few of them exist and how many people are chasing each
one. Per-level boards remain — they are where a player sees their own mastery of a
specific level, they feed several achievements, and they are how the campaign stays
competitive — but nobody wears a belt for level 47.

| Belt | UNBOUND | Per city | Per level | All-time |
|---|:---:|:---:|:---:|:---:|
| Heavyweight Championship | ● | ● | board only | ● |
| Sprint Strap | ● | ● *(the natural home)* | board only | ● |
| Two-Minute Title | ● | ● | board only | — |
| Unbroken Chain | ● | ● | board only | ● |
| Iron Sprocket | ● *(mass eaten at the show)* | — | — | ● |
| Main Event Belt | ● | — | — | ● |
| Tag Team Titles | ● | — | — | — |
| 24/7 Belt | ● | — | — | ● |
| Rookie Strap | ● | — | — | — |

Live at UNBOUND, therefore: 1 Heavyweight + 4 Sprint Straps (one per voxel city) +
1 Two-Minute + 1 Chain + 1 Iron + 1 Main Event + 1 Tag + 1 24/7 + 1 Rookie =
**12 belts**. Twelve is the designed number: enough that the wall of champions
looks like a roster and enough people leave holding something, few enough that a
person walking past can read the whole board in ten seconds.

### Why UNBOUND is a scope and not a filter

An UNBOUND belt and an all-time belt are different objects with the same metric,
and conflating them would break both:

- **An all-time belt is a record.** Its holder may be someone who played six months
  ago and is not in the building. Its reign is measured in weeks. Long reigns are
  the *appeal* — dethroning a four-month champion is a story.
- **An UNBOUND belt is a live competition among people who are physically present
  for three days.** Long reigns are the *failure mode*. It resets, it churns, and
  it is the one on the big screen.

So they are separate rows with separate reigns and separate rules, and a single run
can legitimately take three belts at once (the city Sprint Strap, the UNBOUND
Sprint Strap, and the all-time Sprint Strap). When that happens the results screen
says so, one card per belt, and it is the best moment the game has.

**Scoping rule:** a run is UNBOUND-scoped if it was submitted with the event tag
(kiosk URL, or a claimed profile that opted into the event — see
[05-identity-and-accounts.md](05-identity-and-accounts.md) §6). Event scoping is
recorded on the run at submission and is immutable afterwards, so nobody can
retroactively enter the show.

---

## 4. Title defences

A defence is not a separate mode. **A defence is any run by the holder that would
have taken the belt if they did not already hold it** — i.e. they beat their own
standing number. It increments a `defenses` counter, extends nothing, and updates
the standing number, which makes the belt harder to take. That is the whole
mechanic, and it means a champion who keeps playing keeps raising the bar without
any new UI.

Three things hang off it:

- **The defence count is the holder's brag.** "3× defended" next to a name is more
  interesting than a reign clock, because it is a thing they did rather than a
  thing that happened while they were away.
- **Open Challenge** applies only to the Main Event Belt (§2.6), because it is the
  only belt whose taking requires the holder's participation.
- **No forced defences anywhere else.** A "defend within N hours or vacate"
  mechanic punishes a champion for being in a conference session, which is where
  our champions will literally be.

---

## 5. Vacancy, stripping, and the day-one champion

### 5.1 The holder leaves and never comes back

The default and correct answer for **all-time and per-city** belts: nothing
happens. They remain champion. That is what a record is. The reign clock keeps
running and eventually somebody beats the number.

For **UNBOUND** belts, absence is fatal by design: every UNBOUND belt **vacates at
the end of each conference day** and is contested fresh the next morning. Three
days, three sets of day champions, plus one **UNBOUND Grand Champion** per belt
computed at the end of the show from the best number across all three days. This
does more work than any other single rule in this document — it guarantees that a
person arriving on day three walks up to a board of vacant belts, not a board of
locked ones.

### 5.2 Stripped runs

A run that fails server-side replay verification is invalidated. If it had taken a
belt:

- The reign is closed with `outcome = 'stripped'` and stays in the lineage, named
  as stripped. **We do not quietly delete it** — a belt that changed hands in front
  of a room and then silently un-changed is worse than an honest asterisk.
- The belt is re-awarded **from the contenders list**, not recomputed by scanning
  every run: each belt maintains a materialised top-N (N = 10) of valid runs, so
  re-award is one lookup and is instant even mid-show.
- If the contenders list is empty above the qualifier, the belt goes `VACANT`.
- Same path for a **deleted account** (see
  [05-identity-and-accounts.md](05-identity-and-accounts.md) §5): reigns are
  retained with the name replaced by `[vacated]`, and the current belt, if they
  held it, passes to the next contender.

### 5.3 "Nobody can dethrone the day-one champion"

The real failure mode, stated honestly: at 9:05am on day one someone sets a
Heavyweight number. By noon a hundred people have looked at a board they cannot
touch, and the belt system has become decoration. Four mechanisms, applied
together, none of which involve lying about anyone's score:

1. **Daily vacancy on every UNBOUND belt** (§5.1). The strongest lever. There is no
   such thing as a multi-day UNBOUND reign, so the ceiling resets once per show
   day — twice over a three-day show, once over a two-day one. ⚠ This doc assumes
   three show days; [07](07-test-strategy.md) §7's load model assumes two, and the
   discrepancy is flagged there. Nothing here breaks either way — the mechanism is
   "vacate nightly", not "vacate twice".
2. **The Rookie Strap** (§2.9). A belt that a day-one champion is structurally
   ineligible for after their third run.
3. **The 24/7 Belt** (§2.8). A championship with a floor low enough that finishing
   a run takes it. Nobody who plays leaves without having held a title.
4. **Breadth over height.** Twelve belts across metrics that do not correlate. The
   player who cannot out-grow the Heavyweight champion can very plausibly out-chain
   them, out-sprint them in one specific city, or out-team them.

And one presentation rule that is worth as much as the four mechanics:

5. **The number to beat is always in front of the player, and so is their gap to
   it.** The results screen never just says "4th". It says *"Sprint Strap:
   1:42.6 — you were 6.1s off"*, with a one-tap **RUN IT BACK** that drops them
   straight into that exact city. A gap you can see is a challenge; a rank you
   cannot decompose is a wall.

### 5.4 Explicitly rejected fixes

- **Score decay / ageing the holder's number down.** Rejected: it rewrites what
  someone did, which breaks rule 4 of §1 and is instantly noticed and resented.
- **Handicaps or multipliers for newer players.** Rejected: a leaderboard whose
  numbers are not comparable is not a leaderboard, and the moment a player
  discovers an invisible modifier they stop trusting every other number.
- **Resetting all-time belts periodically.** Rejected: that is what the UNBOUND
  scope is for. Having both a permanent record and a churning event board is the
  entire justification for having two scopes.

---

## 6. Achievements

Belts are contested and scarce. Achievements are the opposite: **unlimited
holders, permanent once earned, and mostly earnable solo and offline.** They are
the reason a player who will never hold a belt still has a reason to open the game
on the train home.

Structure:

- **Card position** (rarity tier, wrestling-flavoured): **Opener** → **Midcard** →
  **Main Event** → **Legend**.
- **Visibility:** *Visible* achievements are listed unearned, with their condition,
  because a visible goal is a reason to play. *Secret* ones show as a locked slot
  with a `???` name and no condition; they exist to be discovered and talked about.
  Roughly 20% secret — enough to make the Locker Room feel like it has a floor
  under it, few enough that the list still reads as a to-do list.
- Everything below is grounded in mechanics that exist today: the tier 1–7 ladder,
  the SIZE 1–12 sandbox ladder, combos, golden props, AI rivals, tide events,
  shielded capstone landmarks, the five voxel scenes and their named goals, star
  ratings, coins, and the skin roster in `js/skins.js`.

### 6.1 Opening card — first steps

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 1 | **First Blood** | Swallow your first object. | Opener | Visible |
| 2 | **Curtain Jerker** | Complete any city goal for the first time. | Opener | Visible |
| 3 | **Sizing Up** | Reach SIZE 5 in any city. | Opener | Visible |
| 4 | **Cold Open** | First eat within 1.0 s of spawn (the snack ring, done right). | Opener | Visible |
| 5 | **Signed to a Contract** | Claim your account by any of the three paths. | Opener | Visible |

### 6.2 The ladder

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 6 | **Up a Weight Class** | Eat your first tier-3 (a car). | Opener | Visible |
| 7 | **Bus Fare** | Eat your first tier-4 (a bus). | Opener | Visible |
| 8 | **Heavy Machinery** | Eat your first tier-6 (a medium building). | Midcard | Visible |
| 9 | **Skyline Removal** | Eat your first tier-7 (a large building). | Midcard | Visible |
| 10 | **The Full Card** | Eat at least one object of all seven tiers in a single run. | Midcard | Visible |
| 11 | **Maxed Out** | Reach SIZE 12. | Main Event | Visible |
| 12 | **Clean Sweep** | Clear **100%** of a city, not the 50% the goal asks for. | Legend | Visible |

### 6.3 Combos and style

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 13 | **Chain Reaction** | Reach the ×3 combo cap. | Midcard | Visible |
| 14 | **Unbroken** | A single chain of 500 blocks. | Main Event | Visible |
| 15 | **Metronome** | Hold an unbroken chain for 60 continuous seconds. | Main Event | Visible |
| 16 | **No Brakes** | Complete a city goal without the combo multiplier ever falling below ×2. | Legend | **Secret** |
| 17 | **Botch** | Go 60 seconds mid-run without eating anything. | Opener | **Secret** |

### 6.4 Campaign mechanics

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 18 | **Midas Touch** | Eat a golden prop. | Opener | Visible |
| 19 | **All That Glitters** | Eat every golden prop in a single level. | Main Event | Visible |
| 20 | **Ratings Grab** | Take a golden prop a rival was already closing on. | Midcard | **Secret** |
| 21 | **Out-Eaten** | Finish a level with more mass than all rivals combined. | Midcard | Visible |
| 22 | **Three-on-One** | Win a level carrying three rivals. | Midcard | Visible |
| 23 | **High Ground** | Survive a tide event without being pushed by the bounds. | Midcard | Visible |
| 24 | **Against the Tide** | Clear a level with three tide events. | Main Event | Visible |
| 25 | **Shield Breaker** | Drop a capstone landmark's shield. | Midcard | Visible |
| 26 | **Capstone** | Swallow a capstone landmark. | Midcard | Visible |
| 27 | **Perfect Show** | Three stars on any level. | Opener | Visible |
| 28 | **Metro Sweep** | Three stars on all 20 levels of one metro. | Legend | Visible |
| 29 | **The Hundred** | Complete all 100 campaign levels. | Legend | Visible |

### 6.5 The cities

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 30 | **Connect the Boroughs** | Complete Brooklyn's goal. | Opener | Visible |
| 31 | **Swallow the Seaport** | Complete Boston's goal. | Opener | Visible |
| 32 | **Open the Financial District** | Complete Lower Manhattan's goal. | Opener | Visible |
| 33 | **Reclaim Central Park** | Complete Upper Manhattan's goal. | Opener | Visible |
| 34 | **Clear the Collection** | Complete the sandbox gallery's goal. | Opener | Visible |
| 35 | **Road Warriors** | Complete all five city goals. | Main Event | Visible |
| 36 | **Bridge and Tunnel** | Eat both Brooklyn bridges in one run. | Midcard | **Secret** |
| 37 | **Landscaper** | Clear Central Park's greenery entirely in Upper Manhattan. | Midcard | **Secret** |
| 38 | **Harbormaster** | Complete Boston's goal without crossing inland of the waterfront. | Legend | **Secret** |

### 6.6 Coins, shop, and the wardrobe

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 39 | **Coin Purse** | Collect all 60 coins in a single city. | Midcard | Visible |
| 40 | **Window Shopper** | Buy your first skin. | Opener | Visible |
| 41 | **Represent** | Equip a partner skin. | Opener | Visible |
| 42 | **The Whole Roster** | Own every partner skin. | Legend | Visible |
| 43 | **Full Wardrobe** | Own every non-partner skin. | Legend | Visible |
| 44 | **Compounding** | Bank 10,000 career coins. | Main Event | Visible |
| 45 | **Sprocket Drive** | Reach SIZE 12 wearing the Sprocket Drive skin. | Midcard | **Secret** |

### 6.7 The live arena

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 46 | **Debut** | Finish one live arena match. | Opener | Visible |
| 47 | **Over** | Win a live arena match. | Midcard | Visible |
| 48 | **Ironman** | Win five arena matches in a row. | Main Event | Visible |
| 49 | **Spoiler** | Take a belt off its holder in a live arena. | Main Event | Visible |
| 50 | **Hometown Crowd** | Win an arena match with six or more players in it. | Main Event | Visible |
| 51 | **Jobber to the Stars** | Lose ten arena matches. | Opener | **Secret** |

### 6.8 Belts and the show

| # | Name | Unlocks when | Position | Visible |
|---|---|---|---|:--:|
| 52 | **First Reign** | Hold any belt, for any length of time. | Midcard | Visible |
| 53 | **Double Champ** | Hold two belts simultaneously. | Main Event | Visible |
| 54 | **Grand Slam** | Hold four belts simultaneously. | Legend | Visible |
| 55 | **Long Reign** | Hold one belt continuously for 24 hours. | Main Event | Visible |
| 56 | **In Attendance** | Play a run tagged to UNBOUND. | Opener | Visible *(during the event)* |
| 57 | **Partner Up** | Claim your account with HubSpot. | Midcard | Visible |
| 58 | **Ringside** | Have your run shown on the Titantron. | Opener | **Secret** |

58 named achievements, 11 of them secret. The catalog is **content**, not code
(§7) — the count above is the launch set, not a limit, and adding number 59 during
the conference is an insert.

---

## 7. Belts and achievements as data

The load-bearing requirement: **a new belt or a new achievement is a row, not a
deploy.** During a three-day conference the ability to add "Best run wearing a
partner's skin, sponsored by that partner" at lunchtime is worth more than any
individual belt in §2.

### The three layers

**1. The metrics registry — the only part that is code.**
Every completed run submits a fixed, flat summary of numbers. That set is small,
named, and versioned:

```
peak_size, final_mass, mass_at_120s, clear_fraction, elapsed_to_goal,
longest_chain, chain_seconds, coins_found, goldens_eaten, tiers_eaten_mask,
tides_survived, landmark_eaten, rivals_beaten, stars, city, level_index,
arena_match_id, arena_placement, arena_players, run_ordinal, event_tag
```

Adding a belt or achievement over an **existing** metric is data. Adding one that
needs a **new** metric costs one field in the run summary plus its computation in
the sim — a small, well-understood code change with a schema bump behind it. Say
this out loud to whoever asks for a new belt: *most* requests are free, and the
ones that are not are the ones asking the game to measure something it has never
measured.

**2. The definitions — rows.**
`belt_defs` and `achievement_defs` are content tables owned by
[03-technical-design.md](03-technical-design.md). Each carries its name, flavour
line, card position / scope, and a **rule** expressed as a small JSON predicate
over the metrics registry:

```json
{ "all": [ { "metric": "clear_fraction", "op": ">=", "value": 1.0 },
           { "metric": "city", "op": "in", "value": ["brooklyn","boston"] } ] }
```

Only the operators the catalog actually needs — `>=`, `<=`, `==`, `in`,
`bitmask_all`, and the `all` / `any` combinators. Not a scripting language: a
predicate a designer can write and a reviewer can read, with no ability to loop,
call out, or cost unbounded time.

**3. The evaluator — one pure module, two runtimes.**
`js/meta/rules.js`: no three.js, no DOM, no `Math.random()`, evaluating a
predicate against a metrics object and returning matches. This is the same
discipline as the sim/render split in [ADR-0002](../../adr/0002-sim-render-split.md),
for the same reason and with the same payoff:

- The **browser** runs it the instant a run ends, so the belt card and the
  achievement toast fire immediately with no round trip — which matters enormously
  on conference wifi.
- The **server** (Edge Function, after replay verification) runs the identical
  module and is authoritative. Client and server disagreeing is then a *bug in one
  input*, not two implementations drifting.
- **`tools/validate.mjs`** can import it and assert the whole catalog is sane:
  every rule references a metric that exists, every belt has a qualifier below
  which it cannot be held, no achievement is unreachable, no two belts at one scope
  share a metric-and-direction. A catalog that lies is caught before it ships,
  exactly as a level that cannot be beaten is today.

### Runtime state

`belt_reigns` (append-only: one row per reign, open reigns have `lost_at IS NULL`),
`belt_contenders` (materialised top-10 per belt, for instant re-award — §5.2), and
`achievement_unlocks` (`profile_id`, `achievement_id`, `unlocked_at`, `run_id`).
Column-level truth, RLS, and the uniqueness constraint that makes "one open reign
per belt" impossible to violate all live in
[03-technical-design.md](03-technical-design.md).

**Offline behaviour:** achievement unlocks are computed locally and cached in the
v13 save under a new `meta` key, then reconciled on next connect (union, never
overwrite — see [12-migration-plan.md](12-migration-plan.md)). Belts are **never**
awarded offline. A championship is a claim about other people, and you cannot make
one alone.

---

## 8. Where the player sees all this

Four surfaces. Each has a different job and a different volume level.

### 8.1 The results screen — the belt check

The existing results screen (`js/ui/screens.js`, `showResults` /
`showSandboxResults`) grows one section, below the stars and coins, and it is the
most important twenty pixels in the whole feature:

- **Took a belt:** a full-width card in the brand block-letter treatment
  (`buildBlockWord`, the shared `.fw-*` layer — see
  [ADR-0005](../../adr/0005-shared-brand-layer.md); never a bespoke style here) —
  **NEW CHAMPION**, the belt name, the number, and *"taken from Nico L."* One card
  per belt if a run took several, stacked, animated in sequence rather than at once.
- **Missed a belt:** the belt name, the standing number, and the gap. *"Sprint
  Strap — 1:42.6. You were 6.1s off."* Plus **RUN IT BACK**, which restarts that
  exact city. This is §5.3's fifth mechanism and it is the highest-leverage single
  element on the screen.
- **Defended:** *"3× defended"* and the raised bar.
- **Achievements:** a compact strip of what unlocked, never a modal, never
  blocking a button.

Two hard rules, both learned from the `sandbox` bug in `save.js`: this section
**never blocks the CONTINUE and CITIES buttons**, and it renders from whatever data
it has, including none. A player must always be able to leave the results screen,
network or no network, belt data or no belt data.

### 8.2 The Locker Room

The trophy room, reached from the title screen and from a player's own name on any
board. Three panels:

- **Belts** — currently held, with live reign clocks; below them, every belt held
  in the past with its dates and defence count. A player with no belts sees the
  twelve current champions and their numbers, which is a recruiting poster, not an
  empty state.
- **Achievements** — the 58, grouped by the sections in §6, showing card position.
  Unearned *Visible* ones show their condition. Unearned *Secret* ones show `???`
  and a count, so the player knows exactly how many are hiding.
- **Career** — the metrics registry, rendered honestly: total mass, cities cleared,
  runs, longest chain, biggest hole, coins.

Guests get the full Locker Room. It is also the single most persuasive place in the
game to offer the claim — a player looking at a wall of things they earned is the
one moment where "keep this" is a service rather than a toll. One offer, at the
bottom, dismissible, never repeated in the same session
([05-identity-and-accounts.md](05-identity-and-accounts.md) §5).

### 8.3 The Titantron

The booth's big screen. Read-only, no claim UI, its own anonymous session
([05-identity-and-accounts.md](05-identity-and-accounts.md) §6). It cycles:

1. **The wall of champions** — all twelve UNBOUND belts, holder, number, reign
   clock ticking live.
2. **The live arena** — a spectator view of whatever match is running, with names.
3. **Title changes** — when a belt changes hands anywhere in the building, the
   Titantron **interrupts** with the change: belt, new champion, deposed champion,
   the numbers. This is the moment the booth is for.
4. **The 24/7 clock**, always in a corner, with the day's shortest reign.
5. When a belt has gone 60 minutes without changing hands: **OPEN CHALLENGE** —
   the belt, the number to beat, and which kiosk to do it on.

Names on the Titantron render through the player's `display_mode`, same as every
other surface, with no exceptions and no cached copies.

### 8.4 Board rows

Every leaderboard row shows a belt icon next to a current champion, and the
Locker Room is one tap from any name.

---

## 9. What the unlock moment feels like

Two distinct volumes, and keeping them distinct is what stops the whole system
turning into noise.

**An achievement is a small good thing.** A corner toast: the name, the card
position, a short sound, out in three seconds. It **never** interrupts, never
pauses, never steals focus, and never appears mid-run — unlocks earned during play
are queued and shown on the results screen. Multiple unlocks stack and play in
sequence with a beat between them, ordered by card position so the best one lands
last. Every one of these respects the existing `reducedMotion` setting and the OS
`prefers-reduced-motion` preference: same information, no movement.

**A belt is an event, and it is allowed to interrupt.** It gets the full brand
treatment — the block wordmark, the glow pool, the sparkles, the sprocket, all of
it already sitting in the `.fw-*` layer and already validated as the game's look.
Roughly:

> the screen dims → the belt name assembles in block letters →
> **NEW CHAMPION** → the handle or name → the number →
> *"taken from <previous holder>"* → the reign clock starts at 00:00:01 and ticks

Two and a half seconds, skippable with any input, and it fires **only** on a real
title change — never on a defence, never on a near miss, never on the Iron Sprocket
(§2.5, too frequent). At a booth it fires on the kiosk and the Titantron at the
same moment, which means the person who just took a belt hears the room notice.

That last sentence is the actual design target for this entire document. Everything
above exists so that a person standing at a conference booth, ninety seconds after
walking up to a game they have never played, can take something off somebody and
have a room full of strangers turn around.
