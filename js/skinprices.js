// The cosmetic price table, importable by the SERVER and the validator.
//
// WHY THIS FILE EXISTS
// `js/skins.js` is the catalog — id, name, price, art, builder — and it imports
// three.js at module scope, so nothing under api/ or tools/ can import it.
// Cloud progress sync (api/_progress.mjs) needs two facts about every id a save
// may hold in `ownedItems`: is it a real purchasable cosmetic, and what did it
// cost. This table is those two facts and nothing else. `js/skinapproval.js`
// keeps the OFFER rule (a partner row must be approved), and `family` /
// `approved` are carried here so that rule can be applied without three.js.
//
// One copy, held in agreement by a guard, rather than a lexical read of
// skins.js at runtime: tools/progress-api.test.mjs parses the SKINS and
// INDICATOR_SKINS blocks of js/skins.js as text (the idiom
// tools/partner-approval.test.mjs already uses) and fails if any id, price,
// family or approval flag here disagrees. Add a skin there without adding it
// here and the validator says so.
//
// The two legacy shop items (`clock5`, `growth5`) are listed because a save
// from before v20 may still own them (see the v20 migration in js/save.js);
// their prices are the ones js/ui/screens.js sold them at.

export const COSMETIC_PRICES = Object.freeze({
  // hole skins
  'classic': 0, 'baseline-cyan': 0, 'baseline-crimson': 0, 'baseline-amber': 0,
  'baseline-emerald': 0, 'baseline-purple': 0, 'baseline-orange': 0, 'baseline-magenta': 0,
  'funnel': 100, 'neon': 150, 'sprocket': 200, 'lava': 250, 'pipeline': 300,
  'frost': 350, 'radar': 400, 'galaxy': 500, 'abtest': 600, 'attribution': 700,
  'gold': 800, 'chomper': 450, 'shredder': 550, 'eyeballs': 650, 'throat': 750,
  'closer': 900,
  'partner-supered': 750, 'partner-newbreed': 750, 'partner-impulse': 750,
  'partner-sixandflow': 750, 'partner-kuno': 750, 'partner-saltedstone': 750,
  'partner-mediajunction': 750, 'partner-huble': 750,
  // nav indicators
  'ind-default': 0, 'ind-plasma': 150, 'ind-supered': 300, 'ind-inferno': 500,
  'ind-cyber': 750, 'ind-cosmic': 1000,
  // legacy one-off items (pre-v20 saves)
  'clock5': 400, 'growth5': 500,
});

// Which rows ask permission, and which have it. Everything absent here has no
// family, which isSkinAvailable() treats as "no permission needed".
export const PARTNER_ROWS = Object.freeze({
  'partner-supered': { family: 'partner', approved: true },
  'partner-newbreed': { family: 'partner', approved: false },
  'partner-impulse': { family: 'partner', approved: false },
  'partner-sixandflow': { family: 'partner', approved: false },
  'partner-kuno': { family: 'partner', approved: false },
  'partner-saltedstone': { family: 'partner', approved: false },
  'partner-mediajunction': { family: 'partner', approved: false },
  'partner-huble': { family: 'partner', approved: false },
});

/** True for an id a save may legitimately hold in `ownedItems`. */
export function isKnownCosmetic(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(COSMETIC_PRICES, id);
}

/** True for a hole skin or indicator that costs nothing — usable without owning it. */
export function isFreeCosmetic(id) {
  return isKnownCosmetic(id) && COSMETIC_PRICES[id] === 0;
}

/** The pure-side twin of `isPurchasableSkin()` in js/main.js: known, and if a
 *  partner row, approved. Legacy items and indicators pass on being known. */
export function isSellableCosmetic(id) {
  if (!isKnownCosmetic(id)) return false;
  const row = PARTNER_ROWS[id];
  return !row || row.approved === true;
}
