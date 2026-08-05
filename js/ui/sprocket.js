// The Flywheel mark: a rotating voxel sprocket.
//
// A sprocket is a toothed wheel whose defining feature is the void through its
// centre — which is a portrait of the protagonist, because in this game the
// player IS the hole. The teeth are squares rather than involute curves so the
// wheel reads as the same 1 m voxel stock the cities are cut from, and the
// middle is left genuinely empty: it is the hole, not a logo badge.
//
// Everything is derived from TEETH. Change the constant and the whole wheel
// re-spaces itself; nothing here is hand-placed, and no Math.random is involved
// (js/ is Math.random-free by convention — tools/validate.mjs greps for it).

const TEETH = 12; // 30 deg pitch — coarse enough that a single tooth reads at 72 px

/**
 * Build the sprocket mark. Decorative: it carries no accessible name, because
 * the landing screen states the product name in text right beneath it.
 * @returns {HTMLElement} the .fw-sprocket wrapper
 */
export function buildSprocket() {
  const root = document.createElement('div');
  root.className = 'fw-sprocket';
  root.setAttribute('aria-hidden', 'true');

  // Teeth first, rim second: the rim's outer edge overlaps where the teeth root,
  // so painting it afterwards hides the joins and leaves one clean silhouette.
  const spin = document.createElement('div');
  spin.className = 'fw-sprocket-spin';
  for (let i = 0; i < TEETH; i++) {
    const tooth = document.createElement('i');
    tooth.className = 'fw-tooth';
    tooth.style.setProperty('--a', `${(360 / TEETH * i).toFixed(2)}deg`);
    spin.appendChild(tooth);
  }
  root.appendChild(spin);

  const rim = document.createElement('div');
  rim.className = 'fw-sprocket-rim';
  root.appendChild(rim);

  const hub = document.createElement('div');
  hub.className = 'fw-sprocket-hub';
  root.appendChild(hub);

  return root;
}
