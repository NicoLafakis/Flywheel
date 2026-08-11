// The end-of-match territory reveal (pattern 6): the camera eases out over the
// crater map both players painted all match, the tug bar settles from its last
// live state to the final split, and the exact percentages — deliberately
// withheld during play (AC-02.5) — land here for the first time (AC-06.4).
//
// The numbers come in as a `finalSplit` (js/rival/attribution.js) computed
// from the SAME record the live surfaces read (AC-06.1). This module only
// animates; it computes nothing that could disagree with the city.
//
// Skippable (any tap/click on the overlay jumps to the final state) and
// reduced-motion aware (the final state renders immediately) — AC-06.3.

const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

export class Reveal {
  /**
   * @param {object} opts
   *   segEls   per-seat bar segment elements (roster order)
   *   pctEls   per-seat percentage readouts (roster order)
   *   onZoom   (t 0..1) => void — the camera pull, owned by the page
   *   skipEl   element whose tap skips the animation
   *   reduced  prefers-reduced-motion
   *   ms       animation length
   */
  constructor({ segEls, pctEls, onZoom = null, skipEl = null, reduced = false, ms = 2600 }) {
    this.segEls = segEls;
    this.pctEls = pctEls;
    this.onZoom = onZoom;
    this.reduced = reduced
      || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.ms = ms;
    this._raf = 0;
    this._skip = false;
    if (skipEl) skipEl.addEventListener('pointerdown', () => { this._skip = true; }, { passive: true });
  }

  /**
   * @param {number[]} fromShares  the bar's last live split (roster order)
   * @param {Array<{share:number,percent:number}>} split  finalSplit rows
   * @param {Function} onDone  called once the bar has settled
   */
  run(fromShares, split, onDone) {
    const from = split.map((_, i) => (fromShares && fromShares[i] != null ? fromShares[i] : 1 / split.length));
    const setAt = (t) => {
      for (let i = 0; i < split.length; i++) {
        const share = from[i] + (split[i].share - from[i]) * t;
        this.segEls[i].style.width = (share * 100).toFixed(2) + '%';
        // The exact number counts up with the bar and lands on the true value.
        const pct = (split[i].percent * t).toFixed(1);
        this.pctEls[i].textContent = t >= 1 ? split[i].percent.toFixed(1) + '%' : pct + '%';
      }
      if (this.onZoom) this.onZoom(t);
    };

    if (this.reduced) {
      setAt(1);
      if (onDone) onDone();
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const t = this._skip ? 1 : Math.min(1, (now - t0) / this.ms);
      setAt(easeOut(t));
      if (t < 1) { this._raf = requestAnimationFrame(tick); return; }
      setAt(1);
      if (onDone) onDone();
    };
    this._raf = requestAnimationFrame(tick);
  }

  cancel() { cancelAnimationFrame(this._raf); }
}
