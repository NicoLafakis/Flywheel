// localStorage persistence, schema-versioned with migrations.

const KEY = 'hole-city-save';
const QUARANTINE_KEY = 'hole-city-save.quarantine';
export const CURRENT_VERSION = 7;

function defaultSettings() {
  return {
    invertX: false, invertY: false, shadows: true, camDist: 1, reducedMotion: false, sfxVol: 1, turnSens: 1,
    // dev tuning for the voxel sandbox (sliders in SETTINGS); sim defaults live in voxelsim.js
    voxGravity: 65, voxWaveK: 0.4, voxCreak: 1, voxSpeed: 1.4, voxAttract: 8,
  };
}

function freshSave() {
  return {
    version: CURRENT_VERSION,
    coins: 0,
    // levelIndex (1-based) -> { stars, bestMass, bestCombo, won }
    levels: {},
    ownedItems: [],       // shop item ids
    equippedSkin: 'classic',
    muted: false,
    settings: defaultSettings(),
  };
}

// v1: { coins, stars: {levelIndex: stars} }
// v2: { version:2, coins, levels: {i:{stars,won}}, ownedItems }
const MIGRATIONS = {
  1: (s) => ({
    version: 2,
    coins: s.coins || 0,
    levels: Object.fromEntries(
      Object.entries(s.stars || {}).map(([k, stars]) => [k, { stars, bestMass: 0, bestCombo: 0, won: stars > 0 }])
    ),
    ownedItems: [],
    equippedSkin: 'classic',
    muted: false,
  }),
  2: (s) => ({
    version: 3,
    coins: s.coins || 0,
    levels: s.levels || {},
    ownedItems: s.ownedItems || [],
    equippedSkin: s.equippedSkin || 'classic',
    muted: !!s.muted,
  }),
  3: (s) => ({ ...s, version: 4, settings: s.settings || defaultSettings() }),
  4: (s) => ({
    ...s,
    version: 5,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
    },
  }),
  // v6: settings.turnSens (turn sensitivity slider) — merge under defaults,
  // same shape as the v4->v5 settings merge.
  5: (s) => ({
    ...s,
    version: 6,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
    },
  }),
  // v7: dev voxel-tuning settings (voxGravity/voxWaveK/voxCreak/voxSpeed/voxAttract)
  6: (s) => ({
    ...s,
    version: 7,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
    },
  }),
};

export function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return freshSave(); }
  if (!raw) return freshSave();

  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    quarantine(raw);
    return freshSave();
  }

  // Unversioned legacy data: treat as v1 if it has the v1 shape, else quarantine.
  if (typeof data.version !== 'number') {
    if (data && typeof data === 'object' && ('stars' in data || 'coins' in data)) {
      data.version = 1;
    } else {
      quarantine(raw);
      return freshSave();
    }
  }

  if (data.version > CURRENT_VERSION) {
    // Save from a newer build: don't destroy it, but don't read it either.
    quarantine(raw);
    return freshSave();
  }

  let migrated = data;
  while (migrated.version < CURRENT_VERSION) {
    const fn = MIGRATIONS[migrated.version];
    if (!fn) { quarantine(raw); return freshSave(); }
    migrated = fn(migrated);
  }
  return migrated;
}

function quarantine(raw) {
  try { localStorage.setItem(QUARANTINE_KEY, raw); } catch (e) { /* ignore */ }
}

export function storeSave(save) {
  save.version = CURRENT_VERSION;
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage full/blocked */ }
}

export function recordLevelResult(save, levelIndex, { stars, mass, bestCombo, won, coinsEarned }) {
  const prev = save.levels[levelIndex] || { stars: 0, bestMass: 0, bestCombo: 0, won: false };
  save.levels[levelIndex] = {
    stars: Math.max(prev.stars, stars),
    bestMass: Math.max(prev.bestMass, Math.floor(mass)),
    bestCombo: Math.max(prev.bestCombo, bestCombo),
    won: prev.won || won,
  };
  save.coins += coinsEarned;
  storeSave(save);
}

export function isLevelUnlocked(save, levelIndex) {
  if (levelIndex <= 1) return true;
  const prev = save.levels[levelIndex - 1];
  return !!(prev && prev.won);
}
