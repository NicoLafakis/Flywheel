// The wire protocol: message types, binary codecs, and the guard that runs on
// everything arriving from the network.
//
// Implements: .wiki/features/online-flywheel/04-netcode-design.md §4.1 "Wire
// format" (the Snapshot `S`, Intent `I` and Keyframe `K` layouts, byte for
// byte) and §4's "Control messages ... are plain JSON". Constants for the
// RATES live in ./snapshot.js per 04 §13 ("All in js/net/snapshot.js"), so this
// file holds only what a byte layout needs and there is no import cycle.
//
// Pure. No I/O, no three.js, no `Math.random` (03-technical-design.md §1.2).
// Nothing here writes sim state (invariant 7) — it moves bytes.
//
// Endianness is LITTLE, everywhere, stated once here because the doc's table
// does not say and a decoder on the other end of a booth wifi link is not the
// place to discover a disagreement.
//
// NEVER TRUST THE WIRE. `validate()` is not a formality: every field is range
// checked before it reaches a decoder, and every decoder re-checks its own
// lengths. A hostile peer is one `channel.send` away at all times, and the only
// thing between it and the host's sim is this file.

// v2: WELCOME carries a required, allowlisted `scene` so the joiner builds the
// host's chosen city. Versioning is a hard gate — `validate()` drops any
// envelope whose `v` differs — so a v1 client meeting a v2 room fails cleanly
// (the joiner's JOIN is dropped and it times out with 'no_host') instead of
// building the wrong city and desyncing.
//
// v3: the keyframe tail carries EATER IDENTITY — one eaten-RLE stream per
// occupied slot instead of one anonymous bitset — so a client healing from a
// keyframe (late join, missed snapshots) learns not just THAT a block is gone
// but WHOSE it was. This closes the one wire gap the rival-visibility package
// found (.wiki/features/rival-visibility/00-objective-overview.md): live
// events always carried the eater's slot; the keyframe forgot it. Same hard
// version gate: a v2 client meeting a v3 room fails cleanly.
export const PROTOCOL_VERSION = 3;

/**
 * Pseudo-slot for "eaten, eater unknown" in a keyframe's per-slot streams —
 * a block consumed before the recording host existed (a migration rebuild).
 * 0xff can never collide with a real slot: MAX_HOLES is 255, slots are 0-254.
 */
export const EATER_ANON = 0xff;

/**
 * The scenes a WELCOME may name — the finished, playable cities. NEVER trust
 * the wire: a scene string off the network is only ever compared against this
 * set, never handed to a sim constructor raw.
 */
export const ARENA_SCENES = Object.freeze([
  'gallery',
  'manhattan',
  'upper-manhattan',
  'brooklyn',
  'boston',
  'cambridge',
  'chicago',
]);
const ARENA_SCENE_SET = new Set(ARENA_SCENES);

/** True when a wire-supplied scene string names a shipped arena city. */
export function isArenaScene(s) { return typeof s === 'string' && ARENA_SCENE_SET.has(s); }

/** Binary message type bytes (04 §4.1). */
export const MSG = Object.freeze({
  SNAPSHOT: 0x01,   // host -> all; a keyframe is this with FLAG.KEYFRAME set
  INTENT: 0x02,     // peer -> host
});

/** Snapshot header flag bits (04 §4.1: "u16 flags  bit0 keyframe, bit1 match_over, bit2 tide_fired"). */
export const FLAG = Object.freeze({
  KEYFRAME: 1 << 0,
  MATCH_OVER: 1 << 1,
  TIDE_FIRED: 1 << 2,
  // AMBIGUITY, resolved here (see the final report): the doc gives event
  // `object_id` as u16 — "index into the city's object array" — which is
  // correct for a campaign city (~1,400 objects) and too narrow for a voxel
  // scene, where `VoxelSandboxSim` hands out block ids into the 80,000s. Rather
  // than silently truncating an id, the encoder widens to u32 and sets this bit;
  // the decoder reads it. A campaign snapshot is unchanged, byte for byte.
  WIDE_IDS: 1 << 3,
});

/** Per-hole state bits (04 §4.1). */
export const HOLE_STATE = Object.freeze({
  ALIVE: 1 << 0,
  DISCONNECTED: 1 << 1,
  SWALLOWING: 1 << 2,
});

/** Per-event flag bits (04 §4.1). */
export const EVENT_FLAG = Object.freeze({
  GOLDEN: 1 << 0,
  LANDMARK: 1 << 1,
  COMBO_POP: 1 << 2,
});

/** Control message types. Plain JSON — "they are rare ... and read by humans during debugging" (04 §4.1). */
export const CONTROL = Object.freeze({
  JOIN: 'join',
  WELCOME: 'welcome',
  LEAVE: 'leave',
  ROSTER: 'roster',
  MATCH_START: 'match_start',
  MATCH_END: 'match_end',
  HOST_CLAIM: 'host_claim',
  HOST_ANNOUNCE: 'host_announce',
  PING: 'ping',
  PONG: 'pong',
  // A refused JOIN (room full, match locked). 04 §2.2's "Room full is a dead
  // end; watching, you're next" is the eventual UX; the wire still needs the
  // explicit no so a joiner is not left distinguishing "full" from "nobody
  // there" by timeout alone.
  REJECT: 'reject',
});

const CONTROL_SET = new Set(Object.values(CONTROL));

// --- quantisation ------------------------------------------------------------
// Every scale factor from 04 §4.1's table, in one place, so the encoder and the
// decoder cannot drift and so `quantizeSnapshot` can produce the exact value a
// round trip will yield.

export const Q = Object.freeze({
  POS_CM: 100,        // i16 x_cm, z_cm — cm, +-327 m
  MASS: 4,            // u16 mass_q = mass * 4
  RADIUS: 20,         // u8  radius_q = radius * 20, 0..12.75 m
  HEADING: 256 / (Math.PI * 2), // u8 heading_q
});

export const LIMITS = Object.freeze({
  MAX_HOLES: 255,        // u8 hole_count
  MAX_EVENTS: 255,       // u8 event_count
  MAX_POS_M: 327.67,     // i16 cm
  MAX_MASS: 16383.75,    // u16 / 4
  MAX_RADIUS_M: 12.75,   // u8 / 20
  MAX_TICK: 0xffff,      // low 16 bits, wraps every ~18 min at 60 Hz
  MAX_TIME_LEFT_CS: 0xffff,
  MAX_SEQ: 0xffff,
  MAX_OBJECT_ID_16: 0xffff,
  MAX_OBJECT_ID_32: 0xffffffff,
});

const SNAPSHOT_HEADER_BYTES = 12;
const HOLE_BYTES = 10;
const EVENT_BYTES_NARROW = 4;
const EVENT_BYTES_WIDE = 6;
export const INTENT_BYTES = 6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Wrap a heading into [0, 2pi) before quantising. */
function wrapAngle(a) {
  const TAU = Math.PI * 2;
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
}

// --- base64 ------------------------------------------------------------------
// Hand-rolled rather than btoa/Buffer: this file is imported by the browser, by
// Node (tools/), and by Deno (the replay Edge Function), and those three do not
// agree on which globals exist. 44 lines beats three code paths and an ADR-0014
// conversation about a polyfill.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['='.charCodeAt(0)] = -2;
  return t;
})();

export function toBase64(bytes) {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export function fromBase64(str) {
  if (typeof str !== 'string') throw new TypeError('fromBase64 needs a string');
  let len = str.length;
  if (len % 4 !== 0) throw new RangeError('base64 length is not a multiple of 4');
  let pad = 0;
  if (len && str[len - 1] === '=') pad++;
  if (len > 1 && str[len - 2] === '=') pad++;
  const out = new Uint8Array((len / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_INV[str.charCodeAt(i)], c1 = B64_INV[str.charCodeAt(i + 1)];
    const c2 = B64_INV[str.charCodeAt(i + 2)], c3 = B64_INV[str.charCodeAt(i + 3)];
    if (c0 < 0 || c1 < 0) throw new RangeError('bad base64');
    if (c2 === -1 || c3 === -1) throw new RangeError('bad base64');
    out[o++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

// --- snapshot ----------------------------------------------------------------

/**
 * Quantise a snapshot to exactly the values a round trip through
 * `encodeSnapshot`/`decodeSnapshot` will yield. Encoding is lossy by design
 * (that is what a 10-byte hole buys), so "round trip identity" is a property of
 * the QUANTISED form, and this function is what makes that property testable
 * rather than approximate.
 */
export function quantizeSnapshot(snap) {
  const wide = wantsWideIds(snap);
  const maxId = wide ? LIMITS.MAX_OBJECT_ID_32 : LIMITS.MAX_OBJECT_ID_16;
  return {
    v: PROTOCOL_VERSION,
    type: MSG.SNAPSHOT,
    generation: snap.generation & 0xff,
    tick: snap.tick & 0xffff,
    flags: (snap.flags | (wide ? FLAG.WIDE_IDS : 0)) & 0xffff,
    timeLeftCs: clamp(Math.round(snap.timeLeftCs || 0), 0, LIMITS.MAX_TIME_LEFT_CS),
    holes: (snap.holes || []).map((h) => ({
      slot: h.slot & 0xff,
      state: h.state & 0xff,
      x: clamp(Math.round(h.x * Q.POS_CM), -32768, 32767) / Q.POS_CM,
      z: clamp(Math.round(h.z * Q.POS_CM), -32768, 32767) / Q.POS_CM,
      mass: clamp(Math.round(h.mass * Q.MASS), 0, 0xffff) / Q.MASS,
      radius: clamp(Math.round(h.radius * Q.RADIUS), 0, 0xff) / Q.RADIUS,
      heading: Math.round(wrapAngle(h.heading || 0) * Q.HEADING) % 256 / Q.HEADING,
    })),
    events: (snap.events || []).map((e) => ({
      slot: e.slot & 0xff,
      flags: e.flags & 0xff,
      objectId: clamp(Math.round(e.objectId), 0, maxId),
    })),
  };
}

function wantsWideIds(snap) {
  if (snap.wideIds != null) return !!snap.wideIds;
  if (snap.flags & FLAG.WIDE_IDS) return true;
  for (const e of snap.events || []) if (e.objectId > LIMITS.MAX_OBJECT_ID_16) return true;
  return false;
}

/**
 * Build the keyframe tail's stream list from either input shape:
 *   snap.eatenSlots  [{slot, rle:Uint8Array}] — the v3 per-slot form;
 *   snap.eatenRLE    Uint8Array — legacy anonymous bitset, carried as one
 *                    EATER_ANON stream so pre-v3 call sites keep working.
 */
function eatenStreamsOf(snap) {
  if (snap.eatenSlots && snap.eatenSlots.length) return snap.eatenSlots;
  if (snap.eatenRLE && snap.eatenRLE.length) return [{ slot: EATER_ANON, rle: snap.eatenRLE }];
  return null;
}

/** v3 tail layout: u8 stream_count, then per stream u8 slot / u16 len / bytes. */
function eatenTailBytes(streams) {
  if (!streams) return 0;
  let n = 1;
  for (const s of streams) n += 3 + s.rle.length;
  return n;
}

/**
 * Snapshot -> bytes. 04 §4.1:
 *   header 12 bytes, per hole 10 bytes x N, per event 4 bytes x E.
 * A keyframe is this with FLAG.KEYFRAME set plus the eaten tail appended: as
 * of v3, `u8 stream_count`, then per stream `u8 slot / u16 byte_len / bytes`,
 * each stream an RLE bitset over the same object-id space (a block eaten by
 * slot s sets only s's stream; the old anonymous union is the OR of them all).
 * The RLE itself is built in ./snapshot.js, which knows about cities; this
 * file only frames it.
 */
export function encodeSnapshot(snap) {
  const holes = snap.holes || [];
  const events = snap.events || [];
  if (holes.length > LIMITS.MAX_HOLES) throw new RangeError('too many holes');
  if (events.length > LIMITS.MAX_EVENTS) throw new RangeError('too many events');

  const wide = wantsWideIds(snap);
  const evBytes = wide ? EVENT_BYTES_WIDE : EVENT_BYTES_NARROW;
  const streams = eatenStreamsOf(snap);
  if (streams && streams.length > 255) throw new RangeError('too many eaten streams');
  const tail = eatenTailBytes(streams);
  if (tail > 0xffff) throw new RangeError('eaten tail exceeds u16');
  const size = SNAPSHOT_HEADER_BYTES + holes.length * HOLE_BYTES + events.length * evBytes + tail;

  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;

  dv.setUint8(o, MSG.SNAPSHOT); o += 1;
  dv.setUint8(o, snap.generation & 0xff); o += 1;
  dv.setUint16(o, snap.tick & 0xffff, true); o += 2;
  dv.setUint16(o, (snap.flags | (wide ? FLAG.WIDE_IDS : 0)) & 0xffff, true); o += 2;
  dv.setUint16(o, clamp(Math.round(snap.timeLeftCs || 0), 0, 0xffff), true); o += 2;
  dv.setUint8(o, holes.length); o += 1;
  dv.setUint8(o, events.length); o += 1;
  dv.setUint16(o, tail, true); o += 2;   // "u16 reserved" — spent on the keyframe tail length

  for (const h of holes) {
    dv.setUint8(o, h.slot & 0xff); o += 1;
    dv.setUint8(o, h.state & 0xff); o += 1;
    dv.setInt16(o, clamp(Math.round(h.x * Q.POS_CM), -32768, 32767), true); o += 2;
    dv.setInt16(o, clamp(Math.round(h.z * Q.POS_CM), -32768, 32767), true); o += 2;
    dv.setUint16(o, clamp(Math.round(h.mass * Q.MASS), 0, 0xffff), true); o += 2;
    dv.setUint8(o, clamp(Math.round(h.radius * Q.RADIUS), 0, 0xff)); o += 1;
    dv.setUint8(o, Math.round(wrapAngle(h.heading || 0) * Q.HEADING) % 256); o += 1;
  }

  for (const e of events) {
    dv.setUint8(o, e.slot & 0xff); o += 1;
    dv.setUint8(o, e.flags & 0xff); o += 1;
    if (wide) { dv.setUint32(o, e.objectId >>> 0, true); o += 4; }
    else { dv.setUint16(o, clamp(Math.round(e.objectId), 0, 0xffff), true); o += 2; }
  }

  if (tail) {
    dv.setUint8(o, streams.length); o += 1;
    for (const s of streams) {
      if (s.rle.length > 0xffff) throw new RangeError('eaten stream exceeds u16');
      dv.setUint8(o, s.slot & 0xff); o += 1;
      dv.setUint16(o, s.rle.length, true); o += 2;
      u8.set(s.rle, o); o += s.rle.length;
    }
  }
  return u8;
}

/** bytes -> snapshot. Throws on anything it cannot fully account for. */
export function decodeSnapshot(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('decodeSnapshot needs a Uint8Array');
  if (bytes.length < SNAPSHOT_HEADER_BYTES) throw new RangeError('snapshot shorter than its header');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  const type = dv.getUint8(o); o += 1;
  if (type !== MSG.SNAPSHOT) throw new RangeError(`not a snapshot (type 0x${type.toString(16)})`);
  const generation = dv.getUint8(o); o += 1;
  const tick = dv.getUint16(o, true); o += 2;
  const flags = dv.getUint16(o, true); o += 2;
  const timeLeftCs = dv.getUint16(o, true); o += 2;
  const holeCount = dv.getUint8(o); o += 1;
  const eventCount = dv.getUint8(o); o += 1;
  const tail = dv.getUint16(o, true); o += 2;

  const wide = !!(flags & FLAG.WIDE_IDS);
  const evBytes = wide ? EVENT_BYTES_WIDE : EVENT_BYTES_NARROW;
  const need = SNAPSHOT_HEADER_BYTES + holeCount * HOLE_BYTES + eventCount * evBytes + tail;
  // Length is checked EXACTLY, not as a minimum: a payload with trailing bytes
  // is a payload we do not understand, and understanding it partially is how a
  // decoder becomes an attack surface.
  if (bytes.length !== need) throw new RangeError(`snapshot length ${bytes.length}, header implies ${need}`);

  const holes = new Array(holeCount);
  for (let i = 0; i < holeCount; i++) {
    holes[i] = {
      slot: dv.getUint8(o),
      state: dv.getUint8(o + 1),
      x: dv.getInt16(o + 2, true) / Q.POS_CM,
      z: dv.getInt16(o + 4, true) / Q.POS_CM,
      mass: dv.getUint16(o + 6, true) / Q.MASS,
      radius: dv.getUint8(o + 8) / Q.RADIUS,
      heading: dv.getUint8(o + 9) / Q.HEADING,
    };
    o += HOLE_BYTES;
  }

  const events = new Array(eventCount);
  for (let i = 0; i < eventCount; i++) {
    events[i] = {
      slot: dv.getUint8(o),
      flags: dv.getUint8(o + 1),
      objectId: wide ? dv.getUint32(o + 2, true) : dv.getUint16(o + 2, true),
    };
    o += evBytes;
  }

  const snap = {
    v: PROTOCOL_VERSION, type: MSG.SNAPSHOT,
    generation, tick, flags, timeLeftCs, holes, events,
  };
  if (tail) {
    // v3 tail: u8 stream_count, then per stream u8 slot / u16 len / bytes.
    // Parsed EXACTLY — a tail with leftover or missing bytes, or a duplicate
    // slot stream, is a payload we do not understand.
    const end = o + tail;
    const count = dv.getUint8(o); o += 1;
    const eatenSlots = [];
    const seenSlots = new Set();
    for (let i = 0; i < count; i++) {
      if (o + 3 > end) throw new RangeError('truncated eaten stream header');
      const slot = dv.getUint8(o);
      const len = dv.getUint16(o + 1, true);
      o += 3;
      if (o + len > end) throw new RangeError('truncated eaten stream');
      if (seenSlots.has(slot)) throw new RangeError(`duplicate eaten stream for slot ${slot}`);
      seenSlots.add(slot);
      eatenSlots.push({ slot, rle: bytes.slice(o, o + len) });
      o += len;
    }
    if (o !== end) throw new RangeError('eaten tail has trailing bytes');
    snap.eatenSlots = eatenSlots;
    // Convenience for anonymous-union consumers: a lone EATER_ANON stream is
    // exactly the pre-v3 bitset, surfaced under its old name.
    if (eatenSlots.length === 1 && eatenSlots[0].slot === EATER_ANON) {
      snap.eatenRLE = eatenSlots[0].rle;
    }
  }
  return snap;
}

// --- intent ------------------------------------------------------------------

/**
 * Intent -> 6 bytes (04 §4.1):
 *   u8 type = 0x02, u8 slot, u16 seq, i8 mx, i8 mz  (steering / 127)
 * The steering is normalised to the unit disc before quantising, because that
 * is "exactly what sim.step already takes" and `voxelsim.step` divides by
 * `Math.hypot(move.x, move.z)` anyway — normalising here means the byte on the
 * wire and the vector the sim applies are the same vector.
 */
export function encodeIntent(intent) {
  const buf = new ArrayBuffer(INTENT_BYTES);
  const dv = new DataView(buf);
  let x = Number(intent.x) || 0, z = Number(intent.z) || 0;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  dv.setUint8(0, MSG.INTENT);
  dv.setUint8(1, intent.slot & 0xff);
  dv.setUint16(2, intent.seq & 0xffff, true);
  dv.setInt8(4, clamp(Math.round(x * 127), -127, 127));
  dv.setInt8(5, clamp(Math.round(z * 127), -127, 127));
  return new Uint8Array(buf);
}

export function decodeIntent(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('decodeIntent needs a Uint8Array');
  if (bytes.length !== INTENT_BYTES) throw new RangeError(`intent length ${bytes.length}, expected ${INTENT_BYTES}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = dv.getUint8(0);
  if (type !== MSG.INTENT) throw new RangeError(`not an intent (type 0x${type.toString(16)})`);
  return {
    v: PROTOCOL_VERSION, type: MSG.INTENT,
    slot: dv.getUint8(1),
    seq: dv.getUint16(2, true),
    x: dv.getInt8(4) / 127,
    z: dv.getInt8(5) / 127,
  };
}

/** The quantised form of an intent, for the same reason as `quantizeSnapshot`. */
export function quantizeIntent(intent) {
  let x = Number(intent.x) || 0, z = Number(intent.z) || 0;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return {
    v: PROTOCOL_VERSION, type: MSG.INTENT,
    slot: intent.slot & 0xff,
    seq: intent.seq & 0xffff,
    x: clamp(Math.round(x * 127), -127, 127) / 127,
    z: clamp(Math.round(z * 127), -127, 127) / 127,
  };
}

// --- envelopes ---------------------------------------------------------------
// What actually rides in a Supabase Realtime `payload`. Binary messages are
// base64'd into it (04 §4.1: "Snapshots are binary, base64'd into the JSON
// envelope"); control messages ride as plain fields.

/** @returns {{v:number,t:string,b?:string,d?:object}} JSON-safe */
export function encodeEnvelope(kind, data) {
  if (kind === 'S' || kind === 'K') return { v: PROTOCOL_VERSION, t: kind, b: toBase64(encodeSnapshot(data)) };
  if (kind === 'I') return { v: PROTOCOL_VERSION, t: kind, b: toBase64(encodeIntent(data)) };
  if (!CONTROL_SET.has(kind)) throw new RangeError(`unknown envelope kind ${kind}`);
  return { v: PROTOCOL_VERSION, t: kind, d: data };
}

/**
 * Envelope -> message, after `validate`. Throws rather than returning a partial
 * object; callers wrap this in a try and drop the packet, which is always the
 * right response to a packet we do not understand.
 */
export function decodeEnvelope(env) {
  const verdict = validate(env);
  if (!verdict.ok) throw new RangeError(verdict.reason);
  if (env.t === 'S' || env.t === 'K') return decodeSnapshot(fromBase64(env.b));
  if (env.t === 'I') return decodeIntent(fromBase64(env.b));
  return { v: env.v, t: env.t, ...env.d };
}

// --- the guard ---------------------------------------------------------------

const CONTROL_REQUIRED = {
  [CONTROL.JOIN]: ['sessionId'],
  [CONTROL.WELCOME]: ['sessionId', 'slot', 'seed', 'generation', 'scene'],
  [CONTROL.LEAVE]: ['slot'],
  [CONTROL.ROSTER]: ['members', 'generation'],
  [CONTROL.MATCH_START]: ['seed', 'startTick', 'durationTicks'],
  [CONTROL.MATCH_END]: ['endTick'],
  [CONTROL.HOST_CLAIM]: ['sessionId', 'generation'],
  [CONTROL.HOST_ANNOUNCE]: ['sessionId', 'generation'],
  [CONTROL.PING]: ['id', 'tClient'],
  [CONTROL.PONG]: ['id', 'tClient', 'tHost'],
  [CONTROL.REJECT]: ['sessionId', 'reason'],
};

const fail = (reason) => ({ ok: false, reason });
const PASS = Object.freeze({ ok: true, reason: '' });

/**
 * Structural + range validation of anything off the wire, before it reaches a
 * decoder. 09-threat-model.md's premise in one function: a peer's message is an
 * assertion by a stranger. Returns `{ok, reason}` and never throws, so a caller
 * can log the reason and drop the packet without a try/catch on the hot path.
 */
export function validate(env) {
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return fail('envelope is not an object');
  if (env.v !== PROTOCOL_VERSION) return fail(`protocol version ${env.v} != ${PROTOCOL_VERSION}`);
  if (typeof env.t !== 'string') return fail('missing type');

  if (env.t === 'S' || env.t === 'K' || env.t === 'I') {
    if (typeof env.b !== 'string') return fail('binary envelope without payload');
    // A 256 KB Realtime ceiling (04 §4.1) against a ~190-byte target: anything
    // an order of magnitude over our own budget is not ours. v3 keyframes carry
    // one eaten stream PER OCCUPIED SLOT, so a late-match big-city keyframe can
    // legitimately reach a few KB × hole count — the bound scales with the
    // roster and still sits ~10× under the Realtime ceiling.
    if (env.b.length > 24576) return fail('binary payload implausibly large');
    let bytes;
    try { bytes = fromBase64(env.b); } catch (e) { return fail(`bad base64: ${e.message}`); }
    try {
      if (env.t === 'I') {
        const i = decodeIntent(bytes);
        if (!isInt(i.slot, 0, LIMITS.MAX_HOLES)) return fail('intent slot out of range');
        if (!isInt(i.seq, 0, LIMITS.MAX_SEQ)) return fail('intent seq out of range');
        if (!isFiniteNum(i.x) || !isFiniteNum(i.z)) return fail('intent steering is not finite');
        if (Math.abs(i.x) > 1.0001 || Math.abs(i.z) > 1.0001) return fail('intent steering out of unit range');
      } else {
        const s = decodeSnapshot(bytes);
        if (env.t === 'K' && !(s.flags & FLAG.KEYFRAME)) return fail('keyframe envelope without keyframe flag');
        if (s.holes.length > LIMITS.MAX_HOLES) return fail('too many holes');
        const seen = new Set();
        for (const h of s.holes) {
          if (seen.has(h.slot)) return fail(`duplicate slot ${h.slot}`);
          seen.add(h.slot);
          if (!isFiniteNum(h.x) || !isFiniteNum(h.z)) return fail('hole position is not finite');
          if (Math.abs(h.x) > LIMITS.MAX_POS_M || Math.abs(h.z) > LIMITS.MAX_POS_M) return fail('hole position out of world range');
          if (h.mass < 0 || h.mass > LIMITS.MAX_MASS) return fail('hole mass out of range');
          if (h.radius < 0 || h.radius > LIMITS.MAX_RADIUS_M) return fail('hole radius out of range');
        }
      }
    } catch (e) {
      return fail(`decode failed: ${e.message}`);
    }
    return PASS;
  }

  if (!CONTROL_SET.has(env.t)) return fail(`unknown message type ${env.t}`);
  const d = env.d;
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return fail('control message without a data object');
  for (const k of CONTROL_REQUIRED[env.t]) {
    if (d[k] === undefined || d[k] === null) return fail(`${env.t} missing ${k}`);
  }
  if (d.slot !== undefined && !isInt(d.slot, 0, LIMITS.MAX_HOLES)) return fail('slot out of range');
  if (d.generation !== undefined && !isInt(d.generation, 0, 255)) return fail('generation out of range');
  if (d.members !== undefined && !Array.isArray(d.members)) return fail('roster members is not an array');
  if (d.members !== undefined && d.members.length > LIMITS.MAX_HOLES) return fail('roster too large');
  if (d.seed !== undefined && (typeof d.seed !== 'string' || d.seed.length > 128)) return fail('seed is not a short string');
  if (d.scene !== undefined && !isArenaScene(d.scene)) return fail('scene not in allowlist');
  if (d.sessionId !== undefined && (typeof d.sessionId !== 'string' || d.sessionId.length > 64)) return fail('sessionId is not a short string');
  if (d.reason !== undefined && (typeof d.reason !== 'string' || d.reason.length > 64)) return fail('reason is not a short string');
  return PASS;
}

/** 04 §6: "the tick is a 16-bit wrap-around compare". True when `a` is newer than `b`. */
export function tickIsNewer(a, b) {
  return ((a - b) & 0xffff) !== 0 && ((a - b) & 0xffff) < 0x8000;
}
