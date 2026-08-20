// AUCKLAND's validator section, as its own module.
//
// Shape note, because the repo has two different things named
// `tools/validate-<city>.mjs` and only one of them is what this is:
// `tools/validate-sydney.mjs` is a STANDALONE script — it runs on import, owns
// private copies of the probes, and calls process.exit. `tools/validate.mjs`
// does not import it; Sydney's section inside the orchestrator is a separate,
// duplicated inline function. That duplication is the reason Sydney could ship
// 14,309 blocks against a declared 14,120 while a file named after it sat in
// the tree looking like a gate.
//
// So this module takes the other shape: it exports one function and executes
// nothing on import, and `tools/validate.mjs` registers it as the `auckland`
// section. The probes are dependency-INJECTED rather than re-implemented, so
// there is exactly one copy of every probe in the repo and Auckland can never
// be checked by a stale fork of `probeCameraBlockers`. It is deliberately not
// runnable on its own: standalone execution would mean importing the
// orchestrator, whose module body runs the entire validator, or forking the
// probes again — and a second copy of the probes is the defect, not the fix.
import { readFileSync } from 'node:fs';
import { probeLaneModulus } from './probe-lane-modulus.mjs';
import {
  AUCKLAND_CROSSINGS, AUCKLAND_OPEN_GROUND, AUCKLAND_ROAD_SPANS,
  AUCKLAND_STREETS, AUCKLAND_VEHICLES,
} from '../js/voxelscene-auckland.js';

// The exact-count gate. A card that promises 16,000 blocks and a build that
// lands on 15,984 are not "close"; the number on the card is the contract the
// player is shown, and a scene that drifts off its declared number makes every
// card in the catalog suspect. The number and the geometry are one fact with
// two writers, and this is the gate that keeps them equal. Bring the GEOMETRY
// to the number, never the number to the geometry.
//
// `ctx` carries the orchestrator's own helpers: { VoxelSandboxSim, CITY_CATALOG,
// fail, footprintTops, sceneFingerprint, probes }.
export function validateAuckland(ctx) {
  const {
    VoxelSandboxSim, CITY_CATALOG, fail, footprintTops, sceneFingerprint, probes,
  } = ctx;
  const {
    probeCellOwnership, probeCameraBlockers, probeBoundsRect, probeGradeDiagonal,
    probeRoadConflicts, probeWaterOverSurfaces, probeAmbient, probePlacementStep,
    probeIdleStability,
  } = probes;

  console.log('Validating auckland sandbox...');
  const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'auckland' });
  const entry = CITY_CATALOG.find((c) => c.scene === 'auckland');
  if (!entry) {
    fail('auckland: no CITY_CATALOG entry — the scene exists with nothing declaring it');
  } else if (sim.blocks.length !== entry.blocks) {
    fail(`auckland: built ${sim.blocks.length} blocks, catalog declares ${entry.blocks} (delta ${sim.blocks.length - entry.blocks}) — the card's block count is a promise, not an estimate`);
  }
  if (entry && entry.status !== 'PLAYABLE') {
    fail(`auckland: catalog status is '${entry.status}' — a scene with geometry, wiring and a green section is PLAYABLE`);
  }

  const tops = footprintTops(sim);
  probeCellOwnership(sim, 'auckland');
  probeCameraBlockers(sim, 'auckland', tops);
  probeBoundsRect(sim, 'auckland');
  probeGradeDiagonal(sim, 'auckland');
  probeRoadConflicts(sim, 'auckland', AUCKLAND_VEHICLES, AUCKLAND_ROAD_SPANS);
  probeWaterOverSurfaces(sim, 'auckland');
  probeAmbient(sim, 'auckland', ['gulls', 'ferries']);
  probePlacementStep(sim, 'auckland');

  // A blocker set that is merely non-empty proves nothing about coverage, but
  // an EMPTY one is the exact signature of the bare `generateBlockers(sim)`
  // call that shipped Sydney blind: the function returns the rect list, so a
  // call whose value is discarded pays the full cost and leaves the field at
  // its default. probeCameraBlockers above checks coverage; this names the
  // failure that has actually happened in this repo.
  if (sim.cameraBlockers.length === 0) {
    fail('auckland: cameraBlockers is empty — generateBlockers RETURNS the rects, it does not assign them');
  }

  // The exported tables are the scene's own contract with the validator and the
  // route driver: an index into AUCKLAND_STREETS that no longer exists reads as
  // a crossing painted at (undefined, undefined).
  for (const [si, at] of AUCKLAND_CROSSINGS) {
    if (!AUCKLAND_STREETS[si]) fail(`auckland: crossing at ${at} names street index ${si}, which does not exist`);
  }
  if (AUCKLAND_OPEN_GROUND.length !== 0) {
    fail(`auckland: AUCKLAND_OPEN_GROUND has ${AUCKLAND_OPEN_GROUND.length} entries — nothing reads it yet, so a non-empty table is a claim with no consumer`);
  }

  // The rip-rap apron's colour pattern, checked by the SHARED guard.
  //
  // This used to be ~80 lines of probe inline here. It is a shared module now
  // because the idiom it guards travels by copy-paste — it was copied from this
  // scene into Singapore's promenade apron — and a probe that also travels by
  // copy-paste rots exactly the way the code did. The receipt is in this repo:
  // the economy coin ladder was asserted in two places, one copy was retired
  // when the model changed and the other was not, and the stale one kept
  // passing against a model nothing used.
  //
  // Auckland is the WEAKER of the two subjects and that is worth stating. Its
  // close-out places only 21 stones, all in one lane and all at negative x, so
  // neither the lane-offset property nor the balance gate is decidable from its
  // domain — the shared probe says so out loud rather than counting a skip as a
  // pass. What Auckland DID prove is the sign half: the split was 14/7/0 and
  // the middle grey never rendered at all.
  probeLaneModulus({
    scene: 'auckland',
    fileUrl: new URL('../js/voxelscene-auckland.js', import.meta.url),
    marker: '8. RIP-RAP (BUDGET CLOSE-OUT)',
    greys: [0x6b655c, 0x5a554e, 0x7a746a],
    sim,
    fail,
    readFile: readFileSync,
  });

  // Determinism (invariant 4), proved rather than asserted: a second build in
  // the same process must be bit-identical. The seeded-rng rule makes this
  // true; a stray Math.random or a Set/Map iteration leak makes it false.
  const fp = sceneFingerprint(sim);
  const again = new VoxelSandboxSim({ seed: 'validator', scene: 'auckland' });
  if (again.blocks.length !== sim.blocks.length || sceneFingerprint(again) !== fp) {
    fail(`auckland: two builds differ (${sim.blocks.length}/${fp.toString(16)} vs ${again.blocks.length}/${sceneFingerprint(again).toString(16)}) — the scene is not deterministic`);
  }

  // Last, because it steps the sim 3 s and leaves the caller a 3 s-old world.
  probeIdleStability(sim, 'auckland');
  console.log(`  auckland sandbox: blocks=${sim.blocks.length} mass=${sim.totalMass.toFixed(0)} blockers=${sim.cameraBlockers.length} fingerprint=${fp.toString(16)}`);
}
