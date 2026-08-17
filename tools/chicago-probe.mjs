// Chicago rebuild probe — the scene's own fast gate, mirroring the shared
// validator's per-scene checks (tools/validate.mjs) plus the rebuild's extra
// contracts: palette allowlist, street alignment, the el circuit, and the
// deterministic train mover. Run: node tools/chicago-probe.mjs
//
// This is NOT a fork of the validator (which stays the authority and runs the
// full scene matrix); it is the authoring loop's seconds-fast subset so the
// hour-long full run never becomes the discovery surface.

import { VoxelSandboxSim, moverArc, moverPose, loadScene } from '../js/voxelsim.js';
import {
  CHICAGO_BOUNDS, CHICAGO_CROSSINGS, CHICAGO_DECOR, CHICAGO_DISTRICTS,
  CHICAGO_HEROES, CHICAGO_MOVERS, CHICAGO_ROAD_SPANS, CHICAGO_ROUTE,
  CHICAGO_STREETS, CHICAGO_VEHICLES, CHICAGO_XW_LEN,
} from '../js/voxelscene-chicago.js';
import { vehicleBBox } from '../js/voxelkit.js';
import { driveRoute, MAX_IDLE_FRAC } from './route-driver.mjs';

const DT = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const blockRect = (bl) => ({ x: bl.x - bl.sx / 2, z: bl.z - bl.sz / 2, w: bl.sx, d: bl.sz });
const sizeLabel = (bl) => (bl.sx === bl.sy && bl.sy === bl.sz ? bl.sx : `${bl.sx}x${bl.sy}x${bl.sz}`);

console.log('Probing chicago rebuild...');
const t0 = Date.now();
await loadScene('chicago');   // authored scenes load on demand (js/voxelsim.js)
const sim = new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' });
console.log(`  built: ${sim.blocks.length} blocks, ${sim.grid.size} fine cells, ${(Date.now() - t0)} ms`);

// 1. block budget in the big-city band (Boston/Cambridge run ~40-83k).
if (sim.blocks.length < 35000 || sim.blocks.length > 80000) {
  fail(`block count ${sim.blocks.length} outside the 35k-80k big-city band`);
} else ok(`block budget: ${sim.blocks.length}`);

// 2. cell ownership — overlapping placement makes ghost blocks.
{
  let ghosts = 0, worst = '';
  for (const b of sim.blocks) {
    for (let ix = 0; ix < b.fsx; ix++) for (let iy = 0; iy < b.fsy; iy++) for (let iz = 0; iz < b.fsz; iz++) {
      if (sim.grid.get(`${b.gx + ix},${b.gy + iy},${b.gz + iz}`) !== b) {
        ghosts++;
        if (!worst) worst = `${b.matType}/${sizeLabel(b)}m at (${b.x},${b.y},${b.z})`;
      }
    }
  }
  if (ghosts > 0) fail(`${ghosts} fine cells owned by the wrong block, first loser ${worst}`);
  else ok('cell ownership: no overlapping placement');
}

// 3. bounds hug the content (12 m slack rule).
{
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of sim.blocks) {
    minX = Math.min(minX, b.x - b.sx / 2); maxX = Math.max(maxX, b.x + b.sx / 2);
    minZ = Math.min(minZ, b.z - b.sz / 2); maxZ = Math.max(maxZ, b.z + b.sz / 2);
  }
  const R = CHICAGO_BOUNDS;
  if (minX < R.minX || maxX > R.maxX || minZ < R.minZ || maxZ > R.maxZ) {
    fail(`geometry x[${minX},${maxX}] z[${minZ},${maxZ}] escapes boundsRect`);
  } else if (R.maxX - maxX > 12 || minX - R.minX > 12 || R.maxZ - maxZ > 12 || minZ - R.minZ > 12) {
    fail(`boundsRect leaves >12 m blank (content x[${minX},${maxX}] z[${minZ},${maxZ}])`);
  } else ok(`bounds: content x[${minX.toFixed(1)},${maxX.toFixed(1)}] z[${minZ.toFixed(1)},${maxZ.toFixed(1)}]`);
}

// 4. road conflicts — no block in a carriageway outside vehicles/spans.
{
  const allow = CHICAGO_VEHICLES.map(vehicleBBox);
  let bad = 0, worst = '';
  for (const bl of sim.blocks) {
    const r = blockRect(bl);
    if (!CHICAGO_DECOR.roads.some((rd) => rectsOverlap(r, rd))) continue;
    const inVehicle = allow.some((v) =>
      r.x >= v.minX - 0.75 && r.x + r.w <= v.maxX + 0.75 && r.z >= v.minZ - 0.75 && r.z + r.d <= v.maxZ + 0.75);
    if (inVehicle) continue;
    const inSpan = CHICAGO_ROAD_SPANS.some((s) =>
      r.x >= s.minX && r.x + r.w <= s.maxX && r.z >= s.minZ && r.z + r.d <= s.maxZ && bl.y - bl.sy / 2 >= s.minY);
    if (inSpan) continue;
    bad++;
    if (!worst) worst = `${bl.matType}/${sizeLabel(bl)}m at (${r.x},${bl.y},${r.z})`;
  }
  if (bad > 0) fail(`${bad} block(s) inside a roadway, first ${worst}`);
  else ok('roads: clean carriageways (vehicles + elevated spans only)');
}

// 5. decor sanity: key order, water never over surfaces, crosswalks legal,
//    crossings on their declared street, no bare ground.
{
  const D = sim.sceneDecor;
  const ORDER = ['parks', 'sand', 'plaza', 'cobbles', 'sidewalks', 'roads', 'rail',
    'bikePaths', 'laneMarkers', 'crosswalks', 'water', 'boardwalk'];
  if (Object.keys(D).join(',') !== ORDER.join(',')) fail(`sceneDecor key order is ${Object.keys(D).join(',')}`);
  for (const key of ['roads', 'plaza', 'cobbles', 'sidewalks', 'crosswalks']) {
    for (const w of D.water) {
      const hit = (D[key] || []).find((r) => rectsOverlap(r, w));
      if (hit) fail(`${key} rect (${hit.x},${hit.z} ${hit.w}x${hit.d}) is under water`);
    }
  }
  let stray = 0, stacked = 0;
  for (let i = 0; i < D.crosswalks.length; i++) {
    const s = D.crosswalks[i];
    if (!D.roads.some((r) => s.x >= r.x && s.x + s.w <= r.x + r.w && s.z >= r.z && s.z + s.d <= r.z + r.d)) stray++;
    for (let j = i + 1; j < D.crosswalks.length; j++) if (rectsOverlap(s, D.crosswalks[j])) stacked++;
  }
  if (stray > 0) fail(`${stray} crosswalk stripe(s) outside asphalt`);
  if (stacked > 0) fail(`${stacked} overlapping crosswalk stripe pair(s)`);
  let wrong = 0, worst = '';
  for (const [si, at] of CHICAGO_CROSSINGS) {
    const s = CHICAGO_STREETS[si];
    const lo = s.axis === 'x' ? s.x : s.z;
    const hi = lo + (s.axis === 'x' ? s.w : s.d);
    if (at >= lo && at + CHICAGO_XW_LEN <= hi) continue;
    wrong++;
    if (!worst) worst = `[${si}, ${at}]`;
  }
  if (wrong > 0) fail(`${wrong} crossing(s) outside their own street, first ${worst}`);
  // bare ground: every footprint cell must sit on some decor rect.
  const layers = Object.values(D).flat();
  const tops = new Map();
  for (const b of sim.blocks) {
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
        tops.set(`${cx},${cz}`, true);
      }
    }
  }
  let bare = 0, bareWorst = '';
  for (const k of tops.keys()) {
    const [cx, cz] = k.split(',').map(Number);
    const cell = { x: cx, z: cz, w: 1, d: 1 };
    if (layers.some((r) => rectsOverlap(cell, r))) continue;
    bare++;
    if (!bareWorst) bareWorst = `(${cx},${cz})`;
  }
  if (bare > 0) fail(`${bare} footprint cell(s) on bare ground, first ${bareWorst}`);
  if (failures === 0) ok('decor: order, water, crosswalks, crossings, no bare ground');
}

// 6. street alignment: sample buildings' footprints against the street table —
//    nothing may stand closer than the sidewalk line of any carriageway.
{
  let bad = 0, worst = '';
  for (const bl of sim.blocks) {
    if (bl.y - bl.sy / 2 > 0.01 || bl.sy < 6) continue;   // grade-anchored tall masses only
    const r = blockRect(bl);
    for (const s of CHICAGO_STREETS) {
      const road = { x: s.x, z: s.z, w: s.w, d: s.d };
      if (rectsOverlap(r, road)) { bad++; if (!worst) worst = `${sizeLabel(bl)} at (${bl.x},${bl.z}) in ${s.id}`; }
    }
  }
  if (bad > 0) fail(`${bad} tall grade block(s) breach a carriageway, first ${worst}`);
  else ok('street alignment: every tall mass respects the grid');
}

// 7. palette allowlist: every block colour must be a scene-authored value —
//    the old map's "odd bright spots" were kit-default colours (0x88ccff
//    glass and friends) leaking through builders.
{
  // Structural blocks (any extent >= 1 m) — the population whose colour the
  // eye reads as a building. Kit street props (windshields, lamp heads,
  // traffic lenses, hydrant red) legitimately carry small bright cells at
  // 0.25-0.5 m and appear in every shipped scene; the old map's failure was
  // brights on STRUCTURE (default 0x88ccff glazing on whole facades).
  const seen = new Map();
  let structBright = 0, worstHex = 0;
  const heroKeys = new Set(CHICAGO_HEROES.map((h) => h.colorKey));
  for (const b of sim.blocks) {
    seen.set(b.color, (seen.get(b.color) || 0) + 1);
    if (Math.max(b.sx, b.sy, b.sz) < 1 || heroKeys.has(b.color)) continue;
    if (b.color === 0xc9a83f) continue; // platform tactile strip — the authored transit accent
    if (b.color === 0x88ccff) { structBright++; worstHex = b.color; continue; }
    const r = (b.color >> 16) & 255, g = (b.color >> 8) & 255, bl = b.color & 255;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
    if (mx > 200 && (mx === 0 ? 0 : (mx - mn) / mx) > 0.55) { structBright++; worstHex = b.color; }
  }
  if (structBright > 0) fail(`${structBright} structural block(s) in an unmanaged bright colour, e.g. 0x${worstHex.toString(16)}`);
  else ok(`palette: ${seen.size} colours, no brights on structure, heroes are the only accents`);
}

// 8. hero identity: each accent key appears, and only inside its AABB.
{
  for (const row of CHICAGO_HEROES) {
    let marked = 0, strayed = 0, at = '';
    for (const b of sim.blocks) {
      if (b.color !== row.colorKey) continue;
      marked++;
      const a = row.hero;
      const inside = b.x - b.sx / 2 >= a.minX && b.x + b.sx / 2 <= a.maxX &&
        b.y - b.sy / 2 >= a.minY && b.y + b.sy / 2 <= a.maxY &&
        b.z - b.sz / 2 >= a.minZ && b.z + b.sz / 2 <= a.maxZ;
      if (!inside) { strayed++; if (!at) at = `(${b.x},${b.y},${b.z})`; }
    }
    if (marked === 0) fail(`${row.id}: hero key 0x${row.colorKey.toString(16)} absent`);
    else if (strayed > 0) fail(`${row.id}: ${strayed}/${marked} key block(s) outside the hero AABB, first ${at}`);
  }
  if (failures === 0) ok('heroes: four keys, each confined to its own landmark');
}

// 9. grade diagonal (8 m rule) + placement step (anisotropic sliver rule).
{
  let over = 0, worst = '';
  for (const b of sim.blocks) {
    if (b.gy !== 0) continue;
    const diag = Math.hypot(b.sx - 0.1, b.sz - 0.1);
    if (diag > 8) { over++; if (!worst) worst = `${sizeLabel(b)} at (${b.x},${b.z})`; }
  }
  if (over > 0) fail(`${over} grade block(s) over the 8 m plan diagonal, first ${worst}`);
  else ok('grade diagonal: everything at grade stays eatable');

  const AXES = [
    { g: 'gx', fs: 'fsx', a: 'gy', b: 'gz', label: 'x' },
    { g: 'gy', fs: 'fsy', a: 'gx', b: 'gz', label: 'y' },
    { g: 'gz', fs: 'fsz', a: 'gx', b: 'gy', label: 'z' },
  ];
  let gated = 0, census = 0, worstStep = '';
  for (const A of AXES) {
    const runs = new Map();
    for (const bl of sim.blocks) {
      const k = `${bl.matType}|${bl.color}|${bl.fsx},${bl.fsy},${bl.fsz}|${bl[A.a]},${bl[A.b]}`;
      const list = runs.get(k);
      if (list) list.push(bl); else runs.set(k, [bl]);
    }
    for (const list of runs.values()) {
      if (list.length < 2) continue;
      list.sort((p, r) => p[A.g] - r[A.g]);
      for (let i = 1; i < list.length; i++) {
        const cur = list[i - 1], nxt = list[i];
        const gap = nxt[A.g] - (cur[A.g] + cur[A.fs]);
        if (gap <= 0 || gap >= cur[A.fs]) continue;
        if (cur.fsx === cur.fsy && cur.fsy === cur.fsz) { census++; continue; }
        gated++;
        if (!worstStep) worstStep = `${cur.matType}/${sizeLabel(cur)}m at (${cur.x},${cur.y},${cur.z}) leaves ${(gap * 0.25).toFixed(2)} m on ${A.label}`;
      }
    }
  }
  if (gated > 0) fail(`${gated} sub-extent gap(s) between identical boxes, first ${worstStep}`);
  else ok(`placement step: no anisotropic slivers (${census} cube gaps, census only)`);
}

// 10. the el circuit + the mover: path closed, on the deck rectangle,
//     corner continuity, and deterministic poses off the sim clock.
{
  const m = CHICAGO_MOVERS[0];
  const arc = moverArc(m.path);
  if (!(arc.total > 300 && arc.total < 500)) fail(`train path total ${arc.total.toFixed(1)} m out of band`);
  // closed: moverArc closes implicitly; verify continuity by sampling.
  const a = moverPose(arc, 0), b = moverPose(arc, arc.total);
  if (Math.hypot(a.x - b.x, a.z - b.z) > 0.01) fail('train path does not close');
  // every sample must ride over el deck footprint (the four leg rects).
  const LEGS = CHICAGO_ROAD_SPANS.slice(0, 4);
  let off = 0, offAt = '';
  for (let s = 0; s < arc.total; s += 1.5) {
    const p = moverPose(arc, s);
    if (!LEGS.some((L) => p.x >= L.minX && p.x <= L.maxX && p.z >= L.minZ && p.z <= L.maxZ)) {
      off++;
      if (!offAt) offAt = `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) at s=${s.toFixed(1)}`;
    }
  }
  if (off > 0) fail(`${off} train path sample(s) off the elevated deck, first ${offAt}`);
  // determinism: pose is a pure function of time — two evaluations agree.
  let diverged = false;
  for (const t of [0, 12.34, 100.5, 1000.25]) {
    const p1 = moverPose(arc, t * m.speed);
    const p2 = moverPose(moverArc(m.path), t * m.speed);
    if (p1.x !== p2.x || p1.z !== p2.z) diverged = true;
  }
  if (diverged) fail('mover pose is not a pure function of time');
  if (!Array.isArray(sim.sceneMovers) || sim.sceneMovers[0] !== m) fail('sim.sceneMovers not wired');
  // The simulated half (derail/ground-run/eatable, js/voxelsim.js mover
  // simulation): runtime wired, unit ids extend the block id space, and the
  // INTACT circuit reads as solid track everywhere — a false derail on a
  // healthy loop is the one bug the sampling must never ship.
  const rt = sim.moverSim && sim.moverSim[0];
  if (!rt) fail('sim.moverSim not built from the scene\'s sim config');
  else {
    if (rt.units.length !== 4) fail(`mover runtime has ${rt.units.length} units, want 4`);
    let maxBlockId = 0;
    for (const b of sim.blocks) if (b.id > maxBlockId) maxBlockId = b.id;
    if (!rt.units.every((u) => u.id > maxBlockId)) fail('unit ids do not extend the block id space');
    if (sim.objectIdSpace !== rt.units[rt.units.length - 1].id + 1) {
      fail(`sim.objectIdSpace ${sim.objectIdSpace} does not cover the units`);
    }
    let falseDerail = 0;
    for (let s = 0; s < rt.arc.total; s += 0.25) if (!sim.moverTrackOk(0, s)) falseDerail++;
    if (falseDerail > 0) fail(`${falseDerail} intact-track sample(s) read as a gap (false derail)`);
    if (!rt.units.every((u) => u.phase === 'ride')) fail('a unit is not riding on a fresh scene');
  }
  if (failures === 0) ok(`el + train: closed ${arc.total.toFixed(0)} m circuit, 4 cars, on-deck, deterministic, derailable`);
}

// 11. idle stability, then the deterministic excursion (twice).
{
  const idle = new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' });
  for (let i = 0; i < 3 * 60; i++) idle.step(DT, { x: 0, z: 0 });
  const nonStatic = idle.blocks.filter((b) => b.state !== 'static').length;
  if (nonStatic !== 0) fail(`${nonStatic} blocks non-static after 3 s idle at spawn`);
  if (idle.hole.eatenCount !== 0) fail(`${idle.hole.eatenCount} blocks eaten during idle`);
  if (nonStatic === 0 && idle.hole.eatenCount === 0) ok('idle: stable and unfed at spawn');

  const WP = CHICAGO_ROUTE;
  const DURATION = WP[WP.length - 1].until;
  // Same driver as tools/validate.mjs, from the same module — the point of the
  // extraction. This probe carried its own copy of the time-gated loop until
  // 2026-08-17, so it degraded identically and silently when SPEED_MULT rose
  // (RCA-2026-08-17-chicago-excursion-red-since-speed-retune). A probe that is
  // red while the validator is green teaches the reader that red is normal here.
  const run = () => driveRoute(new VoxelSandboxSim({ seed: 'validator', scene: 'chicago' }), WP, DURATION);
  const A = run(), B = run();
  if (A.hole.eatenCount !== B.hole.eatenCount || A.hole.mass.toFixed(6) !== B.hole.mass.toFixed(6)) {
    fail(`non-deterministic excursion (${A.hole.eatenCount} vs ${B.hole.eatenCount})`);
  }
  if (A.__route.idleFrac > MAX_IDLE_FRAC) {
    fail(`the tour left the hole standing still for ${(A.__route.idleFrac * 100).toFixed(1)}% of its ${A.__route.steps} ticks (max ${(MAX_IDLE_FRAC * 100).toFixed(0)}%) — a parked hole measures the clock, not the scene`);
  }
  if (A.hole.eatenCount < 300) fail(`only ${A.hole.eatenCount} blocks eaten on the tour (need >=300)`);
  if (A.hole.size < 7) fail(`tour reached only SIZE ${A.hole.size} (need >=7)`);
  let nan = 0;
  for (const bl of A.blocks) if (!Number.isFinite(bl.x) || !Number.isFinite(bl.y) || !Number.isFinite(bl.z)) nan++;
  if (nan > 0) fail(`${nan} non-finite positions after the tour`);
  console.log(`  excursion: eaten=${A.hole.eatenCount} raw=${A.hole.rawMass.toFixed(0)} size=${A.hole.size} peakChain=${A.hole.bestCombo} score=${A.hole.mass.toFixed(0)} laps=${A.__route.laps} idle=${(A.__route.idleFrac * 100).toFixed(1)}% dist=${A.__route.dist.toFixed(0)}m`);

  // district gap/density — the validator's clauses on the fresh scene.
  const arc = (() => {
    const segs = []; let total = 0;
    for (let i = 1; i < WP.length; i++) {
      const p = WP[i - 1], nx = WP[i];
      const dx = nx.x - p.x, dz = nx.z - p.z, len = Math.hypot(dx, dz);
      if (len <= 0) continue;
      segs.push({ x: p.x, z: p.z, ux: dx / len, uz: dz / len, len, s0: total });
      total += len;
    }
    return { segs, total };
  })();
  const project = (px, pz) => {
    let bestD2 = Infinity, bestS = 0;
    for (const g of arc.segs) {
      const t = Math.max(0, Math.min(g.len, (px - g.x) * g.ux + (pz - g.z) * g.uz));
      const cx = g.x + g.ux * t, cz = g.z + g.uz * t;
      const d2 = (px - cx) ** 2 + (pz - cz) ** 2;
      if (d2 < bestD2) { bestD2 = d2; bestS = g.s0 + t; }
    }
    return { d2: bestD2, s: bestS };
  };
  const at = (s) => {
    let g = arc.segs[arc.segs.length - 1];
    for (const c of arc.segs) { if (s <= c.s0 + c.len) { g = c; break; } }
    const t = Math.max(0, Math.min(g.len, s - g.s0));
    return { x: g.x + g.ux * t, z: g.z + g.uz * t };
  };
  const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  const rows = [];
  for (const d of CHICAGO_DISTRICTS) {
    const mine = sim.blocks.filter((b) => inRect(d.rect, b.x, b.z));
    const cells = new Set();
    for (const b of mine) {
      for (let cx = Math.floor(b.x - b.sx / 2); cx < Math.ceil(b.x + b.sx / 2); cx++) {
        for (let cz = Math.floor(b.z - b.sz / 2); cz < Math.ceil(b.z + b.sz / 2); cz++) {
          if (inRect(d.rect, cx + 0.5, cz + 0.5)) cells.add(`${cx},${cz}`);
        }
      }
    }
    const density = cells.size ? mine.length / cells.size : 0;
    const met = mine.map((b) => project(b.x, b.z)).filter((p) => p.d2 <= 2.6 * 2.6).map((p) => p.s).sort((p, n) => p - n);
    const passes = [];
    let open = null;
    for (let s = 0; s <= arc.total + 1; s += 1) {
      const q = at(Math.min(s, arc.total));
      if (s <= arc.total && inRect(d.rect, q.x, q.z)) {
        if (open) open.s1 = Math.min(s, arc.total); else open = { s0: Math.min(s, arc.total), s1: Math.min(s, arc.total) };
      } else if (open) { passes.push(open); open = null; }
    }
    let worstGap = 0, worstMid = null;
    for (const p of passes) {
      const here = met.filter((s) => s >= p.s0 && s <= p.s1);
      const marks = [p.s0, ...here, p.s1];
      for (let i = 1; i < marks.length; i++) {
        const g = marks[i] - marks[i - 1];
        if (g > worstGap) { worstGap = g; worstMid = at((marks[i] + marks[i - 1]) / 2); }
      }
    }
    const meanGap = met.length >= 2 ? (met[met.length - 1] - met[0]) / (met.length - 1) : null;
    rows.push({ d, density, met: met.length, meanGap, worstGap, worstMid, passes: passes.length });
  }
  const sorted = rows.map((r) => r.density).sort((x, y) => x - y);
  const median = sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2;
  for (const r of rows) {
    const label = `${r.d.id} density ${r.density.toFixed(2)} met ${r.met} mean ${r.meanGap === null ? 'n/a' : r.meanGap.toFixed(1)} worst ${r.worstGap.toFixed(1)}`;
    console.log(`  district ${label}${r.passes === 0 ? ' (route never enters)' : ''}`);
    if (r.passes > 0) {
      if (r.meanGap !== null && r.meanGap > 15) fail(`${r.d.id}: mean gap ${r.meanGap.toFixed(1)} > 15`);
      if (r.worstGap > 25) fail(`${r.d.id}: ${r.worstGap.toFixed(1)} m hole near (${r.worstMid.x.toFixed(0)}, ${r.worstMid.z.toFixed(0)})`);
    }
    if (r.density < median / 2) fail(`${r.d.id}: density ${r.density.toFixed(2)} below half the median ${median.toFixed(2)}`);
  }
}

if (failures > 0) { console.error(`${failures} FAILURE(S)`); process.exit(1); }
console.log('ALL PASS (chicago-probe)');
