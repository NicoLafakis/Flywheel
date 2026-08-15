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
export const MASTER_VOLUME_KEY = 'flywheel.audio.masterVolume';
export const MIX_VERSION_KEY = 'flywheel.audio.mixVersion';

// ---------------------------------------------------------------- levels
// Retuned audio mix: Ambience lowest (15%), Music next (25%), SFX highest (30%).
// Master volume defaults to 1.0 (100%) and scales all audio buses proportionally.
export const DEFAULT_MASTER_VOLUME = 1.0;
export const DEFAULT_SFX_VOLUME = 0.30;
export const DEFAULT_MUSIC_VOLUME = 0.25;
export const DEFAULT_AMBIENCE_VOLUME = 0.15;

export const MIX_VERSION = 2;

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function reseedAudioMix(storage = defaultStorage()) {
  const result = {
    reseeded: false,
    masterVol: DEFAULT_MASTER_VOLUME,
    sfxVol: DEFAULT_SFX_VOLUME,
    ambVol: DEFAULT_AMBIENCE_VOLUME,
    musicVol: DEFAULT_MUSIC_VOLUME,
  };
  if (!storage) return result;
  try {
    const raw = storage.getItem(MIX_VERSION_KEY);
    const stamp = raw === null ? 0 : parseInt(raw, 10);
    if (!Number.isFinite(stamp) || stamp < MIX_VERSION) {
      storage.setItem(MASTER_VOLUME_KEY, String(DEFAULT_MASTER_VOLUME));
      storage.setItem(SFX_VOLUME_KEY, String(DEFAULT_SFX_VOLUME));
      storage.setItem(AMB_VOLUME_KEY, String(DEFAULT_AMBIENCE_VOLUME));
      storage.setItem(MUSIC_VOLUME_KEY, String(DEFAULT_MUSIC_VOLUME));
      storage.setItem(MIX_VERSION_KEY, String(MIX_VERSION));
      result.reseeded = true;
    }
  } catch {
    // storage may be blocked / full
  }
  return result;
}
