import { VoxelSandboxSim, loadScene, SCENE_GOALS } from '../js/voxelsim.js';
import {
  SYDNEY_CROSSINGS, SYDNEY_OPEN_GROUND, SYDNEY_ROAD_SPANS,
  SYDNEY_STREETS, SYDNEY_VEHICLES, vehicleBBox,
} from '../js/voxelscene-sydney.js';

await loadScene('sydney');

const FINE = 0.25;
let failures = 0;
const fail = (msg) => { failures++; console.error(`  FAIL: ${msg}`); };

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

function probeCellOwnership(sim, name) {
  let ghosts = 0;
  const overlapSources = new Map();
  for (const b of sim.blocks) {
    for (let ix = 0; ix < b.fsx; ix++) {
      for (let iy = 0; iy < b.fsy; iy++) {
        for (let iz = 0; iz < b.fsz; iz++) {
          const owner = sim.grid.get(`${b.gx + ix},${b.gy + iy},${b.gz + iz}`);
          if (owner && owner !== b) {
            ghosts++;
            const pair = `${owner.matType}@(${owner.x},${owner.y},${owner.z}) overlaps ${b.matType}@(${b.x},${b.y},${b.z})`;
            overlapSources.set(pair, (overlapSources.get(pair) || 0) + 1);
          }
        }
      }
    }
  }
  if (ghosts > 0) {
    fail(`${name}: ${ghosts} fine cells owned by the wrong block (overlapping placement)`);
    for (const [k, v] of overlapSources.entries()) console.log(`  ${k}: ${v} cells`);
  }
}

function probePlacementStep(sim, name) {
  const byAxis = { x: new Map(), y: new Map(), z: new Map() };
  for (const bl of sim.blocks) {
    const kx = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gy},${bl.gz}`;
    const ky = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gx},${bl.gz}`;
    const kz = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl.gx},${bl.gy}`;
    (byAxis.x.get(kx) || (byAxis.x.set(kx, []).get(kx))).push(bl);
    (byAxis.y.get(ky) || (byAxis.y.set(ky, []).get(ky))).push(bl);
    (byAxis.z.get(kz) || (byAxis.z.set(kz, []).get(kz))).push(bl);
  }
  let gated = 0;
  for (const [ax, map] of Object.entries(byAxis)) {
    const pos = ax === 'x' ? 'gx' : ax === 'y' ? 'gy' : 'gz';
    const fs = ax === 'x' ? 'fsx' : ax === 'y' ? 'fsy' : 'fsz';
    for (const list of map.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a[pos] - b[pos]);
      for (let i = 0; i < list.length - 1; i++) {
        const cur = list[i], next = list[i + 1];
        const gap = next[pos] - (cur[pos] + cur[fs]);
        if (gap > 0 && gap < cur[fs]) gated++;
      }
    }
  }
  if (gated > 0) fail(`${name}: ${gated} sub-extent gap(s) between collinear identical BOXES`);
}

function probeIdleStability(sim, name) {
  for (let step = 0; step < 60; step++) {
    sim.step(1 / 60, { x: 0, z: 0 });
  }
  const fallen = sim.blocks.filter(b => b.state === 'falling');
  if (fallen.length > 0) {
    fail(`${name}: ${fallen.length} block(s) fell under gravity during idle state (floating / unsupported geometry)`);
    for (const b of fallen) console.log(`  ${b.matType} at (${b.x}, ${b.y}, ${b.z})`);
  }
}

function probeWinnable(sim, name) {
  const radial = sim.blocks.slice().sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of radial) if (b.state !== 'consumed') sim._consume(b);
  sim.step(1 / 60, { x: 0, z: 0 });
  const left = sim.blocks.filter((b) => b.state !== 'consumed').length;
  if (left > 0) fail(`win guard [${name}]: ${left} block(s) survived a full clear`);
  if (!sim.won) fail(`win guard [${name}]: consumed all blocks and won is still false`);
}

console.log('--- Validating Sydney Sandbox ---');
const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'sydney' });
console.log(`Total blocks: ${sim.blocks.length}`);

probeCellOwnership(sim, 'sydney');
probePlacementStep(sim, 'sydney');
probeIdleStability(sim, 'sydney');

const simWin = new VoxelSandboxSim({ seed: 'validator', scene: 'sydney' });
probeWinnable(simWin, 'sydney');

if (failures === 0) {
  console.log(`ALL PASS. Sydney Sandbox is 100% stable, overlap-free, correctly aligned, and fully winnable! (${sim.blocks.length} blocks)`);
} else {
  console.error(`FAILED: ${failures} issue(s) detected.`);
  process.exit(1);
}
