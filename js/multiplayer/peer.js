// js/multiplayer/peer.js — Client / Peer Multiplayer Session

import { VoxelSandboxSim } from '../voxelsim.js';
import {
  MSG_TYPES,
  createInputTick,
} from './protocol.js';

export class MultiplayerPeer {
  constructor({
    channel,
    scene = 'gallery',
    matchSeed = 1,
    players = [],
    mySlot = 1,
  }) {
    this.channel = channel;
    this.scene = scene;
    this.matchSeed = matchSeed;
    this.players = players;
    this.mySlot = Number(mySlot);
    this.isHost = false;
    this.tick = 0;
    this.over = false;

    // Callbacks
    this.onPvPKill = null;
    this.onGameOver = null;
    this.onStateSync = null;

    // Spawn positions matching host formula
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

    // Client-side visual simulation
    this.sim = new VoxelSandboxSim({
      scene: this.scene,
      seed: this.matchSeed,
      mode: 'freeplay',
      holes: holeConfigs,
    });
    this.sim.localSlot = this.mySlot;

    // Subscribe to incoming messages from host
    this._unsubscribe = this.channel.onMessage((msg) => this._handleMessage(msg));
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
    });
    this.channel.broadcast(inputMsg);
  }

  _handleMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case MSG_TYPES.STATE_SYNC:
        this._applyStateSync(msg);
        if (this.onStateSync) this.onStateSync(msg);
        break;

      case MSG_TYPES.PVP_KILL:
        this._applyPvPKill(msg);
        if (this.onPvPKill) this.onPvPKill(msg);
        break;

      case MSG_TYPES.GAME_OVER:
        if (this.over) return;
        this.over = true;
        if (this.onGameOver) this.onGameOver(msg);
        break;
    }
  }

  _applyStateSync(syncMsg) {
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

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
  }
}
