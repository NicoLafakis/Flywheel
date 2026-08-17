# RCA — `backdrop-filter` captures `position: fixed` descendants

**Date:** 2026-08-17
**Status:** one instance fixed (shop tab bar), one instance OPEN (`#mp-countdown-modal`)
**Surfaces:** `css/main.css`, `css/multiplayer.css`, `js/ui/screens.js`, `js/multiplayer/ui.js`

## The rule

An element with a `filter`, `backdrop-filter`, `transform`, `perspective`,
`contain: paint`, or `will-change` on any of those becomes the **containing
block for its `position: fixed` descendants**. The descendant stops being
positioned against the viewport and is positioned against that ancestor's
padding box instead — and, decisively, it *scrolls with that ancestor* rather
than staying put.

This is specified behaviour, not a browser bug (CSS Transforms 1 §3, extended to
filters by Filter Effects 1 §6). It is worth writing down because the failure it
produces looks nothing like its cause: the symptom is "my sticky bar isn't
sticky", and every instinct points at `z-index`, at `overflow`, or at the mobile
URL bar. None of those are involved.

The trap is sharpest in this codebase because `.screen` — the base class behind
every full-screen takeover — carries a frosted scrim:

```css
/* css/main.css:1044-1047 */
.screen {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  ...
  background: rgba(10, 14, 26, 0.72); backdrop-filter: blur(4px);
}
```

So **every `position: fixed` element rendered inside any `.screen` is captured**.
If that screen also scrolls, the element scrolls away with the content.

## Instance 1 — the shop tab bar (FIXED)

`js/ui/screens.js` builds the shop as `<div class="screen shop-screen">` — both
classes on a single element. That one element therefore carried the
`backdrop-filter` *and* was the scroll container *and* was the containing block
for its own `position: fixed` child. The nav bar was welded to the scrolling
content by construction; there was no viewport relationship left to be sticky
against.

Measured before the fix:

| Viewport | Bar travel during scroll | Consequence |
|---|---|---|
| 390 x 844 (phone) | 6087 px of a 6087 px scroll | left the screen after 65 px and never returned; 4 of 5 categories unreachable for 99% of the list |
| 1440 x 900 (desktop) | 781 px | ended near the top of the window, covering ten cards |

Proven causal by A/B rather than inferred: forcing `backdrop-filter: none` on
`.shop-screen` took the travel from 6087 px to 0 with no other change.

**Fix:** stop taking the bar out of flow at all. The shop became a three-row
shell — header, scroller, nav — where the scroller (`.shop-scroll`) owns every
pixel of overflow and the nav is simply the last flex child of a full-height
column. "The bottom" is then where it lands by construction, with no containing
block to be captured by and nothing for a collapsing mobile URL bar to disagree
with. `min-height: 0` on the scroller is load-bearing: a flex item defaults to
`min-height: auto` and refuses to shrink below its content, which would push the
nav back off the bottom.

Two unrelated defects were found in the same element and fixed with it: the
category banner interpolated `${currentCatObj.icon}`, but `SHOP_CATEGORIES`
(`js/upgrades.js:99-131`) carries `id`/`name`/`title`/`desc` and has never had an
`icon` field, so every category header rendered the literal string `undefined`;
and the tabs labelled themselves from `cat.title` (the long form, "Partner Agency
Tributes") rather than `cat.name` ("PARTNERS"), which ellipsed to nothing at
phone widths — the nav named none of its own destinations.

## Instance 2 — the multiplayer countdown modal (OPEN)

The same shape, undetected, in the lobby:

```js
// js/multiplayer/ui.js:381-383
lobbyView.className = 'screen mp-screen mp-lobby-view';   // <- .screen => backdrop-filter
```

```css
/* css/multiplayer.css:377-387 */
.mp-lobby-view {
  min-height: 100vh;
  padding: 18px;
  overflow-y: auto;              /* <- this element scrolls */
  -webkit-overflow-scrolling: touch;
}
```

`#mp-countdown-modal` (`js/multiplayer/ui.js:454`) is `position: fixed; inset: 0`
(`css/multiplayer.css:673-676`) and is a direct child of `lobbyView` — a sibling
of `.mp-lobby-container`, so it escapes *that* element's `blur(20px)`, but not
`.screen`'s `blur(4px)` on its own parent.

Consequences, in order of severity:

1. The overlay is positioned against the lobby's **scrollable content box**, not
   the viewport. That box is `min-height: 100vh` plus however far the roster,
   invite card and chat push it, so `inset: 0` stretches the scrim over the full
   content height and centres the "GET READY / 3" card on *that* height — which
   is below the fold whenever the lobby scrolls.
2. It scrolls with the content, so a player who has scrolled down to read chat
   does not see the countdown at all.

This is worst on a phone, which is where the lobby is most likely to overflow,
and it lands at the single worst moment in the flow: the three seconds before a
match starts, when the player has no other indication the game is about to begin.

**Fix direction:** the same one that worked for the shop — do not fight the
containing block, remove the dependency on it. Either lift the modal out of the
`.screen` subtree entirely (append to `document.body`, as
`showRespawnOverlay()` at `js/multiplayer/ui.js:713-719` already correctly does),
or make the lobby a non-scrolling shell with an inner scroller. The body-append
path is strictly simpler here and has a working precedent one method away.

Note that `.mp-respawn-overlay` is **not** affected precisely because it is
appended to `document.body`. The two overlays are the same pattern built two
different ways, and only one of them works.

## The audit, and why it is short

Every `position: fixed` rule in `css/` was checked against its mount point:

| Element | Mounted under | Captured? |
|---|---|---|
| `.shop-tab-bar` | `.screen.shop-screen` | yes — fixed |
| `#mp-countdown-modal` | `.screen.mp-lobby-view` | **yes — open** |
| `.mp-respawn-overlay` | `document.body` | no |
| `.pu-showcase-screen` | `#screen-root` | no — it *is* the fixed element, and `#screen-root` (`css/main.css:1039`) carries no filter or transform |
| `#civil-disaster-overlay`, `#quake-cinematic-overlay`, `#poke-encounter-overlay`, `#db-collect-overlay`, `.chrono-freeze-overlay`, `.vortex-suction-overlay`, `.titan-surge-overlay`, `.speed-frenzy-overlay`, `.chain-frenzy-overlay` | `document.body` | no |
| `body.fw-scene .fw-landing::before` | `.fw-landing` | no — that rule explicitly sets `backdrop-filter: none` (`css/main.css:2382-2386`) |

The list is short because the codebase overwhelmingly appends overlays to
`document.body`. The two exceptions are both inside `.screen`, and both are
bugs — which is the argument for the convention below rather than for
case-by-case vigilance.

## Convention

**A `position: fixed` element must not be rendered inside a `.screen`.** Append
it to `document.body`. `.screen` carries a `backdrop-filter` and several screens
scroll, so anything fixed inside one is positioned against the wrong box and
scrolls away — silently, and differently per viewport height, which is why it
survives desktop testing.

When a bar genuinely needs to sit at the bottom of a screen, make it the last
flex child of a full-height, non-scrolling column and give the middle child
`flex: 1 1 auto; min-height: 0; overflow-y: auto`. That is more robust than
`fixed` regardless of the filter question: it needs no `z-index`, no
`translateX(-50%)` centring, no `dvh`/`svh` guesswork against a collapsing
mobile URL bar, and it composes correctly with safe-area insets.

## What would have caught this

Nothing in the suite could have. The validator is a Node process with no layout
engine, so no assertion in `tools/validate.mjs` can observe a containing block.
The regression probe therefore has to be a browser one: mount the screen at a
phone viewport with `hasTouch: true`, scroll the scroller to its end, and assert
the bar's `getBoundingClientRect().bottom` is still within the viewport — in
**both** directions, so that a bar which is correct on a short viewport is also
checked for floating mid-screen or double-padding on a tall one.

A screenshot does not prove this. The failure is a coordinate, so the assertion
must be a coordinate.
