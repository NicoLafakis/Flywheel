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
export function overallBoard() { return read('v_overall?order=rank.asc&limit=25', 'overall'); }
