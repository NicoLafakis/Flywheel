// The attribution record: block id → eater slot, plus per-slot consumed-mass
// tallies (rival-visibility T2).
//
// This is DATA, deliberately separable from any renderer (AC-01.8): a headless
// consumer — a test, a future replay heatmap, a leaderboard stat — reads it
// without three.js. The crater tint, the tug-of-war bar and the end reveal are
// all derived FROM this record, never the other way around (overview, move 4).
//
// Sources feeding it:
//   - host: the sim's drained `eat` events (`{obj, hole}` — attribution decided
//     in `_consume`'s caller, so a block is never double-counted);
//   - peer: decoded wire events (`e.slot` is the eater) and the keyframe's
//     per-slot eaten streams (protocol v3 — the wire gap this package closed).
//
// First attribution wins: the host never re-attributes a block, so any later
// claim for an id already recorded is a duplicate delivery (an event that also
// appears in a keyframe), not a dispute. That rule is what makes the record
// deterministic under wire reordering.
//
// READ-ONLY over sim state (CC-1): nothing here writes a hole or block field.
// No Math.random, no Date.now, no I/O (CC-2).

import { MAX_SLOTS } from './identity.js';
import { EATER_ANON } from '../net/protocol.js';

/** Keyframe streams use this pseudo-slot for "eaten, eater unknown" (a block
 * consumed before the recording host existed) — the wire's EATER_ANON,
 * re-exported so headless consumers need only this module. */
export const EATER_UNKNOWN = EATER_ANON;

export class AttributionRecord {
  /**
   * @param {(id:number)=>number} rawMassOf  raw (un-multiplied) mass of the
   *   block with that id, from the LOCAL city build — both sides built the
   *   identical city from the shared seed, so tallies agree by construction.
   */
  constructor(rawMassOf) {
    this._rawMassOf = rawMassOf || (() => 0);
    this.eaterOf = new Map();          // id -> slot (or EATER_UNKNOWN)
    this.massBySlot = new Float64Array(MAX_SLOTS);
    this.countBySlot = new Uint32Array(MAX_SLOTS);
    this.totalMass = 0;                // attributed mass only
    this.totalCount = 0;
  }

  /**
   * Record one eat. Returns true if this id was newly attributed.
   * `slot === EATER_UNKNOWN` marks the block eaten without crediting anyone.
   */
  recordEat(id, slot) {
    if (!Number.isInteger(id) || id <= 0) return false;
    if (this.eaterOf.has(id)) return false;     // first attribution wins
    this.eaterOf.set(id, slot);
    if (slot >= 0 && slot < MAX_SLOTS) {
      const raw = this._rawMassOf(id) || 0;
      this.massBySlot[slot] += raw;
      this.countBySlot[slot] += 1;
      this.totalMass += raw;
      this.totalCount += 1;
    }
    return true;
  }

  /** Eater slot for a block id, or -1 if not recorded / unknown eater. */
  slotOf(id) {
    const s = this.eaterOf.get(id);
    return s === undefined || s === EATER_UNKNOWN ? -1 : s;
  }

  /** Per-slot share of all ATTRIBUTED consumed mass, as an array summing to 1
   * (even split across `activeSlots` when nothing has been eaten yet). */
  shares(activeSlots) {
    const slots = activeSlots && activeSlots.length ? activeSlots : [0, 1];
    const out = new Array(slots.length);
    if (this.totalMass <= 0) {
      out.fill(1 / slots.length);
      return out;
    }
    for (let i = 0; i < slots.length; i++) out[i] = this.massBySlot[slots[i]] / this.totalMass;
    return out;
  }

  /** The eaten sets per slot — what the keyframe round-trip tests compare. */
  idsBySlot() {
    const by = new Map();
    for (const [id, slot] of this.eaterOf) {
      let set = by.get(slot);
      if (!set) by.set(slot, set = new Set());
      set.add(id);
    }
    return by;
  }
}

/**
 * Exact final split for the end reveal (AC-06.1): computed from the SAME
 * record the live surfaces used — never a separate tally that could disagree
 * with what the city shows. Percentages are rounded to one decimal for
 * display; `mass` stays exact for the winner comparison.
 */
export function finalSplit(record, activeSlots) {
  const slots = activeSlots && activeSlots.length ? activeSlots : [0, 1];
  const shares = record.shares(slots);
  return slots.map((slot, i) => ({
    slot,
    mass: record.massBySlot[slot],
    share: shares[i],
    percent: Math.round(shares[i] * 1000) / 10,
  }));
}
