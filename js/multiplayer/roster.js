// js/multiplayer/roster.js — the slot-indexed roster: spawn geometry, hole
// configs, and the one leaderboard shape both podium paths render.
//
// WHY THIS FILE EXISTS
// `slot` is the roster's identity everywhere on the wire: INPUT_TICK names one,
// STATE_SYNC keys by one, `sim.holes[slot]` and `sim.localSlot` index by one.
// The moment a roster is COMPACTED (`players.filter(Boolean)`), a player in slot
// 3 lands at array index 2, `sim.holes[3]` is undefined, and `sim.localHole`
// silently falls back to `holes[0]` — that peer then steers the HOST's hole.
// So the roster stays slot-indexed end to end, empty slots included, and every
// derived thing is computed FROM the slot rather than from an array position.
//
// Host and peer both build their hole configs here rather than each carrying a
// copy of the formula: the two used to compute the spawn angle from the array
// index independently, which is a silent desync waiting for the first gap in a
// roster (rivals drawn where they are not).
//
// Pure module by design: no DOM, no three.js. The Node suites assert on it
// directly and js/voxelsim.js imports the angle helper for its PvP respawn ring.

import { fwCos, fwSin } from '../fwmath.js';

// The spawn ring radius, in metres. Matches the PvP respawn ring's own cap.
export const SPAWN_RADIUS = 25.0;

// One turn, to the precision voxelsim's respawn ring has always used. Kept as a
// literal (not Math.PI * 2) so the angle expression here is bit-identical to the
// one in js/voxelsim.js — two clients must not disagree about where a hole is.
const TAU = 6.283185;

/**
 * Where a slot sits on the spawn ring, as an angle in radians.
 * Derived from the SLOT, never from an array index, so a gap in the roster does
 * not rotate everybody after it.
 */
export function spawnAngleForSlot(slot, slotCount) {
  return (Number(slot) || 0) * (TAU / Math.max(1, Number(slotCount) || 1));
}

/**
 * The spawn point for a slot. fwCos/fwSin rather than Math.cos/Math.sin because
 * trig is implementation-approximated: two browsers must place the same hole at
 * the same metre, and the sim's own respawn ring already uses these.
 */
export function spawnPositionForSlot(slot, slotCount, radius = SPAWN_RADIUS) {
  const angle = spawnAngleForSlot(slot, slotCount);
  return { x: fwCos(angle) * radius, z: fwSin(angle) * radius };
}

/**
 * The `holes` config the sim is constructed with, ONE ENTRY PER SLOT.
 *
 * An empty slot still gets an entry — flagged `departed`, which makes the sim
 * treat it as an inert placeholder that never moves, never eats, never scores
 * and never enters PvP. That placeholder is what keeps `holes[slot].slot ===
 * slot` true for every slot, which is the whole invariant this module exists to
 * protect. Skipping the entry instead would re-introduce the compaction bug.
 */
export function buildHoleConfigs(players) {
  const list = Array.isArray(players) ? players : [];
  return list.map((p, slot) => {
    const pos = spawnPositionForSlot(slot, list.length);
    return {
      slot,
      name: p ? p.name : `Player ${slot + 1}`,
      skin: p ? p.skin : 'default',
      color: p ? p.color : '#ffffff',
      x: pos.x,
      z: pos.z,
      departed: !p,
    };
  });
}

/** The slot a sender owns, or -1. Empty slots are skipped, never matched. */
export function slotOfSender(players, senderId) {
  if (senderId === null || senderId === undefined) return -1;
  const list = Array.isArray(players) ? players : [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p && p.senderId !== null && p.senderId !== undefined && String(p.senderId) === String(senderId)) {
      return Number.isInteger(p.slot) ? p.slot : i;
    }
  }
  return -1;
}

/**
 * The ranked leaderboard, from holes + the slot-indexed roster.
 *
 * Shared so the host's GAME_OVER podium and the peer's host-left fallback podium
 * cannot drift into two different shapes — a player who loses the host must not
 * see a differently-built results screen.
 *
 * A slot with no roster entry contributes NOTHING: it is a placeholder hole for a
 * seat nobody ever took, and a phantom "Player 3" on the podium is worse than a
 * short list. A player who LEFT keeps their row (with `departed: true`) because
 * they played for the stats they earned.
 */
export function buildLeaderboard({ holes = [], players = [], totalMass = 1, includeDeparted = true } = {}) {
  const total = totalMass || 1;
  const roster = Array.isArray(players) ? players : [];
  const rows = [];
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    if (!h) continue;
    const slot = h.slot !== undefined ? h.slot : i;
    const pInfo = roster[slot];
    if (!pInfo) continue;
    if (!includeDeparted && h.departed) continue;
    const rawMass = h.rawMass || 0;
    rows.push({
      slot,
      name: pInfo.name || h.name || `Player ${slot + 1}`,
      score: Math.round(h.mass || 0),
      mass: Math.round(rawMass),
      percentCleared: Math.max(0, Math.min(100, Math.round((rawMass / total) * 100))),
      bestChain: h.bestCombo || 0,
      kills: h.kills || 0,
      timesEaten: h.timesEaten || 0,
      coins: h.coins || 0,
      coinsCollected: h.coinsCollected || 0,
      color: pInfo.color || h.color,
      skin: pInfo.skin || h.skin,
      departed: Boolean(h.departed),
    });
  }
  return rows
    .sort((a, b) => b.score - a.score)
    .map((p, rankIdx) => ({ ...p, rank: rankIdx + 1 }));
}
