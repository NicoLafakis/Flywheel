// The Flywheel block wordmark: gold slab letters, each carrying its own hard
// dark outline ring, a two-tone downward extrude, a hand-placed tilt, and a
// staggered springy pop-in followed by a gentle bob.
//
// This lives outside both callers because the landing screen and the level-start
// READY gate are the SAME wordmark at two sizes. One builder means the letter
// treatment cannot drift between them on the next edit; the callers own only the
// font-size (see .fw-title in css/main.css), never how a letter looks or moves.

const SPARKS = 3; // matches the three hand-placed spark slots in css/main.css

/**
 * Build a block wordmark.
 * @param {string} text          the words, e.g. 'FLYWHEEL' or 'READY?'
 * @param {object} [opts]
 * @param {number} [opts.fitChars] longest word length that still renders at full
 *   size; anything longer scales down via --fw-fit rather than overflowing a
 *   phone in portrait. 6.5 is the READY gate's fitting (it was measured against
 *   'READY?'); the landing screen passes 8 so FLYWHEEL renders at 1.
 * @param {number} [opts.sparks] number of 4-point sparkles, 0 to drop them
 * @returns {HTMLElement} the .fw-title wrapper, decorative (aria-hidden)
 */
export function buildBlockWord(text, { fitChars = 6.5, sparks = SPARKS } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fw-title';
  wrap.setAttribute('aria-hidden', 'true'); // the accessible name is the caller's job

  // The ambient gold pool goes in first so it paints behind every glyph.
  const glow = document.createElement('span');
  glow.className = 'fw-glow';
  wrap.appendChild(glow);

  // Split into words → letters: the row wraps between words but a word never
  // breaks mid-glyph, which is what keeps 'A SPROCKET'S STORY'-length titles
  // legible at 320 px without a second layout.
  const words = String(text).split(/\s+/).filter(Boolean);
  const total = words.join('').length || 1;
  let i = 0;
  for (const word of words) {
    const w = document.createElement('span');
    w.className = 'fw-word';
    for (const ch of word) {
      const s = document.createElement('span');
      s.className = 'fw-ch';
      s.textContent = ch;
      s.style.setProperty('--i', i);
      // Tilt is DERIVED from the index, never randomised: js/ is Math.random-free
      // by convention (tools/validate.mjs greps for it), and a wordmark that
      // re-tilted itself on every reload would read as a rendering glitch rather
      // than as hand-set type. Alternating sign against a 3-step magnitude cycle
      // gives 6 distinct poses before it repeats — longer than any word we set.
      s.style.setProperty('--rot', `${((i % 2 ? 1 : -1) * (1.6 + (i % 3) * 0.9)).toFixed(1)}deg`);
      // Edge letters converge hardest toward the middle when the hole swallows
      // the sign (the gate's exit animation); unused elsewhere and harmless.
      s.style.setProperty('--dx', `${(((total - 1) / 2 - i) * 46).toFixed(0)}%`);
      if (/[?!.…]/.test(ch)) s.classList.add('fw-ch-accent');
      w.appendChild(s);
      i++;
    }
    wrap.appendChild(w);
  }

  // Sparkles are positioned OUTSIDE the letter block (see the :nth-of-type rules
  // in main.css) so one can never land on a glyph and break its outline ring.
  for (let k = 0; k < sparks; k++) {
    const sp = document.createElement('i');
    sp.className = 'fw-spark';
    sp.style.setProperty('--i', k);
    wrap.appendChild(sp);
  }

  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);
  wrap.style.setProperty('--fw-fit', Math.min(1, fitChars / longest).toFixed(3));
  return wrap;
}
