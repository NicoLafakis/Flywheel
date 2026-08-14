import blockedNames from '../data/blocked-names.json' with { type: 'json' };
import {
  body, errorResponse, fail, isDeviceKey, isUuid, normaliseName,
  ok, playerForToken, rest,
} from '../_lib.mjs';

const RESERVED = new Set(['admin', 'administrator', 'moderator', 'official', 'staff', 'support', 'system', 'flywheel', 'sprocket']);

async function blocked(key) {
  if (RESERVED.has(key) || blockedNames.some((row) => key.includes(row.pattern))) return true;
  const rows = await rest(`blocked_names?select=pattern,is_exact&limit=500`);
  return rows.some((row) => row.is_exact ? key === row.pattern : key.includes(row.pattern));
}

function suggestions(name, key) {
  const suffixes = ['7', 'X', '27', 'GO', 'RUN'];
  return suffixes.map((suffix) => `${name.slice(0, Math.max(1, 16 - suffix.length))}${suffix}`)
    .filter((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, '') !== key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return; }
  try {
    const data = await body(req);
    const parsed = normaliseName(data.name);
    if (!parsed || !isDeviceKey(data.device_key) || !isUuid(data.player_id)) {
      fail(res, 400, 'NAME_INVALID', 'Use 3–16 letters, numbers, spaces, hyphens or underscores.'); return;
    }
    if (await blocked(parsed.key)) {
      fail(res, 400, 'NAME_BLOCKED', 'That name is not available.'); return;
    }
    const player = await playerForToken(data.player_id, data.token);
    if (!player) { fail(res, 401, 'PLAYER_TOKEN_INVALID', 'This device no longer owns that name.'); return; }

    try {
      await rest(`players?id=eq.${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        body: { name: parsed.name, name_key: parsed.key, last_seen_at: new Date().toISOString() },
        headers: { prefer: 'return=minimal' },
      });
      // Update public board records
      await rest(`board_public?player_id=eq.${encodeURIComponent(player.id)}`, {
        method: 'PATCH',
        body: { name: parsed.name },
        headers: { prefer: 'return=minimal' },
      });
      ok(res, { player_id: player.id, name: parsed.name });
    } catch (error) {
      if (error.status === 409 || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message))) {
        fail(res, 409, 'NAME_TAKEN', 'That name is taken.', false, { suggestions: suggestions(parsed.name, parsed.key) });
        return;
      }
      throw error;
    }
  } catch (error) { errorResponse(res, error); }
}
