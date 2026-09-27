// STREETKIT: data-driven streetscape for real districts. The street half of the
// city-remake method (.wiki/features/lab-tokyo-remake/README.md); the building
// half is js/footprint-shell.js.
//
// Input is a city data module (tools/citydata/ -> js/citydata/*.js: OSM road
// centre-lines, crossings, furniture nodes, plazas). Output is a PLAN — flat
// ground decor, a list of props with their boxes, overhead wires, and the
// "life" seam (walk paths, lanes with direction, signal phases, perches) — and
// `placeProps`, which turns planned props into sim pieces without overlap.
//
// WHERE THINGS GO is the whole point, and it is decided by two sources, in
// this order: (1) what OpenStreetMap actually records at that spot (a
// crossing, a post box, a hydrant, a tree, a bus stop); (2) where OSM is
// silent, the country's real placement conventions, held in a PROFILE below.
// Every prop carries `src: 'osm' | 'rule'` so the two are never confused.
//
// Pure sim (imported by a scene, run by the Node validator): no three.js, no
// DOM, no Math.random. Randomness is a hash of the prop's position.

// --------------------------------------------------------------- profiles
const WHITE = 0xf4f4ef, YELLOW = 0xf2b705;

// JAPAN. Sources for the numbers, in brief (full notes in the feature README):
// road-marking order (道路標識、区画線及び道路標示に関する命令): zebra bars 45 cm
// with 45 cm gaps, crossing 4 m wide (3 m minimum); stop line 30 cm (45 cm on
// two or more lanes) set back at least 2 m before the crossing; diamond
// "crossing ahead" marks before crossings WITHOUT signals. Traffic keeps LEFT.
// Street furniture follows common Tokyo practice: signal poles at every corner
// of a signalled crossing carrying a horizontal three-lamp vehicle head (blue-
// green, amber, red) on an arm over the lanes plus a pedestrian head; white
// guard rails along arterial kerbs, broken at crossings and bus stops;
// concrete utility poles with overhead wires on side streets (arterials here
// are undergrounded); vending machines flush against building frontages, each
// bank with its own bottle/can recycling box — and almost no other public
// bins; red post boxes; underground hydrants marked by a yellow lid and a sign
// post; yellow tactile warning blocks at every crossing end.
export const JP = Object.freeze({
  id: 'JP', drive: 'left',
  laneWidth: { arterial: 3.0, minor: 2.75 },
  defaultLanes: { primary: 4, secondary: 2, tertiary: 2, tertiary_link: 1, unclassified: 1, residential: 1, living_street: 1, service: 1 },
  arterial: ['primary', 'secondary', 'tertiary', 'tertiary_link'],
  minor: ['unclassified', 'residential', 'living_street', 'service'],
  pedestrianWidth: 7,
  sidewalkWidth: { primary: 4, secondary: 3.5, tertiary: 3, tertiary_link: 2.5 },
  colors: {
    ground: 0x7d7a74, sidewalk: 0x8e8b85, plaza: 0x9a948a, planting: 0x5e8a4a,
    road: 0x2b2d31, pedestrianStreet: 0x8c6f66, kerb: 0xb9b6ae, marking: WHITE,
    centre: YELLOW, tactile: 0xf2c200, hydrantLid: 0xf2c200,
  },
  crosswalk: { bar: 0.45, gap: 0.45, width: 4, scrambleWidth: 6 },
  stopLine: { setback: 2, wide: 0.45, narrow: 0.3 },
  centreLine: { width: 0.15, minLanes: 2 },
  laneLine: { width: 0.15, dash: 5, gap: 5 },
  edgeLine: { width: 0.15, inset: 0.75 },   // 路側帯 on streets without sidewalks
  diamond: { at: [30, 50], len: 3, wid: 1.5, line: 0.15 },
  tactileDepth: 0.6,
  signal: { poleH: 5, armY: 5, armLen: 3.5, housing: 0x3c4146, pole: 0x9aa0a6, lamps: [0x10b981, 0xf5a623, 0xe23b2e], walk: 0x10b981, wait: 0xe23b2e },
  guardRail: { panel: 2, pitch: 2.5, h: 0.75, color: 0xeef0ea, gapAtCrossing: 1.5, gapAtJunction: 6 },
  lamp: { spacing: 30, h: 7, color: 0x8b9096 },
  utilityPole: { spacing: 30, h: 10, color: 0x9c9a92 },
  vending: { spacing: { arterial: 70, minor: 45 }, colors: [0xd62828, 0x1d4e89, 0xf1f1ec, 0x2a9d8f, 0x0b0b0b], bin: 0x3a7bd5 },
  postBox: 0xd7261e,
  // Signal timing seam for the life phase (not simulated yet). Approximate
  // Tokyo downtown cycles; the scramble adds an all-walk phase. Seconds.
  phases: {
    standard: [{ name: 'main road', walk: 'parallel', s: 40 }, { name: 'amber/clear', s: 6 }, { name: 'cross road', walk: 'parallel', s: 30 }, { name: 'amber/clear', s: 6 }],
    scramble: [{ name: 'vehicles A', s: 35 }, { name: 'clear', s: 6 }, { name: 'vehicles B', s: 30 }, { name: 'clear', s: 6 }, { name: 'all-way pedestrian scramble', walk: 'all', s: 40 }, { name: 'clear', s: 3 }],
  },
});

// Seams for the next countries. These state the differences that change
// PLACEMENT (which side traffic keeps to, which way stripes run, where signals
// stand); a remake of a city in one of them fills in the rest and drops
// `draft`. Nothing ships on a draft profile.
export const US = Object.freeze({
  ...JP, id: 'US', draft: true, drive: 'right',
  crosswalk: { bar: 0.3, gap: 0.6, width: 3, scrambleWidth: 4, style: 'continental' },
  stopLine: { setback: 1.2, wide: 0.6, narrow: 0.6 },
  diamond: null, tactileDepth: 0.6, // truncated-dome pads at ramps (ADA)
  colors: { ...JP.colors, centre: YELLOW, tactile: 0xe3b23c },
  guardRail: null, utilityPole: { ...JP.utilityPole, spacing: 45 },
  vending: null, postBox: 0x1f4e9c, // USPS blue collection box at corners
});
export const UK = Object.freeze({
  ...JP, id: 'UK', draft: true, drive: 'left',
  crosswalk: { bar: 0.5, gap: 0.5, width: 3, scrambleWidth: 4, style: 'zebra-with-belisha' },
  diamond: null, colors: { ...JP.colors, centre: WHITE, tactile: 0xd9c9a3 },
  vending: null, postBox: 0xd7261e, // red pillar box
});
export const EU = Object.freeze({
  ...JP, id: 'EU', draft: true, drive: 'right',
  crosswalk: { bar: 0.5, gap: 0.5, width: 4, scrambleWidth: 4 },
  diamond: null, colors: { ...JP.colors, centre: WHITE, tactile: 0xd7d7d7 },
  vending: null, postBox: 0xf2c200, // yellow (DE/FR/IT vary; set per city)
});
export const PROFILES = Object.freeze({ JP, US, UK, EU });

// --------------------------------------------------------------- geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
// Left of travel direction t in this frame (x east, z south): heading north
// (0,-1) keeps left = west (-1,0). Left-hand traffic lanes sit on this side.
export const leftOf = (t) => [t[1], -t[0]];
const r2 = (v) => Math.round(v * 100) / 100;
const q = (v) => Math.round(v * 4) / 4;

function bbox(poly) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
}
// A decor polygon: the renderer reads `poly`; everything that only knows rects
// (extent, ambient derivers) reads the bounding box.
function decorPoly(poly, color, extra) {
  const b = bbox(poly);
  const r = { x: r2(b.x0), z: r2(b.z0), w: r2(b.x1 - b.x0), d: r2(b.z1 - b.z0), poly: poly.map(([x, z]) => [r2(x), r2(z)]), color };
  return extra ? Object.assign(r, extra) : r;
}
// Oriented rectangle: centre c, unit axis u (length along u), width across.
function orect(c, u, along, across) {
  const v = leftOf(u);
  const a = mul(u, along / 2), b = mul(v, across / 2);
  return [add(add(c, a), b), add(sub(c, a), b), sub(sub(c, a), b), sub(add(c, a), b)];
}
function disc(c, r, n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * 2 * Math.PI / n; out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]); }
  return out;
}
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Separating-axis test: convex polygon vs axis-aligned rect.
function convexHitsRect(poly, x0, z0, x1, z1) {
  const b = bbox(poly);
  if (b.x1 <= x0 || b.x0 >= x1 || b.z1 <= z0 || b.z0 >= z1) return false;
  const rect = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i]);
    const n = [-e[1], e[0]];
    let pmin = Infinity, pmax = -Infinity, rmin = Infinity, rmax = -Infinity;
    for (const p of poly) { const d = dot(p, n); pmin = Math.min(pmin, d); pmax = Math.max(pmax, d); }
    for (const p of rect) { const d = dot(p, n); rmin = Math.min(rmin, d); rmax = Math.max(rmax, d); }
    if (pmax <= rmin + 1e-9 || rmax <= pmin + 1e-9) return false;
  }
  return true;
}
// Is a polygon convex? (junction areas from OSM are not; they are tested by
// point sampling instead.)
function isConvex(p) {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

// Sutherland-Hodgman clip of a polygon to an axis-aligned rect.
function clipRect(poly, B) {
  let out = poly;
  const planes = [[0, B.minX, 1], [0, B.maxX, -1], [1, B.minZ, 1], [1, B.maxZ, -1]];
  for (const [ax, v, sg] of planes) {
    const inp = out; out = [];
    const inside = (p) => (p[ax] - v) * sg >= 0;
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ia = inside(a), ib = inside(b);
      if (ia !== ib) { const t = (v - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      if (ib) out.push(b);
    }
    if (!out.length) break;
  }
  return out;
}

// Scale an RGB colour's brightness.
function shade(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// Deterministic 0..1 from a position (replaces randomness: same map, same props).
function hash01(...vals) {
  let h = 2166136261;
  for (const v of vals) { h ^= Math.round(v * 100) | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

// Spatial index over carriageway polygons.
class PolyIndex {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); this.list = []; }
  add(poly, tag) {
    const b = bbox(poly), c = this.cell, e = { poly, tag, b, convex: isConvex(poly) };
    this.list.push(e);
    for (let i = Math.floor(b.x0 / c); i <= Math.floor(b.x1 / c); i++)
      for (let j = Math.floor(b.z0 / c); j <= Math.floor(b.z1 / c); j++) {
        const k = i * 100003 + j;
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(e);
      }
  }
  near(x0, z0, x1, z1) {
    const c = this.cell, seen = new Set(), out = [];
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++)
        for (const e of this.map.get(i * 100003 + j) || []) if (!seen.has(e)) { seen.add(e); out.push(e); }
    return out;
  }
  hitsRect(x0, z0, x1, z1) {
    for (const e of this.near(x0, z0, x1, z1)) {
      if (e.b.x1 <= x0 || e.b.x0 >= x1 || e.b.z1 <= z0 || e.b.z0 >= z1) continue;
      if (e.convex) { if (convexHitsRect(e.poly, x0, z0, x1, z1)) return true; continue; }
      // Non-convex: sample the rect on a 0.25 m lattice.
      for (let x = x0 + 0.125; x < x1; x += 0.25) for (let z = z0 + 0.125; z < z1; z += 0.25) if (pointInPoly(x, z, e.poly)) return true;
    }
    return false;
  }
  hasPoint(x, z) {
    for (const e of this.near(x, z, x, z)) if (pointInPoly(x, z, e.poly)) return true;
    return false;
  }
}

// --------------------------------------------------------------- roads
function roadWidth(r, P) {
  if (r.cls === 'pedestrian') return r.width ?? P.pedestrianWidth;
  const lanes = r.lanes ?? P.defaultLanes[r.cls] ?? 1;
  const lw = P.arterial.includes(r.cls) ? P.laneWidth.arterial : P.laneWidth.minor;
  return r.width ?? (lanes * lw + (lanes >= 2 ? 1 : 1.25));
}
// Tangent of a polyline at vertex i.
function tangentAt(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  return norm(sub(b, a));
}
// Nearest point on a polyline: {d, p, t (tangent), s (arc length)}.
function nearestOnLine(pts, x, z) {
  let best = { d: Infinity }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ab = sub(b, a), L = len(ab);
    if (L < 1e-6) continue;
    const t = Math.max(0, Math.min(1, dot(sub([x, z], a), ab) / (L * L)));
    const p = add(a, mul(ab, t)), d = Math.hypot(p[0] - x, p[1] - z);
    if (d < best.d) best = { d, p, t: mul(ab, 1 / L), s: acc + t * L, i };
    acc += L;
  }
  return best;
}
function polyLength(pts) { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += len(sub(pts[i + 1], pts[i])); return L; }
// Walk a polyline, yielding points every `step` metres: {p, t, s}.
function* walk(pts, step, start = 0) {
  let acc = 0, next = start;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = len(sub(b, a));
    if (L < 1e-6) continue;
    const t = mul(sub(b, a), 1 / L);
    while (next <= acc + L) { yield { p: add(a, mul(t, next - acc)), t, s: next }; next += step; }
    acc += L;
  }
}
function offsetLine(pts, off) {
  return pts.map((p, i) => add(p, mul(leftOf(tangentAt(pts, i)), off)));
}

// --------------------------------------------------------------- the plan
// data: city data module; P: profile; opts: { bounds, claims (CellClaims of
// buildings, to keep furniture off them), landmarksFirst }.
export function planStreets(data, P, opts = {}) {
  const B = opts.bounds ?? data.meta.bounds;
  const inBounds = (x, z, pad = 0) => x >= B.minX + pad && x <= B.maxX - pad && z >= B.minZ + pad && z <= B.maxZ - pad;
  const claims = opts.claims ?? null;
  const C = P.colors;
  const decor = { ground: [], planting: [], plaza: [], cobbles: [], sidewalks: [], roads: [], kerbs: [], laneMarkers: [], crosswalks: [], tactile: [] };
  const carriage = new PolyIndex();   // where vehicles drive: furniture never goes here
  const pedIndex = new PolyIndex();
  const junctionAreas = new PolyIndex();
  const roads = data.roads.map((r) => ({ ...r, W: roadWidth(r, P), carriage: r.cls !== 'pedestrian' }));
  for (const r of roads) if (r.carriage && P.minor.includes(r.cls) && P.edgeLine) r.strip = P.edgeLine.inset;
  const roadById = new Map(roads.map((r) => [r.id, r]));

  // Base pavement under the whole district: in central Shibuya everything that
  // is not road or building is paved pedestrian space.
  decor.ground.push({ x: B.minX, z: B.minZ, w: B.maxX - B.minX, d: B.maxZ - B.minZ, color: C.ground });

  // Plazas and planting from OSM areas.
  for (const a of data.areas) {
    if (a.kind === 'pedestrian') { decor.plaza.push(decorPoly(a.poly, C.plaza)); pedIndex.add(a.poly, a.id); }
    else if (a.kind === 'grass') decor.planting.push(decorPoly(a.poly, C.planting));
  }

  // Junction nodes: shared by two or more carriageway ways, or a way's
  // interior vertex used again (a T onto itself is not a thing here).
  const nodeRoads = new Map();
  for (const r of roads) if (r.carriage) for (const id of new Set(r.nodes)) {
    if (!nodeRoads.has(id)) nodeRoads.set(id, []);
    nodeRoads.get(id).push(r);
  }
  const nodePos = new Map();
  for (const r of roads) r.nodes.forEach((id, i) => nodePos.set(id, r.pts[i]));
  const junctions = [];
  for (const [id, rs] of nodeRoads) {
    if (rs.length < 2) continue;
    // A way that merely continues into its next segment (same name, two ways)
    // is not a junction unless a third arm meets it.
    const ends = rs.filter((r) => r.nodes[0] === id || r.nodes[r.nodes.length - 1] === id).length;
    const arms = rs.length * 2 - ends;
    if (arms < 3) continue;
    const p = nodePos.get(id);
    junctions.push({ id, x: p[0], z: p[1], roads: rs.map((r) => r.id), W: Math.max(...rs.map((r) => r.W)) });
  }
  // Scramble / junction areas mapped as polygons are carriageway too.
  for (const a of data.areas) if (a.kind === 'junction') { carriage.add(a.poly, 'junction:' + a.id); junctionAreas.add(a.poly, a.id); decor.roads.push(decorPoly(a.poly, C.road)); }

  // Carriageway and pedestrian-street polygons.
  for (const r of roads) {
    const col = r.carriage ? C.road : C.pedestrianStreet;
    const key = r.carriage ? 'roads' : 'cobbles';
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = len(sub(b, a));
      if (L < 0.05) continue;
      const u = norm(sub(b, a));
      const quad = orect(mul(add(a, b), 0.5), u, L, r.W);
      decor[key].push(decorPoly(quad, col));
      // On a side street the painted edge strips (路側帯) are pedestrian space,
      // not carriageway: poles stand in them.
      if (r.carriage) carriage.add(r.strip ? orect(mul(add(a, b), 0.5), u, L, r.W - 2 * r.strip) : quad, r.id); else pedIndex.add(quad, r.id);
    }
    // Round the joints so bends and junctions have no bites out of them.
    r.pts.forEach((p, i) => {
      const shared = (nodeRoads.get(r.nodes[i]) || []).length > 1;
      if (i === 0 || i === r.pts.length - 1) { if (!shared) return; }
      const d = disc(p, r.W / 2);
      decor[key].push(decorPoly(d, col));
      if (r.carriage) carriage.add(r.strip ? disc(p, r.W / 2 - r.strip) : d, r.id); else pedIndex.add(d, r.id);
    });
  }

  // Kerbs and sidewalk bands along carriageways (arterials carry a sidewalk
  // strip; side streets carry painted edge lines instead).
  const sidewalkPaths = [];
  for (const r of roads) {
    if (!r.carriage) continue;
    const sw = P.sidewalkWidth[r.cls] ?? 0;
    for (const side of [1, -1]) {
      const kerb = offsetLine(r.pts, side * (r.W / 2 + 0.1));
      for (let i = 0; i < kerb.length - 1; i++) {
        const a = kerb[i], b = kerb[i + 1], L = len(sub(b, a));
        if (L < 0.3) continue;
        const u = norm(sub(b, a)), c = mul(add(a, b), 0.5);
        if (carriage.hasPoint(c[0] + leftOf(u)[0] * side * 0.4, c[1] + leftOf(u)[1] * side * 0.4)) continue; // kerb that falls inside another road (junction)
        decor.kerbs.push(decorPoly(orect(c, u, L, 0.2), C.kerb));
        if (sw > 0) {
          const sc = add(c, mul(leftOf(u), side * (0.1 + sw / 2)));
          decor.sidewalks.push(decorPoly(orect(sc, u, L, sw), C.sidewalk));
        }
      }
      if (sw > 0) sidewalkPaths.push({ road: r.id, side, pts: offsetLine(r.pts, side * (r.W / 2 + 0.2 + sw / 2)) });
      else if (P.minor.includes(r.cls)) sidewalkPaths.push({ road: r.id, side, pts: offsetLine(r.pts, side * (r.W / 2 - P.edgeLine.inset / 2)) });
    }
  }

  // ------------------------------------------------ crosswalks
  const crosswalks = [];
  const isMarked = (m) => m !== 'no' && m !== 'surface';
  // Clip a walking segment to the carriageway it crosses.
  function clipToCarriage(a, b) {
    const u = norm(sub(b, a)), L = len(sub(b, a));
    let first = -1, last = -1;
    for (let s = 0; s <= L; s += 0.25) {
      const p = add(a, mul(u, s));
      if (carriage.hasPoint(p[0], p[1])) { if (first < 0) first = s; last = s; }
    }
    if (first < 0 || last - first < 2) return null;
    return [add(a, mul(u, Math.max(0, first - 0.25))), add(a, mul(u, Math.min(L, last + 0.25)))];
  }
  // Which carriageway (and its tangent) a crossing sits on.
  function roadAt(c) {
    let best = null;
    for (const r of roads) {
      if (!r.carriage) continue;
      const n = nearestOnLine(r.pts, c[0], c[1]);
      if (n.d <= r.W / 2 + 1 && (!best || n.d < best.n.d)) best = { r, n };
    }
    return best;
  }
  const pathCross = data.paths.filter((p) => p.kind === 'crossing');
  const usedNodes = new Set();
  // A crossing way is often split at the road centre-line node; walk it as
  // straight runs (vertices where it bends by under 25 degrees are dropped).
  const straightRuns = (pts) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const u0 = norm(sub(pts[i], out[out.length - 1])), u1 = norm(sub(pts[i + 1], pts[i]));
      if (dot(u0, u1) < Math.cos(25 * Math.PI / 180)) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  for (const p of pathCross) {
    const run = straightRuns(p.pts);
    for (let i = 0; i < run.length - 1; i++) {
      const seg = clipToCarriage(run[i], run[i + 1]);
      if (!seg) continue;
      const mid = mul(add(seg[0], seg[1]), 0.5);
      // tags from the nearest crossing node when the way is untagged
      let node = null, nd = Infinity;
      for (const pt of data.points) if (pt.kind === 'crossing') { const d = Math.hypot(pt.x - mid[0], pt.z - mid[1]); if (d < nd && d < len(sub(seg[1], seg[0])) / 2 + 2) { nd = d; node = pt; } }
      if (node) usedNodes.add(node.id);
      const control = p.control ?? node?.control ?? 'marked';
      const markings = p.markings ?? node?.markings ?? (control === 'signals' || control === 'marked' ? 'zebra' : 'no');
      crosswalks.push({ id: `p${p.id}:${i}`, a: seg[0], b: seg[1], control, markings, scramble: !!(p.scramble || node?.scramble), src: 'osm', node: node?.id });
    }
  }
  for (const pt of data.points) {
    if (pt.kind !== 'crossing' || usedNodes.has(pt.id)) continue;
    const at = roadAt([pt.x, pt.z]);
    if (!at) continue;
    const n = leftOf(at.n.t), h = at.r.W / 2 + 0.25;
    const a = add([pt.x, pt.z], mul(n, h)), b = sub([pt.x, pt.z], mul(n, h));
    crosswalks.push({ id: `n${pt.id}`, a, b, control: pt.control, markings: pt.markings ?? (pt.control === 'signals' ? 'zebra' : 'no'), scramble: !!pt.scramble, src: 'osm', node: pt.id });
  }
  // Nearest junction to a point.
  const nearJunction = (x, z, within = 25) => {
    let best = null, bd = within;
    for (const j of junctions) { const d = Math.hypot(j.x - x, j.z - z); if (d < bd) { bd = d; best = j; } }
    return best;
  };

  const stopLines = [];
  for (const cw of crosswalks) {
    const u = norm(sub(cw.b, cw.a)), L = len(sub(cw.b, cw.a));
    const w = cw.scramble ? P.crosswalk.scrambleWidth : P.crosswalk.width;
    cw.w = w; cw.len = L; cw.u = u;
    const mid = mul(add(cw.a, cw.b), 0.5);
    cw.mid = mid;
    const at = roadAt(mid);
    cw.road = at?.r.id ?? null;
    if (!isMarked(cw.markings)) { cw.stripes = 0; continue; }
    // Bars run across the walking direction and are stacked along it.
    const v = leftOf(u);
    let n = 0;
    const pitch = P.crosswalk.bar + P.crosswalk.gap;
    const count = Math.floor((L - 0.3) / pitch + 0.5);
    const lead = (L - (count * pitch - P.crosswalk.gap)) / 2;
    for (let k = 0; k < count; k++) {
      const s = lead + k * pitch + P.crosswalk.bar / 2;
      decor.crosswalks.push(decorPoly(orect(add(cw.a, mul(u, s)), v, w, P.crosswalk.bar), C.marking, { cw: cw.id }));
      n++;
    }
    cw.stripes = n;
    // Tactile warning blocks at both kerbs, across the full crossing width.
    for (const [end, dir] of [[cw.a, mul(u, -1)], [cw.b, u]]) {
      const c = add(end, mul(dir, 0.35 + P.tactileDepth / 2));
      if (carriage.hasPoint(c[0], c[1])) continue;
      decor.tactile.push(decorPoly(orect(c, v, w, P.tactileDepth), C.tactile, { cw: cw.id }));
    }
    // Stop lines: on the approach lanes, set back from the crossing.
    if (!at) continue;
    const r = at.r, t = at.n.t;
    // The junction this crossing guards: the nearest one on the same road.
    let J = null, jd = 30;
    for (const j of junctions) { const d = Math.hypot(j.x - mid[0], j.z - mid[1]); if (d < jd && j.roads.includes(r.id)) { jd = d; J = j; } }
    // A crossing cut diagonally through a junction (the scramble's diagonal)
    // has no approach of its own: the legs' stop lines already hold traffic.
    const diagonal = Math.abs(dot(cw.u, t)) > 0.5;
    let dirs;
    if (diagonal) dirs = [];
    else if (J) {
      // Only traffic heading INTO the junction stops here.
      const toJ = dot(sub([J.x, J.z], mid), t) >= 0 ? t : mul(t, -1);
      dirs = [toJ];
      if (r.oneway && dot(mul(t, r.oneway), toJ) < 0) dirs = []; // one-way leaving the junction
    } else dirs = r.oneway ? [mul(t, r.oneway)] : [t, mul(t, -1)];
    const lanes = r.lanes ?? P.defaultLanes[r.cls] ?? 1;
    const lw = lanes >= 2 ? P.stopLine.wide : P.stopLine.narrow;
    for (const d of dirs) {
      const back = w / 2 + P.stopLine.setback + lw / 2;
      const across = r.oneway ? r.W - 0.5 : r.W / 2 - 0.25;
      const off = r.oneway ? 0 : across / 2 + 0.1;
      const c = add(sub(at.n.p, mul(d, back)), mul(leftOf(d), off));
      if (junctionAreas.hasPoint(c[0], c[1]) || !carriage.hasPoint(c[0], c[1])) continue;
      const poly = orect(c, leftOf(d), across, lw);
      decor.laneMarkers.push(decorPoly(poly, C.marking, { isStopLine: true, cw: cw.id }));
      stopLines.push({ cw: cw.id, road: r.id, dir: d, c });
    }
    // Diamonds before crossings with no signals.
    if (P.diamond && cw.control !== 'signals') {
      for (const d of (r.oneway ? [mul(t, r.oneway)] : [t, mul(t, -1)])) {
        for (const dist of P.diamond.at) {
          const off = r.oneway ? 0 : r.W / 4;
          const c = add(sub(at.n.p, mul(d, dist)), mul(leftOf(d), off));
          if (!carriage.hasPoint(c[0], c[1])) continue;
          const hl = P.diamond.len / 2, hw = P.diamond.wid / 2, lv = leftOf(d);
          const pts = [add(c, mul(d, hl)), add(c, mul(lv, hw)), sub(c, mul(d, hl)), sub(c, mul(lv, hw))];
          for (let e = 0; e < 4; e++) {
            const p0 = pts[e], p1 = pts[(e + 1) % 4];
            decor.laneMarkers.push(decorPoly(orect(mul(add(p0, p1), 0.5), norm(sub(p1, p0)), len(sub(p1, p0)), P.diamond.line), C.marking, { diamond: cw.id }));
          }
        }
      }
    }
  }

  // Lane markings. Suppressed inside junctions and around crossings.
  const quiet = (p) => {
    if (junctionAreas.hasPoint(p[0], p[1])) return true;
    for (const j of junctions) if (Math.hypot(j.x - p[0], j.z - p[1]) < j.W / 2 + 4) return true;
    for (const cw of crosswalks) if (Math.hypot(cw.mid[0] - p[0], cw.mid[1] - p[1]) < cw.len / 2 + cw.w / 2 + P.stopLine.setback + 1) return true;
    return false;
  };
  const lanesSeam = [];
  for (const r of roads) {
    if (!r.carriage) continue;
    const lanes = r.lanes ?? P.defaultLanes[r.cls] ?? 1;
    const L = polyLength(r.pts);
    // Life seam: every lane with its travel direction. Left-hand traffic puts
    // forward lanes (way order) on the LEFT of the way direction.
    const lw = r.W / Math.max(1, lanes);
    if (r.oneway) {
      for (let k = 0; k < lanes; k++) {
        const off = (k + 0.5) * lw - r.W / 2;
        const pts = offsetLine(r.pts, off);
        lanesSeam.push({ road: r.id, dir: r.oneway, offset: r2(off), pts: r.oneway > 0 ? pts : pts.slice().reverse() });
      }
    } else {
      const fwd = Math.ceil(lanes / 2), bwd = Math.max(1, lanes - fwd);
      const half = r.W / 2;
      const sideSign = P.drive === 'left' ? 1 : -1;
      for (let k = 0; k < fwd; k++) { const off = sideSign * (k + 0.5) * (half / fwd); lanesSeam.push({ road: r.id, dir: 1, offset: r2(off), pts: offsetLine(r.pts, off) }); }
      for (let k = 0; k < bwd; k++) { const off = -sideSign * (k + 0.5) * (half / bwd); lanesSeam.push({ road: r.id, dir: -1, offset: r2(off), pts: offsetLine(r.pts, off).reverse() }); }
    }
    if (L < 8) continue;
    const mark = (off, color, width, dash, gap) => {
      const step = dash + gap;
      for (const { p, t } of walk(offsetLine(r.pts, off), step, gap / 2)) {
        const c = add(p, mul(t, dash / 2));
        if (quiet(c) || !carriage.hasPoint(c[0], c[1])) continue;
        decor.laneMarkers.push(decorPoly(orect(c, t, dash, width), color));
      }
    };
    if (!r.oneway && lanes >= P.centreLine.minLanes) mark(0, C.centre, P.centreLine.width, 2.5, 0);
    // Lane lines between same-direction lanes.
    if (lanes >= 2) {
      if (r.oneway) for (let k = 1; k < lanes; k++) mark(k * lw - r.W / 2, C.marking, P.laneLine.width, P.laneLine.dash, P.laneLine.gap);
      else {
        const fwd = Math.ceil(lanes / 2), half = r.W / 2;
        for (let k = 1; k < fwd; k++) { mark(k * half / fwd, C.marking, P.laneLine.width, P.laneLine.dash, P.laneLine.gap); mark(-k * half / fwd, C.marking, P.laneLine.width, P.laneLine.dash, P.laneLine.gap); }
      }
    }
    // Side streets: solid white edge lines marking the walking strip.
    if (P.minor.includes(r.cls) && P.edgeLine) {
      for (const side of [1, -1]) mark(side * (r.W / 2 - P.edgeLine.inset), C.marking, P.edgeLine.width, 2.5, 0);
    }
  }

  // ------------------------------------------------ props
  const props = [];
  // Nothing is planned outside the district: a pole beyond the edge would
  // stand off the ground plane.
  const add1 = (o) => { if (!inBounds(o.x, o.z, 1)) return null; props.push(o); return o; };
  // Where a prop may stand: on paving, off every carriageway, off buildings.
  const clearAt = (x, z, hw = 0.5) => inBounds(x, z, 1)
    && !carriage.hitsRect(x - hw, z - hw, x + hw, z + hw)
    && !(claims && claims.hitsRect(x - hw, z - hw, x + hw, z + hw));
  // Nudge a point out of the roadway along `dir` until clear.
  const settle = (p, dir, hw = 0.5, max = 4) => {
    for (let s = 0; s <= max; s += 0.25) { const c = add(p, mul(dir, s)); if (clearAt(c[0], c[1], hw)) return c; }
    return null;
  };

  // Signal poles: both ends of every signalled crossing, at the corner side.
  const poles = [];
  for (const cw of crosswalks) {
    if (cw.control !== 'signals') continue;
    const J = nearJunction(cw.mid[0], cw.mid[1], 35);
    const v = leftOf(cw.u);
    cw.poles = [];
    for (const [end, out] of [[cw.a, mul(cw.u, -1)], [cw.b, cw.u]]) {
      // Stand beside the crossing band, on the side facing the junction.
      let side = 1;
      if (J) side = dot(sub([J.x, J.z], end), v) >= 0 ? 1 : -1;
      let spot = null;
      for (const sd of [side, -side]) {
        const base = add(add(end, mul(out, 0.9)), mul(v, sd * (cw.w / 2 + 0.6)));
        spot = settle(base, out, 0.9, 3) || settle(base, out, 0.45, 3);
        if (spot) break;
      }
      // Corner kerbs are rarely square to the crossing: search a small ring.
      for (let r = 1; !spot && r <= 3.5; r += 0.5) {
        for (let k = 0; k < 16 && !spot; k++) {
          const a = k * Math.PI / 8, c = add(end, [Math.cos(a) * r, Math.sin(a) * r]);
          if (clearAt(c[0], c[1], 0.45)) spot = c;
        }
      }
      if (!spot) continue;
      // One pole per corner: reuse a pole already standing within 3 m.
      let pole = poles.find((p) => Math.hypot(p.x - spot[0], p.z - spot[1]) < 2);
      if (!pole) {
        pole = add1({ kind: 'signal_pole', src: 'rule', x: spot[0], z: spot[1], armDir: mul(out, -1), carriage: !!cw.road, crosswalks: [] });
        poles.push(pole);
      }
      pole.crosswalks.push(cw.id);
      cw.poles.push(pole);
    }
  }

  // Guard rails along arterial kerbs. Laid in the voxel grid's terms: each
  // kerb segment is marched along its MAJOR axis in whole panel lengths, so
  // consecutive sections butt end to end (a continuous rail, as in Tokyo) and
  // step sideways a row where the kerb drifts off the axis.
  const busStops = data.points.filter((p) => p.kind === 'bus_stop');
  const GR = P.guardRail;
  const railOk = (c) => inBounds(c[0], c[1], 1)
    && !junctions.some((j) => Math.hypot(j.x - c[0], j.z - c[1]) < j.W / 2 + GR.gapAtJunction)
    && !crosswalks.some((cw) => { const d = sub(c, cw.mid); return Math.abs(dot(d, leftOf(cw.u))) < cw.w / 2 + GR.gapAtCrossing && Math.abs(dot(d, cw.u)) < cw.len / 2 + 3; })
    && !busStops.some((bs) => Math.hypot(bs.x - c[0], bs.z - c[1]) < 8);
  for (const r of roads) {
    if (!r.carriage || !GR || !P.arterial.includes(r.cls)) continue;
    for (const side of [1, -1]) {
      const kerb = offsetLine(r.pts, side * (r.W / 2 + 0.7));
      for (let i = 0; i < kerb.length - 1; i++) {
        const a0 = kerb[i], a1 = kerb[i + 1], d = sub(a1, a0);
        const major = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1, minor = 1 - major;
        if (Math.abs(d[major]) < GR.panel) continue;
        const dirSign = Math.sign(d[major]);
        // panel starts on a whole-panel lattice along the major axis
        const s0 = Math.ceil(Math.min(a0[major], a1[major]) / GR.panel) * GR.panel;
        const s1 = Math.max(a0[major], a1[major]) - GR.panel;
        for (let m = s0; m <= s1 + 1e-9; m += GR.panel) {
          const mid = m + GR.panel / 2;
          const f = (mid - a0[major]) / d[major];
          const c = [0, 0];
          c[major] = mid; c[minor] = q(a0[minor] + f * d[minor]);
          if (!railOk(c)) continue;
          add1({ kind: 'guard_rail', src: 'rule', x: c[0], z: c[1], dir: major === 0 ? [dirSign, 0] : [0, dirSign], road: r.id });
        }
      }
    }
  }

  // Street lamps on arterials, alternating sides; utility poles on side streets.
  const utilityPoles = [];
  for (const r of roads) {
    if (!r.carriage) continue;
    const L = polyLength(r.pts);
    if (P.arterial.includes(r.cls) && P.lamp) {
      let k = 0;
      for (const { p, t } of walk(r.pts, P.lamp.spacing / 2, P.lamp.spacing / 4)) {
        const side = k++ % 2 ? 1 : -1;
        // Behind the guard-rail line, so the rail runs unbroken past the lamp.
        const c = add(p, mul(leftOf(t), side * (r.W / 2 + 1.25)));
        if (poles.some((s) => Math.hypot(s.x - c[0], s.z - c[1]) < 8)) continue;
        if (junctions.some((j) => Math.hypot(j.x - c[0], j.z - c[1]) < j.W / 2 + 3)) continue;
        add1({ kind: 'street_lamp', src: 'rule', x: c[0], z: c[1], armDir: mul(leftOf(t), -side), road: r.id });
      }
    } else if (P.minor.includes(r.cls) && P.utilityPole && L >= 12) {
      // One side of the street, the side of the way's left (consistent per way).
      let prev = null;
      for (const { p, t } of walk(r.pts, P.utilityPole.spacing, Math.min(8, L / 3))) {
        // In the edge strip, just inside the painted line.
        const c = add(p, mul(leftOf(t), r.W / 2 - 0.3));
        const o = add1({ kind: 'utility_pole', src: 'rule', x: c[0], z: c[1], dir: t, road: r.id });
        if (!o) { prev = null; continue; }
        utilityPoles.push(o);
        if (prev) o.wireFrom = prev;
        prev = o;
      }
    }
  }
  // Link each side-street run to the nearest pole of another run (the wires
  // cross at corners in real Tokyo streets).
  for (const o of utilityPoles) {
    if (o.wireFrom) continue;
    let best = null, bd = 32;
    for (const p of utilityPoles) { if (p === o || p.road === o.road) continue; const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < bd) { bd = d; best = p; } }
    if (best) o.wireFrom = best;
  }

  // OSM point furniture, placed where mapped (nudged off the carriageway if
  // the node sits on the kerb line).
  const pushOsm = (pt, kind, extra = {}) => {
    let c = [pt.x, pt.z];
    if (!clearAt(c[0], c[1], 0.6)) {
      const at = roadAt(c);
      const dir = at ? norm(sub(c, at.n.p)) : [0, 1];
      c = settle(c, len(dir) ? dir : [0, 1], 0.6, 5);
    }
    if (!c) return null;
    return add1({ kind, src: 'osm', x: c[0], z: c[1], osm: pt.id, ...extra });
  };
  for (const pt of data.points) {
    switch (pt.kind) {
      case 'post_box': pushOsm(pt, 'post_box'); break;
      case 'fire_hydrant':
        if (pt.type === 'underground' || !pt.type) {
          decor.laneMarkers.push(decorPoly(disc([pt.x, pt.z], 0.35, 6), C.hydrantLid, { hydrant: pt.id }));
          pushOsm(pt, 'hydrant_sign');
        } else pushOsm(pt, 'hydrant_box');
        break;
      case 'tree': pushOsm(pt, 'tree'); break;
      case 'bus_stop': pushOsm(pt, 'bus_stop', { shelter: !!pt.shelter, name: pt.name }); break;
      case 'bench': pushOsm(pt, 'bench'); break;
      case 'telephone': pushOsm(pt, 'telephone'); break;
      case 'clock': pushOsm(pt, 'clock'); break;
      case 'info_board': pushOsm(pt, 'info_board'); break;
      case 'waste_basket': pushOsm(pt, 'waste_bin'); break;
      case 'vending_machine': pushOsm(pt, 'vending', { count: 1 }); break;
      case 'bollard': pushOsm(pt, 'bollard'); break;
      case 'taxi_stand': {
        const o = pushOsm(pt, 'taxi_sign');
        const at = roadAt([pt.x, pt.z]) || (() => { let b = null; for (const r of roads) if (r.carriage) { const n = nearestOnLine(r.pts, pt.x, pt.z); if (n.d < 12 && (!b || n.d < b.n.d)) b = { r, n }; } return b; })();
        if (o && at) {
          // Waiting taxis queue in the kerbside (left) lane, nose to tail.
          const t = at.r.oneway ? mul(at.n.t, at.r.oneway) : (dot(leftOf(at.n.t), sub([pt.x, pt.z], at.n.p)) >= 0 ? at.n.t : mul(at.n.t, -1));
          const lane = add(at.n.p, mul(leftOf(t), at.r.W / 2 - 1.2));
          for (let k = 0; k < 3; k++) add1({ kind: 'taxi', src: 'rule', vehicle: true, x: lane[0] - t[0] * k * 6, z: lane[1] - t[1] * k * 6, dir: t });
        }
        break;
      }
      case 'station_entrance': break; // entrances in buildings; kiosk entrances come from the scene
      default: break;
    }
  }
  for (const l of data.lines) {
    if (l.kind === 'bollard') for (const { p } of walk(l.pts, 1.25, 0.3)) add1({ kind: 'bollard', src: 'osm', x: p[0], z: p[1] });
    if (l.kind === 'railing') for (const { p, t } of walk(l.pts, P.guardRail.pitch, 0.5)) add1({ kind: 'guard_rail', src: 'osm', x: p[0], z: p[1], dir: t });
  }
  // Bicycle parking areas: rows of racks along the area's long axis.
  for (const a of data.areas) {
    if (a.kind !== 'bicycle_parking') continue;
    const b = bbox(a.poly);
    // Rows with a 1.75 m aisle between them.
    for (let z = b.z0 + 1; z < b.z1 - 1; z += 3.5) for (let x = b.x0 + 0.5; x < b.x1 - 0.5; x += 0.75) {
      if (pointInPoly(x, z, a.poly)) add1({ kind: 'bicycle', src: 'osm', x, z, dir: [0, 1] });
    }
  }

  // Bollards (車止め) where a pedestrian plaza meets a carriageway without a
  // guard rail, stopping at crossing mouths; benches beside plaza trees;
  // subway-entrance kiosks where OSM maps an entrance on open pavement.
  for (const a of data.areas) {
    if (a.kind !== 'pedestrian') continue;
    const ring = [...a.poly, a.poly[0]];
    for (const { p, t } of walk(ring, 1.5, 0.75)) {
      const n = leftOf(t); // ring is CCW in (x, z): left is... test both sides
      const inward = pointInPoly(p[0] + n[0] * 0.8, p[1] + n[1] * 0.8, a.poly) ? n : mul(n, -1);
      const c = add(p, mul(inward, 0.5));
      const outside = sub(p, mul(inward, 0.8));
      if (!carriage.hasPoint(outside[0], outside[1])) continue;
      if (crosswalks.some((cw) => { const d = sub(c, cw.mid); return Math.abs(dot(d, leftOf(cw.u))) < cw.w / 2 + 1 && Math.abs(dot(d, cw.u)) < cw.len / 2 + 2.5; })) continue;
      if (props.some((o) => (o.kind === 'guard_rail' || o.kind === 'signal_pole') && Math.hypot(o.x - c[0], o.z - c[1]) < 1.6)) continue;
      add1({ kind: 'bollard', src: 'rule', x: c[0], z: c[1] });
    }
  }
  for (const o of [...props]) {
    if (o.kind !== 'tree' || !pedIndex.hasPoint(o.x, o.z)) continue;
    add1({ kind: 'bench', src: 'rule', x: o.x, z: o.z + 2.25 });
    add1({ kind: 'bench', src: 'rule', x: o.x, z: o.z - 2 });
  }
  for (const pt of data.points) {
    if (pt.kind !== 'station_entrance' || !clearAt(pt.x, pt.z, 1.8)) continue;
    const at = (() => { let b = null; for (const r of roads) { const n = nearestOnLine(r.pts, pt.x, pt.z); if (!b || n.d < b.d) b = n; } return b; })();
    add1({ kind: 'metro_entrance', src: 'osm', x: pt.x, z: pt.z, dir: at ? at.t : [1, 0], osm: pt.id });
  }

  // Vending machines: banks flush against building frontages along streets,
  // each with its recycling box. Candidates walk each road's sides; a bank
  // stands where a building face is within reach of the kerb.
  if (P.vending && claims) {
    for (const r of roads) {
      const art = P.arterial.includes(r.cls);
      const spacing = r.carriage ? (art ? P.vending.spacing.arterial : P.vending.spacing.minor) : P.vending.spacing.minor;
      const L = polyLength(r.pts);
      if (L < 10) continue;
      for (const side of [1, -1]) {
        for (const { p, t } of walk(r.pts, spacing, spacing * (0.3 + 0.4 * hash01(r.id, side)))) {
          const n = mul(leftOf(t), side);
          // March out from the kerb to the first building cell.
          let face = null;
          for (let s = r.W / 2 + 1; s < r.W / 2 + 7; s += 0.25) {
            const c = add(p, mul(n, s));
            if (claims.hitsRect(c[0] - 0.05, c[1] - 0.05, c[0] + 0.05, c[1] + 0.05)) { face = { s, c }; break; }
          }
          if (!face) continue;
          // Back of the bank against the facade (the face lies within the last
          // 0.25 m step of the march).
          const standAt = add(p, mul(n, face.s - 0.3));
          if (junctions.some((j) => Math.hypot(j.x - standAt[0], j.z - standAt[1]) < j.W / 2 + 4)) continue;
          const count = 2 + (hash01(standAt[0], standAt[1]) < 0.35 ? 1 : 0);
          add1({ kind: 'vending', src: 'rule', x: standAt[0], z: standAt[1], facing: mul(n, -1), along: t, count, bin: true });
        }
      }
    }
  }
  // A red post box at the station plaza (Japanese stations almost always have
  // one at the main exit); OSM records none inside Hachiko Square itself.
  if (opts.stationPostBox) add1({ kind: 'post_box', src: 'rule', x: opts.stationPostBox[0], z: opts.stationPostBox[1] });

  // Planting beds: a low granite edge round the bed and clipped azalea
  // (tsutsuji) hedging inside it — the standard Tokyo plaza planter.
  for (const a of data.areas) {
    if (a.kind !== 'grass') continue;
    const ring = [...a.poly, a.poly[0]];
    for (const { p, t } of walk(ring, 1.0, 0.5)) add1({ kind: 'planter_edge', src: 'rule', x: p[0], z: p[1], dir: t });
    const b = bbox(a.poly);
    // A continuous clipped hedge: 1 m plants touching, inside the edging.
    for (let x = Math.ceil(b.x0) + 1; x < b.x1 - 1; x += 1) for (let z = Math.ceil(b.z0) + 1; z < b.z1 - 1; z += 1) {
      if (!pointInPoly(x, z, a.poly) || !pointInPoly(x - 0.75, z - 0.75, a.poly) || !pointInPoly(x + 0.75, z + 0.75, a.poly) || !pointInPoly(x - 0.75, z + 0.75, a.poly) || !pointInPoly(x + 0.75, z - 0.75, a.poly)) continue;
      add1({ kind: 'shrub', src: 'rule', x, z });
    }
  }

  // Planted areas get their trees (one per ~25 m2, on a grid) when OSM has
  // none recorded inside them.
  for (const a of data.areas) {
    if (a.kind !== 'grass') continue;
    const b = bbox(a.poly);
    const area = Math.abs(a.poly.reduce((s, p, i) => { const n = a.poly[(i + 1) % a.poly.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0) / 2);
    if (area < 12) continue;
    if (data.points.some((pt) => pt.kind === 'tree' && pointInPoly(pt.x, pt.z, a.poly))) continue;
    for (let x = b.x0 + 2.5; x < b.x1 - 1.5; x += 5) for (let z = b.z0 + 2.5; z < b.z1 - 1.5; z += 5) {
      if (pointInPoly(x, z, a.poly) && pointInPoly(x - 1.2, z - 1.2, a.poly) && pointInPoly(x + 1.2, z + 1.2, a.poly)) add1({ kind: 'tree', src: 'rule', x, z });
    }
  }

  // ------------------------------------------------ life seam
  const signals = [];
  for (const j of junctions) {
    const cws = crosswalks.filter((c) => c.control === 'signals' && Math.hypot(c.mid[0] - j.x, c.mid[1] - j.z) < 35);
    if (!cws.length) continue;
    const scramble = cws.some((c) => c.scramble);
    const phases = scramble ? P.phases.scramble : P.phases.standard;
    signals.push({ id: j.id, x: r2(j.x), z: r2(j.z), roads: j.roads, crosswalks: cws.map((c) => c.id), poles: [...new Set(cws.flatMap((c) => c.poles || []))].map((p) => props.indexOf(p)), scramble, phases, cycle: phases.reduce((t, p) => t + p.s, 0), approx: true });
  }
  const perches = [];
  for (const o of props) {
    if (o.kind === 'guard_rail' && hash01(o.x, o.z) < 0.15) perches.push({ x: r2(o.x), y: P.guardRail.h, z: r2(o.z), on: 'guard_rail' });
    if (o.kind === 'signal_pole') perches.push({ x: r2(o.x), y: P.signal.armY + 0.25, z: r2(o.z), on: 'signal_arm' });
    if (o.kind === 'tree') perches.push({ x: r2(o.x), y: 4.5, z: r2(o.z), on: 'tree' });
  }
  const life = {
    note: 'Seam for the moving-life phase (pedestrians, pets, pigeons, traffic). Data only; nothing reads it yet.',
    drive: P.drive,
    walkPaths: [
      ...sidewalkPaths.map((s) => ({ kind: 'sidewalk', road: s.road, pts: s.pts.map(([x, z]) => [r2(x), r2(z)]) })),
      ...data.paths.filter((p) => p.kind !== 'crossing').map((p) => ({ kind: p.kind, osm: p.id, pts: p.pts })),
    ],
    crosswalks: crosswalks.map((c) => ({ id: c.id, a: c.a.map(r2), b: c.b.map(r2), width: c.w, control: c.control, scramble: c.scramble, road: c.road })),
    lanes: lanesSeam.map((l) => ({ ...l, pts: l.pts.map(([x, z]) => [r2(x), r2(z)]) })),
    stopLines: stopLines.map((s) => ({ crosswalk: s.cw, road: s.road, at: s.c.map(r2), dir: s.dir.map(r2) })),
    signals,
    perches,
    busStops: data.points.filter((p) => p.kind === 'bus_stop').map((p) => ({ x: p.x, z: p.z, name: p.name, osm: p.id })),
    taxiRanks: data.points.filter((p) => p.kind === 'taxi_stand').map((p) => ({ x: p.x, z: p.z, osm: p.id })),
    flocks: (opts.flockSpots || []).map((f) => ({ ...f })),
  };

  // Ground decor stops at the district edge: a road running on past the
  // playable area would be drawn over the void beyond the ground plane.
  for (const k of Object.keys(decor)) {
    if (k === 'ground') continue;
    decor[k] = decor[k].map((r) => {
      if (!r.poly) return r;
      const c = clipRect(r.poly, B);
      if (c.length < 3) return null;
      if (c.length === r.poly.length && c.every((p, i) => p[0] === r.poly[i][0] && p[1] === r.poly[i][1])) return r;
      const out = decorPoly(c, r.color);
      for (const f of Object.keys(r)) if (!(f in out)) out[f] = r[f];
      return out;
    }).filter(Boolean);
  }

  return { profile: P.id, decor, props, crosswalks, junctions, stopLines, carriage, roads, life, clearAt };
}

// --------------------------------------------------------------- prop kits
// Each returns boxes: [x0, y0, z0, sx, sy, sz, mat, color] in metres, min
// corner. Built around (x, z), facing the nearest axis of `dir`.
const axisOf = (d) => (Math.abs(d?.[0] ?? 0) >= Math.abs(d?.[1] ?? 1) ? [Math.sign(d[0]) || 1, 0] : [0, Math.sign(d[1]) || 1]);
function kit(o, P) {
  const x = q(o.x), z = q(o.z), B = [];
  const box = (x0, y0, z0, sx, sy, sz, mat, color) => B.push([q(x0), q(y0), q(z0), sx, sy, sz, mat, color]);
  switch (o.kind) {
    case 'signal_pole': {
      // Alternate poles come from a second paint batch (poles facing each
      // other across a road would otherwise read as one broken arm).
      const S = o.alt ? { ...P.signal, pole: shade(P.signal.pole, 0.93) } : P.signal;
      box(x, 0, z, 0.25, S.poleH, 0.25, 'steel', S.pole);
      // pedestrian head beside the pole on the side AWAY from the lanes
      // (horizontal support at its level): red standing figure over green.
      const back = axisOf(o.armDir ? [-o.armDir[0], -o.armDir[1]] : [1, 0]);
      const hx = x + back[0] * 0.25, hz = z + back[1] * 0.25;
      box(hx, 2.5, hz, 0.25, 0.75, 0.25, 'steel', S.housing);
      box(hx + back[0] * 0.25, 2.5, hz + back[1] * 0.25, 0.25, 0.25, 0.25, 'glass', S.walk);
      box(hx + back[0] * 0.25, 2.75, hz + back[1] * 0.25, 0.25, 0.25, 0.25, 'glass', S.wait);
      if (o.carriage) {
        const a = axisOf(o.armDir), L = S.armLen;
        // arm on top of the pole, reaching over the lanes; head at its tip
        if (a[0]) {
          const ax = a[0] > 0 ? x : x - L + 0.25;
          box(ax, S.poleH, z, L, 0.25, 0.25, 'steel', S.pole);
          const hx = a[0] > 0 ? x + L : x - L;
          box(hx, S.poleH - 0.25, z - 0.5, 0.25, 0.5, 1.25, 'steel', S.housing);
          S.lamps.forEach((c, i) => box(hx + (a[0] > 0 ? 0.25 : -0.25), S.poleH - 0.125 - 0.125, z - 0.5 + i * 0.5, 0.25, 0.25, 0.25, 'steel', c));
        } else {
          const az = a[1] > 0 ? z : z - L + 0.25;
          box(x, S.poleH, az, 0.25, 0.25, L, 'steel', S.pole);
          const hz = a[1] > 0 ? z + L : z - L;
          box(x - 0.5, S.poleH - 0.25, hz, 1.25, 0.5, 0.25, 'steel', S.housing);
          S.lamps.forEach((c, i) => box(x - 0.5 + i * 0.5, S.poleH - 0.25, hz + (a[1] > 0 ? 0.25 : -0.25), 0.25, 0.25, 0.25, 'steel', c));
        }
      }
      break;
    }
    case 'guard_rail': {
      const a = axisOf(o.dir), L = P.guardRail.panel;
      // Alternate sections carry a slightly different white (weathering; it
      // also keeps two sections one gap apart from reading as a missed step).
      const c = [P.guardRail.color, shade(P.guardRail.color, 0.95), shade(P.guardRail.color, 0.9)][((o.alt3 ?? 0) + (o.road ? o.road % 3 : 0)) % 3];
      if (a[0]) box(x - L / 2, 0, z, L, P.guardRail.h, 0.25, 'steel', c);
      else box(x, 0, z - L / 2, 0.25, P.guardRail.h, L, 'steel', c);
      break;
    }
    case 'street_lamp': {
      const a = axisOf(o.armDir);
      box(x, 0, z, 0.25, P.lamp.h, 0.25, 'steel', P.lamp.color);
      if (a[0]) { box(a[0] > 0 ? x + 0.25 : x - 1.25, P.lamp.h - 0.25, z, 1.25, 0.25, 0.25, 'steel', P.lamp.color); box(a[0] > 0 ? x + 1.5 : x - 1.5, P.lamp.h - 0.25, z, 0.25, 0.25, 0.25, 'steel', 0xfff4d6); }
      else { box(x, P.lamp.h - 0.25, a[1] > 0 ? z + 0.25 : z - 1.25, 0.25, 0.25, 1.25, 'steel', P.lamp.color); box(x, P.lamp.h - 0.25, a[1] > 0 ? z + 1.5 : z - 1.5, 0.25, 0.25, 0.25, 'steel', 0xfff4d6); }
      break;
    }
    case 'utility_pole': {
      const U = P.utilityPole;
      const px = x - 0.25, pz = z - 0.25; // centred on the planned spot
      box(px, 0, pz, 0.5, U.h, 0.5, 'concrete', U.color);
      const a = axisOf(o.dir);
      // cross-arm across the street direction, insulators implied by paint
      if (a[0]) box(px, U.h - 1, pz - 0.75, 0.5, 0.25, 0.75, 'steel', 0x5a5d61), box(px, U.h - 1, pz + 0.5, 0.5, 0.25, 0.75, 'steel', 0x5a5d61);
      else box(px - 0.75, U.h - 1, pz, 0.75, 0.25, 0.5, 'steel', 0x5a5d61), box(px + 0.5, U.h - 1, pz, 0.75, 0.25, 0.5, 'steel', 0x5a5d61);
      if (hash01(x, z) < 0.3) box(px + (a[0] ? 0 : 0.5), U.h - 3.5, pz + (a[0] ? 0.5 : 0), 0.5, 1, 0.5, 'steel', 0x8a8f94); // pole transformer
      break;
    }
    case 'vending': {
      const f = axisOf(o.facing), n = o.count ?? 2;
      const cols = P.vending.colors;
      // along the frontage: machines 1.0 wide, 0.75 deep, 1.75 tall
      for (let k = 0; k < n; k++) {
        const col = cols[Math.floor(hash01(o.x, o.z, k) * cols.length)];
        if (f[1]) box(x - n / 2 + k, 0, f[1] < 0 ? z - 0.75 : z, 1, 1.75, 0.75, 'steel', col);
        else box(f[0] < 0 ? x - 0.75 : x, 0, z - n / 2 + k, 0.75, 1.75, 1, 'steel', col);
      }
      if (o.bin) {
        if (f[1]) box(x + n / 2, 0, f[1] < 0 ? z - 0.5 : z, 0.5, 0.75, 0.5, 'steel', P.vending.bin);
        else box(f[0] < 0 ? x - 0.5 : x, 0, z + n / 2, 0.5, 0.75, 0.5, 'steel', P.vending.bin);
      }
      break;
    }
    case 'post_box': box(x, 0, z, 0.5, 1.0, 0.5, 'steel', P.postBox); box(x, 1.0, z, 0.5, 0.25, 0.5, 'steel', 0xa81c16); break;
    case 'hydrant_sign': box(x, 0, z, 0.25, 2.0, 0.25, 'steel', 0xd8d8d8); box(x + 0.25, 1.5, z, 0.25, 0.5, 0.25, 'steel', 0xd7261e); break;
    case 'hydrant_box': box(x, 0, z, 0.5, 0.75, 0.5, 'steel', 0xd7261e); break;
    case 'tree': box(x, 0, z, 0.5, 2.5, 0.5, 'wood', 0x6b4f35); box(x - 1, 2.5, z - 1, 2.5, 2, 2.5, 'leaf', 0x5f9444); break;
    case 'bus_stop': {
      box(x, 0, z, 0.25, 2.25, 0.25, 'steel', 0xc9ccd1);
      box(x - 0.125, 2.25, z - 0.125, 0.5, 0.5, 0.5, 'steel', 0xd62828);
      if (o.shelter) { box(x + 1, 0, z, 0.25, 2.5, 0.25, 'steel', 0x9aa0a6); box(x + 3.5, 0, z, 0.25, 2.5, 0.25, 'steel', 0x9aa0a6); box(x + 0.75, 2.5, z - 0.5, 3.25, 0.25, 1.25, 'steel', 0xd9dde2); }
      break;
    }
    case 'planter_edge': {
      const a = axisOf(o.dir);
      const c = o.alt ? 0x83878b : 0x8b8f93; // two granite batches
      if (a[0]) box(x - 0.5, 0, z - 0.25, 1, 0.5, 0.5, 'concrete', c);
      else box(x - 0.25, 0, z - 0.5, 0.5, 0.5, 1, 'concrete', c);
      break;
    }
    case 'shrub': box(x - 0.5, 0, z - 0.5, 1, 0.75, 1, 'leaf', [0x3f7d3a, 0x4a8a3f, 0x5d9a48][Math.floor(hash01(x, z) * 3)]); break;
    case 'metro_entrance': {
      // Tokyo Metro stair entrance: two side walls, a roof, the blue sign.
      const a = axisOf(o.dir);
      if (a[0]) {
        box(x - 1.5, 0, z - 1.25, 3, 2.25, 0.25, 'concrete', 0xc7ccd1); box(x - 1.5, 0, z + 1, 3, 2.25, 0.25, 'concrete', 0xc7ccd1);
        box(x - 1.5, 2.25, z - 1.25, 3, 0.25, 2.5, 'steel', 0x8a9098); box(x - 0.25, 2.5, z - 0.25, 0.5, 0.5, 0.5, 'steel', 0x0f7ac6);
      } else {
        box(x - 1.25, 0, z - 1.5, 0.25, 2.25, 3, 'concrete', 0xc7ccd1); box(x + 1, 0, z - 1.5, 0.25, 2.25, 3, 'concrete', 0xc7ccd1);
        box(x - 1.25, 2.25, z - 1.5, 2.5, 0.25, 3, 'steel', 0x8a9098); box(x - 0.25, 2.5, z - 0.25, 0.5, 0.5, 0.5, 'steel', 0x0f7ac6);
      }
      break;
    }
    case 'bench': box(x - 0.75, 0, z, 1.75, 0.5, 0.5, 'wood', 0x9c6b3e); break;
    case 'telephone': box(x, 0, z, 0.75, 2.25, 0.75, 'steel', 0x3f9d4e); break;
    case 'clock': box(x, 0, z, 0.25, 3.5, 0.25, 'steel', 0x5a5d61); box(x - 0.25, 3.5, z - 0.25, 0.75, 0.75, 0.75, 'steel', 0xf4f4ef); break;
    case 'info_board': box(x - 0.5, 0, z, 1.25, 2.0, 0.25, 'steel', 0x2c5f8a); break;
    case 'waste_bin': box(x, 0, z, 0.5, 0.75, 0.5, 'steel', 0x3a7bd5); break;
    case 'bollard': box(x, 0, z, 0.25, 0.75, 0.25, 'steel', 0x4a4e54); break;
    case 'bicycle': box(x, 0, z - 0.75, 0.25, 1.0, 1.75, 'steel', [0x2b2d42, 0xc0c5ce, 0x9d0208, 0x264653][Math.floor(hash01(x, z) * 4)]); break;
    case 'taxi_sign': box(x, 0, z, 0.25, 2.25, 0.25, 'steel', 0xc9ccd1); box(x - 0.125, 2.25, z - 0.125, 0.5, 0.5, 0.5, 'steel', 0xf2b705); break;
    case 'taxi': {
      const a = axisOf(o.dir);
      // Tokyo's fleet: JPN Taxi deep indigo, black, the green of the older sedans.
      const body = [0x1f2a44, 0x16181b, 0x2e6b3f][(o.alt3 ?? 0) % 3];
      if (a[0]) { box(x - 2.25, 0, z - 0.75, 4.5, 1.0, 1.75, 'steel', body); box(x - 1, 1.0, z - 0.625, 2.5, 0.75, 1.5, 'steel', 0x2c3e50); box(x + 0.125, 1.75, z - 0.125, 0.25, 0.25, 0.5, 'glass', 0xf2b705); }
      else { box(x - 0.75, 0, z - 2.25, 1.75, 1.0, 4.5, 'steel', body); box(x - 0.625, 1.0, z - 1, 1.5, 0.75, 2.5, 'steel', 0x2c3e50); box(x - 0.125, 1.75, z + 0.125, 0.5, 0.25, 0.25, 'glass', 0xf2b705); }
      break;
    }
    default: break;
  }
  return B.filter((b) => b[6] && b[3] > 0 && b[4] > 0 && b[5] > 0);
}

// Emit planned props as sim pieces. A prop is placed whole or not at all: any
// box that would overlap a building cell, another prop, or (below 3 m, for
// anything that is not a vehicle) a carriageway, drops the prop and records
// why in `skipped`. Returns { placed: [{ kind, src, x, z, first, last, boxes }], skipped }.
export function placeProps(sim, plan, P, { claims, extraBlocked = null } = {}) {
  const placed = [], skipped = [];
  const occ = new Map(); // 1 m column -> boxes (3D test)
  const hitsOcc = (b) => {
    const [x0, y0, z0, sx, sy, sz] = b;
    for (let i = Math.floor(x0); i < Math.ceil(x0 + sx); i++) for (let j = Math.floor(z0); j < Math.ceil(z0 + sz); j++) {
      for (const o of occ.get(i * 100003 + j) || []) {
        if (o[0] < x0 + sx && o[0] + o[3] > x0 && o[1] < y0 + sy && o[1] + o[4] > y0 && o[2] < z0 + sz && o[2] + o[5] > z0) return true;
      }
    }
    return false;
  };
  const addOcc = (b) => {
    const [x0, , z0, sx, , sz] = b;
    for (let i = Math.floor(x0); i < Math.ceil(x0 + sx); i++) for (let j = Math.floor(z0); j < Math.ceil(z0 + sz); j++) {
      const k = i * 100003 + j; if (!occ.has(k)) occ.set(k, []); occ.get(k).push(b);
    }
  };
  const seq = new Map();
  for (const o of plan.props) {
    const n = seq.get(o.kind) ?? 0; seq.set(o.kind, n + 1);
    o.alt = n % 2; o.alt3 = n % 3;
    let boxes = kit(o, P);
    if (!boxes.length) { skipped.push({ kind: o.kind, x: o.x, z: o.z, why: 'no kit' }); continue; }
    let why = null;
    for (const b of boxes) {
      const [x0, y0, z0, sx, sy, sz] = b;
      if (claims && y0 < 60 && claims.hitsRect(x0 + 0.01, z0 + 0.01, x0 + sx - 0.01, z0 + sz - 0.01)) { why = 'building'; break; }
      if (!o.vehicle && y0 < 3 && plan.carriage.hitsRect(x0 + 0.01, z0 + 0.01, x0 + sx - 0.01, z0 + sz - 0.01)) { why = 'roadway'; break; }
      if (hitsOcc(b)) { why = 'prop'; break; }
      if (extraBlocked && extraBlocked(b)) { why = 'reserved'; break; }
    }
    if (why && o.kind === 'bus_stop' && o.shelter) {
      // No room for the shelter: the stop keeps its pole (most Tokyo stops
      // are a bare pole anyway).
      o.shelter = false; boxes = kit(o, P); why = null;
      for (const b of boxes) if (hitsOcc(b) || (claims && claims.hitsRect(b[0] + 0.01, b[2] + 0.01, b[0] + b[3] - 0.01, b[2] + b[5] - 0.01)) || (b[1] < 3 && plan.carriage.hitsRect(b[0] + 0.01, b[2] + 0.01, b[0] + b[3] - 0.01, b[2] + b[5] - 0.01))) { why = 'crowded'; break; }
    }
    if (why) { skipped.push({ kind: o.kind, x: o.x, z: o.z, why }); continue; }
    const first = sim._blockId;
    for (const b of boxes) { sim._block(b[0], b[1], b[2], b[6], [b[3], b[4], b[5]], b[7]); addOcc(b); }
    o.placed = { first, last: sim._blockId - 1 };
    placed.push({ kind: o.kind, src: o.src, x: o.x, z: o.z, first, last: sim._blockId - 1, boxes, vehicle: !!o.vehicle });
  }
  // Overhead wires between placed utility poles (render-only; the physics
  // never sees a wire, and a wire whose pole is eaten stops being drawn).
  const wires = [];
  for (const o of plan.props) {
    if (o.kind !== 'utility_pole' || !o.placed || !o.wireFrom?.placed) continue;
    const top = P.utilityPole.h - 0.75;
    wires.push({ a: o.wireFrom.placed.first, b: o.placed.first, ya: top, yb: top, pa: [o.wireFrom.x, o.wireFrom.z], pb: [o.x, o.z] });
  }
  return { placed, skipped, wires, occ, hitsOcc };
}
