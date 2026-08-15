// The 7-tier size ladder — single source of truth for growth and edibility.

export const TIER_STEP = 1.35;
export const TIER_BASE_RADIUS = 0.35;

// tier: 1..7
export function radiusForTier(tier) {
  return TIER_BASE_RADIUS * Math.pow(TIER_STEP, tier - 1);
}

export const TIERS = [
  null, // tiers are 1-indexed
  { tier: 1, name: 'trash',           radius: radiusForTier(1), mass: 1 },
  { tier: 2, name: 'bikes',           radius: radiusForTier(2), mass: 2 },
  { tier: 3, name: 'cars',            radius: radiusForTier(3), mass: 5 },
  { tier: 4, name: 'buses',           radius: radiusForTier(4), mass: 12 },
  { tier: 5, name: 'small building',  radius: radiusForTier(5), mass: 30 },
  { tier: 6, name: 'medium building', radius: radiusForTier(6), mass: 75 },
  { tier: 7, name: 'large building',  radius: radiusForTier(7), mass: 180 },
];

export const PLAYER_START_RADIUS = 0.45;
export const PLAYER_MAX_RADIUS = 13.5;
export const GROWTH_K = 0.115;
export const GROWTH_EXP = 0.42;

export function playerRadiusForMass(mass) {
  return Math.min(
    PLAYER_MAX_RADIUS,
    Math.max(PLAYER_START_RADIUS, PLAYER_START_RADIUS + GROWTH_K * Math.pow(mass, GROWTH_EXP))
  );
}

// Strict gate: object edible iff the hole's opening is big enough to FIT it
// through — tier radius times a fit margin. Near-misses bounce off the rim.
export const FIT_MARGIN = 1.12;
export function isEdible(playerRadius, tier) {
  return playerRadius > TIERS[tier].radius * FIT_MARGIN;
}

export function edibleTierUpTo(playerRadius) {
  let t = 0;
  for (let i = 1; i <= 7; i++) if (isEdible(playerRadius, i)) t = i;
  return t;
}

export const GOLDEN_MULTIPLIER = 8;

// Movement: growth costs maneuverability.
export function playerSpeedForRadius(radius) {
  return Math.max(4.5, 7.5 - 0.35 * radius);
}
