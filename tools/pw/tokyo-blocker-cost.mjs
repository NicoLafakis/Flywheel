// What does generateBlockers cost on an 84k-block scene?
//
// Round-robin, min-of-N. A single sequential BEFORE/AFTER on a shared box
// measures load, not code: in one noisy run tokyo's build moved 4818 -> 6203 ms
// while the UNCHANGED sydney control moved 558 -> 710 ms, i.e. the same +28 %.
// So: interleave the arms, publish the MIN (the least-interfered sample) and the
// median, and keep sydney in as a load canary.
//
// Arm A = the full scene build (which, post-fix, already includes the blocker
// sweep as its last statement). Arm B = one standalone generateBlockers call on
// an already-built sim — that call IS the entire delta this fix adds, since the
// only other change was deleting six push() statements.
import { loadScene, VoxelSandboxSim } from '../../js/voxelsim.js';
import { generateBlockers } from '../../js/voxelkit.js';

const N = 7;
await Promise.all(['tokyo', 'sydney'].map(loadScene));

const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { min: s[0], med: s[(s.length - 1) >> 1], max: s[s.length - 1] };
};
const fmt = (label, xs) => {
  const { min, med, max } = stat(xs);
  console.log(`${label.padEnd(34)} min=${min.toFixed(1)} ms  median=${med.toFixed(1)} ms  max=${max.toFixed(1)} ms`);
};

const tokyoBuild = [], sydneyBuild = [], blockerOnly = [];
const warm = new VoxelSandboxSim({ seed: 'validator', scene: 'tokyo' });
generateBlockers(warm);

for (let i = 0; i < N; i++) {
  let t = performance.now();
  const tk = new VoxelSandboxSim({ seed: 'validator', scene: 'tokyo' });
  tokyoBuild.push(performance.now() - t);

  t = performance.now();
  generateBlockers(tk);
  blockerOnly.push(performance.now() - t);

  t = performance.now();
  new VoxelSandboxSim({ seed: 'validator', scene: 'sydney' });
  sydneyBuild.push(performance.now() - t);
}

fmt('tokyo full build (84,122 blocks)', tokyoBuild);
fmt('  of which generateBlockers', blockerOnly);
fmt('sydney build (load canary)', sydneyBuild);
const share = stat(blockerOnly).min / stat(tokyoBuild).min * 100;
console.log(`\ngenerateBlockers is ${share.toFixed(1)} % of tokyo's build (min vs min)`);
