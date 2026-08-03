// Pure simulation — no three.js imports. Runs identically in the browser and in
// the Node validator (tools/validate.mjs). Fixed timestep: step(1/60).

import { TIERS, isEdible, playerRadiusForMass, playerSpeedForRadius, GOLDEN_MULTIPLIER } from './tiers.js';
import { generateCity } from './citygen.js';
import { RNG } from './rng.js';

export const COMBO_WINDOW = 1.5;
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

function swallowDuration(obj, hole) {
  return 0.22 + Math.min(1, obj.radius / hole.radius) * 0.4;
}

function inMouth(hole, obj) {
  const dx = obj.x - hole.x, dz = obj.z - hole.z;
  const reach = hole.radius + obj.radius * 0.5;
  return dx * dx + dz * dz <= reach * reach;
}

function contactAndProcess(hole, obj, sim) {
  if (obj.eaten || obj.shielded || obj.committed) return;
  if (!inMouth(hole, obj)) return;
  if (!isEdible(hole.radius, obj.tier)) {
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
  if (hole.isPlayer && dist > hole.radius * 0.85 && holeSpeed > 10.0 && obj.tier <= 4 && sim.time >= (obj.bounceCd || 0)) {
    const len = dist || 1;
    obj.vx = (dx / len) * (BOUNCE_SPEED * 1.5) + (hole.vx || 0) * 0.4;
    obj.vz = (dz / len) * (BOUNCE_SPEED * 1.5) + (hole.vz || 0) * 0.4;
    obj.moving = true;
    obj.bounceCd = sim.time + 0.5;
    sim.events.push({ type: 'bounce', obj, hole });
    return;
  }

  if (hole.swallowing.length >= MAX_SWALLOW) return; // plugged — waits at the rim
  obj.committed = true;
  obj.enterT = 0;
  obj.enterDur = swallowDuration(obj, hole);
  hole.swallowing.push(obj);
  sim.events.push({ type: 'enter', obj, hole, dur: obj.enterDur });
}

function completeEat(hole, obj, sim) {
  obj.eaten = true;
  hole.chainTimer = COMBO_WINDOW;
  hole.chain += 1;
  hole.bestCombo = Math.max(hole.bestCombo, hole.chain);
  const gained = obj.mass * (obj.golden ? GOLDEN_MULTIPLIER : 1) * comboMultiplier(hole.chain);
  hole.mass += gained;
  hole.radius = holeRadius(hole);
  hole.eatenCount += 1;
  sim.events.push({ type: 'eat', obj, hole, gained });
}

export class Sim {
  // level: from levels.js. options.growthBonus: shop item hook (default 0).
  constructor(level, options = {}) {
    this.level = level;
    this.city = generateCity(level);
    this.rng = new RNG(level.seed + ':sim');
    this.growthBonus = options.growthBonus || 0;

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
      if (!o.eaten && (o.x < b.xmin || o.x > b.xmax || o.z < b.zmin || o.z > b.zmax)) {
        o.eaten = true; // swallowed by the sea; no mass
        this.events.push({ type: 'flooded', obj: o });
      }
    }
    for (const h of [this.player, ...this.rivals]) {
      h.x = Math.min(b.xmax - h.radius, Math.max(b.xmin + h.radius, h.x));
      h.z = Math.min(b.zmax - h.radius, Math.max(b.zmin + h.radius, h.z));
    }
    this.events.push({ type: 'tide', bounds: { ...b } });
  }

  // move: {x, z} normalized intent in world space for the player.
  step(dt, move) {
    if (this.over) return;
    this.time += dt;
    this.timeLeft = Math.max(0, this.level.clock - this.time);

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
    const pspeed = playerSpeedForRadius(p.radius) * (1 + this.growthBonus * 0) ;
    p.vx = 0; p.vz = 0;
    if (move && (move.x || move.z)) {
      const len = Math.hypot(move.x, move.z) || 1;
      p.vx = (move.x / len) * pspeed;
      p.vz = (move.z / len) * pspeed;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
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
    const b = this.city.bounds;
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
      if (h.chainTimer > 0) {
        h.chainTimer -= dt;
        if (h.chainTimer <= 0) h.chain = 0;
      }
    }

    // --- eating: fit checks, bounces, swallow queues ---
    const eatAround = (hole) => {
      this.city.hash.query(hole.x, hole.z, hole.radius + 3, (o) => {
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
