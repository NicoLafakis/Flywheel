// The transport seam: one interface, two implementations.
//
// Implements: 04-netcode-design.md §6 "Latency and loss" (the failure model a
// transport must reproduce), §4.1 (envelopes are JSON-safe), and
// 03-technical-design.md §1.2 — no three.js, no `Math.random`, no `await`
// inside the frame loop (every method here is synchronous except `connect`).
//
// ADR-0014 (no new deps): `SupabaseRealtimeTransport` NEVER imports
// `@supabase/supabase-js`. The client is INJECTED. 03 §"js/net/client.js" makes
// the same call for the same reason — one file owns the import, everything else
// takes the object. That also makes this file testable in Node with a fake.
//
// Researched against the live docs before writing (repo rule 11), 2026-08-10:
//   https://supabase.com/docs/guides/realtime/broadcast
//     client.channel(topic, { config: { broadcast: { self, ack }, private } })
//     channel.on('broadcast', { event }, (payload) => ...)
//     channel.send({ type: 'broadcast', event, payload })
//     channel.subscribe((status) => { if (status !== 'SUBSCRIBED') ... })
//   https://supabase.com/docs/guides/realtime/quotas
//     Broadcast payload ceiling 256 KB on Free (matches 04 §4.1's figure).
//     Messages/second: 100 Free, 500 Pro. Channels per connection: 100.
//     Concurrent connections: 200 Free.
// The 100 msg/s free-tier ceiling is the number that actually binds an 8-player
// booth room: a host sending 12 Hz plus seven peers sending 10 Hz is 82
// messages/second through one project. That is INSIDE the ceiling and it is not
// inside it by much, which is a second, independent reason 04 §4 ships 12/10
// rather than the 15/20 it allows. Raising either constant needs this number
// re-checked, not just the bandwidth one.
//
// MARKED UNTESTED: `SupabaseRealtimeTransport` has never run against a real
// project — there are no credentials yet. It is written to the documented API
// and nothing more. `LoopbackTransport` is what the self-test exercises, and it
// is a real implementation, not a mock: the arena's own host and peer loops run
// on it unchanged.

import { RNG } from '../rng.js';

/**
 * The interface. A transport moves JSON-safe envelopes between endpoints and
 * knows nothing about what is in them.
 */
export class Transport {
  constructor() {
    this._handlers = new Set();
    this.connected = false;
  }

  /** @param {(env:object, meta:object) => void} fn */
  on(fn) { this._handlers.add(fn); return () => this._handlers.delete(fn); }
  off(fn) { this._handlers.delete(fn); }

  // eslint-disable-next-line no-unused-vars
  send(env) { throw new Error('Transport.send is abstract'); }
  async connect() { this.connected = true; return this; }
  disconnect() { this.connected = false; }

  _emit(env, meta) {
    for (const fn of this._handlers) fn(env, meta);
  }
}

/**
 * Two (or eight) ends in one page, with a deliberately hostile middle.
 *
 * The hub owns a virtual clock: nothing is delivered until `advance(ms)` walks
 * past its due time. That is what makes a 120 ms latency test a determinstic
 * assertion instead of a flaky `setTimeout`. `attachRealClock()` exists for
 * driving it from `requestAnimationFrame` in a browser page.
 *
 * The impairments model 04 §6, which is explicit that this is TCP:
 *   > There is no packet loss at the application layer — loss manifests as
 *   > latency spikes and head-of-line blocking, which is a different failure.
 * So `dropRate` here is NOT modelling IP packet loss; it models the one thing
 * that genuinely drops an application message on a WebSocket — a send issued
 * while the socket is down, and a server-side rate limit shedding load. Both
 * are real at a booth, and 04 §6 says the design survives them ("A dropped
 * intent means one tick of the previous direction"), so the test has to be able
 * to cause them.
 */
export class LoopbackHub {
  /**
   * @param {object} opts { latencyMs, jitterMs, dropRate, seed, ordered }
   */
  constructor(opts = {}) {
    this.latencyMs = opts.latencyMs != null ? opts.latencyMs : 0;
    this.jitterMs = opts.jitterMs != null ? opts.jitterMs : 0;
    this.dropRate = opts.dropRate != null ? opts.dropRate : 0;
    // Head-of-line blocking, per 04 §6: a TCP stream cannot deliver out of
    // order, so a jittered message never overtakes an earlier one. Default true
    // because that is what Realtime actually does; settable false to prove the
    // receiver's 16-bit tick compare works anyway.
    this.ordered = opts.ordered !== false;
    this.rng = new RNG(opts.seed || 'loopback');   // never Math.random (03 §1.2)
    this.nowMs = 0;
    this.ends = new Map();
    this.queue = [];          // [{ dueMs, seq, from, env }]
    this._seq = 0;
    this._lastDue = new Map(); // from -> last due time, for ordering
    this.stats = { sent: 0, dropped: 0, delivered: 0 };
  }

  endpoint(id) {
    let t = this.ends.get(id);
    if (!t) { t = new LoopbackTransport(this, id); this.ends.set(id, t); }
    return t;
  }

  _send(from, env) {
    this.stats.sent++;
    if (this.dropRate > 0 && this.rng.chance(this.dropRate)) { this.stats.dropped++; return false; }
    const jitter = this.jitterMs > 0 ? this.rng.float(-this.jitterMs, this.jitterMs) : 0;
    let due = this.nowMs + Math.max(0, this.latencyMs + jitter);
    if (this.ordered) {
      const prev = this._lastDue.get(from);
      if (prev != null && due < prev) due = prev;   // head-of-line
      this._lastDue.set(from, due);
    }
    // JSON round-trip on the way in. Realtime carries JSON, so an envelope
    // holding a Uint8Array or a Map is a bug that must fail here, in a test,
    // rather than at the booth as a silently-empty object.
    this.queue.push({ dueMs: due, seq: this._seq++, from, env: JSON.parse(JSON.stringify(env)) });
    return true;
  }

  /** Advance the virtual clock, delivering everything now due, in due order. */
  advance(ms) {
    this.nowMs += ms;
    const due = this.queue.filter((m) => m.dueMs <= this.nowMs);
    this.queue = this.queue.filter((m) => m.dueMs > this.nowMs);
    due.sort((a, b) => (a.dueMs - b.dueMs) || (a.seq - b.seq));
    for (const m of due) {
      for (const [id, end] of this.ends) {
        if (id === m.from && !end.self) continue;
        if (!end.connected) continue;
        this.stats.delivered++;
        end._emit(m.env, { from: m.from, atMs: this.nowMs });
      }
    }
    return due.length;
  }

  /** Drain everything regardless of due time. For teardown assertions. */
  flush() {
    const far = this.queue.reduce((m, q) => Math.max(m, q.dueMs), this.nowMs);
    return this.advance(Math.max(0, far - this.nowMs));
  }
}

export class LoopbackTransport extends Transport {
  constructor(hub, id) {
    super();
    this.hub = hub;
    this.id = id;
    this.self = false;   // mirrors Supabase's `broadcast: { self }`
    this.connected = true;
  }

  send(env) {
    if (!this.connected) return false;
    return this.hub._send(this.id, env);
  }

  async connect() { this.connected = true; return this; }
  disconnect() { this.connected = false; }
  get nowMs() { return this.hub.nowMs; }
}

/**
 * Supabase Realtime broadcast. UNTESTED — no credentials exist yet.
 *
 * The client is injected, never imported (ADR-0014). Anything with
 * `.channel(topic, opts)` returning `{ on, send, subscribe, unsubscribe }`
 * satisfies this, which is also how the self-test drives it with a fake.
 *
 * One event name (`'m'`) carries every message kind, and the kind lives in the
 * envelope's `t`. Realtime filters subscriptions by event name, so a name per
 * kind would mean a subscription per kind for no gain — the receiver has to
 * branch on `t` regardless, and 04 §4.1's envelope already carries it.
 */
export class SupabaseRealtimeTransport extends Transport {
  /**
   * @param {object} client injected supabase client
   * @param {string} topic  e.g. `arena:K7QM`
   * @param {object} opts   { self, ack, private, event }
   */
  constructor(client, topic, opts = {}) {
    super();
    if (!client || typeof client.channel !== 'function') {
      throw new TypeError('SupabaseRealtimeTransport needs an injected client with .channel()');
    }
    this.client = client;
    this.topic = topic;
    this.event = opts.event || 'm';
    this.status = 'CLOSED';
    this.channel = client.channel(topic, {
      config: {
        // self:false — the host does not want its own snapshots back, and a peer
        // does not want its own intents back. Explicit because the default has
        // changed once already and a silent echo is a self-desync.
        broadcast: { self: !!opts.self, ack: !!opts.ack },
        private: !!opts.private,
      },
    });
    this.channel.on('broadcast', { event: this.event }, (msg) => {
      // The documented callback shape is `{ type, event, payload }`. Tolerate a
      // bare payload too: this is untested against the live service, and being
      // wrong about the wrapper should not be a total blackout.
      const env = msg && msg.payload !== undefined ? msg.payload : msg;
      this._emit(env, { from: 'realtime', atMs: Date.now() });
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.channel.subscribe((status, err) => {
        this.status = status;
        if (status === 'SUBSCRIBED') { this.connected = true; resolve(this); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          // 04 §12 and invariant 10: a transport failure degrades to solo, it
          // never blocks gameplay. Rejecting is how the caller learns to.
          reject(err || new Error(`realtime subscribe: ${status}`));
        }
      });
    });
  }

  send(env) {
    if (!this.connected) return false;
    this.channel.send({ type: 'broadcast', event: this.event, payload: env });
    return true;
  }

  disconnect() {
    this.connected = false;
    if (typeof this.channel.unsubscribe === 'function') this.channel.unsubscribe();
    else if (typeof this.client.removeChannel === 'function') this.client.removeChannel(this.channel);
  }
}
