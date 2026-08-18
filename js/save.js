// localStorage persistence, schema-versioned with migrations.

// The two audio levels this file stores defaults for are described in
// js/audio/mix.js, alongside the music level and the localStorage keys all
// three persist under. That module is deliberately dependency-free — it is
// three numbers and four strings, not the audio engine — so importing it here
// does not point persistence at render-side code, and it is what stops the
// shipped mix from drifting between the save, the engine and the settings
// screen. Retune the mix there, not here.
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from './audio/mix.js';
import { defaultUpgrades, upgradeCost, MAX_UPGRADE_RANK } from './upgrades.js';
// The name generator. It is dependency-free and deliberately NOT seeded (see the
// header of that file): a player's name must not be derivable from a world seed,
// so it draws from `crypto.getRandomValues` and never from rng.js. Importing it
// here rather than at each call site is what makes the DEFAULT carry a name,
// which is the only way a player who never opens a menu ends up with one.
import { generateName } from './board/names.js';

const KEY = 'hole-city-save';
const QUARANTINE_KEY = 'hole-city-save.quarantine';
export const CURRENT_VERSION = 25;

// The partner skins withdrawn at v24, with the price each was SOLD at.
//
// This table is deliberately a LITERAL here and not a read of the SKINS catalog,
// and that is the whole design of this migration rather than a shortcut. A
// migration is permanent: it must still run correctly in a build shipped years
// from now, and the most likely future for these rows is deletion — the marks
// are withdrawn, so the rows have no reason to survive forever. A refund that
// derived its price from the catalog would quietly become "refund 0 coins" on
// the day someone deletes them, and there is no failure mode to notice: the
// player just silently keeps neither the skin nor the money.
//
// The roster of withdrawn ids also lives in js/skinapproval.js, because "which
// rows may be OFFERED" is a live question the shop asks every frame. That is not
// duplication to be collapsed — importing it here would reintroduce exactly the
// dependency this table exists to avoid. tools/partner-approval.test.mjs holds
// the two in agreement by refunding every id on the roster and asserting 750.
const WITHDRAWN_PARTNER_PRICES = Object.freeze({
  'partner-newbreed': 750,
  'partner-impulse': 750,
  'partner-sixandflow': 750,
  'partner-kuno': 750,
  'partner-saltedstone': 750,
  'partner-mediajunction': 750,
  'partner-huble': 750,
});

// dev tuning for the voxel sandbox (sliders in SETTINGS); sim defaults live in voxelsim.js
export const VOX_DEFAULTS = { voxGravity: 70, voxWaveK: 0.10, voxCreak: 0, voxSpeed: 1.8, voxAttract: 2 };

function defaultSettings() {
  return {
    invertX: false, invertY: false, shadows: true, camDist: 1, reducedMotion: false,
    masterVol: DEFAULT_MASTER_VOLUME,
    sfxVol: DEFAULT_SFX_VOLUME,
    musicVol: DEFAULT_MUSIC_VOLUME,
    ambVol: DEFAULT_AMBIENCE_VOLUME,
    turnSens: 1, perfMode: false,
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

// Public board identity only. The bearer token lives separately in
// localStorage['fw-player']: saves are exportable, hand-editable, and can be
// quarantined, so they are deliberately not an authentication container.
//
// The name is generated HERE, at the default, rather than at the first screen
// that wants to print one. A `null` name meant every guest rendered as a
// placeholder and nothing they did could ever be published, and every surface
// grew its own fallback ('LOG IN', 'Host', 'Player_417') — three different
// answers to the same question. One default, one answer.
//
// `nameSource` is what stops the two kinds of name being confused. 'auto' is a
// name the game handed out: the player never chose it, so it is re-rollable and
// the UI still invites them to sign in. 'claimed' is a name the SERVER owns —
// registered, logged in, or assigned during provisioning — and the local save is
// not the authority on it, so nothing here may overwrite it.
function defaultPlayer() {
  return { id: null, name: generateName(), claimedAt: null, nameSource: 'auto' };
}

// Cloud-sync bookkeeping (js/cloud/sync.js). Local-only: none of this travels
// in the progress blob (js/cloud/blob.js excludes it), and it is what lets a
// device know whether it owes the server a push (`dirty`), which revision it
// last agreed with (`revision`, 0 = never), and which side changed last
// (`lastLocalChangeAt`, the tiebreaker for taste fields in the merge).
// `state` is the last outcome the indicator shows ('idle' | 'syncing' |
// 'synced' | 'offline' | 'signed-out'); it persists so a "signed out on
// another device" notice survives a reload until the player signs in again.
export function defaultCloud() {
  return {
    lastPushedAt: null, lastPulledAt: null, dirty: false, revision: 0,
    lastLocalChangeAt: null, firstNoteShownAt: null, state: 'idle',
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
    // scene id -> { completions, runs, bestSize, bestTime, bestCombo, bestScore,
    // bestPercent }; added by migration 10, extended by 15->16 and 17->18.
    // `completions` is FULL CLEARS of the city; `runs` is finished runs.
    sandbox: {},
    ownedItems: [],       // shop item ids
    equippedSkin: 'classic',
    equippedIndicator: 'ind-default',
    muted: false,
    settings: defaultSettings(),
    player: defaultPlayer(),
    // Ranked submissions wait here while offline or rate-limited. The board
    // layer bounds the queue; the fresh shape must still carry it for a brand
    // new save, which never executes a migration.
    outbox: [],
    // Stat upgrades: { speed: 0, vortex: 0, growth: 0, duration: 0 }
    upgrades: defaultUpgrades(),
    // City challenges: scene id -> { completed3m, bestTime3m, bestScore3m, completed90s, bestTime90s, bestScore90s }
    challenges: {},
    // Cloud-sync bookkeeping; added by migration 24. Local-only.
    cloud: defaultCloud(),
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
  // v17: public board identity and deferred ranked submissions. The device
  // bearer stays outside this save (see defaultPlayer) by design.
  16: (s) => ({
    ...s,
    version: 17,
    player: { ...defaultPlayer(), ...(s.player || {}) },
    outbox: Array.isArray(s.outbox) ? s.outbox : [],
  }),
  // v18: the 180 s clock split one number into two. `completions` used to be
  // "runs finished", because a sandbox run could only END by reaching the goal;
  // now a run ends on the clock and reaching the goal is a full clear of the
  // whole city, which most runs will not manage. So `completions` keeps its
  // NAME and narrows to full clears only, `runs` counts finished runs, and
  // `bestPercent` stores the furthest the player has got — the record almost
  // every run will actually set (R-2.2).
  //
  // Same shape-only bump as v16: no top-level key is added, so the
  // freshSave()/MIGRATIONS key-set guard has nothing new to hold, and
  // `recordSandboxResult` fills both new fields in from an old record's
  // defaults rather than assuming them.
  //
  // Existing `completions` values are LEFT ALONE rather than zeroed. They were
  // honest goal completions under the rule that ran at the time; rewriting them
  // to fit today's rule would be inventing history, and seeding `runs` from
  // them is the closest true statement available (every completion was a run).
  17: (s) => ({
    ...s,
    version: 18,
    sandbox: Object.fromEntries(Object.entries(s.sandbox || {}).map(([scene, rec]) => [
      scene, rec && typeof rec === 'object'
        ? { ...rec, runs: rec.runs ?? rec.completions ?? 0, bestPercent: rec.bestPercent ?? 0 }
        : rec,
    ])),
  }),
  // v19: 4-channel audio controls with Master Volume and retuned 15-25-30 ratio
  18: (s) => ({
    ...s,
    version: 19,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      masterVol: s.settings?.masterVol ?? DEFAULT_MASTER_VOLUME,
      musicVol: s.settings?.musicVol ?? DEFAULT_MUSIC_VOLUME,
      sfxVol: s.settings?.sfxVol ?? DEFAULT_SFX_VOLUME,
      ambVol: s.settings?.ambVol ?? DEFAULT_AMBIENCE_VOLUME,
    },
  }),
  // v20: Character stat upgrades system (+5% per rank, max rank 20 -> +100%)
  19: (s) => ({
    ...s,
    version: 20,
    upgrades: {
      ...defaultUpgrades(),
      ...(s.upgrades || {}),
      growth: Math.max(s.upgrades?.growth || 0, (s.ownedItems || []).includes('growth5') ? 1 : 0),
    },
  }),
  // v21: 3-minute city challenges & secret 90s hyper challenge tracking
  20: (s) => ({
    ...s,
    version: 21,
    challenges: s.challenges || {},
  }),
  // v22: every player has a name. Changing `defaultPlayer()` alone would have
  // reached nobody — a default is only read by a save that does not exist yet,
  // and migrations run only for saves OLDER than CURRENT_VERSION — so the whole
  // installed base would have kept its `name: null` and its placeholder chip
  // forever. This is the half that reaches them.
  //
  // Three cases, and the distinction between the last two is the point of
  // `nameSource`:
  //   - no name at all  -> generate one, marked 'auto' (re-rollable).
  //   - a name with a `claimedAt` -> the server owns that name. Keep it, mark it
  //     'claimed', and never re-roll it: renaming a registered account behind
  //     the server's back would publish scores under a name it does not hold.
  //   - a name with no claim (the offline `local-*` path in board/player.js
  //     writes one) -> keep the name, mark it 'auto'. It was never registered,
  //     so the player is free to shop for another.
  // Nothing is deleted and no id is fabricated: a name is not an account.
  21: (s) => ({
    ...s,
    version: 22,
    player: (() => {
      const prev = s.player || {};
      const name = typeof prev.name === 'string' && prev.name.trim() ? prev.name : generateName();
      return {
        ...defaultPlayer(),
        ...prev,
        name,
        nameSource: prev.claimedAt ? 'claimed' : 'auto',
      };
    })(),
  }),
  // v23: hole-speed retune, 1.4 -> 1.8. The key is reset for the installed
  // base rather than left at whatever the old default wrote: this is a feel
  // retune, and the precedent is v8's creak reset and v9's gravity/wave/
  // attract pass — a player who never asked for slow should not keep slow
  // forever because a default happened to be stored under their feet. Every
  // other setting is preserved, including a deliberately moved slider: only
  // voxSpeed is owned by this migration. Ranked runs are unaffected (their
  // tune is locked, see RANKED_TUNE in voxelsim.js — the bump there is
  // RANKED_SIM_VERSION 2, not this migration).
  22: (s) => ({
    ...s,
    version: 23,
    settings: {
      ...defaultSettings(),
      ...(s.settings || {}),
      voxSpeed: 1.8,
    },
  }),
  // v24: seven partner skins are withdrawn, and everyone who bought one is paid
  // back. Only Supered's permission to be featured is confirmed; the other seven
  // rows wear a real agency's real logo without one, so they stop being sellable
  // (see isSkinAvailable in js/skinapproval.js) and the shop no longer lists
  // them.
  //
  // A refund rather than a silent removal, and rather than leaving them owned.
  // The shelf became unbuyable for a reason that is entirely ours — the player
  // did nothing wrong and cannot re-earn 750 coins by asking — so taking the
  // item away without returning the price would be charging them for our
  // mistake. Leaving the item owned-but-unavailable was the other option and is
  // worse in a subtler way: `ownedItems` is what the shop reads to decide it has
  // already been bought, so a row that comes back later would come back already
  // paid for, and until then it is an entry the player owns and can never see.
  //
  // The precedent for rewriting a stored choice is v13's `pointMove` reset: it
  // is allowed when the value cannot represent a decision the player would still
  // be able to make. Nobody can go on wearing a mark we have no permission to
  // show, so `equippedSkin` falls back to 'classic' — the free default every
  // save already carries, so the fallback can never itself be unavailable.
  //
  // Supered is untouched by all three limbs: it is not in the price table, so it
  // is not removed, not credited, and not un-equipped.
  //
  // No double-credit by construction: the credit is computed from the ids
  // actually present in `ownedItems`, and the same statement removes them, so a
  // second pass over the result finds nothing to pay for.
  23: (s) => {
    const owned = Array.isArray(s.ownedItems) ? s.ownedItems : [];
    const withdrawn = owned.filter((id) => id in WITHDRAWN_PARTNER_PRICES);
    const refund = withdrawn.reduce((sum, id) => sum + WITHDRAWN_PARTNER_PRICES[id], 0);
    return {
      ...s,
      version: 24,
      coins: (s.coins || 0) + refund,
      ownedItems: owned.filter((id) => !(id in WITHDRAWN_PARTNER_PRICES)),
      equippedSkin: s.equippedSkin in WITHDRAWN_PARTNER_PRICES ? 'classic' : s.equippedSkin,
    };
  },
  // v25: cloud progress sync bookkeeping. A migrated save starts clean at
  // revision 0 — nothing has been pushed yet — so the first sign-in pulls and
  // merges rather than assuming the server already agrees with this device.
  24: (s) => ({ ...s, version: 25, cloud: defaultCloud() }),
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

// The one seam between the save and cloud sync. Every write path that changes
// something the blob carries calls this BEFORE its storeSave(): it flags the
// save as owing the server a push and stamps when the change happened, then
// tells whoever registered (js/cloud/sync.js at import) so it can debounce a
// push. The listener is a registration rather than an import so this module
// stays free of anything that talks to the network — the Node validator imports
// it, and a recorder must be able to run with no listener at all (offline is
// the normal case, invariant 10).
let progressListener = null;
export function onProgressDirty(fn) { progressListener = typeof fn === 'function' ? fn : null; }
export function markProgressDirty(save) {
  if (!save.cloud) save.cloud = defaultCloud();
  save.cloud.dirty = true;
  save.cloud.lastLocalChangeAt = Date.now();
  if (progressListener) { try { progressListener(save); } catch (e) { /* sync must never break a recorder */ } }
}

// Both recorders run as the FIRST statement of a results-screen callback, before
// any navigation happens, so a throw in either one strands the player on a screen
// whose buttons then do nothing at all. That is why each re-establishes its own
// container instead of trusting the save it was handed: the correct model is
// freshSave() carrying the key (and the validator holding it there), and this is
// the seatbelt for a save that reached us down some path neither of those covers
// — a hand-edited localStorage entry, a partial write, a future migration bug.
// Costing one `||` to guarantee the screen can always be left is a good trade.
export function recordLevelResult(save, levelIndex, { stars, mass, bestCombo, won, coinsEarned, elapsed }) {
  if (!save.levels) save.levels = {};
  const prev = save.levels[levelIndex] || { stars: 0, bestMass: 0, bestCombo: 0, won: false, fastestClear: null };
  const clearTime = won && typeof elapsed === 'number' && !isNaN(elapsed) && elapsed > 0 ? elapsed : null;
  const newFastest = clearTime !== null
    ? (prev.fastestClear == null ? clearTime : Math.min(prev.fastestClear, clearTime))
    : (prev.fastestClear ?? null);
  save.levels[levelIndex] = {
    stars: Math.max(prev.stars, stars),
    bestMass: Math.max(prev.bestMass, Math.floor(mass)),
    bestCombo: Math.max(prev.bestCombo, bestCombo),
    won: prev.won || won,
    fastestClear: newFastest,
  };
  save.coins += coinsEarned;
  markProgressDirty(save);
  storeSave(save);
}

// Extended, never forked (PRD §18): `bestCombo` and `bestScore` join the same
// record through the same call, so there is exactly one write path for a
// finished sandbox run. `|| 0` on the previous values covers a v15 record that
// predates both fields — a real case for every upgrading player.
export function recordSandboxResult(save, scene, {
  coinsEarned, size, elapsed, bestCombo = 0, score = 0, won = true, percent = 0,
}) {
  if (!save.sandbox) save.sandbox = {};
  const prev = save.sandbox[scene] || { completions: 0, bestTime: null };
  save.sandbox[scene] = {
    // A FULL CLEAR of the city, not a finished run — see the v18 migration. The
    // default is `won = true` so a caller that predates the clock (and could
    // therefore only ever have finished by reaching the goal) still records what
    // it meant.
    completions: prev.completions + (won ? 1 : 0),
    runs: (prev.runs ?? prev.completions ?? 0) + 1,
    bestSize: Math.max(prev.bestSize, size),
    // Only a full clear sets a TIME, because only a full clear has one: a run
    // that ends on the clock always took exactly the clock, so recording it
    // would drive every scene's `bestTime` to 180 and erase the real records.
    bestTime: won ? (prev.bestTime === null || prev.bestTime === undefined
      ? elapsed : Math.min(prev.bestTime, elapsed)) : (prev.bestTime ?? null),
    bestCombo: Math.max(prev.bestCombo || 0, bestCombo),
    bestScore: Math.max(prev.bestScore || 0, Math.floor(score)),
    // Fraction of the WHOLE city (R-2.2), 0..1. Stored as the fraction rather
    // than as a rounded percentage so the display owns the rounding and a later
    // change of precision does not need a migration.
    bestPercent: Math.max(prev.bestPercent || 0, Math.min(1, Math.max(0, percent))),
  };
  save.coins += coinsEarned;
  markProgressDirty(save);
  storeSave(save);
}

// Re-export challenge progression helpers from pure citycatalog module
export {
  isCityChallengeCompleted,
  getCompletedChallengeCount,
  isSecret90sChallengeUnlocked,
} from './citycatalog.js';

// Record City Challenge (3m or 90s secret) completion and rewards
export function recordChallengeResult(save, scene, {
  mode = 'challenge3m', coinsEarned = 0, elapsed = 0, bestCombo = 0, score = 0, won = true, percent = 0,
}) {
  if (!save.challenges) save.challenges = {};
  const prev = save.challenges[scene] || {
    completed3m: false, bestTime3m: null, bestScore3m: null,
    completed90s: false, bestTime90s: null, bestScore90s: null,
  };

  const is3m = mode === 'challenge3m' || mode === 'challenge';
  const is90s = mode === 'challenge90s' || mode === 'run90';

  const clearTime = won && typeof elapsed === 'number' && !isNaN(elapsed) && elapsed > 0 ? elapsed : null;
  const isFullClear = won || percent >= 1.0;

  const entry = {
    ...prev,
    completed3m: prev.completed3m || (is3m && isFullClear),
    bestTime3m: is3m && isFullClear
      ? (prev.bestTime3m === null || prev.bestTime3m === undefined ? clearTime : Math.min(prev.bestTime3m, clearTime || prev.bestTime3m))
      : prev.bestTime3m,
    bestScore3m: is3m ? Math.max(prev.bestScore3m || 0, Math.floor(score)) : prev.bestScore3m,
    completed90s: prev.completed90s || (is90s && isFullClear),
    bestTime90s: is90s && isFullClear
      ? (prev.bestTime90s === null || prev.bestTime90s === undefined ? clearTime : Math.min(prev.bestTime90s, clearTime || prev.bestTime90s))
      : prev.bestTime90s,
    bestScore90s: is90s ? Math.max(prev.bestScore90s || 0, Math.floor(score)) : prev.bestScore90s,
  };

  save.challenges[scene] = entry;

  // Also update sandbox records so personal bests, high scores and clears reflect the run
  if (!save.sandbox) save.sandbox = {};
  const prevSb = save.sandbox[scene] || { completions: 0, bestTime: null };
  save.sandbox[scene] = {
    completions: prevSb.completions + (won ? 1 : 0),
    runs: (prevSb.runs ?? prevSb.completions ?? 0) + 1,
    bestSize: Math.max(prevSb.bestSize || 1, 1),
    bestTime: won ? (prevSb.bestTime === null || prevSb.bestTime === undefined
      ? elapsed : Math.min(prevSb.bestTime, elapsed)) : (prevSb.bestTime ?? null),
    bestCombo: Math.max(prevSb.bestCombo || 0, bestCombo),
    bestScore: Math.max(prevSb.bestScore || 0, Math.floor(score)),
    bestPercent: Math.max(prevSb.bestPercent || 0, Math.min(1, Math.max(0, percent))),
  };

  save.coins = (save.coins || 0) + (coinsEarned || 0);
  markProgressDirty(save);
  storeSave(save);
}

// Board screens read the public identity from the save. This is the same
// one-line seatbelt as the result recorders: a hand-edited or interrupted save
// must never strand a player on a screen merely because its container is gone.
export function ensurePlayer(save) {
  if (!save.player) save.player = defaultPlayer();
  return save.player;
}

// The one question every name surface asks: what is this player called? It is a
// getter with a seatbelt rather than a plain read, for the same reason the
// result recorders re-establish their own containers — a hand-edited save, a
// partial write or a future migration bug must not leave a blank where a name
// goes. The repair is persisted so the answer does not change on the next frame.
export function playerName(save) {
  const player = ensurePlayer(save);
  if (typeof player.name !== 'string' || !player.name.trim()) {
    player.name = generateName();
    player.nameSource = 'auto';
    storeSave(save);
  }
  return player.name;
}

// Shopping for a name you like. Loops rather than accepting the first draw
// because a re-roll that hands back the same name reads as a dead button, and
// over 1,936 pairings a repeat is common enough to notice. Bounded, and the
// bound returns the current name rather than throwing: worst case the button
// does nothing, which beats a screen that crashes.
//
// A CLAIMED name is left exactly alone. The server owns it; this is not the
// rename path (that is `renamePlayer()` in js/board/player.js, which asks).
export function rerollPlayerName(save) {
  const player = ensurePlayer(save);
  if (player.nameSource === 'claimed') return player.name;
  const current = player.name;
  for (let guard = 0; guard < 64; guard++) {
    const candidate = generateName();
    if (candidate === current) continue;
    player.name = candidate;
    player.nameSource = 'auto';
    storeSave(save);
    return candidate;
  }
  return current;
}

// The server resolves uniqueness collisions, so the name it returns from a
// register/login/claim/provision can differ from the one this device generated.
// When it sends one it is authoritative and the local name yields to it.
//
// When it sends NOTHING the local name stands untouched (invariant 10): an
// offline player must always be able to play, and blanking their identity
// because a request failed is exactly the trap that must not be widened.
export function adoptServerName(save, name) {
  const player = ensurePlayer(save);
  if (typeof name !== 'string' || !name.trim()) return player.name;
  player.name = name.trim();
  player.nameSource = 'claimed';
  storeSave(save);
  return player.name;
}

// Exported for the schema guard in tools/validate.mjs, which has to build both
// shapes to compare them. Nothing in the game imports either; the underscores
// mark them as belonging to the guard rather than to gameplay.
export { freshSave as __freshSave, MIGRATIONS as __MIGRATIONS, defaultPlayer as __defaultPlayer };

export function isLevelUnlocked(save, levelIndex) {
  if (levelIndex <= 1) return true;
  const prev = save.levels[levelIndex - 1];
  return !!(prev && prev.won);
}

export function getUpgradeRank(save, upgradeId) {
  return save?.upgrades?.[upgradeId] || 0;
}

export function buyUpgrade(save, upgradeId) {
  if (!save.upgrades) save.upgrades = defaultUpgrades();
  const currentRank = save.upgrades[upgradeId] || 0;
  if (currentRank >= MAX_UPGRADE_RANK) return { success: false, reason: 'maxed' };
  const cost = upgradeCost(currentRank);
  if (cost === null) return { success: false, reason: 'invalid_rank' };
  if (save.coins < cost) return { success: false, reason: 'insufficient_coins', cost };

  save.coins -= cost;
  save.upgrades[upgradeId] = currentRank + 1;
  markProgressDirty(save);
  storeSave(save);
  return { success: true, newRank: save.upgrades[upgradeId], coins: save.coins, cost };
}

