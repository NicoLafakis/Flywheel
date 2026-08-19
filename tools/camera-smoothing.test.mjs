// tools/camera-smoothing.test.mjs — ADR-0022: Bézier (cubic Hermite) occlusion
// pitch easing + critically damped roof-climb, SCOPED TO THE LAB (`gallery`)
// behind `ChaseCamera.smoothOcclusion`. Run: node tools/camera-smoothing.test.mjs
//
// HOW THIS EXECUTES THE SHIPPED CODE
// js/camera.js imports the bare specifier `three`, resolved by the page's import
// map, so Node cannot import it as-is. Rather than extract fragments with
// `new Function` (tools/cinematic-arming-guard.test.mjs), this suite rewrites
// ONLY that one specifier to the vendored file URL, writes the result to the OS
// temp dir and imports the whole module. Every assertion below therefore drives
// the real ChaseCamera.update() — sweep, standoff filter, containment re-solve,
// roof lift — not a re-implementation of it.
//
// WHAT IT PROVES
//   M1  occlusionPitchEase is the smoothstep S(u) = u^2(3-2u): S(0)=0, S(1)=1,
//       S'(0)=S'(1)=0 (zero initial/terminal jerk), monotone, C^1 (the finite
//       difference derivative is continuous).
//   P1  flag OFF is the legacy path BIT-IDENTICAL: effPitch == pitch + (1-effT)*0.5
//       on every frame, and a roof step snaps _lift to `need` in ONE frame.
//   P2  flag ON: the S-curve boost is applied, and its first-frame pitch
//       response to a full occlusion step is strictly smaller than the linear
//       one (that is the zero-initial-jerk property, measured on the real rig).
//   P3  flag ON: a 50 m roof step never moves _lift by more than the
//       BLOCKER_LIFT_IN fraction of the remaining gap in a frame, is strictly
//       smaller than the legacy one-frame snap, and settles to 95 % within 0.2 s
//       — and the `cy >= _lift` backstop still holds on every frame.
//   P4  a realistic drive (sinusoid past a 50 m tower, 60 fps) on the flagged
//       rig engages occlusion (min effT < 0.9 — the probe is not vacuous) and
//       keeps every per-frame |Δpitch| under PITCH_STEP_MAX and every per-frame
//       |Δcy| under LIFT_STEP_MAX, the design package's feel budgets.
//   P5  the flag defaults OFF, and only a gallery-scoped caller turns it on
//       (checked against js/main.js source: the campaign constructor site never
//       sets it, the sandbox/multiplayer sites gate on scene === 'gallery').
//   L1  The Lab ships cameraBlockers (it used to ship none, so nothing in it
//       ever occluded), every footprint cell >= 6 m tall is covered by one at
//       its height, and the ADR's three test towers stand at their authored
//       footprints (SE strip — the spec's NE zone is outside the Lab's z bounds)
//       with the 7 m / 6 m canyons between them clear of any blocker.
//   L2  the testbed's block-count cost is bounded (<= +25 % over the 13 739 the
//       Lab shipped with before it).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VoxelSandboxSim } from '../js/voxelsim.js';

const here = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const cameraSrc = readFileSync(here('js/camera.js'), 'utf8');
const mainSrc = readFileSync(here('js/main.js'), 'utf8');

// Shipped module, one specifier rewritten. Written under a content-derived
// name so two concurrent validator children never race on the same file.
const threeUrl = pathToFileURL(here('js/vendor/three.module.js')).href;
const rewritten = cameraSrc.replace(/from\s+'three'/, `from '${threeUrl}'`);
assert.notEqual(rewritten, cameraSrc, 'camera.js must import three by bare specifier');
const outDir = join(tmpdir(), 'flywheel-camera-smoothing');
mkdirSync(outDir, { recursive: true });
let hash = 0;
for (let i = 0; i < rewritten.length; i++) hash = (hash * 31 + rewritten.charCodeAt(i)) | 0;
const modPath = join(outDir, `camera.${(hash >>> 0).toString(16)}.mjs`);
writeFileSync(modPath, rewritten);
const cam = await import(pathToFileURL(modPath).href);
const { ChaseCamera, occlusionPitchEase } = cam;

// Feel budgets from .wiki/features/camera-bezier-smoothing/03-tasks.md (Task 1.1).
const PITCH_STEP_MAX = 0.05;   // rad per 60 fps frame
const LIFT_STEP_MAX = 2.5;     // m per 60 fps frame
const DT = 1 / 60;

function rig({ smooth, blockers }) {
  const c = new ChaseCamera(16 / 9);
  c.setFollowDirection(true);
  if (smooth) c.setSmoothOcclusion(true);
  c.setBlockers(blockers);
  return c;
}

// Step the rig with the hole stationary at (hx, hz) so the ONLY input that
// changes is the one under test. driveHeading null = the rig's default chase.
function settle(c, hx, hz, frames) {
  for (let i = 0; i < frames; i++) c.update(DT, hx, hz, 1, 0, 0, false, null);
}

export function runCameraSmoothingSelftest() {
  let n = 0;
  const t = (name, fn) => { fn(); n++; };

  // --- M1: the easing function ---------------------------------------------
  t('occlusionPitchEase is exported and is smoothstep', () => {
    assert.equal(typeof occlusionPitchEase, 'function');
    assert.equal(occlusionPitchEase(0), 0);
    assert.equal(occlusionPitchEase(1), 1);
    assert.ok(Math.abs(occlusionPitchEase(0.5) - 0.5) < 1e-12);
    // clamps outside [0,1]
    assert.equal(occlusionPitchEase(-0.3), 0);
    assert.equal(occlusionPitchEase(1.7), 1);
  });
  t('occlusionPitchEase has zero jerk at both ends and is C1 + monotone', () => {
    const h = 1e-4;
    const d = (u) => (occlusionPitchEase(u + h) - occlusionPitchEase(u - h)) / (2 * h);
    assert.ok(Math.abs(d(0 + h)) < 1e-3, `S'(0) ~ 0, got ${d(h)}`);
    assert.ok(Math.abs(d(1 - h)) < 1e-3, `S'(1) ~ 0, got ${d(1 - h)}`);
    assert.ok(Math.abs(d(0.5) - 1.5) < 1e-6, `S'(0.5) = 1.5, got ${d(0.5)}`);
    let prev = occlusionPitchEase(0), prevD = d(h);
    for (let i = 1; i <= 1000; i++) {
      const u = i / 1000;
      const s = occlusionPitchEase(u);
      assert.ok(s >= prev - 1e-12, `monotone at u=${u}`);
      if (i < 1000) {
        const du = d(u);
        assert.ok(Math.abs(du - prevD) < 0.01, `C1: derivative jump ${Math.abs(du - prevD)} at u=${u}`);
        prevD = du;
      }
      prev = s;
    }
  });

  // --- P1: flag off is the legacy formula, frame for frame ------------------
  // A 50 m wall directly behind the hole along the default chase direction
  // (yaw 0 -> camera sits at +z of the hole, ~4.8 m back at holeRadius 1).
  // Hole 2 m in front of the face, so the ray clips it at a mid standoff.
  const WALL = [{ minX: -20, maxX: 20, minZ: 2, maxZ: 12, h: 50 }];
  t('flag defaults off and legacy effPitch == pitch + (1 - effT) * 0.5 every frame', () => {
    const c = rig({ smooth: false, blockers: [] });
    assert.equal(c.smoothOcclusion, false, 'default off');
    settle(c, 0, 0, 30);
    c.setBlockers(WALL);       // step the occlusion in
    for (let i = 0; i < 90; i++) {
      c.update(DT, 0, 0, 1, 0, 0, false, null);
      const expect = c.pitch + (1 - c._effT) * 0.5;   // diveBump is 0 outside the intro
      assert.equal(c.lastEffPitch, expect, `frame ${i}: legacy linear pitch, got ${c.lastEffPitch} want ${expect}`);
    }
    // Legacy sweep is NOT dist-normalised (raySpan2D gets the unit-per-metre
    // direction, t is a fraction of dist), so a face 2 m back does not pull in:
    // the camera lands inside the footprint and the roof lift pops it instead.
    // Pinned here as the documented legacy behaviour the flag leaves alone.
    assert.equal(c._effT, 0.92, `legacy: no pull-in for a face 2 m back (effT=${c._effT})`);
    assert.equal(c._lift, 52.5, 'legacy: the roof lift is what handles it');
  });
  t('flag on: the sweep is dist-normalised, so the same wall pulls the standoff in instead of lifting', () => {
    const c = rig({ smooth: true, blockers: [] });
    settle(c, 0, 0, 30);
    c.setBlockers(WALL);
    settle(c, 0, 0, 90);
    assert.ok(c._effT < 0.6, `occlusion pull-in engaged (effT=${c._effT.toFixed(3)})`);
    assert.equal(c._lift, 0, `no roof lift needed once the camera is in front of the face (lift=${c._lift})`);
    assert.ok(c.camera.position.z < 2, `camera in front of the wall face (cz=${c.camera.position.z.toFixed(2)})`);
  });
  // Roof step: the sweep finds no safe t when the box reaches past the camera
  // (hole INSIDE a 60 m deep box -> floorT clamps at 1) so the lift engages.
  const BIGBOX = [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60, h: 50 }];
  t('flag off: roof step snaps _lift to need in ONE frame (legacy)', () => {
    const c = rig({ smooth: false, blockers: [] });
    settle(c, 0, 0, 30);
    const cyBefore = c.camera.position.y;
    c.setBlockers(BIGBOX);
    c.update(DT, 0, 0, 1, 0, 0, false, null);
    assert.equal(c._lift, 52.5, `legacy snaps to roof + ROOF_CLEAR, got ${c._lift}`);
    assert.ok(c.camera.position.y - cyBefore > 40, 'legacy one-frame pop > 40 m');
  });

  // --- P2: flag on applies the S-curve with smaller initial jerk ------------
  // The legacy rig does not pull in at all here (see P1), so the comparison is
  // against the LINEAR formula evaluated on the flagged rig's own filtered
  // standoff sequence: same input, two boost curves.
  t('flag on: first-frame pitch response to an occlusion step is below the linear formula on the same standoff', () => {
    const sm = rig({ smooth: true, blockers: [] });
    assert.equal(sm.smoothOcclusion, true);
    settle(sm, 0, 0, 30);
    const pSm0 = sm.lastEffPitch, t0 = sm._pitchT;
    sm.setBlockers(WALL);
    sm.update(DT, 0, 0, 1, 0, 0, false, null);
    const t1 = sm._pitchT;
    assert.ok(t1 < t0, `the pitch standoff moved in (${t0.toFixed(3)} -> ${t1.toFixed(3)})`);
    const dSm = sm.lastEffPitch - pSm0;
    const dLin = (1 - t1) * 0.5 - (1 - t0) * 0.5;   // legacy formula on the same standoff step
    assert.ok(dSm > 0 && dLin > 0, `both tilt up (lin ${dLin}, smooth ${dSm})`);
    assert.ok(dSm < dLin * 0.6, `zero-initial-jerk: smooth first step ${dSm.toFixed(4)} < 0.6 x linear ${dLin.toFixed(4)}`);
    // and it is the S-curve, not some other scale: effPitch == pitch + S(u)*BOOST
    const u = Math.min(1, Math.max(0, (0.92 - t1) / (0.92 - 0.15)));   // u from the BLOCKER_EASE rest
    const expect = sm.pitch + occlusionPitchEase(u) * 0.5;
    assert.ok(Math.abs(sm.lastEffPitch - expect) < 1e-12, `S-curve pitch, got ${sm.lastEffPitch} want ${expect}`);
    // the eased pitch then climbs monotonically with bounded steps to its plateau
    let prev = sm.lastEffPitch, maxStep = dSm;
    for (let i = 0; i < 90; i++) {
      sm.update(DT, 0, 0, 1, 0, 0, false, null);
      assert.ok(sm.lastEffPitch >= prev - 1e-12, `frame ${i}: pitch monotone on the way in`);
      maxStep = Math.max(maxStep, sm.lastEffPitch - prev);
      prev = sm.lastEffPitch;
    }
    console.log(`  occlusion step: first-frame dpitch S-curve ${dSm.toFixed(4)} vs linear ${dLin.toFixed(4)} rad; max step ${maxStep.toFixed(4)} rad/frame`);
    assert.ok(maxStep < PITCH_STEP_MAX, `max per-frame pitch delta ${maxStep} < ${PITCH_STEP_MAX}`);
  });

  // --- P3: flag on damps the roof climb ------------------------------------
  t('flag on: roof step climbs at BLOCKER_LIFT_IN, never pops, settles within 0.2 s, backstop holds', () => {
    const c = rig({ smooth: true, blockers: [] });
    settle(c, 0, 0, 30);
    c.setBlockers(BIGBOX);
    let prevLift = c._lift, maxStep = 0, frames = 0;
    for (let i = 0; i < 60; i++) {
      c.update(DT, 0, 0, 1, 0, 0, false, null);
      const gap = 52.5 - prevLift;
      const step = c._lift - prevLift;
      maxStep = Math.max(maxStep, step);
      assert.ok(step <= gap * 18 * DT + 1e-9, `frame ${i}: step ${step} exceeds 18/s fraction of gap ${gap}`);
      assert.ok(c.camera.position.y >= c._lift - 1e-9, `frame ${i}: cy >= _lift backstop`);
      prevLift = c._lift;
      if (c._lift >= 52.5 * 0.95 && !frames) frames = i + 1;
    }
    assert.ok(maxStep < 52.5, `no one-frame pop (max step ${maxStep.toFixed(2)} m)`);
    assert.ok(frames > 0 && frames <= 12, `settles to 95 % within 0.2 s (took ${frames} frames)`);
    console.log(`  roof climb: max per-frame lift step ${maxStep.toFixed(2)} m, 95 % at frame ${frames}`);
  });

  // --- P4: realistic drive past a tower on the flagged rig ------------------
  t('flag on: sinusoid drive past a 50 m tower stays inside the per-frame feel budgets', () => {
    const TOWER = [{ minX: -20, maxX: -12, minZ: -13, maxZ: -8.5, h: 50 }];   // 0.5 m off the path's belly
    const c = rig({ smooth: true, blockers: TOWER });
    let x = -60, prevPitch = null, prevY = null, maxDp = 0, maxDy = 0, minT = 1;
    for (let i = 0; i < 60 * 14; i++) {
      x += 10 * DT;
      const z = 8 * Math.sin(x / 10);
      c.update(DT, x, z, 1, 0, 0, false, null);   // null heading: the rig chases the hole velocity
      const p = c.lastEffPitch, y = c.camera.position.y;
      if (prevPitch !== null && i > 60) {   // skip the spawn settle
        maxDp = Math.max(maxDp, Math.abs(p - prevPitch));
        maxDy = Math.max(maxDy, Math.abs(y - prevY));
      }
      prevPitch = p; prevY = y;
      minT = Math.min(minT, c._effT);
    }
    assert.ok(minT < 0.9, `occlusion engaged during the drive (min effT ${minT.toFixed(3)})`);
    console.log(`  drive: min effT ${minT.toFixed(3)}, max |dpitch| ${maxDp.toFixed(4)} rad/frame, max |dcy| ${maxDy.toFixed(3)} m/frame`);
    assert.ok(maxDp < PITCH_STEP_MAX, `max per-frame pitch delta ${maxDp} < ${PITCH_STEP_MAX}`);
    assert.ok(maxDy < LIFT_STEP_MAX, `max per-frame cy delta ${maxDy} < ${LIFT_STEP_MAX}`);
  });

  // --- P5: the flag is wired gallery-only ------------------------------------
  t('main.js enables smoothOcclusion only for the gallery (The Lab)', () => {
    const sites = mainSrc.match(/cam\.setSmoothOcclusion\([^)]*\)/g) || [];
    assert.ok(sites.length >= 2, `sandbox + multiplayer sites call setSmoothOcclusion (found ${sites.length})`);
    for (const s of sites) assert.match(s, /=== 'gallery'/, `site gates on scene === 'gallery': ${s}`);
    assert.doesNotMatch(mainSrc, /setSmoothOcclusion\(true\)/, 'never unconditionally on');
  });

  // --- L1/L2: The Lab testbed -------------------------------------------------
  // Authored footprints (see .wiki/features/camera-bezier-smoothing/02-technical-design.md):
  //   Gamma x 26..40, z 27..41, h 25   | 6 m canyon | Alpha x 46..62, z 26..42, h 35
  //   | 7 m canyon | Beta x 69..89, z 25..45, h 48 (crown spire)
  const TOWERS = [
    // h: peak height (parapet/crown/spire); base: the roof height EVERY footprint
    // cell reaches (Gamma/Alpha roofs sit 1 m under their rings; Beta steps back above 16 m)
    { name: 'Tower Gamma', minX: 26, maxX: 40, minZ: 27, maxZ: 41, h: 25, base: 24 },
    { name: 'Tower Alpha', minX: 46, maxX: 62, minZ: 26, maxZ: 42, h: 35, base: 34 },
    { name: 'Tower Beta', minX: 69, maxX: 89, minZ: 25, maxZ: 45, h: 48, base: 16 },
  ];
  const CANYONS = [
    { name: 'Gamma|Alpha 6 m', minX: 40, maxX: 46, minZ: 27, maxZ: 41 },
    { name: 'Alpha|Beta 7 m', minX: 62, maxX: 69, minZ: 26, maxZ: 42 },
  ];
  const LAB_BLOCKS_BEFORE = 13739;
  t('The Lab ships cameraBlockers that cover every >= 6 m footprint cell, and the three ADR towers', () => {
    const sim = new VoxelSandboxSim({ seed: 'validator' });
    assert.equal(sim.scene, 'gallery');
    const bl = sim.cameraBlockers;
    assert.ok(bl.length > 0, 'gallery has cameraBlockers');
    // per-cell tops, exactly as tools/validate.mjs probeCameraBlockers derives them
    const tops = new Map();
    for (const b of sim.blocks) {
      const top = (b.gy + b.fsy) * 0.25;
      for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++)
        for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
          const k = cx + ',' + cz; if (!(tops.get(k) >= top)) tops.set(k, top);
        }
    }
    let uncovered = 0, tall = 0;
    for (const [k, top] of tops) {
      if (top < 6) continue;
      tall++;
      const [cx, cz] = k.split(',').map(Number);
      if (!bl.some((b) => cx + 1 > b.minX && cx < b.maxX && cz + 1 > b.minZ && cz < b.maxZ && b.h + 0.01 >= top)) uncovered++;
    }
    assert.ok(tall > 0 && uncovered === 0, `${uncovered} of ${tall} tall cells uncovered by a blocker`);
    for (const tw of TOWERS) {
      // every 1 m cell of the footprint has geometry reaching the spec height, and a blocker at it
      let short = 0, nocover = 0, peak = 0;
      for (let cx = tw.minX; cx < tw.maxX; cx++) for (let cz = tw.minZ; cz < tw.maxZ; cz++) {
        const top = tops.get(cx + ',' + cz) || 0;
        peak = Math.max(peak, top);
        if (top < tw.base - 0.01) short++;
        if (!bl.some((b) => cx + 1 > b.minX && cx < b.maxX && cz + 1 > b.minZ && cz < b.maxZ && b.h + 0.01 >= top)) nocover++;
      }
      assert.equal(short, 0, `${tw.name}: ${short} footprint cells below the ${tw.base} m base tier`);
      assert.ok(peak >= tw.h - 0.01, `${tw.name}: peak ${peak} m >= ${tw.h} m`);
      assert.equal(nocover, 0, `${tw.name}: ${nocover} footprint cells without a blocker at their height`);
    }
    for (const c of CANYONS) {
      for (let cx = c.minX; cx < c.maxX; cx++) for (let cz = c.minZ; cz < c.maxZ; cz++) {
        assert.ok((tops.get(cx + ',' + cz) || 0) < 1, `${c.name} canyon cell ${cx},${cz} is built on`);
        assert.ok(!bl.some((b) => cx + 1 > b.minX && cx < b.maxX && cz + 1 > b.minZ && cz < b.maxZ), `${c.name} canyon cell ${cx},${cz} is inside a blocker`);
      }
    }
    console.log(`  lab testbed: ${sim.blocks.length} blocks (+${(100 * (sim.blocks.length / LAB_BLOCKS_BEFORE - 1)).toFixed(1)} %), ${bl.length} blockers, ${tall} tall cells all covered`);
    assert.ok(sim.blocks.length <= LAB_BLOCKS_BEFORE * 1.25, `block budget: ${sim.blocks.length} <= ${LAB_BLOCKS_BEFORE * 1.25}`);
  });

  return n;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const n = runCameraSmoothingSelftest();
  console.log(`camera-smoothing: ${n} assertions passed`);
}
