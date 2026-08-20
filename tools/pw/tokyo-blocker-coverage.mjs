// Camera-blocker coverage harness for Tokyo, with Sydney + Auckland control arms.
//
// footprintTops and probeCameraBlockers below are transcribed VERBATIM from
// tools/validate.mjs (:418 and :453) — same grid-space keying (b.gx/b.gy/b.gz
// fine cells, 0.25 m each), same >=6 m gate, same coverage predicate. An earlier
// version of this instrument keyed off metre-space b.x/b.z and reported sydney
// as 100 % uncovered; the control arms are the only reason that garbage did not
// get acted on. They stay in every run, and the harness invalidates its own
// output loudly if either control is non-zero.
//
// Usage: node tools/pw/tokyo-blocker-coverage.mjs
import { loadScene, VoxelSandboxSim } from '../../js/voxelsim.js';

function footprintTops(sim) {
  const tops = new Map();
  for (const b of sim.blocks) {
    const top = (b.gy + b.fsy) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
        const k = `${cx},${cz}`;
        if (!(tops.get(k) >= top)) tops.set(k, top);
      }
    }
  }
  return tops;
}

function probeCameraBlockers(sim, tops) {
  let tall = 0, uncovered = 0, worstH = 0, worstCell = '';
  const worst = [];
  for (const [k, top] of tops) {
    if (top < 6) continue;
    tall++;
    const [cx, cz] = k.split(',').map(Number);
    const covered = sim.cameraBlockers.some((b) =>
      cx + 1 > b.minX && cx < b.maxX && cz + 1 > b.minZ && cz < b.maxZ && b.h + 0.01 >= top);
    if (!covered) {
      uncovered++;
      worst.push({ k, top });
      if (top > worstH) { worstH = top; worstCell = k; }
    }
  }
  worst.sort((a, b) => b.top - a.top);
  return { tall, uncovered, worstH, worstCell, worst: worst.slice(0, 12) };
}

const SCENES = ['tokyo', 'sydney', 'auckland'];
await Promise.all(SCENES.map(loadScene));

const results = {};
for (const scene of SCENES) {
  const t0 = performance.now();
  const sim = new VoxelSandboxSim({ seed: 'validator', scene });
  const buildMs = performance.now() - t0;
  const r = probeCameraBlockers(sim, footprintTops(sim));
  results[scene] = { ...r, buildMs, blocks: sim.blocks.length, blockers: sim.cameraBlockers.length };
  console.log(
    `${scene.padEnd(9)} blocks=${sim.blocks.length} blockers=${sim.cameraBlockers.length} ` +
    `tall=${r.tall} UNCOVERED=${r.uncovered} worst=${r.worstH} m at ${r.worstCell || '-'} ` +
    `build=${buildMs.toFixed(0)} ms`);
}

for (const c of ['sydney', 'auckland']) {
  if (results[c].uncovered !== 0) {
    console.error(`\n*** INSTRUMENT INVALID: control arm ${c} reports ${results[c].uncovered} uncovered ` +
      `(expected 0). Every number above is garbage — do not act on it. ***`);
    process.exit(2);
  }
}
console.log('\ncontrols clean (sydney 0, auckland 0) — tokyo reading is trustworthy');
if (results.tokyo.uncovered > 0) {
  console.log('tokyo worst uncovered cells:', results.tokyo.worst.map((w) => `${w.k}@${w.top}m`).join(' '));
  console.log(`RED: tokyo has ${results.tokyo.uncovered} uncovered cells`);
  process.exit(1);
}
console.log('GREEN: tokyo 0 uncovered');
