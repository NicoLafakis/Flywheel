// Snapshot capture, application and interpolation — plus every tunable constant
// in the arena, because 04-netcode-design.md §13 says so:
//
//   > All in `js/net/snapshot.js` except where noted, so tuning is one file.
//
// Implements: 04-netcode-design.md §4 (rates), §4.1 (the keyframe's eaten set),
// §5.1 (buffered interpolation of remote holes), §5.2 (own-hole correction
// bands), §13 (the constant block), and 03-technical-design.md §1.3's row
// "Snapshot encode/decode ... deterministic (pure function of state)".
//
// PURE, and pure in the load-bearing sense of invariant 7: `captureSnapshot`
// READS a sim and returns a plain object. It does not clear `sim.events`, does
// not touch a single field, and nothing else here has a reference to a `Sim` at
// all. `applySnapshot` writes into the net layer's own ghost roster — never
// `sim.rivals`, which 03 §1.3 calls out as the exact "simplification" that
// would delete the replay defense.
//
// No three.js, no `Math.random`, no I/O.

import { encodeSnapshot, decodeSnapshot, HOLE_STATE, EVENT_FLAG, FLAG, Q } from './protocol.js';

export { encodeSnapshot, decodeSnapshot, HOLE_STATE, EVENT_FLAG, FLAG };

// --- 04 §13: constants, in one place ----------------------------------------

export const SNAPSHOT_HZ = 12;          // ceiling 15; see 03 §7.3 for why 12 ships
export const INTENT_HZ = 10;            // ceiling 20
export const KEYFRAME_HZ = 0.5;
export const INTERP_DELAY_MS = 100;
export const EXTRAPOLATE_MAX_MS = 250;
export const CORRECTION_IGNORE_M = 0.5;
export const CORRECTION_SMOOTH_M = 3.0; // above this: snap
export const CORRECTION_BLEND_MS = 150;
export const INTENT_STALE_MS = 500;     // host zeroes a silent peer's steering
export const HOST_TIMEOUT_MS = 1500;    // -> migration
export const CLAIM_STAGGER_MS = 300;    // x succession index
export const RECONNECT_GRACE_MS = 30000;
export const LATE_JOIN_CUTOFF_S = 30;   // before match end
export const MAX_PLAYERS = 8;           // arena_rooms.max_players is the real authority
export const SPECTATOR_CAP = 20;

/** Derived, so nothing recomputes 1000/12 at a call site and rounds it differently. */
export const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
export const INTENT_INTERVAL_MS = 1000 / INTENT_HZ;
export const KEYFRAME_INTERVAL_MS = 1000 / KEYFRAME_HZ;
/** 04 §5.1: "Keep a ring buffer of the last 8 snapshots, ordered by tick." */
export const SNAPSHOT_BUFFER = 8;

// --- capture -----------------------------------------------------------------

/**
 * Read every hole out of a sim, whatever shape it is in.
 *
 * TODAY `VoxelSandboxSim` has exactly one hole at `sim.hole` (js/voxelsim.js:252).
 * TOMORROW PRD 0004 FR-001/FR-002 turn that into `sim.holes[]` with `sim.hole`
 * surviving only as a getter for `holes[0]`. Both are handled by feature
 * detection rather than by a version check, because the getter means a
 * `sim.hole` read cannot tell the two apart and a build-version branch here
 * would silently pick the wrong one the day the refactor lands.
 */
export function holesOf(sim) {
  if (Array.isArray(sim.holes) && sim.holes.length) return sim.holes;
  return sim.hole ? [sim.hole] : [];
}

/**
 * SCORE/COMBO MAPPING (the work in flight on `js/voxelsim.js`).
 *
 * A hole carries two masses and they are not interchangeable:
 *   - `h.mass`     combo-multiplied. The score. This is what goes on the wire
 *                  as `mass_q`, because it is what the HUD shows and what a
 *                  peer's `observed_final` (04 §10.2) is a claim about.
 *   - `h.rawMass`  un-multiplied. Drives the SIZE ladder and the goal bar
 *                  (voxelsim.js:2423). It is NOT sent: a peer can re-derive
 *                  `size` from `radius`, and 04 §5.2 forbids a peer predicting
 *                  mass at all, so shipping it twice a second buys nothing.
 *   - `h.chain` / `h.chainTimer` / `h.bestCombo`  live only on the host. A
 *                  combo CROSSING is what a peer needs to see, and that arrives
 *                  as an event with EVENT_FLAG.COMBO_POP, not as a per-tick
 *                  number. One byte on a crossing beats two bytes at 12 Hz.
 * When per-hole chains land for real, the crossing event already carries the
 * slot, so nothing in the wire format has to move.
 */
export function captureHole(hole, slot) {
  return {
    slot,
    state: (hole.alive === false ? 0 : HOLE_STATE.ALIVE)
      | (hole.disconnected ? HOLE_STATE.DISCONNECTED : 0)
      | (hole.swallowing ? HOLE_STATE.SWALLOWING : 0),
    x: hole.x,
    z: hole.z,
    mass: hole.mass,
    radius: hole.radius,
    // The sim has no heading field — a hole is a circle and does not face
    // anywhere. `heading_q` exists for the renderer's rim orientation, so we
    // take it if a hole has one and send 0 if not, rather than inventing one
    // from velocity the sim does not store.
    heading: hole.heading || 0,
  };
}

/**
 * Map the sim's own event array onto wire events (04 §4.1: "per event ... eats
 * since the last snapshot").
 *
 * Does NOT drain `sim.events` — that is `main.js`'s to do, and draining it here
 * would be the net layer writing sim state. Pass the already-drained array as
 * `opts.events` when the host has one; otherwise this reads `sim.events` in
 * place and the host is responsible for calling once per drain cycle.
 */
export function captureEvents(events, slotOf) {
  const out = [];
  for (const ev of events || []) {
    if (ev.type === 'eat') {
      const obj = ev.obj;
      if (!obj || obj.id == null) continue;
      out.push({
        slot: slotOf(ev.hole),
        flags: (obj.golden ? EVENT_FLAG.GOLDEN : 0) | (obj.landmark ? EVENT_FLAG.LANDMARK : 0),
        objectId: obj.id,
      });
    } else if (ev.type === 'combo') {
      // A combo crossing has no object. objectId 0 is not a real block id
      // (voxelsim.js:264 starts `_blockId` at 1), so it is free to mean "none".
      out.push({ slot: slotOf(ev.hole), flags: EVENT_FLAG.COMBO_POP, objectId: 0 });
    }
  }
  return out;
}

/**
 * The whole capture. Returns a plain object ready for `encodeSnapshot`.
 *
 * @param {object} sim  a Sim or VoxelSandboxSim, read-only
 * @param {object} opts { generation, tick, timeLeftCs, flags, events, slotOf }
 */
export function captureSnapshot(sim, opts = {}) {
  const holes = holesOf(sim);
  const slotIndex = new Map();
  holes.forEach((h, i) => slotIndex.set(h, h.slot != null ? h.slot : (h.index != null ? h.index : i)));
  const slotOf = opts.slotOf || ((h) => (slotIndex.has(h) ? slotIndex.get(h) : 0));

  return {
    generation: opts.generation || 0,
    tick: (opts.tick || 0) & 0xffff,
    flags: opts.flags || 0,
    timeLeftCs: Math.max(0, Math.round(opts.timeLeftCs || 0)),
    holes: holes.map((h, i) => captureHole(h, slotIndex.get(h) != null ? slotIndex.get(h) : i)),
    events: captureEvents(opts.events || sim.events, slotOf),
  };
}

// --- the keyframe's eaten set (04 §4.1) --------------------------------------

/**
 * RLE a bitset of consumed object ids. "Lower Manhattan's ~1,400 campaign-scale
 * objects is 175 bytes raw and typically under 60 RLE'd."
 *
 * Format: a run-length stream of alternating NOT-EATEN / EATEN run lengths,
 * starting with NOT-EATEN, each run a varint (7 bits per byte, high bit = more).
 * A run longer than a varint can hold is impossible: the largest scene is 82,894
 * blocks and three varint bytes cover 2,097,151.
 */
export function encodeEatenRLE(isEaten, count) {
  const out = [];
  let run = 0, want = false;
  for (let i = 0; i < count; i++) {
    const v = !!isEaten(i);
    if (v === want) { run++; continue; }
    pushVarint(out, run);
    run = 1; want = v;
  }
  pushVarint(out, run);
  return new Uint8Array(out);
}

export function decodeEatenRLE(bytes, count) {
  const eaten = new Uint8Array(count);
  let i = 0, o = 0, val = 0;
  while (o < bytes.length && i < count) {
    let run = 0, shift = 0, b;
    do {
      if (o >= bytes.length) throw new RangeError('truncated RLE varint');
      b = bytes[o++];
      run |= (b & 0x7f) << shift;
      shift += 7;
      if (shift > 28) throw new RangeError('RLE varint too long');
    } while (b & 0x80);
    if (val) {
      const end = Math.min(count, i + run);
      for (let k = i; k < end; k++) eaten[k] = 1;
    }
    i += run;
    val ^= 1;
  }
  return eaten;
}

function pushVarint(out, n) {
  let v = n >>> 0;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
}

// --- the ghost roster --------------------------------------------------------

/**
 * The net layer's own record of remote holes. 04 §1: a ghost "lives in the net
 * layer's roster, never in `sim.rivals` (invariant 7)". This object is what
 * `world3d.js` will read; the sim never sees it.
 */
export class GhostRoster {
  constructor() { this.bySlot = new Map(); }

  get(slot) {
    let g = this.bySlot.get(slot);
    if (!g) {
      g = { slot, x: 0, z: 0, mass: 0, radius: 0, heading: 0, alive: true, disconnected: false, swallowing: false, seenTick: -1, frozen: false, dim: 0 };
      this.bySlot.set(slot, g);
    }
    return g;
  }

  list() { return [...this.bySlot.values()]; }
  remove(slot) { this.bySlot.delete(slot); }
}

/** Copy one decoded snapshot's holes into a roster. Presentation state only. */
export function applySnapshot(roster, snap, { skipSlot = -1 } = {}) {
  for (const h of snap.holes) {
    if (h.slot === skipSlot) continue;   // your own hole is predicted (04 §5.2)
    const g = roster.get(h.slot);
    g.x = h.x; g.z = h.z; g.mass = h.mass; g.radius = h.radius; g.heading = h.heading;
    g.alive = !!(h.state & HOLE_STATE.ALIVE);
    g.disconnected = !!(h.state & HOLE_STATE.DISCONNECTED);
    g.swallowing = !!(h.state & HOLE_STATE.SWALLOWING);
    g.seenTick = snap.tick;
    g.frozen = false; g.dim = 0;
  }
  return roster;
}

// --- interpolation (04 §5.1) -------------------------------------------------

/**
 * The ring buffer of received snapshots, ordered by tick, with the local
 * wall-clock time each arrived. Wall-clock is correct here and only here: 03
 * §1.3 puts interpolation in the "not deterministic, presentation, never fed
 * back into step()" row.
 */
export class SnapshotBuffer {
  constructor(size = SNAPSHOT_BUFFER) {
    this.size = size;
    this.items = [];       // [{ snap, atMs }] oldest-first
    this.newestTick = -1;
  }

  /**
   * @returns {boolean} accepted. 04 §6: "Snapshots older than the newest tick
   * seen are discarded, and the tick is a 16-bit wrap-around compare, so a
   * burst that arrives out of order after a stall cannot rewind the world."
   */
  push(snap, atMs) {
    if (this.newestTick >= 0) {
      const d = (snap.tick - this.newestTick) & 0xffff;
      if (d === 0 || d >= 0x8000) return false;
    }
    this.newestTick = snap.tick;
    this.items.push({ snap, atMs });
    while (this.items.length > this.size) this.items.shift();
    return true;
  }

  newest() { return this.items.length ? this.items[this.items.length - 1] : null; }
  get length() { return this.items.length; }

  /** ms since the newest snapshot arrived — the heartbeat, per 04 §4. */
  silenceMs(nowMs) {
    const n = this.newest();
    return n ? nowMs - n.atMs : Infinity;
  }
}

const TAU = Math.PI * 2;

/** Shortest-arc angle lerp. 04 §5.1: "slerp heading on the shortest arc." */
export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  let r = (a + d * t) % TAU;
  if (r < 0) r += TAU;
  return r;
}

/**
 * Interpolate every hole at `renderTimeMs = nowMs - INTERP_DELAY_MS`.
 *
 * Returns a Map slot -> {x, z, radius, mass, heading, extrapolated, frozen}.
 *
 * 04 §5.1, in order:
 *   - find the bracketing pair, lerp position and radius linearly;
 *   - "If the buffer has run dry (the host went quiet), extrapolate for at most
 *     250 ms along the last known velocity with a decay, then freeze the ghost
 *     and dim it."
 * Mass is lerped alongside radius rather than stepped, because a ghost's mass
 * only feeds a scoreboard readout and a stepping number next to a smoothly
 * growing hole reads as a bug.
 */
export function interpolate(buffer, nowMs) {
  const out = new Map();
  const items = buffer.items;
  if (!items.length) return out;
  const renderAt = nowMs - INTERP_DELAY_MS;

  // Bracketing pair by ARRIVAL time: tick is authoritative for ordering, but
  // the render clock is local, so the two ends of the lerp have to be local too.
  let lo = null, hi = null;
  for (let i = 0; i < items.length; i++) {
    if (items[i].atMs <= renderAt) lo = items[i];
    if (items[i].atMs > renderAt) { hi = items[i]; break; }
  }

  if (lo && hi) {
    const span = hi.atMs - lo.atMs;
    const t = span > 0 ? (renderAt - lo.atMs) / span : 0;
    const hiBySlot = new Map(hi.snap.holes.map((h) => [h.slot, h]));
    for (const a of lo.snap.holes) {
      const b = hiBySlot.get(a.slot);
      out.set(a.slot, b ? {
        slot: a.slot,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        radius: a.radius + (b.radius - a.radius) * t,
        mass: a.mass + (b.mass - a.mass) * t,
        heading: lerpAngle(a.heading, b.heading, t),
        state: b.state,
        extrapolated: false, frozen: false,
      } : { ...a, extrapolated: false, frozen: false });
    }
    return out;
  }

  // Buffer ran dry on the future side: extrapolate from the last pair, decaying,
  // for at most EXTRAPOLATE_MAX_MS, then freeze.
  const last = items[items.length - 1];
  const prev = items.length > 1 ? items[items.length - 2] : null;
  const ahead = renderAt - last.atMs;
  const over = ahead > EXTRAPOLATE_MAX_MS;
  const dtExtrap = Math.max(0, Math.min(ahead, EXTRAPOLATE_MAX_MS)) / 1000;
  const prevBySlot = prev ? new Map(prev.snap.holes.map((h) => [h.slot, h])) : null;

  for (const h of last.snap.holes) {
    const p = prevBySlot ? prevBySlot.get(h.slot) : null;
    let vx = 0, vz = 0;
    if (p) {
      const span = (last.atMs - prev.atMs) / 1000;
      if (span > 0) { vx = (h.x - p.x) / span; vz = (h.z - p.z) / span; }
    }
    // Linear decay to zero across the extrapolation window: a ghost that keeps
    // full speed for 250 ms slides through a building, which 04 §5.1 names as
    // the thing to avoid.
    const decay = EXTRAPOLATE_MAX_MS > 0 ? Math.max(0, 1 - (dtExtrap * 1000) / EXTRAPOLATE_MAX_MS) : 0;
    const travel = dtExtrap * (0.5 + 0.5 * decay);
    out.set(h.slot, {
      slot: h.slot,
      x: h.x + vx * travel,
      z: h.z + vz * travel,
      radius: h.radius, mass: h.mass, heading: h.heading, state: h.state,
      extrapolated: dtExtrap > 0, frozen: over,
    });
  }
  return out;
}

// --- own-hole reconciliation (04 §5.2) ---------------------------------------

export const CORRECTION = Object.freeze({ IGNORE: 'ignore', SMOOTH: 'smooth', SNAP: 'snap' });

/**
 * Classify a prediction error. The three bands are quoted from 04 §5.2:
 * "< 0.5 m — ignore it", "0.5-3 m — smooth ... over 150 ms", "> 3 m — snap, and
 * flash the rim."
 */
export function correctionFor(errorM) {
  if (!(errorM > CORRECTION_IGNORE_M)) return CORRECTION.IGNORE;
  if (errorM <= CORRECTION_SMOOTH_M) return CORRECTION.SMOOTH;
  return CORRECTION.SNAP;
}

/**
 * One frame of the exponential blend toward an authoritative position.
 * `CORRECTION_BLEND_MS` is the time constant, so the visible error falls to
 * ~5% of its value across 3 blend windows rather than snapping at 150 ms.
 * Returns the new visual position; the caller owns where it lives.
 */
export function blendToward(visual, authoritative, dtMs) {
  const k = 1 - Math.exp(-dtMs / CORRECTION_BLEND_MS);
  return {
    x: visual.x + (authoritative.x - visual.x) * k,
    z: visual.z + (authoritative.z - visual.z) * k,
  };
}

/** Quantisation floor, exported so a test can assert the ignore band clears it. */
export const POSITION_RESOLUTION_M = 1 / Q.POS_CM;
