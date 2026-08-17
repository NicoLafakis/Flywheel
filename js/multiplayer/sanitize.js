// js/multiplayer/sanitize.js — Render-Safety Helpers for Untrusted Wire Values
//
// Names, chat text and slot colours all arrive over an open broadcast channel that
// anyone holding a 5-letter room code can write to. Anything from that channel is
// hostile input until proven otherwise, so it may never reach `innerHTML` or a
// `style="..."` attribute unfiltered.
//
// Pure module by design: no DOM, no three.js, no imports beyond config constants —
// the Node test suite asserts on these helpers directly.

import { PLAYER_PALETTES } from './config.js';

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Escape a value for safe interpolation into markup (element OR attribute context).
 * Quotes are escaped too, so a value dropped inside `style="..."` cannot break out
 * of the attribute and open a new one.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Only literal hex colours. Anything else (named colours, rgb(), url(), a stray
// semicolon) is a vector for injecting extra CSS declarations or a new attribute.
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Validate a wire-supplied colour, falling back to the palette entry that the
 * claimed slot is entitled to, or white when there is no valid slot.
 */
export function safeColor(color, slot) {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_COLOR.test(trimmed)) return trimmed;
  }
  // Strictly a number: Number(null) is 0, which would silently hand a colourless
  // message slot 0's palette entry instead of the neutral fallback.
  if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < PLAYER_PALETTES.length) {
    return PLAYER_PALETTES[slot];
  }
  return '#ffffff';
}

/**
 * Coerce a wire-supplied stat to a finite number for display. A leaderboard field
 * is a number in every honest message; a string there is someone probing for a
 * markup hole.
 */
export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
