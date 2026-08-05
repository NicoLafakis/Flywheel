# ADR-0005: Extract the READY-gate look into a shared, unscoped brand layer

- **Status:** accepted
- **Date:** 2026-08-04
- **Deciders:** Nico

## Context

The rebrand from "Hole City" to **Flywheel** ("A sprocket's story") landed
alongside a UI change that is more than a find-and-replace of the name. The
level-start "READY?" gate (`#ready-gate` in `css/main.css`, `js/ui/ready.js`)
was already the only screen with a distinctive visual language: gold block
letters with a hard dark outline ring, a two-tone downward extrude, per-glyph
tilt/stagger/bob, an ambient glow pool, sparkle accents, and an orange
gradient CTA pill with its own extrude. Every other screen — the title, world
map, shop, settings — used plain buttons and headings and looked like a
different, unfinished product.

Two ways to give the landing screen (`js/ui/screens.js` `showTitle()`) the
same look: duplicate the gate's rules and letter-builder scoped to the new
screen, or lift the language out of `#ready-gate` into something both screens
consume.

## Decision

Extract the look into an unscoped brand layer, not a duplicate:

- **`js/ui/blockword.js`** — the per-character block-wordmark builder, moved
  out of `ready.js`'s private `buildTitle` and parameterized (`fitChars` so a
  long word scales down instead of overflowing; tilt still derives
  deterministically from glyph index, never `Math.random()`). Both the READY
  gate (`READY?`, fit 6.5) and the landing screen (`FLYWHEEL`, fit 8) call the
  same function.
- **`js/ui/sprocket.js`** — a new brand mark: a rotating toothed wheel with an
  empty center, built from one `TEETH = 12` constant. The empty center is the
  point — the player is a hole, and a sprocket is a toothed wheel with a hole
  in the middle, so the mark depicts the protagonist rather than being an
  arbitrary logo shape.
- **`css/main.css`** — new `--fw-*` tokens (gold, ink, extrude steps, orange
  gradient, plate, ring shadows) and unscoped `.fw-*` primitives (`.fw-title`/
  `.fw-word`/`.fw-ch`, `.fw-glow`, `.fw-spark`, `.fw-plate`, `.fw-cta-wrap`/
  `.fw-cta`, `.fw-still`, the sprocket rules, `fw-*` keyframes). `#ready-gate`
  keeps only what is genuinely gate-specific (sizing against a live 3D frame,
  its scrim, its hint, its exit animation) and consumes the shared layer for
  everything else. `.btn` and `.screen h1`/`h2` adopt the same tokens so the
  rest of the screens (world map, shop, settings, pause) read as the same
  product without a bespoke pass on each.

No webfont was introduced. The block-letter treatment (hard outline ring +
extrude + tilt) is achieved entirely with `text-shadow` stacking and CSS
transforms on the system font stack, matching the existing "no build step, no
new dependencies" architecture constraint (see `architecture.md`) — a CDN
font would have added a network dependency and a flash-of-unstyled-text risk
for a treatment that Nico had already validated as the game's look via the
gate.

The READY gate's computed styles were verified byte-identical after the
extraction — this ADR records a refactor of *ownership*, not a visual change.

## Consequences

One wordmark builder and one token set means the letter treatment cannot
drift between the gate and the landing screen on a future edit — a change to
`--fw-gold` or the tilt formula now updates both automatically. The cost is
indirection: anyone editing the gate's title now has to know it is not
gate-local, and `css/main.css`'s brand section (`.fw-*`) is unscoped, so a
future screen-specific override needs its own prefixed selector rather than
just editing `.fw-title` in place.

`buildBlockWord`'s tilt stays index-derived, not random, preserving the
project-wide "no `Math.random()` in `js/`" rule (`conventions.md`) even
though this is decorative UI, not gameplay sim — `tools/validate.mjs` greps
`js/` indiscriminately, and a wordmark that re-tilted on every reload would
also just look like a rendering bug rather than hand-set type.

The `hole-city-save` localStorage key and `hole-city-level-N` seed strings
were deliberately left unrenamed (see `glossary.md`) — this ADR covers the UI
brand layer only, not a data-shape migration.

## Alternatives Considered

- **Duplicate the gate's CSS/JS scoped to `.fw-landing`** — rejected: two
  copies of the same hard-outline/extrude math would already have diverged by
  the next tuning pass, and the gate was the one aesthetic reference worth
  protecting byte-identical.
- **Webfont for the display face** — rejected: no build step and no CDN
  dependency beyond three.js is a standing architecture constraint, and the
  hand-built block-letter treatment was already doing the job the gate
  proved out.
- **Leave every non-gate screen unstyled and rebrand text only** — rejected:
  would have shipped the name change without fixing the actual gap this ADR
  addresses (six screens of mismatched visual weight against the one that
  looked finished).
