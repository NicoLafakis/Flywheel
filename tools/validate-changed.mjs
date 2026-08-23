#!/usr/bin/env node
// Run only the validator sections that cover what you actually touched.
//
// WHY THIS EXISTS. `CLAUDE.md` used to require `node tools/validate.mjs` — the
// whole suite — before any commit touching sim code. That gate is not runnable:
// the cambridge section alone was measured at 4 h 16 m on 2026-08-23, so the
// "required" check was one nobody could have been running, and a gate nobody
// runs is worse than no gate because it is quoted as though it had.
//
// The fix is not to weaken what runs, it is to run the right subset. Editing
// js/voxelscene-paris.js cannot break the brooklyn section; it can break paris,
// the declared-block-count gate, and the cross-scene coverage gates. So that is
// what this runs, and it says exactly what it chose and why.
//
// USAGE
//   node tools/validate-changed.mjs                 # vs the merge-base with main
//   node tools/validate-changed.mjs --base HEAD~3   # vs some other ref
//   node tools/validate-changed.mjs --staged        # what is staged right now
//   node tools/validate-changed.mjs --dry-run       # print the plan, run nothing
//   node tools/validate-changed.mjs --all           # everything, the long way
//
// Anything it cannot map confidently escalates to the full suite rather than
// quietly narrowing — an unrecognised path is the one case where guessing small
// is the dangerous direction.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, dflt) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

// --- what covers what -------------------------------------------------------
// One authored scene, one section. The section names are the ones
// tools/validate.mjs registers, which are NOT always the scene id: Upper
// Manhattan's scene is 'upper-manhattan' and its section is 'upperManhattan'.
// Getting that wrong used to select nothing and still print ALL PASS; the
// validator now rejects unknown names, and this table is the reason it has to.
const SCENE_SECTIONS = {
  'voxelscene-manhattan': 'manhattan',
  'voxelscene-upper-manhattan': 'upperManhattan',
  'voxelscene-brooklyn': 'brooklyn',
  'voxelscene-boston': 'boston',
  'voxelscene-cambridge': 'cambridge',
  'voxelscene-chicago': 'chicago',
  'voxelscene-tokyo': 'tokyo',
  'voxelscene-sydney': 'sydney',
  'voxelscene-auckland': 'auckland',
  'voxelscene-singapore': 'singapore',
  'voxelscene-hongkong': 'hongkong',
  'voxelscene-seoul': 'seoul',
  'voxelscene-beijing': 'beijing',
  'voxelscene-bangkok': 'bangkok',
  'voxelscene-mumbai': 'mumbai',
  'voxelscene-dubai': 'dubai',
  'voxelscene-cairo': 'cairo',
  'voxelscene-athens': 'athens',
  'voxelscene-rome': 'rome',
  'voxelscene-paris': 'paris',
  'voxelscene-london': 'london',
  'voxelscene-amsterdam': 'amsterdam',
  'voxelscene-berlin': 'berlin',
};

// Cheap and cross-cutting: any scene edit can move a declared block count, drop
// a city out of the gate, or lose an audio cue, and none of these costs more
// than a few minutes. They ride along with every scene change.
const SCENE_COMPANIONS = ['declaredBlockCounts', 'playableCitiesGated', 'audioCoverage'];

// Files whose blast radius is every scene. `js/voxelsim.js` and
// `js/voxelkit.js` are imported by all of them, so a change there means the
// whole scene roster plus the companions.
const ALL_SCENES = Object.values(SCENE_SECTIONS);
const SHARED_SIM = [...ALL_SCENES, ...SCENE_COMPANIONS, 'voxelSandbox', 'voxelCollisions', 'scenesWinnable'];

// Non-scene files, mapped to the sections that actually cover them. Anything
// not listed here falls through to the full suite.
const FILE_SECTIONS = [
  [/^js\/voxelsim\.js$/, SHARED_SIM],
  [/^js\/voxelkit\.js$/, SHARED_SIM],
  [/^js\/citycatalog\.js$/, [...SCENE_COMPANIONS, 'globalCampaign', 'campaignUi', 'cityChallenges']],
  [/^js\/tiers\.js$/, ['voxelSandbox', 'voxelCollisions', 'rewardLadders', 'scenesWinnable']],
  [/^js\/citygen\.js$/, ['globalCampaign', 'scenesWinnable']],
  [/^js\/sim\.js$/, ['globalCampaign', 'levelClock', 'scenesWinnable', 'speedInvariance']],
  [/^js\/levels\.js$/, ['globalCampaign', 'campaignUi', 'levelClock']],
  [/^js\/save\.js$/, ['saveSchema', 'progressSchema', 'progressMerge']],
  [/^js\/rng\.js$/, ['fwMath', 'voxelSandbox']],
  [/^js\/fwmath\.js$/, ['fwMath']],
  [/^js\/audio\//, ['audioCoverage']],
  [/^js\/board\//, ['runBoard']],
  [/^js\/multiplayer\//, ['multiplayer']],
  [/^js\/progress/, ['progressSchema', 'progressMerge', 'progressApi', 'progressBlob', 'progressSync', 'progressUi']],
  // Docs and assets cannot change behaviour. Listed explicitly so they resolve
  // to "nothing to run" rather than escalating the whole suite.
  [/^(\.wiki|docs)\//, []],
  [/\.(md|json|png|jpg|svg|mp3|ogg)$/, []],
];

// --- work out what changed --------------------------------------------------
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

let changed;
if (has('--staged')) {
  changed = git('diff', '--cached', '--name-only');
} else {
  let base = valueOf('--base', null);
  if (!base) {
    try { base = git('merge-base', 'HEAD', 'origin/main'); }
    catch { base = git('rev-parse', 'HEAD~1'); }
  }
  changed = git('diff', '--name-only', base) + '\n' + git('diff', '--name-only');
}
const files = [...new Set(changed.split('\n').map((f) => f.trim()).filter(Boolean))];

// --- resolve to sections ----------------------------------------------------
const sections = new Set();
const reasons = [];
let escalate = null;

if (has('--all')) {
  escalate = '--all was passed';
} else if (files.length === 0) {
  console.log('validate-changed: nothing changed — nothing to run.');
  process.exit(0);
}

for (const f of files) {
  if (escalate) break;
  const sceneKey = Object.keys(SCENE_SECTIONS).find((k) => f === `js/${k}.js`);
  if (sceneKey) {
    const sec = SCENE_SECTIONS[sceneKey];
    sections.add(sec);
    SCENE_COMPANIONS.forEach((c) => sections.add(c));
    reasons.push(`${f} → ${sec} (+ companions)`);
    continue;
  }
  const rule = FILE_SECTIONS.find(([re]) => re.test(f));
  if (rule) {
    rule[1].forEach((s) => sections.add(s));
    reasons.push(`${f} → ${rule[1].length ? rule[1].join(', ') : '(no behaviour)'}`);
    continue;
  }
  // This file only chooses what runs; it defines no check, so editing it cannot
  // change a result. Everything else under tools/ can, and escalates.
  if (f === 'tools/validate-changed.mjs') { reasons.push(`${f} → (runner only)`); continue; }
  if (f.startsWith('tools/')) {
    escalate = `${f} defines checks, so its blast radius is the whole suite`;
    break;
  }
  escalate = `${f} maps to no known section`;
}

// --- report and run ---------------------------------------------------------
console.log(`validate-changed: ${files.length} changed file(s)`);
for (const r of reasons) console.log(`  ${r}`);

if (escalate) {
  console.log(`  ESCALATING to the full suite: ${escalate}`);
  console.log('  (the full suite is hours, not minutes — see the cambridge note in CLAUDE.md)');
}

const list = escalate ? null : [...sections];
if (!escalate && list.length === 0) {
  console.log('validate-changed: only non-behavioural files changed — nothing to run.');
  process.exit(0);
}

console.log(escalate ? '\nRunning: the full suite' : `\nRunning ${list.length} section(s): ${list.join(',')}`);
if (has('--dry-run')) process.exit(0);

if (!existsSync('tools/validate.mjs')) {
  console.error('validate-changed: tools/validate.mjs not found — run this from the repo root.');
  process.exit(2);
}

const env = { ...process.env };
if (list) env.FW_VALIDATE_SECTIONS = list.join(',');
const r = spawnSync(process.execPath, ['tools/validate.mjs'], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
