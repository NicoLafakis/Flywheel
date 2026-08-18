// Cloud progress sync — the client half (.wiki/plans/cloud-progress-sync.md §2.6-2.8).
//
// The SAVE is a document; the server keeps one per account. This module moves
// it in both directions and never touches a live sim:
//   * pull(save)   — fetch the account's document, upgrade it if it was written
//                    by an older client, MERGE it with the local save (never
//                    overwrite; mergeBlobs keeps the better of every record),
//                    apply, and push back if the merge changed anything.
//   * push(save)   — send toBlob(save) with the revision we last agreed on; the
//                    server may merge (stale revision) or fence coins, and the
//                    CANONICAL document it answers with is adopted here — the
//                    one place server state flows back into a save, always
//                    outside sim.step (invariant 4; deferred while playing).
//   * scheduleSync — trailing-edge debounce (8 s) after each write path;
//                    `save.cloud.dirty` IS the queue and flushSync IS the drain
//                    (one pending push supersedes all earlier ones, §2.7).
//   * flushSync    — push now if dirty (menu return, tab hidden, reconnect).
//   * onIdentityChanged — register / login / claim / transfer: pull, then push.
//
// Failure contract, copied from js/board/outbox.js: a retryable error (5xx,
// 429, or no answer at all) leaves `dirty` set and the next trigger tries
// again; 401 NOT_SIGNED_IN means this device was signed out (a second login
// elsewhere) — stop retrying, remember `signed-out` until the player signs in
// again, keep playing locally; the 409 schema codes stop the same way. A
// failed push never blocks play (invariant 10). Nothing here is imported by the
// pure-sim modules (invariant 3) and nothing here imports three.js (invariant 9).
//
// `createSync(deps)` is the seam tools/progress-sync.test.mjs drives with a
// fake clock; the default instance below wires the real ones and is what the
// game imports.
import { CURRENT_VERSION, __MIGRATIONS, defaultCloud, onProgressDirty, storeSave } from '../save.js';
import { post } from '../board/request.js';
import { deviceKey, playerSecret } from '../board/player.js';
import { SYNCED_KEYS, applyBlob, toBlob } from './blob.js';
import { mergeBlobs } from './merge.js';

export const SYNC_DEBOUNCE_MS = 8000;

const STOP_CODES = new Set(['NOT_SIGNED_IN', 'CLIENT_TOO_NEW', 'STALE_SCHEMA']);

function cloudOf(save) {
  if (!save.cloud) save.cloud = defaultCloud();
  return save.cloud;
}

/** Any star, coin, owned item, upgrade or finished run: worth becoming the
 *  account's first document on a first sign-in. */
export function hasProgress(save) {
  if ((save.coins || 0) > 0) return true;
  if (Array.isArray(save.ownedItems) && save.ownedItems.length) return true;
  for (const l of Object.values(save.levels || {})) if (l && (l.stars > 0 || l.won)) return true;
  for (const s of Object.values(save.sandbox || {})) if (s && ((s.runs || 0) > 0 || (s.completions || 0) > 0)) return true;
  for (const c of Object.values(save.challenges || {})) if (c && (c.completed3m || c.completed90s)) return true;
  for (const r of Object.values(save.upgrades || {})) if ((r || 0) > 0) return true;
  return false;
}

/** Task 10: a remote document written by an older client goes through the same
 *  MIGRATIONS chain a local save would, so cloud and local upgrades share one
 *  path. Any throw falls back to the blob as-is (merge still keeps the better). */
export function upgradeRemoteBlob(schemaVersion, blob) {
  let doc = { ...(blob || {}), version: Number(schemaVersion) || CURRENT_VERSION };
  try {
    while (doc.version < CURRENT_VERSION) {
      const fn = __MIGRATIONS[doc.version];
      if (!fn) break;
      doc = fn(doc);
    }
  } catch { doc = { ...(blob || {}) }; }
  const out = {};
  for (const k of SYNCED_KEYS) if (k in doc) out[k] = doc[k];
  return out;
}

const sameDoc = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createSync(deps = {}) {
  const d = {
    post,
    secret: playerSecret,
    device: deviceKey,
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h),
    isPlaying: () => false,
    store: storeSave,
    debounceMs: SYNC_DEBOUNCE_MS,
    ...deps,
  };
  let timer = null;
  let inflight = null;      // the push promise currently on the wire
  let stopped = false;      // 401 / schema stop, cleared by onIdentityChanged
  let lastTrimmed = [];     // for the one-line "some purchases could not be verified" notice
  let pendingApply = null;  // a canonical/merged blob held back while playing

  const usable = () => {
    const s = d.secret();
    // An offline register/login hands the device a `local-*` secret (player.js
    // fallback): the server cannot know it, so nothing leaves the device.
    return s && typeof s.player_id === 'string' && !s.player_id.startsWith('local-') ? s : null;
  };
  const setState = (save, state) => { cloudOf(save).state = state; };
  const persist = (save) => { try { d.store(save); } catch { /* storage blocked */ } };

  function configure(partial) { Object.assign(d, partial); }

  function status(save) {
    const c = cloudOf(save);
    if (!usable()) return 'idle';
    if (c.state === 'signed-out' || stopped) return 'signed-out';
    if (inflight) return 'syncing';
    if (c.state === 'offline') return 'offline';
    if (c.dirty) return c.lastPushedAt ? 'offline' : 'idle';
    return c.state === 'synced' ? 'synced' : 'idle';
  }

  // Apply a document to the save — or, mid-level, hold it until the menu.
  function adopt(save, blob) {
    if (d.isPlaying()) { pendingApply = blob; return false; }
    applyBlob(save, blob);
    pendingApply = null;
    return true;
  }
  function drainPending(save) {
    if (pendingApply && !d.isPlaying()) { applyBlob(save, pendingApply); pendingApply = null; persist(save); }
  }

  function onError(save, error) {
    const c = cloudOf(save);
    if (error && STOP_CODES.has(error.code)) {
      stopped = true;
      setState(save, 'signed-out');
    } else {
      // Retryable by contract, or no answer at all (fetch threw): stay dirty.
      setState(save, 'offline');
    }
    persist(save);
  }

  async function push(save) {
    const secret = usable();
    if (!secret || stopped) return null;
    if (inflight) return inflight;
    const c = cloudOf(save);
    if (d.isPlaying()) return null;      // invariant 4: never mid-level
    drainPending(save);
    const startedAt = c.lastLocalChangeAt;
    setState(save, 'syncing');
    inflight = (async () => {
      try {
        const result = await d.post('/progress/push', {
          ...secret, device_key: d.device(),
          base_revision: c.revision || 0, schema_version: CURRENT_VERSION, blob: toBlob(save),
        });
        c.revision = result.revision;
        c.lastPushedAt = d.now();
        lastTrimmed = Array.isArray(result.trimmed) ? result.trimmed : [];
        // Changes made while the push was on the wire are newer than the
        // canonical answer: keep them dirty for the next push and do not stamp
        // over them; otherwise the server's document is the truth now.
        if (c.lastLocalChangeAt === startedAt) {
          if (result.blob) adopt(save, result.blob);
          c.dirty = false;
        }
        setState(save, 'synced');
        persist(save);
        return result;
      } catch (error) {
        onError(save, error);
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function pull(save) {
    const secret = usable();
    if (!secret) return null;
    const c = cloudOf(save);
    try {
      const result = await d.post('/progress/pull', { ...secret, device_key: d.device() });
      c.lastPulledAt = d.now();
      if (!result.found) {
        // First sign-in on an account with nothing stored: this phone's
        // progress becomes the account's first document (§3.3).
        if (hasProgress(save)) { c.dirty = true; c.revision = 0; persist(save); return push(save); }
        setState(save, 'synced');
        persist(save);
        return result;
      }
      const remote = upgradeRemoteBlob(result.schema_version, result.blob);
      const local = toBlob(save);
      const merged = mergeBlobs(local, remote, {
        aChangedAt: c.lastLocalChangeAt || 0,
        bChangedAt: Date.parse(result.updated_at) || 0,
      });
      c.revision = result.revision;
      const applied = adopt(save, merged);
      if (!sameDoc(merged, remote)) {
        // The merge added something the server does not have: push it back.
        // Even if the apply is on hold (mid-level), the push waits the same way.
        c.dirty = true;
        c.lastLocalChangeAt = d.now();
        persist(save);
        if (applied) return push(save);
        return result;
      }
      c.dirty = false;
      setState(save, 'synced');
      persist(save);
      return result;
    } catch (error) {
      onError(save, error);
      return null;
    }
  }

  function scheduleSync(save) {
    if (!usable() || stopped) return;
    if (timer) d.clearTimeout(timer);
    timer = d.setTimeout(() => { timer = null; return flushSync(save); }, d.debounceMs);
  }

  async function flushSync(save) {
    if (timer) { d.clearTimeout(timer); timer = null; }
    drainPending(save);
    if (!cloudOf(save).dirty) return null;
    if (d.isPlaying()) return null;      // deferred: the next menu return flushes
    return push(save);
  }

  async function onIdentityChanged(save) {
    stopped = false;
    if (cloudOf(save).state === 'signed-out') setState(save, 'idle');
    return pull(save);
  }

  /** Sign-out bookkeeping: the next account on this device starts from a
   *  clean pull; the progress itself stays (product default, §3.4). */
  function resetForSignOut(save) {
    if (timer) { d.clearTimeout(timer); timer = null; }
    stopped = false; pendingApply = null; lastTrimmed = [];
    const c = cloudOf(save);
    c.revision = 0; c.dirty = false; c.lastPushedAt = null; c.lastPulledAt = null; c.state = 'idle';
  }

  return {
    configure, status, push, pull, scheduleSync, flushSync, onIdentityChanged, resetForSignOut,
    lastTrimmed: () => lastTrimmed,
    hasPendingApply: () => pendingApply !== null,
  };
}

// The game's instance. main.js hands it the `isPlaying` gate through
// configureSync; save.js's write paths reach it through onProgressDirty.
const instance = createSync();
onProgressDirty((save) => instance.scheduleSync(save));

export const configureSync = (partial) => instance.configure(partial);
export const syncStatus = (save) => instance.status(save);
export const push = (save) => instance.push(save);
export const pull = (save) => instance.pull(save);
export const scheduleSync = (save) => instance.scheduleSync(save);
export const flushSync = (save) => instance.flushSync(save);
export const onIdentityChanged = (save) => instance.onIdentityChanged(save);
export const resetSyncForSignOut = (save) => instance.resetForSignOut(save);
export const lastTrimmed = () => instance.lastTrimmed();
