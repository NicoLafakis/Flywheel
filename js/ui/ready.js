// Level-start "READY?" gate — a big graphic overlay that sits OVER the live 3D
// view while the camera holds its zoomed-out establishing shot. Click, tap, or
// any key starts the level; the sign then gets swallowed by the hole as the
// camera dives in.
//
// Mounts as a sibling of #screen-root (z-index 15: above the HUD, below the
// full-screen Screens takeovers) so the canvas keeps rendering behind it and
// screens.clear() can never wipe it.

const GATE_ID = 'ready-gate';
const EXIT_MS = 460; // must cover the longest exit animation in main.css

// The live instance, so a second mount can tear the first one down properly —
// dropping its node alone would leave its window keydown listener armed.
let liveDismiss = null;

// The gate suppresses the game HUD while it is up (see css/main.css). Body
// classes only — hud.js owns #hud and its .hidden state, and this never
// touches either.
let hudTimer = null;

function hudMute(still) {
  clearTimeout(hudTimer);
  hudTimer = null;
  const c = document.body.classList;
  c.remove('rg-gate-down');
  c.toggle('rg-gate-still', !!still);
  c.add('rg-gate-up');
}

function hudRestore(instant) {
  const c = document.body.classList;
  if (!c.contains('rg-gate-up')) return; // already restored, or mid fade-in
  clearTimeout(hudTimer);
  c.remove('rg-gate-up');
  if (instant) {
    c.remove('rg-gate-down', 'rg-gate-still');
    hudTimer = null;
    return;
  }
  // keep .rg-gate-down until the fade-in finishes, so the transition
  // declaration survives long enough to actually run
  c.add('rg-gate-down');
  hudTimer = setTimeout(() => {
    document.body.classList.remove('rg-gate-down', 'rg-gate-still');
    hudTimer = null;
  }, 320);
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

// Keys that must keep their normal meaning instead of starting the level:
// modifiers on their own, browser shortcuts (Ctrl/Cmd/Alt), Tab (focus), Esc.
function isStartKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  switch (e.key) {
    case 'Tab': case 'Escape': case 'Shift': case 'Control':
    case 'Alt': case 'Meta': case 'CapsLock': case 'OS':
      return false;
    default:
      return true;
  }
}

// Split into words → letters so a long title wraps between words but never
// mid-word. Each glyph carries its own stagger index (--i), hand-placed tilt
// (--rot), and inward pull (--dx) used by the swallow animation.
function buildTitle(text) {
  const wrap = el(`<div class="rg-title" aria-hidden="true"><span class="rg-glow"></span></div>`);
  const words = String(text).split(/\s+/).filter(Boolean);
  const total = words.join('').length || 1;
  let i = 0;
  for (const word of words) {
    const w = el(`<span class="rg-word"></span>`);
    for (const ch of word) {
      const s = el(`<span class="rg-ch"></span>`);
      s.textContent = ch;
      s.style.setProperty('--i', i);
      s.style.setProperty('--rot', `${((i % 2 ? 1 : -1) * (1.6 + (i % 3) * 0.9)).toFixed(1)}deg`);
      // edge letters converge hardest toward the middle when swallowed
      s.style.setProperty('--dx', `${(((total - 1) / 2 - i) * 46).toFixed(0)}%`);
      if (/[?!.…]/.test(ch)) s.classList.add('rg-ch-accent');
      w.appendChild(s);
      i++;
    }
    wrap.appendChild(w);
  }
  for (let k = 0; k < 3; k++) {
    const sp = el(`<i class="rg-spark"></i>`);
    sp.style.setProperty('--i', k);
    wrap.appendChild(sp);
  }
  // 'READY?' is the design size; anything longer scales down rather than
  // overflowing a phone in portrait.
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);
  wrap.style.setProperty('--rg-fit', Math.min(1, 6.5 / longest).toFixed(3));
  return wrap;
}

/**
 * Mount the level-start gate over live gameplay.
 * @param {object} opts
 * @param {string} opts.title         big display line, e.g. 'READY?'
 * @param {string} [opts.subtitle]    small pill above it, e.g. 'BROOKLYN'
 * @param {Function} [opts.onStart]   fired once when the player triggers the CTA
 * @param {boolean} [opts.reducedMotion] skip every animation
 * @returns {{ dismiss: Function }}
 */
export function mountReadyGate({ title = 'READY?', subtitle = '', onStart, reducedMotion = false } = {}) {
  const host = document.getElementById('app') || document.body;
  if (liveDismiss) liveDismiss(); // never stack gates
  const stale = document.getElementById(GATE_ID);
  if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

  const still = !!reducedMotion || prefersReducedMotion();
  const label = subtitle ? `${title} ${subtitle}` : title;

  const root = el(`<div id="${GATE_ID}" class="${still ? 'rg-still' : ''}" role="dialog" aria-labelledby="rg-a11y">
    <div class="rg-scrim"></div>
    <div class="rg-stack">
      <h2 id="rg-a11y" class="rg-a11y"></h2>
      <div class="rg-top">
        <div class="rg-sub" aria-hidden="true"></div>
      </div>
      <div class="rg-bot">
        <div class="rg-cta-wrap">
          <button type="button" class="rg-cta" aria-label="Go: start the level">GO!</button>
        </div>
        <div class="rg-hint">
          <span class="rg-hint-key">press any key</span>
          <span class="rg-hint-tap">tap anywhere</span>
        </div>
      </div>
    </div>
  </div>`);

  root.querySelector('.rg-a11y').textContent = `${label}. Start the level.`;
  const subEl = root.querySelector('.rg-sub');
  if (subtitle) subEl.textContent = subtitle;
  else subEl.classList.add('hidden');
  // Title joins the subtitle in the top cluster. The stack is split top/bottom
  // rather than centred so the establishing shot shows through the middle of
  // the frame — see the .rg-stack rule in main.css for the measurement.
  root.querySelector('.rg-top').appendChild(buildTitle(title));

  const cta = root.querySelector('.rg-cta');
  const prevFocus = document.activeElement;
  let done = false;
  let exitTimer = null;

  function restoreFocus() {
    if (prevFocus && prevFocus.isConnected && prevFocus !== document.body
        && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus({ preventScroll: true }); return; } catch (e) { /* fall through */ }
    }
    if (root.contains(document.activeElement) && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function unlisten() {
    root.removeEventListener('pointerdown', onPointer);
    cta.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
  }

  function destroy() {
    clearTimeout(exitTimer);
    exitTimer = null;
    unlisten();
    hudRestore(true); // safety net — no-op if activate() already restored it
    if (liveDismiss === dismiss) liveDismiss = null;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  function dismiss() {
    if (!done) { done = true; restoreFocus(); }
    destroy();
  }

  function activate() {
    if (done) return; // one shot — mashing the CTA can't double-fire onStart
    done = true;
    unlisten();
    restoreFocus();
    hudRestore(still); // HUD fades back up as the sign gets eaten
    if (still) {
      destroy();
    } else {
      // Queue the exit paint BEFORE onStart, which may block the main thread.
      root.classList.add('rg-out');
      exitTimer = setTimeout(destroy, EXIT_MS);
    }
    if (typeof onStart === 'function') onStart();
  }

  function onPointer() { activate(); }
  function onClick() { activate(); }
  function onKey(e) {
    if (e.key === 'Tab') { e.preventDefault(); cta.focus({ preventScroll: true }); return; }
    if (isStartKey(e)) activate();
  }

  root.addEventListener('pointerdown', onPointer);
  cta.addEventListener('click', onClick); // covers Enter/Space on the focused CTA
  window.addEventListener('keydown', onKey);

  host.appendChild(root);
  hudMute(still);
  cta.focus({ preventScroll: true });
  liveDismiss = dismiss;

  return { dismiss };
}
