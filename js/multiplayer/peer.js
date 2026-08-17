// js/multiplayer/peer.js — Client / Peer Multiplayer Session

import { VoxelSandboxSim } from '../voxelsim.js';
import { HOST_SILENCE_POLL_MS, HOST_SILENCE_TIMEOUT_MS } from './config.js';
import {
  MSG_TYPES,
  createGameOver,
  createInputTick,
  createPlayerLeave,
  isAuthorizedLeave,
  isFromHostSender,
  isHostOnlyType,
} from './protocol.js';
import { buildHoleConfigs, buildLeaderboard } from './roster.js';

// Injectable so the host-silence watchdog can be proven in microseconds instead
// of sleeping five real seconds. `unref` keeps a pending Flywheel timer from
// holding a Node test process open; it does not exist in a browser, hence the guard.
const DEFAULT_TIMERS = Object.freeze({
  now: () => Date.now(),
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  },
  clearInterval: (h) => clearInterval(h),
});

function resolveHostSenderId(players, explicit) {
  if (explicit !== null && explicit !== undefined) return String(explicit);
  const list = Array.isArray(players) ? players : [];
  const hostEntry = list.find((p) => p && (p.isHost === true || p.slot === 0));
  if (hostEntry && hostEntry.senderId !== null && hostEntry.senderId !== undefined) {
    return String(hostEntry.senderId);
  }
  return null;
}

export class MultiplayerPeer {
  constructor({
    channel,
    scene = 'gallery',
    matchSeed = 1,
    players = [],
    mySlot = 1,
    hostSenderId = null,
    durationSeconds = 180,
    timers = null,
    hostSilenceMs = HOST_SILENCE_TIMEOUT_MS,
  }) {
    this.channel = channel;
    this.scene = scene;
    this.matchSeed = matchSeed;
    // SLOT-INDEXED, gaps and all (see roster.js) — compacting it is what made a
    // peer follow and steer the host's hole.
    this.players = Array.isArray(players) ? players.slice() : [];
    this.durationSeconds = durationSeconds;
    this.mySlot = Number(mySlot);
    this.isHost = false;
    this.tick = 0;
    this.over = false;
    this._timers = timers || DEFAULT_TIMERS;
    this.hostSilenceMs = Number(hostSilenceMs) > 0 ? Number(hostSilenceMs) : HOST_SILENCE_TIMEOUT_MS;
    // Why the match ended, when it did not end with a GAME_OVER from the host.
    this.endReason = null;

    // Only this sender may end the match, teleport holes, or award kills. Taken
    // from the roster entry that owns slot 0; null means the session was built
    // without identities (local/dev) and there is nothing to authenticate against.
    this.hostSenderId = resolveHostSenderId(this.players, hostSenderId);

    // Callbacks
    this.onPvPKill = null;
    this.onGameOver = null;
    this.onStateSync = null;
    this.onPlayerLeave = null;

    // The SAME builder the host uses, so both clients place slot N at the same
    // metre. Two independent copies of the formula is a desync waiting for the
    // first gap in a roster.
    const holeConfigs = buildHoleConfigs(this.players);

    // Client-side visual simulation. Same clock LENGTH as the host's
    // authoritative sim (see host.js) — but `clockFollower` is what makes the two
    // agree on where in that length they are. Without it each client counted its
    // own step() calls, so a device that could not sustain 60 a second fell
    // behind for good and the match ended under a HUD still reading 0:38.
    this.sim = new VoxelSandboxSim({
      scene: this.scene,
      seed: this.matchSeed,
      mode: 'freeplay',
      clockLimitTicks: Math.round(this.durationSeconds * 60),
      clockFollower: true,
      multiplayer: true,
      holes: holeConfigs,
    });
    this.sim.localSlot = this.mySlot;

    // Subscribe to incoming messages from host
    this._unsubscribe = this.channel.onMessage((msg) => this._handleMessage(msg));
    // Presence is the fast path for "the host closed its tab": it answers in one
    // round trip instead of waiting out the silence window below.
    this._unsubscribePresence = typeof this.channel.onPresenceChange === 'function'
      ? this.channel.onPresenceChange((ev) => this._handlePresence(ev))
      : null;

    // HOST-SILENCE WATCHDOG. If the host vanishes mid-match a peer receives no
    // further STATE_SYNC and no GAME_OVER at all: rivals freeze where they stand,
    // the results screen never arrives, and the only way out is a page reload.
    this._lastSyncAt = this._timers.now();
    this._watchdog = this._timers.setInterval(() => this._checkHostSilence(), HOST_SILENCE_POLL_MS);
  }

  get myHole() {
    return this.sim.holes[this.mySlot] || this.sim.holes[0];
  }

  sendInput(moveVec = { x: 0, z: 0 }, boost = false) {
    this.tick++;
    const inputMsg = createInputTick({
      slot: this.mySlot,
      tick: this.tick,
      inputX: moveVec.x,
      inputZ: moveVec.z,
      boost,
      senderId: this.channel ? this.channel.senderId : null,
    });
    this.channel.broadcast(inputMsg);
  }

  _handleMessage(msg) {
    if (!msg || !msg.type) return;
    // A stranger in the room must not be able to declare the match over.
    if (isHostOnlyType(msg.type) && !isFromHostSender(msg, this.hostSenderId)) return;

    switch (msg.type) {
      case MSG_TYPES.STATE_SYNC:
        this._lastSyncAt = this._timers.now(); // the host is demonstrably alive
        this._applyStateSync(msg);
        if (this.onStateSync) this.onStateSync(msg);
        break;

      case MSG_TYPES.PLAYER_LEAVE: {
        // Not host-only (see protocol.js): a departing client announces itself.
        if (!isAuthorizedLeave(msg, this.hostSenderId)) return;
        const gone = this.sim.holes[msg.slot];
        if (gone) gone.departed = true;
        if (this.onPlayerLeave) this.onPlayerLeave(msg);
        break;
      }

      case MSG_TYPES.PVP_KILL:
        this._applyPvPKill(msg);
        if (this.onPvPKill) this.onPvPKill(msg);
        break;

      case MSG_TYPES.GAME_OVER:
        if (this.over) return;
        this.over = true;
        this.endReason = msg.reason || 'TIME_EXPIRED';
        this._stopWatchdog();
        if (this.onGameOver) this.onGameOver(msg);
        break;
    }
  }

  _handlePresence(ev) {
    if (!ev || ev.event !== 'leave' || ev.senderId === null || ev.senderId === undefined) return;
    if (this.hostSenderId !== null && String(ev.senderId) === String(this.hostSenderId)) {
      this._endOnHostLoss();
    }
  }

  _checkHostSilence() {
    if (this.over) return;
    if (this._timers.now() - this._lastSyncAt < this.hostSilenceMs) return;
    this._endOnHostLoss();
  }

  /**
   * End the match on this client, with the podium built from the last standings
   * the host published. Locally authored, deliberately: there is no longer a host
   * to author it, and a player left staring at a frozen city has no way out but a
   * reload.
   */
  _endOnHostLoss() {
    if (this.over) return;
    this.over = true;
    this.hostLost = true;
    this.endReason = 'HOST_LEFT';
    this._stopWatchdog();
    const leaderboard = buildLeaderboard({
      holes: this.sim.holes,
      players: this.players,
      totalMass: this.sim.totalMass || 1,
    });
    const msg = createGameOver({
      reason: 'HOST_LEFT',
      winnerSlot: leaderboard.length > 0 ? leaderboard[0].slot : 0,
      finalLeaderboard: leaderboard,
    });
    if (this.onGameOver) this.onGameOver(msg);
  }

  _stopWatchdog() {
    if (this._watchdog !== null && this._watchdog !== undefined) {
      this._timers.clearInterval(this._watchdog);
      this._watchdog = null;
    }
  }

  _applyStateSync(syncMsg) {
    // The clock and the shared coin pool come off the wire BEFORE the roster,
    // and before the holes guard below: they are host truth regardless of what
    // the hole payload turned out to be, and they are the two numbers this
    // client is forbidden to compute for itself. The sim reconciles both
    // forward-only, so neither can be seen to run backwards (T-635, T-636).
    if (syncMsg.clockTicks !== undefined) this.sim.applyClockAuthority(syncMsg.clockTicks);
    if (syncMsg.coinsCollected !== undefined) this.sim.applyCoinAuthority(syncMsg.coinsCollected);

    if (!Array.isArray(syncMsg.holes)) return;

    for (const hState of syncMsg.holes) {
      const targetSlot = hState.slot;
      const targetHole = this.sim.holes[targetSlot];
      if (!targetHole) continue;

      // Update rival holes directly; smooth self
      if (targetSlot !== this.mySlot) {
        targetHole.x = hState.x;
        targetHole.z = hState.z;
        targetHole.radius = hState.radius;
      }
      targetHole.mass = hState.mass;
      targetHole.rawMass = hState.rawMass;
      targetHole.chain = hState.chain;
      targetHole.bestCombo = hState.bestCombo;
      targetHole.alive = hState.alive;
      if (hState.departed !== undefined) targetHole.departed = Boolean(hState.departed);
      targetHole.respawnTimer = hState.respawnTimer;
      targetHole.kills = hState.kills;
      targetHole.timesEaten = hState.timesEaten;
      if (hState.coinsCollected !== undefined) targetHole.coinsCollected = hState.coinsCollected;
      if (hState.coins !== undefined) targetHole.coins = hState.coins;
    }
  }

  _applyPvPKill(killMsg) {
    const victim = this.sim.holes[killMsg.victimSlot];
    if (victim) {
      victim.alive = false;
      victim.respawnTimer = killMsg.respawnDelaySeconds || 10.0;
      victim.timesEaten = (victim.timesEaten || 0) + 1;
    }
    const killer = this.sim.holes[killMsg.killerSlot];
    if (killer) {
      killer.kills = (killer.kills || 0) + 1;
      if (killMsg.awardMass) killer.mass += killMsg.awardMass;
    }
  }

  step(dt = 1 / 60, localMove = null) {
    if (this.over) return;
    // Step local hole
    const moves = new Array(this.sim.holes.length).fill(null);
    moves[this.mySlot] = localMove;
    this.sim.step(dt, moves);
  }

  /** Announce a deliberate exit so the room reacts now, not on a presence timeout. */
  leave(reason = 'LEFT') {
    const me = this.players[this.mySlot];
    this.channel.broadcast(createPlayerLeave({
      slot: this.mySlot,
      leaverSenderId: this.channel ? this.channel.senderId : null,
      name: me ? me.name : `Player ${this.mySlot + 1}`,
      reason,
    }));
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribePresence) this._unsubscribePresence();
    this._stopWatchdog();
  }
}
