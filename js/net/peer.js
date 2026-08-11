// The follower loop.
//
// Implements: 04-netcode-design.md §5 in both halves — §5.1 (remote holes are
// interpolated ghosts drawn 100 ms in the past out of a ring buffer, never
// simulated) and §5.2 (your own hole is predicted locally with the SHARED speed
// function and reconciled through the ignore/smooth/snap bands) — plus §4's
// intent cadence ("Intent send rate must stay time-based, not tick-based",
// §6.1) and the PING/PONG clock sync the host answers.
//
// 03-technical-design.md §"js/net/arena-peer.js" is where this file eventually
// lives under its shipping name; it is `peer.js` here for the same reason its
// counterpart is `host.js`: the room-lifecycle half (`arena.js`, T-603) does
// not exist yet, and renaming both is the first line of that wiring commit.
//
// THE INVARIANT, restated where it can be seen (invariant 7 / T-605's note):
// this file holds NO reference to any authoritative sim. Everything it knows
// arrives over `transport.on(...)`; everything it decides leaves over
// `transport.send(...)`. Ghosts live in the net layer's own `GhostRoster` —
// never `sim.rivals`, never anybody's `sim` at all — and the predicted own
// hole is presentation state in this class. A renderer reads this object; a
// sim never does.
//
// The asymmetry of §5.2, enforced structurally: `x`/`z` of the own hole are
// the ONLY predicted fields. `radius`, `mass`, `size`-anything, and every eat
// arrive exclusively from snapshots — there is no code path here that can
// change them locally, so "a prop vanishing and returning" cannot be written
// by accident.
//
// No three.js, no DOM, no `Math.random`, no `await` on the frame path.

import {
  INTENT_INTERVAL_MS,
  SnapshotBuffer, GhostRoster, applySnapshot, interpolate,
  correctionFor, blendToward, CORRECTION, decodeEatenRLE,
} from './snapshot.js';
import { FLAG, EVENT_FLAG, CONTROL, EATER_ANON, encodeEnvelope, decodeEnvelope, validate } from './protocol.js';
import { playerSpeedForRadius } from '../tiers.js';

/** How often the peer measures RTT. Nothing in the sim depends on it. */
export const PING_INTERVAL_MS = 1000;

/** Prediction history depth: enough to look one full RTT plus jitter back. */
const HISTORY_MS = 2000;

/**
 * The starting radius of a sandbox hole (voxelsim.js START_RADIUS). Used only
 * until the first snapshot arrives — a window of one snapshot interval — after
 * which the authoritative radius is the only one this class ever holds.
 */
const FALLBACK_START_RADIUS = 1.1;

export class ArenaPeer {
  /**
   * @param {object} opts
   *   transport      a Transport (Loopback today, Supabase Realtime later —
   *                  swapping it is the whole point of the seam)
   *   slot           this player's slot, assigned by the join flow
   *   sessionId      sent in the JOIN control message
   *   readInput      () => {x,z} — the local input latch
   *   nowMs          () => number, injectable so the loop is testable
   *   speedForRadius (radius) => m/s for the own-hole prediction. Defaults to
   *                  the shared tiers.js curve; a sandbox page passes
   *                  voxelsim's `sandboxSpeedForRadius` so the ramp matches
   *                  the authoritative sim exactly (hard rule 4: shared
   *                  function, never a copy)
   *   boundsRect     {minX,maxX,minZ,maxZ} clamp for the prediction — the same
   *                  clamp the sim applies, from the peer's OWN city build
   *   spawn          {x,z} where this slot's hole spawns
   *   objectCount    id-space size for decoding the keyframe's eaten bitset
   *                  (max block id + 1, from the peer's own city build)
   *   generation     expected host generation; snapshots stamped lower are
   *                  dropped (a returning zombie host, 04 §7.3)
   */
  constructor({
    transport, slot, sessionId = '', readInput = null, nowMs = null,
    speedForRadius = null, boundsRect = null, spawn = null,
    objectCount = 0, generation = null,
  }) {
    this.transport = transport;
    this.slot = slot;
    this.sessionId = sessionId;
    this._read = readInput || (() => ({ x: 0, z: 0 }));
    this._now = nowMs || (() => Date.now());
    this._speedFor = speedForRadius || playerSpeedForRadius;
    this.boundsRect = boundsRect;
    this.objectCount = objectCount;
    this.expectedGeneration = generation;

    // §5.1: the ring buffer and the roster the renderer reads.
    this.buffer = new SnapshotBuffer();
    this.roster = new GhostRoster();

    // §5.2: the predicted own hole. `pred` is the logical position (input
    // applied instantly, corrections applied instantly); `renderPos` is the
    // visual one, blended toward `pred` so a smooth-band correction reads as
    // drift rather than a jump. Both are presentation state; neither is a sim.
    const sx = spawn ? spawn.x : 0, sz = spawn ? spawn.z : 0;
    this.pred = { x: sx, z: sz };
    this.renderPos = { x: sx, z: sz };
    // The authoritative view of our own hole — radius/mass/etc are NEVER
    // predicted (§5.2), so this is a straight copy of the newest snapshot.
    this.self = { x: sx, z: sz, mass: 0, radius: FALLBACK_START_RADIUS, heading: 0, state: 1 };
    this._history = [];          // [{atMs, x, z}] of pred, oldest first
    this._seq = 0;
    this._lastIntentMs = -Infinity;
    this._lastMove = { x: 0, z: 0 };

    // PING/PONG.
    this._pingId = 0;
    this._lastPingMs = -Infinity;
    this.rttMs = NaN;
    this.hostTick = -1;          // from the last PONG; diagnostic only

    // What arrived over the wire, for the renderer to drain.
    this.consumed = new Set();   // objectIds known eaten
    this._newlyConsumed = [];    // ids not yet drained by the renderer
    // objectId -> eater slot, from live events AND healed keyframes (v3's
    // per-slot streams). This is presentation data — the rival-visibility
    // layer reads it to answer "whose block was that" (AC-01.2 / AC-01.4).
    this.eaterOf = new Map();
    this._events = [];           // decoded wire events not yet drained
    this.timeLeftCs = 0;
    this.matchOver = false;

    this.stats = {
      snapshots: 0, keyframes: 0, rejected: 0, staleTicks: 0, staleGeneration: 0,
      intentsSent: 0, corrections: { ignore: 0, smooth: 0, snap: 0 },
    };
    this.lastCorrection = CORRECTION.IGNORE;
    this.lastErrorM = 0;

    this._unsub = transport.on((env, meta) => this._onMessage(env, meta));
  }

  /** Announce ourselves. The host answers with an immediate keyframe (04 §8). */
  join() {
    this.transport.send(encodeEnvelope(CONTROL.JOIN, { sessionId: this.sessionId, slot: this.slot }));
  }

  // --- inbound ---------------------------------------------------------------

  _onMessage(env, meta) {
    const verdict = validate(env);
    if (!verdict.ok) { this.stats.rejected++; this.lastBadReason = verdict.reason; return; }
    let msg;
    try { msg = decodeEnvelope(env); } catch (e) { this.stats.rejected++; this.lastBadReason = e.message; return; }

    if (env.t === 'S' || env.t === 'K') {
      const atMs = meta && meta.atMs != null ? meta.atMs : this._now();
      this._onSnapshot(msg, env.t === 'K', atMs);
      return;
    }
    if (msg.t === CONTROL.PONG) {
      if (msg.id === this._pingId) {
        this.rttMs = this._now() - msg.tClient;
        if (msg.tick != null) this.hostTick = msg.tick;
      }
      return;
    }
  }

  _onSnapshot(snap, isKeyframe, atMs) {
    // A snapshot stamped with an older generation is a zombie host (04 §7.3).
    if (this.expectedGeneration != null && snap.generation !== this.expectedGeneration) {
      this.stats.staleGeneration++;
      return;
    }
    // The buffer enforces tick ordering (16-bit wrap compare, 04 §6).
    if (!this.buffer.push(snap, atMs)) { this.stats.staleTicks++; return; }
    if (isKeyframe) this.stats.keyframes++; else this.stats.snapshots++;

    this.timeLeftCs = snap.timeLeftCs;
    if (snap.flags & FLAG.MATCH_OVER) this.matchOver = true;

    // Remote holes into the ghost roster; our own slot is skipped — it is
    // predicted, not applied (§5.2).
    applySnapshot(this.roster, snap, { skipSlot: this.slot });

    // Our own hole: authoritative non-positional state is copied verbatim;
    // position feeds reconciliation.
    for (const h of snap.holes) {
      if (h.slot !== this.slot) continue;
      this.self.mass = h.mass;
      this.self.radius = h.radius;
      this.self.heading = h.heading;
      this.self.state = h.state;
      this.self.x = h.x;
      this.self.z = h.z;
      this._reconcile(h, atMs);
      break;
    }

    // Eats. The event is the ONLY way a block dies on a peer (§5.2: "Only the
    // host decides what got eaten").
    for (const e of snap.events) {
      this._events.push(e);
      if (e.objectId > 0 && !(e.flags & EVENT_FLAG.COMBO_POP)) {
        // The event's first byte IS the eater (04 §4.1); first claim wins.
        if (!this.eaterOf.has(e.objectId)) this.eaterOf.set(e.objectId, e.slot);
        if (!this.consumed.has(e.objectId)) {
          this.consumed.add(e.objectId);
          this._newlyConsumed.push(e.objectId);
        }
      }
    }

    // The keyframe's eaten streams back-fill anything a dropped snapshot lost
    // — as of v3, per eater slot, so the heal carries attribution too
    // (AC-01.4: a late joiner's craters come up in the right colors).
    if (isKeyframe && snap.eatenSlots && this.objectCount > 0) {
      for (const { slot, rle } of snap.eatenSlots) {
        let eaten;
        try { eaten = decodeEatenRLE(rle, this.objectCount); } catch { continue; }
        for (let id = 1; id < this.objectCount; id++) {
          if (!eaten[id]) continue;
          if (slot !== EATER_ANON && !this.eaterOf.has(id)) this.eaterOf.set(id, slot);
          if (!this.consumed.has(id)) {
            this.consumed.add(id);
            this._newlyConsumed.push(id);
          }
        }
      }
    }
  }

  /**
   * §5.2's bands, verbatim. The authoritative position for our slot is
   * compared against where the prediction had us ONE RTT AGO: the host state
   * at tick T reflects intents we emitted one one-way earlier, and the
   * snapshot took another one-way to reach us, so `arrival − RTT` is the
   * point on our own predicted timeline this snapshot is a claim about.
   */
  _reconcile(auth, atMs) {
    const lookback = Number.isFinite(this.rttMs) ? this.rttMs : 0;
    const ref = this._historyAt(atMs - lookback);
    const ex = ref.x - auth.x, ez = ref.z - auth.z;
    const err = Math.sqrt(ex * ex + ez * ez);
    const band = correctionFor(err);
    this.lastCorrection = band;
    this.lastErrorM = err;
    this.stats.corrections[band]++;
    if (band === CORRECTION.IGNORE) return;
    // The error is a property of the whole predicted trajectory, so it is
    // subtracted from the CURRENT prediction (input applied since the
    // reference point is preserved rather than thrown away) — AND from the
    // recorded history, which is the same trajectory. Without the history
    // shift, the next snapshot's look-back lands on a pre-correction sample,
    // measures the same error again, and subtracts it again: at a 240 ms RTT
    // that is ~3 double-corrections per real one, which oscillates straight
    // into the snap band. Observed exactly that (151 snaps in 60 s) before
    // this line existed.
    this.pred.x -= ex;
    this.pred.z -= ez;
    this._clamp(this.pred);
    for (const p of this._history) { p.x -= ex; p.z -= ez; }
    if (band === CORRECTION.SNAP) {
      // "> 3 m — snap, and flash the rim. Something real happened." The rim
      // flash belongs to the renderer; `lastCorrection` is its signal.
      this.renderPos.x = this.pred.x;
      this.renderPos.z = this.pred.z;
    }
    // SMOOTH: renderPos is left where it was and update()'s blendToward walks
    // it in over CORRECTION_BLEND_MS — drift, not a jump.
  }

  _historyAt(ms) {
    const h = this._history;
    if (!h.length) return this.pred;
    // Newest entry at or before `ms`; the oldest entry if none is.
    let best = h[0];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].atMs <= ms) { best = h[i]; break; }
    }
    return best;
  }

  _clamp(p) {
    const r = this.boundsRect;
    if (!r) return;
    p.x = Math.min(r.maxX, Math.max(r.minX, p.x));
    p.z = Math.min(r.maxZ, Math.max(r.minZ, p.z));
  }

  // --- the frame -------------------------------------------------------------

  /**
   * One presentation frame. `dtMs` is REAL elapsed milliseconds — prediction
   * runs on the render clock, not the sim clock, because it is presentation
   * (03 §1.3's "never fed back into step()" row).
   */
  update(nowMs = null, dtMs = 16.7) {
    const now = nowMs != null ? nowMs : this._now();
    const move = this._read() || { x: 0, z: 0 };
    this._lastMove = move;

    // Intent out at INTENT_HZ, wall-clock (04 §6.1), including zeros — a
    // released stick must reach the host or the hole ploughs on for 500 ms
    // and then gets zeroed as "stale", which reads as lag we caused ourselves.
    if (now - this._lastIntentMs >= INTENT_INTERVAL_MS) {
      this.transport.send(encodeEnvelope('I', {
        slot: this.slot, seq: (this._seq++) & 0xffff, x: move.x, z: move.z,
      }));
      // Advance the cadence by the interval, not to `now`: at a 60 Hz frame
      // clock, "reset to now" quantises every interval UP to the next frame
      // boundary and the realised rate sags to ~9.1 Hz. Stepping the deadline
      // keeps the average at exactly INTENT_HZ (04 §4's shipped rate); the
      // catch-up guard stops a long stall from bursting a backlog.
      this._lastIntentMs = (now - this._lastIntentMs > INTENT_INTERVAL_MS * 2)
        ? now : this._lastIntentMs + INTENT_INTERVAL_MS;
      this.stats.intentsSent++;
    }

    // PING out at 1 Hz.
    if (now - this._lastPingMs >= PING_INTERVAL_MS) {
      this._pingId = (this._pingId + 1) & 0xffff;
      this.transport.send(encodeEnvelope(CONTROL.PING, { id: this._pingId, tClient: now }));
      this._lastPingMs = now;
    }

    // Predict our own movement: the same normalise → speed(radius) → clamp
    // the sim applies, with the AUTHORITATIVE radius (radius is never
    // predicted, so the speed can only be as stale as one snapshot).
    const dt = Math.max(0, dtMs) / 1000;
    if (dt > 0 && (move.x || move.z)) {
      const len = Math.hypot(move.x, move.z) || 1;
      const speed = this._speedFor(this.self.radius);
      const dx = (move.x / len) * speed * dt;
      const dz = (move.z / len) * speed * dt;
      this.pred.x += dx; this.pred.z += dz;
      this._clamp(this.pred);
      this.renderPos.x += dx; this.renderPos.z += dz;
    }
    // The visual position eases toward the logical one (blendToward's
    // CORRECTION_BLEND_MS time constant) — this is what makes a smooth-band
    // correction perceptible as drift instead of as a stutter.
    const eased = blendToward(this.renderPos, this.pred, dtMs);
    this.renderPos.x = eased.x;
    this.renderPos.z = eased.z;
    this._clamp(this.renderPos);

    // Record the prediction for future reconciliation lookups.
    this._history.push({ atMs: now, x: this.pred.x, z: this.pred.z });
    while (this._history.length && this._history[0].atMs < now - HISTORY_MS) this._history.shift();
  }

  // --- what the renderer reads ----------------------------------------------

  /** The own hole as drawn: predicted position, authoritative everything else. */
  ownHole() {
    return {
      slot: this.slot,
      x: this.renderPos.x, z: this.renderPos.z,
      radius: this.self.radius, mass: this.self.mass, heading: this.self.heading,
    };
  }

  /**
   * Remote holes at render time (`now − INTERP_DELAY_MS`), interpolated per
   * §5.1, own slot removed. Entries carry `extrapolated` / `frozen` so the
   * renderer can dim a ghost whose feed went quiet.
   */
  ghosts(nowMs = null) {
    const out = interpolate(this.buffer, nowMs != null ? nowMs : this._now());
    out.delete(this.slot);
    return out;
  }

  /** ms since the last snapshot arrived — drives the RECONNECTING band (04 §6). */
  snapshotAgeMs(nowMs = null) {
    return this.buffer.silenceMs(nowMs != null ? nowMs : this._now());
  }

  /** Wire events (eats, combo pops) accumulated since the last drain. */
  drainEvents() {
    const e = this._events; this._events = []; return e;
  }

  /** Object ids newly known-consumed since the last drain (events + keyframes). */
  drainConsumed() {
    const c = this._newlyConsumed; this._newlyConsumed = []; return c;
  }

  dispose() { if (this._unsub) this._unsub(); }
}
