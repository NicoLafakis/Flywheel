// js/upgrades.js — Stat Upgrades and Shop Category Definitions
//
// Pure data & calculations module. Follows the pure-sim boundary (no DOM/three.js).

export const MAX_UPGRADE_RANK = 20;
export const UPGRADE_STEP_PERCENT = 5; // +5% per rank

// 20-tier escalating cost table. Sums to 27,195 coins per track (108,780 total across 4 tracks).
export const UPGRADE_COST_TABLE = Object.freeze([
  100,  150,  200,  275,  350,
  450,  550,  675,  800,  950,
  1125, 1300, 1500, 1725, 1950,
  2200, 2475, 2750, 3050, 3400,
]);

export const UPGRADES = Object.freeze([
  {
    id: 'speed',
    name: 'Thruster Overdrive',
    icon: '💨',
    statName: 'Movement Speed',
    desc: 'Increases hole navigation and lateral movement speed.',
    unit: '% Speed',
    stepPercent: UPGRADE_STEP_PERCENT,
    maxRank: MAX_UPGRADE_RANK,
    accentColor: '#38bdf8',
  },
  {
    id: 'vortex',
    name: 'Gravitational Core',
    icon: '🌀',
    statName: 'Vortex Power',
    desc: 'Amplifies magnetic attraction and vacuum pull on nearby debris.',
    unit: '% Pull Force',
    stepPercent: UPGRADE_STEP_PERCENT,
    maxRank: MAX_UPGRADE_RANK,
    accentColor: '#b44bff',
  },
  {
    id: 'growth',
    name: 'Mass Assimilator',
    icon: '🟩',
    statName: 'Devour Mass',
    desc: 'Increases block mass and score yield per item consumed.',
    unit: '% Mass Boost',
    stepPercent: UPGRADE_STEP_PERCENT,
    maxRank: MAX_UPGRADE_RANK,
    accentColor: '#22c55e',
  },
  {
    id: 'duration',
    name: 'Overclock Battery',
    icon: '⏳',
    statName: 'Power-Up Duration',
    desc: 'Extends active duration of all collected map power-up buffs.',
    unit: '% Duration',
    stepPercent: UPGRADE_STEP_PERCENT,
    maxRank: MAX_UPGRADE_RANK,
    accentColor: '#ffd23f',
  },
]);

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function defaultUpgrades() {
  return {
    speed: 0,
    vortex: 0,
    growth: 0,
    duration: 0,
  };
}

/**
 * Returns the coin cost to upgrade from the given rank to rank + 1.
 * Returns null if the rank is maxed (rank >= 20) or invalid (rank < 0).
 */
export function upgradeCost(rank) {
  if (typeof rank !== 'number' || rank < 0 || rank >= MAX_UPGRADE_RANK) return null;
  return UPGRADE_COST_TABLE[rank];
}

/**
 * Returns the effective multiplier for a given rank (0 to 20).
 * Rank 0 -> 1.00 (+0%)
 * Rank 20 -> 2.00 (+100%)
 */
export function upgradeMultiplier(rank) {
  if (typeof rank !== 'number') return 1.0;
  const clamped = Math.max(0, Math.min(MAX_UPGRADE_RANK, rank));
  return 1.0 + (clamped * UPGRADE_STEP_PERCENT) / 100;
}

export const SHOP_CATEGORIES = Object.freeze([
  {
    id: 'skins',
    name: 'SKINS',
    title: 'Hole Skins',
    desc: 'Cosmetic skins for your black hole rim.',
  },
  {
    id: 'creatures',
    name: 'CREATURES',
    title: 'Living Maws',
    desc: 'Reactive creatures with animated jaws and eyes.',
  },
  {
    id: 'partners',
    name: 'PARTNERS',
    title: 'Partner Agency Tributes',
    desc: 'Official agency tribute skins with custom emblems.',
  },
  {
    id: 'indicators',
    name: 'INDICATORS',
    title: 'Directional Chevrons',
    desc: 'Forward movement indicators and pointers.',
  },
  {
    id: 'upgrades',
    name: 'UPGRADES',
    title: 'Character Upgrades',
    desc: 'Permanent stat bonuses up to +100%.',
  },
]);

export const CATEGORY_BY_ID = new Map(SHOP_CATEGORIES.map((c) => [c.id, c]));

/**
 * Returns all catalog items for a given category id.
 * Pure function: accepts options object { save, skins, indicatorSkins }.
 */
export function getShopItemsByCategory(categoryId, { save = null, skins = [], indicatorSkins = [] } = {}) {
  switch (categoryId) {
    case 'skins':
      return skins.filter((s) => !s.family).map((s) => ({
        ...s,
        category: 'skins',
        isEquipped: save?.equippedSkin === s.id,
        isOwned: s.price === 0 || (save?.ownedItems || []).includes(s.id),
      }));

    case 'creatures':
      return skins.filter((s) => s.family === 'creature').map((s) => ({
        ...s,
        category: 'creatures',
        isEquipped: save?.equippedSkin === s.id,
        isOwned: s.price === 0 || (save?.ownedItems || []).includes(s.id),
      }));

    case 'partners':
      return skins.filter((s) => s.family === 'partner').map((s) => ({
        ...s,
        category: 'partners',
        isEquipped: save?.equippedSkin === s.id,
        isOwned: s.price === 0 || (save?.ownedItems || []).includes(s.id),
      }));

    case 'indicators':
      return indicatorSkins.map((ind) => ({
        ...ind,
        category: 'indicators',
        isEquipped: save?.equippedIndicator === ind.id,
        isOwned: ind.price === 0 || (save?.ownedItems || []).includes(ind.id),
      }));

    case 'upgrades':
      return UPGRADES.map((u) => {
        const currentRank = save?.upgrades?.[u.id] || 0;
        const cost = upgradeCost(currentRank);
        const currentPercent = currentRank * u.stepPercent;
        const nextPercent = Math.min(u.maxRank * u.stepPercent, (currentRank + 1) * u.stepPercent);
        const isMaxed = currentRank >= u.maxRank;

        return {
          ...u,
          category: 'upgrades',
          currentRank,
          cost,
          currentPercent,
          nextPercent,
          isMaxed,
          multiplier: upgradeMultiplier(currentRank),
        };
      });

    default:
      return [];
  }
}
