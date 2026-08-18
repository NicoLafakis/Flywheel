// POST /api/progress/push — accept a progress document from the signed-in
// player and answer with the CANONICAL one the server kept. The five steps of
// .wiki/plans/cloud-progress-sync.md §2.2, in order:
//   1. schema guards — a document from a newer client is refused, never
//      overwritten (CLIENT_TOO_NEW, the quarantine rule of invariant 7); one
//      older than what is stored is refused too (STALE_SCHEMA).
//   2. sanitiseBlob() — strict allow-list, no unknown keys reach jsonb.
//   3. base_revision mismatch → mergeBlobs(stored, incoming): a client never
//      wins by racing, it gets the better of both sides.
//   4. coinFence() — coins are fenced, purchases may be trimmed, never added.
//   5. upsert, bump revision, log kind='progress' (60/hour/player), reply with
//      {revision, blob, trimmed, ...}. The client adopts it — the one place
//      server state flows back into a save, always outside sim.step.
//
// `makeHandler(deps)` is the seam tools/progress-api.test.mjs drives with an
// in-memory database; the default export wires api/_lib.mjs.
import {
  errorResponse, fail, ok,
  playerForToken as realPlayerForToken, rest as realRest, rpc as realRpc,
} from '../_lib.mjs';
import { CURRENT_VERSION, PUSHES_PER_HOUR, coinFence, mergeBlobs, sanitiseBlob } from '../_progress.mjs';
import { PROGRESS_COLUMNS, gate } from './pull.mjs';

const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

export function makeHandler(deps = {}) {
  const rest = deps.rest || realRest;
  const rpc = deps.rpc || realRpc;
  const playerForToken = deps.playerForToken || realPlayerForToken;
  return async function handler(req, res) {
    try {
      // Same gate as pull: flag, method, body, then playerForToken(player_id, token).
      const gated = await gate(req, res, { playerForToken: (id, token) => playerForToken(id, token) });
      if (!gated) return;
      const { data, player } = gated;
      if (!isNonNegInt(data.base_revision) || !isNonNegInt(data.schema_version) || data.schema_version === 0
        || !data.blob || typeof data.blob !== 'object' || Array.isArray(data.blob)) {
        fail(res, 400, 'BAD_REQUEST', 'base_revision, schema_version and a blob object are required.'); return;
      }
      // 1. Schema guards.
      if (data.schema_version > CURRENT_VERSION) {
        fail(res, 409, 'CLIENT_TOO_NEW', 'This game is newer than the server understands. Try again after the next update.', false); return;
      }
      // Rate limit before any read of the document, the way register.mjs checks claim-ip.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await rest(`submission_log?select=id&player_id=eq.${encodeURIComponent(player.id)}&kind=eq.progress&created_at=gte.${encodeURIComponent(since)}&limit=${PUSHES_PER_HOUR + 1}`);
      if (recent && recent.length >= PUSHES_PER_HOUR) {
        fail(res, 429, 'PROGRESS_RATE_LIMIT', 'Progress is syncing too often. It will catch up shortly.', true); return;
      }
      const rows = await rest(`player_progress?select=${PROGRESS_COLUMNS}&player_id=eq.${encodeURIComponent(player.id)}&limit=1`);
      const stored = rows && rows[0];
      if (stored && data.schema_version < stored.schema_version) {
        fail(res, 409, 'STALE_SCHEMA', 'Your saved progress was written by a newer version of the game.', false); return;
      }
      // 2. Sanitise.
      const { blob: incoming, rejected } = sanitiseBlob(data.blob);
      // 3. Merge on a stale base. The incoming side is the one that changed most
      // recently (it is being pushed now), so it owns the taste fields.
      const merged = !!(stored && data.base_revision !== stored.revision);
      const storedAt = stored ? Date.parse(stored.updated_at) || 0 : 0;
      const candidate = merged
        ? mergeBlobs(sanitiseBlob(stored.blob).blob, incoming, { aChangedAt: storedAt, bChangedAt: storedAt + 1 })
        : incoming;
      // 4. Fence.
      const verifiedRaw = await rpc('fw_coins_verified', { p_player_id: player.id });
      const coinsVerified = Number(Array.isArray(verifiedRaw) ? (verifiedRaw[0] && (verifiedRaw[0].fw_coins_verified ?? verifiedRaw[0])) : verifiedRaw) || 0;
      const fenced = coinFence(candidate, { coinsVerified });
      // 5. Upsert.
      const revision = stored ? stored.revision + 1 : 1;
      await rest('player_progress', {
        method: 'POST',
        body: {
          player_id: player.id,
          schema_version: data.schema_version,
          blob: fenced.blob,
          coins_verified: coinsVerified,
          coins_ceiling: fenced.coinsCeiling,
          revision,
          updated_at: new Date().toISOString(),
          pushed_by_device: data.device_key,
        },
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      await rest('submission_log', {
        method: 'POST', body: { player_id: player.id, device_key: data.device_key, kind: 'progress' },
        headers: { prefer: 'return=minimal' },
      });
      ok(res, {
        revision,
        blob: fenced.blob,
        trimmed: [...fenced.trimmed, ...rejected],
        merged,
        coins_verified: coinsVerified,
        coins_ceiling: fenced.coinsCeiling,
        schema_version: data.schema_version,
      });
    } catch (error) { errorResponse(res, error); }
  };
}

export default makeHandler();
