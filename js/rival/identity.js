// Per-slot player identity — THE one color table (rival-visibility CC-3).
//
// Every rival-visibility surface (crater tint, tug-of-war bar, edge chevrons,
// rings, milestone callouts) reads slot → color/name from HERE and nowhere
// else. A second mapping anywhere is a future desync between what the bar says
// and what the city shows (00-objective-overview.md, move 6).
//
// Slots 0 and 1 keep the colors the duel HUD already shipped (P1 blue,
// P2 orange — js/demo/demo.js, arena.html), so nothing a player has already
// learned changes meaning. Slots 2..7 extend the same family for the 8-player
// arena: hue-separated, phone-legible on the #11151c ground, and every signal
// that uses them carries a redundant non-color channel (name, position) per
// CC-4 — color is never the only cue.
//
// Pure data. No three.js, no DOM, no I/O.

export const MAX_SLOTS = 8;

/** slot -> { hex (three.js), css, name }. Frozen: identity is not mutable state. */
export const SLOT_IDENTITY = Object.freeze([
  Object.freeze({ hex: 0x4da3ff, css: '#4da3ff', name: 'BLUE' }),
  Object.freeze({ hex: 0xff8b2d, css: '#ff8b2d', name: 'ORANGE' }),
  Object.freeze({ hex: 0x57e389, css: '#57e389', name: 'GREEN' }),
  Object.freeze({ hex: 0xff5c8a, css: '#ff5c8a', name: 'PINK' }),
  Object.freeze({ hex: 0xc792ff, css: '#c792ff', name: 'VIOLET' }),
  Object.freeze({ hex: 0xffd75c, css: '#ffd75c', name: 'GOLD' }),
  Object.freeze({ hex: 0x4de3d2, css: '#4de3d2', name: 'TEAL' }),
  Object.freeze({ hex: 0xff6b57, css: '#ff6b57', name: 'RUST' }),
]);

const FALLBACK = Object.freeze({ hex: 0x8fa2bb, css: '#8fa2bb', name: 'GREY' });

/** Full identity row for a slot; out-of-range slots get a neutral grey. */
export function slotIdentity(slot) {
  return SLOT_IDENTITY[slot] || FALLBACK;
}

export function slotColorHex(slot) { return slotIdentity(slot).hex; }
export function slotColorCss(slot) { return slotIdentity(slot).css; }
export function slotName(slot) { return slotIdentity(slot).name; }
