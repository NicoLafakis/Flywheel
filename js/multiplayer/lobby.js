// js/multiplayer/lobby.js — Staging Lobby Manager & Ephemeral Chat

import {
  COUNTDOWN_SECONDS,
  COUNTDOWN_TICKS,
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
  createRoomState,
} from './protocol.js';

export class MultiplayerLobby {
  constructor({
    channel,
    isHost = false,
    playerName = 'Player',
    playerSkin = 'default',
    scene = 'gallery',
    maxPlayers = 4,
    roomCode = '',
  }) {
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

    // Player slots: Array of size maxPlayers
    this.players = new Array(this.maxPlayers).fill(null);
    this.mySlot = -1;

    // Countdown state
    this.countdownActive = false;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;
    this._countdownTimer = null;

    // Event callbacks
    this.onRosterChange = null;
    this.onChat = null;
    this.onCountdownStart = null;
    this.onCountdownTick = null;
    this.onCountdownCancel = null;
    this.onGameStart = null;

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

    // If joining peer, broadcast join request
    if (!this.isHost) {
      this.channel.broadcast({
        type: MSG_TYPES.JOIN_REQUEST,
        name: this.playerName,
        skin: this.playerSkin,
        senderId: this.channel.senderId,
      });
    }
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
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://flywheel.game';
    return `${origin}/?room=${this.roomCode}`;
  }

  sendChat(text) {
    if (!text || !text.trim()) return;
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
      this.channel.broadcast({
        type: MSG_TYPES.JOIN_REJECT,
        reason: 'ROOM_FULL',
        senderId,
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

    this._broadcastRoomState();

    // Check Auto-Start: If full capacity reached, start countdown!
    if (this.isFull && !this.countdownActive) {
      this.startCountdown();
    }
  }

  handlePlayerLeave(senderId) {
    const idx = this.players.findIndex((p) => p && p.senderId === senderId);
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
      this._broadcastRoomState();
    }
    if (this.onRosterChange) this.onRosterChange(this.players);
  }

  startCountdown() {
    this.countdownActive = true;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;

    const startMsg = createCountdownStart({
      durationMs: COUNTDOWN_SECONDS * 1000,
      serverStartTs: Date.now(),
    });
    this.channel.broadcast(startMsg);

    if (this.onCountdownStart) this.onCountdownStart(this.countdownSecondsLeft);

    if (this._countdownTimer) clearInterval(this._countdownTimer);
    this._countdownTimer = setInterval(() => {
      this.countdownSecondsLeft -= 1.0;
      if (this.onCountdownTick) this.onCountdownTick(this.countdownSecondsLeft);

      if (this.countdownSecondsLeft <= 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        if (this.isHost) {
          this.launchGame();
        }
      }
    }, 1000);
  }

  cancelCountdown(reason = 'PLAYER_LEFT') {
    if (!this.countdownActive) return;
    this.countdownActive = false;
    this.countdownSecondsLeft = COUNTDOWN_SECONDS;
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }

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
      durationSeconds: 180,
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

    switch (msg.type) {
      case MSG_TYPES.JOIN_REQUEST:
        if (this.isHost) this.handleJoinRequest(msg);
        break;

      case MSG_TYPES.ROOM_STATE:
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

      case MSG_TYPES.LOBBY_CHAT:
        this._appendChat(msg);
        break;

      case MSG_TYPES.COUNTDOWN_START:
        this.countdownActive = true;
        this.countdownSecondsLeft = msg.durationMs / 1000;
        if (this.onCountdownStart) this.onCountdownStart(this.countdownSecondsLeft);
        break;

      case MSG_TYPES.COUNTDOWN_CANCEL:
        this.cancelCountdown(msg.reason);
        break;

      case MSG_TYPES.GAME_START:
        if (this._countdownTimer) clearInterval(this._countdownTimer);
        if (this.onGameStart) this.onGameStart(msg);
        break;
    }
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    // Garbage collect in-memory chat messages completely
    this.chatMessages.length = 0;
    this.players.length = 0;
  }
}
