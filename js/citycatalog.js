// Master catalog of all single-player metropolis sandboxes. Pure data, no DOM/three.js.
// Progression order is dynamically sorted by block count ascending (smallest -> largest).

export const CITY_CATALOG = [
  {
    scene: 'gallery',
    name: 'THE LAB',
    location: 'PROVING GROUND',
    sub: 'Physics playground & training yard',
    desc: 'The spark begins. Compact starter grid with ramps, street props, and calibration structures.',
    tagline: 'PROLOGUE · CALIBRATION',
    chapter: 'PROLOGUE',
    blocks: 13652,
    difficulty: 'TIER 1 · STARTER',
    badge: 'PROLOGUE',
    accentColor: '#00f0ff',
    icon: '🧪',
    coinCount: 60,
    coinValue: 1,
    goalBonus: 25,
  },
  {
    scene: 'sydney',
    name: 'SYDNEY HARBOUR',
    location: 'SYDNEY, AUSTRALIA',
    sub: 'Opera House, Harbour Bridge & Circular Quay',
    desc: 'Sprocket goes global. Soaring ceramic sail vaults, deep water bays, and the iconic Coathanger bridge.',
    tagline: 'CHAPTER 1 · HARBOUR VOYAGE',
    chapter: 'CHAPTER 1',
    blocks: 14120,
    difficulty: 'TIER 2 · CASUAL',
    badge: 'ACT 1',
    accentColor: '#4cc9f0',
    icon: '🦘',
    coinCount: 70,
    coinValue: 1,
    goalBonus: 50,
  },
  {
    scene: 'manhattan',
    name: 'LOWER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Financial District, Wall Street & Downtown Skyscrapers',
    desc: 'Dense skyscraper canyon grid with granite plazas, historic churches, and monolith towers.',
    tagline: 'CHAPTER 2 · FINANCIAL GRID',
    chapter: 'CHAPTER 2',
    blocks: 25875,
    difficulty: 'TIER 3 · NORMAL',
    badge: 'ACT 2',
    accentColor: '#ffd23f',
    icon: '🏙️',
    coinCount: 80,
    coinValue: 2,
    goalBonus: 75,
  },
  {
    scene: 'brooklyn',
    name: 'BROOKLYN',
    location: 'NEW YORK CITY',
    sub: 'Bridges to Coney Island, DUMBO & East River Piers',
    desc: 'Sprawling waterfront with suspension bridges, ferry docks, coaster trestles, and warehouses.',
    tagline: 'CHAPTER 3 · WATERFRONT METROPOLIS',
    chapter: 'CHAPTER 3',
    blocks: 39984,
    difficulty: 'TIER 4 · SKILLED',
    badge: 'ACT 3',
    accentColor: '#ff9f1c',
    icon: '🌉',
    coinCount: 90,
    coinValue: 2,
    goalBonus: 100,
  },
  {
    scene: 'chicago',
    name: 'CHICAGO LOOP',
    location: 'CHICAGO, IL',
    sub: 'The Loop, Willis Tower & Iconic River Crossings',
    desc: 'Colossal skyscraper grid, elevated rail loops with runaway CTA train physics, and deep river ravines.',
    tagline: 'CHAPTER 4 · SKYSCRAPER CANYONS',
    chapter: 'CHAPTER 4',
    blocks: 44578,
    difficulty: 'TIER 5 · EXPERT',
    badge: 'ACT 4',
    accentColor: '#ff2a2a',
    icon: '🌆',
    coinCount: 100,
    coinValue: 2,
    goalBonus: 125,
  },
  {
    scene: 'upper-manhattan',
    name: 'UPPER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Central Park perimeter & Historic Brownstones',
    desc: 'Vast parkland surrounded by classic avenues, grand museums, and Victorian brownstone rows.',
    tagline: 'CHAPTER 5 · PARKLAND & UPTOWN',
    chapter: 'CHAPTER 5',
    blocks: 73393,
    difficulty: 'TIER 6 · MASTER',
    badge: 'ACT 5',
    accentColor: '#06d6a0',
    icon: '🌳',
    coinCount: 120,
    coinValue: 3,
    goalBonus: 150,
  },
  {
    scene: 'boston',
    name: 'BOSTON SEAPORT',
    location: 'MASSACHUSETTS',
    sub: 'Seaport Boulevard, BCEC & Historic Harbor',
    desc: 'Massive convention halls, seaport piers, historic wharves, and high-density coastal blocks.',
    tagline: 'CHAPTER 6 · COASTAL EXPEDITION',
    chapter: 'CHAPTER 6',
    blocks: 82894,
    difficulty: 'TIER 7 · TITAN',
    badge: 'ACT 6',
    accentColor: '#3a86ff',
    icon: '⚓',
    coinCount: 140,
    coinValue: 3,
    goalBonus: 200,
  },
  {
    scene: 'tokyo',
    name: 'TOKYO SHINJUKU',
    location: 'TOKYO, JAPAN',
    sub: 'Neo-Shinjuku Skyscraper Grid & Shibuya Scramble',
    desc: 'Mega metropolis with dazzling neon, endless towers, and bustling scramble crossings.',
    tagline: 'CHAPTER 7 · MEGA METROPOLIS',
    chapter: 'CHAPTER 7',
    blocks: 84122,
    difficulty: 'TIER 8 · APEX',
    badge: 'ACT 7',
    accentColor: '#ff0054',
    icon: '🗼',
    coinCount: 160,
    coinValue: 4,
    goalBonus: 300,
  },
  {
    scene: 'cambridge',
    name: 'CAMBRIDGE · UNBOUND',
    location: 'MASSACHUSETTS · HUBSPOT HQ',
    sub: 'Kendall Square, Canal Park & UNBOUND Summit',
    desc: 'The grand finale of Sprocket’s journey. Tech innovation district, brick mills, and HubSpot Global HQ at Canal Park for the UNBOUND summit.',
    tagline: 'GRAND FINALE · UNBOUND SUMMIT',
    chapter: 'FINALE',
    blocks: 72943,
    difficulty: 'TIER 9 · SUMMIT',
    badge: 'GRAND FINALE',
    accentColor: '#9d4edd',
    icon: '🚀',
    coinCount: 200,
    coinValue: 5,
    goalBonus: 500,
  },
];

// Returns all cities in their canonical story progression order
export function getSortedCityCatalog() {
  return [...CITY_CATALOG];
}

// Progression Gate: A city is unlocked if it is the first in the ladder (The Lab),
// or if the player has already played it and recorded a score/run on it.
// If not yet played, it remains unavailable until the previous city has been
// cleared at 100% in under the 5-minute (300s) duration limit.
export function isCityUnlocked(save, cityScene, sortedCatalog) {
  const catalog = sortedCatalog || getSortedCityCatalog();
  const idx = catalog.findIndex((c) => c.scene === cityScene);
  if (cityScene === 'gallery' || cityScene === 'sydney') return true; // Starter cities always unlocked
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
