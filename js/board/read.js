import { BOARD_TIMEOUT_MS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

const CACHE_KEY = 'fw-board-cache';

function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[key] || null; } catch { return null; }
}
function cacheSet(key, data) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { data, at: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* cache is optional */ }
}

async function read(path, key) {
  const cached = cacheGet(key);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      signal: AbortSignal.timeout(BOARD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`board read ${response.status}`);
    const data = await response.json();
    cacheSet(key, data);
    return { data, cached: false, at: new Date().toISOString() };
  } catch (error) {
    if (cached) return { ...cached, cached: true, error };
    throw error;
  }
}

export function cityBoard(sceneId, seasonId = null) {
  const seasonParam = typeof seasonId === 'number' ? `&season_id=eq.${encodeURIComponent(seasonId)}` : '';
  const cacheKey = typeof seasonId === 'number' ? `city:${sceneId}:s${seasonId}` : `city:${sceneId}`;
  return read(`v_city_board?scene_id=eq.${encodeURIComponent(sceneId)}${seasonParam}&order=rank.asc&limit=25`, cacheKey);
}

// Ranked by RANK POINTS — a positional score, so a player who is 1st on one city
// outranks a player who is 2nd on four. That is not the board the product asked
// for and nothing renders it any more; the view and this read are being retired
// in a later pass, so the call is left in place rather than deleted underneath
// whatever still references it.
export function overallBoard() { return read('v_overall?order=rank.asc&limit=25', 'overall'); }

// THE leaderboard: one row per player, all-time, ranked by the sum of their best
// verified score on each city. `dense_rank()` in the view means a genuine tie
// SHARES a rank, so asking for ten rows can return more than ten players — the
// cut belongs to the caller (`topTen` in js/ui/boards.js), not to this limit,
// which exists only to bound the transfer.
//
// The ordering is spelled out rather than left to the view because PostgREST
// makes no ordering promise of its own: rank first, then total score, then name,
// so two runs of the same query cannot swap two tied players around.
export function leaderboard(limit = 10) {
  // One spare row past the requested cut, so a tie sitting exactly on the
  // boundary is visible to the caller instead of being silently truncated by
  // the transfer limit before it can decide.
  const rows = Math.max(1, Math.floor(limit)) + 5;
  return read(`v_leaderboard?order=rank.asc,total_score.desc,name.asc&limit=${rows}`, 'leaderboard');
}

// One player's own standing on that same board — their total score, how many
// cities it covers, and their global rank. Separate from the top-ten read
// because a player outside the top ten still has a rank, and it is the number
// that makes the leaderboard legible to them.
export function playerStanding(playerId) {
  const id = encodeURIComponent(playerId);
  return read(`v_leaderboard?player_id=eq.${id}&limit=1`, `standing:${playerId}`);
}

// A player's own verified bests, one row per city, for RECORDS. Same view the
// public city boards read, filtered to one player — so the score shown beside a
// city is the server-replayed one, never a browser-side number (invariant 8).
export function playerCityRecords(playerId) {
  const id = encodeURIComponent(playerId);
  return read(`v_city_board?player_id=eq.${id}&order=score.desc&limit=200`, `records:${playerId}`);
}
