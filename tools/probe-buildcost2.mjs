// Build-cost and render-bucket probe for the five shipped voxel scenes.
//
// Run: node tools/probe-buildcost2.mjs [--n=9] [--scene=brooklyn] [--json]
//
// WHY THIS EXISTS, AND WHY v1 IS NOT HERE
// ---------------------------------------
// The numbers in STATUS.md's "Established facts" came from a scratch script
// that was never committed, so nothing downstream of them was reproducible.
// This is that script rebuilt as a tool, held to the instrument standard
// STATUS.md sets and treats as binding:
//
//   "this box showed 2.0-2.6x median/min noise and a 40 s outlier on a 2.5 s
//    build while agents were live. No perf number is quotable until the tree
//    is still. Min-of-N round-robin is the minimum acceptable instrument."
//
// Three rules follow from that, and all three are enforced here rather than
// left to the caller's discipline:
//
//   1. ROUND-ROBIN. One rep builds every scene once, in order, then the next
//      rep starts. Never all reps of A then all reps of B. A machine that
//      warms, throttles, or GCs mid-run then contaminates every scene equally
//      instead of landing entirely on whichever scene held the wall clock at
//      the time. A drifting box is the single failure mode that most reliably
//      manufactures a fake result.
//   2. MIN-OF-N. min is the estimator, because build cost is a floor with
//      one-sided noise: nothing makes a build faster than the machine can run
//      it, everything else makes it slower. median is printed beside it, and
//      their RATIO is printed too, because that ratio is the tree-quiet
//      readout. Over ~1.3 and the box was busy; the timings are not quotable
//      and the tool says so on its own.
//   3. NO SINGLE RUN IS AUTHORITATIVE. --n=1 and --n=2 are refused outright.
//      There is no flag to override it.
//
// COUNTS ARE NOT TIMINGS. Block counts, fine-cell counts, mass, zones and
// render buckets are exact and noise-free (01 section 7.2), so they are
// quotable from a busy box while the timings are not. They are read once per
// rep and cross-checked across every rep; a disagreement is a determinism
// failure and hard-fails the run rather than being averaged away.
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { SURFACE_BY_ID } from '../js/voxeltiles.js';
import { readFileSync } from 'node:fs';

const SCENES = ['gallery', 'manhattan', 'upper-manhattan', 'brooklyn', 'boston'];

// ---------------------------------------------------------------- the key
// js/voxelworld.js is the authority on how blocks batch into InstancedMeshes,
// and it CANNOT be imported here: it imports the bare specifier 'three', which
// resolves through index.html's importmap in a browser and not at all in node.
// (This is the same split js/voxeltiles.js exists to solve for shimmer.mjs --
// pure data in a file a tool can import, GL binding kept next door.)
//
// So the key is reimplemented below, which makes drift the obvious hazard: a
// probe carrying a stale copy of the key reports draw-call counts for a
// renderer that no longer exists, and reports them confidently. That is worse
// than having no probe. The guard is a SOURCE PIN -- the real bucket loop is
// read out of voxelworld.js, normalised, and matched against the variants
// below. An unrecognised loop is a hard failure, never a warning: the tool
// refuses to print numbers it cannot prove are the shipped renderer's.
//
// Both variants stay implemented after a key change, on purpose. It means the
// before/after comparison runs on ONE committed instrument rather than on a
// probe edited between the two measurements, and it satisfies 01 section 7.4's
// requirement to report the key change separately from anything else that
// moves. ADR-0013's P2.6 will edit this loop again; add its variant here, do
// not replace these.
const isSurface = (id) => typeof id === 'string' && SURFACE_BY_ID.has(id);

// The block extent as the pre-ADR-0013 `b.s` scalar wrote it. A block is a box
// now and carries no scalar, so the historical variants below could no longer
// compute their own historical numbers — every key would end in `undefined` and
// collapse the size split that is the whole point of the `size-always` column.
// A cube tags as its bare size, which is exactly what `b.s` held, so those
// columns keep reporting what they reported when the field existed. Their `src`
// pins are untouched: those are the historical SOURCE and must not drift.
const sizeTag = (b) => (b.sx === b.sy && b.sy === b.sz ? b.sx : b.sx + 'x' + b.sy + 'x' + b.sz);

const KEY_VARIANTS = [
  {
    id: 'size-always',
    label: 'b.s in the key for every block (pre-P1.2)',
    src: "for (const b of sim.blocks) { const surf = surfOf(b); const k = (surf ? surf + ':' : '') + b.matType + ':' + b.s; if (!byMat.has(k)) byMat.set(k, { surf, size: b.s, list: [] }); byMat.get(k).list.push(b); }",
    key: (b, surf) => (surf ? surf + ':' : '') + b.matType + ':' + sizeTag(b),
  },
  {
    id: 'size-when-surfaced',
    label: 'b.s in the key only when surfaced (P1.2)',
    src: "for (const b of sim.blocks) { const surf = surfOf(b); const k = surf ? surf + ':' + b.matType + ':' + b.s : b.matType; if (!byMat.has(k)) byMat.set(k, { surf, size: surf ? b.s : null, list: [] }); byMat.get(k).list.push(b); }",
    key: (b, surf) => (surf ? surf + ':' + b.matType + ':' + sizeTag(b) : b.matType),
  },
  {
    id: 'extent-when-surfaced',
    label: 'per-axis extent in the key only when surfaced (ADR-0013 P2.6)',
    src: "for (const b of sim.blocks) { const surf = surfOf(b); const ext = b.sx === b.sy && b.sy === b.sz ? b.sx : b.sx + 'x' + b.sy + 'x' + b.sz; const k = surf ? surf + ':' + b.matType + ':' + ext : b.matType; if (!byMat.has(k)) byMat.set(k, { surf, size: surf ? b.sAvg : null, list: [] }); byMat.get(k).list.push(b); }",
    key: (b, surf) => (surf ? surf + ':' + b.matType + ':' + sizeTag(b) : b.matType),
  },
];

// Strip line comments and collapse whitespace, so the pin survives reflow and
// comment edits but not a change to what the code actually does.
function normalise(src) {
  return src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
}

function readShippedBucketLoop() {
  const src = readFileSync(new URL('../js/voxelworld.js', import.meta.url), 'utf8');
  const anchor = src.indexOf('const byMat = new Map();');
  if (anchor < 0) throw new Error('probe-buildcost2: could not find `const byMat = new Map();` in js/voxelworld.js');
  const start = src.indexOf('for (const b of sim.blocks) {', anchor);
  if (start < 0) throw new Error('probe-buildcost2: could not find the bucket loop after `const byMat` in js/voxelworld.js');
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('probe-buildcost2: unbalanced braces in the bucket loop');
  return normalise(src.slice(start, end));
}

function resolveShippedVariant() {
  const loop = readShippedBucketLoop();
  const hit = KEY_VARIANTS.find((v) => normalise(v.src) === loop);
  if (!hit) {
    console.error('probe-buildcost2: REFUSING TO REPORT.');
    console.error('  The bucket loop in js/voxelworld.js matches no known key variant, so this');
    console.error('  probe cannot prove which renderer it is describing. Add the new variant to');
    console.error('  KEY_VARIANTS (keep the old ones) and re-run.');
    console.error('  Shipped loop, normalised:');
    console.error(`    ${loop}`);
    process.exit(2);
  }
  return hit;
}

// ---------------------------------------------------------------- counting
function countScene(sim) {
  const surfaceMap = sim.sceneSurfaces || null;
  const surfOf = (b) => {
    if (!surfaceMap) return null;
    const id = surfaceMap[b.matType];
    return isSurface(id) ? id : null;
  };
  const buckets = new Map(KEY_VARIANTS.map((v) => [v.id, new Set()]));
  const sizes = new Set();
  for (const b of sim.blocks) {
    const surf = surfOf(b);
    sizes.add(sizeTag(b));
    for (const v of KEY_VARIANTS) buckets.get(v.id).add(v.key(b, surf));
  }
  return {
    blocks: sim.totalBlocks,
    cells: sim.grid.size,
    mass: Math.round(sim.totalMass),
    zones: sim._compBlocks.length,
    sizes: sizes.size,
    surfaced: !!surfaceMap,
    buckets: Object.fromEntries([...buckets].map(([k, s]) => [k, s.size])),
  };
}

const sameCounts = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- the run
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const N = parseInt(flag('n', '9'), 10);
const only = flag('scene', null);
const asJson = argv.includes('--json');

if (!Number.isFinite(N) || N < 3) {
  console.error(`probe-buildcost2: --n=${flag('n', '9')} refused. Minimum is 3.`);
  console.error('  A single run is not a measurement and there is no flag to say otherwise.');
  console.error('  STATUS.md: "Min-of-N round-robin is the minimum acceptable instrument."');
  process.exit(2);
}
const scenes = only ? SCENES.filter((s) => s === only) : SCENES;
if (scenes.length === 0) {
  console.error(`probe-buildcost2: --scene=${only} matches none of: ${SCENES.join(', ')}`);
  process.exit(2);
}

const shipped = resolveShippedVariant();
const times = new Map(scenes.map((s) => [s, []]));
const counts = new Map();

if (!asJson) {
  process.stderr.write(`probe-buildcost2: ${scenes.length} scenes x ${N} reps, round-robin`);
}
for (let rep = 0; rep < N; rep++) {
  for (const scene of scenes) {
    const t0 = performance.now();
    const sim = new VoxelSandboxSim({ seed: 'probe-buildcost2', scene });
    const ms = performance.now() - t0;
    times.get(scene).push(ms);
    const c = countScene(sim);
    if (!counts.has(scene)) counts.set(scene, c);
    else if (!sameCounts(counts.get(scene), c)) {
      console.error(`\nprobe-buildcost2: ${scene} produced different counts on rep ${rep + 1} than on rep 1.`);
      console.error('  These are supposed to be exact. A scene build that is not deterministic');
      console.error('  invalidates every number here, so this run is void (ADR-0003).');
      console.error(`  rep 1: ${JSON.stringify(counts.get(scene))}`);
      console.error(`  rep ${rep + 1}: ${JSON.stringify(c)}`);
      process.exit(1);
    }
  }
  if (!asJson) process.stderr.write('.');
}
if (!asJson) process.stderr.write('\n\n');

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0], median: s[(s.length - 1) >> 1], max: s[s.length - 1] };
};

const rows = scenes.map((scene) => ({ scene, ...stats(times.get(scene)), ...counts.get(scene) }));
const worstRatio = Math.max(...rows.map((r) => r.median / r.min));
const quiet = worstRatio <= 1.3;

if (asJson) {
  console.log(JSON.stringify({ n: N, shippedKey: shipped.id, quiet, worstRatio, rows }, null, 2));
  process.exit(0);
}

const pad = (v, w) => String(v).padStart(w);
const padr = (v, w) => String(v).padEnd(w);
const n = (v) => v.toLocaleString('en-US');

console.log(`Shipped bucket key: ${shipped.id}  (${shipped.label})`);
console.log(`Pinned against js/voxelworld.js's live bucket loop.\n`);

console.log('COUNTS  exact, deterministic, quotable regardless of machine load');
console.log(`  ${padr('scene', 16)} ${pad('blocks', 8)} ${pad('fine cells', 11)} ${pad('mass', 8)} ${pad('zones', 6)} ${pad('sizes', 6)} ${pad('surfaced', 9)}`);
for (const r of rows) {
  console.log(`  ${padr(r.scene, 16)} ${pad(n(r.blocks), 8)} ${pad(n(r.cells), 11)} ${pad(n(r.mass), 8)} ${pad(n(r.zones), 6)} ${pad(r.sizes, 6)} ${pad(r.surfaced ? 'yes' : 'no', 9)}`);
}

console.log('\nRENDER BUCKETS  one InstancedMesh per bucket, so this IS the block draw-call count');
console.log(`  ${padr('scene', 16)} ${pad('size-always', 12)} ${pad('size-when-surf', 15)} ${pad('delta', 7)} ${pad('extent-when-surf', 17)}`);
let totA = 0, totB = 0, totC = 0;
for (const r of rows) {
  const a = r.buckets['size-always'], b = r.buckets['size-when-surfaced'], c = r.buckets['extent-when-surfaced'];
  totA += a; totB += b; totC += c;
  const d = b - a;
  console.log(`  ${padr(r.scene, 16)} ${pad(a, 12)} ${pad(b, 15)} ${pad(d > 0 ? `+${d}` : d, 7)} ${pad(c, 17)}`);
}
console.log(`  ${padr('TOTAL', 16)} ${pad(totA, 12)} ${pad(totB, 15)} ${pad(totB - totA, 7)} ${pad(totC, 17)}`);
console.log(`  shipped column: ${shipped.id}`);
// ADR-0013's claim for P2.6 is that going per-axis re-partitions nothing on an
// all-cube scene. That is a number, so print it rather than asserting it.
console.log(`  extent-when-surf vs size-when-surf: ${totC === totB ? 'identical' : `MOVED ${totC - totB}`}`);

console.log(`\nBUILD COST  min-of-${N}, round-robin, ms`);
console.log(`  ${padr('scene', 16)} ${pad('min', 9)} ${pad('median', 9)} ${pad('max', 9)} ${pad('med/min', 8)}`);
for (const r of rows) {
  console.log(`  ${padr(r.scene, 16)} ${pad(r.min.toFixed(1), 9)} ${pad(r.median.toFixed(1), 9)} ${pad(r.max.toFixed(1), 9)} ${pad((r.median / r.min).toFixed(2), 8)}`);
}
console.log(`\n  N = ${N}. Estimator is min; median and med/min are the tree-quiet readout.`);
if (quiet) {
  console.log(`  Worst med/min = ${worstRatio.toFixed(2)} (<= 1.30). Timings are quotable.`);
} else {
  console.log(`  Worst med/min = ${worstRatio.toFixed(2)} (> 1.30). THE BOX WAS BUSY -- do not quote these`);
  console.log('  timings. The COUNTS above are unaffected and remain quotable.');
}
