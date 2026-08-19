// TDD Unit Test Suite: Campaign UI & Mission Dossiers (Phase 2)
//
// Asserts Act filter navigation, Sprocket Mission Dossier drawer,
// Ready Gate narrative briefings, and Victory kinetic debriefs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_CATALOG, getSortedCityCatalog, getPlayableCityCatalog } from '../js/citycatalog.js';

export function runCampaignUiSelftest() {
  let assertions = 0;
  const count = () => assertions++;

  console.log('Validating Campaign UI, Mission Dossiers & Narrative Gates...');

  // 1. Act Grouping Structure
  const ACT_KEYS = ['ALL', 'PROLOGUE', 'ACT I', 'ACT II', 'ACT III', 'ACT IV', 'ACT V', 'ACT VI', 'ACT VII'];
  const catalog = getSortedCityCatalog();

  const citiesByAct = {};
  for (const act of ACT_KEYS) {
    if (act === 'ALL') {
      citiesByAct[act] = catalog;
    } else {
      citiesByAct[act] = catalog.filter((c) => c.act === act);
    }
  }

  assert.equal(citiesByAct['ALL'].length, 29, 'ALL filter must contain all 29 cities'); count();
  assert.equal(citiesByAct['PROLOGUE'].length, 1, 'PROLOGUE filter must contain 1 city'); count();
  assert.equal(citiesByAct['ACT I'].length, 3, 'ACT I filter must contain 3 cities'); count();
  assert.equal(citiesByAct['ACT II'].length, 6, 'ACT II filter must contain 6 cities'); count();
  assert.equal(citiesByAct['ACT III'].length, 4, 'ACT III filter must contain 4 cities'); count();
  assert.equal(citiesByAct['ACT IV'].length, 4, 'ACT IV filter must contain 4 cities'); count();
  assert.equal(citiesByAct['ACT V'].length, 6, 'ACT V filter must contain 6 cities'); count();
  assert.equal(citiesByAct['ACT VI'].length, 3, 'ACT VI filter must contain 3 cities'); count();
  assert.equal(citiesByAct['ACT VII'].length, 2, 'ACT VII filter must contain 2 cities'); count();

  // 2. Mission Dossier Content Assertions across all 29 cities
  for (const city of catalog) {
    assert.ok(city.directive && city.directive.length > 5, `City ${city.scene} missing directive`); count();
    assert.ok(city.transmission && city.transmission.length > 10, `City ${city.scene} missing transmission`); count();
    assert.ok(city.debrief && city.debrief.length > 10, `City ${city.scene} missing debrief`); count();
    assert.ok(Array.isArray(city.heroes) && city.heroes.length >= 2, `City ${city.scene} missing hero landmarks`); count();
    assert.ok(city.momentumFriend && typeof city.momentumFriend === 'string', `City ${city.scene} missing momentum friend`); count();
  }

  // 3. Static Code Verification in screens.js
  const screensSrc = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');

  // Must contain Act filter tabs markup / handling
  assert.ok(screensSrc.includes('act-tabs') || screensSrc.includes('city-act-filter'), 'screens.js must render Act filter navigation tabs'); count();
  assert.ok(screensSrc.includes('mission-dossier') || screensSrc.includes('city-dossier'), 'screens.js must render Sprocket Mission Dossier drawer'); count();
  assert.ok(screensSrc.includes('city.directive') || screensSrc.includes('directive'), 'screens.js must display city tactical directive'); count();
  assert.ok(screensSrc.includes('city.transmission') || screensSrc.includes('transmission'), 'screens.js must display city transmission'); count();
  assert.ok(screensSrc.includes('city.momentumFriend') || screensSrc.includes('momentumFriend'), 'screens.js must display rescued momentum friend'); count();
  assert.ok(screensSrc.includes('UNDER CONSTRUCTION') || screensSrc.includes('COMING SOON') || screensSrc.includes('DEVELOPMENT'), 'screens.js must handle DEVELOPMENT status cities'); count();

  // Results screen debrief stinger for 100% full clear
  assert.ok(screensSrc.includes('results-debrief') || screensSrc.includes('debrief') || screensSrc.includes('KINETIC REVIVAL'), 'screens.js results screen must display victory narrative debrief'); count();

  // 4. Static Code Verification in ready.js
  const readySrc = readFileSync(new URL('../js/ui/ready.js', import.meta.url), 'utf8');
  assert.ok(readySrc.includes('directive') || readySrc.includes('rg-directive'), 'ready.js must support rendering story directive'); count();

  // 5. Static Code Verification in main.js
  const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes('directive') || mainSrc.includes('transmission'), 'main.js must pass city narrative directive/transmission to readyGate'); count();

  return assertions;
}

// Standalone execution
if (process.argv[1] && process.argv[1].endsWith('campaign-ui.test.mjs')) {
  const count = runCampaignUiSelftest();
  console.log(`ALL PASS. ${count} assertions verified in campaign-ui.test.mjs.`);
}
