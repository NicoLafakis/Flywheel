// TDD Static Guard: no git merge-conflict marker may ship in a tracked file.
//
// WHY THIS FILE EXISTS
// `STATUS.md` shipped with a bare `>>>>>>>` line in commit 8c3c85d and stayed
// broken across five further commits. The conflict's content had actually been
// merged correctly — both sides were kept — but the closing marker was never
// deleted, so the project's "where things stand" page carried a line of raw git
// plumbing naming a commit hash. Nothing in the pipeline looked: there is no
// build step, no linter and no formatter in this repo, and the validator only
// ever read `.js`/`.mjs`. A marker in a `.md` file is invisible to every gate
// that existed.
//
// The same class of defect in a `.js` file is worse than ugly — it is a
// SyntaxError, so the module fails to load and the screen that imports it is
// simply gone. `validateSyntax()` would catch that one late and cryptically;
// this catches it early and says what it is.
//
// WHAT IT SCANS
// Every file git would let you commit — tracked, plus untracked-but-not-ignored —
// that is either a `.md` anywhere in the repo, or lives under `js/` or `tools/`.
// Tracked alone is too narrow for a pre-commit gate: a brand-new file with a
// marker in it is exactly the case worth catching BEFORE it is committed, and
// this file itself was invisible to the guard on its first run under that rule.
// `.gitignore` is honoured, so build output and scratch stay out of it.
// `git ls-files` is the source of that set, with a filesystem walk as a fallback
// so the guard still runs in an exported tree with no `.git`.
//
// WHY THE PATTERNS ARE BUILT FROM FRAGMENTS
// A guard that searched for literal marker text could not be allowed to scan
// ITSELF — the literals it hunts for would be sitting in its own source. The
// usual dodge is to skip the file, which leaves the one file most likely to
// contain a marker permanently unguarded. Instead every pattern here is
// assembled at runtime from repeated single characters, so this file contains no
// marker literal at all and is scanned on exactly the same terms as every other.
//
// WHY "EXACTLY SEVEN"
// git writes markers as precisely seven characters at column 0, followed by a
// space-and-label or end of line. Requiring exactly seven is what keeps a
// markdown setext underline (`=====…` under a title) or an ASCII rule from being
// reported as a conflict.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('Testing every tracked .md / js / tools file for git conflict markers...');

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

// --- the marker alphabet, assembled so no literal appears in this source ------
// '<' x7, '|' x7 (diff3 base), '=' x7, '>' x7.
const MARKER_CHARS = ['<', '|', '=', '>'];
const MARKER_WIDTH = 7;
const markerText = (ch) => ch.repeat(MARKER_WIDTH);

// Exactly MARKER_WIDTH of the character at column 0, not followed by an eighth,
// then either the end of the line or git's separating space.
const MARKER_RE = new RegExp(
  `^(${MARKER_CHARS.map((ch) => `\\${ch}{${MARKER_WIDTH}}(?!\\${ch})`).join('|')})([ \\t].*)?$`,
);

/** Every conflict-marker line in `text`, as { line, marker, raw }. */
function findMarkers(text) {
  const hits = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER_RE.exec(lines[i]);
    if (m) hits.push({ line: i + 1, marker: m[1], raw: lines[i].slice(0, 120) });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Control cases. Run BEFORE the sweep: a detector that matches nothing would
// report a clean repo forever, and a detector that matches everything would be
// noise. Both halves are proven against strings built from the same fragments.
// ---------------------------------------------------------------------------
const positiveControl = MARKER_CHARS
  .map((ch, i) => (i === 1 ? markerText(ch) : `${markerText(ch)} label-${i}`))
  .join('\n');
assert.equal(findMarkers(positiveControl).length, MARKER_CHARS.length,
  'the detector must recognise all four git marker forms, bare and labelled');

const negativeControl = [
  '# A heading',
  MARKER_CHARS[2].repeat(40),                        // setext underline / ASCII rule
  MARKER_CHARS[0].repeat(MARKER_WIDTH + 1),          // eight, not seven
  MARKER_CHARS[3].repeat(MARKER_WIDTH - 1),          // six, not seven
  `  ${markerText(MARKER_CHARS[0])} indented`,       // not at column 0
  `text ${markerText(MARKER_CHARS[3])} inline`,      // not at column 0
  `${markerText(MARKER_CHARS[3])}x no separator`,    // no space/EOL after
].join('\n');
assert.equal(findMarkers(negativeControl).length, 0,
  `the detector must not fire on look-alikes: ${JSON.stringify(findMarkers(negativeControl))}`);

// ---------------------------------------------------------------------------
// The file set.
// ---------------------------------------------------------------------------
const isCandidate = (rel) => rel.endsWith('.md') || rel.startsWith('js/') || rel.startsWith('tools/');

function committableViaGit() {
  // --cached + --others --exclude-standard = "everything a commit could include".
  const res = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (res.error || res.status !== 0 || !res.stdout) return null;
  return [...new Set(res.stdout.split('\0').filter(Boolean))];
}

/** Fallback for a tree with no git: walk it, minus the directories git would ignore anyway.
 *  Returns forward-slash relative paths so the two sources are interchangeable. */
function walkFallback(rel = '') {
  const SKIP = new Set(['.git', 'node_modules', '.vercel']);
  const out = [];
  for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      out.push(...walkFallback(child));
    } else {
      out.push(child);
    }
  }
  return out;
}

const allCommittable = committableViaGit() || walkFallback();
const candidates = allCommittable.filter(isCandidate).sort();

// ---------------------------------------------------------------------------
// Anti-vacuity: prove the sweep is looking at the real repository, including at
// this very file. A green light pointed at an empty list is not a gate.
// ---------------------------------------------------------------------------
assert.ok(candidates.length >= 150,
  `only ${candidates.length} candidate file(s) found — the scanner is not reading the repo`);
for (const required of [
  'STATUS.md',
  'CLAUDE.md',
  '.wiki/modules/multiplayer.md',
  'js/multiplayer/host.js',
  'js/multiplayer/peer.js',
  'tools/validate.mjs',
  // Self-coverage. This guard scans its own source on the same terms as every
  // other file, which is only possible because the patterns above are assembled
  // rather than written out (see the header).
  'tools/conflict-markers.test.mjs',
]) {
  assert.ok(candidates.includes(required),
    `${required} must be in the scanned set — the file filter has drifted`);
}

// ---------------------------------------------------------------------------
// The guard proper.
// ---------------------------------------------------------------------------
let scanned = 0;
let skipped = 0;
const offences = [];
for (const rel of candidates) {
  const abs = join(repoRoot, rel);
  let text;
  try {
    if (!statSync(abs).isFile()) continue;
    const buf = readFileSync(abs);
    // A NUL byte means binary; there is no line-start to speak of.
    if (buf.includes(0)) { skipped++; continue; }
    text = buf.toString('utf8');
  } catch {
    // Tracked but absent from the working tree (a deletion not yet committed):
    // there is no content to be wrong.
    skipped++;
    continue;
  }
  scanned++;
  for (const hit of findMarkers(text)) offences.push({ rel, ...hit });
}

for (const o of offences) {
  console.error(`  FAIL ${o.rel}:${o.line} — unresolved git conflict marker: ${o.raw}`);
}
assert.equal(offences.length, 0,
  `${offences.length} unresolved git conflict marker(s) are committed — resolve the conflict by merging BOTH sides, then delete every marker line`);

console.log(`  ok: ${scanned} file(s) scanned (${skipped} skipped as binary/absent), 0 conflict markers`);
console.log(`  ok: detector proven on ${MARKER_CHARS.length} marker forms and ${negativeControl.split('\n').length} look-alikes`);
console.log('✓ conflict marker guard PASSED');
