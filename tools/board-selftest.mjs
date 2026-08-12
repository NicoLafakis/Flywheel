// Fast pure checks for THE RUN. Browser fixtures join this suite once a real
// deployed run has been captured; this baseline keeps codec and replay drift
// from reaching the network layer first.

import { decodeTrace, encodeTrace, inputAt, createInputBuffer, writeInput } from '../js/replay.js';
import { RANKED_TICK_COUNT, VoxelSandboxSim, loadScene } from '../js/voxelsim.js';
import { pathToFileURL } from 'node:url';

let assertions = 0;
function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(message);
}

function scriptedInputs() {
  const inputs = createInputBuffer(RANKED_TICK_COUNT);
  for (let tick = 0; tick < RANKED_TICK_COUNT; tick++) {
    // Deliberately includes stillness, axes and diagonals; it is a fixed test
    // vector rather than pseudo-random input so fixture failure is reproducible.
    const phase = Math.floor(tick / 90) % 8;
    const x = [0, 1, 1, 0, -1, -1, 0, 0][phase];
    const z = [1, 1, 0, -1, -1, 0, 1, 0][phase];
    writeInput(inputs, tick, x, z);
  }
  return inputs;
}

function replay(inputs) {
  const sim = new VoxelSandboxSim({ scene: 'gallery', seed: 'board-selftest', mode: 'run90' });
  const move = { x: 0, z: 0 };
  for (let tick = 0; tick < RANKED_TICK_COUNT; tick++) {
    inputAt(inputs, tick, move);
    sim.step(1 / 60, move);
  }
  return sim;
}

export function runBoardSelftest() {
  const inputs = scriptedInputs();
  const payload = encodeTrace(inputs);
  const decoded = decodeTrace(payload, RANKED_TICK_COUNT);
  assert(decoded.length === inputs.length, 'decoded trace length differs');
  for (let i = 0; i < inputs.length; i++) assert(decoded[i] === inputs[i], `trace differs at byte ${i}`);

  const a = replay(inputs);
  const b = replay(decoded);
  assert(a.runComplete && b.runComplete, 'ranked replay did not finish at 5,400 ticks');
  assert(a.rankedTicks === RANKED_TICK_COUNT && b.rankedTicks === RANKED_TICK_COUNT, 'ranked tick count drifted');
  assert(a.hole.mass === b.hole.mass, 'ranked replay score differs');
  assert(a.hole.rawMass === b.hole.rawMass, 'ranked replay raw mass differs');
  assert(a.hole.bestCombo === b.hole.bestCombo, 'ranked replay combo differs');

  const malformed = payload.slice();
  malformed[0] = 0;
  let rejected = false;
  try { decodeTrace(malformed, RANKED_TICK_COUNT); } catch (e) { rejected = true; }
  assert(rejected, 'zero-length RLE run was accepted');
  return assertions;
}

// Chicago is the first public board, so the direct gate also constructs and
// replays that exact authored city. It stays out of validate.mjs's already
// expensive full-city chain; `board-selftest` is the focused release gate.
export async function runChicagoReplaySelftest() {
  await loadScene('chicago');
  const input = createInputBuffer(RANKED_TICK_COUNT);
  const sim = new VoxelSandboxSim({ scene: 'chicago', seed: 'board-chicago', mode: 'run90' });
  const move = { x: 0, z: 0 };
  for (let tick = 0; tick < RANKED_TICK_COUNT; tick++) sim.step(1 / 60, inputAt(input, tick, move));
  assert(sim.runComplete && sim.rankedTicks === RANKED_TICK_COUNT, 'Chicago RUN did not reach its fixed cutoff');
  return assertions;
}

// Running this file directly is the fast standalone gate. `validate.mjs`
// imports the named function and prints its own single result, so importing it
// must not replay the fixture a second time.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBoardSelftest();
  const count = await runChicagoReplaySelftest();
  console.log(`board selftest: ${count} assertions PASS`);
}
