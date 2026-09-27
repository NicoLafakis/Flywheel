import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelSandboxSim } from '../js/voxelsim.js';
import { BoxGrid } from '../js/boxgrid.js';
import { CITY_CATALOG } from '../js/citycatalog.js';
import { rasterise, snappedPolygon, storeyPlan, pointInPoly } from '../js/footprint-shell.js';
import { leftOf, JP } from '../js/streetkit.js';
import SHIBUYA from '../js/citydata/shibuya.js';
import { driveRoute } from './route-driver.mjs';
import { spawnPositionForSlot } from '../js/multiplayer/roster.js';
import { MAX_PLAYERS } from '../js/multiplayer/config.js';

// THE LAB = Tokyo remake, phase 1: Shibuya Crossing, built from OpenStreetMap
// data by the two reusable kits (js/footprint-shell.js, js/streetkit.js). This
// is the template every other city's remake follows, so the gate checks the
// METHOD as much as the map: placement must come from the data or from the
// Japan profile's conventions, never from eyeballed coordinates.
//
// Coordinates are read from the data module, not restated here: moving a
// building in the data moves the expectation with it.

const D = SHIBUYA;
const byId = new Map(D.buildings.map((b) => [b.id, b]));
const LANDMARKS = [
  [136691386, 'QFRONT'], [116806281, 'MAGNET'], [60739635, 'Shibuya Ekimae Building'],
  [55895868, 'SHIBUYA109'], [55896465, 'Seibu A'],
];

// Plan rect of a piece.
const rectOf = (p) => ({ x0: p.x - p.sx / 2, x1: p.x + p.sx / 2, z0: p.z - p.sz / 2, z1: p.z + p.sz / 2, y0: p.y - p.sy / 2, y1: p.y + p.sy / 2 });

export function validateLabTokyo() {
  const t0 = performance.now();
  const sim = new VoxelSandboxSim({ seed: 'lab-tokyo' });
  const buildMs = performance.now() - t0;
  assert.equal(sim.scene, 'gallery');
  const lab = sim.lab;
  assert.ok(lab, 'the Lab publishes its build record on sim.lab');

  // --- provenance -------------------------------------------------------------
  assert.equal(D.meta.license, 'ODbL 1.0', 'district data is OSM, licensed ODbL');
  assert.match(D.meta.attribution, /OpenStreetMap contributors/, 'OSM attribution travels with the data');
  assert.match(readFileSync(new URL('../js/citydata/shibuya.js', import.meta.url), 'utf8'), /OpenStreetMap contributors/, 'attribution in the data file header');
  assert.deepEqual(sim.boundsRect, { minX: D.meta.bounds.minX, maxX: D.meta.bounds.maxX, minZ: D.meta.bounds.minZ, maxZ: D.meta.bounds.maxZ }, 'playable area is the data district');

  // --- performance architecture -------------------------------------------------
  assert.ok(sim.grid instanceof BoxGrid, 'the Lab runs on the box-based grid, not the 0.25 m cell grid (PERF-2026-09-25 load times)');
  assert.equal(sim.geometryVersion, 1, 'grid choice is independent of the Tokyo v2 physics tune');
  assert.ok(!sim.blocks.some((b) => sim.grid.overlaps.has(b)), 'no two pieces overlap (the box grid records every intersection on insert)');

  // --- every mapped building is built, at its mapped height -------------------
  const recs = new Map(lab.buildings.filter((r) => typeof r.id === 'number' && r.id > 0).map((r) => [r.id, r]));
  let built = 0;
  for (const b of D.buildings) {
    const r = recs.get(b.id);
    assert.ok(r, `building ${b.id} ${b.name ?? ''} from the data is built`);
    if (r.pieces > 0) built++;
    if (!r.pieces) continue;
    assert.equal(r.top, storeyPlan(b, { levels: 2 }).top, `${b.name ?? b.id}: storeys follow the mapped tags`);
    if (b.height) assert.ok(Math.abs(r.top - b.height) <= 1.5, `${b.name ?? b.id}: roof ${r.top} m within 1.5 m of the mapped ${b.height} m`);
    if (b.levels && !r.fromHeight) assert.equal(r.levels, b.levels - (b.minLevel ?? 0), `${b.name ?? b.id}: ${b.levels} storeys`);
  }
  assert.ok(built >= D.buildings.length - 3, `nearly every mapped footprint produced a shell (${built}/${D.buildings.length})`);

  // --- landmark footprints match the data ------------------------------------
  // Occupied 0.5 m cells of the pieces a landmark emitted vs its OSM polygon.
  for (const [id, label] of LANDMARKS) {
    const b = byId.get(id), r = recs.get(id);
    assert.ok(b && r, `${label} is in the data and built`);
    const want = new Set(rasterise(snappedPolygon(b.poly).poly).map(([i, j]) => i + ',' + j));
    const got = new Set();
    for (let k = r.first; k <= r.last; k++) {
      const p = sim.blocks[k - 1];
      const q = rectOf(p);
      for (let i = Math.round(q.x0 / 0.5); i < Math.round(q.x1 / 0.5); i++) for (let j = Math.round(q.z0 / 0.5); j < Math.round(q.z1 / 0.5); j++) got.add(i + ',' + j);
    }
    // Truth is the raw polygon: count true-footprint cells covered and cells
    // built outside the true footprint.
    let inter = 0, outside = 0;
    for (const c of got) {
      const [i, j] = c.split(',').map(Number);
      if (pointInPoly((i + 0.5) * 0.5, (j + 0.5) * 0.5, b.poly)) inter++; else outside++;
    }
    const area = Math.abs(b.area);
    const cover = inter * 0.25 / area, spill = outside * 0.25 / area;
    assert.ok(cover >= 0.9, `${label}: built footprint covers ${(cover * 100).toFixed(1)}% of the mapped footprint (>= 90%)`);
    assert.ok(spill <= 0.08, `${label}: ${(spill * 100).toFixed(1)}% of the built footprint lies outside the mapped one (<= 8%)`);
    assert.ok(want.size > 0);
    // Hollow: at mid-height, walls and columns only.
    const mid = r.baseY + (Math.floor(r.levels / 2) + 0.5) * r.storeyH; // mid-storey, between plates
    let vol = 0;
    for (let k = r.first; k <= r.last; k++) {
      const q = rectOf(sim.blocks[k - 1]);
      if (q.y0 <= mid && q.y1 > mid) vol += (q.x1 - q.x0) * (q.z1 - q.z0);
    }
    assert.ok(vol < area * 0.45, `${label}: interior is hollow (${(vol / area * 100).toFixed(0)}% of plan solid at mid-height)`);
  }

  // --- the scramble and every other crossing ------------------------------------
  const cws = lab.crosswalks;
  const carriage = lab.carriage;
  const stripes = sim.sceneDecor.crosswalks;
  for (const p of D.points) {
    if (p.kind !== 'crossing' || !(p.control === 'signals' || p.control === 'marked') || p.markings === 'no') continue;
    const cw = cws.find((c) => c.node === p.id) || cws.find((c) => Math.hypot((c.a[0] + c.b[0]) / 2 - p.x, (c.a[1] + c.b[1]) / 2 - p.z) < 4);
    if (!cw) continue; // a mapped crossing off every carriageway (on a plaza) paints nothing
    assert.ok(cw.stripes > 0, `marked crossing ${p.id} at (${p.x}, ${p.z}) has zebra bars`);
  }
  let signalled = 0;
  for (const cw of cws) {
    if (cw.stripes > 0) {
      const mine = stripes.filter((s) => s.cw === cw.id);
      assert.equal(mine.length, cw.stripes, `${cw.id}: decor carries its bars`);
      // JP: 45 cm bars at a 90 cm pitch.
      const L = Math.hypot(cw.b[0] - cw.a[0], cw.b[1] - cw.a[1]);
      assert.ok(Math.abs(mine.length - Math.round((L - 0.3) / 0.9)) <= 1, `${cw.id}: bar pitch 0.9 m`);
    }
    if (cw.control !== 'signals' || !cw.road) continue;
    signalled++;
    // A signal pole stands at each corner the crossing lands on.
    for (const end of [cw.a, cw.b]) {
      // An end landing on a traffic island narrower than a pole's footing is
      // not a corner; every end with pavement beside it is.
      let pavement = false;
      for (let dx = -2; dx <= 2 && !pavement; dx += 0.5) for (let dz = -2; dz <= 2; dz += 0.5) if (!carriage.some((p) => pointInPoly(end[0] + dx, end[1] + dz, p))) { pavement = true; break; }
      if (!pavement) continue;
      const near = lab.props.filter((p) => p.kind === 'signal_pole' && Math.hypot(p.x - end[0], p.z - end[1]) <= cw.w / 2 + 4.5);
      assert.ok(near.length >= 1, `signalled crossing ${cw.id}: signal pole at its end (${end.map((v) => v.toFixed(1))})`);
    }
  }
  assert.ok(signalled >= 10, `signalled crossings across the district (${signalled})`);
  const scramble = cws.filter((c) => c.scramble && c.stripes > 0);
  assert.ok(scramble.length >= 5, `the scramble paints its legs and diagonal (${scramble.length})`);
  const diag = scramble.filter((c) => { const u = [c.b[0] - c.a[0], c.b[1] - c.a[1]], l = Math.hypot(...u); return Math.abs(u[0] / l) > 0.4 && Math.abs(u[1] / l) > 0.4; });
  assert.equal(diag.length >= 1, true, 'the one diagonal crossing, Hachiko corner to QFRONT corner');
  // Stop lines: set back >= 2 m from the bars, on the approach side.
  const stops = sim.sceneDecor.laneMarkers.filter((m) => m.isStopLine);
  assert.ok(stops.length >= 8, `stop lines on signalled approaches (${stops.length})`);
  for (const s of lab.stopLines) {
    const cw = cws.find((c) => c.id === s.cw);
    const mid = [(cw.a[0] + cw.b[0]) / 2, (cw.a[1] + cw.b[1]) / 2];
    const back = -((s.c[0] - mid[0]) * s.dir[0] + (s.c[1] - mid[1]) * s.dir[1]);
    assert.ok(back >= cw.w / 2 + 2 - 0.05, `stop line for ${cw.id} sits >= 2 m before the crossing (${back.toFixed(2)} m from its centre)`);
    // Left-hand traffic: the line spans the lanes on the LEFT of its travel direction.
    const road = D.roads.find((r) => r.id === s.road);
    if (!road.oneway) {
      const l = leftOf(s.dir);
      assert.ok((s.c[0] - mid[0]) * l[0] + (s.c[1] - mid[1]) * l[1] > 0, `stop line for ${cw.id} is on the left-hand (approach) side`);
    }
  }

  // --- furniture never in the roadway, never inside buildings -----------------
  const convexHit = (poly, q) => {
    // any rect sample point inside the polygon
    for (let x = q.x0 + 0.125; x < q.x1; x += 0.25) for (let z = q.z0 + 0.125; z < q.z1; z += 0.25) if (pointInPoly(x, z, poly)) return true;
    return false;
  };
  const kinds = {};
  for (const pr of lab.props) {
    kinds[pr.kind] = (kinds[pr.kind] || 0) + 1;
    if (pr.vehicle) continue;
    for (let k = pr.first; k <= pr.last; k++) {
      const q = rectOf(sim.blocks[k - 1]);
      if (q.y0 >= 3) continue; // overhead signal arms and lamp heads may reach over lanes
      const hit = carriage.find((poly) => {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        return !(x1 <= q.x0 || x0 >= q.x1 || z1 <= q.z0 || z0 >= q.z1) && convexHit(poly, q);
      });
      assert.ok(!hit, `${pr.kind} (${pr.src}) at (${pr.x.toFixed(1)}, ${pr.z.toFixed(1)}) stands in the roadway`);
    }
  }
  // Japan conventions are present, and placed by rule where OSM is silent.
  for (const k of ['signal_pole', 'guard_rail', 'street_lamp', 'utility_pole', 'vending', 'tree', 'bus_stop', 'post_box', 'hydrant_sign']) {
    assert.ok(kinds[k] > 0, `street furniture present: ${k}`);
  }
  assert.ok(kinds.signal_pole >= 20, `signal poles at the corners (${kinds.signal_pole})`);
  // Vending banks carry their recycling box; utility poles are side-street only.
  const roadById = new Map(D.roads.map((r) => [r.id, r]));
  for (const pr of lab.props) {
    if (pr.kind === 'vending' && pr.src === 'rule') assert.ok(pr.boxes.some((b) => b[3] === 0.5 && b[4] === 0.75), 'vending bank has its recycling box');
  }
  const planPoles = lab.props.filter((p) => p.kind === 'utility_pole');
  for (const u of planPoles) {
    const near = D.roads.filter((r) => r.pts.some(([x, z]) => Math.hypot(x - u.x, z - u.z) < 40));
    assert.ok(near.some((r) => JP.minor.includes(r.cls)), `utility pole at (${u.x.toFixed(1)}, ${u.z.toFixed(1)}) stands on a side street`);
  }
  assert.ok(sim.sceneWires?.length > 0, 'overhead wires strung between utility poles');
  for (const w of sim.sceneWires) assert.ok(Math.hypot(w.pa[0] - w.pb[0], w.pa[1] - w.pb[1]) <= 40, 'wires span pole to pole');

  // --- life seam (moving pedestrians/traffic phase reads these) ----------------
  const L = lab.life;
  assert.equal(L.drive, 'left', 'Japan drives on the left');
  assert.ok(L.walkPaths.length > 20 && L.crosswalks.length >= cws.length && L.lanes.length > 20 && L.signals.length >= 3 && L.perches.length > 10, 'walk paths, crosswalks, lanes, signals and perches recorded');
  assert.ok(L.signals.some((s) => s.scramble && s.phases.some((p) => p.walk === 'all')), 'the scramble has its all-way walk phase');
  assert.ok(L.flocks.length >= 1, 'pigeon flock spot at Hachiko');
  assert.equal(sim.sceneLife, L, 'the seam is published scene-level as sceneLife');
  assert.ok(L.busStops.length > 5 && L.taxiRanks.length >= 1, 'bus stops and taxi ranks for the traffic phase');
  for (const s of L.signals) assert.equal(s.cycle, s.phases.reduce((t, p) => t + p.s, 0), 'signal cycle is the sum of its phases');
  // Two-way lanes: forward lanes on the left of the way's direction.
  for (const lane of L.lanes) {
    const road = roadById.get(lane.road);
    if (road.oneway) continue;
    assert.ok(lane.dir > 0 ? lane.offset > 0 : lane.offset < 0, `lane on ${road.name ?? road.id} keeps left`);
  }

  // --- landmarks by name --------------------------------------------------------
  const hach = D.points.find((p) => p.kind === 'artwork' && /Hachiko/.test(p.name || ''));
  assert.ok(hach, 'Hachiko statue is in the data');
  assert.ok(sim.blocks.some((p) => Math.hypot(p.x - hach.x, p.z - hach.z) < 1.5 && p.y > 1), 'Hachiko stands on his plinth where OSM maps him');
  const koban = D.points.find((p) => p.kind === 'police');
  assert.ok(sim.blocks.some((p) => Math.hypot(p.x - koban.x, p.z - koban.z) < 3 && p.y > 3), 'the koban is built where OSM maps it');
  const viaduct = lab.buildings.find((r) => r.id === 'jr-viaduct');
  assert.ok(viaduct && viaduct.pieces > 20, 'JR viaduct built along the mapped tracks');

  // --- mixed geometry & budget ----------------------------------------------------
  const cubes = sim.blocks.filter((p) => p.fsx === p.fsy && p.fsy === p.fsz).length;
  assert.ok(sim.blocks.length - cubes > cubes, 'architectural pieces carry the structures');
  assert.ok(sim.blocks.length >= 12000 && sim.blocks.length <= 25000, `district piece budget 12k-25k (found ${sim.blocks.length})`);
  const lab0 = CITY_CATALOG.find((c) => c.scene === 'gallery');
  assert.equal(lab0.blocks, sim.blocks.length, 'the catalog card states the real piece count');

  // Full clear reachable: nothing at grade is too big to ever eat.
  for (const p of sim.blocks) if (p.gy === 0) assert.ok(Math.hypot(p.sx - 0.1, p.sz - 0.1) <= 8, `grade piece ${p.sx}x${p.sz} at (${p.x}, ${p.z}) is edible`);

  // Idle stability: nothing moves before the player touches anything.
  for (let i = 0; i < 180; i++) sim.step(1 / 60, { x: 0, z: 0 });
  const moving = sim.blocks.filter((p) => p.state !== 'static');
  assert.equal(moving.length, 0, `city stands at rest (${moving.slice(0, 5).map((p) => `${p.matType} ${p.sx}x${p.sy}x${p.sz}@${p.x},${p.y},${p.z}`).join('; ')})`);

  // --- starter route: Hachiko Square's real furniture feeds a fresh hole ---------
  const run = new VoxelSandboxSim({ seed: 'lab-shibuya-route' });
  driveRoute(run, LAB_ROUTE, 40);
  assert.ok(run.hole.eatenCount >= 60, `starter route feeds a fresh hole (${run.hole.eatenCount} pieces)`);
  assert.ok(run.hole.size >= 4, `starter route grows the hole (SIZE ${run.hole.size})`);

  // --- multiplayer starts: no street furniture inside any player's start hole ---
  // A 3-player match once seated two small props inside a hole's start disc.
  // Every roster size uses its own ring, so check them all (2.5 m, the solo keepout).
  const intrusions = [];
  for (let n = 2; n <= MAX_PLAYERS; n++) for (let slot = 0; slot < n; slot++) {
    const s = spawnPositionForSlot(slot, n);
    for (const pr of lab.props) for (const b of pr.boxes) {
      if (b[1] >= 3) continue;
      const cx = Math.max(b[0], Math.min(s.x, b[0] + b[3])), cz = Math.max(b[2], Math.min(s.z, b[2] + b[5]));
      if (Math.hypot(cx - s.x, cz - s.z) < 2.5) { intrusions.push(`${n}p slot ${slot}: ${pr.kind}`); break; }
    }
  }
  assert.deepEqual(intrusions, [], 'street furniture stays out of every multiplayer start hole');

  console.log(`Lab Shibuya Crossing: ${sim.blocks.length} pieces (${cubes} cubes), ${lab.buildings.length} structures, ${lab.props.length} props, ${cws.length} crossings, ${sim.sceneWires.length} wires; built in ${buildMs.toFixed(0)} ms; route ate ${run.hole.eatenCount}, SIZE ${run.hole.size}`);
}

// Hachiko Square outward: the planting bed round Hachiko (granite edging and
// azalea hedging), the statue, the square's small beds, then the scramble's
// south-east corner (signal poles, benches under the trees, guard rails).
export const LAB_ROUTE = [
  { until: 3, x: -7, z: 15 },
  { until: 6, x: -10, z: 12 },
  { until: 9, x: -11, z: 20 },
  { until: 12, x: -9, z: 26 },
  { until: 15, x: -11, z: 32 },
  { until: 18, x: -7, z: 28 },
  { until: 20, x: -4, z: 22 },
  { until: 22, x: -1, z: 31 },
  { until: 25, x: -9, z: 9 },
  { until: 28, x: -7, z: -3 },
  { until: 31, x: 4, z: -6 },
  { until: 34, x: 16, z: -7 },
  { until: 37, x: 8, z: -12 },
  { until: 40, x: -2, z: -12 },
];

if (process.argv[1]?.endsWith('lab-tokyo.test.mjs')) { validateLabTokyo(); console.log('ALL PASS'); }
