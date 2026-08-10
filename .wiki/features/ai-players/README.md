# AI Players — planning package

**Status: planning.** Nothing here is built. Unlike
[party-mode](../party-mode/), this package is **not blocked on a backend** — it
is entirely sim-side, entirely offline, and could start today. It is the
package that turns Flywheel from a solo demolition toy into a match.

Five or more AI-driven holes share the city with the player. Bigger holes eat
smaller ones. Every scene's goal becomes 100% consumption, and the question
stops being *can you finish* and becomes *how much can you take before the
clock runs out, with five rivals taking it from you*.

The whole design turns on one seam: **a hole is an entity with a driver, and a
driver is human, bot, or peer.** Build the fleet of bots correctly and
[online-flywheel](../online-flywheel/) fills those same slots with networked
humans later without touching the sim.

## Start here

- **Implementers:** [00-objective-overview.md](00-objective-overview.md) →
  [01-prd.md](01-prd.md) → [02-requirements.md](02-requirements.md). The
  overview is the spine; read it before the spec. The trap this package
  specifically sets is building "bot AI" as a feature and discovering at P5
  that the bot's decisions are wired into `sim.step()` in a way no network peer
  can ever occupy.
- **Nico:** the decisions block in [00](00-objective-overview.md) §"Owner
  decisions" is a transcript of what you ruled — a **3-minute (tunable) clock**,
  100% goals read as a ceiling with a mandatory match-end screen that reports
  how much you took and where you placed, a gentle 5-second respawn, and 5+
  mixed-difficulty bots. §"Where the genre disagreed with us" records the three
  places research pushed back and how each was resolved. **Nothing in this
  folder is open on your desk.**

## The docs

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What the ask really serves, the driver seam and why it is the whole point, twenty moves ahead, the pencil-test scope line, the resolved owner decisions verbatim, the three places genre research contradicts a ruling, and the draft of the companion ADR |
| [01-prd.md](01-prd.md) | PRD 0004. The normative spec: the load-bearing invariant, 61 numbered functional requirements, the multi-hole sim model, the seeded bot brain and its four difficulty parameter sets, the swallow-and-respawn rule, the match clock, the 100%-goal amendment to every scene, HUD additions, the tunable constants block, and five phases |
| [02-requirements.md](02-requirements.md) | Fourteen user stories with Given/When/Then, each criterion tagged validator-checkable or live-verify-only. The contract verification checks against |

## The decision that resolves the most

**The bot does not steer a hole. The bot *is* a driver, and a driver returns a
steering vector when asked.** That single call settles four problems at once:
determinism (a driver is a pure function of sim state plus a seeded stream),
testability (`tools/validate.mjs` already has a greedy driver — it becomes the
reference implementation rather than test-only scaffolding), the networking
future (a peer driver reads the wire instead of thinking), and single-player
fallback (zero bot drivers is exactly today's game). It is the companion ADR
this package would make — drafted in [00](00-objective-overview.md) §"Companion
ADR (draft)", deliberately *not* created as a file here.

## What this package is not

- Not multiplayer. No network, no backend, no accounts, no credentials. Human
  multiplayer is [online-flywheel](../online-flywheel/) and stays there.
- Not pathfinding, navmeshes, or bot personalities with names and voices.
- Not matchmaking, skill rating, difficulty auto-tuning, or a bot that learns.
  Score-coupled rubber-banding is explicitly **rejected**, with a source — see
  [00](00-objective-overview.md).
- Not power-ups. They are coming later (owner-flagged 2026-08-10, and his
  answer to whether 100% is reachable inside a short clock), and
  [00](00-objective-overview.md) leaves a named seam for them. They are not
  designed here.
- Not a campaign change. The campaign (`js/sim.js`, `LEVELS`) is untouched;
  this is the voxel sandbox only.

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — bots live
  entirely sim-side. The renderer's only change is drawing N holes where it
  drew one.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — the hard constraint on this whole package. A bot that consults
  `Math.random()` ends replay validation, which ends
  [ADR-0012](../../adr/0012-replay-validated-leaderboard-trust.md).
- [ADR-0010 host-authoritative arena](../../adr/0010-host-authoritative-arena.md)
  — the reason the driver seam is shaped the way it is. The host already
  intends to apply "every player's steering"; a bot driver is one more source
  of steering on the machine that already owns authority.
- [ADR-0015 the scoring ladder is a table the HUD reads](../../adr/0015-scoring-ladder-is-a-table-the-hud-reads.md)
  and [score-combo-and-hype](../score-combo-and-hype/) (shipped 2026-08-10) —
  every field this package multiplies by N (`mass`, `rawMass`, `chain`,
  `chainTimer`, `size`, `sizeFrac`, `bestCombo`) is per-hole state that exists
  today only because that package put it there.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no new dependency. The bot brain is a file.
