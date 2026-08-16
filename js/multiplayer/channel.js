// js/multiplayer/channel.js — Ephemeral Transport Layer (Zero Storage / Zero Persistence)

import { decodeMessage, encodeMessage } from './protocol.js';

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
  }

  onMessage(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _dispatch(msg) {
    const decoded = decodeMessage(msg);
    if (!decoded) return;
    for (const listener of this._listeners) {
      try {
        listener(decoded);
      } catch (err) {
        console.error('[MultiplayerChannel] Listener error:', err);
      }
    }
  }

  broadcast(message) {
    throw new Error('MultiplayerChannel.broadcast must be implemented');
  }

  close() {
    this._listeners.clear();
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
    return ch;
  }

  _removeChannel(channel) {
    const room = this._rooms.get(channel.roomCode);
    if (room) {
      room.delete(channel);
      if (room.size === 0) this._rooms.delete(channel.roomCode);
    }
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
    const encoded = encodeMessage(message);
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
    this._bc = null;
    this._initBroadcast();
  }

  _initBroadcast() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._bc = new BroadcastChannel(`fw_room_${this.roomCode}`);
        this._bc.onmessage = (evt) => {
          this._dispatch(evt.data);
        };
      } catch (err) {
        console.warn('[LiveBroadcastChannel] Fallback to window events:', err);
      }
    }
  }

  broadcast(message) {
    const encoded = encodeMessage(message);
    // 1. Dispatch locally to self listeners
    this._dispatch(encoded);
    // 2. Broadcast across tabs/windows
    if (this._bc) {
      try {
        this._bc.postMessage(encoded);
      } catch (err) {
        console.error('[LiveBroadcastChannel] postMessage failed:', err);
      }
    }
  }

  close() {
    super.close();
    if (this._bc) {
      this._bc.close();
      this._bc = null;
    }
  }
}
