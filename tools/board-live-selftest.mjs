// Live black-box gate for the public surface. It never reads a server secret:
// tickets come from the deployed endpoint and the raw-table probes use only the
// browser's publishable key.

import { encodeTrace, createInputBuffer } from '../js/replay.js';
import { RANKED_SIM_VERSION, RANKED_TICK_COUNT, RANKED_TUNE_ID } from '../js/voxelsim.js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/net/supabase-config.js';

const base = (process.env.FLYWHEEL_URL || 'https://flywheel-woad.vercel.app').replace(/\/$/, '');
const device = `live-selftest-${Date.now().toString(36)}-device`;
let assertions = 0;
const assert = (value, message) => { assertions++; if (!value) throw new Error(message); };

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}
async function envelope(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json();
  return { response, payload };
}

const health = await envelope('/api/health');
assert(health.response.status === 200 && health.payload.ok, 'health endpoint did not boot');

for (const table of ['players', 'runs', 'run_inputs', 'run_tickets', 'name_transfers', 'blocked_names', 'moderation_reports', 'submission_log', 'operator_audit']) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
  });
  assert(response.status === 401 || response.status === 403, `${table} was readable with the publishable key`);
}

const started = await envelope('/api/run/start', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scene_id: 'chicago', mode: 'run90', device_key: device }),
});
assert(started.response.status === 200 && started.payload.ok, 'ticket issuance failed');
const ticket = started.payload.data;
const trace = b64(encodeTrace(createInputBuffer(RANKED_TICK_COUNT)));
const submitted = await envelope('/api/run/submit', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ run_id: ticket.run_id, ticket: ticket.ticket, device_key: device,
    tick_count: RANKED_TICK_COUNT, tune_id: RANKED_TUNE_ID, sim_version: RANKED_SIM_VERSION,
    client_build: 'live-selftest', claimed_score: 0, trace }),
});
assert(submitted.response.status === 200 && submitted.payload.ok && submitted.payload.data.verdict === 'pending', 'ticketed submission was not accepted as pending');

const replayed = await envelope('/api/run/submit', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ run_id: ticket.run_id, ticket: ticket.ticket, device_key: device,
    tick_count: RANKED_TICK_COUNT, tune_id: RANKED_TUNE_ID, sim_version: RANKED_SIM_VERSION,
    client_build: 'live-selftest', claimed_score: 0, trace }),
});
assert(replayed.response.status === 200 && replayed.payload.ok && replayed.payload.data.idempotent,
  'a repeated submission was not idempotent');

const forged = await envelope('/api/run/submit', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ run_id: ticket.run_id, ticket: 'forged', device_key: device,
    tick_count: RANKED_TICK_COUNT, tune_id: RANKED_TUNE_ID, sim_version: RANKED_SIM_VERSION,
    client_build: 'live-selftest', claimed_score: 999999999, trace }),
});
assert(forged.response.status === 401 && !forged.payload.ok, 'forged ticket was accepted');

let verified = null;
for (let attempt = 0; attempt < 18; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const status = await envelope('/api/run/status', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ run_id: ticket.run_id, device_key: device }),
  });
  if (status.response.status === 200 && status.payload.ok && status.payload.data.verdict === 'verified') {
    verified = status.payload.data;
    break;
  }
}
assert(verified && Number.isFinite(Number(verified.verified_score)),
  'the production cron did not verify the accepted trace within three minutes');

console.log(`board live selftest: ${assertions} assertions PASS · verified ${ticket.run_id}`);
