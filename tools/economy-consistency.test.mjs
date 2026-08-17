// TDD Unit Test: economy consistency (T-701 coin ladder, T-702 growth upgrade)
//
// Two defects, both in the part of the game a player spends money on, and both
// invisible to every existing gate because no suite ever compared the two coin
// tables to each other or asserted that a purchased upgrade moves a number.
//
// T-701 — the coin ladder had two copies and they disagreed.
//   `js/citycatalog.js` is the DECLARED economy: it is what the city-select card
//   prints ("60 COINS (+25 CLEAR)") and what `validateCityChallenges` computes
//   its expected payouts from. `CITY_COIN_TIERS` in `js/voxelsim.js` is the one
//   the running sim actually reads (`getCityCoinTier` -> `sim.coinCount/
//   coinValue/goalBonus`). Commit 6902032 introduced both halves in agreement
//   (`gallery: 60 x 1 / +25`, documented in STATUS.md as the bottom of the
//   ladder). Commit 08d104b — a power-up/boot/audio commit that rewrote most of
//   voxelsim.js and never mentions the economy — silently replaced the gallery
//   row with a byte-for-byte copy of `tokyo`'s apex row, so the first, easiest,
//   always-unlocked scene paid 200 x 5 / +500 while advertising 60 x 1 / +25.
//   The fix is not "put 60 back": it is to derive the tier table FROM the
//   catalog so the two cannot disagree again.
//
// T-702 — the `growth` upgrade did nothing in the campaign.
//   `Mass Assimilator` (20 ranks, 27,195 coins to max) and the `growth5` shop
//   item (500 coins, "Mass gained is 5% higher") both feed `options.growthBonus`
//   into the campaign `Sim`, which stored it on `this.growthBonus` and never
//   read it again. The same upgrade IS wired in the voxel sandbox
//   (`h.growthMult` multiplied into `effectiveRaw`), so the identical purchase
//   worked in one mode and was a pure coin sink in the other.
//
// T-704 — the landing screen advertised two things no shop screen sells.
//   `nextUnlock()` in `js/ui/screens.js` builds the "next unlock" goal meter by
//   walking three lists: `SKINS`, `INDICATOR_SKINS`, and a module-local `ITEMS`
//   holding the two pre-upgrade-track legacy rows (`clock5` 400, `growth5` 500).
//   `getShopItemsByCategory` — the ONLY thing `showShop` renders from — has five
//   branches (skins / creatures / partners / indicators / upgrades) and not one
//   of them returns `ITEMS`. So a player who already owns everything priced at
//   or below 400 gets told their next unlock is "+5s Clock — 400 coins" and can
//   then open every tab in the shop without finding it. The fix is not to delete
//   the legacy rows (saves still reference them, and an owner must keep what
//   they own) but to derive the teaser's candidate set from the same registry
//   the shop renders from, so the two cannot drift apart again.
//
// Everything here is headless and seeded: the campaign pair is driven by one
// greedy bot whose steering comes from the BASELINE sim, so both runs receive
// byte-identical input and the only variable is the growth bonus.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CITY_CATALOG } from '../js/citycatalog.js';
import { CITY_COIN_TIERS, getCityCoinTier, VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { Sim } from '../js/sim.js';
import { getLevel } from '../js/levels.js';
import { isEdible } from '../js/tiers.js';
import { MAX_UPGRADE_RANK, upgradeCost, upgradeMultiplier, SHOP_CATEGORIES, getShopItemsByCategory } from '../js/upgrades.js';

console.log('Testing economy consistency (T-701 coin ladder, T-702 growth upgrade)...');

// core.autocrlf is on, so a working-tree file may be CRLF or LF depending on
// who last wrote it. Every static assertion below reads normalized text.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ===========================================================================
// T-701 — the displayed coin ladder and the paid coin ladder are one table
// ===========================================================================

console.log('\n--- T-701: CITY_COIN_TIERS agrees with CITY_CATALOG ---');
{
  const COIN_FIELDS = ['coinCount', 'coinValue', 'goalBonus'];

  // Every catalog city must have a tier, and every field must match. This is
  // the whole defect class, not just the gallery instance.
  for (const city of CITY_CATALOG) {
    const tier = CITY_COIN_TIERS[city.scene];
    assert.ok(tier, `CITY_COIN_TIERS has no row for catalog scene '${city.scene}'`);
    for (const f of COIN_FIELDS) {
      assert.equal(
        tier[f], city[f],
        `${city.scene}.${f}: the sim pays ${tier[f]} but the city-select card advertises ${city[f]}`,
      );
    }
  }

  // ...and no orphan rows: a tier with no catalog city is a payout no surface
  // can display, which is how the two tables drifted in the first place.
  const catalogScenes = new Set(CITY_CATALOG.map((c) => c.scene));
  for (const scene of Object.keys(CITY_COIN_TIERS)) {
    assert.ok(catalogScenes.has(scene), `CITY_COIN_TIERS row '${scene}' has no city in CITY_CATALOG`);
  }

  // The specific regression, pinned by name so a future re-copy fails loudly
  // rather than merely making the loop above red with a generic message.
  const gallery = getCityCoinTier('gallery');
  const tokyo = getCityCoinTier('tokyo');
  assert.deepEqual(
    { coinCount: gallery.coinCount, coinValue: gallery.coinValue, goalBonus: gallery.goalBonus },
    { coinCount: 60, coinValue: 1, goalBonus: 25 },
    'THE LAB must pay the STARTER tier it advertises (60 x 1 / +25)',
  );
  assert.notDeepEqual(
    { c: gallery.coinCount, v: gallery.coinValue, g: gallery.goalBonus },
    { c: tokyo.coinCount, v: tokyo.coinValue, g: tokyo.goalBonus },
    'the first, easiest scene must not pay the apex scene\'s rate (the 08d104b copy-paste)',
  );

  // The ladder must be monotonic in the catalog's own difficulty order, so a
  // harder city is never worth less than an easier one.
  const ladder = [...CITY_CATALOG].sort((a, b) => a.blocks - b.blocks);
  for (let i = 1; i < ladder.length; i++) {
    const prev = getCityCoinTier(ladder[i - 1].scene);
    const cur = getCityCoinTier(ladder[i].scene);
    for (const f of COIN_FIELDS) {
      assert.ok(
        cur[f] >= prev[f],
        `coin ladder goes backwards at ${ladder[i].scene}.${f}: ${prev[f]} -> ${cur[f]}`,
      );
    }
  }
  console.log(`  coin ladder: ${CITY_CATALOG.length} cities agree across both tables, monotonic.`);
}

console.log('\n--- T-701: a live gallery sim reads the starter tier ---');
{
  // The table agreeing is not the same as the SIM reading the agreeing table:
  // `getCityCoinTier` is called once in the constructor, so this is the only
  // assertion that proves what a player is actually paid.
  await loadScene('gallery');
  const sim = new VoxelSandboxSim({ seed: 'economy-consistency', scene: 'gallery' });
  assert.equal(sim.coinCount, 60, 'gallery sim spawns the wrong number of ground coins');
  assert.equal(sim.coinValue, 1, 'gallery sim pays the wrong value per ground coin');
  assert.equal(sim.goalBonus, 25, 'gallery sim pays the wrong 100%-clear bonus');
  assert.equal(sim.coins.length, 60, 'gallery sim placed a coin count that disagrees with its own tier');

  // Full-clear payout, the number the results screen prints.
  const galleryClear = sim.coinCount * sim.coinValue + sim.goalBonus;
  const tokyoTier = getCityCoinTier('tokyo');
  const tokyoClear = tokyoTier.coinCount * tokyoTier.coinValue + tokyoTier.goalBonus;
  assert.equal(galleryClear, 85, `a 100% clear of THE LAB must pay 85, got ${galleryClear}`);
  assert.ok(
    galleryClear < tokyoClear,
    `THE LAB pays ${galleryClear} for a full clear and TOKYO pays ${tokyoClear} — the tutorial must not out-earn the apex`,
  );
  console.log(`  gallery full clear pays ${galleryClear}; tokyo pays ${tokyoClear}.`);
}

// ===========================================================================
// T-702 — the growth upgrade changes campaign mass gain
// ===========================================================================

const DT = 1 / 60;

/** Greedy bot move, lifted from validate.mjs's `runBot`: steer at the nearest edible. */
function greedyMove(sim) {
  const p = sim.player;
  let best = null, bestD = Infinity;
  sim.city.hash.query(p.x, p.z, 60, (o) => {
    if (o.eaten || o.shielded) return;
    if (!isEdible(p.radius, o.tier)) return;
    const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
    if (d < bestD) { bestD = d; best = o; }
  });
  if (!best) {
    for (const o of sim.city.objects) {
      if (o.eaten || o.shielded || !isEdible(p.radius, o.tier)) continue;
      const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    }
  }
  return best ? { x: best.x - p.x, z: best.z - p.z } : { x: 0, z: 0 };
}

console.log('\n--- T-702: the purchase is real, and main.js still routes it ---');
{
  // If the growth track ever stops costing coins, or main.js stops feeding the
  // bonus in, the wiring assertions below would still pass while measuring
  // nothing. These two keep this suite honest about what it is guarding.
  assert.equal(upgradeCost(0), 100, 'the growth track no longer costs coins — this suite has stopped guarding a purchase');
  assert.equal(upgradeMultiplier(MAX_UPGRADE_RANK), 2.0, 'rank 20 must be +100%');
  const mainSrc = src('../js/main.js');
  assert.match(
    mainSrc,
    /growthBonus:\s*\(upgradeMultiplier\(save\.upgrades\?\.growth\)\s*-\s*1\.0\)/,
    'js/main.js no longer derives growthBonus from the growth upgrade rank — this guard has stopped watching anything',
  );
  assert.match(
    mainSrc,
    /growthBonus:\s*shopBonus\.growthBonus/,
    'js/main.js no longer passes growthBonus into the campaign Sim — this guard has stopped watching anything',
  );
}

console.log('\n--- T-702: growth bonus multiplies campaign mass gain ---');
{
  const LEVEL = getLevel(1);
  const BONUS = upgradeMultiplier(MAX_UPGRADE_RANK) - 1.0; // rank 20 -> +100%
  const TICKS = 1800; // 30 s

  const base = new Sim(LEVEL);
  const boosted = new Sim(LEVEL, { growthBonus: BONUS });
  assert.equal(base.growthBonus, 0, 'an un-upgraded campaign Sim must default to no growth bonus');

  let firstEat = null;

  for (let t = 0; t < TICKS; t++) {
    // ONE move vector, from the baseline sim, fed to both: the only difference
    // between the two runs is the bonus.
    const move = greedyMove(base);
    const prefixIdentical = base.player.eatenCount === 0;
    base.step(DT, move);
    boosted.step(DT, move);

    if (prefixIdentical) {
      // Before the player's first bite the two worlds are bit-identical, so a
      // rival gaining a different amount here means the bonus leaked onto the
      // AI holes — the sandbox gates it on `isPlayer` and so must this.
      const rivalGain = (s) => s.events.filter((e) => e.type === 'eat' && !e.hole.isPlayer).map((e) => e.gained);
      assert.deepEqual(rivalGain(boosted), rivalGain(base), 'the growth bonus must not apply to rival holes');
    }
    base.events.length = 0;
    boosted.events.length = 0;

    if (firstEat === null && base.player.eatenCount >= 1) {
      firstEat = { base: base.player.mass, boosted: boosted.player.mass, eaten: base.player.eatenCount, bEaten: boosted.player.eatenCount };
    }
  }

  assert.ok(firstEat, `the bot never ate anything in ${TICKS} ticks — this suite is measuring nothing`);
  assert.equal(firstEat.bEaten, firstEat.eaten, 'the two runs diverged before the first bite — the comparison is not controlled');

  // The exact contract, measured at the instant the prefix stops being shared:
  // growth multiplies the RAW mass before the combo multiplier, exactly as
  // `_award` does in js/voxelsim.js. One bite in, that makes the ratio exact.
  const ratio = firstEat.boosted / firstEat.base;
  assert.ok(
    Math.abs(ratio - (1 + BONUS)) < 1e-9,
    `first bite paid ${firstEat.base} without the upgrade and ${firstEat.boosted} with it (ratio ${ratio}) — expected exactly x${1 + BONUS}`,
  );

  // ...and it still reads as an advantage over a whole run, not just one bite.
  assert.ok(
    boosted.player.mass > base.player.mass,
    `after ${TICKS} ticks the upgraded run has ${boosted.player.mass} mass and the un-upgraded run has ${base.player.mass} — the purchase must be worth something`,
  );

  console.log(`  first bite: ${firstEat.base} -> ${firstEat.boosted} (x${ratio}).`);
  console.log(`  ${TICKS} ticks: ${base.player.mass.toFixed(1)} -> ${boosted.player.mass.toFixed(1)} mass.`);
}

console.log('\n--- T-702: zero bonus is bit-identical to no bonus (beatability proof) ---');
{
  // The campaign beatability proof constructs `new Sim(level)` with no options.
  // Wiring the bonus must not move that run by a single float, or every
  // winnability guarantee in validate.mjs is measuring a different game.
  const LEVEL = getLevel(1);
  const plain = new Sim(LEVEL);
  const explicitZero = new Sim(LEVEL, { growthBonus: 0 });
  for (let t = 0; t < 900; t++) {
    const move = greedyMove(plain);
    plain.step(DT, move);
    explicitZero.step(DT, move);
    plain.events.length = 0;
    explicitZero.events.length = 0;
  }
  assert.equal(explicitZero.player.mass, plain.player.mass, 'growthBonus: 0 changed the un-upgraded run');
  assert.equal(explicitZero.player.eatenCount, plain.player.eatenCount, 'growthBonus: 0 changed what the un-upgraded run ate');
  console.log(`  un-upgraded run unchanged: ${plain.player.mass.toFixed(1)} mass, ${plain.player.eatenCount} eaten.`);
}

// ===========================================================================
// T-703 — the legacy `growth5` item is not paid on top of the rank it became
// ===========================================================================

console.log('\n--- T-703: `growth5` is counted once, not twice ---');
{
  // js/main.js cannot be imported headlessly: line 30 is a module-scope
  // `document.getElementById`, and its import graph reaches three.js through
  // world3d.js. So the object literal is lifted out of the source text and
  // EVALUATED against synthetic saves — these assertions are on the number the
  // shipped line actually produces, not on the shape of the text producing it.
  const mainSrc = src('../js/main.js');
  const literal = mainSrc.match(/function computeShopBonus\(\)\s*\{\s*shopBonus\s*=\s*(\{[\s\S]*?\n\s*\});/);
  assert.ok(
    literal,
    'could not lift the computeShopBonus object literal out of js/main.js — this guard has stopped watching anything',
  );
  const evalShopBonus = new Function('save', 'upgradeMultiplier', `return ${literal[1]};`);
  const growthBonusFor = (ownedItems, growth) =>
    evalShopBonus({ ownedItems, upgrades: { growth } }, upgradeMultiplier).growthBonus;

  // The pre-v20 player. `__MIGRATIONS[19]` in js/save.js converts owning
  // `growth5` into `upgrades.growth >= 1`, and rank 1 IS +5% (`upgradeMultiplier
  // (1) === 1.05`) — so the item and the rank are one purchase recorded twice,
  // not two effects. Anyone who bought the 500-coin item before the upgrade
  // tracks existed carries both markers in their save forever, so adding the
  // item's 5% on top of the migrated rank's 5% pays them +10% for one purchase.
  const migrated = growthBonusFor(['growth5'], 1);
  assert.ok(
    Math.abs(migrated - 0.05) < 1e-12,
    `a migrated 'growth5' owner must get +5% total, got +${(migrated * 100).toFixed(1)}% — the legacy item is being paid on top of the rank it migrated into`,
  );
  assert.ok(
    Math.abs(migrated - 0.10) > 1e-9,
    "a migrated 'growth5' owner is being paid the same 5% twice (+10%)",
  );

  // The cross-mode contract, mode against mode rather than against a constant.
  // The sandbox reads `save.upgrades` alone (`this.growthMult =
  // upgradeMultiplier(upgrades?.growth)`) and never sees `ownedItems`, so ANY
  // growth5 term in the campaign number is by construction an advantage the
  // same player does not get in a city. Exact equality is legitimate here:
  // `m - 1` is exact for m in [1,2], so `1 + (m - 1) === m` at every rank.
  const sandbox = new VoxelSandboxSim({ seed: 'growth-parity', scene: 'gallery', upgrades: { growth: 1 } });
  assert.equal(
    1 + migrated, sandbox.growthMult,
    `the same save grows x${1 + migrated} in the campaign and x${sandbox.growthMult} in the city sandbox`,
  );

  // ...at every rank, and with the legacy marker present or absent. A player
  // who never owned `growth5` is the regression risk of this fix: their number
  // must not move by a single float.
  for (let rank = 0; rank <= MAX_UPGRADE_RANK; rank++) {
    const expected = upgradeMultiplier(rank) - 1.0;
    assert.equal(
      growthBonusFor([], rank), expected,
      `rank ${rank} with nothing owned must be exactly the rank's own bonus`,
    );
    assert.equal(
      growthBonusFor(['clock5', 'skin-neon'], rank), expected,
      `rank ${rank}: an unrelated owned item changed the growth bonus`,
    );
    // The migration floors a growth5 owner at rank 1, so rank 0 + growth5 is a
    // save state that cannot exist; every reachable one is checked here.
    const owned = Math.max(1, rank);
    assert.equal(
      growthBonusFor(['growth5'], owned), upgradeMultiplier(owned) - 1.0,
      `rank ${owned}: owning the legacy 'growth5' still stacks a second 5% on top of the rank`,
    );
  }

  console.log(`  migrated growth5 owner: +${(migrated * 100).toFixed(0)}% campaign, x${sandbox.growthMult} sandbox — one 5%, both modes.`);
}

// ===========================================================================
// T-704 — every row the "next unlock" teaser can point at is a row the shop
//         can actually render
// ===========================================================================

console.log('\n--- T-704: the next-unlock teaser only advertises what the shop sells ---');
{
  // js/ui/screens.js cannot be imported headlessly either: `js/skins.js` reaches
  // three.js with a bare `import * as THREE from 'three'` and there is no
  // node_modules in this repo. So `nextUnlock` is LIFTED out of the source text
  // and evaluated with the registries injected — these assertions run the
  // shipped function against the shipped price lists, not a paraphrase of them.
  const screensSrc = src('../js/ui/screens.js');

  // The two skin registries, parsed from source for the same reason. Unlike the
  // throwaway parse in validate.mjs's shop section, this one keeps the REAL
  // prices: the whole defect is about which row is cheapest, so a synthetic
  // price would make the sweep below meaningless.
  const skinsSrc = src('../js/skins.js');
  const parseRegistry = (openTag, closeTag) => {
    const start = skinsSrc.indexOf(openTag);
    const end = skinsSrc.indexOf(closeTag);
    assert.ok(start !== -1 && end > start, `could not locate ${openTag} in js/skins.js`);
    return skinsSrc.slice(start, end).split(/\{\s*id:\s*'/g).slice(1).map((chunk) => {
      const id = chunk.slice(0, chunk.indexOf("'"));
      const name = chunk.match(/name:\s*'([^']*)'/);
      const price = chunk.match(/price:\s*(\d+)/);
      const css = chunk.match(/css:\s*'([^']*)'/);
      const family = chunk.match(/family:\s*'([^']*)'/);
      return {
        id,
        name: name ? name[1] : id,
        price: price ? Number(price[1]) : null,
        css: css ? css[1] : undefined,
        family: family ? family[1] : undefined,
      };
    });
  };
  const SKINS = parseRegistry('export const SKINS = [', 'export const SKIN_BY_ID');
  const INDICATOR_SKINS = parseRegistry('export const INDICATOR_SKINS = [', 'export const INDICATOR_BY_ID');

  // Anti-vacuity on the parse itself: a regex that quietly matched nothing would
  // hand every assertion below an empty world to trivially satisfy.
  assert.ok(SKINS.length >= 30, `parsed only ${SKINS.length} skins out of js/skins.js — the registry parse is broken`);
  assert.ok(INDICATOR_SKINS.length >= 5, `parsed only ${INDICATOR_SKINS.length} indicators out of js/skins.js`);
  assert.equal(SKINS.find((s) => s.id === 'funnel')?.price, 100, "parsed the wrong price for the 'funnel' skin — prices are not coming through");
  assert.equal(INDICATOR_SKINS.find((i) => i.id === 'ind-cosmic')?.price, 1000, "parsed the wrong price for 'ind-cosmic' — prices are not coming through");
  assert.ok(SKINS.some((s) => s.family === 'creature') && SKINS.some((s) => s.family === 'partner'), 'the parsed skin rows carry no family, so the category split cannot be exercised');

  // The legacy rows. Still exported, still owned by real saves — this suite
  // guards that they are not ADVERTISED, not that they were deleted.
  const itemsLiteral = screensSrc.match(/export const ITEMS = (\[[\s\S]*?\n\]);/);
  assert.ok(itemsLiteral, 'could not lift the ITEMS literal out of js/ui/screens.js — this guard has stopped watching anything');
  const ITEMS = new Function(`return ${itemsLiteral[1]};`)();
  assert.ok(ITEMS.length > 0, 'ITEMS is empty — the legacy rows were deleted, which strands every save that owns one');
  const LEGACY_IDS = new Set(ITEMS.map((i) => i.id));
  assert.ok(LEGACY_IDS.has('clock5') && LEGACY_IDS.has('growth5'), 'the legacy shop rows are no longer in ITEMS — owners must keep what they own');

  // ---- what the shop can actually render -----------------------------------
  // Straight from `getShopItemsByCategory`, over `SHOP_CATEGORIES`, exactly as
  // `showShop` does. Nothing here is a hand-maintained list.
  assert.ok(SHOP_CATEGORIES.length > 0, 'SHOP_CATEGORIES is empty — the shop source did not resolve');
  const shopIds = new Set();
  for (const cat of SHOP_CATEGORIES) {
    const rows = getShopItemsByCategory(cat.id, {
      save: { ownedItems: [], coins: 0, upgrades: {} },
      skins: SKINS,
      indicatorSkins: INDICATOR_SKINS,
    });
    assert.ok(rows.length > 0, `shop category '${cat.id}' rendered nothing — the category source did not resolve`);
    for (const r of rows) shopIds.add(r.id);
  }
  assert.ok(shopIds.size >= SKINS.length + INDICATOR_SKINS.length, `the shop only renders ${shopIds.size} rows against ${SKINS.length + INDICATOR_SKINS.length} catalogued cosmetics`);
  for (const id of LEGACY_IDS) {
    assert.ok(!shopIds.has(id), `'${id}' is now rendered by the shop — this suite's premise is stale and needs rewriting`);
  }

  // ---- what the teaser can point at ----------------------------------------
  const fnSrc = screensSrc.match(/\nfunction nextUnlock\(save\) \{[\s\S]*?\n\}\n/);
  assert.ok(fnSrc, 'could not lift nextUnlock() out of js/ui/screens.js — this guard has stopped watching anything');
  const makeNextUnlock = () => new Function(
    'SKINS', 'INDICATOR_SKINS', 'ITEMS', 'SHOP_CATEGORIES', 'getShopItemsByCategory',
    `${fnSrc[0]}\nreturn nextUnlock;`,
  )(SKINS, INDICATOR_SKINS, ITEMS, SHOP_CATEGORIES, getShopItemsByCategory);
  const nextUnlock = makeNextUnlock();

  // `nextUnlock` only ever returns ONE row, so the full set of rows it can
  // surface is enumerated by buying whatever it just suggested and asking again.
  // Two sweeps, because the function has two branches: at 0 coins every unowned
  // row is priced above the bank (the `goal` branch) and at a huge balance every
  // one is already covered (the `ready` branch).
  const sweep = (fn, coins) => {
    const owned = [];
    const seen = [];
    for (let i = 0; i < 500; i++) {
      const row = fn({ ownedItems: [...owned], coins });
      if (!row) return seen;
      seen.push(row);
      owned.push(row.id);
    }
    assert.fail('the next-unlock sweep never ran out of rows — it is not consuming what it suggests');
  };

  const broke = sweep(nextUnlock, 0);
  const rich = sweep(nextUnlock, 1e9);

  // Anti-vacuity on the sweep: a teaser that surfaced nothing would satisfy the
  // subset assertion below for free.
  assert.ok(broke.length > 0, 'the next-unlock teaser can surface nothing at all — this suite is measuring an empty set');
  assert.deepEqual(
    rich.map((r) => r.id), broke.map((r) => r.id),
    'the teaser surfaces a different set of rows depending on the bank — the two branches disagree about what is for sale',
  );

  // The pre-fix behaviour, written out here so the sweep is proved CAPABLE of
  // surfacing a legacy row. Without this the subset assertion could pass simply
  // because nothing in this harness can ever reach one.
  const legacyNextUnlock = (save) => {
    const owned = save.ownedItems || [];
    let goal = null, ready = null;
    const consider = (row, kind) => {
      if (!row || !row.price || owned.includes(row.id)) return;
      const entry = { id: row.id, name: row.name, price: row.price, kind, css: row.css };
      if (row.price > save.coins) { if (!goal || row.price < goal.price) goal = entry; }
      else if (!ready || row.price < ready.price) ready = entry;
    };
    for (const s of SKINS) consider(s, 'HOLE SKIN');
    for (const i of INDICATOR_SKINS) consider(i, 'NAV INDICATOR');
    for (const it of ITEMS) consider(it, 'UPGRADE');
    return goal || ready;
  };
  const legacySweep = sweep(legacyNextUnlock, 0);
  const legacyReached = legacySweep.filter((r) => LEGACY_IDS.has(r.id)).map((r) => r.id);
  assert.deepEqual(
    legacyReached.sort(), [...LEGACY_IDS].sort(),
    'the sweep cannot reach the legacy rows even with the old code — it would pass the real assertion vacuously',
  );

  // ---- THE DEFECT ----------------------------------------------------------
  const unsellable = broke.filter((r) => !shopIds.has(r.id));
  assert.deepEqual(
    unsellable, [],
    `the next-unlock teaser advertises ${unsellable.length} item(s) no shop category renders: ` +
    unsellable.map((r) => `'${r.id}' (${r.name}, ${r.price} coins, shown as ${r.kind})`).join(', ') +
    ' — a player can save up for it and never find a screen that sells it',
  );

  // ---- and nothing sellable was lost on the way -----------------------------
  // Byte-identical for every row the shop CAN sell: the fix must subtract the
  // unbuyable rows and change nothing else — not an id, not a price, not the
  // kind label the card prints, not the order ties resolve in.
  assert.deepEqual(
    broke, legacySweep.filter((r) => !LEGACY_IDS.has(r.id)),
    'the teaser changed what it says about a row the shop really does sell',
  );

  console.log(`  teaser reaches ${broke.length} rows, all ${shopIds.size} shop-renderable; legacy ${[...LEGACY_IDS].join('/')} still exported, no longer advertised.`);
}

console.log('\neconomy consistency: all assertions passed.');
