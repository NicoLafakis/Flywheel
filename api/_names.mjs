// The one place a player name is screened, and the one place a nameless guest
// is given an identity.
//
// WHY THIS FILE EXISTS
// Two of the three reasons the boards read `[]` met here. `fw_record_verdict`
// only publishes a run `when r.player_id is not null`, and `run/start` bound
// `player_id: null` for anyone who had not typed a name into a signup form. A
// guest's run was ticketed, submitted, replayed by the cron, scored - and then
// dropped, with no error on any surface. So a player is given a real `players`
// row at ticket time, before they have done anything, and their very first run
// publishes.
//
// The name screen (`blockedName`) was copy-pasted into `auth/register`,
// `name/claim` and `name/rename`. A fourth copy for this path is how one of the
// four quietly stops consulting the live `blocked_names` table, so the screen
// moved here and those three import it. `blockedLocally` is split out as a pure
// function because it is the half a headless test can actually run.
//
// The word lists are NOT duplicated here. `js/board/names.js` is the generator
// and it is import-safe under Node: it touches `globalThis.crypto` only inside
// `cryptoRandom()`, which the server never calls - `autoNameCandidates()`
// injects `node:crypto` randomness instead, for the same reason `_verify.mjs`
// imports `js/voxelsim.js` rather than reimplementing the sim.

import { randomBytes } from 'node:crypto';
import blockedNames from './data/blocked-names.json' with { type: 'json' };
import { nameCandidates } from '../js/board/names.js';
import { newDeviceToken, normaliseName, rest, sha256Hex } from './_lib.mjs';

export const RESERVED = new Set(['admin', 'administrator', 'moderator', 'official', 'staff', 'support', 'system', 'flywheel', 'sprocket']);

/** The static half of the screen: reserved words plus the shipped pattern file.
 *  Pure and synchronous, so a test can sweep the whole generator through it. */
export function blockedLocally(key) {
  return RESERVED.has(key) || blockedNames.some((row) => key.includes(row.pattern));
}

/** The full screen: the static half plus the live table an operator edits. */
export async function blockedName(key) {
  if (blockedLocally(key)) return true;
  const rows = await rest('blocked_names?select=pattern,is_exact&limit=500');
  return rows.some((row) => (row.is_exact ? key === row.pattern : key.includes(row.pattern)));
}

/** Escapes offered when a typed name is taken. Shared for the same reason the
 *  screen is: three identical copies is two too many. */
export function suggestions(name, key) {
  const suffixes = ['7', 'X', '27', 'GO', 'RUN'];
  return suffixes.map((suffix) => `${name.slice(0, Math.max(1, 16 - suffix.length))}${suffix}`)
    .filter((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, '') !== key);
}

/** A float in [0, 1) from the OS CSPRNG. Deliberately not `js/rng.js`: that is
 *  the seeded world generator, and a player's name must not be derivable from a
 *  world seed. Mirrors what `cryptoRandom()` does in the browser. */
export function randomUnit() {
  return randomBytes(4).readUInt32BE(0) / 4294967296;
}

/** The retry ladder from js/board/names.js, driven by server randomness. Rung
 *  one is the clean undecorated name; later rungs carry a numeric tag, so a
 *  digit only ever appears after a real collision. */
export function autoNameCandidates(count = 6) {
  return nameCandidates(randomUnit, count);
}

const NAME_LADDER_DEPTH = 6;

function isUniqueViolation(error) {
  return error && (error.status === 409
    || /duplicate key|unique/i.test(JSON.stringify(error.data || error.message || '')));
}

/**
 * Insert a `players` row with a generated name, walking the ladder if the name
 * is taken. A collision therefore costs one extra INSERT, not a failed ticket.
 *
 * The row is a DEVICE-TOKEN account in the sense `playerForToken()` means it:
 * `token_hash = sha256(bearer token)` and no `session_token_hash`. That is what
 * makes the returned token immediately usable for `name/rename` - a guest can
 * change the name they were handed without ever setting a password.
 */
async function provisionGuestPlayer(deviceKey) {
  const token = newDeviceToken();
  for (const candidate of autoNameCandidates(NAME_LADDER_DEPTH)) {
    const parsed = normaliseName(candidate);
    // Belt and braces: tools/names.test.mjs sweeps the whole cross product
    // against both rules, so a rung failing here means the word lists moved and
    // this run should fall through to the next rung rather than 400 a player
    // who did nothing but press start.
    if (!parsed) continue;
    if (await blockedName(parsed.key)) continue;
    try {
      const inserted = await rest('players', {
        method: 'POST',
        body: {
          name: parsed.name,
          name_key: parsed.key,
          token_hash: `\\x${sha256Hex(token)}`,
          token_version: 1,
          moderation_state: 'ok',
          is_auto: true,
          last_seen_at: new Date().toISOString(),
        },
        headers: { prefer: 'return=representation' },
      });
      const player = inserted && inserted[0];
      if (player) return { player, token, provisioned: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return null;
}

/**
 * The identity `run/start` binds a guest ticket to.
 *
 * ONE auto player per device, ever. The device's ticket history is the record of
 * that, so a client that fails to store the credentials we return does not mint
 * a fresh ghost player on every ticket - it re-binds to the same one and its
 * scores accumulate. That, and not the hourly ticket limit, is what actually
 * bounds this: a device gets at most one `players` row out of this path for its
 * whole life, and the 12/hr device + 60/hr origin ticket limits (already checked
 * by the caller before this runs) bound the rate at which NEW devices can reach
 * it at all.
 *
 * A device whose last binding was a CLAIMED account gets nothing: a run must not
 * be attributed to a real account on the strength of a device key alone, and a
 * browser that still owns that account sends its token instead. Returns null,
 * and the ticket is issued unbound exactly as before.
 *
 * Never throws. Invariant 10: a failed provision degrades to today's guest
 * ticket, it does not cost the player their run.
 */
export async function ensureDevicePlayer(deviceKey) {
  try {
    const tickets = await rest(`run_tickets?select=player_id&device_key=eq.${encodeURIComponent(deviceKey)}&player_id=not.is.null&order=issued_at.desc&limit=1`);
    const priorId = tickets && tickets[0] && tickets[0].player_id;
    if (!priorId) return provisionGuestPlayer(deviceKey);
    const rows = await rest(`players?select=id,name&id=eq.${encodeURIComponent(priorId)}&is_auto=is.true&moderation_state=eq.ok&limit=1`);
    const player = rows && rows[0];
    return player ? { player, token: null, provisioned: false } : null;
  } catch (error) {
    // Includes the deploy window where this code is live and the migration
    // adding `players.is_auto` is not: PostgREST 400s a filter naming a column
    // it cannot see, and a guest ticket is a better answer than a failed one.
    console.error('guest provisioning skipped', error);
    return null;
  }
}
