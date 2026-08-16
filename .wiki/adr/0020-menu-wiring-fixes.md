# ADR-0020: Screens module — four menu-wiring bugs rectified

- **Status:** Accepted
- **Date:** 2026-08-16
- **Deciders:** Nico, Antigravity

## Context

A full static-analysis GUI check of every menu screen on 2026-08-16 identified
three functional bugs in `js/ui/screens.js` and one cosmetic bug in
`js/main.js`. None affect gameplay simulation; all affect the menus a player
uses to navigate the game.

### Bug 1 — City Select card renders literal `"undefined"` in the icon slot

`CITY_CATALOG` (the data array that backs the City Selection carousel) was
defined without an `icon` field on any of its eight entries, while the card
template at line 607 unconditionally renders `${city.icon}`. Every city card
displayed the string `"undefined"` inside the `.city-icon-float` container.
The container was clearly designed to hold a city emoji; it just was never
populated.

### Bug 2 — Power-Up Showcase timer fill bar uses the wrong denominator

`showPowerUpShowcase` sets `remainingMs = 10000` (10-second auto-dismiss) but
the fill bar formula used `6000` as the total:

```js
fill.style.width = `${((6000 - remainingMs) / 6000) * 100}%`;
```

At 4 seconds elapsed `(10000 - 6000) / 6000 = 66.7%`; at 6 seconds elapsed
the bar hits 100%; for the remaining 4 seconds the numerator is negative and
CSS clamps the width to 0. The showcase count-down (`10...9...8...`) was correct;
only the fill bar was wrong. The mismatch originated from a duration change
that updated `remainingMs` but did not update the fill formula.

### Bug 3 — Shop tab switch plays no sound

`showShop` called `this.actions?.sound('click')` on every tab change. The
`sound` property was never registered on the `actions` object in `main.js`;
the optional-chain `?.` silently discarded the call. Additionally, shop tab
buttons carried no `.secondary` class, so the existing `#screen-root`
delegated listener (which plays `audio.uiTap()` for `.secondary` buttons) also
did not cover them. The result: tab switches produced no audio feedback at all.

### Bug 4 (cosmetic) — HUD mute button emoji never updates

`btn-mute` is hardcoded as `🔊` in `index.html`. The click handler in
`main.js` toggled `save.muted` and called `audio.setMuted()` correctly, but
never updated the button text content. Muting the game kept showing `🔊`
instead of `🔇`.

## Decision

Four targeted fixes, no new architecture:

**Fix 1 — Add `icon` to each `CITY_CATALOG` entry.**
Each of the eight city objects gets an `icon` property (the emoji chosen to
represent that city). The template is unchanged; it already reads
`${city.icon}`. Icons assigned: The Lab `🧪`, Lower Manhattan `🏙️`, Brooklyn
`🌉`, Chicago Loop `🌆`, Cambridge `🔬`, Upper Manhattan `🌳`, Boston Seaport
`⚓`, Tokyo Shinjuku `🗼`. Any future city addition must include an `icon`
field.

**Fix 2 — Replace the hard-coded `6000` with a named constant
`SHOWCASE_TOTAL_MS = 10000`.**
The constant is declared adjacent to `remainingMs` so the fill formula and
the countdown share exactly one number. Future duration changes edit one
constant, not two expressions. A comment cites this ADR as the trail.

**Fix 3 — Remove the `actions?.sound('click')` call; add `.secondary` to shop
tab buttons.**
The call was always a no-op. The `.secondary` class carries no visual effect on
tabs (`.shop-tab` has its own higher-specificity style block that overrides the
`.btn.secondary` rules), but it signals to the existing `#screen-root`
delegated listener that this is a secondary affordance and should play
`audio.uiTap()` on click — the same sound every other secondary button already
produces. No custom per-button sound logic is needed.

**Fix 4 — Update `btn-mute` text content on every click.**
The click handler now writes `🔇` when `save.muted` is true and `🔊` when
false, immediately after the audio engine is notified. A comment cites the
root cause (hardcoded HTML, no DOM sync) so a future reader understands why
the update is here rather than in a more general place.

## Alternatives considered

**Bug 2 — compute `1 - (remainingMs / TOTAL_MS)` inline.**
Equivalent. A named constant is preferred because it is the same idiom the
codebase already uses for `RANKED_TICK_COUNT` and `COMBO_THRESHOLDS` — one
source, every reader.

**Bug 3 — register `sound` in `main.js` and keep the explicit call in
`showShop`.**
This would also work but creates a second path for UI sound where the delegated
listener already covers every other button. Having `.secondary` on the tab
buttons also satisfies the visual-language contract: a tab is a secondary
affordance. The delegated listener is the right door.

**Bug 4 — CSS class toggle (`body.muted #btn-mute::after`) rather than a
text-content swap.**
Would keep the logic out of the click handler but requires a CSS rule that
duplicates the knowledge that muted means `🔇`. The text-content swap is
simpler, is consistent with how the Settings screen's sound toggle updates its
label, and puts cause and effect in one place.

## Consequences

**Bought.** Four presentation-layer bugs corrected with no gameplay impact. The
city carousel no longer displays `"undefined"`. The power-up showcase timer
bar now fills from 0% to 100% over the full 10-second countdown. Shop tab
changes play the standard tap sound. The HUD mute button gives correct visual
feedback.

**Paid.** Each `CITY_CATALOG` entry now carries one extra field. Any future
city addition must remember to include `icon`.

**Foreclosed.** Nothing. All four fixes are additive or corrective; no
structural decision is encoded here that would constrain a future ADR.

## References

- `js/ui/screens.js` — `CITY_CATALOG`, `showCitySelect()`, `showPowerUpShowcase()`, `showShop()`
- `js/main.js` — `btn-mute` click handler
- `.wiki/modules/ui.md` — Screens module documentation
- [ADR-0005](0005-shared-brand-layer.md) — city card sits inside the same brand layer
- [ADR-0014](0014-vendored-same-origin-runtime.md) — no build step; DOM text-content swap is the correct tool
