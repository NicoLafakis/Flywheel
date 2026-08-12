// localStorage persistence, schema-versioned with migrations.

// The two audio levels this file stores defaults for are described in
// js/audio/mix.js, alongside the music level and the localStorage keys all
// three persist under. That module is deliberately dependency-free — it is
// three numbers and four strings, not the audio engine — so importing it here
// does not point persistence at render-side code, and it is what stops the
// shipped mix from drifting between the save, the engine and the settings
// screen. Retune the mix there, not here.
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_SFX_VOLUME } from './audio/mix.js';

const KEY = 'hole-city-save';
const QUARANTINE_KEY = 'hole-city-save.quarantine';
export const CURRENT_VERSION = 16;

// dev tuning for the voxel sandbox (sliders in SETTINGS); sim defaults live in voxelsim.js
export const VOX_DEFAULTS = { voxGravity: 70, voxWaveK: 0.10, voxCreak: 0, voxSpeed: 1.4, voxAttract: 2 };

function defaultSettings() {
  return {
    invertX: false, invertY: false, shadows: true, camDist: 1, reducedMotion: false, sfxVol: DEFAULT_SFX_VOLUME, turnSens: 1, perfMode: false,
    // City ambience level, split out from sfxVol so the beds and the crashes
    // can be set against each other. No schema bump, for the same reason
    // `pointMove` below did not need one: an absent key reads as the default
    // through every consumer's `typeof … === 'number'` guard, so an upgrading
    // player lands on the shipped ambience level rather than on nothing.
    //
    // Retuning these two numbers is NOT what a migration is for, which is why
    // neither this pass nor the split before it bumped the schema: the key is
    // present and holds a value that is still legal, and an existing player's
    // stored level is not wrong, it is just from an older mix. Moving them onto
    // the new mix is `reseedAudioMix()`'s job (js/audio/mix.js) — one stamped,
    // one-time write that main.js mirrors into these two keys — because that
    // mechanism also reaches the arena and the scene viewer, which have no save
    // at all and would otherwise be left on the old balance.
    ambVol: DEFAULT_AMBIENCE_VOLUME,
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
    // Graphics detail: 'high' | 'low'. Binary and player-chosen — full graphics
    // or not. There is no 'auto', no device classifier and no live watchdog any
    // more (see js/quality.js), so HIGH is the honest default: it is the
    // pre-tier sim byte for byte, and a player who wants less opts down.
    //
    // This one DOES get a schema bump, unlike `pointMove` above, and the
    // difference is worth recording because it is the judgement the comment
    // there is asking for. `pointMove` is a boolean whose absent value reads
    // correctly as `false` through `!undefined` — the setting works on an old
    // save with no migration. `quality` is a string, and every one of its old
    // values ('auto', 'medium', 'potato') now names a tier that does not exist;
    // left alone they would fall through main.js's comparison to HIGH, which is
    // right for two of them and silently wrong for 'potato'. A key whose stored
    // value is WRONG needs a migration; a key whose absent value is already the
    // default does not.
    quality: 'high',
    // Has the player ever touched the Graphics detail button? `quality` alone
    // cannot answer that, and the answer is what lets the DEFAULT differ by
    // device without ever overruling a choice: a coarse-pointer device that has
    // never been to SETTINGS starts on LOW (main.js `wantedTier`), a fine-pointer
    // one starts on HIGH, and the moment the button is pressed this flips true
    // and `quality` is the only authority from then on, on every device.
    //
    // Deliberately no schema bump, for exactly the reason `pointMove` above did
    // not need one: an absent boolean reads as `false` through `!x`, and `false`
    // is the correct answer for every save that predates the key — none of those
    // players has pressed a button that did not yet write a marker. The reading
    // is also the honest one for a MIGRATED `quality` value: v14 translated
    // 'auto'/'medium'/'potato' onto the two remaining rungs, and a translation
    // performed by a migration is not a choice a player made on a phone.
    //
    // This is the "marker written by the settings screen at the moment of the
    // toggle" that the v13 note below asks for, generalised: version archaeology
    // can distinguish "never saw the option" from "chose it" exactly once, and
    // this key means the next re-default never has to guess.
    qualityChosen: false,
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
    equippedIndicator: 'ind-default',
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
    equippedIndicator: 'ind-default',
    muted: false,
  }),
  2: (s) => ({
    version: 3,
    coins: s.coins || 0,
    levels: s.levels || {},
    ownedItems: s.ownedItems || [],
    equippedSkin: s.equippedSkin || 'classic',
    equippedIndicator: s.equippedIndicator || 'ind-default',
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
  // v14: graphics detail collapses to HIGH or LOW. 'auto', 'medium' and
  // 'potato' no longer name anything js/quality.js can build, so every stored
  // value has to be remapped rather than merged forward.
  //
  // This is not the same kind of act as v13's re-default above, and does not
  // need that one's justification: nobody's choice is being overruled, it is
  // being TRANSLATED onto the two rungs that still exist. The mapping keeps the
  // side of the ladder the player was on — 'potato' was the bottom rung and
  // lands on LOW, 'medium' was an upper rung and lands on HIGH. 'auto' is the
  // one that carries a real decision, and it goes to HIGH because that is the
  // tier the auto path resolved to for every desktop-class machine and the
  // default a fresh save now starts on; a player who is actually on a device
  // that needed less will find one button in SETTINGS, which is one more than
  // the old classifier ever offered them.
  //
  // Unknown values (a hand-edited save, a future build read backwards) also
  // land on HIGH rather than on nothing, so the key always holds a tier that
  // exists. main.js's wantedTier() repeats this same default for anything that
  // reaches it un-migrated.
  13: (s) => ({
    ...s,
    version: 14,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      quality: (s.settings && (s.settings.quality === 'low' || s.settings.quality === 'potato')) ? 'low' : 'high',
    },
  }),
  // v15: add equippedIndicator key for shop indicator skins
  14: (s) => ({
    ...s,
    version: 15,
    equippedIndicator: s.equippedIndicator || 'ind-default',
  }),
  // v16: sandbox records gain `bestCombo` and `bestScore` — the run's longest
  // chain and its final combo-multiplied score, which the reward layer now
  // displays and which the results screen compares against.
  //
  // No top-level key is added, so the freshSave()/MIGRATIONS key-set guard has
  // nothing new to hold. The bump exists anyway because the SHAPE of the values
  // inside `sandbox` changed, and `recordSandboxResult` is written to fill both
  // fields in from an old record's defaults rather than to assume them — an
  // upgrading player's existing per-scene rows simply have no bests yet, which
  // is honest: they were never measured.
  15: (s) => ({ ...s, version: 16 }),
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

// Extended, never forked (PRD §18): `bestCombo` and `bestScore` join the same
// record through the same call, so there is exactly one write path for a
// finished sandbox run. `|| 0` on the previous values covers a v15 record that
// predates both fields — a real case for every upgrading player.
export function recordSandboxResult(save, scene, { coinsEarned, size, elapsed, bestCombo = 0, score = 0 }) {
  if (!save.sandbox) save.sandbox = {};
  const prev = save.sandbox[scene] || { completions: 0, bestSize: 0, bestTime: null };
  save.sandbox[scene] = {
    completions: prev.completions + 1,
    bestSize: Math.max(prev.bestSize, size),
    bestTime: prev.bestTime === null ? elapsed : Math.min(prev.bestTime, elapsed),
    bestCombo: Math.max(prev.bestCombo || 0, bestCombo),
    bestScore: Math.max(prev.bestScore || 0, Math.floor(score)),
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
