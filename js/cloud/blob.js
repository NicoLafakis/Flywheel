// The boundary between what follows the player and what stays on the device.
//
// `toBlob(save)` lifts exactly the SYNCED_KEYS subset out of a save (deep
// copied, so a later applyBlob cannot write through it), and `applyBlob(save,
// blob)` writes that subset back, touching nothing else — never `outbox`,
// `player`, `cloud`, `version`, and never a settings key that is not in
// SYNCED_SETTINGS_KEYS (device capability stays on the device). Both lists
// live HERE and api/_progress.mjs imports them (the plan had the arrow the
// other way, but Vercel does not serve api/ as static files, so the browser
// cannot import from there while the server can import from js/). One
// definition either way: client and server cannot disagree about which keys
// travel, and tools/progress-blob.test.mjs pins toBlob's key set to
// SYNCED_KEYS, so a future save key becomes a decision, not an accident.
//
// Pure: no DOM, no network, no clock, no randomness. Applying to the SAVE is
// all this does; the live sim is never touched (invariant 4), and js/cloud/
// sync.js defers even this while a level is playing.

export const SYNCED_KEYS = Object.freeze([
  'coins', 'levels', 'sandbox', 'challenges', 'ownedItems',
  'equippedSkin', 'equippedIndicator', 'upgrades', 'muted', 'settings',
]);
// Player TASTE travels; device capability (`quality`, `perfMode`, `vox*`) does
// not. These are the key names js/save.js defaultSettings() actually uses (the
// plan wrote them as musicVolume/sfxVolume; the blob suite pins every one of
// them to a real settings key so the list cannot drift again).
export const SYNCED_SETTINGS_KEYS = Object.freeze(['masterVol', 'sfxVol', 'musicVol', 'ambVol', 'turnSens']);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** The syncable subset of a save, deep-copied. */
export function toBlob(save) {
  const blob = {};
  for (const k of SYNCED_KEYS) {
    if (k === 'settings') {
      const settings = {};
      const src = isObj(save.settings) ? save.settings : {};
      for (const sk of SYNCED_SETTINGS_KEYS) if (sk in src) settings[sk] = clone(src[sk]);
      blob.settings = settings;
    } else if (k in save) {
      blob[k] = clone(save[k]);
    } else {
      // A save that reached us without the container (hand-edited, partial):
      // still emit the key so the server's allow-list sees a complete document.
      blob[k] = k === 'ownedItems' ? [] : (k === 'coins' ? 0 : (k === 'muted' ? false : (k === 'equippedSkin' ? 'classic' : (k === 'equippedIndicator' ? 'ind-default' : {}))));
    }
  }
  return blob;
}

/** Write a (merged or canonical) blob into the save. Only SYNCED_KEYS, only
 *  SYNCED_SETTINGS_KEYS inside `settings`; a partial blob applies what it has. */
export function applyBlob(save, blob) {
  if (!isObj(blob)) return save;
  for (const k of SYNCED_KEYS) {
    if (!(k in blob)) continue;
    if (k === 'settings') {
      if (!isObj(blob.settings)) continue;
      if (!isObj(save.settings)) save.settings = {};
      for (const sk of SYNCED_SETTINGS_KEYS) if (sk in blob.settings) save.settings[sk] = clone(blob.settings[sk]);
    } else {
      save[k] = clone(blob[k]);
    }
  }
  return save;
}
