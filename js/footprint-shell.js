// Footprint -> hollow building shell. The reusable half of the city-remake
// method (.wiki/features/lab-tokyo-remake/README.md): given a real building's
// footprint polygon (metres, from OpenStreetMap via tools/citydata/) and its
// storey count, emit the mixed-geometry shell the authoring standard asks for
// (.wiki/geometry-authoring.md): bay-sized floor slabs, storey-high wall panels,
// interior columns only where a slab would otherwise hang, nothing inside.
//
// Pure sim: no three.js, no DOM, no Math.random. Every piece is one
// `sim._block` call through the voxelforms vocabulary rules (0.25 m grid).
//
// HOW A POLYGON BECOMES BOXES. Pieces are axis-aligned boxes, so the footprint
// is rasterised onto a shared 0.5 m cell lattice. A building whose own grid sits
// within `snapDeg` of the map axes is first turned about its centroid onto them
// (a <= 4 degree turn moves a 30 m facade's corner by < 1 m), so it comes out as
// clean rectangles; anything further off is stair-stepped, at a coarser 1 m cell
// when it is far off so a diagonal facade is a dozen panels, not forty slivers.
//
// NO OVERLAP BY CONSTRUCTION. Cells are CLAIMED on a lattice shared by every
// building in the district (`claims`), in the order buildings are built. Two
// footprints that touch or overlap in the source data can never both own a
// cell, so their shells can never intersect. Build landmarks first.
//
// SUPPORT BY CONSTRUCTION (voxelsim span rules, see voxelforms.js GOTCHAS).
// Walls stand on the slab below them (vertical support is free). A slab bay is
// carried by any wall cell under it; a bay with none gets a column under its
// centre, stacked storey on storey down to the slab below. Wall material is
// never glass (nothing may rest on glass): windows are a SURFACE on a concrete
// panel, which is also what lets one panel per bay per storey read as a facade.

const CELL = 0.5;          // lattice pitch in metres (two fine cells)
const key = (i, j) => i * 65536 + j; // i, j offset into a non-negative range below
const OFF = 32768;

// Dominant edge orientation in (-45, 45] degrees, length-weighted.
export function footprintAngle(poly) {
  const bins = new Float64Array(90);
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    let a = Math.atan2(z1 - z0, x1 - x0) * 180 / Math.PI;
    a = ((a % 90) + 90) % 90;
    bins[Math.round(a) % 90] += len;
  }
  let best = 0, bi = 0;
  for (let i = 0; i < 90; i++) {
    const s = bins[i] + bins[(i + 1) % 90] + bins[(i + 89) % 90];
    if (s > best) { best = s; bi = i; }
  }
  return bi > 45 ? bi - 90 : bi;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

export function polyCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const f = x0 * z1 - x1 * z0;
    a += f; cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// The polygon actually rasterised: snapped onto the axes when nearly aligned.
export function snappedPolygon(poly, snapDeg = 4) {
  const ang = footprintAngle(poly);
  if (ang === 0 || Math.abs(ang) > snapDeg) return { poly, ang, snapped: false };
  const [cx, cz] = polyCentroid(poly);
  const c = Math.cos(-ang * Math.PI / 180), s = Math.sin(-ang * Math.PI / 180);
  return {
    poly: poly.map(([x, z]) => [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]),
    ang, snapped: true,
  };
}

// Lattice cells whose centre lies inside the polygon. `coarse` samples on a
// 1 m pitch and expands each hit to its four 0.5 m cells.
export function rasterise(poly, coarse = false) {
  const step = coarse ? 2 : 1;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const i0 = Math.floor(minX / CELL / step) * step, i1 = Math.ceil(maxX / CELL);
  const j0 = Math.floor(minZ / CELL / step) * step, j1 = Math.ceil(maxZ / CELL);
  const cells = [];
  for (let j = j0; j < j1; j += step) {
    for (let i = i0; i < i1; i += step) {
      const x = (i + step / 2) * CELL, z = (j + step / 2) * CELL;
      if (!pointInPoly(x, z, poly)) continue;
      for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) cells.push([i + di, j + dj]);
    }
  }
  return cells;
}

// Greedy maximal rectangles over a cell set (deterministic). Runs row-major
// and column-major and keeps whichever needs fewer rectangles: a stair-stepped
// edge is a few long strips one way and many short ones the other.
// Returns [i, j, w, h] in cells.
export function rectangles(set) {
  const a = greedy(set, false), b = greedy(set, true);
  return b.length < a.length ? b : a;
}
function greedy(set, colMajor) {
  const cells = [...set].map((k) => [Math.floor(k / 65536) - OFF, (k % 65536) - OFF]);
  const has = colMajor ? (i, j) => set.has(key(j + OFF, i + OFF)) : (i, j) => set.has(key(i + OFF, j + OFF));
  if (colMajor) for (const c of cells) c.reverse();
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const used = new Set();
  const out = [];
  for (const [i, j] of cells) {
    if (used.has(key(i + OFF, j + OFF))) continue;
    let w = 1;
    while (has(i + w, j) && !used.has(key(i + w + OFF, j + OFF))) w++;
    let h = 1;
    for (;;) {
      let ok = true;
      for (let a = 0; a < w; a++) if (!has(i + a, j + h) || used.has(key(i + a + OFF, j + h + OFF))) { ok = false; break; }
      if (!ok) break;
      h++;
    }
    for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) used.add(key(i + a + OFF, j + b + OFF));
    out.push(colMajor ? [j, i, h, w] : [i, j, w, h]);
  }
  return out;
}

// Split n cells into the fewest near-equal runs of <= max cells.
function splitRun(n, max) {
  const k = Math.ceil(n / max);
  const base = Math.floor(n / k), extra = n - base * k;
  const out = []; let at = 0;
  for (let t = 0; t < k; t++) { const len = base + (t < extra ? 1 : 0); out.push([at, len]); at += len; }
  return out;
}

// Bays: a rectangle cut so no side exceeds `max` cells.
export function bays(rect, max) {
  const [i, j, w, h] = rect;
  const out = [];
  for (const [dj, bh] of splitRun(h, max)) for (const [di, bw] of splitRun(w, max)) out.push([i + di, j + dj, bw, bh]);
  return out;
}

export class CellClaims {
  constructor() { this.owner = new Map(); }
  // Claim every free cell of `cells` for `id`; returns the claimed set (keys).
  claim(cells, id) {
    const got = new Set();
    for (const [i, j] of cells) {
      const k = key(i + OFF, j + OFF);
      if (this.owner.has(k)) continue;
      this.owner.set(k, id);
      got.add(k);
    }
    return got;
  }
  has(i, j) { return this.owner.has(key(i + OFF, j + OFF)); }
  // Metre rectangle overlap test against claimed cells (for prop placement).
  hitsRect(x0, z0, x1, z1) {
    for (let j = Math.floor(z0 / CELL); j < Math.ceil(z1 / CELL); j++)
      for (let i = Math.floor(x0 / CELL); i < Math.ceil(x1 / CELL); i++) if (this.has(i, j)) return true;
    return false;
  }
}

const q = (v) => Math.round(v * 4) / 4;
// Three paint batches of one colour, a few percent apart: panel-to-panel variation real
// cladding has, and what keeps identical members from reading as slivers.
const batch = (c, n) => {
  if (n % 3 === 0 || c == null) return c;
  const k = n % 3 === 1 ? 0.97 : 1.02;
  const f = (v) => Math.min(255, Math.round(v * k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

// Storey rhythm from OSM tags. Height, when mapped, wins (it is surveyed);
// levels alone use the Japanese commercial norm of ~3.5 m per storey. When the
// two disagree past any real storey height (e.g. 4 levels over 28.5 m, a
// rooftop sign counted into the height), the height is kept and the storey
// count re-derived from it, flagged `fromHeight`.
export function storeyPlan(b, defaults = {}) {
  const dflLevels = defaults.levels ?? 2;
  let levels = Math.max(1, Math.round(b.levels ?? (b.height ? b.height / 3.5 : dflLevels)));
  const minLevel = Math.max(0, Math.round(b.minLevel ?? 0));
  let fromHeight = !b.levels && !!b.height;
  let storeyH = 3.5;
  if (b.height) {
    const span = b.height - 0.5 - (b.minHeight ?? 0);
    storeyH = span / Math.max(1, levels - minLevel);
    if (storeyH > 6 || storeyH < 2.75) {
      fromHeight = true;
      const n = Math.max(1, Math.round(span / 3.5));
      levels = n + minLevel;
      storeyH = span / n;
    }
  }
  storeyH = Math.min(6, Math.max(2.75, q(storeyH)));
  const above = Math.max(1, levels - minLevel);
  const baseY = q(b.minHeight ?? minLevel * storeyH);
  return { levels: above, storeyH, baseY, top: baseY + above * storeyH + 0.5, fromHeight };
}

// Slab bays on a regular structural grid anchored at the footprint's corner:
// a full grid tile is ONE plate; only tiles the facade cuts through are
// subdivided. Row-greedy rectangles over a ragged footprint would otherwise
// shred every floor into slivers along each stair-stepped edge.
export function slabBays(owned, bay) {
  const tiles = new Map();
  let minI = Infinity, minJ = Infinity;
  for (const k of owned) { minI = Math.min(minI, Math.floor(k / 65536)); minJ = Math.min(minJ, k % 65536); }
  for (const k of owned) {
    const i = Math.floor(k / 65536), j = k % 65536;
    const t = Math.floor((i - minI) / bay) * 4096 + Math.floor((j - minJ) / bay);
    if (!tiles.has(t)) tiles.set(t, new Set());
    tiles.get(t).add(k);
  }
  const out = [];
  for (const t of [...tiles.keys()].sort((a, b) => a - b)) for (const r of rectangles(tiles.get(t))) out.push(r);
  return out;
}

// Build one shell. `b` is a data-module building; `style` carries paint and
// surfaces; returns a record of what was emitted (for tests and landmarks).
//
// opts:
//   claims     CellClaims shared by the district (required)
//   snapDeg    alignment snap, default 4; anything further off is stair-stepped
//              on a 1 m lattice
//   bayCells   max slab/wall bay in cells (default 11 = 5.5 m; grade clause)
//   floorEvery a floor plate every N storeys (1 for landmarks you will see the
//              inside of; 2 halves a background block's pieces, and its wall
//              panels run N storeys tall so nothing ever overlaps a plate)
export function buildShell(sim, b, style, opts) {
  const { claims } = opts;
  const snapDeg = opts.snapDeg ?? 4;
  const bay = opts.bayCells ?? 11;
  const every = Math.max(1, opts.floorEvery ?? 1);
  const sn = snappedPolygon(b.poly, snapDeg);
  const cells = rasterise(sn.poly, !sn.snapped && sn.ang !== 0);
  const owned = claims.claim(cells, b.id);
  const rec = { id: b.id, name: b.name, cells: owned.size, first: sim._blockId, pieces: 0, snapped: sn.snapped, ang: sn.ang };
  if (owned.size < 4) { rec.last = sim._blockId - 1; return rec; }

  // Wall ring: owned cells with an 8-neighbour outside the building. 8-, not
  // 4-connectivity, so a stair-stepped facade has no diagonal pinholes.
  const ring = new Set();
  for (const k of owned) {
    const i = Math.floor(k / 65536), j = k % 65536;
    let edge = false;
    for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) {
      if ((di || dj) && !owned.has(key(i + di, j + dj))) { edge = true; break; }
    }
    if (edge) ring.add(k);
  }
  const wallRects = [];
  for (const r of rectangles(ring)) {
    const [i, j, w, h] = r;
    // Walls are cut along their long axis only: a panel is one bay wide.
    if (w >= h) for (const [d, len] of splitRun(w, bay)) wallRects.push([i + d, j, len, h]);
    else for (const [d, len] of splitRun(h, bay)) wallRects.push([i, j + d, w, len]);
  }
  // Upper plates may span a larger bay than grade pieces (the grade clause
  // only binds at gy 0), which halves the plates a big floor is cut into.
  const slabRects = slabBays(owned, opts.plateCells ?? 16);
  // Which slab bays need a column: those with no ring cell under them.
  const needsColumn = slabRects.map(([i, j, w, h]) => {
    for (let b2 = 0; b2 < h; b2++) for (let a = 0; a < w; a++) if (ring.has(key(i + a + OFF, j + b2 + OFF))) return false;
    return true;
  });

  const plan = storeyPlan(b, opts.defaults);
  const { levels, storeyH, baseY } = plan;
  rec.levels = levels; rec.storeyH = storeyH; rec.baseY = baseY; rec.top = plan.top; rec.fromHeight = plan.fromHeight;
  rec.ringKeys = ring; rec.owned = owned;
  const put = (i, j, w, h, y, sy, mat, color, surface) => {
    sim._block(i * CELL, y, j * CELL, mat, [w * CELL, sy, h * CELL], color, surface);
    rec.pieces++;
  };
  const slabColor = style.slab ?? 0xb8b4aa;
  const colColor = style.column ?? 0x6c6f75;
  const centre = ([i, j, w, h]) => [i + Math.floor(w / 2), j + Math.floor(h / 2)];
  // Pilotis: a building lifted over a street stands on columns from grade,
  // and its lowest storey gets a real floor plate on top of them.
  if (baseY > 0.25) {
    for (const r of slabRects) put(r[0], r[1], r[2], r[3], baseY, 0.5, 'concrete', slabColor);
    for (const r of slabRects) { const [ci, cj] = centre(r); put(ci, cj, 1, 1, 0, baseY, 'concrete', colColor); }
  }
  // Floor plates at storey 0, then every `every` storeys, then the roof. The
  // ground storey is always its own course (shopfronts); above it, panels run
  // from one plate to the next.
  const plates = [0];
  for (let k = 1; k < levels; k++) if (k === 1 || (k - 1) % every === 0) plates.push(k);
  plates.push(levels);
  for (let p = 0; p < plates.length; p++) {
    const k = plates[p], y = baseY + k * storeyH, roof = k === levels;
    // No plate at grade: the ground-floor walls and columns stand on the
    // street itself (they are the support anchors), and a slab there would be
    // an invisible floor under the pavement costing a piece per bay.
    if (k > 0) {
      // Plates alternate between two batches of precast grey: a plate cut
      // along a stair-stepped footprint then never reads as a missed step
      // beside its identical neighbour (tools/validate.mjs probePlacementStep).
      slabRects.forEach((r) => put(r[0], r[1], r[2], r[3], y, 0.5, 'concrete', batch(roof ? (style.roof ?? slabColor) : slabColor, (r[0] * 7 + r[1] * 13 + 99999) % 3), roof ? style.roofSurface : undefined));
    }
    if (roof) break;
    const ground = k === 0 && baseY < 0.25;
    // At grade there is no plate, so the ground course starts on the street.
    const y0 = ground ? 0 : y + 0.5;
    const h = baseY + plates[p + 1] * storeyH - y0;
    const color = ground ? (style.ground ?? style.wall) : style.wall;
    const surface = ground ? (style.groundSurface ?? 'mat_shop_window') : style.surface;
    wallRects.forEach(([i, j, w, hh], n) => put(i, j, w, hh, y0, h, style.wallMat ?? 'concrete', batch(color, n), surface));
    // Columns under slab bays that no wall carries, one plate-gap tall.
    slabRects.forEach((r, n) => { if (needsColumn[n]) { const [ci, cj] = centre(r); put(ci, cj, 1, 1, y0, h, 'concrete', colColor); } });
  }
  rec.last = sim._blockId - 1;
  return rec;
}
