// The authority loop.
//
// Implements: ADR-0010 ("The first client in a room is the authority. It runs
// the one true `Sim`, applies every player's steering, and broadcasts
// snapshots"), 04-netcode-design.md §4 (rates), §6 (intent staleness, the
// heartbeat), §7.4 (what a keyframe has to carry so a successor can rebuild),
// §8 (a late joiner gets an immediate keyframe), §10.1 (the host records every
// hole's APPLIED intent per tick, which is the multi-slot trace `arena-finalize`
// replays).
//
// 03-technical-design.md §"js/net/arena-host.js" is where this file eventually
// lives under its shipping name; it is `host.js` here because nothing is wired
// into the game yet and the room-lifecycle half (`arena.js`) does not exist.
// Renaming it is the first line of the wiring commit.
//
// THE INVARIANT THIS FILE IS MOST LIKELY TO BREAK, stated where it can be seen:
// invariant 7 — the net layer never writes sim state. Remote input reaches the
// simulation ONLY as the `move` argument to `sim.step()`. There is exactly one
// call to `sim.step` below and no assignment anywhere in this file whose target
// is a sim field. A future edit that "just sets the hole position from the
// snapshot" during migration deletes both the shared-seed agreement and the
// replay defense, and it will look reasonable when it is written.
//
// No three.js, no `Math.random`, no `await` on the step path.

import {
  SNAPSHOT_INTERVAL_MS, KEYFRAME_INTERVAL_MS, INTENT_STALE_MS,
  captureSnapshot, captureEvents, holesOf,
} from './snapshot.js';
import {
  MSG, FLAG, CONTROL, encodeEnvelope, decodeEnvelope, validate,
} from './protocol.js';
import { PeerDriver, HumanDriver, IdleDriver } from './driver.js';

/** 04 §4: "Simulation | 60 Hz fixed | FIXED_DT in main.js ... Invariant 3." */
export const FIXED_DT = 1 / 60;

export class ArenaHost {
  /**
   * @param {object} opts
   *   sim          the one true Sim / VoxelSandboxSim
   *   transport    a Transport
   *   generation   arena_rooms.host_generation, stamped on every snapshot
   *   durationTicks match length in ticks (60 Hz)
   *   readInput    () => {x,z} for the host's own hole
   *   nowMs        () => number, injectable so the loop is testable
   */
  constructor({ sim, transport, generation = 0, durationTicks = 120 * 60, readInput = null, nowMs = null, seed = '' }) {
    this.sim = sim;
    this.transport = transport;
    this.generation = generation & 0xff;
    this.durationTicks = durationTicks;
    this.seed = seed;
    this.tick = 0;
    this.over = false;
    this._now = nowMs || (() => Date.now());
    this._lastSnapshotMs = -Infinity;
    this._lastKeyframeMs = -Infinity;
    this._pendingEvents = [];   // wire events accumulated since the last snapshot
    this._eatenIds = new Set(); // for the keyframe's consumed set (§7.4)

    // The host's own hole is slot 0 and is JUST ANOTHER DRIVER. That is the
    // whole point of the seam: swapping slot 0 for a bot (attract mode) or for
    // a peer (a headless host) is a roster edit, not a code change.
    this.drivers = new Map();
    this.drivers.set(0, readInput ? new HumanDriver(readInput, { slot: 0 }) : new IdleDriver({ slot: 0 }));

    // 04 §10.1: "The host records, per tick, every hole's applied intent — its
    // own from local input, each peer's from the last intent received for that
    // slot." Recorded as APPLIED, not as RECEIVED: a zeroed stale intent is
    // what the sim saw, so it is what the replay must see.
    this.trace = new Map();     // slot -> [{x, z}] indexed by tick
    this.trace.set(0, []);

    this._unsub = transport.on((env, meta) => this._onMessage(env, meta));
  }

  /** Seat a slot. `kind` is a driver kind; unknown kinds idle rather than throw. */
  addSlot(slot, kind = 'peer', opts = {}) {
    const d = kind === 'peer'
      ? new PeerDriver({ slot, staleMs: INTENT_STALE_MS, ...opts })
      : new IdleDriver({ slot, kind, ...opts });
    this.drivers.set(slot, d);
    if (!this.trace.has(slot)) this.trace.set(slot, []);
    return d;
  }

  removeSlot(slot) { this.drivers.delete(slot); }

  // --- inbound ---------------------------------------------------------------

  _onMessage(env, meta) {
    const verdict = validate(env);
    // Never trust the wire: a packet that fails the guard is counted and
    // dropped. It is not logged at 12 Hz and it never reaches a decoder.
    if (!verdict.ok) { this.badPackets = (this.badPackets || 0) + 1; this.lastBadReason = verdict.reason; return; }

    let msg;
    try { msg = decodeEnvelope(env); } catch (e) { this.badPackets = (this.badPackets || 0) + 1; this.lastBadReason = e.message; return; }

    if (msg.type === MSG.INTENT) {
      const d = this.drivers.get(msg.slot);
      // An intent for a slot nobody has been seated in is a stranger claiming a
      // seat. It is dropped, not auto-seated: seating is `arena-join`'s call,
      // and auto-seating here would let anyone with the room topic spawn holes.
      if (d instanceof PeerDriver) d.receive(msg, meta && meta.atMs != null ? meta.atMs : this._now());
      else this.unseatedIntents = (this.unseatedIntents || 0) + 1;
      return;
    }

    if (msg.t === CONTROL.JOIN) {
      // 04 §8: "The host sends an immediate keyframe on join rather than
      // waiting for the scheduled one, so the newcomer's first frame is
      // correct." Slot assignment itself belongs to arena.js; this is the
      // netcode half of the handshake.
      this.onJoin && this.onJoin(msg);
      this.sendKeyframe();
      return;
    }

    if (msg.t === CONTROL.PING) {
      // Clock sync. The host answers with its own tick and clock so a peer can
      // estimate RTT and offset; nothing in the sim depends on the answer.
      this.transport.send(encodeEnvelope(CONTROL.PONG, {
        id: msg.id, tClient: msg.tClient, tHost: this._now(), tick: this.tick,
      }));
      return;
    }

    if (msg.t === CONTROL.LEAVE) { this.removeSlot(msg.slot); return; }
  }

  // --- the loop --------------------------------------------------------------

  /**
   * One authoritative tick. Called from `main.js`'s existing fixed-step
   * accumulator, never on its own timer.
   *
   * Order matters and is not arbitrary: intents are aged BEFORE they are read
   * (04 §6, the 500 ms zeroing), the sim is stepped once, the events it
   * produced are captured without draining, and only then is the wire
   * considered. A snapshot built before the step would be one tick stale for
   * no reason.
   */
  step(dt = FIXED_DT, nowMs = null) {
    if (this.over) return null;
    const now = nowMs != null ? nowMs : this._now();

    // 04 §6: "The host zeroes a peer's intent after 500 ms of silence."
    for (const d of this.drivers.values()) if (d instanceof PeerDriver) d.zeroIfStale(now);

    const holes = holesOf(this.sim);
    const moves = this._collectMoves(holes, dt, now);

    // THE one call. See the invariant note at the top of this file.
    //
    // Feature detection over a version check: `sim.step(dt, move)` is today's
    // single-hole signature (js/voxelsim.js:2471) and `sim.step(dt)` with
    // per-hole drivers is PRD 0004 FR-005's. `step.length` distinguishes them
    // without either package having to know when the other landed.
    if (this.sim.step.length >= 2) this.sim.step(dt, moves.get(0) || { x: 0, z: 0 });
    else this.sim.step(dt);

    // Record the APPLIED intent for every slot (04 §10.1).
    for (const [slot, m] of moves) {
      let t = this.trace.get(slot);
      if (!t) { t = []; this.trace.set(slot, t); }
      t[this.tick] = { x: m.x, z: m.z };
    }

    this._harvestEvents();
    this.tick++;
    if (this.tick >= this.durationTicks) this.over = true;

    return this._maybeBroadcast(now);
  }

  _collectMoves(holes, dt, now) {
    const moves = new Map();
    for (const [slot, d] of this.drivers) {
      const hole = holes[slot] || (slot === 0 ? holes[0] : null);
      let m;
      try { m = d.decide(hole, this.sim, dt, now); } catch { m = null; }
      moves.set(slot, m && (m.x || m.z) ? { x: m.x, z: m.z } : { x: 0, z: 0 });
    }
    return moves;
  }

  /**
   * Read the sim's events into wire form WITHOUT draining them. `main.js` owns
   * `sim.events`; a net-layer splice would be a write to sim state and would
   * also silently swallow the HUD's combo toasts. The cursor is ours.
   */
  _harvestEvents() {
    const evs = this.sim.events || [];
    if (evs.length < (this._eventCursor || 0)) this._eventCursor = 0;   // main.js drained; restart
    const slice = evs.slice(this._eventCursor || 0);
    this._eventCursor = evs.length;
    if (!slice.length) return;
    const holes = holesOf(this.sim);
    const slotOf = (h) => {
      const i = holes.indexOf(h);
      return i >= 0 ? i : 0;
    };
    for (const e of captureEvents(slice, slotOf)) {
      this._pendingEvents.push(e);
      if (e.objectId) this._eatenIds.add(e.objectId);
    }
  }

  _maybeBroadcast(now) {
    if (now - this._lastKeyframeMs >= KEYFRAME_INTERVAL_MS) return this.sendKeyframe(now);
    if (now - this._lastSnapshotMs >= SNAPSHOT_INTERVAL_MS) return this.sendSnapshot(now);
    return null;
  }

  _snapshot(now, extraFlags) {
    const timeLeftCs = Math.max(0, Math.round(((this.durationTicks - this.tick) * FIXED_DT) * 100));
    const snap = captureSnapshot(this.sim, {
      generation: this.generation,
      tick: this.tick,
      timeLeftCs,
      flags: extraFlags | (this.over ? FLAG.MATCH_OVER : 0),
      // 04 §4.1: "eats since the last snapshot". Capped at the u8 the header
      // carries; an overflowing tick sheds the oldest, because the newest eats
      // are the ones whose animation still matters and the keyframe's consumed
      // set is what makes the loss recoverable.
      events: [],
    });
    snap.events = this._pendingEvents.slice(-255);
    this._pendingEvents.length = 0;
    this._lastSnapshotMs = now;
    return snap;
  }

  sendSnapshot(nowMs = null) {
    const now = nowMs != null ? nowMs : this._now();
    const snap = this._snapshot(now, 0);
    this.transport.send(encodeEnvelope('S', snap));
    return snap;
  }

  /**
   * 04 §7.4: the successor's lifeline. Carries the consumed set alongside the
   * usual per-hole state, so a new host can rebuild from "the last keyframe it
   * received, fast-forwarded by the snapshots after it".
   *
   * The consumed set is sent as an explicit id list here rather than as the RLE
   * bitset of 04 §4.1, and the reason is the same one the doc gives for voxel
   * scenes: "82,894 blocks is not a bitset we want on the wire twice a second."
   * `encodeEatenRLE` in ./snapshot.js is the campaign-scale path and is ready
   * for the campaign sim's ~1,400-object array; wiring which one a scene uses
   * belongs with the scene metadata, not here.
   */
  sendKeyframe(nowMs = null) {
    const now = nowMs != null ? nowMs : this._now();
    const snap = this._snapshot(now, FLAG.KEYFRAME);
    this._lastKeyframeMs = now;
    this.transport.send(encodeEnvelope('K', snap));
    return snap;
  }

  /** 04 §10.1's submission payload, per slot, ready for `arena-finalize`. */
  traceForSlot(slot) { return this.trace.get(slot) || []; }

  dispose() { if (this._unsub) this._unsub(); }
}
