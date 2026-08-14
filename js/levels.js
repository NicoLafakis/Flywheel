// 100-level campaign definition. Pure data + deterministic formulas; no rendering.

import { LEVEL_CLOCK_SECONDS } from './levelclock.js';

export const METROS = [
  { id: 'suburbs',  name: 'SUBURBS',       theme: { ground: 0x7ab55c, water: 0x3f9fd8, sky: 0xbfe8ff, palette: [0xe08a68, 0xe8c86a, 0x8fb8d8, 0xe88a9a, 0x9a8fd0, 0x7cc9a0] } },
  { id: 'downtown', name: 'DOWNTOWN',      theme: { ground: 0x7f8c99, water: 0x2f6f9f, sky: 0xaad4f5, palette: [0x8fb8d8, 0xc9d6e2, 0xe2a36a, 0x9b7bff, 0x6a8caf, 0xd8d8d8] } },
  { id: 'harbor',   name: 'HARBOR',        theme: { ground: 0xc2b280, water: 0x2a7fa8, sky: 0xbfe0ee, palette: [0xd88a5c, 0x8a9b5c, 0x5c8ad8, 0xd8c25c, 0xa86a4a, 0x7fb8c9] } },
  { id: 'neon',     name: 'NEON DISTRICT', theme: { ground: 0x3a3f5c, water: 0x1c2f6f, sky: 0x1a1f3d, palette: [0xff4bd8, 0x4bffe3, 0xb44bff, 0x4b7bff, 0xffe34b, 0xff4b6e], night: true } },
  { id: 'oldtown',  name: 'OLD TOWN',      theme: { ground: 0x9c8a6a, water: 0x3f7f8f, sky: 0xd8cfc0, palette: [0xb45c3a, 0xc9a25c, 0x8f6a4a, 0xa83a3a, 0x7a5c8f, 0xc97b4a] } },
];

export const MECHANICS = {
  golden:   { icon: '\u2B50', name: 'Golden Props',   desc: 'Rare golden props are worth 8\u00D7 mass. Grab them first!' },
  rivals:   { icon: '\uD83D\uDFE3', name: 'Rival Holes', desc: 'AI rival holes are competing for the same food. Out-eat them!' },
  tide:     { icon: '\uD83C\uDF0A', name: 'Tide Events', desc: 'The water rises at set times, shrinking the playable area. Stay inside!' },
  landmark: { icon: '\uD83C\uDFDB', name: 'Capstone Landmark', desc: 'A shielded landmark: eat enough of the city to drop its shield, then swallow it!' },
};

export const LEVELS_PER_METRO = 20;
export const TOTAL_LEVELS = 100;

function levelDef(index) {
  const metroIndex = Math.floor((index - 1) / LEVELS_PER_METRO);   // 0..4
  const inMetro = (index - 1) % LEVELS_PER_METRO;                  // 0..19
  const g = index - 1;                                             // 0..99

  const isFinale = inMetro === LEVELS_PER_METRO - 1;

  // Size ramp. The CLOCK no longer ramps: every playable level is 180 s (R-1.1),
  // read from the one declaration in js/levelclock.js. The old formula ran
  // 75 s -> ~160 s across the campaign, which meant the length of a level was a
  // per-level number nobody could state; keeping it here would also have been a
  // second copy of the limit, which is exactly what R-1.1 forbids.
  //
  // Downstream this moves one derived value: js/citygen.js times the tide
  // events at `level.clock * (0.35 + i * 0.25)`, so tides now fire later in
  // absolute seconds on every level. That is a campaign-only sim-output change
  // and is deliberate — the tides stay at the same FRACTION of the run.
  const size = 90 + g * 0.8 + metroIndex * 2;                      // 90 .. ~177 m
  const clock = LEVEL_CLOCK_SECONDS;

  // Mechanics availability by campaign position
  const hasGolden = index >= 6;
  const hasRivals = metroIndex >= 1;
  const hasTide = metroIndex >= 2;
  const hasLandmark = isFinale || index > 90;

  // Exactly one "introduces" per mechanic, rolled out in order.
  let introduces = null;
  if (index === 6) introduces = 'golden';
  if (index === 21) introduces = 'rivals';
  if (index === 41) introduces = 'tide';
  if (index === 20) introduces = 'landmark';

  const rivalCount = hasRivals ? Math.min(3, 1 + Math.floor((index - 21) / 30)) : 0;
  const tideEvents = hasTide ? Math.min(3, 1 + Math.floor((index - 41) / 25)) : 0;
  const landmarkUnlockMass = hasLandmark ? 400 + (index - 20) * 10 : 0;
  const landmarkRewardMass = hasLandmark ? 500 + (index - 20) * 25 : 0;

  // 100% completion goal for every level: target = 100% of edible mass
  const density = 0.9 + metroIndex * 0.12;
  const estimatedMass = size * size * 0.055 * density + (hasLandmark ? landmarkRewardMass : 0);
  const target = Math.floor(estimatedMass);

  return {
    index,
    seed: `hole-city-level-${index}`,
    metroIndex,
    name: `${METROS[metroIndex].name}`,
    size: Math.round(size),
    clock,
    target,
    introduces,
    golden: hasGolden,
    rivalCount,
    rivalSpeedFactor: Math.min(0.95, 0.8 + metroIndex * 0.04),
    tideEvents,
    landmark: hasLandmark ? { unlockMass: landmarkUnlockMass, rewardMass: landmarkRewardMass } : null,
    density,
  };
}

export const LEVELS = Array.from({ length: TOTAL_LEVELS }, (_, i) => levelDef(i + 1));

export function getLevel(index) { return LEVELS[index - 1]; }

// Stars: 1 = win, 2 = win with >=20% time left, 3 = >=35% time left.
export function starsForResult(level, timeLeft, won) {
  if (!won) return 0;
  const frac = timeLeft / level.clock;
  if (frac >= 0.35) return 3;
  if (frac >= 0.20) return 2;
  return 1;
}

export function coinsForResult(level, stars, bestCombo) {
  if (stars === 0) return 5; // consolation
  return 20 + stars * 15 + Math.min(30, bestCombo * 2);
}
