import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { MUSIC_CUES } from '../js/audio/music.js';

const root = new URL('../assets/music/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('MANIFEST.json', root), 'utf8'));
const diskMp3 = (await readdir(root)).filter((name) => name.endsWith('.mp3')).sort();
const manifestMp3 = manifest.files.map((row) => row.path).sort();
const cueMp3 = [...new Set(Object.values(MUSIC_CUES).filter(Boolean))].sort();

assert.deepEqual(diskMp3, manifestMp3, 'manifest must list every shipped MP3 exactly once');
assert.deepEqual(diskMp3, cueMp3, 'cue registry and shipped MP3 set must match');
assert.equal(MUSIC_CUES.gallery, null, 'Gallery must remain deliberately music-free');

let total = 0;
for (const row of manifest.files) {
  const url = new URL(row.path, root);
  const info = await stat(url);
  const bytes = await readFile(url);
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  assert.equal(info.size, row.bytes, `${row.path}: byte count`);
  assert.equal(sha256, row.sha256, `${row.path}: SHA-256`);
  total += info.size;
}
assert.equal(total, manifest.totalBytes, 'manifest total byte count');

console.log(`PASS music assets: ${manifest.files.length} files, ${total} bytes, registry + hashes agree`);
