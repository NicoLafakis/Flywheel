// js/multiplayer/host.js — Authoritative Multiplayer Host Session

import { VoxelSandboxSim } from '../voxelsim.js';
import {
  MSG_TYPES,
  createGameOver,
  createPvPKill,
  createStateSync,
} from './protocol.js';

export class MultiplayerHost {
  constructor({
    channel,
    scene = 'gallery',
    matchSeed = 1,
    players = [],
    durationSeconds = 180,
  }) {
    this.channel = channel;
    this.scene = scene;
    this.matchSeed = matchSeed;
    this.players = players;
    this.durationSeconds = durationSeconds;
    this.isHost = true;
    this.tick = 0;
    this.over = false;

    // Buffer for remote peer inputs [slot] -> { x, z, boost, tick }
    this.pendingInputs = new Array(players.length).fill(null);

    // Compute circular spawn positions around perimeter
    const spawnRadius = 25.0;
    const holeConfigs = players.map((p, idx) => {
      const angle = idx * (6.283185 / Math.max(1, players.length));
      return {
        slot: p ? p.slot : idx,
        name: p ? p.name : `Player ${idx + 1}`,
        skin: p ? p.skin : 'default',
        color: p ? p.color : '#ffffff',
        x: Math.cos(angle) * spawnRadius,
        z: Math.sin(angle) * spawnRadius,
      };
    });

    // Instantiate authoritative simulation
    this.sim = new VoxelSandboxSim({
      scene: this.scene,
      seed: this.matchSeed,
      mode: 'freeplay',
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
  }

  _handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === MSG_TYPES.INPUT_TICK) {
      const slot = msg.slot;
      if (slot >= 0 && slot < this.pendingInputs.length) {
        this.pendingInputs[slot] = { x: msg.inputX, z: msg.inputZ, boost: msg.boost };
      }
    }
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
    // 1. Time expired (180s = 10800 ticks at 60Hz)
    // 2. All edible city blocks eaten
    const timeExpired = this.tick >= this.durationSeconds * 60;
    const allBlocksEaten = this.sim.blocks && this.sim.blocks.length > 0 && this.sim.blocks.every((b) => b.state === 'consumed');

    if ((timeExpired || allBlocksEaten) && !this.over) {
      this.over = true;
      this.finishMatch(timeExpired ? 'TIME_EXPIRED' : 'CITY_CLEARED');
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
      respawnTimer: h.respawnTimer,
      kills: h.kills || 0,
      timesEaten: h.timesEaten || 0,
      coins: h.coins || 0,
      coinsCollected: h.coinsCollected || 0,
    }));

    const syncMsg = createStateSync({
      tick: this.tick,
      holes: holeStates,
    });
    this.channel.broadcast(syncMsg);
  }

  finishMatch(reason = 'TIME_EXPIRED') {
    const totalMapMass = this.sim.totalMass || 1;
    // Rank players by total eaten mass / score descending
    const leaderboard = this.sim.holes
      .map((h, i) => {
        const rawMass = h.rawMass || 0;
        const pct = Math.max(0, Math.min(100, Math.round((rawMass / totalMapMass) * 100)));
        const pInfo = this.players.find((p) => p.slot === (h.slot ?? i)) || this.players[i] || {};
        return {
          slot: h.slot !== undefined ? h.slot : i,
          name: pInfo.name || h.name || `Player ${i + 1}`,
          score: Math.round(h.mass || 0),
          mass: Math.round(rawMass),
          percentCleared: pct,
          bestChain: h.bestCombo || 0,
          kills: h.kills || 0,
          timesEaten: h.timesEaten || 0,
          coins: h.coins || 0,
          coinsCollected: h.coinsCollected || 0,
          color: pInfo.color || h.color,
          skin: pInfo.skin || h.skin,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((p, rankIdx) => ({ ...p, rank: rankIdx + 1 }));

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
  }
}
