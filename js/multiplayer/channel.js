// js/multiplayer/channel.js — Ephemeral Transport Layer (Zero Storage / Zero Persistence)

import { decodeMessage, encodeMessage, validateMessage } from './protocol.js';
import { RealtimeClient } from '../vendor/supabase-realtime.module.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../board/config.js';

let sharedRealtimeClient = null;
export function _setRealtimeClientForTest(client) {
  sharedRealtimeClient = client;
}

function getRealtimeClient() {
  if (!sharedRealtimeClient && typeof window !== 'undefined') {
    sharedRealtimeClient = new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, {
      params: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    sharedRealtimeClient.connect();
  }
  return sharedRealtimeClient;
}

/**
 * Base Channel interface.
 * Strictly ephemeral: broadcasts are transient in-memory network events.
 * No disk writes, no database writes, no client persistence.
 */
export class MultiplayerChannel {
  constructor(roomCode, clientRole) {
    this.roomCode = String(roomCode || '').toUpperCase();
    this.clientRole = clientRole || 'peer';
    this._listeners = new Set();
    this._presenceListeners = new Set();
  }

  onMessage(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Who is in the room, transport-agnostically.
   *
   * The callback receives `{ event: 'join' | 'leave' | 'sync', senderId, present }`.
   * Deliberately declared on the BASE class: the lobby, the host session and the
   * peer session all need to know a player arrived or vanished, and none of them
   * may learn it by reaching into Supabase — the in-memory hub has to be able to
   * answer the same question for the headless suites.
   */
  onPresenceChange(callback) {
    this._presenceListeners.add(callback);
    return () => this._presenceListeners.delete(callback);
  }

  _emitPresence(event) {
    for (const listener of this._presenceListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[MultiplayerChannel] Presence listener error:', err);
      }
    }
  }

  _dispatch(msg) {
    const decoded = decodeMessage(msg);
    if (!decoded) return;
    // Every listener downstream of here may assume a well-formed message: unknown
    // types, impossible slots, NaN coordinates and non-array payloads die here.
    const validated = validateMessage(decoded);
    if (!validated) return;
    for (const listener of this._listeners) {
      try {
        listener(validated);
      } catch (err) {
        console.error('[MultiplayerChannel] Listener error:', err);
      }
    }
  }

  /**
   * Stamp this client's identity on an outbound message so receivers can bind it
   * to a slot (host) or to the host itself (peers). An explicit senderId wins.
   */
  _stamp(message) {
    if (!message || typeof message !== 'object') return message;
    if (message.senderId === null || message.senderId === undefined) {
      if (this.senderId === null || this.senderId === undefined) return message;
      return { ...message, senderId: this.senderId };
    }
    return message;
  }

  broadcast(message) {
    throw new Error('MultiplayerChannel.broadcast must be implemented');
  }

  close() {
    this._listeners.clear();
    this._presenceListeners.clear();
  }
}

/**
 * In-Memory Loopback Hub for local multiplayer matches, testing, and dev simulation.
 */
export class InMemoryChannelHub {
  constructor() {
    this._rooms = new Map(); // roomCode -> Set of InMemoryChannel
  }

  createChannel(roomCode, senderId) {
    const code = String(roomCode || '').toUpperCase();
    if (!this._rooms.has(code)) {
      this._rooms.set(code, new Set());
    }
    const ch = new InMemoryChannel(this, code, senderId);
    this._rooms.get(code).add(ch);
    // The loopback's stand-in for Supabase presence, so the same lobby/host/peer
    // code paths are exercised headlessly.
    this._announcePresence(code, 'join', senderId);
    return ch;
  }

  presentSenderIds(roomCode) {
    const room = this._rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return [];
    return [...room].map((ch) => ch.senderId);
  }

  _announcePresence(roomCode, event, senderId) {
    const room = this._rooms.get(roomCode);
    if (!room) return;
    const present = [...room].map((ch) => ch.senderId);
    for (const ch of room) ch._emitPresence({ event, senderId, present });
  }

  _removeChannel(channel) {
    const room = this._rooms.get(channel.roomCode);
    if (room) {
      room.delete(channel);
      if (room.size === 0) this._rooms.delete(channel.roomCode);
    }
    // Announced AFTER the removal so the leaver is absent from `present`, and so
    // the closing channel — whose own listeners are already cleared — is not
    // told about itself.
    this._announcePresence(channel.roomCode, 'leave', channel.senderId);
  }

  _broadcast(senderChannel, message) {
    const room = this._rooms.get(senderChannel.roomCode);
    if (!room) return;
    for (const ch of room) {
      // Dispatches to peers (and host)
      ch._dispatch(message);
    }
  }
}

export class InMemoryChannel extends MultiplayerChannel {
  constructor(hub, roomCode, senderId) {
    super(roomCode, senderId);
    this._hub = hub;
    this.senderId = senderId;
  }

  broadcast(message) {
    const encoded = encodeMessage(this._stamp(message));
    this._hub._broadcast(this, encoded);
  }

  close() {
    super.close();
    if (this._hub) {
      this._hub._removeChannel(this);
      this._hub = null;
    }
  }
}

/**
 * Live Broadcast Channel over WebRTC / Realtime Broadcast (zero storage).
 */
export class LiveBroadcastChannel extends MultiplayerChannel {
  constructor(roomCode, senderId, options = {}) {
    super(roomCode, senderId);
    this.senderId = senderId;
    this._client = getRealtimeClient();
    this._channel = null;
    this._isSubscribed = false;
    this._queuedBroadcasts = [];
    this._initBroadcast();
  }

  _initBroadcast() {
    if (!this._client) return;
    this._channel = this._client.channel(`fw_room_${this.roomCode}`, {
      config: {
        broadcast: { ack: false },
        // Keyed by senderId because that is the identity the protocol already
        // binds a slot to: a presence leave has to name a SLOT OWNER, not an
        // anonymous socket, or nothing downstream can free the right seat.
        presence: { key: String(this.senderId ?? ''), enabled: true },
      }
    });

    this._channel
      .on('broadcast', { event: 'fw_msg' }, (payload) => {
        this._dispatch(payload.payload);
      })
      .on('presence', { event: 'join' }, (payload) => {
        this._emitPresence(this._presenceEvent('join', payload));
      })
      .on('presence', { event: 'leave' }, (payload) => {
        this._emitPresence(this._presenceEvent('leave', payload));
      })
      .on('presence', { event: 'sync' }, () => {
        this._emitPresence({ event: 'sync', senderId: null, present: this._presentSenderIds() });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[LiveBroadcastChannel] Connected to room', this.roomCode);
          this._isSubscribed = true;
          this._trackSelf();
          this._flushQueue();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[LiveBroadcastChannel] Error connecting to room', this.roomCode);
          this._isSubscribed = false;
        } else if (status === 'CLOSED') {
          this._isSubscribed = false;
        }
      });
  }

  /**
   * Announce this client to the room. Until it tracks, nobody else's presence
   * roster contains it, so nobody would ever be told when it disappeared.
   * Guarded because the test doubles for RealtimeChannel need not implement it.
   */
  _trackSelf() {
    if (!this._channel || typeof this._channel.track !== 'function') return;
    const result = this._channel.track({ senderId: this.senderId, at: Date.now() });
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.error('[LiveBroadcastChannel] presence track failed:', err));
    }
  }

  _presentSenderIds() {
    if (!this._channel || typeof this._channel.presenceState !== 'function') return [];
    try {
      return Object.keys(this._channel.presenceState() || {});
    } catch {
      return [];
    }
  }

  /** Supabase's presence payload, reduced to the transport-agnostic shape. */
  _presenceEvent(event, payload) {
    const key = payload && payload.key !== undefined && payload.key !== null ? String(payload.key) : null;
    return { event, senderId: key, present: this._presentSenderIds() };
  }

  _flushQueue() {
    if (!this._channel || !this._isSubscribed) return;
    for (const encoded of this._queuedBroadcasts) {
      this._channel.send({
        type: 'broadcast',
        event: 'fw_msg',
        payload: encoded
      }).catch((err) => {
        console.error('[LiveBroadcastChannel] send failed:', err);
      });
    }
    this._queuedBroadcasts = [];
  }

  broadcast(message) {
    const encoded = encodeMessage(this._stamp(message));
    // 1. Dispatch locally to self listeners
    this._dispatch(encoded);
    // 2. Broadcast across the network
    if (this._channel) {
      if (this._isSubscribed) {
        this._channel.send({
          type: 'broadcast',
          event: 'fw_msg',
          payload: encoded
        }).catch((err) => {
          console.error('[LiveBroadcastChannel] send failed:', err);
        });
      } else {
        // Queue the message to be sent once subscribed
        this._queuedBroadcasts.push(encoded);
      }
    }
  }

  close() {
    super.close();
    if (this._channel) {
      // Untrack BEFORE the unsubscribe so the room sees a clean leave rather than
      // waiting for the presence heartbeat to time this client out.
      if (typeof this._channel.untrack === 'function') {
        const result = this._channel.untrack();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
      if (this._client) this._client.removeChannel(this._channel);
      this._channel = null;
    }
    this._isSubscribed = false;
    this._queuedBroadcasts = [];
  }
}
