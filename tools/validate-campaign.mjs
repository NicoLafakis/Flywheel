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
  // These two stay LITERAL on purpose, unlike the derived challenge count below:
  // they are the tripwire that catches a city whose status was flipped without
  // the rest of the wiring, so deriving them from the catalog would make them
  // agree with any accident. Bump both when a city genuinely ships. Singapore
  // took the roster from 10/19 to 11/18 on 2026-08-19.
  assert.equal(playable.length, 11, `Expected exactly 11 playable cities, found ${playable.length}`); count();
  assert.equal(development.length, 18, `Expected exactly 18 development cities, found ${development.length}`); count();
  // The pair cannot silently drift apart from the roster it partitions.
  assert.equal(playable.length + development.length, CITY_CATALOG.length,
    `playable + development must account for every city: ${playable.length} + ${development.length} != ${CITY_CATALOG.length}`); count();

  const helperPlayable = getPlayableCityCatalog();
  assert.equal(helperPlayable.length, playable.length, 'getPlayableCityCatalog() must return every playable city'); count();
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

  // 6. Monotonic Economy Ladder — by ROLE first, then by size.
  //
  // This used to sort all 29 cities by `blocks` and assert the economy was
  // non-decreasing along it, i.e. it used map size as a proxy for campaign
  // progression. That was green only by coincidence: two DECLARED BLOCK COUNTS
  // were wrong (gallery understated by 2,115, cambridge overstated by 15,557)
  // and those two errors happened to place the prologue smallest and the finale
  // largest. Correcting them on 2026-08-19 broke this in five places without
  // any economy value changing. The suite was testing the coincidence, not the
  // ladder.
  //
  // The economy is designed around ROLE, not size, so that is what is asserted:
  // the tutorial is the floor however big its testbed grows, the finale is the
  // ceiling wherever its true size ranks, and the 27 cities in between still
  // scale with size. Bounds are inclusive — ties are legal (gallery and sydney
  // share coinValue 1); the claim is floor and ceiling, not strict inequality.
  const ECONOMY_FIELDS = ['coinCount', 'coinValue', 'goalBonus'];
  const prologue = CITY_CATALOG.filter((c) => c.act === 'PROLOGUE');
  const finale = CITY_CATALOG.filter((c) => c.scene === 'cambridge');
  assert.equal(prologue.length, 1, 'economy ladder: expected exactly one PROLOGUE city to anchor the floor'); count();
  assert.equal(finale.length, 1, 'economy ladder: expected exactly one finale city (cambridge) to anchor the ceiling'); count();

  const floorCity = prologue[0];
  const ceilCity = finale[0];

  // Violations are COLLECTED and asserted once at the end rather than thrown on
  // the first, because assert.ok crashes the run and the first failure is often
  // the least informative one. Moving an ANCHOR is the case that proves it: push
  // gallery's coinCount above the roster and a crash-on-first run blames
  // `sydney` — the first city it happens to compare — while the actual cause is
  // gallery. Collected, the same break reports every city at once, and 27 rows
  // all naming the same anchor points at the anchor unmistakably. This is also
  // how the original five-break regression reported as one and cost a round
  // trip.
  const violations = [];
  for (const city of CITY_CATALOG) {
    for (const f of ECONOMY_FIELDS) {
      if (city.scene !== floorCity.scene) {
        if (!(city[f] >= floorCity[f])) violations.push(`economy floor: ${f} at ${city.scene} (${city[f]}) is below the PROLOGUE ${floorCity.scene} (${floorCity[f]}) — the tutorial must stay the poorest reward on the board`);
        count();
      }
      if (city.scene !== ceilCity.scene) {
        if (!(city[f] <= ceilCity[f])) violations.push(`economy ceiling: ${f} at ${city.scene} (${city[f]}) is above the finale ${ceilCity.scene} (${ceilCity[f]}) — the ACT VII finale must stay the richest`);
        count();
      }
    }
  }

  // The 27 in between still scale with size.
  const body = CITY_CATALOG
    .filter((c) => c.scene !== floorCity.scene && c.scene !== ceilCity.scene)
    .sort((a, b) => a.blocks - b.blocks);
  for (let i = 1; i < body.length; i++) {
    const prev = body[i - 1];
    const cur = body[i];
    for (const f of ECONOMY_FIELDS) {
      if (!(cur[f] >= prev[f])) violations.push(`${f} non-monotonic at ${cur.scene} (${cur[f]} < ${prev[f]} at ${prev.scene})`);
      count();
    }
  }

  assert.ok(
    violations.length === 0,
    `economy ladder: ${violations.length} violation(s)\n    ${violations.join('\n    ')}`,
  );

  // 7. Challenge Count & Secret 90s Unlock
  const emptySave = __freshSave();
  assert.equal(getCompletedChallengeCount(emptySave), 0, 'Initial challenge count must be 0'); count();
  assert.equal(isSecret90sChallengeUnlocked(emptySave), false, 'Secret 90s must be locked initially'); count();

  // Complete the 3m challenge on EVERY playable city. The expected count is
  // derived from `playable`, not written as a literal: a hard-coded 10 here is a
  // second copy of a number the catalog already owns, and it sank this suite the
  // moment Singapore flipped to PLAYABLE even though nothing about the challenge
  // logic had changed. Derived, it never needs touching again.
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
  assert.ok(playable.length > 0, 'the playable roster must be non-empty, or the count assertion below passes vacuously'); count();
  assert.equal(getCompletedChallengeCount(emptySave), playable.length, `All ${playable.length} playable challenges must be counted`); count();
  assert.ok(isSecret90sChallengeUnlocked(emptySave), 'Secret 90s challenge must unlock when every playable city is cleared in 3m'); count();

  return assertions;
}

// Run standalone when executed directly
if (process.argv[1] && process.argv[1].endsWith('validate-campaign.mjs')) {
  const count = runCampaignSelftest();
  console.log(`ALL PASS. ${count} assertions verified in validate-campaign.mjs.`);
}
