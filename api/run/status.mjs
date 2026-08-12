import { body, errorResponse, fail, isDeviceKey, isUuid, method, ok, rest } from '../_lib.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const data = await body(req);
    if (!isUuid(data.run_id) || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'BAD_RUN', 'A run id and device key are required.'); return;
    }
    const rows = await rest(`runs?select=id,verdict,verified_score,verdict_detail&id=eq.${encodeURIComponent(data.run_id)}`);
    const tickets = await rest(`run_tickets?select=device_key&id=eq.${encodeURIComponent(data.run_id)}`);
    if (!tickets[0] || tickets[0].device_key !== data.device_key || !rows[0]) {
      fail(res, 404, 'RUN_NOT_FOUND', 'That saved run is not available.'); return;
    }
    ok(res, { run_id: rows[0].id, verdict: rows[0].verdict,
      verified_score: rows[0].verdict === 'verified' ? rows[0].verified_score : null });
  } catch (error) { errorResponse(res, error); }
}
