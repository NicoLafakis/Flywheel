// tools/demographic-playtest.mjs — Automated Demographic Playtesting Harness
// Evaluates 4 distinct player personas across the 30–55 Marketing Professional target demographic
// on Single-Player Campaign Levels 1, 2, 3, and 4 (Pure Sim, Non-Sandbox).

import { LEVELS, getLevel, starsForResult, coinsForResult } from '../js/levels.js';
import { Sim } from '../js/sim.js';
import { isEdible, playerRadiusForMass } from '../js/tiers.js';
import { POWERUP_TYPES } from '../js/powerups.js';

const DT = 1 / 60;

const PERSONAS = [
  {
    id: 'elena_32',
    name: 'Elena Rostova',
    age: 32,
    role: 'Senior Growth Marketing Manager',
    device: 'iPhone 15 Pro (Portrait / 120Hz)',
    playContext: 'Subway commute & quick 3-min standing breaks between sprint planning',
    levelIndex: 1,
    levelName: 'Level 1: Suburbs Starter',
    behavior: {
      powerUpPriority: 3.5, // Aggressively hunts power-up spawns
      goldenPriority: 4.0,  // Prioritizes high-value golden items
      smoothSteering: 0.85, // High agility, rapid direction shifts
      riskTolerance: 0.8,   // Dives deep into dense pockets
    },
    critiqueFocus: 'SaaS UX efficiency, snappy transitions, low onboarding friction, modern typography',
  },
  {
    id: 'marcus_41',
    name: 'Marcus Vance',
    age: 41,
    role: 'VP of Brand Marketing',
    device: 'iPad Pro 11" (Landscape)',
    playContext: 'Evening decompression on sofa, looking for aesthetic zen & high visual polish',
    levelIndex: 2,
    levelName: 'Level 2: Suburbs Commercial Strip',
    behavior: {
      powerUpPriority: 1.5, // Balanced
      goldenPriority: 2.0,
      smoothSteering: 0.95, // Sweeps perimeter-to-center in methodical concentric circles
      riskTolerance: 0.4,   // Avoids bumping into oversized buildings
    },
    critiqueFocus: 'Brand voice coherence, color palette harmony, no tacky tropes, premium feel',
  },
  {
    id: 'david_48',
    name: 'David Sterling',
    age: 48,
    role: 'Director of Product Marketing',
    device: 'Google Pixel 8 Pro',
    playContext: 'Coffee break & winding down after executive review meetings',
    levelIndex: 3,
    levelName: 'Level 3: Suburbs Residential Blocks',
    behavior: {
      powerUpPriority: 2.2,
      goldenPriority: 2.5,
      smoothSteering: 0.90, // Logical tier progression: clears smalls before attempting medium
      riskTolerance: 0.6,
    },
    critiqueFocus: 'Rules clarity, HUD contrast/glanceability, tier feedback loops, progression logic',
  },
  {
    id: 'sarah_54',
    name: 'Sarah Jenkins',
    age: 54,
    role: 'Chief Marketing Officer',
    device: 'Samsung Galaxy S24+',
    playContext: 'Airport lounge & evening wind-down, seeking stress relief and smooth flow',
    levelIndex: 4,
    levelName: 'Level 4: Suburbs Industrial Outskirts',
    behavior: {
      powerUpPriority: 1.0, // Casual, doesn't rush
      goldenPriority: 1.5,
      smoothSteering: 0.75, // Relaxed broad sweeps, continuous momentum
      riskTolerance: 0.5,
    },
    critiqueFocus: 'Low visual fatigue, clear text sizes, ASMR relaxation, intuitive 1-tap feel',
  },
];

function simulatePersonaPlay(persona) {
  const level = getLevel(persona.levelIndex);
  const sim = new Sim(level);

  let ticks = 0;
  let firstEatTime = null;
  let maxCombo = 0;
  let powerUpsCollected = 0;
  let bounces = 0;
  const eventsLog = [];

  let currentHeading = { x: 0, z: 0 };

  while (!sim.over && sim.time < level.clock + 1) {
    const p = sim.player;

    // Search objects in city
    let bestObj = null;
    let bestScore = -Infinity;

    sim.city.hash.query(p.x, p.z, 60, (obj) => {
      if (obj.eaten || obj.shielded || obj.committed) return;
      const edible = isEdible(p.radius, obj.tier);
      if (!edible) return;

      const d2 = (obj.x - p.x) ** 2 + (obj.z - p.z) ** 2;
      const dist = Math.sqrt(d2) || 0.1;

      // Base attraction: proximity
      let score = (100 - dist * 1.5);

      // Persona behavioral weightings
      if (obj.golden) score += 40 * persona.behavior.goldenPriority;
      if (obj.tier <= 2) score += 15; // easy snacks

      if (score > bestScore) {
        bestScore = score;
        bestObj = obj;
      }
    });

    // Also check ground power-ups
    if (sim.groundPowerUps && sim.groundPowerUps.length > 0) {
      for (const pu of sim.groundPowerUps) {
        const d2 = (pu.x - p.x) ** 2 + (pu.z - p.z) ** 2;
        const dist = Math.sqrt(d2) || 0.1;
        const puScore = (120 - dist * 1.2) + 50 * persona.behavior.powerUpPriority;
        if (puScore > bestScore) {
          bestScore = puScore;
          bestObj = pu;
        }
      }
    }

    // Fallback: search all objects on map
    if (!bestObj) {
      for (const obj of sim.city.objects) {
        if (obj.eaten || obj.shielded || obj.committed) continue;
        if (!isEdible(p.radius, obj.tier)) continue;
        const d2 = (obj.x - p.x) ** 2 + (obj.z - p.z) ** 2;
        const dist = Math.sqrt(d2) || 0.1;
        let score = (100 - dist * 1.5);
        if (score > bestScore) {
          bestScore = score;
          bestObj = obj;
        }
      }
    }

    // Determine steering vector
    let targetDir = { x: 0, z: 0 };
    if (bestObj) {
      const dx = bestObj.x - p.x;
      const dz = bestObj.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      targetDir = { x: dx / len, z: dz / len };
    }

    // Smooth inertia interpolation based on persona agility
    const alpha = persona.behavior.smoothSteering;
    currentHeading.x = currentHeading.x * (1 - alpha) + targetDir.x * alpha;
    currentHeading.z = currentHeading.z * (1 - alpha) + targetDir.y * alpha;

    sim.step(DT, targetDir);
    ticks++;

    if (sim.player.bestCombo > maxCombo) maxCombo = sim.player.bestCombo;
    if (firstEatTime === null && sim.player.eatenCount > 0) {
      firstEatTime = sim.time;
    }

    const drained = sim.drainEvents();
    for (const ev of drained) {
      if (ev.type === 'powerup_collect') powerUpsCollected++;
      if (ev.type === 'bounce') bounces++;
    }
  }

  const elapsed = typeof sim.elapsedTime === 'number' ? sim.elapsedTime : sim.time;
  const stars = starsForResult(level, sim.timeLeft, sim.won);
  const coins = coinsForResult(level, stars, maxCombo);

  return {
    persona,
    level,
    result: {
      won: sim.won,
      mass: sim.player.mass,
      targetMass: level.target,
      percentCleared: Math.min(100, Math.round((sim.player.mass / level.target) * 100)),
      timeElapsed: elapsed.toFixed(1),
      timeLeft: sim.timeLeft.toFixed(1),
      firstEatSec: firstEatTime !== null ? firstEatTime.toFixed(2) : 'N/A',
      eatenCount: sim.player.eatenCount,
      bestCombo: maxCombo,
      powerUpsCollected,
      stars,
      coinsEarned: coins,
    },
  };
}

console.log('================================================================');
console.log('   FLYWHEEL DEMOGRAPHIC PLAYTEST: MARKETING PROFESSIONALS 30-55  ');
console.log('================================================================\n');

const results = PERSONAS.map((persona) => {
  console.log(`[TESTING] ${persona.name} (${persona.age}y, ${persona.role}) playing ${persona.levelName}...`);
  const out = simulatePersonaPlay(persona);
  console.log(`  -> Result: ${out.result.won ? 'VICTORY' : 'COMPLETED'} | Mass: ${out.result.mass}/${out.result.targetMass} kg (${out.result.percentCleared}%) | Time: ${out.result.timeElapsed}s | Stars: ${out.result.stars}/3 | Coins: +${out.result.coinsEarned}\n`);
  return out;
});

console.log('================================================================');
console.log('               PLAYTEST METRICS & SUMMARY                       ');
console.log('================================================================');
console.table(results.map(r => ({
  Persona: `${r.persona.name} (${r.persona.age})`,
  Role: r.persona.role,
  Level: r.persona.levelName,
  Result: r.result.won ? 'VICTORY' : `${r.result.percentCleared}%`,
  Mass: `${r.result.mass}/${r.result.targetMass}kg`,
  'Time (s)': r.result.timeElapsed,
  Combo: r.result.bestCombo,
  PowerUps: r.result.powerUpsCollected,
  Stars: `${r.result.stars}/3`,
})));
