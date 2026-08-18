// The ONE merge for cloud progress. The client runs it on pull (local vs
// remote), the server runs it on a stale-revision push (stored vs incoming);
// api/_progress.mjs imports it, so the two sides cannot disagree. Pure: no DOM,
// no three.js, no randomness, no clock — recency is decided by the timestamps
// the caller passes in.
//
// The rules (.wiki/plans/cloud-progress-sync.md §2.5): every record field
// keeps the BETTER of the two sides (max of bests, min of times, OR of flags,
// union of owned, max of ranks). Counters (`completions`, `runs`) also take
// max, NOT sum: two devices that advanced from a common base would double
// count under sum, while max under-counts by at most the smaller delta. Coins
// are never summed — max here, and the server's coin fence is authoritative on
// the next push. Taste (`equippedSkin`, `equippedIndicator`, `settings`,
// `muted`) follows the side that changed most recently, and an equipped item
// must be owned or free in the merged result or it falls back to the free
// default (the same rule as the v24 migration in js/save.js).
import { isFreeCosmetic } from '../skinprices.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const maxOf = (a, b) => { const x = num(a), y = num(b); return x === null ? (y === null ? 0 : y) : (y === null ? x : Math.max(x, y)); };
const minOf = (a, b) => { const x = num(a), y = num(b); return x === null ? (y === null ? null : y) : (y === null ? x : Math.min(x, y)); };
const maxOrNull = (a, b) => (num(a) === null && num(b) === null ? null : maxOf(a, b));
const or = (a, b) => a === true || b === true;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const keysOf = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

function mergeLevel(a, b) {
  return {
    stars: maxOf(a.stars, b.stars),
    bestMass: maxOf(a.bestMass, b.bestMass),
    bestCombo: maxOf(a.bestCombo, b.bestCombo),
    won: or(a.won, b.won),
    fastestClear: minOf(a.fastestClear, b.fastestClear),
  };
}

function mergeSandbox(a, b) {
  return {
    completions: maxOf(a.completions, b.completions),
    runs: maxOf(a.runs, b.runs),
    bestSize: maxOf(a.bestSize, b.bestSize),
    bestTime: minOf(a.bestTime, b.bestTime),
    bestCombo: maxOf(a.bestCombo, b.bestCombo),
    bestScore: maxOf(a.bestScore, b.bestScore),
    bestPercent: Math.min(1, maxOf(a.bestPercent, b.bestPercent)),
  };
}

function mergeChallenge(a, b) {
  return {
    completed3m: or(a.completed3m, b.completed3m),
    bestTime3m: minOf(a.bestTime3m, b.bestTime3m),
    bestScore3m: maxOrNull(a.bestScore3m, b.bestScore3m),
    completed90s: or(a.completed90s, b.completed90s),
    bestTime90s: minOf(a.bestTime90s, b.bestTime90s),
    bestScore90s: maxOrNull(a.bestScore90s, b.bestScore90s),
  };
}

function mergeMap(a, b, fn) {
  const A = obj(a), B = obj(b);
  const out = {};
  for (const k of keysOf(A, B)) out[k] = fn(obj(A[k]), obj(B[k]));
  return out;
}

/**
 * @param {object} a  one side (the caller's current side; wins recency ties)
 * @param {object} b  the other side
 * @param {{aChangedAt?: number, bChangedAt?: number}} when  last-local-change
 *        timestamps; whichever is larger owns the taste fields. Missing/equal → a.
 */
export function mergeBlobs(a, b, { aChangedAt, bChangedAt } = {}) {
  const A = obj(a), B = obj(b);
  const bNewer = num(bChangedAt) !== null && (num(aChangedAt) === null || bChangedAt > aChangedAt);
  const newer = bNewer ? B : A;
  const older = bNewer ? A : B;

  const ownedItems = [];
  const owned = [...(Array.isArray(A.ownedItems) ? A.ownedItems : []), ...(Array.isArray(B.ownedItems) ? B.ownedItems : [])];
  for (const id of owned) if (typeof id === 'string' && !ownedItems.includes(id)) ownedItems.push(id);

  const upgrades = {};
  for (const k of keysOf(obj(A.upgrades), obj(B.upgrades))) upgrades[k] = maxOf(obj(A.upgrades)[k], obj(B.upgrades)[k]);

  const pick = (key) => (newer[key] !== undefined ? newer[key] : older[key]);
  const wearable = (id, fallback) => (typeof id === 'string' && (ownedItems.includes(id) || isFreeCosmetic(id)) ? id : fallback);

  return {
    coins: maxOf(A.coins, B.coins),
    levels: mergeMap(A.levels, B.levels, mergeLevel),
    sandbox: mergeMap(A.sandbox, B.sandbox, mergeSandbox),
    challenges: mergeMap(A.challenges, B.challenges, mergeChallenge),
    ownedItems,
    equippedSkin: wearable(pick('equippedSkin'), 'classic'),
    equippedIndicator: wearable(pick('equippedIndicator'), 'ind-default'),
    upgrades,
    muted: pick('muted') === true,
    settings: { ...obj(older.settings), ...obj(newer.settings) },
  };
}
