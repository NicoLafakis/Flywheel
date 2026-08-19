// TDD Unit Test Suite: Global Campaign & 29-Metropolis World Tour (Phase 1)
//
// Asserts the 29-metropolis catalog, 7 regional Acts, mission transmissions,
// hero landmark rosters, momentum friends, progression gates, and economy parity.

import assert from 'node:assert/strict';
import {
  CITY_CATALOG,
  getSortedCityCatalog,
  getPlayableCityCatalog,
  isCityUnlocked,
  isCityChallengeCompleted,
  getCompletedChallengeCount,
  isSecret90sChallengeUnlocked,
} from '../js/citycatalog.js';
import { __freshSave, recordChallengeResult } from '../js/save.js';

export function runCampaignSelftest() {
  let assertions = 0;
  const count = () => assertions++;

  console.log('Validating Global Campaign 29-City Roster & Act Architecture...');

  // 1. Catalog Count & Uniqueness
  assert.equal(CITY_CATALOG.length, 29, `CITY_CATALOG must contain exactly 29 metropolises, found ${CITY_CATALOG.length}`); count();

  const scenes = new Set();
  for (const city of CITY_CATALOG) {
    assert.ok(city.scene && typeof city.scene === 'string', `City scene id missing or invalid: ${JSON.stringify(city)}`); count();
    assert.ok(!scenes.has(city.scene), `Duplicate scene ID in CITY_CATALOG: ${city.scene}`); count();
    scenes.add(city.scene);
  }

  // 2. Schema Completeness per Metropolis
  const REQUIRED_FIELDS = [
    'scene', 'name', 'location', 'act', 'actTitle', 'sub', 'desc', 'tagline', 'chapter',
    'status', 'blocks', 'difficulty', 'badge', 'accentColor', 'icon',
    'coinCount', 'coinValue', 'goalBonus', 'heroes', 'momentumFriend',
    'directive', 'transmission', 'debrief',
  ];

  const VALID_ACTS = new Set([
    'PROLOGUE', 'ACT I', 'ACT II', 'ACT III', 'ACT IV', 'ACT V', 'ACT VI', 'ACT VII',
  ]);

  for (const city of CITY_CATALOG) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        city[field] !== undefined && city[field] !== null,
        `City '${city.scene}' missing required field: ${field}`,
      ); count();
    }

    assert.ok(VALID_ACTS.has(city.act), `City '${city.scene}' has invalid act '${city.act}'`); count();
    assert.ok(['PLAYABLE', 'DEVELOPMENT'].includes(city.status), `City '${city.scene}' status must be PLAYABLE or DEVELOPMENT, got '${city.status}'`); count();
    assert.ok(typeof city.blocks === 'number' && city.blocks > 0, `City '${city.scene}' blocks must be positive integer`); count();
    assert.ok(typeof city.coinCount === 'number' && city.coinCount > 0, `City '${city.scene}' coinCount must be positive integer`); count();
    assert.ok(typeof city.coinValue === 'number' && city.coinValue > 0, `City '${city.scene}' coinValue must be positive integer`); count();
    assert.ok(typeof city.goalBonus === 'number' && city.goalBonus > 0, `City '${city.scene}' goalBonus must be positive integer`); count();
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(city.accentColor), `City '${city.scene}' accentColor must be #rrggbb hex, got '${city.accentColor}'`); count();
    assert.ok(Array.isArray(city.heroes) && city.heroes.length >= 2, `City '${city.scene}' heroes must be an array of >= 2 landmark names`); count();
    assert.ok(typeof city.momentumFriend === 'string' && city.momentumFriend.length > 0, `City '${city.scene}' momentumFriend must be non-empty string`); count();
    assert.ok(typeof city.directive === 'string' && city.directive.length > 5, `City '${city.scene}' directive must be non-empty string`); count();
    assert.ok(typeof city.transmission === 'string' && city.transmission.length > 10, `City '${city.scene}' transmission must be descriptive`); count();
    assert.ok(typeof city.debrief === 'string' && city.debrief.length > 10, `City '${city.scene}' debrief must be descriptive`); count();
  }

  // 3. Act Distribution Integrity
  const actDistribution = {};
  for (const city of CITY_CATALOG) {
    actDistribution[city.act] = (actDistribution[city.act] || 0) + 1;
  }
  assert.equal(actDistribution['PROLOGUE'], 1, 'Prologue must have 1 city (The Lab)'); count();
  assert.equal(actDistribution['ACT I'], 3, 'Act I must have 3 cities (Sydney, Auckland, Singapore)'); count();
  assert.equal(actDistribution['ACT II'], 6, 'Act II must have 6 cities (Hong Kong, Seoul, Tokyo, Beijing, Bangkok, Mumbai)'); count();
  assert.equal(actDistribution['ACT III'], 4, 'Act III must have 4 cities (Dubai, Cairo, Athens, Rome)'); count();
  assert.equal(actDistribution['ACT IV'], 4, 'Act IV must have 4 cities (Paris, London, Amsterdam, Berlin)'); count();
  assert.equal(actDistribution['ACT V'], 6, 'Act V must have 6 cities (Rio, Buenos Aires, Mexico City, San Francisco, Chicago, Toronto)'); count();
  assert.equal(actDistribution['ACT VI'], 3, 'Act VI must have 3 cities (Lower Manhattan, Brooklyn, Upper Manhattan)'); count();
  assert.equal(actDistribution['ACT VII'], 2, 'Act VII must have 2 cities (Boston Seaport, Cambridge UNBOUND)'); count();

  // 4. Playable vs. Development Separation
  const playable = CITY_CATALOG.filter((c) => c.status === 'PLAYABLE');
  const development = CITY_CATALOG.filter((c) => c.status === 'DEVELOPMENT');
  assert.equal(playable.length, 10, `Expected exactly 10 playable cities, found ${playable.length}`); count();
  assert.equal(development.length, 19, `Expected exactly 19 development cities, found ${development.length}`); count();

  const helperPlayable = getPlayableCityCatalog();
  assert.equal(helperPlayable.length, 10, 'getPlayableCityCatalog() must return the 10 playable cities'); count();
  assert.deepEqual(helperPlayable.map((c) => c.scene), playable.map((c) => c.scene), 'getPlayableCityCatalog() order mismatch'); count();

  // 5. Progression Unlock Logic
  const mockSave = __freshSave();
  assert.ok(isCityUnlocked(mockSave, 'gallery'), 'The Lab must be unlocked initially'); count();
  assert.ok(isCityUnlocked(mockSave, 'sydney'), 'Sydney Harbour must be unlocked initially'); count();
  assert.ok(!isCityUnlocked(mockSave, 'cambridge'), 'Cambridge must be locked initially'); count();

  // Clearing Sydney under 300s unlocks the next cities in sequence
  mockSave.sandbox = mockSave.sandbox || {};
  mockSave.sandbox['sydney'] = { completions: 1, bestTime: 120, bestScore: 5000, bestPercent: 1.0 };
  assert.ok(isCityUnlocked(mockSave, 'auckland'), 'Auckland must unlock after clearing Sydney'); count();

  // 6. Monotonic Economy Ladder
  const ladder = [...CITY_CATALOG].sort((a, b) => a.blocks - b.blocks);
  for (let i = 1; i < ladder.length; i++) {
    const prev = ladder[i - 1];
    const cur = ladder[i];
    assert.ok(cur.coinCount >= prev.coinCount, `coinCount non-monotonic at ${cur.scene} (${cur.coinCount} < ${prev.coinCount})`); count();
    assert.ok(cur.coinValue >= prev.coinValue, `coinValue non-monotonic at ${cur.scene} (${cur.coinValue} < ${prev.coinValue})`); count();
    assert.ok(cur.goalBonus >= prev.goalBonus, `goalBonus non-monotonic at ${cur.scene} (${cur.goalBonus} < ${prev.goalBonus})`); count();
  }

  // 7. Challenge Count & Secret 90s Unlock
  const emptySave = __freshSave();
  assert.equal(getCompletedChallengeCount(emptySave), 0, 'Initial challenge count must be 0'); count();
  assert.equal(isSecret90sChallengeUnlocked(emptySave), false, 'Secret 90s must be locked initially'); count();

  // Complete 3m challenge on all 10 playable cities
  for (const c of playable) {
    recordChallengeResult(emptySave, c.scene, {
      mode: 'challenge3m',
      won: true,
      elapsed: 100,
      score: 10000,
      bestCombo: 20,
      coinsEarned: 200,
      percent: 1.0,
    });
  }
  assert.equal(getCompletedChallengeCount(emptySave), 10, 'All 10 playable challenges must be counted'); count();
  assert.ok(isSecret90sChallengeUnlocked(emptySave), 'Secret 90s challenge must unlock when all 9 playable cities are cleared in 3m'); count();

  return assertions;
}

// Run standalone when executed directly
if (process.argv[1] && process.argv[1].endsWith('validate-campaign.mjs')) {
  const count = runCampaignSelftest();
  console.log(`ALL PASS. ${count} assertions verified in validate-campaign.mjs.`);
}
