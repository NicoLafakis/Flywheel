// The tug-of-war mass bar (pattern 2): one horizontal bar, N segments, each
// segment's width the slot's share of consumed mass. Possession bar, not a
// scoreboard — NO digits during play (AC-02.5); the exact number is the end
// reveal's payoff.
//
// `computeShares` is the pure half (headless-tested): quantised to BAR_QUANT
// so the bar stays deliberately coarse, largest-remainder rounded so segments
// always sum to exactly 100% of the track, even split at zero mass (no divide
// by zero). N segments from one code path — 2 players and 8 players are the
// same call (AC-02.6).
//
// The DOM half writes styles only when a width actually changed — no per-frame
// layout churn, no allocation on the update path.

import { slotColorCss, slotName } from './identity.js';
import { RIVAL } from './constants.js';

/**
 * @param {number[]} masses  per-slot consumed mass, roster order
 * @param {number} quant     quantisation step (fraction), default BAR_QUANT
 * @returns {number[]} fractions summing to exactly 1
 */
export function computeShares(masses, quant = RIVAL.BAR_QUANT) {
  const n = masses.length;
  if (!n) return [];
  let total = 0;
  for (const m of masses) total += Math.max(0, m);
  if (total <= 0) return new Array(n).fill(1 / n);

  // Quantise by largest remainder so the segments tile the bar exactly.
  const steps = Math.round(1 / quant);
  const raw = masses.map((m) => (Math.max(0, m) / total) * steps);
  const base = raw.map(Math.floor);
  let used = 0;
  for (const b of base) used += b;
  const order = raw.map((v, i) => ({ i, frac: v - base[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < steps - used; k++) base[order[k % n].i] += 1;
  return base.map((b) => b / steps);
}

export class TugBar {
  /**
   * @param {HTMLElement} track  the bar track element (styled by the page)
   * @param {Array<{slot:number,label?:string}>} seats  roster order
   */
  constructor(track, seats) {
    this.track = track;
    this.segments = seats.map(({ slot, label }) => {
      const seg = document.createElement('div');
      seg.className = 'tug-seg';
      seg.style.background = slotColorCss(slot);
      // Redundant non-color channel (CC-4): each segment names its player.
      seg.title = label || slotName(slot);
      seg.setAttribute('aria-label', seg.title);
      track.appendChild(seg);
      return seg;
    });
    this._last = new Array(this.segments.length).fill(-1);
  }

  /** @param {number[]} shares  from computeShares, same order as seats */
  update(shares) {
    for (let i = 0; i < this.segments.length; i++) {
      const w = Math.round((shares[i] || 0) * 1000) / 10;
      if (w === this._last[i]) continue;
      this._last[i] = w;
      this.segments[i].style.width = w + '%';
    }
  }
}
