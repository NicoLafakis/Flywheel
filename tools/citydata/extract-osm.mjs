#!/usr/bin/env node
// OpenStreetMap -> city data module. The first step of the city-remake method
// (.wiki/features/lab-tokyo-remake/README.md): real footprints, heights, street
// centre-lines, crossings and street furniture, projected into the game's metre
// frame and written as a plain, checked-in ES module the scene imports. The game
// never touches the network; this tool runs once per district, by hand.
//
//   node tools/citydata/extract-osm.mjs tools/citydata/shibuya.config.mjs <raw-osm.json>
//
// The raw file is an OSM API 0.6 `map.json` download for the config's bbox:
//   curl "https://api.openstreetmap.org/api/0.6/map.json?bbox=<w>,<s>,<e>,<n>" -o raw.json
// (Overpass works too if it returns `elements` with nodes/ways/relations.)
//
// FRAME. x = metres east, z = metres south (the game's +z is screen-down on the
// map), then rotated by `rotDeg` so the district's dominant building grid lands
// on the axis-aligned voxel grid, then shifted by `shift`. Every piece in the sim
// is an axis-aligned box, so the rotation is what lets the hero buildings be clean
// rectangles instead of stair-steps. Relative placement is preserved exactly: the
// transform is rigid (no scaling), so every distance and angle between two mapped
// objects is the real one.
//
// Data (c) OpenStreetMap contributors, ODbL 1.0. The attribution travels in the
// generated module's `meta` and header; keep it there.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , cfgPath, rawPath] = process.argv;
if (!cfgPath || !rawPath) {
  console.error('usage: node tools/citydata/extract-osm.mjs <config.mjs> <raw-osm.json>');
  process.exit(2);
}
const cfg = (await import(pathToFileURL(resolve(cfgPath)).href)).default;
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));

// --- projection -------------------------------------------------------------
const { lat0, lon0, rotDeg = 0, shift = [0, 0] } = cfg.frame;
const M_LAT = 111132.9;
const M_LON = 111319.49 * Math.cos(lat0 * Math.PI / 180);
const cr = Math.cos(rotDeg * Math.PI / 180), sr = Math.sin(rotDeg * Math.PI / 180);
const r1 = (v) => Math.round(v * 10) / 10;
function project(lat, lon) {
  const x = (lon - lon0) * M_LON, z = -(lat - lat0) * M_LAT;
  return [r1(x * cr + z * sr + shift[0]), r1(-x * sr + z * cr + shift[1])];
}
const B = cfg.bounds; // final-frame clip rect {minX,maxX,minZ,maxZ}
const inB = ([x, z], pad = 0) => x >= B.minX - pad && x <= B.maxX + pad && z >= B.minZ - pad && z <= B.maxZ + pad;

// --- element index ------------------------------------------------------------
const nodes = new Map(), ways = new Map(), rels = [];
for (const e of raw.elements) {
  if (e.type === 'node') nodes.set(e.id, e);
  else if (e.type === 'way') ways.set(e.id, e);
  else if (e.type === 'relation') rels.push(e);
}
const wayPts = (w) => w.nodes.map((id) => nodes.get(id)).filter(Boolean).map((n) => project(n.lat, n.lon));
const wayNodeIds = (w) => w.nodes.filter((id) => nodes.has(id));

// --- geometry helpers ---------------------------------------------------------
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
const openRing = (p) => (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);
// Sutherland-Hodgman against the bounds rect.
function clipPoly(poly) {
  let out = poly;
  const edges = [
    (p) => p[0] >= B.minX, (p) => p[0] <= B.maxX, (p) => p[1] >= B.minZ, (p) => p[1] <= B.maxZ,
  ];
  const cut = [
    (a, b) => { const t = (B.minX - a[0]) / (b[0] - a[0]); return [B.minX, r1(a[1] + t * (b[1] - a[1]))]; },
    (a, b) => { const t = (B.maxX - a[0]) / (b[0] - a[0]); return [B.maxX, r1(a[1] + t * (b[1] - a[1]))]; },
    (a, b) => { const t = (B.minZ - a[1]) / (b[1] - a[1]); return [r1(a[0] + t * (b[0] - a[0])), B.minZ]; },
    (a, b) => { const t = (B.maxZ - a[1]) / (b[1] - a[1]); return [r1(a[0] + t * (b[0] - a[0])), B.maxZ]; },
  ];
  for (let k = 0; k < 4 && out.length; k++) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ia = edges[k](a), ib = edges[k](b);
      if (ib) { if (!ia) out.push(cut[k](a, b)); out.push(b); } else if (ia) out.push(cut[k](a, b));
    }
  }
  return out;
}
// Keep the parts of a polyline inside the (padded) bounds; returns 0..n runs.
function clipLine(pts, pad) {
  const runs = []; let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const inside = inB(pts[i], pad);
    const prevIn = i > 0 && inB(pts[i - 1], pad);
    if (inside) { if (!cur.length && i > 0) cur.push(pts[i - 1]); cur.push(pts[i]); }
    else if (prevIn) { cur.push(pts[i]); runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
// Join member ways of a multipolygon into closed rings (by shared end nodes).
function rings(members) {
  const segs = members.map((m) => ways.get(m.ref)).filter(Boolean).map((w) => wayNodeIds(w));
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 500) {
      const end = ring[ring.length - 1];
      const i = segs.findIndex((s) => s[0] === end || s[s.length - 1] === end);
      if (i < 0) break;
      const s = segs.splice(i, 1)[0];
      ring = ring.concat((s[0] === end ? s : s.slice().reverse()).slice(1));
    }
    const pts = ring.map((id) => nodes.get(id)).map((n) => project(n.lat, n.lon));
    if (pts.length >= 4) out.push(pts);
  }
  return out;
}

const num = (v) => { const f = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(f) ? f : undefined; };
const nameOf = (t) => t['name:en'] || t.name || undefined;
const excluded = new Set(cfg.exclude || []);

// --- buildings ------------------------------------------------------------------
const buildings = [];
function addBuilding(id, t, poly, kind) {
  if (excluded.has(id)) return;
  poly = openRing(poly);
  if (poly.length < 3) return;
  let c = clipPoly(poly);
  if (c.length < 3) return;
  if (area(c) < 0) c = c.reverse(); // counter-clockwise in (x, z)
  const a = Math.abs(area(c));
  if (a < (cfg.minBuildingArea ?? 12)) return;
  // A building mostly outside the district is left to its own district rather
  // than shipped as a sliver; one straddling the edge is kept and cut there.
  if (a < 0.5 * Math.abs(area(poly)) && !cfg.keepClipped?.includes(id)) return;
  const b = {
    id, kind, name: nameOf(t), use: t.building || t['building:part'],
    levels: num(t['building:levels']), height: num(t.height),
    minLevel: num(t['building:min_level']), minHeight: num(t.min_height),
    poly: c, clipped: c.length !== poly.length || c.some((p, i) => !poly[i] || p[0] !== poly[i][0] || p[1] !== poly[i][1]),
    area: Math.round(a),
  };
  const ov = cfg.overrides?.[id];
  if (ov) Object.assign(b, ov);
  for (const k of Object.keys(b)) if (b[k] === undefined) delete b[k];
  buildings.push(b);
}
for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.building && !t.indoor) addBuilding(w.id, t, wayPts(w), 'building');
  else if (t['building:part'] && cfg.includeParts?.includes(w.id)) addBuilding(w.id, t, wayPts(w), 'part');
}
for (const r of rels) {
  const t = r.tags || {};
  if (t.type === 'multipolygon' && t.building) {
    for (const ring of rings(r.members.filter((m) => m.role === 'outer' && m.type === 'way'))) addBuilding(r.id, t, ring, 'building');
  }
}

// --- ground areas: pedestrian plazas, grass, the scramble outline ---------------
const areas = [];
function addArea(id, kind, t, poly, holes = []) {
  poly = clipPoly(openRing(poly));
  if (poly.length < 3) return;
  const a = { id, kind, name: nameOf(t), poly };
  const hs = holes.map((h) => clipPoly(openRing(h))).filter((h) => h.length >= 3);
  if (hs.length) a.holes = hs;
  if (!a.name) delete a.name;
  areas.push(a);
}
for (const w of ways.values()) {
  const t = w.tags || {};
  const closed = w.nodes[0] === w.nodes[w.nodes.length - 1];
  if (!closed || t.indoor || t.layer && +t.layer < 0) continue;
  if (t.highway === 'pedestrian' && t.area === 'yes' && !(+t.layer > 0)) addArea(w.id, 'pedestrian', t, wayPts(w));
  else if (t.landuse === 'grass' || t.leisure === 'garden' || t.landuse === 'flowerbed') addArea(w.id, 'grass', t, wayPts(w));
  else if (t.junction === 'yes' && t.area === 'yes') addArea(w.id, 'junction', t, wayPts(w));
  else if (t.amenity === 'bicycle_parking') addArea(w.id, 'bicycle_parking', t, wayPts(w));
}
for (const r of rels) {
  const t = r.tags || {};
  if (t.type !== 'multipolygon' || t.indoor || t.tunnel) continue;
  if (t.highway === 'pedestrian') {
    const outer = rings(r.members.filter((m) => m.role === 'outer'));
    const inner = rings(r.members.filter((m) => m.role === 'inner'));
    for (const o of outer) addArea(r.id, 'pedestrian', t, o, inner);
  }
}

// --- streets ------------------------------------------------------------------------
const ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian']);
const roads = [], rail = [], paths = [];
const nodeUse = new Map(); // node id -> road ids through it (intersection finding)
for (const w of ways.values()) {
  const t = w.tags || {};
  const below = (t.layer && +t.layer < 0) || t.tunnel;
  if (t.highway && ROAD.has(t.highway) && t.area !== 'yes' && !below && !t.indoor) {
    const ids = wayNodeIds(w);
    const pts = ids.map((id) => project(nodes.get(id).lat, nodes.get(id).lon));
    if (!pts.some((p) => inB(p, 30))) continue;
    const r = {
      id: w.id, cls: t.highway, name: nameOf(t), lanes: num(t.lanes), width: num(t.width),
      oneway: t.oneway === 'yes' ? 1 : t.oneway === '-1' ? -1 : 0, sidewalk: t.sidewalk,
      service: t.service, layer: num(t.layer), bridge: t.bridge ? 1 : undefined, nodes: ids, pts,
    };
    for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
    roads.push(r);
    for (const id of ids) { if (!nodeUse.has(id)) nodeUse.set(id, []); nodeUse.get(id).push(w.id); }
  } else if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'steps') {
    if (below || t.indoor || (t.level && +t.level !== 0 && t.level !== '0')) continue;
    const pts = wayPts(w);
    if (!pts.some((p) => inB(p, 0))) continue;
    const p = { id: w.id, kind: t.footway || t.highway, name: nameOf(t), pts };
    if (t.footway === 'crossing') {
      p.control = /signals/.test(t.crossing || '') ? 'signals' : t.crossing === 'uncontrolled' || t.crossing === 'marked' ? 'marked' : t.crossing;
      p.markings = t['crossing:markings'];
      if (t['crossing:scramble'] === 'yes' || t.crossing_ref === 'pedestrian_scramble') p.scramble = 1;
    }
    for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
    paths.push(p);
  } else if (t.railway && ['rail', 'subway', 'light_rail'].includes(t.railway)) {
    const lvl = num(t.level), lay = num(t.layer);
    const elevated = t.bridge || (lvl !== undefined && lvl >= 1) || (lay !== undefined && lay >= 1);
    if (!elevated || t.tunnel === 'yes' || t.tunnel === 'building_passage' || (lay !== undefined && lay < 0)) continue;
    for (const run of clipLine(wayPts(w), 0)) {
      rail.push({ id: w.id, name: nameOf(t), kind: t.railway, level: lvl, layer: lay, bridge: t.bridge || undefined, pts: run });
    }
  }
}
for (const r of rail) for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];

// --- point features -----------------------------------------------------------------
const P = [];
const nodeRoads = (id) => nodeUse.get(id) || [];
for (const n of nodes.values()) {
  const t = n.tags; if (!t) continue;
  const [x, z] = project(n.lat, n.lon);
  if (!inB([x, z], 0)) continue;
  if (t.level && t.level !== '0' || t.indoor === 'yes' || t.layer && +t.layer < 0) continue;
  const push = (kind, extra = {}) => { const o = { kind, x, z, id: n.id, ...extra }; for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; P.push(o); };
  if (t.highway === 'crossing') {
    push('crossing', {
      control: t.crossing === 'traffic_signals' || /traffic_signals/.test(t.crossing || '') ? 'signals'
        : t.crossing === 'uncontrolled' || t.crossing === 'marked' ? 'marked' : t.crossing || 'unknown',
      markings: t['crossing:markings'] || (t.crossing_ref === 'zebra' ? 'zebra' : undefined),
      scramble: t['crossing:scramble'] === 'yes' ? 1 : undefined,
      tactile: t.tactile_paving === 'yes' ? 1 : t.tactile_paving === 'no' ? 0 : undefined,
      roads: nodeRoads(n.id),
    });
  } else if (t.highway === 'traffic_signals') push('signal', { dir: t['traffic_signals:direction'], roads: nodeRoads(n.id) });
  else if (t.highway === 'stop') push('stop_sign', { roads: nodeRoads(n.id) });
  else if (t.highway === 'bus_stop') push('bus_stop', { name: t.name, shelter: t.shelter === 'yes' ? 1 : undefined });
  else if (t.highway === 'street_lamp') push('street_lamp');
  else if (t.amenity === 'taxi') push('taxi_stand');
  else if (t.amenity === 'post_box') push('post_box');
  else if (t.amenity === 'waste_basket') push('waste_basket');
  else if (t.amenity === 'vending_machine') push('vending_machine', { vending: t.vending });
  else if (t.amenity === 'bench') push('bench');
  else if (t.amenity === 'bicycle_parking') push('bicycle_parking');
  else if (t.amenity === 'telephone') push('telephone');
  else if (t.amenity === 'clock') push('clock');
  else if (t.amenity === 'police') push('police', { name: t.name });
  else if (t.amenity === 'smoking_area') push('smoking_area');
  else if (t.emergency === 'fire_hydrant') push('fire_hydrant', { type: t['fire_hydrant:type'] });
  else if (t.barrier === 'bollard') push('bollard');
  else if (t.natural === 'tree') push('tree');
  else if (t.tourism === 'artwork') push('artwork', { name: nameOf(t), type: t.artwork_type, desc: t.description });
  else if (t.tourism === 'information' && t.information !== 'office') push('info_board', { info: t.information });
  else if (t.railway === 'subway_entrance' || t.railway === 'train_station_entrance') push('station_entrance', { name: nameOf(t) });
}
// Barriers mapped as ways (bollard rows, railings) are furniture lines.
const lines = [];
for (const w of ways.values()) {
  const t = w.tags || {};
  if (!t.barrier || t.indoor) continue;
  if (!['bollard', 'fence', 'guard_rail', 'railing', 'kerb'].includes(t.barrier)) continue;
  const pts = wayPts(w);
  if (!pts.some((p) => inB(p, 0))) continue;
  lines.push({ id: w.id, kind: t.barrier === 'fence' && t.fence_type === 'railing' ? 'railing' : t.barrier, pts });
}

buildings.sort((a, b) => a.id - b.id);
roads.sort((a, b) => a.id - b.id);
areas.sort((a, b) => a.id - b.id);
P.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);

const data = {
  meta: {
    name: cfg.name,
    source: 'OpenStreetMap (api.openstreetmap.org, API 0.6 map download)',
    license: 'ODbL 1.0',
    attribution: '(c) OpenStreetMap contributors',
    fetched: cfg.fetched,
    bboxLonLat: cfg.bbox,
    frame: { lat0, lon0, rotDeg, shift, note: 'x east / z south in metres, rotated by rotDeg then shifted' },
    bounds: B,
  },
  buildings, roads, areas, rail, paths, lines, points: P,
};
const counts = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'meta').map(([k, v]) => [k, v.length]));
const body = JSON.stringify(data)
  .replace(/\{"id"/g, '\n{"id"').replace(/\{"kind"/g, '\n{"kind"');
const out = `// GENERATED by tools/citydata/extract-osm.mjs from ${cfgPath.replace(/\\/g, '/')} -- do not hand-edit.
// Map data (c) OpenStreetMap contributors, available under the Open Database
// License (ODbL 1.0): https://www.openstreetmap.org/copyright
// District: ${cfg.name}. Fetched ${cfg.fetched}. Counts: ${JSON.stringify(counts)}
// Frame: ${JSON.stringify(data.meta.frame)}
const DATA = ${body};
export default DATA;
`;
writeFileSync(cfg.out, out);
console.log(`wrote ${cfg.out}`, counts);
