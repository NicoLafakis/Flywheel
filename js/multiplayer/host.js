// js/multiplayer/host.js — Authoritative Multiplayer Host Session

import { VoxelSandboxSim } from '../voxelsim.js';
import { HOST_HEARTBEAT_MS } from './config.js';
import {
  MSG_TYPES,
  createGameOver,
  createPlayerLeave,
  createPvPKill,
  createStateSync,
  isAuthorizedLeave,
} from './protocol.js';
import { buildHoleConfigs, buildLeaderboard, slotOfSender } from './roster.js';

// Injectable so the heartbeat can be driven deterministically in a test. `unref`
// keeps a pending Flywheel timer from holding a Node test process open; it does
// not exist in a browser, hence the guard.
const DEFAULT_TIMERS = Object.freeze({
  now: () => Date.now(),
  setInterval: (fn, ms) => {
    const h = setInterval(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  },
  clearInterval: (h) => clearInterval(h),
});

export class MultiplayerHost {
  constructor({
    channel,
    scene = 'gallery',
    matchSeed = 1,
    players = [],
    durationSeconds = 180,
    timers = null,
  }) {
    this._timers = timers || DEFAULT_TIMERS;
    this.channel = channel;
    this.scene = scene;
    this.matchSeed = matchSeed;
    // SLOT-INDEXED, gaps and all (see roster.js). A compacted roster is what put
    // a slot-3 player at array index 2 and had that peer steering the host's hole.
    this.players = Array.isArray(players) ? players.slice() : [];
    this.durationSeconds = durationSeconds;
    this.isHost = true;
    this.tick = 0;
    this.over = false;

    // Buffer for remote peer inputs [slot] -> { x, z, boost, tick }
    this.pendingInputs = new Array(this.players.length).fill(null);

    // Fired when a player disappears mid-match, so the UI can say so.
    this.onPlayerLeave = null;

    // senderId -> slot. Built from the roster the lobby handed us (each entry
    // carries the senderId that claimed the slot at join time), so an INPUT_TICK
    // can only steer the hole its sender actually owns. When no roster entry
    // carries an identity at all (local/dev sessions) there is nothing to bind
    // against and inputs are accepted by slot as before.
    this._slotBySender = new Map();
    for (const p of this.players) {
      if (p && p.senderId !== null && p.senderId !== undefined && Number.isInteger(p.slot)) {
        this._slotBySender.set(String(p.senderId), p.slot);
      }
    }
    this._enforceSenderBinding = this._slotBySender.size > 0;

    // Spawn positions come from the SLOT, via the same helper the peer uses, so
    // the two clients cannot disagree about where a hole started.
    const holeConfigs = buildHoleConfigs(this.players);

    // Instantiate authoritative simulation.
    // `clockLimitTicks` is what keeps the HUD honest: freeplay's own clock is
    // 300 s, so without it the player watched a 5:00 clock in a 3:00 match and
    // the match ended reading 2:00 remaining. It is NOT expressed as
    // `mode: 'challenge3m'` — that mode doubles every coin payout.
    this.sim = new VoxelSandboxSim({
      scene: this.scene,
      seed: this.matchSeed,
      mode: 'freeplay',
      clockLimitTicks: Math.round(this.durationSeconds * 60),
      // This sim IS the authority — it owns the clock and the coin pool, and
      // publishes both in every STATE_SYNC. `multiplayer` only tells the HUD it
      // is in a match; no physics branches on it.
      multiplayer: true,
      holes: holeConfigs,
    });
    this.sim.localSlot = 0;

    // Hook PvP kill event forwarding
    this.sim.onPvPKill = (ev) => {
      this.channel.broadcast(createPvPKill({
        killerSlot: ev.killerSlot,
        victimSlot: ev.victimSlot,
        awardMass: ev.awardMass,
        respawnDelaySeconds: ev.respawnDelaySeconds,
      }));
    };

    // Subscribe to channel
    this._unsubscribe = this.channel.onMessage((msg) => this._handleMessage(msg));
    // ...and to who is still here. Without this the host kept a departed
    // player's LAST input in `pendingInputs[slot]` forever, so their hole coasted
    // in the final steered direction until it hit the boundary clamp and sat there.
    this._unsubscribePresence = typeof this.channel.onPresenceChange === 'function'
      ? this.channel.onPresenceChange((ev) => this._handlePresence(ev))
      : null;

    // HEARTBEAT. STATE_SYNC normally rides the render loop, and the render loop
    // is cancelled outright while the tab is hidden — so a host that merely
    // glanced at another tab would go silent and every peer's host-silence
    // watchdog would end the match. A timer keeps proving the host is there
    // even when nothing is being drawn.
    this._lastSyncAt = this._timers.now();
    this._heartbeat = this._timers.setInterval(() => this._beat(), HOST_HEARTBEAT_MS);
  }

  _beat() {
    if (this.over) return;
    if (this._timers.now() - this._lastSyncAt < HOST_HEARTBEAT_MS) return;
    this.sendStateSync();
  }

  _stopHeartbeat() {
    if (this._heartbeat !== null && this._heartbeat !== undefined) {
      this._timers.clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
  }

  _handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === MSG_TYPES.INPUT_TICK) {
      const slot = msg.slot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= this.pendingInputs.length) return;
      if (!this._ownsSlot(msg.senderId, slot)) return;
      const hole = this.sim.holes[slot];
      if (hole && hole.departed) return; // a late packet must not reanimate them
      this.pendingInputs[slot] = { x: msg.inputX, z: msg.inputZ, boost: msg.boost };
      return;
    }
    if (msg.type === MSG_TYPES.PLAYER_LEAVE) {
      // A client's own graceful exit lands here before presence notices.
      if (!isAuthorizedLeave(msg, this.channel ? this.channel.senderId : null)) return;
      this.markSlotDeparted(msg.slot, msg.reason || 'LEFT');
    }
  }

  _handlePresence(ev) {
    if (!ev || ev.event !== 'leave') return;
    const slot = slotOfSender(this.players, ev.senderId);
    if (slot < 0) return;
    this.markSlotDeparted(slot, 'DISCONNECTED');
  }

  /**
   * Take a slot out of the live match without erasing what its player earned.
   * Idempotent: presence and an explicit PLAYER_LEAVE routinely both fire.
   */
  markSlotDeparted(slot, reason = 'DISCONNECTED') {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.sim.holes.length) return;
    const hole = this.sim.holes[slot];
    if (!hole || hole.departed) return;
    const info = this.players[slot] || {};

    hole.departed = true;
    // `alive` is left exactly as it was: it means "eaten in PvP", and the
    // podium's `timesEaten` reads from that history.
    this.pendingInputs[slot] = null;
    // Keep the roster entry — the podium still owes them their final stats — but
    // record that they walked out.
    if (this.players[slot]) this.players[slot] = { ...this.players[slot], left: true, leaveReason: reason };

    this.channel.broadcast(createPlayerLeave({
      slot,
      leaverSenderId: info.senderId,
      name: info.name || hole.name,
      reason,
    }));
    if (this.onPlayerLeave) this.onPlayerLeave({ slot, name: info.name || hole.name, reason });
  }

  /** The in-match scoreboard: everyone still playing, ranked. */
  liveStandings() {
    return buildLeaderboard({
      holes: this.sim.holes,
      players: this.players,
      totalMass: this.sim.totalMass || 1,
      includeDeparted: false,
    });
  }

  _ownsSlot(senderId, slot) {
    if (!this._enforceSenderBinding) return true;
    if (senderId === null || senderId === undefined) return false;
    return this._slotBySender.get(String(senderId)) === slot;
  }

  step(dt = 1 / 60, hostLocalMove = null) {
    if (this.over) return;
    this.tick++;

    // Assemble input array for all holes
    const moves = this.players.map((p, idx) => {
      if (!p) return null;
      if (idx === 0) return hostLocalMove || this.pendingInputs[0];
      return this.pendingInputs[idx];
    });

    this.sim.step(dt, moves);

    // Check game over conditions:
    // 1. Time expired — the host tick budget, or the sim's own clock, which now
    //    runs to the same tick and raises `timedOut`.
    // 2. All edible city blocks eaten.
    // 3. Goal reached (sim.won, or `over` for any reason that is NOT the clock).
    //
    // `over` alone cannot tell a cleared city from an expired clock, and reading
    // it that way would report every ordinary timeout to the podium as
    // "METROPOLIS 100% DEMOLISHED". `timedOut` is the discriminator.
    const clockExpired = this.tick >= this.durationSeconds * 60 || Boolean(this.sim.timedOut);
    const allBlocksEaten = this.sim.blocks && this.sim.blocks.length > 0 && this.sim.blocks.every((b) => b.state === 'consumed');
    const cityCleared = allBlocksEaten || Boolean(this.sim.won) || Boolean(this.sim.over && !this.sim.timedOut);

    if ((clockExpired || cityCleared) && !this.over) {
      this.finishMatch(cityCleared ? 'CITY_CLEARED' : 'TIME_EXPIRED');
    }
  }

  sendStateSync() {
    if (this.over) return;
    const holeStates = this.sim.holes.map((h) => ({
      slot: h.slot !== undefined ? h.slot : h.index,
      x: h.x,
      z: h.z,
      radius: h.radius,
      mass: h.mass,
      rawMass: h.rawMass,
      score: Math.round(h.mass),
      chain: h.chain,
      bestCombo: h.bestCombo,
      alive: h.alive,
      // On the wire so a peer draws a departed rival as gone rather than as a
      // hole frozen mid-turn.
      departed: Boolean(h.departed),
      respawnTimer: h.respawnTimer,
      kills: h.kills || 0,
      timesEaten: h.timesEaten || 0,
      coins: h.coins || 0,
      coinsCollected: h.coinsCollected || 0,
    }));

    const syncMsg = createStateSync({
      tick: this.tick,
      // The two numbers a peer must not compute for itself: the match clock and
      // the shared coin pool. `sim.clockTicks`, not `this.tick` — chrono-freeze
      // stops the clock while the session keeps stepping.
      clockTicks: this.sim.clockTicks,
      coinsCollected: this.sim.coinsCollected,
      holes: holeStates,
    });
    this._lastSyncAt = this._timers.now();
    this.channel.broadcast(syncMsg);
  }

  finishMatch(reason = 'TIME_EXPIRED') {
    if (this.over) return;
    this.over = true;
    this._stopHeartbeat();
    // Departed players KEEP their row: they played for those stats. A slot that
    // was never filled contributes nothing — a phantom "Player 3" on the podium
    // is worse than a short list.
    const leaderboard = buildLeaderboard({
      holes: this.sim.holes,
      players: this.players,
      totalMass: this.sim.totalMass || 1,
    });

    const winnerSlot = leaderboard.length > 0 ? leaderboard[0].slot : 0;
    const gameOverMsg = createGameOver({
      reason,
      winnerSlot,
      finalLeaderboard: leaderboard,
    });

    this.channel.broadcast(gameOverMsg);
    if (this.onGameOver) this.onGameOver(gameOverMsg);
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribePresence) this._unsubscribePresence();
    this._stopHeartbeat();
  }
}
