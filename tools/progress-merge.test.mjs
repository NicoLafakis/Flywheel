// Behaviour suite for js/cloud/merge.js — the one merge both the client (on
// pull) and the server (on a stale-revision push) run. Table 2.5 of
// .wiki/plans/cloud-progress-sync.md is the fixture list; the properties are
// commutativity for every non-recency field, idempotence, and "coins are never
// summed". Spawned by the `progressMerge` section of tools/validate.mjs.
import assert from 'node:assert/strict';
import { mergeBlobs } from '../js/cloud/merge.js';

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

const A = {
  coins: 120,
  levels: { 1: { stars: 3, bestMass: 500, bestCombo: 4, won: true, fastestClear: 40 }, 2: { stars: 1, bestMass: 200, bestCombo: 2, won: true, fastestClear: null } },
  sandbox: { gallery: { completions: 2, runs: 5, bestSize: 3, bestTime: 90, bestCombo: 6, bestScore: 900, bestPercent: 0.8 } },
  challenges: { gallery: { completed3m: true, bestTime3m: 100, bestScore3m: 700, completed90s: false, bestTime90s: null, bestScore90s: null } },
  ownedItems: ['funnel', 'neon'],
  equippedSkin: 'neon',
  equippedIndicator: 'ind-default',
  upgrades: { speed: 2, vortex: 0, growth: 1, duration: 0 },
  muted: false,
  settings: { musicVol: 0.5, sfxVol: 0.9, turnSens: 1 },
};
const B = {
  coins: 80,
  levels: { 1: { stars: 2, bestMass: 700, bestCombo: 6, won: false, fastestClear: 35 }, 3: { stars: 3, bestMass: 100, bestCombo: 1, won: true, fastestClear: 20 } },
  sandbox: { gallery: { completions: 4, runs: 4, bestSize: 2, bestTime: 80, bestCombo: 3, bestScore: 1200, bestPercent: 0.5 }, manhattan: { completions: 0, runs: 1, bestSize: 1, bestTime: null, bestCombo: 0, bestScore: 10, bestPercent: 0.1 } },
  challenges: { gallery: { completed3m: false, bestTime3m: null, bestScore3m: 900, completed90s: true, bestTime90s: 60, bestScore90s: 300 } },
  ownedItems: ['lava', 'funnel', 'ind-plasma'],
  equippedSkin: 'lava',
  equippedIndicator: 'ind-plasma',
  upgrades: { speed: 1, vortex: 3, growth: 0, duration: 0 },
  muted: true,
  settings: { musicVol: 0.1, sfxVol: 0.2, turnSens: 2 },
};

// ownedItems is a SET whose order is a-first by design (2.5), so it is compared sorted.
const strip = (m) => { const { equippedSkin, equippedIndicator, settings, muted, ownedItems, ...rest } = m; return { ...rest, ownedItems: [...ownedItems].sort() }; };

const ab = mergeBlobs(A, B, { aChangedAt: 100, bChangedAt: 200 });
const ba = mergeBlobs(B, A, { aChangedAt: 200, bChangedAt: 100 });

// Table 2.5, field by field.
eq(ab.levels[1], { stars: 3, bestMass: 700, bestCombo: 6, won: true, fastestClear: 35 }, 'levels: max/OR/min-of-non-null');
eq(ab.levels[2].fastestClear, null, 'fastestClear stays null when neither side has one');
eq(ab.levels[3], B.levels[3], 'a level only one side has is kept');
eq(ab.sandbox.gallery, { completions: 4, runs: 5, bestSize: 3, bestTime: 80, bestCombo: 6, bestScore: 1200, bestPercent: 0.8 }, 'sandbox: bests max, time min, counters MAX not sum');
eq(ab.sandbox.manhattan, B.sandbox.manhattan, 'a scene only one side has is kept');
eq(ab.challenges.gallery, { completed3m: true, bestTime3m: 100, bestScore3m: 900, completed90s: true, bestTime90s: 60, bestScore90s: 300 }, 'challenges: OR/min/max');
eq(ab.ownedItems, ['funnel', 'neon', 'lava', 'ind-plasma'], 'ownedItems: set union, a first');
eq(ab.upgrades, { speed: 2, vortex: 3, growth: 1, duration: 0 }, 'upgrades: max rank');
check(ab.coins === 120 && ba.coins === 120, 'coins: max, never summed');
check(ab.coins <= Math.max(A.coins, B.coins), 'coins <= max(a, b)');
// Recency fields follow the newer side.
check(ab.equippedSkin === 'lava' && ab.equippedIndicator === 'ind-plasma' && ab.muted === true, 'recency fields: newer side (b) wins');
eq(ab.settings, B.settings, 'settings: newer side wins');
check(ba.equippedSkin === 'lava', 'recency is by timestamp, not argument order');
const older = mergeBlobs(A, B, { aChangedAt: 300, bChangedAt: 200 });
check(older.equippedSkin === 'neon' && older.muted === false, 'when a is newer, a keeps its taste');

// Commutativity for every non-recency field.
eq(strip(ab), strip(ba), 'merge is commutative on every non-recency field');
// Idempotence.
eq(mergeBlobs(ab, ab, { aChangedAt: 1, bChangedAt: 1 }), ab, 'merge is idempotent');
eq(strip(mergeBlobs(ab, A, { aChangedAt: 1, bChangedAt: 1 })), strip(ab), 'merging a side back in changes nothing');

// Equipped must be owned or free.
const C = { ...B, equippedSkin: 'gold', equippedIndicator: 'ind-cosmic', ownedItems: [] };
const ac = mergeBlobs(A, C, { aChangedAt: 1, bChangedAt: 2 });
check(ac.equippedSkin === 'classic', 'equipped skin not owned after merge falls back to classic');
check(ac.equippedIndicator === 'ind-default', 'equipped indicator not owned falls back to ind-default');
const free = mergeBlobs(A, { ...B, equippedSkin: 'baseline-cyan', ownedItems: [] }, { aChangedAt: 1, bChangedAt: 2 });
check(free.equippedSkin === 'baseline-cyan', 'a free skin needs no ownership');

// Missing / partial sides never throw.
const empty = mergeBlobs({}, A, {});
eq(strip(empty), strip(mergeBlobs(A, {}, {})), 'empty side is the identity');
check(empty.coins === A.coins && empty.ownedItems.length === 2, 'empty side keeps everything from the other');
check(mergeBlobs(A, B, {}).equippedSkin === 'neon', 'no timestamps: a (the caller/current side) wins recency');
// Non-finite / negative garbage does not survive.
const dirty = mergeBlobs(A, { coins: -50, levels: { 1: { stars: 99, bestMass: NaN, bestCombo: Infinity, won: 'yes', fastestClear: -3 } } }, {});
check(dirty.coins === 120 && dirty.levels[1].bestMass === 500 && dirty.levels[1].bestCombo === 4 && dirty.levels[1].fastestClear === 40 && dirty.levels[1].won === true, 'non-finite / negative numbers and non-boolean flags are ignored, not merged (bounds are the job of sanitiseBlob)');

console.log(`progress-merge: ${n} assertions passed.`);
