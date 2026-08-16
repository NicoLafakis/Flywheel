// Power-Up catalog, mechanics and pure deterministic state updates.
// No DOM / three.js imports — pure sim boundary safe for Node validator.

import { fwHypot2, fwCos, fwSin } from './fwmath.js';

export const POWERUP_TYPES = {
  VORTEX: 'vortex',
  SPEED: 'speed',
  TITAN: 'titan',
  QUAKE: 'quake',
  FRENZY: 'frenzy',
  CHRONO: 'chrono',
};

export const POWERUP_SPECS = {
  [POWERUP_TYPES.VORTEX]: {
    id: POWERUP_TYPES.VORTEX,
    name: 'GRAVITATIONAL SINGULARITY',
    zoomParts: ['GRAVITY', 'SINGULARITY', 'OVERDRIVE!'],
    tagline: 'High-Vacuum Ingestion Core',
    desc: 'Pulls nearby loose rubble and edible structures straight into your void with massive force!',
    color: 0x00f0ff,
    glowColor: 0x0055ff,
    duration: 15.0,
    radius: 20.0,
    pullForce: 34.0,
  },
  [POWERUP_TYPES.SPEED]: {
    id: POWERUP_TYPES.SPEED,
    name: 'HYPER VELOCITY OVERDRIVE',
    zoomParts: ['HYPER', 'VELOCITY', 'OVERDRIVE!'],
    tagline: 'Maximum Thruster Torque',
    desc: '+70% movement speed with razor-sharp steering agility and instant acceleration!',
    color: 0xffb703,
    glowColor: 0xff7700,
    duration: 15.0,
    speedMultiplier: 1.7,
  },
  [POWERUP_TYPES.TITAN]: {
    id: POWERUP_TYPES.TITAN,
    name: 'COLOSSAL TITAN SURGE',
    zoomParts: ['COLOSSAL', 'TITAN', 'SURGE!'],
    tagline: 'Absolute Mass Expansion',
    desc: 'Temporarily enlarges your mouth to MAX SIZE and consumes everything in your path!',
    color: 0xd90429,
    glowColor: 0xff0055,
    duration: 15.0,
    radiusMultiplier: 10.0,
    tierBonus: 7,
  },
  [POWERUP_TYPES.QUAKE]: {
    id: POWERUP_TYPES.QUAKE,
    name: 'TECTONIC FAULT RUPTURE',
    zoomParts: ['TECTONIC', 'FAULT', 'RUPTURE!'],
    tagline: 'Seismic Foundation Cleaver',
    desc: 'Rips a massive fault fissure through the city, snapping building foundations and toppling skyscrapers!',
    color: 0xf77f00,
    glowColor: 0xff3300,
    duration: 1.0,
    blastRadius: 35.0,
  },
  [POWERUP_TYPES.FRENZY]: {
    id: POWERUP_TYPES.FRENZY,
    name: 'RESONANCE CHAIN FRENZY',
    zoomParts: ['RESONANCE', 'CHAIN', 'FRENZY!'],
    tagline: 'Infinite Combo Multiplier',
    desc: 'Combo timer frozen + uncapped infinite multiplier scaling with every ingestion!',
    color: 0xb44bff,
    glowColor: 0x7209b7,
    duration: 15.0,
    scoreMultiplier: 2.0,
  },
  [POWERUP_TYPES.CHRONO]: {
    id: POWERUP_TYPES.CHRONO,
    name: 'TEMPORAL STASIS FIELD',
    zoomParts: ['TEMPORAL', 'STASIS', 'ACTIVATED!'],
    tagline: 'Universal Clock Stasis',
    desc: 'Freezes the match clock and locks your combo meter — devour the city risk-free!',
    color: 0x38bdf8,
    glowColor: 0x0284c7,
    duration: 15.0,
    bonusTime: 15.0,
  },
};

export const ALL_POWERUP_TYPES = [
  POWERUP_TYPES.VORTEX,
  POWERUP_TYPES.SPEED,
  POWERUP_TYPES.TITAN,
  POWERUP_TYPES.QUAKE,
  POWERUP_TYPES.FRENZY,
  POWERUP_TYPES.CHRONO,
];

/**
 * Pick a deterministic random powerup type.
 * Enforces two core invariants:
 * 1. No two identical power-ups on the board at the same time.
 * 2. No identical power-up spawned back-to-back / one after another.
 */
export function pickRandomPowerUpType(rng, activePowerups = [], lastSpawnedType = null) {
  const activeTypes = new Set(
    (activePowerups || [])
      .filter((p) => !p.collected && !p.expired)
      .map((p) => p.type)
  );
  // Candidates cannot already be active on the map, nor be equal to the last spawned type
  let candidates = ALL_POWERUP_TYPES.filter(
    (t) => !activeTypes.has(t) && t !== lastSpawnedType
  );
  // Fallback 1: if all types are filtered by lastSpawnedType, relax lastSpawnedType but keep uniqueness
  if (candidates.length === 0) {
    candidates = ALL_POWERUP_TYPES.filter((t) => !activeTypes.has(t));
  }
  // Fallback 2: if all types are active, fallback to all types
  if (candidates.length === 0) {
    candidates = ALL_POWERUP_TYPES;
  }
  const index = Math.floor((rng ? rng.next() : 0) * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

export const MAX_MAP_POWERUPS = 2;
export const MIN_POWERUP_SEPARATION = 26.0;
export const MAX_ACTIVE_BUFFS = 3;

/**
 * Find a deterministic location well-spaced from existing power-ups.
 */
export function findSpacedPowerUpLocation(existingPowerups, bounds, rng, minSep = MIN_POWERUP_SEPARATION, padding = 8) {
  const minX = (bounds && bounds.minX != null) ? bounds.minX : -60;
  const maxX = (bounds && bounds.maxX != null) ? bounds.maxX : 60;
  const minZ = (bounds && bounds.minZ != null) ? bounds.minZ : -60;
  const maxZ = (bounds && bounds.maxZ != null) ? bounds.maxZ : 60;
  const active = (existingPowerups || []).filter((p) => !p.collected);

  let bestX = minX + (maxX - minX) * 0.5;
  let bestZ = minZ + (maxZ - minZ) * 0.5;
  let maxMinDist = -1;

  // Try multiple deterministic candidates
  const tries = active.length > 0 ? 16 : 1;
  for (let t = 0; t < tries; t++) {
    const rx = rng ? rng.next() : 0.5;
    const rz = rng ? rng.next() : 0.5;
    const cx = (minX + padding) + ((maxX - padding) - (minX + padding)) * rx;
    const cz = (minZ + padding) + ((maxZ - padding) - (minZ + padding)) * rz;

    if (active.length === 0) {
      return { x: cx, z: cz };
    }

    let nearestDist = Infinity;
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      const d = fwHypot2(cx - p.x, cz - p.z);
      if (d < nearestDist) nearestDist = d;
    }

    if (nearestDist >= minSep) {
      return { x: cx, z: cz };
    }

    if (nearestDist > maxMinDist) {
      maxMinDist = nearestDist;
      bestX = cx;
      bestZ = cz;
    }
  }

  return { x: bestX, z: bestZ };
}

/**
 * Create a power-up entity with dynamic wandering velocity and permanent lifespan until collected.
 */
export function createPowerUp(id, type, x, z, spawnedBy = 'map', { lifespan = Infinity, speed = 2.4, angle = 0 } = {}) {
  const spec = POWERUP_SPECS[type] || POWERUP_SPECS[POWERUP_TYPES.VORTEX];
  return {
    id,
    type: spec.id,
    spec,
    x,
    z,
    vx: fwCos(angle) * speed,
    vz: fwSin(angle) * speed,
    lifespan,
    maxLifespan: lifespan,
    wanderTimer: 0,
    spawnedBy, // 'map' | 'intermittent'
    collected: false,
    expired: false,
    radius: 1.2,
    spawnT: 0,
  };
}

/**
 * Step wandering ground power-ups and handle boundary reflections.
 * Applies dynamic mutual repulsion so active power-ups do not bunch together.
 * Ground power-ups stay on the map indefinitely until collected.
 */
export function stepGroundPowerUps(powerups, bounds, dt, rng) {
  const expiredList = [];
  const minX = (bounds && bounds.minX != null) ? bounds.minX : -60;
  const maxX = (bounds && bounds.maxX != null) ? bounds.maxX : 60;
  const minZ = (bounds && bounds.minZ != null) ? bounds.minZ : -60;
  const maxZ = (bounds && bounds.maxZ != null) ? bounds.maxZ : 60;

  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    if (pu.collected) continue;

    // Lifespan countdown (only if finite)
    if (isFinite(pu.lifespan)) {
      pu.lifespan -= dt;
      if (pu.lifespan <= 0) {
        pu.expired = true;
        pu.collected = true;
        expiredList.push(pu);
        continue;
      }
    }

    // Dynamic roaming / gentle steer
    pu.wanderTimer = (pu.wanderTimer || 0) + dt;
    if (pu.wanderTimer > 2.5) {
      pu.wanderTimer = 0;
      const steer = (rng ? (rng.next() - 0.5) : 0) * 1.6;
      const curAngle = Math.atan2(pu.vz || 0.1, pu.vx || 0.1) + steer;
      const spd = fwHypot2(pu.vx || 0, pu.vz || 0) || 2.8;
      pu.vx = fwCos(curAngle) * spd;
      pu.vz = fwSin(curAngle) * spd;
    }
  }

  // Pairwise dynamic repulsion so wandering power-ups never cluster together
  const minRepel = 18.0;
  for (let i = 0; i < powerups.length; i++) {
    const a = powerups[i];
    if (a.collected) continue;
    for (let j = i + 1; j < powerups.length; j++) {
      const b = powerups[j];
      if (b.collected) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minRepel * minRepel && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const overlap = (minRepel - dist) / minRepel;
        const push = overlap * 3.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.vx -= nx * push;
        a.vz -= nz * push;
        b.vx += nx * push;
        b.vz += nz * push;
      }
    }
  }

  for (let i = 0; i < powerups.length; i++) {
    const pu = powerups[i];
    if (pu.collected) continue;

    pu.x += pu.vx * dt;
    pu.z += pu.vz * dt;

    // Boundary bouncing to keep powerups inside playable city area
    if (pu.x < minX + 3) { pu.x = minX + 3; pu.vx = Math.abs(pu.vx); }
    else if (pu.x > maxX - 3) { pu.x = maxX - 3; pu.vx = -Math.abs(pu.vx); }
    if (pu.z < minZ + 3) { pu.z = minZ + 3; pu.vz = Math.abs(pu.vz); }
    else if (pu.z > maxZ - 3) { pu.z = maxZ - 3; pu.vz = -Math.abs(pu.vz); }
  }

  return expiredList;
}

/**
 * Collect a power-up for a hole in the sim.
 * Caps simultaneous distinct active buffs to MAX_ACTIVE_BUFFS.
 */
export function activatePowerUp(activeList, powerup, hole, sim) {
  const spec = powerup.spec;
  const durMult = (hole && hole.durationMult) ? hole.durationMult : ((sim && sim.durationMult) ? sim.durationMult : 1.0);
  const baseDuration = spec.duration * durMult;
  const existingIdx = activeList.findIndex((a) => a.type === spec.id);
  
  if (existingIdx >= 0) {
    // Refresh or extend duration
    activeList[existingIdx].remaining = Math.max(activeList[existingIdx].remaining + 4.0 * durMult, baseDuration);
    activeList[existingIdx].duration = baseDuration;
  } else {
    // Cap at MAX_ACTIVE_BUFFS
    if (activeList.length >= MAX_ACTIVE_BUFFS) {
      let minIdx = 0;
      let minRem = Infinity;
      for (let i = 0; i < activeList.length; i++) {
        if (activeList[i].remaining < minRem) {
          minRem = activeList[i].remaining;
          minIdx = i;
        }
      }
      activeList.splice(minIdx, 1);
    }

    activeList.push({
      type: spec.id,
      spec,
      remaining: baseDuration,
      duration: baseDuration,
    });
  }

  // Instant one-shot effects
  if (spec.id === POWERUP_TYPES.CHRONO && sim && typeof sim.timeLeft === 'number') {
    sim.timeLeft += spec.bonusTime * durMult;
  }

  if (spec.id === POWERUP_TYPES.FRENZY && hole) {
    hole.chainTimer = Math.max(hole.chainTimer || 0, 5.0 * durMult);
  }
}

/**
 * Update active power-ups list for a hole / sim.
 */
export function stepActivePowerUps(activeList, dt) {
  for (let i = activeList.length - 1; i >= 0; i--) {
    const act = activeList[i];
    act.remaining -= dt;
    if (act.remaining <= 0) {
      activeList.splice(i, 1);
    }
  }
}

/**
 * Check if a specific power-up type is active.
 */
export function hasActivePowerUp(activeList, type) {
  if (!activeList) return false;
  return activeList.some((a) => a.type === type && a.remaining > 0);
}

/**
 * Get remaining time of an active power-up.
 */
export function getActivePowerUpRemaining(activeList, type) {
  if (!activeList) return 0;
  const item = activeList.find((a) => a.type === type && a.remaining > 0);
  return item ? item.remaining : 0;
}
