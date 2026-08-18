// The server half of cloud progress sync (.wiki/plans/cloud-progress-sync.md).
//
// Three things live here and nowhere else:
//   * SYNCED_KEYS — the boundary between what follows the player and what stays
//     on the device (defined in js/cloud/blob.js, re-exported here), so client
//     and server cannot disagree about which keys travel.
//   * sanitiseBlob() — a strict allow-list over an untrusted document. Every
//     key, every number and every id is checked; unknown keys are dropped
//     rather than stored, so a hand-edited save cannot smuggle a field into a
//     jsonb column and out again onto another device.
//   * coinFence() — the plausibility fence (§2.4). The server never trusts a
//     coin balance and never ADDS coins: `earned_allowed = coins_verified +
//     coins_ceiling`, `spent = purchases + upgrade ladder`, and the stored
//     balance is `min(client, earned_allowed - spent)`; when even that is
//     negative, purchases unwind newest-first until it is not and coins are 0.
//     The ceiling is generous on purpose — an honest player cannot hit it —
//     because cosmetics are not a competitive edge and docking a real player is
//     the worse failure.
//
// Everything imported from js/ is pure and Node-importable (the validator
// already imports all of it). Nothing here reads a request or touches the
// database; that is the routes' job.

import { CURRENT_VERSION } from '../js/save.js';
import { LEVELS, coinsForResult } from '../js/levels.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import { CHALLENGE_COIN_MULTIPLIER, SANDBOX_COIN_COUNT, SANDBOX_COIN_VALUE, SANDBOX_GOAL_BONUS } from '../js/voxelsim.js';
import { MAX_UPGRADE_RANK, UPGRADE_COST_TABLE, defaultUpgrades } from '../js/upgrades.js';
import { COSMETIC_PRICES, isFreeCosmetic, isSellableCosmetic } from '../js/skinprices.js';
import { mergeBlobs } from '../js/cloud/merge.js';
import { SYNCED_KEYS, SYNCED_SETTINGS_KEYS } from '../js/cloud/blob.js';

export { CURRENT_VERSION, mergeBlobs };

// SYNCED_KEYS / SYNCED_SETTINGS_KEYS are defined in js/cloud/blob.js (the
// browser cannot import from api/, the server can import from js/) and
// re-exported here so the server side reads the same list.
export { SYNCED_KEYS, SYNCED_SETTINGS_KEYS };

export const REPLAY_ALLOWANCE = 3;      // a level replayed for coins up to 3x at its best
export const MAX_COUNTED_RUNS = 200;    // per scene, for the sandbox ceiling
export const PUSHES_PER_HOUR = 60;
export const MAX_BLOB_BYTES = 65536;    // mirrors the check constraint on player_progress.blob

const LEVEL_KEYS = new Set(LEVELS.map((l) => String(l.index)));
const SCENE_KEYS = new Set([...CITY_CATALOG.map((c) => c.scene), 'gallery']);
const UPGRADE_KEYS = Object.keys(defaultUpgrades());

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonNeg = (v, cap = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, cap) : 0);
const nonNegOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(nonNeg(v, hi))));
const bool = (v) => v === true;

function cleanLevel(v) {
  const l = isObj(v) ? v : {};
  return {
    stars: int(l.stars, 0, 3),
    bestMass: Math.floor(nonNeg(l.bestMass)),
    bestCombo: Math.floor(nonNeg(l.bestCombo)),
    won: bool(l.won),
    fastestClear: nonNegOrNull(l.fastestClear),
  };
}

function cleanSandbox(v) {
  const s = isObj(v) ? v : {};
  return {
    completions: Math.floor(nonNeg(s.completions)),
    runs: Math.floor(nonNeg(s.runs)),
    bestSize: nonNeg(s.bestSize),
    bestTime: nonNegOrNull(s.bestTime),
    bestCombo: Math.floor(nonNeg(s.bestCombo)),
    bestScore: Math.floor(nonNeg(s.bestScore)),
    bestPercent: Math.min(1, nonNeg(s.bestPercent)),
  };
}

function cleanChallenge(v) {
  const c = isObj(v) ? v : {};
  return {
    completed3m: bool(c.completed3m),
    bestTime3m: nonNegOrNull(c.bestTime3m),
    bestScore3m: nonNegOrNull(c.bestScore3m) === null ? null : Math.floor(c.bestScore3m),
    completed90s: bool(c.completed90s),
    bestTime90s: nonNegOrNull(c.bestTime90s),
    bestScore90s: nonNegOrNull(c.bestScore90s) === null ? null : Math.floor(c.bestScore90s),
  };
}

function cleanMap(v, allowed, fn) {
  const out = {};
  if (!isObj(v)) return out;
  for (const k of Object.keys(v)) if (allowed.has(k)) out[k] = fn(v[k]);
  return out;
}

/**
 * Strict allow-list over an untrusted progress document. Returns the clean
 * blob and the `ownedItems` ids it refused (unknown, or a partner row without
 * approval — the same rule as `isPurchasableSkin()` in js/main.js).
 */
export function sanitiseBlob(input) {
  const src = isObj(input) ? input : {};
  const rejected = [];
  const ownedItems = [];
  for (const id of Array.isArray(src.ownedItems) ? src.ownedItems : []) {
    if (isSellableCosmetic(id) && !ownedItems.includes(id)) ownedItems.push(id);
    else rejected.push(String(id));
  }
  const upgrades = {};
  for (const k of UPGRADE_KEYS) upgrades[k] = int(isObj(src.upgrades) ? src.upgrades[k] : 0, 0, MAX_UPGRADE_RANK);
  const settings = {};
  if (isObj(src.settings)) {
    for (const k of SYNCED_SETTINGS_KEYS) {
      if (typeof src.settings[k] === 'number' && Number.isFinite(src.settings[k])) settings[k] = src.settings[k];
    }
  }
  const wearable = (id, fallback) => (typeof id === 'string' && (ownedItems.includes(id) || isFreeCosmetic(id)) ? id : fallback);
  return {
    blob: {
      coins: Math.floor(nonNeg(src.coins)),
      levels: cleanMap(src.levels, LEVEL_KEYS, cleanLevel),
      sandbox: cleanMap(src.sandbox, SCENE_KEYS, cleanSandbox),
      challenges: cleanMap(src.challenges, SCENE_KEYS, cleanChallenge),
      ownedItems,
      equippedSkin: wearable(src.equippedSkin, 'classic'),
      equippedIndicator: wearable(src.equippedIndicator, 'ind-default'),
      upgrades,
      muted: bool(src.muted),
      settings,
    },
    rejected,
  };
}

/** The most a run of `scene` can pay: every coin at the scene's value plus the
 *  clear bonus, at the challenge multiplier. */
function maxRunPayout(scene) {
  const c = CITY_CATALOG.find((row) => row.scene === scene);
  const count = c ? c.coinCount : SANDBOX_COIN_COUNT;
  const value = c ? c.coinValue : SANDBOX_COIN_VALUE;
  const bonus = c ? c.goalBonus : SANDBOX_GOAL_BONUS;
  return (count * value + bonus) * CHALLENGE_COIN_MULTIPLIER;
}

/** Upper bound on coins the (already sanitised) record could honestly have
 *  earned outside ranked play (§2.4). Levels: best result × REPLAY_ALLOWANCE.
 *  Sandbox/challenges: capped run count × best possible payout per run. */
export function coinsCeiling(blob) {
  let ceiling = 0;
  for (const [k, l] of Object.entries(blob.levels || {})) {
    const level = LEVELS[Number(k) - 1];
    if (!level) continue;
    ceiling += coinsForResult(level, l.stars, l.bestCombo) * REPLAY_ALLOWANCE;
  }
  for (const [scene, s] of Object.entries(blob.sandbox || {})) {
    ceiling += Math.min(s.runs || 0, MAX_COUNTED_RUNS) * maxRunPayout(scene);
  }
  return ceiling;
}

/** Everything the record says was paid for: item prices plus the upgrade
 *  ladder up to each track's rank. */
export function spentCoins(blob) {
  let spent = 0;
  for (const id of blob.ownedItems || []) spent += COSMETIC_PRICES[id] || 0;
  for (const k of UPGRADE_KEYS) {
    const rank = Math.min(MAX_UPGRADE_RANK, Math.max(0, (blob.upgrades || {})[k] || 0));
    for (let r = 0; r < rank; r++) spent += UPGRADE_COST_TABLE[r];
  }
  return spent;
}

/**
 * The fence. `coinsCeiling` may be supplied (tests, inspection) and otherwise
 * is computed from the blob. Returns the canonical blob, what was trimmed
 * (item ids, and `upgrade:<track>:<rank>` per unwound rank), and the ceiling.
 * Never adds coins; never touches anything but `coins`, `ownedItems`,
 * `upgrades` and the two equipped fields (which must stay owned or free).
 */
export function coinFence(blob, { coinsVerified = 0, coinsCeiling: ceilingOverride } = {}) {
  const ceiling = typeof ceilingOverride === 'number' ? ceilingOverride : coinsCeiling(blob);
  const allowed = Math.max(0, Math.floor(nonNeg(coinsVerified))) + ceiling;
  const ownedItems = [...blob.ownedItems];
  const upgrades = { ...blob.upgrades };
  const trimmed = [];
  let coins = Math.min(blob.coins, allowed - spentCoins({ ownedItems, upgrades }));
  if (coins < 0) {
    // Unwind: upgrades top rank first (they are the cheapest to re-earn and the
    // most recent write in a maxed save), then purchases newest-first.
    while (coins < 0) {
      let undone = false;
      for (const k of [...UPGRADE_KEYS].reverse()) {
        if (upgrades[k] > 0) {
          trimmed.push(`upgrade:${k}:${upgrades[k]}`);
          upgrades[k] -= 1;
          undone = true;
          break;
        }
      }
      if (!undone) {
        // Free items cost nothing and cannot help; drop the newest PAID one.
        let idx = -1;
        for (let i = ownedItems.length - 1; i >= 0; i--) if ((COSMETIC_PRICES[ownedItems[i]] || 0) > 0) { idx = i; break; }
        if (idx === -1) break;
        trimmed.push(ownedItems[idx]);
        ownedItems.splice(idx, 1);
        undone = true;
      }
      coins = allowed - spentCoins({ ownedItems, upgrades });
    }
    coins = 0;
  }
  const wearable = (id, fallback) => (ownedItems.includes(id) || isFreeCosmetic(id) ? id : fallback);
  return {
    blob: {
      ...blob,
      coins: Math.max(0, Math.floor(coins)),
      ownedItems,
      upgrades,
      equippedSkin: wearable(blob.equippedSkin, 'classic'),
      equippedIndicator: wearable(blob.equippedIndicator, 'ind-default'),
    },
    trimmed,
    coinsCeiling: ceiling,
  };
}
