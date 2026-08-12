import { cronAuthorised, errorResponse, fail, method, ok } from '../_lib.mjs';
import { drainOnePendingRun } from '../_verify.mjs';

// Vercel Cron invokes this once per minute. One replay per invocation bounds
// CPU use; pending submissions remain durable and the next tick continues.
export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  if (!cronAuthorised(req)) { fail(res, 401, 'UNAUTHORIZED', 'Cron authorization is required.'); return; }
  try { ok(res, { processed: await drainOnePendingRun() }); }
  catch (error) { errorResponse(res, error); }
}
