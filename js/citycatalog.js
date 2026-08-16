// Master catalog of all single-player metropolis sandboxes. Pure data, no DOM/three.js.
// Progression order is dynamically sorted by block count ascending (smallest -> largest).

export const CITY_CATALOG = [
  {
    scene: 'gallery',
    name: 'THE LAB',
    location: 'PROVING GROUND',
    sub: 'Physics playground & training yard',
    desc: 'Compact starter grid with ramps, street props, and training structures.',
    tagline: 'WARMUP & CALIBRATION',
    blocks: 12213,
    difficulty: 'TIER 1 · CASUAL',
    badge: 'STARTER',
    accentColor: '#00f0ff',
    icon: '🧪',
    coinCount: 60,
    coinValue: 1,
    goalBonus: 25,
  },
  {
    scene: 'manhattan',
    name: 'LOWER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Financial District, Wall Street & Downtown Skyscrapers',
    desc: 'Dense skyscraper canyon grid with granite plazas and office monoliths.',
    tagline: 'FINANCIAL GRID',
    blocks: 25875,
    difficulty: 'TIER 2 · NORMAL',
    badge: 'STAGE 1',
    accentColor: '#ffd23f',
    icon: '🏙️',
    coinCount: 70,
    coinValue: 2,
    goalBonus: 50,
  },
  {
    scene: 'brooklyn',
    name: 'BROOKLYN',
    location: 'NEW YORK CITY',
    sub: 'Bridges to Coney Island, DUMBO & East River Piers',
    desc: 'Sprawling waterfront with suspension bridges, ferry docks, and warehouses.',
    tagline: 'WATERFRONT METROPOLIS',
    blocks: 39984,
    difficulty: 'TIER 3 · SKILLED',
    badge: 'STAGE 2',
    accentColor: '#ff9f1c',
    icon: '🌉',
    coinCount: 80,
    coinValue: 2,
    goalBonus: 75,
  },
  {
    scene: 'chicago',
    name: 'CHICAGO LOOP',
    location: 'CHICAGO, IL',
    sub: 'The Loop, Willis Tower & Iconic River Crossings',
    desc: 'Colossal skyscraper grid, elevated rail loops, and deep river ravines.',
    tagline: 'SKYSCRAPER CANYONS',
    blocks: 44578,
    difficulty: 'TIER 4 · EXPERT',
    badge: 'STAGE 3',
    accentColor: '#ff2a2a',
    icon: '🌆',
    coinCount: 100,
    coinValue: 2,
    goalBonus: 100,
  },
  {
    scene: 'cambridge',
    name: 'CAMBRIDGE',
    location: 'MASSACHUSETTS',
    sub: 'Kendall Square, Canal Park & Lechmere Seam',
    desc: 'Tech district featuring winding waterways, brick labs, and modern campuses.',
    tagline: 'INNOVATION HUB',
    blocks: 72943,
    difficulty: 'TIER 5 · MASTER',
    badge: 'STAGE 4',
    accentColor: '#9d4edd',
    icon: '🔬',
    coinCount: 120,
    coinValue: 3,
    goalBonus: 150,
  },
  {
    scene: 'upper-manhattan',
    name: 'UPPER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Central Park perimeter & Historic Brownstones',
    desc: 'Vast parkland surrounded by classic avenues, grand museums, and brownstone rows.',
    tagline: 'PARKLAND & UPTOWN',
    blocks: 73393,
    difficulty: 'TIER 6 · GRANDMASTER',
    badge: 'STAGE 5',
    accentColor: '#06d6a0',
    icon: '🌳',
    coinCount: 140,
    coinValue: 3,
    goalBonus: 200,
  },
  {
    scene: 'boston',
    name: 'BOSTON SEAPORT',
    location: 'MASSACHUSETTS',
    sub: 'Seaport Boulevard, BCEC & Historic Harbor',
    desc: 'Massive convention halls, seaport piers, and high-density coastal blocks.',
    tagline: 'COASTAL EXPEDITION',
    blocks: 82894,
    difficulty: 'TIER 7 · TITAN',
    badge: 'STAGE 6',
    accentColor: '#3a86ff',
    icon: '⚓',
    coinCount: 160,
    coinValue: 4,
    goalBonus: 300,
  },
  {
    scene: 'tokyo',
    name: 'TOKYO SHINJUKU',
    location: 'TOKYO, JAPAN',
    sub: 'Neo-Shinjuku Skyscraper Grid & Shibuya Scramble',
    desc: 'Mega metropolis with dazzling neon, endless towers, and famous crossings.',
    tagline: 'MEGA METROPOLIS',
    blocks: 84122,
    difficulty: 'TIER 8 · APEX',
    badge: 'FINAL APEX',
    accentColor: '#ff0054',
    icon: '🗼',
    coinCount: 200,
    coinValue: 5,
    goalBonus: 500,
  },
];

// Returns all cities ordered from smallest to largest size (block count ascending)
export function getSortedCityCatalog() {
  return [...CITY_CATALOG].sort((a, b) => a.blocks - b.blocks);
}

// Progression Gate: A city is unlocked if it is the first in the ladder (The Lab),
// or if the player has already played it and recorded a score/run on it.
// If not yet played, it remains unavailable until the previous city has been
// cleared at 100% in under the 5-minute (300s) duration limit.
export function isCityUnlocked(save, cityScene, sortedCatalog) {
  const catalog = sortedCatalog || getSortedCityCatalog();
  const idx = catalog.findIndex((c) => c.scene === cityScene);
  if (idx <= 0) return true; // First city (The Lab) is always unlocked
  const currentRec = (save?.sandbox || {})[cityScene];
  if (currentRec && ((currentRec.runs || 0) > 0 || (currentRec.bestScore || 0) > 0 || (currentRec.completions || 0) > 0)) {
    return true;
  }
  const prevCity = catalog[idx - 1];
  const prevRec = (save?.sandbox || {})[prevCity.scene];
  if (!prevRec) return false;
  
  // Previous city must have a 100% clear (completions > 0 or bestPercent >= 1.0) achieved within the 5-minute (300s) limit
  const hasFullClear = Boolean((prevRec.completions || 0) > 0 || (prevRec.bestPercent || 0) >= 1.0);
  const under5Minutes = prevRec.bestTime !== null && prevRec.bestTime !== undefined && prevRec.bestTime <= 300;
  return Boolean(hasFullClear && under5Minutes);
}

/** Check if the 3-minute challenge for a city is completed */
export function isCityChallengeCompleted(save, cityScene) {
  const ch = (save?.challenges || {})[cityScene];
  if (ch && ch.completed3m) return true;
  const sb = (save?.sandbox || {})[cityScene];
  // If sandbox recorded a clear in under 180s (3 minutes)
  if (sb && sb.bestTime != null && sb.bestTime <= 180 && ((sb.completions || 0) > 0 || (sb.bestPercent || 0) >= 1.0)) {
    return true;
  }
  return false;
}

/** Total number of 3-minute city challenges completed */
export function getCompletedChallengeCount(save, sortedCatalog) {
  const catalog = sortedCatalog || getSortedCityCatalog();
  let count = 0;
  for (const c of catalog) {
    if (isCityChallengeCompleted(save, c.scene)) {
      count++;
    }
  }
  return count;
}

/** Check if Secret 90s Challenge is unlocked (requires completing ALL 3m city challenges) */
export function isSecret90sChallengeUnlocked(save, sortedCatalog) {
  const catalog = sortedCatalog || getSortedCityCatalog();
  if (catalog.length === 0) return false;
  return getCompletedChallengeCount(save, catalog) >= catalog.length;
}
