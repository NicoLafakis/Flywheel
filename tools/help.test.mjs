// tools/help.test.mjs — Test-Driven Development Suite for Help, FAQ, and Tips 'n Tricks
import assert from 'node:assert/strict';
import {
  HELP_TABS,
  WALKTHROUGH_MODULES,
  FAQ_ITEMS,
  TIPS_ITEMS,
  filterHelpContent,
  renderHelp,
} from '../js/ui/help.js';
import { POWERUP_TYPES } from '../js/powerups.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import { UPGRADES, SHOP_CATEGORIES } from '../js/upgrades.js';

export function runHelpSelftest() {
  let assertions = 0;
  const count = () => { assertions++; };

  // 1. Check Tabs Definitions
  assert.ok(Array.isArray(HELP_TABS), 'HELP_TABS must be an array'); count();
  assert.ok(HELP_TABS.length >= 3, 'Must have at least 3 tabs: Walkthrough, FAQ, Tips'); count();
  const tabIds = HELP_TABS.map((t) => t.id);
  assert.ok(tabIds.includes('walkthrough'), 'Must contain walkthrough tab'); count();
  assert.ok(tabIds.includes('faq'), 'Must contain FAQ tab'); count();
  assert.ok(tabIds.includes('tips'), 'Must contain tips tab'); count();

  // 2. Check Walkthrough Modules & Comprehensive Coverage
  assert.ok(Array.isArray(WALKTHROUGH_MODULES), 'WALKTHROUGH_MODULES must be an array'); count();
  assert.ok(WALKTHROUGH_MODULES.length >= 8, 'Must cover at least 8 walkthrough chapters'); count();

  const chapterIds = WALKTHROUGH_MODULES.map((m) => m.id);
  assert.ok(chapterIds.includes('core-mechanics'), 'Walkthrough must cover Core Mechanics'); count();
  assert.ok(chapterIds.includes('controls'), 'Walkthrough must cover Controls'); count();
  assert.ok(chapterIds.includes('menus-screens'), 'Walkthrough must cover Menus and Navigation'); count();
  assert.ok(chapterIds.includes('cities-progression'), 'Walkthrough must cover Cities and Progression'); count();
  assert.ok(chapterIds.includes('game-modes'), 'Walkthrough must cover Game Modes and Challenges'); count();
  assert.ok(chapterIds.includes('hud-interface'), 'Walkthrough must cover HUD and Readouts'); count();
  assert.ok(chapterIds.includes('powerups-overdrives'), 'Walkthrough must cover Power-Ups and Overdrives'); count();
  assert.ok(chapterIds.includes('combos-scoring'), 'Walkthrough must cover Combos and Scoring'); count();
  assert.ok(chapterIds.includes('shop-upgrades'), 'Walkthrough must cover Shop and Upgrades'); count();
  assert.ok(chapterIds.includes('multiplayer-arena'), 'Walkthrough must cover Multiplayer Arena'); count();

  // Verify all powerups in POWERUP_TYPES are documented in the powerups section
  const powerupsChapter = WALKTHROUGH_MODULES.find((m) => m.id === 'powerups-overdrives');
  assert.ok(powerupsChapter, 'Power-ups chapter must exist'); count();
  const powerupsText = JSON.stringify(powerupsChapter).toLowerCase();
  for (const pKey of Object.values(POWERUP_TYPES)) {
    assert.ok(
      powerupsText.includes(pKey.toLowerCase()),
      `Walkthrough power-ups chapter must document power-up type: ${pKey}`
    ); count();
  }

  // Verify all cities in CITY_CATALOG are covered in walkthrough
  const citiesChapter = WALKTHROUGH_MODULES.find((m) => m.id === 'cities-progression');
  assert.ok(citiesChapter, 'Cities chapter must exist'); count();
  const citiesText = JSON.stringify(citiesChapter).toLowerCase();
  for (const city of CITY_CATALOG) {
    assert.ok(
      citiesText.includes(city.name.toLowerCase()) || citiesText.includes(city.scene.toLowerCase()),
      `Walkthrough cities chapter must mention city: ${city.name}`
    ); count();
  }

  // Verify all upgrade tracks in UPGRADES are covered
  const upgradesChapter = WALKTHROUGH_MODULES.find((m) => m.id === 'shop-upgrades');
  assert.ok(upgradesChapter, 'Shop and upgrades chapter must exist'); count();
  const upgradesText = JSON.stringify(upgradesChapter).toLowerCase();
  for (const upg of UPGRADES) {
    assert.ok(
      upgradesText.includes(upg.name.toLowerCase()) || upgradesText.includes(upg.id.toLowerCase()),
      `Walkthrough upgrades chapter must mention upgrade: ${upg.name}`
    ); count();
  }

  // 3. Check FAQ Items
  assert.ok(Array.isArray(FAQ_ITEMS), 'FAQ_ITEMS must be an array'); count();
  assert.ok(FAQ_ITEMS.length >= 10, 'Must have at least 10 comprehensive FAQ entries'); count();
  for (const item of FAQ_ITEMS) {
    assert.ok(item.q && typeof item.q === 'string' && item.q.length > 5, 'FAQ item must have question'); count();
    assert.ok(item.a && typeof item.a === 'string' && item.a.length > 10, 'FAQ item must have answer'); count();
    assert.ok(item.category && typeof item.category === 'string', 'FAQ item must have category'); count();
  }

  // 4. Check Tips & Tricks Items
  assert.ok(Array.isArray(TIPS_ITEMS), 'TIPS_ITEMS must be an array'); count();
  assert.ok(TIPS_ITEMS.length >= 8, 'Must have at least 8 pro tips and tricks'); count();
  for (const tip of TIPS_ITEMS) {
    assert.ok(tip.title && typeof tip.title === 'string', 'Tip must have a title'); count();
    assert.ok(tip.desc && typeof tip.desc === 'string', 'Tip must have a description'); count();
    assert.ok(tip.badge && typeof tip.badge === 'string', 'Tip must have a category badge'); count();
  }

  // 5. Check Pure Search and Filter Logic
  const allWalkthrough = filterHelpContent('', 'walkthrough');
  assert.equal(allWalkthrough.length, WALKTHROUGH_MODULES.length, 'Empty search on walkthrough returns all'); count();

  const powerupSearch = filterHelpContent('vortex', 'walkthrough');
  assert.ok(powerupSearch.length >= 1, 'Search for vortex should return matching walkthrough content'); count();

  const multiplayerFaq = filterHelpContent('room code', 'faq');
  assert.ok(multiplayerFaq.length >= 1, 'Search for room code should return multiplayer FAQ'); count();

  const comboTips = filterHelpContent('combo', 'tips');
  assert.ok(comboTips.length >= 1, 'Search for combo should return combo tips'); count();

  const emptyResult = filterHelpContent('xyznonexistentterm99999', 'all');
  assert.equal(emptyResult.walkthrough.length, 0); count();
  assert.equal(emptyResult.faq.length, 0); count();
  assert.equal(emptyResult.tips.length, 0); count();

  // 7. Cloud progress sync (Phase C task 15): the FAQ must say that progress —
  // not only the name and ranked scores — follows the account across devices.
  const progressFaq = filterHelpContent('another device', 'faq');
  assert.ok(progressFaq.length >= 1, 'FAQ must answer whether progress follows you to another device'); count();
  const progressText = JSON.stringify(progressFaq).toLowerCase();
  assert.ok(progressText.includes('coins, skins'), 'progress FAQ must say "coins, skins" follow the account'); count();
  assert.ok(progressText.includes('stars'), 'progress FAQ must mention stars'); count();
  const signInFaq = filterHelpContent('sign in', 'faq');
  assert.ok(signInFaq.length >= 2, 'at least two FAQ entries must mention signing in (ranked + progress)'); count();
  assert.ok(!JSON.stringify(filterHelpContent('', 'all')).includes('http://'), 'help copy must not contain http://'); count();

  // 8. The hand-typed "(N blocks)" counts in the "29-Metropolis World Tour"
  // list must not drift from CITY_CATALOG's authoritative `blocks` field —
  // the two are independently maintained prose vs. data and have drifted
  // before (Hong Kong: catalog moved on, the copy did not).
  const worldTourBlock = citiesChapter.content.find(
    (c) => c.heading === 'The 29-Metropolis World Tour (7 Regional Acts)'
  );
  assert.ok(worldTourBlock, 'Cities chapter must contain "The 29-Metropolis World Tour" list'); count();
  const worldTourText = worldTourBlock.list.join(' ');
  let worldTourMatched = 0;
  for (const city of CITY_CATALOG) {
    // 'gallery' (THE LAB) carries a normal `blocks` field, same shape as every
    // other CITY_CATALOG row, so it needs no special-casing beyond this note
    // that the shape was checked -- it goes through the generic loop below.
    const escapedName = city.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = worldTourText.match(new RegExp(`${escapedName}\\s*\\([^)]*?([\\d][\\d,]*)\\s*blocks`));
    if (!match) continue; // city's block count is not written out as "(N blocks)" in the copy
    worldTourMatched++;
    const copyBlocks = Number(match[1].replace(/,/g, ''));
    assert.equal(
      copyBlocks,
      city.blocks,
      `World Tour copy blocks mismatch for ${city.name}: copy says "${match[1]} blocks", CITY_CATALOG says ${city.blocks.toLocaleString()}`
    ); count();
  }
  // Guard against the check going vacuous (e.g. a regex that silently matches nothing).
  assert.ok(worldTourMatched >= 25, `World Tour copy must have named block counts for most cities (found ${worldTourMatched})`); count();

  // 6. Check renderHelp function exists
  assert.equal(typeof renderHelp, 'function', 'renderHelp must be an exported function'); count();

  return assertions;
}

// When executed directly via node tools/help.test.mjs
if (process.argv[1] && process.argv[1].endsWith('help.test.mjs')) {
  console.log('Testing Help, FAQ, and Tips system...');
  const count = runHelpSelftest();
  console.log(`✓ All Help, FAQ, and Tips unit tests PASSED (${count} assertions)!`);
}
