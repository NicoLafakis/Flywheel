import { body, errorResponse, fail, isDeviceKey, isUuid, method, ok, rest } from './_lib.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const data = await body(req);
    if (!isUuid(data.player_id) || !isDeviceKey(data.device_key)) {
      fail(res, 400, 'REPORT_INVALID', 'A board row and device are required.'); return;
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const reports = await rest(`moderation_reports?select=id&reporter_device_key=eq.${encodeURIComponent(data.device_key)}&player_id=eq.${encodeURIComponent(data.player_id)}&created_at=gte.${encodeURIComponent(since)}&limit=1`);
    if (reports.length) {
      fail(res, 409, 'REPORT_ALREADY_SENT', 'You already reported this player today.'); return;
    }
    await rest('moderation_reports', {
      method: 'POST', body: { player_id: data.player_id, reporter_device_key: data.device_key },
      headers: { prefer: 'return=minimal' },
    });
    ok(res, { reported: true });
  } catch (error) { errorResponse(res, error); }
}
