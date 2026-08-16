// Pure simulation — no three.js imports. Runs identically in the browser and in
// the Node validator (tools/validate.mjs). Fixed timestep: step(1/60).

import { TIERS, isEdible, playerRadiusForMass, playerSpeedForRadius, GOLDEN_MULTIPLIER, PLAYER_MAX_RADIUS } from './tiers.js';
import { generateCity } from './citygen.js';
import { RNG } from './rng.js';
import {
  POWERUP_TYPES, createPowerUp, pickRandomPowerUpType, activatePowerUp,
  stepActivePowerUps, hasActivePowerUp, stepGroundPowerUps,
  MAX_MAP_POWERUPS, MIN_POWERUP_SEPARATION, findSpacedPowerUpLocation,
} from './powerups.js';

export const COMBO_WINDOW = 10.0;
export const COMBO_MAX_MULT = 3;

export function comboMultiplier(chain) {
  return Math.min(COMBO_MAX_MULT, 1 + 0.1 * Math.max(0, chain - 1));
}

function makeHole(x, z, isPlayer) {
  return {
    x, z, mass: 0, radius: playerRadiusForMass(0),
    chain: 0, chainTimer: 0, bestCombo: 0, isPlayer, eatenCount: 0,
    swallowing: [], // objects currently going down (throughput limit)
  };
}

function holeRadius(h) { return playerRadiusForMass(h.mass); }

// Throughput: the hole can only take so much at once — the rest jams at
// the rim until there's room.
const MAX_SWALLOW = 2;
const BOUNCE_SPEED = 4;

function swallowDuration(obj, hole, fastSwallow = false) {
  const base = 0.22 + Math.min(1, obj.radius / hole.radius) * 0.4;
  return fastSwallow ? base * 0.5 : base;
}

function inMouth(hole, obj, titanActive = false) {
  const dx = obj.x - hole.x, dz = obj.z - hole.z;
  const rad = titanActive ? PLAYER_MAX_RADIUS : hole.radius;
  const reach = rad + obj.radius * 0.5;
  return dx * dx + dz * dz <= reach * reach;
}

function contactAndProcess(hole, obj, sim) {
  if (obj.eaten || obj.shielded || obj.committed) return;
  const titan = hole.isPlayer && hasActivePowerUp(sim.activePowerUps, POWERUP_TYPES.TITAN);
  if (!inMouth(hole, obj, titan)) return;
  const edible = isEdible(titan ? PLAYER_MAX_RADIUS : hole.radius, titan ? 1 : obj.tier);
  if (!edible) {
    // Doesn't fit the opening: movable props bounce off the rim.
    if (obj.tier <= 4 && sim.time >= (obj.bounceCd || 0)) {
      const dx = obj.x - hole.x, dz = obj.z - hole.z;
      const len = Math.hypot(dx, dz) || 1;
      obj.vx = (dx / len) * BOUNCE_SPEED;
      obj.vz = (dz / len) * BOUNCE_SPEED;
      obj.moving = true;
      obj.bounceCd = sim.time + 0.8;
      sim.events.push({ type: 'bounce', obj, hole });
    }
    return;
  }
  // Glancing rim hit while moving fast: if player hits near the outer edge while moving fast, knock prop away!
  const dx = obj.x - hole.x, dz = obj.z - hole.z;
  const dist = Math.hypot(dx, dz);
  const holeSpeed = Math.hypot(hole.vx || 0, hole.vz || 0);
  const currentRad = titan ? PLAYER_MAX_RADIUS : hole.radius;
  if (hole.isPlayer && dist > currentRad * 0.85 && holeSpeed > 10.0 && obj.tier <= 4 && sim.time >= (obj.bounceCd || 0)) {
    const len = dist || 1;
    obj.vx = (dx / len) * (BOUNCE_SPEED * 1.5) + (hole.vx || 0) * 0.4;
    obj.vz = (dz / len) * (BOUNCE_SPEED * 1.5) + (hole.vz || 0) * 0.4;
    obj.moving = true;
    obj.bounceCd = sim.time + 0.5;
    sim.events.push({ type: 'bounce', obj, hole });
    return;
  }

  const chrono = hole.isPlayer && hasActivePowerUp(sim.activePowerUps, POWERUP_TYPES.CHRONO);
  const maxSwallow = chrono ? 4 : MAX_SWALLOW;
  if (hole.swallowing.length >= maxSwallow) return; // plugged — waits at the rim
  obj.committed = true;
  obj.enterT = 0;
  obj.enterDur = swallowDuration(obj, hole, chrono);
  hole.swallowing.push(obj);
  sim.events.push({ type: 'enter', obj, hole, dur: obj.enterDur });
}

function completeEat(hole, obj, sim) {
  obj.eaten = true;
  const prevChain = hole.chain;
  hole.chainTimer = COMBO_WINDOW;
  hole.chain += 1;
  hole.bestCombo = Math.max(hole.bestCombo, hole.chain);
  const frenzyAct = (hole.isPlayer && sim.activePowerUps) ? sim.activePowerUps.find(a => (a.type === POWERUP_TYPES.FRENZY || a.id === POWERUP_TYPES.FRENZY) && a.remaining > 0) : null;
  const isFrenzy = !!frenzyAct;
  let extraFrenzyMult = 0;
  if (isFrenzy && frenzyAct) {
    frenzyAct.blocksEaten = (frenzyAct.blocksEaten || 0) + 1;
    extraFrenzyMult = Math.floor(frenzyAct.blocksEaten / 500);
  }
  const baseMult = comboMultiplier(hole.chain);
  const currentMult = isFrenzy ? (baseMult + extraFrenzyMult) : baseMult;
  const frenzyMult = isFrenzy ? 2.0 : 1.0;
  const gained = obj.mass * (obj.golden ? GOLDEN_MULTIPLIER : 1) * currentMult * frenzyMult;
  hole.mass += gained;
  const isTitan = hole.isPlayer && hasActivePowerUp(sim.activePowerUps, POWERUP_TYPES.TITAN);
  hole.radius = isTitan ? PLAYER_MAX_RADIUS : holeRadius(hole);
  hole.eatenCount += 1;
  sim.events.push({ type: 'eat', obj, hole, gained });
  if (hole.isPlayer) {
    const prevLvl = Math.floor(prevChain / 5);
    const curLvl = Math.floor(hole.chain / 5);
    if (curLvl > prevLvl && curLvl >= 1 || isFrenzy) {
      sim.events.push({
        type: 'combo',
        level: curLvl + 1,
        mult: currentMult,
        chain: hole.chain,
        name: isFrenzy ? `x${currentMult}` : `x${currentMult.toFixed(1)}`,
        top: isFrenzy,
        hole,
      });
    }
  }
}

export class Sim {
  // level: from levels.js. options.growthBonus: shop item hook (default 0).
  constructor(level, options = {}) {
    this.level = level;
    this.city = generateCity(level);
    this.rng = new RNG(level.seed + ':sim');
    this.growthBonus = options.growthBonus || 0;
    this.speedMult = options.speedMult || 1.0;
    this.vortexMult = options.vortexMult || 1.0;
    this.durationMult = options.durationMult || 1.0;

    const s = this.city.spawn;
    this.player = makeHole(s.x, s.z, true);
    this.rivals = [];
    for (let i = 0; i < level.rivalCount; i++) {
      const angle = (i + 1) * (Math.PI * 2 / (level.rivalCount + 1));
      const r = makeHole(s.x + Math.cos(angle) * 14, s.z + Math.sin(angle) * 14, false);
      r.speedFactor = level.rivalSpeedFactor;
      r.retarget = 0;
      r.tx = r.x; r.tz = r.z;
      this.rivals.push(r);
    }

    this.time = 0;
    this.timeLeft = level.clock;
    this.tidesFired = 0;
    this.landmarkUnlocked = !level.landmark;
    this.over = false;
    this.won = false;
    this.events = [];   // drained by the renderer each frame
    this.coins = [];
    this.coinsCollected = 0;
    this._lastSpawnedPowerUpType = null;
    this.powerups = this._placePowerups();
    for (const pu of this.powerups) {
      this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'initial' });
    }
    this.activePowerUps = [];
    this.powerupRespawnTimers = [];
    this.nextScorePowerUpThreshold = 100000;
    this.nextMultPowerUpThreshold = 500;
    this._nextPowerUpId = this.powerups.length + 1;
  }

  _placePowerups() {
    const b = this.city.bounds;
    const bounds = { minX: b.xmin, maxX: b.xmax, minZ: b.zmin, maxZ: b.zmax };
    const out = [];
    const count = 2;
    for (let i = 0; i < count; i++) {
      const type = pickRandomPowerUpType(this.rng, out, this._lastSpawnedPowerUpType);
      this._lastSpawnedPowerUpType = type;
      const angle = this.rng.float(0, Math.PI * 2);
      const pos = findSpacedPowerUpLocation(out, bounds, this.rng, MIN_POWERUP_SEPARATION);
      out.push(createPowerUp(i + 1, type, pos.x, pos.z, 'map', {
        lifespan: Infinity,
        speed: 2.5 + this.rng.float(0, 0.8),
        angle,
      }));
    }
    return out;
  }

  boundsNow() { return this.city.bounds; }

  applyTide() {
    const b = this.city.bounds;
    const shrink = this.level.tideEvents ? 0.12 : 0;
    const cx = (b.xmin + b.xmax) / 2, cz = (b.zmin + b.zmax) / 2;
    const nw = (b.xmax - b.xmin) * (1 - shrink), nh = (b.zmax - b.zmin) * (1 - shrink);
    b.xmin = cx - nw / 2; b.xmax = cx + nw / 2;
    b.zmin = cz - nh / 2; b.zmax = cz + nh / 2;
    // Remove objects now outside; push holes inward.
    for (const o of this.city.objects) {
      if (o.eaten) continue;
      if (o.x < b.xmin || o.x > b.xmax || o.z < b.zmin || o.z > b.zmax) {
        o.eaten = true;
      }
    }
    for (const h of [this.player, ...this.rivals]) {
      h.x = Math.max(b.xmin + h.radius, Math.min(b.xmax - h.radius, h.x));
      h.z = Math.max(b.zmin + h.radius, Math.min(b.zmax - h.radius, h.z));
    }
    this.events.push({ type: 'tide', bounds: b });
  }

  _triggerQuake(hole) {
    const b = this.city.bounds;
    const corners = [
      { x: b.xmin, z: b.zmin },
      { x: b.xmin, z: b.zmax },
      { x: b.xmax, z: b.zmin },
      { x: b.xmax, z: b.zmax }
    ];
    let maxDistSq = -1;
    let target = null;
    for (const c of corners) {
      const cdx = c.x - hole.x;
      const cdz = c.z - hole.z;
      const distSq = cdx * cdx + cdz * cdz;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        target = c;
      }
    }

    const tdx = target.x - hole.x;
    const tdz = target.z - hole.z;
    const angle = Math.atan2(tdz, tdx);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const faultLen = Math.sqrt(maxDistSq);

    const x0 = hole.x;
    const z0 = hole.z;
    const x1 = hole.x + cosA * faultLen;
    const z1 = hole.z + sinA * faultLen;

    const crackWidth = 4.0;
    let count = 0;
    const affected = [];
    this.city.hash.query(hole.x, hole.z, faultLen, (o) => {
      if (o.eaten || o.shielded) return;
      const dx = o.x - hole.x;
      const dz = o.z - hole.z;
      const longDist = dx * cosA + dz * sinA;
      if (longDist < 0 || longDist > faultLen) return;
      
      const rawPerp = -dx * sinA + dz * cosA;
      const perpDist = Math.abs(rawPerp);
      if (perpDist <= crackWidth) {
        o.eaten = true;
        hole.mass += o.tier * 0.5;
        count++;
        affected.push({
          id: o.id,
          x: o.x,
          z: o.z,
          tier: o.tier,
          kind: o.kind,
          radius: o.radius,
          longDist,
          perpDist: rawPerp,
        });
      }
    });
    this.events.push({
      type: 'dragonball_aura',
      x: hole.x,
      z: hole.z,
      radius: hole.radius,
    });
    this.events.push({
      type: 'quake',
      x: hole.x,
      z: hole.z,
      x0, z0, x1, z1,
      angle,
      length: faultLen,
      radius: faultLen,
      hole,
      affected,
    });
  }

  _spawnBonusPowerUp(reason, p) {
    const activeGround = this.powerups.filter((pu) => !pu.collected);
    if (activeGround.length >= MAX_MAP_POWERUPS) return null;
    const b = this.city.bounds;
    const bounds = { minX: b.xmin, maxX: b.xmax, minZ: b.zmin, maxZ: b.zmax };
    const pos = findSpacedPowerUpLocation(this.powerups, bounds, this.rng, MIN_POWERUP_SEPARATION);
    const angle = this.rng.float(0, Math.PI * 2);
    const type = pickRandomPowerUpType(this.rng, this.powerups, this._lastSpawnedPowerUpType);
    this._lastSpawnedPowerUpType = type;
    const pu = createPowerUp(this._nextPowerUpId++, type, pos.x, pos.z, reason, {
      lifespan: 28.0,
      speed: 2.6 + this.rng.float(0, 0.8),
      angle,
    });
    this.powerups.push(pu);
    return pu;
  }

  // move: {x, z} normalized intent in world space for the player.
  step(dt, move) {
    if (this.over) return;
    this.time += dt;
    this.timeLeft = Math.max(0, this.level.clock - this.time);
    const b = this.city.bounds;

    // --- active powerups tick ---
    stepActivePowerUps(this.activePowerUps, dt);
    const titan = hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.TITAN);
    this.player.radius = titan ? PLAYER_MAX_RADIUS : holeRadius(this.player);

    // --- tides ---
    const tides = this.city.tides;
    if (this.tidesFired < tides.length && this.time >= tides[this.tidesFired].at) {
      this.applyTide();
      this.tidesFired += 1;
    }

    // --- landmark shield ---
    if (!this.landmarkUnlocked && this.player.mass >= this.level.landmark.unlockMass) {
      this.landmarkUnlocked = true;
      if (this.city.landmark) this.city.landmark.shielded = false;
      this.events.push({ type: 'unlocked' });
    }

    // --- player movement ---
    const p = this.player;
    const speedMultiplier = hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.SPEED) ? 1.7 : 1.0;
    const pspeed = playerSpeedForRadius(p.radius) * (this.speedMult || 1.0) * speedMultiplier;
    p.vx = 0; p.vz = 0;
    if (move && (move.x || move.z)) {
      const len = Math.hypot(move.x, move.z) || 1;
      p.vx = (move.x / len) * pspeed;
      p.vz = (move.z / len) * pspeed;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }

    // --- vortex vacuum pull ---
    if (hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.VORTEX) || (this.vortexMult && this.vortexMult > 1.0)) {
      const isBuffActive = hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.VORTEX);
      const vRadius = isBuffActive ? (18 * (this.vortexMult || 1.0)) : 10;
      this.city.hash.query(p.x, p.z, vRadius, (o) => {
        if (o.eaten || o.committed) return;
        const dx = p.x - o.x, dz = p.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5 && d < vRadius) {
          const baseForce = isBuffActive ? 16 : 6;
          const force = (1 - d / vRadius) * baseForce * (this.vortexMult || 1.0) * dt;
          o.x += (dx / d) * force;
          o.z += (dz / d) * force;
          o.moving = true;
          this.city.hash.update(o);
        }
      });
    }

    // --- ground wandering powerups and intermittent spawns ---
    const expiredList = stepGroundPowerUps(this.powerups, { minX: b.xmin, maxX: b.xmax, minZ: b.zmin, maxZ: b.zmax }, dt, this.rng);
    for (const exp of expiredList) {
      this.events.push({ type: 'powerup_despawn', powerup: exp });
    }
    this.powerups = this.powerups.filter((p) => !p.collected && !p.expired);

    // Independent 30s cooldown per consumed power-up slot (always capped at MAX_MAP_POWERUPS = 2)
    for (let i = this.powerupRespawnTimers.length - 1; i >= 0; i--) {
      this.powerupRespawnTimers[i] -= dt;
      if (this.powerupRespawnTimers[i] <= 0) {
        this.powerupRespawnTimers.splice(i, 1);
        if (this.powerups.length < MAX_MAP_POWERUPS) {
          const bounds = { minX: b.xmin, maxX: b.xmax, minZ: b.zmin, maxZ: b.zmax };
          const pos = findSpacedPowerUpLocation(this.powerups, bounds, this.rng, MIN_POWERUP_SEPARATION);
          const angle = this.rng.float(0, Math.PI * 2);
          const type = pickRandomPowerUpType(this.rng, this.powerups, this._lastSpawnedPowerUpType);
          this._lastSpawnedPowerUpType = type;
          const pu = createPowerUp(this._nextPowerUpId++, type, pos.x, pos.z, 'intermittent', {
            lifespan: Infinity,
            speed: 2.6 + this.rng.float(0, 0.8),
            angle,
          });
          this.powerups.push(pu);
          this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'intermittent' });
        }
      }
    }
    if (this.powerups.length + this.powerupRespawnTimers.length < MAX_MAP_POWERUPS) {
      this.powerupRespawnTimers.push(30.0);
    }

    // --- power-up collection ---
    const puReach = p.radius + 1.2;
    for (const pu of this.powerups) {
      if (pu.collected) continue;
      const dx = pu.x - p.x, dz = pu.z - p.z;
      if (dx * dx + dz * dz <= puReach * puReach) {
        pu.collected = true;
        this.powerupRespawnTimers.push(30.0);
        activatePowerUp(this.activePowerUps, pu, p, this);
        if (pu.type === POWERUP_TYPES.QUAKE) {
          this._triggerQuake(p);
        }
        this.events.push({ type: 'powerup_collect', powerup: pu, hole: p });
      }
    }

    // --- dynamic reward milestones: 100k points & 500 mult ---
    if (p.mass >= this.nextScorePowerUpThreshold) {
      const pu = this._spawnBonusPowerUp('score_100k', p);
      this.nextScorePowerUpThreshold += 100000;
      this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'score_100k', hole: p });
    }
    if (p.chain >= this.nextMultPowerUpThreshold) {
      const pu = this._spawnBonusPowerUp('mult_500', p);
      this.nextMultPowerUpThreshold += 500;
      this.events.push({ type: 'powerup_spawn', powerup: pu, reason: 'mult_500', hole: p });
    }

    // --- rivals: greedy nearest-edible policy, deterministic ---
    for (const r of this.rivals) {
      r.retarget -= dt;
      if (r.retarget <= 0) {
        r.retarget = 0.4;
        let best = null, bestD = Infinity;
        this.city.hash.query(r.x, r.z, 30, (o) => {
          if (o.eaten || o.shielded || !isEdible(r.radius, o.tier)) return;
          const d = (o.x - r.x) ** 2 + (o.z - r.z) ** 2;
          if (d < bestD) { bestD = d; best = o; }
        });
        if (best) { r.tx = best.x; r.tz = best.z; }
        else { r.tx = r.x + this.rng.float(-20, 20); r.tz = r.z + this.rng.float(-20, 20); }
      }
      const dx = r.tx - r.x, dz = r.tz - r.z;
      const d = Math.hypot(dx, dz);
      r.vx = 0; r.vz = 0;
      if (d > 0.1) {
        const sp = playerSpeedForRadius(r.radius) * r.speedFactor;
        r.vx = (dx / d) * sp;
        r.vz = (dz / d) * sp;
        r.x += (dx / d) * Math.min(sp * dt, d);
        r.z += (dz / d) * Math.min(sp * dt, d);
      }
    }

    // --- clamp all holes to bounds ---
    for (const h of [p, ...this.rivals]) {
      h.x = Math.min(b.xmax - h.radius * 0.4, Math.max(b.xmin + h.radius * 0.4, h.x));
      h.z = Math.min(b.zmax - h.radius * 0.4, Math.max(b.zmin + h.radius * 0.4, h.z));
    }

    // --- bounced-object motion ---
    const ob = this.city.bounds;
    for (const o of this.city.objects) {
      if (!o.moving) continue;
      o.x += o.vx * dt;
      o.z += o.vz * dt;
      o.vx *= 1 - 6 * dt;
      o.vz *= 1 - 6 * dt;
      o.x = Math.min(ob.xmax - o.radius, Math.max(ob.xmin + o.radius, o.x));
      o.z = Math.min(ob.zmax - o.radius, Math.max(ob.zmin + o.radius, o.z));
      this.city.hash.update(o);
      if (Math.hypot(o.vx, o.vz) < 0.2) { o.moving = false; o.vx = 0; o.vz = 0; }
    }

    // --- combo decay ---
    for (const h of [p, ...this.rivals]) {
      if (h.isPlayer && hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.FRENZY)) {
        if (h.chain > 0) h.chainTimer = COMBO_WINDOW;
      } else if (h.chainTimer > 0) {
        h.chainTimer -= dt;
        if (h.chainTimer <= 0) h.chain = 0;
      }
    }

    // --- eating: fit checks, bounces, swallow queues ---
    const eatAround = (hole) => {
      const titan = hole.isPlayer && hasActivePowerUp(this.activePowerUps, POWERUP_TYPES.TITAN);
      const searchR = (titan ? PLAYER_MAX_RADIUS : hole.radius) + 3;
      this.city.hash.query(hole.x, hole.z, searchR, (o) => {
        contactAndProcess(hole, o, this);
      });
    };
    eatAround(p);
    for (const r of this.rivals) eatAround(r);

    // --- swallow progress & ejection check ---
    for (const h of [p, ...this.rivals]) {
      const hSpeed = Math.hypot(h.vx || 0, h.vz || 0);
      for (let i = h.swallowing.length - 1; i >= 0; i--) {
        const o = h.swallowing[i];
        o.enterT += dt;
        // Mid-swallow ejection: if player moves too fast or changes direction abruptly,
        // objects still near the rim might slip out!
        const distFromCenter = Math.hypot(o.x - h.x, o.z - h.z);
        if (h.isPlayer && o.enterT < o.enterDur * 0.5 && distFromCenter > h.radius * 0.85 && hSpeed > 10.0 && o.tier <= 4) {
          h.swallowing.splice(i, 1);
          o.committed = false;
          const dx = o.x - h.x, dz = o.z - h.z;
          const len = Math.hypot(dx, dz) || 1;
          o.vx = (dx / len) * (BOUNCE_SPEED * 1.8) + (h.vx || 0) * 0.5;
          o.vz = (dz / len) * (BOUNCE_SPEED * 1.8) + (h.vz || 0) * 0.5;
          o.moving = true;
          o.bounceCd = this.time + 0.6;
          this.events.push({ type: 'eject', obj: o, hole: h });
          continue;
        }
        if (o.enterT >= o.enterDur) {
          h.swallowing.splice(i, 1);
          completeEat(h, o, this);
        }
      }
    }

    // --- win / fail ---
    if (p.mass >= this.level.target) {
      this.over = true; this.won = true;
      this.events.push({ type: 'win' });
    } else if (this.timeLeft <= 0) {
      this.over = true; this.won = false;
      this.events.push({ type: 'fail' });
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
