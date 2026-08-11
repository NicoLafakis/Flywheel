// Milestone beat detection (pattern 5): pure detectors over shares, the clock
// and eat events. Rare by design — 3 to 5 beats per 3-minute match — so every
// beat still lands as an event, not a feed.
//
// AC-05.1: every detector is exactly-once (or explicitly capped) and the lead
// change carries hysteresis, so a share ratio oscillating across 50% cannot
// machine-gun the announcement channel. AC-05.2: ALL callout copy lives in
// BEAT_COPY below — call sites hold no feed strings.
//
// Pure over its inputs. No DOM, no three.js, no Math.random, no clocks of its
// own (CC-2) — the match clock arrives as an argument.

import { RIVAL } from './constants.js';

export const BEAT = Object.freeze({
  FIRST_BLOOD: 'first_blood',
  LEAD_TAKEN: 'lead_taken',
  TRAILING: 'trailing',
  LANDMARK: 'landmark',
});

/** THE copy table (AC-05.2). `who` is the actor's display name, upper-cased
 * by the caller; every line names its actor — color is never the only channel.
 * Second person conjugates: the local player is always the literal "YOU". */
const you = (who) => who === 'YOU';
export const BEAT_COPY = Object.freeze({
  [BEAT.FIRST_BLOOD]: (who) => `${who} ${you(who) ? 'DRAW' : 'DRAWS'} FIRST BLOOD`,
  [BEAT.LEAD_TAKEN]: (who) => `${who} ${you(who) ? 'TAKE' : 'TAKES'} THE LEAD`,
  [BEAT.TRAILING]: () => `30 SECONDS — YOU'RE BEHIND`,
  [BEAT.LANDMARK]: (who) => `${who} ATE A LANDMARK`,
});

export class BeatTracker {
  /**
   * @param {object} opts
   *   mySlot      the local player's slot (the TRAILING beat is about them)
   *   slots       seated slots in roster order
   *   hysteresis  lead margin required (share fraction)
   *   trailingAtS when the "you're behind" beat may fire (seconds left)
   *   maxLeadBeats cap on lead-change callouts per match
   */
  constructor({ mySlot = 0, slots = [0, 1], hysteresis = RIVAL.LEAD_HYSTERESIS,
    trailingAtS = RIVAL.TRAILING_AT_S, maxLeadBeats = RIVAL.MAX_LEAD_BEATS } = {}) {
    this.mySlot = mySlot;
    this.slots = slots;
    this.hysteresis = hysteresis;
    this.trailingAtS = trailingAtS;
    this.maxLeadBeats = maxLeadBeats;
    this._firstBlood = false;
    this._leader = -1;          // last ANNOUNCED leader
    this._leadBeats = 0;
    this._trailed = false;
    this._landmarks = 0;
  }

  /**
   * Feed one eat. Returns beats (possibly empty). `landmark` comes from the
   * wire's LANDMARK event flag on peers, `obj.landmark` on the host.
   */
  noteEat(slot, { landmark = false } = {}) {
    const out = [];
    if (!this._firstBlood) {
      this._firstBlood = true;
      out.push({ type: BEAT.FIRST_BLOOD, slot });
    }
    if (landmark) {
      this._landmarks += 1;
      out.push({ type: BEAT.LANDMARK, slot });
    }
    return out;
  }

  /**
   * Feed the current standings. `shares` is per-slot share of consumed mass in
   * `slots` order (attribution.shares); `anyEaten` gates the lead logic so the
   * even split before the first eat is never read as a standing.
   */
  update(shares, secondsLeft, anyEaten) {
    const out = [];
    if (!anyEaten) return out;

    // Lead change, with hysteresis: the top slot must clear the runner-up by
    // the margin before it counts as a NEW leader worth announcing.
    let top = 0;
    for (let i = 1; i < shares.length; i++) if (shares[i] > shares[top]) top = i;
    let second = -Infinity;
    for (let i = 0; i < shares.length; i++) if (i !== top && shares[i] > second) second = shares[i];
    const topSlot = this.slots[top];
    if (shares[top] - second >= this.hysteresis && topSlot !== this._leader) {
      // First clear leader is FIRST_BLOOD's job, not a "takes the lead" beat.
      if (this._leader !== -1 && this._leadBeats < this.maxLeadBeats) {
        this._leadBeats += 1;
        out.push({ type: BEAT.LEAD_TAKEN, slot: topSlot });
      }
      this._leader = topSlot;
    }

    // Trailing at 30 s: once, and only if genuinely behind by the margin.
    if (!this._trailed && secondsLeft <= this.trailingAtS && secondsLeft > 0) {
      this._trailed = true;   // latched whether or not it fires — one window
      const mine = this.slots.indexOf(this.mySlot);
      if (mine >= 0 && shares[top] - shares[mine] >= this.hysteresis && topSlot !== this.mySlot) {
        out.push({ type: BEAT.TRAILING, slot: this.mySlot });
      }
    }
    return out;
  }
}
