// Room lifecycle: codes, seeds, seats. The T-603 minimal cut.
//
// Implements the client half of 04-netcode-design.md §2 for the standalone
// arena page: a room is a broadcast topic named by a human-friendly code, the
// host seats joiners over the JSON control protocol (JOIN / WELCOME / REJECT /
// ROSTER in ./protocol.js), and the city seed is derived deterministically
// from the code so every client builds the identical city (ADR-0003).
//
// WHAT IS DELIBERATELY NOT HERE YET, with the seam each will use:
//   - Server-minted rooms and seeds (T-602's arena-open Edge Function). Today
//     the HOST mints the code and the seed is `deriveSeed(code)` — fine for a
//     friendly two-phone match, and exactly the scouting exposure 13-tasks
//     T-602 notes; when arena-open lands, `createRoom` swaps its mint for the
//     function's response and nothing downstream changes shape.
//   - Host migration / succession (T-606). A vanished host today freezes the
//     match ("HOST LEFT"); `ArenaRoomPeer.onHostLeft` is the hook a successor
//     claim will replace.
//   - Quick join, spectators, late-join cutoffs.
//
// Invariant 7 discipline: this file never touches a sim. Seating a player in
// the ROOM is here; adding their hole to the WORLD is the page's job, via the
// `onSeat` callback (glue owns the sim, per 03 §1.1).
//
// No three.js, no `Math.random` (crypto.getRandomValues only), no DOM.

import { CONTROL, encodeEnvelope, decodeEnvelope, validate, ARENA_SCENES, isArenaScene } from './protocol.js';
import { MAX_PLAYERS } from './snapshot.js';

// --- scenes ------------------------------------------------------------------

/**
 * Player-facing names for the allowlisted scenes, in picker order — the same
 * names the campaign UI uses (main.js AUTHORED_SCENES; the generic 'gallery'
 * scene is 'SANDBOX' everywhere in that UI, so it is 'SANDBOX' here too).
 * The allowlist itself lives in ./protocol.js because the wire guard needs it;
 * this map only says what a human calls each entry.
 */
export const SCENE_LABELS = Object.freeze({
  'gallery': 'SANDBOX',
  'manhattan': 'NYC: LOWER MANHATTAN',
  'upper-manhattan': 'NYC: UPPER MANHATTAN · CENTRAL PARK',
  'brooklyn': 'NYC: BROOKLYN · CONEY ISLAND',
  'boston': 'BOSTON: SEAPORT',
  'cambridge': 'CAMBRIDGE: KENDALL SQUARE',
});

/** The label a scene id shows on screen. Total over the allowlist. */
export function sceneLabel(scene) { return SCENE_LABELS[scene] || 'SANDBOX'; }

export { ARENA_SCENES, isArenaScene };

// --- room codes --------------------------------------------------------------

/**
 * 27 symbols: consonants + digits, minus everything a booth misreads.
 * Dropped: vowels A E I O U (no accidental words on a shared screen), plus the
 * confusable set O/0, I/1/L. 27^5 = 14.3 M codes — collision at a booth's
 * handful of live rooms is a retry, not a design problem (04 §2.1).
 */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** Mint a code with crypto randomness, rejection-sampled so it is unbiased. */
export function mintRoomCode(length = ROOM_CODE_LENGTH) {
  const n = ROOM_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);   // rejection threshold for uniformity
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < length) out += ROOM_CODE_ALPHABET[b % n];
    }
  }
  return out;
}

/**
 * Forgiving parse of whatever a human typed or pasted (global rule 3: the
 * player types only the unique part). Accepts lowercase, stray spaces and
 * dashes, and a pasted invite URL (`...arena.html?room=K7QM3`).
 * Returns the canonical uppercase code, or '' if nothing usable is in there.
 */
export function normalizeRoomCode(input) {
  if (typeof input !== 'string') return '';
  let s = input.trim();
  // A pasted URL: pull the room param out of it.
  const m = s.match(/[?&#]room=([^&#\s]+)/i);
  if (m) s = m[1];
  s = s.toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-Z0-9]+$/.test(s) ? s : '';
}

/** True when a normalized code could have come out of `mintRoomCode`. */
export function isValidRoomCode(code) {
  if (typeof code !== 'string' || code.length < 4 || code.length > 6) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** The Realtime topic a code names. One room, one topic. */
export function roomTopic(code) { return `arena:${code}`; }

/**
 * The deterministic city seed for a room. Every client derives it locally, and
 * the WELCOME carries it too so the wire stays the authority — when server-side
 * minting lands (T-602), the wire value simply stops matching this derivation
 * and everything keeps working.
 */
export function deriveSeed(code) { return `arena:${code}`; }

/** A short random session id for the JOIN handshake. Not a uuid on purpose — it only has to be unique within one room's lifetime. */
export function mintSessionId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// --- the host's side of the room --------------------------------------------

/**
 * Seats players. Owns the roster and the control-message handshake; owns no
 * sim and no game loop (those are ArenaHost's, in ./host.js).
 *
 * Callbacks (assign after construction):
 *   onSeat(slot, {sessionId, name})  a NEW player was seated — the page adds
 *                                    their hole to the sim and a slot to the
 *                                    ArenaHost, BEFORE this returns, so the
 *                                    keyframe the join triggers includes them
 *   onLeave(slot)                    a seated player announced leave
 */
export class ArenaRoomHost {
  /**
   * @param {object} opts { transport, code, maxPlayers, generation, sessionId, scene }
   */
  constructor({ transport, code, maxPlayers = MAX_PLAYERS, generation = 1, sessionId = null, scene = 'gallery' }) {
    if (!isArenaScene(scene)) throw new RangeError(`unknown arena scene '${scene}'`);
    this.transport = transport;
    this.code = code;
    this.seed = deriveSeed(code);
    this.scene = scene;
    this.maxPlayers = maxPlayers;
    this.generation = generation & 0xff;
    this.sessionId = sessionId || mintSessionId();
    this.roster = new Map();   // slot -> { sessionId, name }
    this.roster.set(0, { sessionId: this.sessionId, name: 'HOST' });
    this.onSeat = null;
    this.onLeave = null;
    this._unsub = transport.on((env) => this._onMessage(env));
  }

  get playerCount() { return this.roster.size; }
  get isFull() { return this.roster.size >= this.maxPlayers; }

  _slotOf(sessionId) {
    for (const [slot, m] of this.roster) if (m.sessionId === sessionId) return slot;
    return -1;
  }

  _freeSlot() {
    for (let s = 0; s < this.maxPlayers; s++) if (!this.roster.has(s)) return s;
    return -1;
  }

  _onMessage(env) {
    // Binary traffic (snapshots, intents) is host.js/peer.js's concern; skip it
    // here before validate() pays for a full decode 12 times a second.
    if (env && (env.t === 'S' || env.t === 'K' || env.t === 'I')) return;
    if (!validate(env).ok) return;
    let msg;
    try { msg = decodeEnvelope(env); } catch { return; }

    if (msg.t === CONTROL.JOIN) {
      const sessionId = msg.sessionId;
      if (sessionId === this.sessionId) return;   // our own (echoing transport)

      // Idempotent rejoin: the same session asking again gets the same seat.
      // A reloaded phone re-JOINs with a fresh session id and takes a new slot;
      // reclaiming the old one is T-606 territory (RECONNECT_GRACE_MS).
      let slot = this._slotOf(sessionId);
      if (slot < 0) {
        slot = this._freeSlot();
        if (slot < 0) {
          this.transport.send(encodeEnvelope(CONTROL.REJECT, { sessionId, reason: 'room_full' }));
          return;
        }
        this.roster.set(slot, { sessionId, name: msg.name || `P${slot + 1}` });
        // Seat BEFORE welcome: the page adds the hole + host slot here, so the
        // immediate keyframe ArenaHost sends for this same JOIN already
        // carries the newcomer (04 §8's "first frame is correct").
        if (this.onSeat) this.onSeat(slot, this.roster.get(slot));
      }
      this.transport.send(encodeEnvelope(CONTROL.WELCOME, {
        sessionId, slot, seed: this.seed, generation: this.generation, scene: this.scene,
      }));
      this.sendRoster();
      return;
    }

    if (msg.t === CONTROL.LEAVE) {
      const m = this.roster.get(msg.slot);
      if (!m || msg.slot === 0) return;   // nobody unseats the host over the wire
      this.roster.delete(msg.slot);
      if (this.onLeave) this.onLeave(msg.slot);
      this.sendRoster();
    }
  }

  sendRoster() {
    const members = [...this.roster.entries()].map(([slot, m]) => ({ slot, name: m.name }));
    this.transport.send(encodeEnvelope(CONTROL.ROSTER, { members, generation: this.generation }));
  }

  /** Broadcast the match start. The page starts stepping its ArenaHost after this. */
  sendMatchStart({ startTick = 0, durationTicks }) {
    this.transport.send(encodeEnvelope(CONTROL.MATCH_START, {
      seed: this.seed, startTick, durationTicks,
    }));
  }

  /** The host bowing out on purpose (page close). Peers freeze on it. */
  sendHostLeave() {
    // Not LEAVE slot 0 — that is filtered as unseatable. HOST_ANNOUNCE with a
    // bumped generation is the honest signal: "the authority you knew is gone."
    this.transport.send(encodeEnvelope(CONTROL.HOST_ANNOUNCE, {
      sessionId: '', generation: (this.generation + 1) & 0xff,
    }));
  }

  dispose() { if (this._unsub) this._unsub(); }
}

// --- the joiner's side -------------------------------------------------------

export const JOIN_TIMEOUT_MS = 6000;

/**
 * The join handshake plus the peer's view of the room.
 *
 * `join()` resolves with { slot, seed, generation } or rejects with an Error
 * whose `.code` is one of:
 *   'room_full'   an explicit REJECT arrived
 *   'no_host'     nobody answered inside the timeout — wrong code, or the
 *                 host has not opened the room yet (indistinguishable from
 *                 outside, deliberately: the fix for both is the same person
 *                 checking the same screen)
 *
 * Callbacks (assign before or after join):
 *   onRoster(members)          roster changed
 *   onMatchStart({seed, startTick, durationTicks})
 *   onHostLeft()               the host announced a new generation (today:
 *                              gone on purpose). Silence-based detection —
 *                              no snapshot for HOST_TIMEOUT_MS — is the
 *                              page's to run off ArenaPeer.snapshotAgeMs();
 *                              both funnel into this same callback.
 */
export class ArenaRoomPeer {
  constructor({ transport, code, sessionId = null, name = '' }) {
    this.transport = transport;
    this.code = code;
    this.sessionId = sessionId || mintSessionId();
    this.name = name;
    this.slot = -1;
    this.seed = null;
    this.scene = null;   // named by the host's WELCOME; already allowlist-checked by validate()
    this.generation = null;
    this.members = [];
    this.onRoster = null;
    this.onMatchStart = null;
    this.onHostLeft = null;
    this._joinWaiter = null;
    this._unsub = transport.on((env) => this._onMessage(env));
  }

  _onMessage(env) {
    // Binary traffic (snapshots, intents) is host.js/peer.js's concern; skip it
    // here before validate() pays for a full decode 12 times a second.
    if (env && (env.t === 'S' || env.t === 'K' || env.t === 'I')) return;
    if (!validate(env).ok) return;
    let msg;
    try { msg = decodeEnvelope(env); } catch { return; }

    if (msg.t === CONTROL.WELCOME && msg.sessionId === this.sessionId) {
      this.slot = msg.slot;
      this.seed = msg.seed;
      this.scene = msg.scene;
      this.generation = msg.generation;
      if (this._joinWaiter) { this._joinWaiter.resolve({ slot: msg.slot, seed: msg.seed, generation: msg.generation, scene: msg.scene }); this._joinWaiter = null; }
      return;
    }
    if (msg.t === CONTROL.REJECT && msg.sessionId === this.sessionId) {
      if (this._joinWaiter) {
        const err = new Error(`join rejected: ${msg.reason}`);
        err.code = msg.reason === 'room_full' ? 'room_full' : 'rejected';
        this._joinWaiter.reject(err);
        this._joinWaiter = null;
      }
      return;
    }
    if (msg.t === CONTROL.ROSTER) {
      this.members = msg.members;
      if (this.onRoster) this.onRoster(msg.members);
      return;
    }
    if (msg.t === CONTROL.MATCH_START) {
      if (this.onMatchStart) this.onMatchStart({ seed: msg.seed, startTick: msg.startTick, durationTicks: msg.durationTicks });
      return;
    }
    if (msg.t === CONTROL.HOST_ANNOUNCE) {
      // Generation moved past the one that welcomed us and no successor logic
      // exists yet (T-606): the authority is gone. Freeze, tell the player.
      if (this.generation != null && msg.generation !== this.generation) {
        if (this.onHostLeft) this.onHostLeft();
      }
    }
  }

  /**
   * Ask for a seat. Safe to call once, after the transport is connected.
   * @returns {Promise<{slot:number, seed:string, generation:number, scene:string}>}
   */
  join({ timeoutMs = JOIN_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._joinWaiter) {
          const err = new Error('no host answered');
          err.code = 'no_host';
          this._joinWaiter.reject(err);
          this._joinWaiter = null;
        }
      }, timeoutMs);
      const clear = (fn) => (v) => { clearTimeout(timer); fn(v); };
      this._joinWaiter = { resolve: clear(resolve), reject: clear(reject) };
      this.transport.send(encodeEnvelope(CONTROL.JOIN, { sessionId: this.sessionId, name: this.name }));
    });
  }

  /** Announce departure so the host frees the seat. */
  leave() {
    if (this.slot > 0) this.transport.send(encodeEnvelope(CONTROL.LEAVE, { slot: this.slot }));
  }

  dispose() { if (this._unsub) this._unsub(); }
}
