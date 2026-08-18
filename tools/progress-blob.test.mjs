// Behaviour suite for js/cloud/blob.js — toBlob()/applyBlob(), the two pure
// functions that define what follows the player (SYNCED_KEYS, exported by
// api/_progress.mjs so client and server cannot disagree) and what stays on
// the device. Spawned by the `progressBlob` section of tools/validate.mjs.
import assert from 'node:assert/strict';
import { toBlob, applyBlob } from '../js/cloud/blob.js';
import { SYNCED_KEYS, SYNCED_SETTINGS_KEYS, sanitiseBlob } from '../api/_progress.mjs';
import { __freshSave } from '../js/save.js';

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

const fresh = __freshSave();

// 1. The boundary is exactly SYNCED_KEYS, and every synced setting is a real setting.
eq(Object.keys(toBlob(fresh)).sort(), [...SYNCED_KEYS].sort(), 'toBlob(freshSave()) keys == SYNCED_KEYS');
for (const k of SYNCED_SETTINGS_KEYS) check(k in fresh.settings, `SYNCED_SETTINGS_KEYS.${k} is a real defaultSettings() key`);
check(SYNCED_SETTINGS_KEYS.includes('musicVol') && SYNCED_SETTINGS_KEYS.includes('sfxVol') && SYNCED_SETTINGS_KEYS.includes('turnSens'), 'music, sfx and turn sensitivity travel');

// 2. Device-only and secret-bearing keys never appear.
const s = __freshSave();
s.coins = 77; s.ownedItems = ['neon']; s.equippedSkin = 'neon';
s.settings.quality = 'low'; s.settings.perfMode = true; s.settings.voxGravity = 12; s.settings.musicVol = 0.25;
s.outbox = [{ run_id: 'r' }]; s.player.id = 'p'; s.cloud = { dirty: true, revision: 4 };
const b = toBlob(s);
for (const k of ['outbox', 'player', 'cloud', 'version']) check(!(k in b), `${k} never appears in the blob`);
for (const k of ['quality', 'perfMode', 'voxGravity', 'qualityChosen']) check(!(k in b.settings), `settings.${k} never appears in the blob`);
eq(b.settings.musicVol, 0.25, 'taste settings travel');
eq(b.coins, 77, 'coins travel');
check(b.levels !== s.levels && b.settings !== s.settings, 'toBlob copies rather than aliasing the save (a later applyBlob must not mutate through it)');
check(JSON.stringify(sanitiseBlob(b).blob) === JSON.stringify(b), 'a blob straight off a save is already server-clean (sanitiseBlob is a no-op on it)');

// 3. applyBlob round-trips the synced subset and touches nothing else.
const t = __freshSave();
t.settings.quality = 'medium'; t.outbox = [{ run_id: 'keep' }]; t.player.name = 'KEEP'; t.cloud = { revision: 9 };
applyBlob(t, b);
eq(toBlob(t), b, 'applyBlob(toBlob(s)) round-trips the synced subset');
eq(t.settings.quality, 'medium', 'device settings survive applyBlob');
eq(t.outbox, [{ run_id: 'keep' }], 'outbox survives applyBlob');
eq(t.player.name, 'KEEP', 'player survives applyBlob');
eq(t.cloud.revision, 9, 'cloud survives applyBlob');

// 4. applyBlob is defensive about a partial or hostile blob.
const u = __freshSave();
u.coins = 5;
applyBlob(u, { coins: 9, settings: { quality: 'low', musicVol: 0.1 }, outbox: [1], player: { id: 'x' } });
eq(u.coins, 9, 'partial blob applies what it has');
eq(u.settings.quality, 'high', 'a blob cannot smuggle a device setting');
eq(u.outbox, [], 'a blob cannot smuggle outbox');
eq(u.player.id, null, 'a blob cannot smuggle player');
eq(u.settings.musicVol, 0.1, 'partial settings apply');

console.log(`progress-blob: ${n} assertions passed.`);
