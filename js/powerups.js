// Power-Up catalog, mechanics and pure deterministic state updates.
// No DOM / three.js imports — pure sim boundary safe for Node validator.

import { fwHypot2 } from './fwmath.js';

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
    name: 'VORTEX VACUUM',
    icon: '🌀',
    tagline: 'Gravitational Suction',
    desc: 'Pulls nearby loose rubble and edible objects straight into your mouth!',
    color: 0x00d2ff,
    glowColor: 0x0055ff,
    duration: 10.0,
    radius: 18.0,
    pullForce: 32.0,
  },
  [POWERUP_TYPES.SPEED]: {
    id: POWERUP_TYPES.SPEED,
    name: 'TURBO OVERDRIVE',
    icon: '⚡',
    tagline: 'Hyper Speed Boost',
    desc: '+70% movement speed and instant steering agility!',
    color: 0xffb703,
    glowColor: 0xff7700,
    duration: 10.0,
    speedMultiplier: 1.7,
  },
  [POWERUP_TYPES.TITAN]: {
    id: POWERUP_TYPES.TITAN,
    name: 'TITAN SURGE',
    icon: '⭐',
    tagline: 'Super Size Expansion',
    desc: 'Temporarily enlarges your mouth and unlocks higher tier buildings!',
    color: 0xd90429,
    glowColor: 0xff0055,
    duration: 8.0,
    radiusMultiplier: 1.5,
    tierBonus: 2,
  },
  [POWERUP_TYPES.QUAKE]: {
    id: POWERUP_TYPES.QUAKE,
    name: 'SEISMIC QUAKE',
    icon: '💥',
    tagline: 'Shockwave Demolition',
    desc: 'Instant seismic blast shatters nearby structures into bite-sized rubble!',
    color: 0xf77f00,
    glowColor: 0xff3300,
    duration: 0.5,
    blastRadius: 24.0,
  },
  [POWERUP_TYPES.FRENZY]: {
    id: POWERUP_TYPES.FRENZY,
    name: 'CHAIN FRENZY',
    icon: '✨',
    tagline: 'Infinite Combo Aura',
    desc: 'Combo timer frozen + 2x score points on all consumed objects!',
    color: 0x7209b7,
    glowColor: 0xb5179e,
    duration: 12.0,
    scoreMultiplier: 2.0,
  },
  [POWERUP_TYPES.CHRONO]: {
    id: POWERUP_TYPES.CHRONO,
    name: 'CHRONO BURST',
    icon: '⏱️',
    tagline: 'Time Warp & Fast Chew',
    desc: '+15s clock bonus and double swallowing throughput speed!',
    color: 0x4cc9f0,
    glowColor: 0x4361ee,
    duration: 10.0,
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
 */
export function pickRandomPowerUpType(rng) {
  const index = Math.floor((rng ? rng.next() : 0) * ALL_POWERUP_TYPES.length);
  return ALL_POWERUP_TYPES[Math.min(index, ALL_POWERUP_TYPES.length - 1)];
}

/**
 * Create a power-up entity.
 */
export function createPowerUp(id, type, x, z, spawnedBy = 'map') {
  const spec = POWERUP_SPECS[type] || POWERUP_SPECS[POWERUP_TYPES.VORTEX];
  return {
    id,
    type: spec.id,
    spec,
    x,
    z,
    spawnedBy, // 'map' | 'score_100k' | 'mult_500'
    collected: false,
    radius: 1.2,
    spawnT: 0,
  };
}

/**
 * Collect a power-up for a hole in the sim.
 */
export function activatePowerUp(activeList, powerup, hole, sim) {
  const spec = powerup.spec;
  const existingIdx = activeList.findIndex((a) => a.type === spec.id);
  
  if (existingIdx >= 0) {
    // Refresh or extend duration
    activeList[existingIdx].remaining = Math.max(activeList[existingIdx].remaining + 4.0, spec.duration);
    activeList[existingIdx].duration = spec.duration;
  } else {
    activeList.push({
      type: spec.id,
      spec,
      remaining: spec.duration,
      duration: spec.duration,
    });
  }

  // Instant one-shot effects
  if (spec.id === POWERUP_TYPES.CHRONO && sim && typeof sim.timeLeft === 'number') {
    sim.timeLeft += spec.bonusTime;
  }

  if (spec.id === POWERUP_TYPES.FRENZY && hole) {
    hole.chainTimer = Math.max(hole.chainTimer || 0, 5.0);
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
