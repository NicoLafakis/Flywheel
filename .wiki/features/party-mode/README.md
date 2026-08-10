# Party Mode — planning package

**Status: planning.** Nothing here is built. The whole package depends on
[online-flywheel](../online-flywheel/), which is itself unbuilt and blocked on
backend credentials — party mode is multiplayer-only and there is no
single-player variant by design.

A social party feature for the voxel sandbox arena: drink tokens appear in the
city on a slow, tunable cadence; the player whose hole reaches one is briefly
frozen while a block-letter "BOTTOMS UP!" callout plays on every screen in the
match. In front of it, a 21+ self-affirmation. Behind it, the entire legal
document set the game has never had.

> **⚠️ Not legal advice.** [03-legal-scaffolding.md](03-legal-scaffolding.md)
> contains draft legal text written by an engineering agent, not a lawyer. It
> exists to scope the work and give an attorney something to redline. **No text
> in this package may be shown to a real user until a qualified attorney has
> reviewed it.**

## Start here

- **Implementers:** [00-objective-overview.md](00-objective-overview.md) →
  [01-prd.md](01-prd.md) → [02-requirements.md](02-requirements.md). The
  overview is the spine; read it before the spec, or the literal ask gets built
  instead of the thing it serves — in this package specifically, the trap is
  building the coin system again and discovering at a booth that two screens
  disagree about who is drinking.
- **Nico:** the overview's closing section, *"Decisions that are the owner's"*
  — six questions, each with a recommendation. Then
  [03-legal-scaffolding.md](03-legal-scaffolding.md) §7, which is eight
  questions for you and a lawyer. Nothing else in this folder needs you.

## The docs

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What the ask really serves, why the token cannot be a deterministic coin, what "infrequent" has to mean, twenty moves ahead, the pencil-test scope line, and the six owner decisions |
| [01-prd.md](01-prd.md) | PRD 0003. The normative spec: the load-bearing invariant, 49 functional requirements, token lifecycle, freeze semantics in a shared arena, accessibility, session caps, the tunable constants block, phasing, and the amendments it makes to existing normative docs |
| [02-requirements.md](02-requirements.md) | Thirteen user stories with Given/When/Then, each criterion tagged validator-checkable, needs-two-clients, or live-verify-only. The contract verification checks against |
| [03-legal-scaffolding.md](03-legal-scaffolding.md) | What legal artifacts the game needs overall (EULA, ToS, privacy, conduct, notices), where each appears, the age-gate copy, drafted placeholder clauses marked DRAFT, jurisdiction caveats, and the open questions for counsel |

## The one decision that resolves three problems

Party sessions are **unranked by construction** — no leaderboard, no belts, no
achievements, excluded from replay validation. That single call settles
fairness (a freeze cannot cost you a ranked run), anti-cheat (the validator
never has to learn about freezes), and grief incentive (there is nothing to win
by manipulating someone into a token). It is the companion ADR this package
would make.

## What this package is not

- Not a single-player feature, and not a campaign feature.
- Not rule packs, a custom-rules editor, clip capture, streaming integration,
  or achievements that count tokens. Those are surfaced as forward moves in
  [00](00-objective-overview.md), not built.
- Not verified age checking. The gate is an unverified self-affirmation on
  purpose; see [03](03-legal-scaffolding.md) §4.3 for why collecting a date of
  birth is the worse option.
- Not the legal text itself. It is the scope of the legal text, plus drafts for
  an attorney to replace.

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — the freeze
  is sim state; the bubbly title is dressing and can never change how long the
  freeze lasts.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — the token schedule is seeded from the session; no `Math.random()`, no
  positions on the wire.
- [ADR-0005 shared brand layer](../../adr/0005-shared-brand-layer.md) —
  "BOTTOMS UP!" is `buildBlockWord()` from `js/ui/blockword.js`, not a new
  title treatment.
- [ADR-0010 host-authoritative arena](../../adr/0010-host-authoritative-arena.md)
  — why claim resolution belongs to exactly one machine.
- [ADR-0012 replay-validated leaderboard trust](../../adr/0012-replay-validated-leaderboard-trust.md)
  — and why party sessions stay off the ranked path instead.
- [ADR-0014 vendored same-origin runtime](../../adr/0014-vendored-same-origin-runtime.md)
  — no build step, no dependency, no third-party age-verification script.
- [score-combo-and-hype](../score-combo-and-hype/) (in build 2026-08-10) — the
  announcement queue "BOTTOMS UP!" joins as a new source at the top priority,
  and the reduced-motion rule it inherits.
