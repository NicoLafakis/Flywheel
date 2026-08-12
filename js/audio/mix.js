// The shipped audio mix: the three player-facing levels, the localStorage keys
// they persist under, and the one-time re-seed that moves an install already
// carrying an older mix onto a retuned one.
//
// This module is deliberately DEPENDENCY-FREE, and that is the whole reason it
// exists as its own file. Three unrelated layers need the same three numbers —
// `engine.js` owns the effects and ambience buses, `music.js` owns the streamed
// score, `save.js` owns the campaign settings — and the alternatives were all
// worse: duplicating the literals lets them drift (the failure this file is a
// response to), having save.js import the audio engine points persistence at
// render-side code, and hanging the constants off engine.js while music.js
// needs them (and vice versa) makes an import cycle between the two.
//
// `engine.js` and `music.js` re-export the names they own, so every existing
// call site keeps importing from the module it always did.

// ---------------------------------------------------------------- keys
// `flywheel.audio.volume` predates the effects/ambience/music split and holds
// the EFFECTS level. Renaming it would silently reset every existing player's
// slider, which is a worse trade than a key one generation out of date.
export const SFX_VOLUME_KEY = 'flywheel.audio.volume';
export const AMB_VOLUME_KEY = 'flywheel.audio.ambVolume';
export const MUSIC_VOLUME_KEY = 'flywheel.audio.musicVolume';
export const MIX_VERSION_KEY = 'flywheel.audio.mixVersion';

// ---------------------------------------------------------------- levels
// Retuned so the mix sits where the game is meant to be heard: crashes lead,
// the city sits under them, the score sits under both. These are the numbers a
// fresh install starts on AND the numbers the re-seed below installs, so there
// is exactly one description of "the shipped mix".
export const DEFAULT_SFX_VOLUME = 0.7;
export const DEFAULT_AMBIENCE_VOLUME = 0.4;
export const DEFAULT_MUSIC_VOLUME = 0.3;

// Bump this whenever the three numbers above are retuned again. Everyone whose
// stamp is older gets the new mix once; everyone already stamped keeps whatever
// they dragged their sliders to. A player who has deliberately set their own
// levels and then sees a retune land is the cost of the mechanism, and it is
// the intended one: the alternative is shipping a mix nobody ever hears.
export const MIX_VERSION = 1;

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * One-time re-seed of the persisted mix.
 *
 * Without this, Part 1 would be invisible to everyone who has already played:
 * `main.js` writes all three levels back to localStorage on every boot, so an
 * existing install's stored 1 / 1 / 0.65 wins over any change to the fallbacks.
 *
 * Fires when the stored stamp is missing, unparseable, or older than
 * MIX_VERSION — which includes a brand-new install, deliberately: a fresh
 * player is written the same three defaults they would have got from the
 * fallbacks anyway, so the seeded and unseeded paths cannot disagree, and the
 * install ends up stamped so the NEXT retune knows where it stands. A stamp
 * from a future build (higher than MIX_VERSION) is left alone rather than
 * stomped backwards.
 *
 * Every access is guarded: private mode, a blocked or full store, and a
 * surface with no localStorage at all all degrade to "no re-seed", never to a
 * throw. The caller still gets the new defaults back so it can apply them
 * in-memory.
 *
 * @param {Storage|null} storage - defaults to localStorage; injectable for the
 *   MusicDirector's storage option and for tests.
 * @returns {{reseeded: boolean, sfxVol: number, ambVol: number, musicVol: number}}
 *   `reseeded` is true only when this call is the one that wrote the stamp, so
 *   at most one caller per install sees it — that is what lets main.js know it
 *   also has to reconcile `save.settings` without double-writing.
 */
export function reseedAudioMix(storage = defaultStorage()) {
  const result = {
    reseeded: false,
    sfxVol: DEFAULT_SFX_VOLUME,
    ambVol: DEFAULT_AMBIENCE_VOLUME,
    musicVol: DEFAULT_MUSIC_VOLUME,
  };
  if (!storage) return result;
  try {
    const stamped = parseInt(storage.getItem(MIX_VERSION_KEY), 10);
    if (Number.isFinite(stamped) && stamped >= MIX_VERSION) return result;
    storage.setItem(SFX_VOLUME_KEY, String(DEFAULT_SFX_VOLUME));
    storage.setItem(AMB_VOLUME_KEY, String(DEFAULT_AMBIENCE_VOLUME));
    storage.setItem(MUSIC_VOLUME_KEY, String(DEFAULT_MUSIC_VOLUME));
    // Stamp LAST: a store that fails partway through (quota, private mode)
    // stays un-stamped and simply tries again next boot, rather than recording
    // a re-seed that only half happened.
    storage.setItem(MIX_VERSION_KEY, String(MIX_VERSION));
    result.reseeded = true;
  } catch { /* storage blocked — the in-memory defaults still apply */ }
  return result;
}
