// js/skinapproval.js — may this skin be offered at all?
//
// One predicate, one list, no imports. It lives in its own file rather than in
// js/skins.js because js/skins.js imports three.js at module scope: everything
// that has to answer this question headlessly (the validator, tools/*.test.mjs)
// and everything that must stay on the pure side of the sim boundary
// (js/upgrades.js) could not reach it there. js/skins.js re-exports both names,
// so a reader of the catalog still finds the rule where they look for it.
//
// WHY IT EXISTS AT ALL
// The `partner` family wears REAL agencies' REAL logos. Showing a company's mark
// in a shipped product is that company's decision, and only Supered has made it.
// So availability is not a property of the art, it is a property of a permission
// we either hold or do not.

// FAIL CLOSED, deliberately. A partner row is unavailable unless it says so in
// as many words, which means a ninth partner added by someone who never read
// this file lands unavailable rather than live. The inverse default — ship
// unless flagged — is the one that already leaked seven marks, and it fails in
// the direction that cannot be undone by a patch, because the logo has already
// been on screen.
//
// `=== true` rather than a truthiness test: the flag is a permission record, and
// the only value that should read as permission is the boolean someone typed on
// purpose. A hand-edited save or a stray `approved: 'pending'` reads as NO.
export function isSkinAvailable(row) {
  if (!row) return false;
  if (row.family !== 'partner') return true;   // no other family asks permission
  return row.approved === true;
}

// Turning an id into a row that is SAFE TO RENDER. Every path that resolves a
// cosmetic id goes through here — the hole skin, the nav indicator, and anything
// added later — because the failure this closes is not a shop failure.
//
// The rule it replaces was `byId.get(id) || byId.get(fallbackId)`, which falls
// back only when the id is UNKNOWN. A withdrawn row is not unknown: it is still
// in the map, still carries its builder and its traced logo, and rendered at
// full fidelity. That mattered because a skin id is not only ever chosen locally
// — it arrives over the multiplayer wire from another client (see
// buildHoleConfigs in js/multiplayer/roster.js, which passes a peer's `skin`
// through verbatim by design), so an old client, or one editing its own payload,
// could put an unapproved agency's mark on every screen in the match. A save
// migration cannot reach that; only the renderer can refuse it.
//
// Takes the Map rather than importing one, which is what keeps this module free
// of js/skins.js — and therefore of three.js — while still owning the rule.
export function resolveAvailableRow(byId, id, fallbackId) {
  const row = byId.get(id);
  // `isSkinAvailable(undefined)` is false, so an id that is missing and an id
  // that is withdrawn take the same branch. One test, both failures.
  return isSkinAvailable(row) ? row : byId.get(fallbackId);
}

// The seven marks withdrawn on 2026-08-17 when only Supered's approval was
// confirmed. Named as data, not derived from the catalog, because the refund in
// js/save.js has to keep working after these rows are deleted from js/skins.js
// — and because "which ids did we sell and then withdraw" is a fact about our
// sales history that outlives whatever the catalog happens to hold today.
//
// This list is the ROSTER; js/save.js carries its own independent price table
// for exactly that reason (see the v24 migration). Adding a withdrawal here
// without adding it there refunds nobody, and tools/partner-approval.test.mjs
// fails if the two ever disagree.
export const WITHDRAWN_PARTNER_SKIN_IDS = Object.freeze([
  'partner-newbreed',
  'partner-impulse',
  'partner-sixandflow',
  'partner-kuno',
  'partner-saltedstone',
  'partner-mediajunction',
  'partner-huble',
]);
