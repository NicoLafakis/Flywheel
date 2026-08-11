// The one file that imports the vendored Supabase Realtime client (ADR-0014,
// and 03-technical-design.md's rule for js/net/client.js: "Everything else in
// js/net/ goes through it and nothing else imports supabase-js").
//
// What is vendored, and why it is not all of supabase-js: the arena needs
// exactly one Supabase capability — Realtime broadcast channels — and
// @supabase/realtime-js is the standalone package that provides them. It is
// 135 KB bundled against ~500 KB for the full supabase-js (auth + PostgREST +
// storage + functions + realtime), none of whose other pieces have a caller in
// this repo yet. When boards/identity land (03 §4.1), the full client can
// replace the bundle wholesale under the same import; this module's exports are
// the seam that makes that a one-file change.
//
// js/vendor/supabase-realtime.module.js is @supabase/realtime-js@2.112.2,
// bundled once to a single self-contained ESM file (its two deps inlined) and
// committed — same pattern, same rules as js/vendor/three.module.js: pinned,
// same-origin, never edited, replaced wholesale to upgrade.
//
// Lazy + singleton: nothing here runs at import time beyond binding the
// constructor, so pages that never go online never open a socket
// (invariant 10 — the network is optional at every point).

import { RealtimeClient } from '../vendor/supabase-realtime.module.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

let singleton = null;

/**
 * The shared RealtimeClient. Connects lazily — the socket opens on the first
 * `channel(...).subscribe()`, not here.
 */
export function realtimeClient() {
  if (!singleton) singleton = createRealtimeClient();
  return singleton;
}

/**
 * A fresh, unshared client (its own WebSocket). The live self-test uses two of
 * these to be two genuinely separate ends of the wire; the game itself should
 * use `realtimeClient()`.
 */
export function createRealtimeClient(opts = {}) {
  return new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, {
    params: { apikey: SUPABASE_PUBLISHABLE_KEY },
    // Realtime tears a quiet socket down server-side; the client heartbeats to
    // keep a lobby (host waiting for a joiner) alive. 25 s is the documented
    // default, stated here so it is a decision rather than an accident.
    heartbeatIntervalMs: 25000,
    ...opts,
  });
}
