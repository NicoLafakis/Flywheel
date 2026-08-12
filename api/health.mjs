import { method, ok } from './_lib.mjs';

// Kept dependency-free as the deployment smoke probe. It intentionally reveals
// no environment state: a 200 means this function bundle can boot, nothing more.
export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  ok(res, { service: 'flywheel-boards', ready: true });
}
