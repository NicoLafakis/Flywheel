// js/multiplayer/lobby.js — Staging Lobby Manager & Ephemeral Chat

import {
  CHAT_RATE_WINDOW_MS,
  COUNTDOWN_SECONDS,
  JOIN_TIMEOUT_MS,
  MATCH_DURATION_SECONDS,
  MAX_CHAT_MESSAGES_PER_SECOND,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_PALETTES,
  MAX_LOBBY_CHAT_HISTORY,
} from './config.js';
import {
  MSG_TYPES,
  createCountdownCancel,
  createCountdownStart,
  createGameStart,
  createLobbyChat,
  createPlayerJoin,
  createPlayerLeave,
  createRoomState,
  isAuthorizedLeave,
  isFromHostSender,
  isHostOnlyType,
} from './protocol.js';

// How often a running countdown re-reads the wall clock. Every screen derives its
// number from the host's timestamp rather than from its own decrement count, so
// they all show the same digit at the same moment however late a peer joined.
const COUNTDOWN_POLL_MS = 100;

// Injectable so a test can drive a 3-second countdown and an 8-second join
// timeout in microseconds. `unref` keeps a pending Flywheel timer from holding a
// Node test process open; it does not exist in a browser, hence the guard.
const DEFAULT_TIMERS = Object.freeze({
  now: () => Date.now(),
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  },
  clearInterval: (h) => clearInterval(h),
  setTimeout: (fn, ms) => {
    const h = setTimeout(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  },
  clearTimeout: (h) => clearTimeout(h),
});

export class MultiplayerLobby {
  constructor({
    channel,
    isHost = false,
    playerName = 'Player',
    playerSkin = 'default',
    scene = 'gallery',
    maxPlayers = 4,
    roomCode = '',
    joinTimeoutMs = JOIN_TIMEOUT_MS,
    timers = null,
    onJoinRejected = null,
  }) {
    this._timers = timers || DEFAULT_TIMERS;
    this.joinTimeoutMs = Number(joinTimeoutMs) > 0 ? Number(joinTimeoutMs) : JOIN_TIMEOUT_MS;
    this.channel = channel;
    this.isHost = Boolean(isHost);
    this.playerName = String(playerName || 'Player').slice(0, 16).trim();
    this.playerSkin = String(playerSkin || 'default');
    this.scene = String(scene || 'gallery');
    this.maxPlayers = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(maxPlayers) || 4));
    this.roomCode = String(roomCode || this._generateRoomCode()).toUpperCase();
    this.matchSeed = Math.floor(Math.random() * 1000000) + 1;

    // Ephemeral in-memory chat array (NEVER persisted to disk/DB)
    this.chatMessages = [];

    // Sliding-window chat rate limiter: key -> recent send timestamps.
    this._chatRateLog = new Map();

    // The sender id peers must see on host-only messages. The host knows its own;
    // a peer latches the first one a ROOM_STATE declares (trust on first use).
    this.hostSenderId = (this.isHost && this.channel.senderId !== null && this.channel.senderId !== undefined)
      ? String(this.channel.senderId)
      : null;

    // Player slots: Array of size maxPlayers
    this.players = new Array(this.maxPlayers).fill(null);
    this.mySlot = -1;

    // Countdown state
    this.countdownActive = false;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;
    this._countdownTimer = null;

    // Join outcome. A peer that is turned away (full room) or never answered
    // (nonexistent room) records why here as well as firing the callback.
    this.joinRejectedReason = null;
    this._joinTimer = null;

    // Set when the host abandons the room. Without this a peer sits on
    // "Waiting for players..." against a lobby that no longer exists — the room
    // code still looks valid, nothing ever arrives, and the only way out is a
    // reload.
    this.hostLeft = false;

    // Event callbacks. `onJoinRejected` is constructor-supplied because the
    // rejection can arrive inside this very constructor — the JOIN_REQUEST goes
    // out below and a local/loopback host answers synchronously.
    this.onRosterChange = null;
    this.onChat = null;
    this.onCountdownStart = null;
    this.onCountdownTick = null;
    this.onCountdownCancel = null;
    this.onGameStart = null;
    this.onJoinRejected = onJoinRejected;
    this.onHostLeft = null;

    // Initialize host slot 0
    if (this.isHost) {
      this.mySlot = 0;
      this.players[0] = {
        slot: 0,
        senderId: this.channel.senderId || 'host',
        name: this.playerName,
        skin: this.playerSkin,
        color: PLAYER_PALETTES[0],
        isHost: true,
      };
    }

    // Subscribe to channel
    this._unsubscribe = this.channel.onMessage((msg) => this._handleChannelMessage(msg));
    // ...and to who is actually in the room. Nothing used to notice a departure
    // at all: a player who backed out held their slot forever, so the room could
    // never reach N/N again and the auto-start countdown never fired.
    this._unsubscribePresence = typeof this.channel.onPresenceChange === 'function'
      ? this.channel.onPresenceChange((ev) => this._handlePresence(ev))
      : null;

    // If joining peer, broadcast join request
    if (!this.isHost) {
      // A room code that matches nothing produces no reply at all, so silence has
      // to be given a deadline or the player sits on "Waiting for players..."
      // forever. Armed BEFORE the request: a loopback host answers synchronously,
      // and a deadline armed afterwards would outlive the answer that settled it.
      this._armJoinTimeout();
      this.channel.broadcast({
        type: MSG_TYPES.JOIN_REQUEST,
        name: this.playerName,
        skin: this.playerSkin,
        senderId: this.channel.senderId,
      });
    }
  }

  // --- join outcome ---------------------------------------------------------

  _armJoinTimeout() {
    this._clearJoinTimeout();
    this._joinTimer = this._timers.setTimeout(() => {
      this._joinTimer = null;
      if (this.mySlot >= 0) return; // the room answered in time
      this._rejectJoin('NO_ROOM');
    }, this.joinTimeoutMs);
  }

  _clearJoinTimeout() {
    if (this._joinTimer !== null && this._joinTimer !== undefined) {
      this._timers.clearTimeout(this._joinTimer);
      this._joinTimer = null;
    }
  }

  /** Surface a terminal join failure exactly once. */
  _rejectJoin(reason) {
    if (this.joinRejectedReason) return;
    this.joinRejectedReason = String(reason || 'JOIN_FAILED');
    this._clearJoinTimeout();
    if (this.onJoinRejected) this.onJoinRejected(this.joinRejectedReason);
  }

  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 5; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
  }

  get connectedCount() {
    return this.players.filter(Boolean).length;
  }

  get isFull() {
    return this.connectedCount >= this.maxPlayers;
  }

  get inviteUrl() {
    const isLocal = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const origin = (!isLocal && typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://playflywheel.com';
    return `${origin}/?room=${this.roomCode}`;
  }

  /**
   * Rate-limit gate shared by the outbound and inbound chat paths.
   * Returns false once a key has already used its quota inside the window.
   */
  _allowChat(key, now = Date.now()) {
    const recent = (this._chatRateLog.get(key) || []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (recent.length >= MAX_CHAT_MESSAGES_PER_SECOND) {
      this._chatRateLog.set(key, recent);
      return false;
    }
    recent.push(now);
    this._chatRateLog.set(key, recent);
    return true;
  }

  sendChat(text) {
    if (!text || !text.trim()) return false;
    // Before the host answers our JOIN_REQUEST we have no slot, and a slot-less
    // chat message is rejected at the protocol boundary anyway.
    if (!Number.isInteger(this.mySlot) || this.mySlot < 0) return false;
    if (!this._allowChat('outbound')) return false;
    const myPlayer = this.players[this.mySlot] || {
      slot: this.mySlot,
      name: this.playerName,
      color: PLAYER_PALETTES[this.mySlot] || '#ffffff',
    };
    const chatMsg = createLobbyChat({
      slot: this.mySlot,
      name: myPlayer.name,
      color: myPlayer.color,
      text: text.trim(),
    });
    this.channel.broadcast(chatMsg);
    return true;
  }

  handleJoinRequest({ name, skin, senderId }) {
    if (!this.isHost) return;
    
    // If sender already has a slot, re-broadcast room state
    const existingIdx = this.players.findIndex((p) => p && p.senderId === senderId);
    if (existingIdx !== -1) {
      this._broadcastRoomState();
      return;
    }

    if (this.isFull) {
      // `senderId` now means "who originated this message" everywhere, so the
      // rejected peer is addressed with a separate field.
      this.channel.broadcast({
        type: MSG_TYPES.JOIN_REJECT,
        reason: 'ROOM_FULL',
        targetSenderId: senderId,
      });
      return;
    }

    // Allocate next empty slot
    const slot = this.players.findIndex((p) => p === null);
    if (slot === -1) return;

    this.players[slot] = {
      slot,
      senderId,
      name: String(name || `Player ${slot + 1}`).slice(0, 16),
      skin: String(skin || 'default'),
      color: PLAYER_PALETTES[slot] || '#ffffff',
      isHost: false,
    };

    this.channel.broadcast(createPlayerJoin({
      slot,
      joinerSenderId: senderId,
      name: this.players[slot].name,
      skin: this.players[slot].skin,
      color: this.players[slot].color,
    }));
    this._broadcastRoomState();

    // Check Auto-Start: If full capacity reached, start countdown!
    if (this.isFull && !this.countdownActive) {
      this.startCountdown();
    }
  }

  /**
   * Presence, reduced to the two questions the lobby cares about: did the host
   * abandon the room, and did somebody free a slot.
   */
  _handlePresence(ev) {
    if (!ev || ev.event !== 'leave') return;
    const gone = ev.senderId;
    if (gone === null || gone === undefined) return;

    // The host disappearing is terminal for everyone else: no ROOM_STATE, no
    // countdown, no GAME_START will ever arrive again.
    if (!this.isHost && this.hostSenderId !== null && String(gone) === String(this.hostSenderId)) {
      this._handleHostDeparture();
      return;
    }
    this.handlePlayerLeave(gone);
  }

  _handleHostDeparture() {
    if (this.hostLeft) return;
    this.hostLeft = true;
    this._clearJoinTimeout();
    if (this.countdownActive) this.cancelCountdown('HOST_LEFT');
    this._appendSystemChat('The host left the lobby');
    if (this.onHostLeft) this.onHostLeft('HOST_LEFT');
    // A peer that never got a slot has been waiting on the join deadline; tell
    // it through the same terminal path the UI already renders.
    else if (this.mySlot < 0) this._rejectJoin('HOST_LEFT');
  }

  /**
   * Free the slot `senderId` held. Idempotent: presence and an explicit
   * PLAYER_LEAVE can both describe the same departure and often will.
   */
  handlePlayerLeave(senderId) {
    const idx = this.players.findIndex((p) => p && String(p.senderId) === String(senderId));
    if (idx === -1) return;

    const leavingPlayer = this.players[idx];
    this.players[idx] = null;

    // Add ephemeral system notice in lobby chat
    this._appendSystemChat(`${leavingPlayer.name} left the lobby`);

    // Cancel countdown if it was active
    if (this.countdownActive) {
      this.cancelCountdown('PLAYER_LEFT');
    }

    if (this.isHost) {
      // The documented incremental event first (so a client can animate the seat
      // emptying), then the full roster that is the actual source of truth.
      this.channel.broadcast(createPlayerLeave({
        slot: leavingPlayer.slot ?? idx,
        leaverSenderId: leavingPlayer.senderId,
        name: leavingPlayer.name,
        reason: 'DISCONNECTED',
      }));
      this._broadcastRoomState();
    }
    if (this.onRosterChange) this.onRosterChange(this.players);
  }

  startCountdown() {
    const durationMs = COUNTDOWN_SECONDS * 1000;
    const serverStartTs = this._timers.now();

    this.countdownActive = true;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;

    this.channel.broadcast(createCountdownStart({ durationMs, serverStartTs }));

    if (this.onCountdownStart) this.onCountdownStart(this.countdownSecondsLeft);
    this._startCountdownTicker(durationMs, serverStartTs);
  }

  /**
   * Drive the visible countdown off the host's start timestamp rather than off a
   * local decrement count. The host used to be the only screen with a ticker at
   * all, so every peer watched a frozen "3" until the match simply began.
   */
  _startCountdownTicker(durationMs, serverStartTs) {
    const totalSeconds = (Number(durationMs) || 0) / 1000;
    const endTs = (Number(serverStartTs) || this._timers.now()) + (Number(durationMs) || 0);
    this._clearCountdownTicker();
    this._countdownTimer = this._timers.setInterval(() => {
      // Clamped to the countdown's own length: `serverStartTs` is the HOST's
      // clock, and a peer whose clock is minutes behind must not be shown a
      // minutes-long countdown.
      const raw = (endTs - this._timers.now()) / 1000;
      const remaining = Math.max(0, Math.min(totalSeconds, raw));
      this.countdownSecondsLeft = remaining;
      if (this.onCountdownTick) this.onCountdownTick(remaining);

      if (remaining <= 0) {
        this._clearCountdownTicker();
        // Host-only: a peer reaching zero first must never start the match.
        if (this.isHost) this.launchGame();
      }
    }, COUNTDOWN_POLL_MS);
  }

  _clearCountdownTicker() {
    if (this._countdownTimer !== null && this._countdownTimer !== undefined) {
      this._timers.clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  }

  cancelCountdown(reason = 'PLAYER_LEFT') {
    if (!this.countdownActive) return;
    this.countdownActive = false;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;
    this._clearCountdownTicker();

    if (this.isHost) {
      this.channel.broadcast(createCountdownCancel({ reason }));
    }
    if (this.onCountdownCancel) this.onCountdownCancel(reason);
  }

  launchGame() {
    if (!this.isHost) return;
    const gameStartMsg = createGameStart({
      scene: this.scene,
      matchSeed: this.matchSeed,
      durationSeconds: MATCH_DURATION_SECONDS,
    });
    this.channel.broadcast(gameStartMsg);
  }

  _broadcastRoomState() {
    if (!this.isHost) return;
    const stateMsg = createRoomState({
      roomCode: this.roomCode,
      scene: this.scene,
      maxPlayers: this.maxPlayers,
      matchSeed: this.matchSeed,
      players: this.players,
      hostSenderId: this.hostSenderId,
    });
    this.channel.broadcast(stateMsg);
    if (this.onRosterChange) this.onRosterChange(this.players);
  }

  _appendSystemChat(text) {
    const sysMsg = createLobbyChat({
      slot: -1,
      name: 'SYSTEM',
      color: '#ffd23f',
      text,
    });
    this._appendChat(sysMsg);
  }

  _appendChat(chatMsg) {
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > MAX_LOBBY_CHAT_HISTORY) {
      this.chatMessages.shift();
    }
    if (this.onChat) this.onChat(chatMsg, this.chatMessages);
  }

  _handleChannelMessage(msg) {
    if (!msg || !msg.type) return;

    if (isHostOnlyType(msg.type)) {
      // Trust on first use: the first ROOM_STATE names the host, and every
      // host-only message after that must carry the same sender id.
      if (this.hostSenderId === null && msg.type === MSG_TYPES.ROOM_STATE) {
        const declared = msg.hostSenderId !== undefined && msg.hostSenderId !== null
          ? msg.hostSenderId
          : msg.senderId;
        if (declared !== undefined && declared !== null) this.hostSenderId = String(declared);
      }
      if (!isFromHostSender(msg, this.hostSenderId)) return;
    }

    switch (msg.type) {
      case MSG_TYPES.JOIN_REQUEST:
        if (this.isHost) this.handleJoinRequest(msg);
        break;

      case MSG_TYPES.JOIN_REJECT: {
        // The host broadcasts the rejection to the whole room and names its
        // target, so everyone else has to ignore it — including the host itself,
        // which hears its own broadcast back over the loopback.
        if (this.isHost) break;
        const target = msg.targetSenderId;
        if (target !== undefined && target !== null
            && String(target) !== String(this.channel.senderId)) break;
        this._rejectJoin(msg.reason || 'ROOM_FULL');
        break;
      }

      case MSG_TYPES.ROOM_STATE:
        // The room answered, so the "does this room exist?" deadline is settled.
        this._clearJoinTimeout();
        this.roomCode = msg.roomCode;
        this.scene = msg.scene;
        this.maxPlayers = msg.maxPlayers;
        this.matchSeed = msg.matchSeed;
        this.players = msg.players;

        // Resolve my slot
        if (!this.isHost) {
          const myEntry = this.players.find((p) => p && p.senderId === this.channel.senderId);
          if (myEntry) this.mySlot = myEntry.slot;
        }

        if (this.onRosterChange) this.onRosterChange(this.players);
        break;

      case MSG_TYPES.PLAYER_LEAVE:
        // Not host-only (see protocol.js): a client may announce its own exit,
        // which lands before any presence timeout. The host hears its own
        // broadcast back and has already freed the slot — handlePlayerLeave is
        // idempotent, so the echo is a no-op.
        if (!isAuthorizedLeave(msg, this.hostSenderId)) break;
        this.handlePlayerLeave(msg.leaverSenderId);
        break;

      case MSG_TYPES.LOBBY_CHAT: {
        // Enforced on receipt too: a hostile client just skips sendChat().
        const rateKey = (msg.senderId !== undefined && msg.senderId !== null)
          ? `id:${msg.senderId}`
          : `slot:${msg.slot}`;
        if (!this._allowChat(rateKey)) break;
        this._appendChat(msg);
        break;
      }

      case MSG_TYPES.COUNTDOWN_START:
        // The host hears its own broadcast back; startCountdown() already ran.
        if (this.isHost) break;
        this.countdownActive = true;
        this.countdownSecondsLeft = msg.durationMs / 1000;
        if (this.onCountdownStart) this.onCountdownStart(this.countdownSecondsLeft);
        this._startCountdownTicker(msg.durationMs, msg.serverStartTs);
        break;

      case MSG_TYPES.COUNTDOWN_CANCEL:
        this.cancelCountdown(msg.reason);
        break;

      case MSG_TYPES.GAME_START:
        this._clearCountdownTicker();
        if (this.onGameStart) this.onGameStart(msg);
        break;
    }
  }

  /** Announce a deliberate exit, so the room reacts now instead of on a timeout. */
  leave(reason = 'LEFT') {
    const me = this.mySlot >= 0 ? this.players[this.mySlot] : null;
    if (!me) return;
    this.channel.broadcast(createPlayerLeave({
      slot: this.mySlot,
      leaverSenderId: this.channel.senderId,
      name: me.name,
      reason,
    }));
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribePresence) this._unsubscribePresence();
    this._clearCountdownTicker();
    this._clearJoinTimeout();
    // Garbage collect in-memory chat messages completely
    this.chatMessages.length = 0;
    this.players.length = 0;
    this._chatRateLog.clear();
  }
}
