// The driver seam.
//
// Implements: .wiki/features/ai-players/00-objective-overview.md § "The driver
// seam — the whole point", and PRD 0004 FR-003 / FR-006 / FR-007
// (.wiki/features/ai-players/01-prd.md). ADR-0016 states the shape:
//
//   > A hole is an entity with a driver. A driver is anything that, when
//   > asked, returns a steering vector for its hole.
//
// One method, `decide(hole, world, dt) -> {x, z}`, unnormalised. Three
// sanctioned kinds: 'human', 'bot', 'peer'. `bot` is NOT here — PRD 0004 FR-006
// says "`peer` is declared in the interface and not implemented here — it is
// online-flywheel's to write", and the reverse holds for the bot: BotDriver
// arrives with PRD 0004 P1, in the ai-players package, not in js/net/.
//
// This file is pure. No three.js, no I/O, no `Math.random` (03 §1.2), and it
// never writes sim state — a driver READS a hole and RETURNS an intent; the sim
// is what applies it (invariant 7).
//
// Note on the two spellings: the ai-players PRD names the method `decide`, and
// that is canonical. `getMove(world, dt)` is provided as a thin alias for call
// sites that hold the driver but not the hole (the arena host's per-slot loop);
// it forwards to `decide` with the driver's bound hole.

/** Sanctioned driver kinds. PRD 0004 FR-006: the list is open, not an enum. */
export const DRIVER_KINDS = Object.freeze(['human', 'bot', 'peer']);

const ZERO = Object.freeze({ x: 0, z: 0 });

/**
 * Base class. Subclasses implement `decide`. Kept as a class rather than a bare
 * object literal so `instanceof` is available to the validator and so a future
 * driver (replay playback — 00 §"Driver is an interface, not an enum") has an
 * obvious place to hook.
 */
export class Driver {
  constructor(kind, { slot = 0, name = '', hole = null } = {}) {
    this.kind = kind;
    this.slot = slot;
    this.name = name;
    this.hole = hole;      // optional binding, used by getMove()
  }

  /** @returns {{x:number,z:number}} unnormalised steering intent */
  // eslint-disable-next-line no-unused-vars
  decide(hole, world, dt) { return ZERO; }

  /** Alias for call sites that carry the world but not the hole. */
  getMove(world, dt) { return this.decide(this.hole, world, dt); }

  /** Bind the hole this driver steers. Returns `this` for chaining. */
  bind(hole) { this.hole = hole; return this; }
}

/**
 * Human input. Wraps a callback that returns the current input latch — exactly
 * the latch `js/main.js` already maintains. The driver does not read the DOM;
 * the caller owns that and hands us a function.
 */
export class HumanDriver extends Driver {
  constructor(readInput, opts = {}) {
    super('human', opts);
    if (typeof readInput !== 'function') throw new TypeError('HumanDriver needs an input callback');
    this._read = readInput;
  }

  decide() {
    const m = this._read();
    if (!m) return ZERO;
    const x = Number(m.x) || 0, z = Number(m.z) || 0;
    return (x || z) ? { x, z } : ZERO;
  }
}

/**
 * A remote player's hole, driven by the last intent that arrived on the wire.
 *
 * 04-netcode-design.md §6: "Intents are last-write-wins by `seq`. A dropped
 * intent means one tick of the previous direction — 16 ms of stale steering,
 * undetectable. Nothing is ever resent." So this driver HOLDS its last value
 * rather than decaying to zero...
 *
 * ...until INTENT_STALE_MS. Same section: "The host zeroes a peer's intent
 * after 500 ms of silence. Without this a disconnected player's hole grinds
 * against a wall for the rest of the match, which looks like a bug and inflates
 * their score if the wall happens to be edible." The staleness clock is
 * wall-clock, supplied by the caller, because the host owns the one true clock
 * and this file owns no clock at all (03 §1.3: reconnect timing is
 * presentation, never fed back into step()).
 */
export class PeerDriver extends Driver {
  constructor(opts = {}) {
    super('peer', opts);
    this.lastSeq = -1;
    this.lastAtMs = -Infinity;
    this._move = { x: 0, z: 0 };
    this.staleMs = opts.staleMs != null ? opts.staleMs : 500; // INTENT_STALE_MS
  }

  /**
   * Feed a decoded intent. Out-of-order and duplicate seq are dropped, which is
   * the whole of the ordering guarantee this protocol needs.
   * @returns {boolean} true if the intent was accepted
   */
  receive(intent, nowMs) {
    if (!intent || intent.slot !== this.slot) return false;
    if (intent.seq <= this.lastSeq) return false;   // stale or duplicate
    this.lastSeq = intent.seq;
    this.lastAtMs = nowMs;
    this._move.x = intent.x;
    this._move.z = intent.z;
    return true;
  }

  /** True once the host should stop applying this peer's steering. */
  isStale(nowMs) { return (nowMs - this.lastAtMs) > this.staleMs; }

  decide(hole, world, dt, nowMs) {
    // `nowMs` is optional at the call site; when absent the host is expected to
    // have called `zeroIfStale` itself. Belt and braces, deliberately.
    if (nowMs != null && this.isStale(nowMs)) return ZERO;
    return this._move;
  }

  /** Host-side sweep: collapse a silent peer's steering to zero. */
  zeroIfStale(nowMs) {
    if (this.isStale(nowMs) && (this._move.x || this._move.z)) {
      this._move.x = 0; this._move.z = 0;
      return true;
    }
    return false;
  }
}

/**
 * A driver that never steers. The honest thing to hand a disconnected slot
 * (04 §9: "The hole freezes in place, stops eating") and the thing a spectator
 * slot holds. Also the safe default when a roster names a driver kind this
 * build does not know how to construct.
 */
export class IdleDriver extends Driver {
  constructor(opts = {}) { super(opts.kind || 'peer', opts); }
  decide() { return ZERO; }
}

/**
 * Build a roster of drivers from a matchConfig (PRD 0004 FR-007: "The roster is
 * data, not code"). Unknown kinds — 'bot' before P1 lands — become IdleDriver
 * rather than throwing, so a room whose host is on a newer build than a peer
 * degrades to a still-rendering hole instead of a crash.
 */
export function buildDrivers(matchConfig, { readInput = null } = {}) {
  const slots = (matchConfig && matchConfig.slots) || [];
  return slots.map((s, i) => {
    const opts = { slot: s.slot != null ? s.slot : i, name: s.name || '', staleMs: s.staleMs };
    if (s.kind === 'human' && readInput) return new HumanDriver(readInput, opts);
    if (s.kind === 'peer') return new PeerDriver(opts);
    return new IdleDriver({ ...opts, kind: s.kind || 'peer' });
  });
}
