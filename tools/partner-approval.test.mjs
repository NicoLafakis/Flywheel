// TDD guard: a partner logo may only be worn with that partner's approval.
//
// WHY THIS FILE EXISTS
// The partner shelf in `js/skins.js` is eight rows, each wearing a REAL agency's
// REAL logo traced from that agency's own vector file. Featuring a company's
// mark in a shipped product is a permission question, not an art question, and
// only Supered has given that permission. The other seven shipped anyway — the
// shelf was built as one set and the shop iterates it flat, so there was never a
// place where "may we show this one" got asked per row.
//
// This suite makes the answer explicit and makes it FAIL CLOSED: a `partner` row
// is unavailable unless it says `approved: true`. A ninth partner added by
// someone who never reads this file therefore lands unavailable rather than
// live, which is the only default that cannot leak a mark.
//
// WHY THE CHECKS ARE SPLIT THE WAY THEY ARE
// `js/skins.js` imports three.js at module scope, so nothing in Node can import
// the catalog. The PREDICATE therefore lives in `js/skinapproval.js` — pure, no
// imports, importable by the validator — and `js/skins.js` re-exports it so a
// reader of the catalog finds it where they look for it. The catalog ROWS are
// read the way tools/validate.mjs already reads them: as text.
//
// `js/main.js` is likewise un-importable (it pulls in three.js through
// world3d.js and touches `document` at module scope), so its `buy`/`equip`
// guards are asserted lexically, the same technique and the same limitation as
// tools/api-auth.test.mjs. That is a text check, not a behaviour check: it
// proves the guard is written, not that it fires.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isSkinAvailable, WITHDRAWN_PARTNER_SKIN_IDS, resolveAvailableRow } from '../js/skinapproval.js';
import { getShopItemsByCategory } from '../js/upgrades.js';
import { CURRENT_VERSION, __freshSave, __MIGRATIONS } from '../js/save.js';
import { buildHoleConfigs } from '../js/multiplayer/roster.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

console.log('Testing partner skin approval gating...');

// ---------------------------------------------------------------------------
// The catalog, read as text. Same slice-and-split as tools/validate.mjs, plus a
// comment blank-out: the prose above each partner row discusses approval, and a
// regex looking for `approved: true` must not read a sentence about it as data.
// ---------------------------------------------------------------------------
const skinsSrc = read('js/skins.js');
const skinsBlock = skinsSrc.slice(
  skinsSrc.indexOf('export const SKINS = ['),
  skinsSrc.indexOf('export const SKIN_BY_ID')
);
assert.ok(skinsBlock.length > 0, 'could not locate the SKINS block in js/skins.js');
const codeOnly = skinsBlock.replace(/(^|[^:])\/\/.*$/gm, '$1');

const CATALOG = codeOnly.split(/\{\s*id:\s*['"]/g).slice(1).map((chunk) => {
  const id = chunk.slice(0, chunk.indexOf("'"));
  const family = (chunk.match(/family:\s*['"]([^'"]+)['"]/) || [])[1];
  const price = Number((chunk.match(/price:\s*(\d+)/) || [])[1] ?? 0);
  const row = { id, price };
  if (family) row.family = family;
  if (/\bapproved:\s*true\b/.test(chunk)) row.approved = true;
  return row;
});
const partnerRows = CATALOG.filter((r) => r.family === 'partner');
assert.ok(partnerRows.length >= 8, `expected the 8 partner rows to still be parsed, got ${partnerRows.length}`);

// --- 1. exactly one partner is available, and it is Supered ----------------
{
  const available = partnerRows.filter(isSkinAvailable).map((r) => r.id);
  assert.deepEqual(available, ['partner-supered'],
    `exactly one partner skin may be available; got [${available.join(', ')}]`);
}

// --- 2. fails closed: no `approved` field means unapproved -----------------
// Fixture rows, never the real catalog: mutating a shipped row to test the
// predicate would prove the predicate reads a field, not that the field is
// absent from the seven rows that must not ship.
{
  assert.equal(isSkinAvailable({ id: 'partner-future', family: 'partner', price: 750 }), false,
    'a partner row with no `approved` field must be unavailable (fail closed)');
  assert.equal(isSkinAvailable({ id: 'partner-future', family: 'partner', approved: false }), false,
    'a partner row with `approved: false` must be unavailable');
  assert.equal(isSkinAvailable({ id: 'partner-future', family: 'partner', approved: 0 }), false,
    'a partner row with a falsy `approved` must be unavailable');
  assert.equal(isSkinAvailable({ id: 'partner-ok', family: 'partner', approved: true }), true,
    'a partner row with `approved: true` must be available');
  assert.equal(isSkinAvailable(null), false, 'a missing row must be unavailable');
  assert.equal(isSkinAvailable(undefined), false, 'an undefined row must be unavailable');
}

// --- 3. non-partner skins are untouched by the predicate -------------------
{
  for (const row of CATALOG.filter((r) => r.family !== 'partner')) {
    assert.equal(isSkinAvailable(row), true,
      `non-partner skin '${row.id}' (family ${row.family ?? 'none'}) must stay available`);
  }
  assert.equal(isSkinAvailable({ id: 'classic' }), true, 'a row with no family must be available');
  assert.equal(isSkinAvailable({ id: 'closer', family: 'creature' }), true,
    'creature skins carry no `approved` field and must be available');
}

// --- 4. the shop shelf offers only the approved row ------------------------
{
  const save = { ...__freshSave(), ownedItems: ['classic'] };
  const partners = getShopItemsByCategory('partners', { save, skins: CATALOG, indicatorSkins: [] });
  assert.deepEqual(partners.map((p) => p.id), ['partner-supered'],
    `the 'partners' shelf must offer only the approved row; got [${partners.map((p) => p.id).join(', ')}]`);

  // The other shelves read the same catalog through the same function and must
  // not have lost a row to this change.
  const plain = getShopItemsByCategory('skins', { save, skins: CATALOG, indicatorSkins: [] });
  const creatures = getShopItemsByCategory('creatures', { save, skins: CATALOG, indicatorSkins: [] });
  assert.equal(plain.length, CATALOG.filter((r) => !r.family).length, "the 'skins' shelf lost a row");
  assert.equal(creatures.length, CATALOG.filter((r) => r.family === 'creature').length,
    "the 'creatures' shelf lost a row");
}

// --- 5. the withdrawn list names the seven, and only the seven -------------
{
  const expected = [
    'partner-newbreed', 'partner-impulse', 'partner-sixandflow', 'partner-kuno',
    'partner-saltedstone', 'partner-mediajunction', 'partner-huble',
  ];
  assert.deepEqual([...WITHDRAWN_PARTNER_SKIN_IDS].sort(), [...expected].sort(),
    'WITHDRAWN_PARTNER_SKIN_IDS must name exactly the seven unapproved partners');
  assert.ok(!WITHDRAWN_PARTNER_SKIN_IDS.includes('partner-supered'),
    'Supered is approved and must never appear in the withdrawn list');
  // Indicators are out of scope on purpose: `ind-supered` is the only branded
  // pointer and Supered is approved. This asserts nobody widens the list into
  // INDICATOR_SKINS by accident.
  assert.ok(!WITHDRAWN_PARTNER_SKIN_IDS.some((id) => id.startsWith('ind-')),
    'no indicator id may appear in the withdrawn skin list');
}

// --- 6. the predicate is reachable from js/skins.js ------------------------
// The catalog is where a reader looks for the rule about the catalog, and the
// re-export is what lets the render-side consumers import one name rather than
// re-deriving the test.
{
  assert.match(skinsSrc, /import\s*\{[^}]*isSkinAvailable[^}]*\}\s*from\s*'\.\/skinapproval\.js'/,
    'js/skins.js must take the predicate from ./skinapproval.js rather than defining its own');
  assert.match(skinsSrc, /export\s*\{[^}]*isSkinAvailable[^}]*\}/,
    'js/skins.js must re-export isSkinAvailable so the catalog is where the rule is found');
  assert.match(skinsSrc, /export\s*\{[^}]*WITHDRAWN_PARTNER_SKIN_IDS[^}]*\}/,
    'js/skins.js must re-export WITHDRAWN_PARTNER_SKIN_IDS');
  // The rule must be defined exactly once. A second `function isSkinAvailable`
  // anywhere in js/ is a fork of the permission test.
  assert.ok(!/function isSkinAvailable/.test(skinsSrc),
    'js/skins.js must not define its own copy of isSkinAvailable');
}

// ---------------------------------------------------------------------------
// The refund migration, v23 -> v24.
// ---------------------------------------------------------------------------

// A v23 save produced by the chain itself rather than hand-written. A literal
// object at CURRENT_VERSION never enters loadSave()'s migration loop and any key
// the author forgot reads `undefined` downstream, so the fixture is built from
// freshSave() and run THROUGH migration 22 to arrive at a genuine v23 shape.
function v23Save({ ownedItems = [], coins = 0, equippedSkin = 'classic' } = {}) {
  const base = { ...__freshSave(), version: 22, ownedItems: [...ownedItems], coins, equippedSkin };
  const migrated = __MIGRATIONS[22](base);
  assert.equal(migrated.version, 23, 'fixture builder must produce a v23 save');
  return migrated;
}

// --- 7. the version bumped and the migration exists ------------------------
{
  assert.equal(CURRENT_VERSION, 24, 'CURRENT_VERSION must be 24 for the partner refund');
  assert.equal(typeof __MIGRATIONS[23], 'function', 'MIGRATIONS[23] must exist');
}

// --- 8. two withdrawn skins owned: both removed, 1500 credited -------------
{
  const before = v23Save({ ownedItems: ['classic', 'partner-huble', 'partner-kuno'], coins: 200 });
  const after = __MIGRATIONS[23](before);
  assert.equal(after.version, 24);
  assert.equal(after.coins, 200 + 1500, `expected 1700 coins after refunding two skins, got ${after.coins}`);
  assert.ok(!after.ownedItems.includes('partner-huble'), 'partner-huble must be removed from ownedItems');
  assert.ok(!after.ownedItems.includes('partner-kuno'), 'partner-kuno must be removed from ownedItems');
  assert.ok(after.ownedItems.includes('classic'), 'unrelated owned items must survive the refund');
}

// --- 9. an equipped withdrawn skin falls back to classic -------------------
{
  const before = v23Save({ ownedItems: ['partner-newbreed'], coins: 0, equippedSkin: 'partner-newbreed' });
  const after = __MIGRATIONS[23](before);
  assert.equal(after.equippedSkin, 'classic', 'an equipped withdrawn skin must fall back to classic');
  assert.equal(after.coins, 750, 'the equipped withdrawn skin must still be refunded');

  // Supered stays equipped: it is approved, and a fallback that fired for every
  // partner would strip the one skin the shelf is allowed to keep.
  const supered = __MIGRATIONS[23](v23Save({ ownedItems: ['partner-supered'], equippedSkin: 'partner-supered' }));
  assert.equal(supered.equippedSkin, 'partner-supered', 'the approved partner must stay equipped');
  assert.equal(supered.coins, 0, 'the approved partner must not be refunded');
}

// --- 10. no withdrawn ids: nothing changes ---------------------------------
{
  const before = v23Save({ ownedItems: ['classic', 'gold', 'ind-plasma'], coins: 500 });
  const after = __MIGRATIONS[23](before);
  assert.equal(after.coins, 500, 'a save holding no withdrawn ids must gain exactly 0 coins');
  assert.deepEqual(after.ownedItems, ['classic', 'gold', 'ind-plasma'], 'ownedItems must be untouched');
  assert.equal(after.equippedSkin, 'classic');

  // Idempotent in effect: the migrated output holds none of the withdrawn ids,
  // so a second pass over it credits nothing. (loadSave() cannot run it twice —
  // the version guard stops that — but a migration that double-credits when it
  // does is a migration nobody can safely re-run.)
  const twice = __MIGRATIONS[23]({ ...after, version: 23 });
  assert.equal(twice.coins, 500, 'the refund must not double-credit on a second pass');
}

// --- 11. the price table covers EVERY withdrawn id -------------------------
// Checked behaviourally rather than by reading the literal: a table missing an
// id, or carrying a wrong price for one, both show up here as a coin delta that
// is not exactly 750.
{
  for (const id of WITHDRAWN_PARTNER_SKIN_IDS) {
    const after = __MIGRATIONS[23](v23Save({ ownedItems: [id], coins: 0 }));
    assert.equal(after.coins, 750, `withdrawn id '${id}' must refund exactly 750, got ${after.coins}`);
    assert.ok(!after.ownedItems.includes(id), `withdrawn id '${id}' must be removed from ownedItems`);
  }
}

// --- 12. the migration is self-contained -----------------------------------
// THE durability constraint. A migration is permanent: it must still refund
// correctly in a build where these rows have been deleted from js/skins.js
// entirely. Reading the live catalog would make the refund silently become 0 on
// the day the rows go, so save.js carries its own literal price table and must
// not import the catalog at all.
{
  const saveSrc = read('js/save.js');
  assert.ok(!/from\s+'\.\/skins\.js'/.test(saveSrc),
    'js/save.js must not import js/skins.js — the refund table must survive the rows being deleted');
  assert.ok(!/from\s+'\.\/skinapproval\.js'/.test(saveSrc),
    'js/save.js must not import the approval module either; the migration owns its own literal table');
  for (const id of WITHDRAWN_PARTNER_SKIN_IDS) {
    assert.ok(saveSrc.includes(`'${id}'`),
      `js/save.js must carry '${id}' as a literal in the migration's own price table`);
  }
  assert.ok(/750/.test(saveSrc), 'js/save.js must carry the 750 price literal');
}

// ---------------------------------------------------------------------------
// 13. `buy()` and `equip()` refuse a withdrawn id.
//
// STATIC, not behavioural, and the limit is stated rather than hidden: js/main.js
// imports three.js transitively and touches `document` at module scope, so it
// cannot be imported headlessly. This asserts the guard is WRITTEN in both
// action bodies (same lexical technique as tools/api-auth.test.mjs), which is
// what stops the guard being deleted, not what proves it fires.
// ---------------------------------------------------------------------------
{
  const mainSrc = read('js/main.js');

  // Pull one action body out by brace matching from its declaration.
  const bodyOf = (decl) => {
    const start = mainSrc.indexOf(decl);
    assert.ok(start !== -1, `could not find '${decl}' in js/main.js`);
    let i = mainSrc.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < mainSrc.length; j++) {
      if (mainSrc[j] === '{') depth++;
      else if (mainSrc[j] === '}') { depth--; if (depth === 0) return mainSrc.slice(i, j + 1); }
    }
    throw new Error(`unbalanced braces after '${decl}'`);
  };

  assert.ok(/import\s*\{[^}]*isSkinAvailable/.test(mainSrc),
    'js/main.js must import isSkinAvailable rather than re-deriving the approval test');

  // Both actions go through ONE guard rather than each carrying its own copy,
  // so the guard itself is checked for the predicate and the two call sites are
  // checked for the guard.
  const guardBody = bodyOf('function isPurchasableSkin(id)');
  assert.ok(/isSkinAvailable/.test(guardBody),
    'isPurchasableSkin() must delegate to isSkinAvailable rather than re-deriving the family/approved test');
  assert.ok(!/family\s*===\s*'partner'/.test(guardBody),
    'isPurchasableSkin() must not re-implement the partner test');

  const buyBody = bodyOf('buy(id, price)');
  assert.ok(/isPurchasableSkin\(id\)/.test(buyBody),
    'buy() must consult the availability guard so an unavailable id cannot be purchased by a stale UI or the console');
  assert.ok(/return false/.test(buyBody), 'buy() must return false when it refuses');
  // The refusal has to happen BEFORE the spend, or the guard is decoration.
  assert.ok(buyBody.indexOf('isPurchasableSkin') < buyBody.indexOf('save.coins -='),
    'buy() must refuse before deducting coins');

  const equipBody = bodyOf('equip(id)');
  assert.ok(/isPurchasableSkin\(id\)/.test(equipBody),
    'equip() must consult the availability guard so an unavailable id cannot be worn');
  assert.ok(/return false/.test(equipBody), 'equip() must return false when it refuses');
  assert.ok(equipBody.indexOf('return false') < equipBody.indexOf('save.equippedSkin ='),
    'equip() must refuse before assigning save.equippedSkin');

  // The guard covers only skins, on purpose: `ownedItems` also holds indicator
  // ids and the legacy clock5/growth5 items, and an id the catalog does not know
  // must still be buyable.
  assert.ok(/!row\s*\|\|/.test(guardBody),
    'isPurchasableSkin() must let an id the skin catalog does not know pass through');
}

// --- 14. the shop's cosmetics summary counts only what it can sell ---------
// Same defect one line up from the category badge: the header counts
// `SKINS.length` flat, so a withdrawn row would sit in the denominator of a
// progress figure nobody can ever complete.
{
  const screensSrc = read('js/ui/screens.js');
  assert.ok(/import\s*\{[^}]*isSkinAvailable/.test(screensSrc),
    'js/ui/screens.js must import isSkinAvailable');
  const shopStart = screensSrc.indexOf('showShop(categoryId');
  assert.ok(shopStart !== -1, 'could not find showShop() in js/ui/screens.js');
  const shopHead = screensSrc.slice(shopStart, shopStart + 3000);
  assert.ok(/const availableSkins\s*=\s*SKINS\.filter\(isSkinAvailable\)/.test(shopHead),
    'showShop() must derive its counts from SKINS.filter(isSkinAvailable)');
  const partnersBadge = shopHead.split('\n').find((l) => l.trim().startsWith('partners:'));
  assert.ok(partnersBadge, "could not find the shop's `partners:` badge line");
  assert.ok(!/SKINS\.filter/.test(partnersBadge),
    "the `partners:` badge must not count the raw catalog in either half; got: " + partnersBadge.trim());
  assert.equal((partnersBadge.match(/availableSkins\.filter/g) || []).length, 2,
    'both halves of the `partners:` badge must come from the available subset');
  assert.ok(/const totalCosmetics\s*=\s*availableSkins\.length/.test(shopHead),
    'the cosmetics total must exclude unavailable skins');
}

// ---------------------------------------------------------------------------
// 15. THE RENDER PATH. Gating the shop is not gating the game.
//
// `makeSkin()` used to resolve `SKIN_BY_ID.get(id) || SKIN_BY_ID.get('classic')`
// — a fallback for an id that does not EXIST, which a withdrawn row still does.
// The save migration cannot close this: skins travel over the multiplayer wire
// (js/multiplayer/roster.js passes a peer's `skin` through verbatim, and
// js/world3d.js and js/voxelworld.js hand it to makeSkin), so an older or
// hostile client broadcasting `skin: 'partner-huble'` renders that agency's mark
// on every up-to-date screen in the match. The resolution rule has to be
// AVAILABILITY, not existence.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. `resolveAvailableRow` is the whole
// decision and it is pure, so it is exercised for real here against the real
// parsed catalog. `makeSkin()` itself cannot run in Node (three.js), so its USE
// of the resolver is pinned lexically below. Everything between the resolver and
// the GPU is unproven by this suite, by construction.
// ---------------------------------------------------------------------------
{
  const SKIN_BY_ID = new Map(CATALOG.map((r) => [r.id, r]));

  // Anti-vacuity: the resolver must be choosing, not failing to find things.
  assert.ok(SKIN_BY_ID.has('partner-huble'),
    'partner-huble must still BE in the catalog — the point of this test is that presence is not availability');
  assert.ok(SKIN_BY_ID.has('classic'), 'the classic fallback row must exist');

  // Anti-vacuity, the same idiom tools/economy-consistency.test.mjs uses for its
  // legacy sweep: the rule being replaced, written out, so this block is proved
  // CAPABLE of failing on the pre-fix behaviour rather than passing because
  // nothing here distinguishes the two rules.
  const legacyResolve = (id) => SKIN_BY_ID.get(id) || SKIN_BY_ID.get('classic');
  assert.equal(legacyResolve('partner-huble').id, 'partner-huble',
    'the pre-fix existence-only rule must still demonstrably render the withdrawn row, or this test proves nothing');

  const resolve = (id) => resolveAvailableRow(SKIN_BY_ID, id, 'classic');

  assert.equal(resolve('partner-huble').id, 'classic',
    'a withdrawn partner id must resolve to the classic row, not to its own row');
  assert.equal(resolve('partner-supered').id, 'partner-supered',
    'the approved partner must resolve to itself');
  assert.equal(resolve('classic').id, 'classic', 'classic must resolve to itself');
  assert.equal(resolve('gold').id, 'gold', 'an ordinary non-partner skin must resolve to itself');
  assert.equal(resolve('closer').id, 'closer', 'a creature skin must resolve to itself');

  // The pre-existing behaviour, which must not regress.
  assert.equal(resolve('no-such-skin-id').id, 'classic', 'an unknown id must still fall back to classic');
  assert.equal(resolve(undefined).id, 'classic', 'an undefined id must still fall back to classic');
  assert.equal(resolve(null).id, 'classic', 'a null id must still fall back to classic');

  for (const id of WITHDRAWN_PARTNER_SKIN_IDS) {
    assert.equal(resolve(id).id, 'classic', `withdrawn id '${id}' must render as classic`);
  }

  // The indicator path resolves by the SAME rule, so a future withdrawal there
  // is covered without anyone having to find this file again. `ind-supered`
  // stays available today — this asserts the rule is shared, not that anything
  // is currently gated.
  const indBlock = skinsSrc.slice(
    skinsSrc.indexOf('export const INDICATOR_SKINS = ['),
    skinsSrc.indexOf('export const INDICATOR_BY_ID')
  );
  const INDICATORS = indBlock.replace(/(^|[^:])\/\/.*$/gm, '$1').split(/\{\s*id:\s*['"]/g).slice(1)
    .map((chunk) => ({ id: chunk.slice(0, chunk.indexOf("'")) }));
  const IND_BY_ID = new Map(INDICATORS.map((r) => [r.id, r]));
  assert.ok(IND_BY_ID.has('ind-supered'), 'ind-supered must still exist — Supered is approved');
  assert.equal(resolveAvailableRow(IND_BY_ID, 'ind-supered', 'ind-default').id, 'ind-supered',
    'the approved branded indicator must be unaffected');
  assert.equal(resolveAvailableRow(IND_BY_ID, 'no-such-indicator', 'ind-default').id, 'ind-default',
    'an unknown indicator id must fall back to ind-default');
  // The rule generalises: a hypothetical future partner-family indicator with no
  // approval must fall back, without any further code change.
  const futureInd = new Map([...IND_BY_ID, ['ind-future', { id: 'ind-future', family: 'partner' }]]);
  assert.equal(resolveAvailableRow(futureInd, 'ind-future', 'ind-default').id, 'ind-default',
    'an unapproved partner-family indicator must fall back automatically');

  // --- the wire seam ------------------------------------------------------
  // Real function, real peer payload: js/multiplayer/roster.js is pure (it
  // imports only fwmath.js) so the hostile roster entry is exercised for real,
  // and its output is fed through the real resolver.
  const configs = buildHoleConfigs([
    { name: 'HostPlayer', skin: 'classic', color: '#ffffff' },
    { name: 'OldClient', skin: 'partner-huble', color: '#ff0000' },
    { name: 'HostilePeer', skin: 'partner-kuno', color: '#00ff00' },
    { name: 'Legit', skin: 'partner-supered', color: '#0000ff' },
  ]);
  assert.equal(configs.length, 4, 'the roster must keep one config per slot');
  assert.equal(configs[1].skin, 'partner-huble',
    'the roster still passes the wire value through verbatim — it is the RENDERER that must refuse it');

  const rendered = configs.map((c) => resolve(c.skin).id);
  assert.deepEqual(rendered, ['classic', 'classic', 'classic', 'partner-supered'],
    `a peer-supplied withdrawn skin must not render; got [${rendered.join(', ')}]`);
  for (const id of rendered) {
    assert.ok(!WITHDRAWN_PARTNER_SKIN_IDS.includes(id),
      `a withdrawn skin id '${id}' reached the renderer over the multiplayer wire`);
  }

  // --- the wiring, pinned lexically ---------------------------------------
  // makeSkin() needs three.js and cannot run here, so this asserts it USES the
  // resolver. The negative assertion is the load-bearing one: the exact
  // `SKIN_BY_ID.get(id) ||` shape is the defect, and it must not come back.
  assert.ok(/export function skinRowFor\(id\)/.test(skinsSrc),
    'js/skins.js must expose skinRowFor() as the one place a skin id becomes a row');
  assert.ok(/export function indicatorRowFor\(id\)/.test(skinsSrc),
    'js/skins.js must expose indicatorRowFor() so the indicator path shares the rule');
  const makeSkinBody = skinsSrc.slice(skinsSrc.indexOf('export function makeSkin(id)'));
  assert.ok(/const row = skinRowFor\(id\)/.test(makeSkinBody.slice(0, 400)),
    'makeSkin() must resolve through skinRowFor()');
  assert.ok(!/SKIN_BY_ID\.get\(id\)\s*\|\|/.test(skinsSrc),
    'the existence-only fallback `SKIN_BY_ID.get(id) || ...` must not exist anywhere in js/skins.js');
  assert.ok(!/INDICATOR_BY_ID\.get\([^)]*\)\s*\|\|/.test(read('js/voxelworld.js')),
    'js/voxelworld.js must not resolve indicators by existence — use indicatorRowFor()');
  assert.ok(/indicatorRowFor/.test(read('js/voxelworld.js')),
    'js/voxelworld.js must resolve its indicator through indicatorRowFor()');
}

console.log('  partner-approval: passed.');
