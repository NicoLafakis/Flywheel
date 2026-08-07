// localStorage persistence, schema-versioned with migrations.

const KEY = 'hole-city-save';
const QUARANTINE_KEY = 'hole-city-save.quarantine';
export const CURRENT_VERSION = 13;

// dev tuning for the voxel sandbox (sliders in SETTINGS); sim defaults live in voxelsim.js
export const VOX_DEFAULTS = { voxGravity: 70, voxWaveK: 0.10, voxCreak: 0, voxSpeed: 1.4, voxAttract: 2 };

function defaultSettings() {
  return {
    invertX: false, invertY: false, shadows: true, camDist: 1, reducedMotion: false, sfxVol: 1, turnSens: 1, perfMode: false,
    // Tap/drag to move (world-space pointing) INSTEAD of the floating joystick,
    // which is the default touch control. Introducing this key deliberately did
    // not spend a schema bump: an existing v10 save simply has no key, an absent
    // boolean reads as off through `!undefined`, and the first toggle writes it.
    //
    // Clearing it later DID need one (v12 -> v13), and that is not a reversal of
    // the rule stated under `quality` below — it is the other half of it. That
    // rule is about an ABSENT key, and an absent `pointMove` was always right.
    // v13 is about a key that is PRESENT and holds a choice nobody could have
    // made informedly; see the migration for why.
    pointMove: false,
    // Device quality tier: 'auto' | 'high' | 'medium' | 'low' | 'potato'.
    // 'auto' means js/quality.js classifies the device at boot and a live
    // watchdog may step it down (or back up) while playing; anything else pins
    // the tier and turns the watchdog off entirely.
    //
    // This one DOES get a schema bump, unlike `pointMove` above, and the
    // difference is worth recording because it is the judgement the comment
    // there is asking for. `pointMove` is a boolean whose absent value reads
    // correctly as `false` through `!undefined` — the setting works on an old
    // save with no migration. `quality` is a string, and `undefined` is not
    // 'auto': it would fall through every comparison in main.js and leave an
    // upgrading player with no tier at all, no auto-detection and no watchdog,
    // which is silently worse than the build they came from. A key whose absent
    // value is WRONG needs a migration; a key whose absent value is already the
    // default does not.
    quality: 'auto',
    // dev tuning for the voxel sandbox (sliders in SETTINGS); sim defaults live in voxelsim.js
    ...VOX_DEFAULTS,
  };
}

// The shape a brand-new player starts on. It is NOT the union of what the
// migration chain produces — it has to be checked against it, because the two
// drift silently and only the migrated path gets exercised during development.
//
// That drift is not hypothetical: `sandbox` was added by migration 10 and never
// added here, so every save born at v11 or later had no `sandbox` object at all
// (migrations only run for saves OLDER than CURRENT_VERSION, so a fresh save
// skips the one line that would have created it). `recordSandboxResult` then
// threw on `save.sandbox[scene]` — the first statement in the results-screen
// callback — and BOTH buttons on the sandbox results screen went dead with no
// symptom other than a console TypeError. The player was stuck on the screen.
//
// `tools/validate.mjs` now asserts this function's key set against the chain's,
// top level and inside `settings`, from every reachable start version. Add a key
// in a migration without adding it here and the validator says so.
function freshSave() {
  return {
    version: CURRENT_VERSION,
    coins: 0,
    // levelIndex (1-based) -> { stars, bestMass, bestCombo, won }
    levels: {},
    // scene id -> { completions, bestSize, bestTime }; added by migration 10
    sandbox: {},
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
  // v8: sandbox collapse is immediate by default; preserve the other tuning
  // values, but reset the old creak delay so existing saves get the new feel.
  7: (s) => ({
    ...s,
    version: 8,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      voxCreak: 0,
    },
  }),
  // v9: final sandbox feel pass — heavier gravity, faster crack wave, and a
  // gentler attraction pull. Turn sensitivity ramps by SIZE in controls.js.
  8: (s) => ({
    ...s,
    version: 9,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      voxGravity: 70,
      voxWaveK: 0.10,
      voxAttract: 2,
    },
  }),
  // v10: performance mode toggle to reduce lag on low-resource hardware
  9: (s) => ({
    ...s,
    version: 10,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      perfMode: s.settings && 'perfMode' in s.settings ? !!s.settings.perfMode : false,
    },
  }),
  // v11: sandbox goals can be completed repeatedly, independently of the
  // retired campaign level records. Keep those records intact: they are old
  // player history, not invalid data.
  10: (s) => ({ ...s, version: 11, sandbox: s.sandbox || {} }),
  // v12: settings.quality — the device tier. Existing players land on 'auto'
  // (detect + watchdog), which is the behaviour they would want and cannot ask
  // for otherwise; anyone who had already turned on Performance Mode keeps it,
  // since the two are independent controls (perfMode caps the pixel ratio and
  // freezes ambient life; the tier is the debris/support/shadow ladder).
  11: (s) => ({
    ...s,
    version: 12,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      quality: 'auto',
    },
  }),
  // v13: the floating joystick is the default touch control, so every pre-v13
  // `pointMove: true` is cleared.
  //
  // Resetting a setting a player chose is normally the wrong thing to do, and
  // the justification here is specific rather than a general licence. Point-to-
  // move shipped 2026-08-05; the joystick shipped the next day. In EVERY build
  // where the two coexisted, `pointMove: true` suppressed the joystick outright
  // — onPointerDown treats it as a replacement, not an overlay — so a player who
  // had it on has never had a joystick rendered on their screen. There is no
  // such thing yet as someone who saw both and preferred pointing. The value we
  // are clearing is not a comparison anyone made; it is the only option that
  // existed when they made it.
  //
  // That is why this keys off the schema version rather than trying to date the
  // toggle. It is exact for the question actually being asked: v13 is the first
  // version whose builds render a joystick to a `pointMove` player, so from here
  // on the setting is an informed choice and no migration touches it again. It
  // is one-shot by construction — a save already at 13 never enters this branch,
  // so turning the setting back on survives every future load.
  //
  // What this does NOT survive is a second re-default later; version alone could
  // not then distinguish "chose pointing over the joystick" from "never saw the
  // joystick". If that day comes, the honest fix is a marker written by the
  // settings screen at the moment of the toggle, not more archaeology here.
  12: (s) => ({
    ...s,
    version: 13,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      pointMove: false,
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

// Both recorders run as the FIRST statement of a results-screen callback, before
// any navigation happens, so a throw in either one strands the player on a screen
// whose buttons then do nothing at all. That is why each re-establishes its own
// container instead of trusting the save it was handed: the correct model is
// freshSave() carrying the key (and the validator holding it there), and this is
// the seatbelt for a save that reached us down some path neither of those covers
// — a hand-edited localStorage entry, a partial write, a future migration bug.
// Costing one `||` to guarantee the screen can always be left is a good trade.
export function recordLevelResult(save, levelIndex, { stars, mass, bestCombo, won, coinsEarned }) {
  if (!save.levels) save.levels = {};
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

export function recordSandboxResult(save, scene, { coinsEarned, size, elapsed }) {
  if (!save.sandbox) save.sandbox = {};
  const prev = save.sandbox[scene] || { completions: 0, bestSize: 0, bestTime: null };
  save.sandbox[scene] = {
    completions: prev.completions + 1,
    bestSize: Math.max(prev.bestSize, size),
    bestTime: prev.bestTime === null ? elapsed : Math.min(prev.bestTime, elapsed),
  };
  save.coins += coinsEarned;
  storeSave(save);
}

// Exported for the schema guard in tools/validate.mjs, which has to build both
// shapes to compare them. Nothing in the game imports either; the underscores
// mark them as belonging to the guard rather than to gameplay.
export { freshSave as __freshSave, MIGRATIONS as __MIGRATIONS };

export function isLevelUnlocked(save, levelIndex) {
  if (levelIndex <= 1) return true;
  const prev = save.levels[levelIndex - 1];
  return !!(prev && prev.won);
}
