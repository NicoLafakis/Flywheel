import { generateBlockers, SOLO_SPAWN } from './voxelkit.js';
import { buildShell, CellClaims, slabBays } from './footprint-shell.js';
import { planStreets, placeProps, JP } from './streetkit.js';
import SHIBUYA from './citydata/shibuya.js';

// THE LAB: Tokyo remake, phase 1 — SHIBUYA CROSSING.
//
// The reference template for rebuilding every city (method: .wiki/features/
// lab-tokyo-remake/README.md). Nothing here is placed by eye:
//   * every building is a real OpenStreetMap footprint, at its mapped height or
//     storey count (js/citydata/shibuya.js, (c) OpenStreetMap contributors,
//     ODbL), built as a hollow mixed-geometry shell by js/footprint-shell.js;
//   * every road, crossing, stop line, signal pole, guard rail, lamp, utility
//     pole, vending bank, hydrant, bus stop and tree comes from js/streetkit.js
//     reading the same data — OSM where it records the object, Japanese
//     placement conventions (profile JP) where it does not;
//   * this file adds only what makes the named landmarks recognisable (the
//     screens, the 109 sign, Hachiko, the koban, the JR viaduct and a train).
//
// Frame: metres, x east / z south, rotated 12 deg so the crossing's street grid
// is axis-aligned, shifted so the fixed solo spawn (0, 16) is open paving in
// Hachiko Square (tools/citydata/shibuya.config.mjs). The scramble centre is at
// about (-21, -16), QFRONT north-west of it, MAGNET north-east, the Ekimae
// building south-west, Hachiko Square and the station to the south-east.
//
// SEAMS for later phases: other Tokyo districts are further data modules built
// by the same two kits into this same frame; `sim.lab.life` carries the walk
// paths, lanes, signal phases and perches the moving-life phase will read.

const D = SHIBUYA;

// OSM ids of the landmarks, built first so their footprints win any overlap.
const QFRONT = 136691386, MAGNET = 116806281, EKIMAE = 60739635, S109 = 55895868,
  SEIBU_A = 55896465, STATION = 904652357, CINE = 136587834;

// Paint. Central Shibuya facades: pale tile and precast, grey and blue glass,
// the odd brown tile block; shopfronts at street level.
const FACADE = [0xd9d4c7, 0xc3c6c9, 0xe8e6df, 0x7d8b96, 0xa39584, 0x5d6b78, 0xcbbd9f, 0xb7aca0];
const SHOP = [0xd9a441, 0xc0392b, 0x2e86ab, 0x3b3b3b, 0xe0e0e0, 0x8e44ad, 0x16a085, 0xd35400];
const hashId = (id) => { let h = id | 0; h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0); };

const LANDMARK_STYLE = {
  // QFRONT: blue-glass curtain wall; TSUTAYA / Starbucks at street level.
  [QFRONT]: { wall: 0x5c7c99, surface: 'mat_glass_curtain', ground: 0x1e6b52, roof: 0x6a6f75 },
  // MAGNET by SHIBUYA109: dark cladding carrying screens toward the scramble.
  [MAGNET]: { wall: 0x3a3d42, surface: 'mat_hk_grid', ground: 0x2a2c30, roof: 0x55595e },
  [EKIMAE]: { wall: 0xd8cfbd, surface: 'mat_hk_grid', ground: 0xe0b020, roof: 0x8f8d88 },
  // SHIBUYA109: the silver aluminium tower at the Dogenzaka fork.
  [S109]: { wall: 0xc8ccd1, surface: 'mat_metal_seam', ground: 0xb8bcc2, roof: 0x9aa0a6 },
  [SEIBU_A]: { wall: 0xebe7de, surface: 'mat_concrete_precast', ground: 0xdedad0, roof: 0x9a968e },
  [STATION]: { wall: 0x9aa3ab, surface: 'mat_hk_grid', ground: 0x7f878f, roof: 0x6d737a },
  [CINE]: { wall: 0xb9b3a7, surface: 'mat_hk_grid', ground: 0x8c2f39, roof: 0x8a8680 },
};
const FULL_FLOORS = new Set([QFRONT, MAGNET, EKIMAE, S109, SEIBU_A]);

function styleFor(b) {
  if (LANDMARK_STYLE[b.id]) return LANDMARK_STYLE[b.id];
  const h = hashId(b.id);
  return {
    wall: FACADE[h % FACADE.length],
    surface: (h >>> 8) % 3 === 0 ? 'mat_concrete_precast' : 'mat_hk_grid',
    ground: SHOP[(h >>> 12) % SHOP.length],
    roof: 0x8f8d88,
  };
}

// Is a metre rect entirely over a shell's own roof?
function onRoof(rec, x, z, w, d) {
  for (let j = Math.floor(z / 0.5); j < Math.ceil((z + d) / 0.5); j++)
    for (let i = Math.floor(x / 0.5); i < Math.ceil((x + w) / 0.5); i++) if (!rec.owned.has((i + 32768) * 65536 + j + 32768)) return false;
  return true;
}

// Metre bbox of a shell's owned cells.
function recBox(rec) {
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const k of rec.owned) {
    const i = Math.floor(k / 65536) - 32768, j = (k % 65536) - 32768;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  return { x0: i0 * 0.5, x1: (i1 + 1) * 0.5, z0: j0 * 0.5, z1: (j1 + 1) * 0.5 };
}

export function buildLab(sim) {
  const B = D.meta.bounds;
  sim.bounds = Math.max(-B.minX, B.maxX, -B.minZ, B.maxZ);
  sim.boundsRect = { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ };
  const claims = new CellClaims();
  // Scene-built pieces outside any building footprint (screens, signs,
  // viaducts, the train): 3D boxes that street furniture must not intersect.
  const extras = [];
  // Landmark dressing goes only where nothing else stands: off every other
  // building's footprint and clear of dressing already placed.
  const block = (x, y, z, mat, s, color, surface, own = null) => {
    const hit = extras.some((e) => e[0] < x + s[0] && e[0] + e[3] > x && e[1] < y + s[1] && e[1] + e[4] > y && e[2] < z + s[2] && e[2] + e[5] > z);
    const foreign = own === null && claims.hitsRect(x + 0.01, z + 0.01, x + s[0] - 0.01, z + s[2] - 0.01);
    if (hit || foreign) return false;
    sim._block(x, y, z, mat, s, color, surface);
    extras.push([x, y, z, s[0], s[1], s[2]]);
    return true;
  };

  const recs = new Map();
  // ------------------------------------------------------------ square
  // Built before the buildings so their cells are claimed first: the station
  // footprint in the data takes in its forecourt, and the koban stands on it.
  // Hachiko: bronze Akita on a granite plinth, where OSM puts the statue.
  const pts = (kind, name) => D.points.filter((p) => p.kind === kind && (!name || (p.name || '').includes(name)));
  const claimRect = (x0, z0, w, d, id) => {
    const cells = [];
    for (let j = Math.floor(z0 / 0.5); j < Math.ceil((z0 + d) / 0.5); j++) for (let i = Math.floor(x0 / 0.5); i < Math.ceil((x0 + w) / 0.5); i++) cells.push([i, j]);
    claims.claim(cells, id);
  };
  const hachiko = pts('artwork', 'Hachiko')[0];
  if (hachiko) {
    const x = Math.round(hachiko.x * 2) / 2, z = Math.round(hachiko.z * 2) / 2;
    claimRect(x - 1, z - 1, 2, 2, 'hachiko');
    sim._block(x - 1, 0, z - 1, 'concrete', [2, 1.25, 2], 0x5b5f63);          // plinth
    sim._block(x - 0.75, 1.25, z - 0.25, 'wood', [1.5, 0.75, 0.5], 0x6e5a3a); // body
    sim._block(x + 0.75, 1.5, z - 0.25, 'wood', [0.5, 0.75, 0.5], 0x6e5a3a);  // head
    sim._block(x - 0.75, 2.0, z - 0.25, 'wood', [0.25, 0.5, 0.25], 0x6e5a3a); // tail
  }
  // Other mapped artworks in the square: the globe sculpture and the G-Shock.
  for (const a of D.points.filter((p) => p.kind === 'artwork' && p !== hachiko && p.x > -40 && p.x < 40 && p.z > 0 && p.z < 60)) {
    const x = Math.round(a.x * 2) / 2 - 0.75, z = Math.round(a.z * 2) / 2 - 0.75;
    claimRect(x, z, 1.5, 1.5, 'art' + a.id);
    sim._block(x, 0, z, 'concrete', [1.5, 0.5, 1.5], 0x6c7075);
    sim._block(x + 0.25, 0.5, z + 0.25, 'steel', [1, 1, 1], a.desc?.includes('Shock') ? 0x1b1b1f : 0x3f8fd2);
  }
  // Shibuya Station koban (police box): mapped as a point, built as the small
  // two-storey box it is, with the red lamp over the door.
  const koban = pts('police')[0];
  if (koban) {
    const x = Math.round(koban.x) - 2, z = Math.round(koban.z) - 2;
    claimRect(x, z - 0.5, 4, 5, 'koban'); // incl. the lamp's strip in front
    const fake = { id: -1, name: 'Shibuya Station Koban', levels: 2, height: 6.5, poly: [[x, z], [x + 4, z], [x + 4, z + 4.5], [x, z + 4.5]] };
    const kc = new CellClaims();
    recs.set('koban', buildShell(sim, fake, { wall: 0xe9e4d8, surface: 'mat_concrete_precast', ground: 0xf4f1ea, roof: 0x4e5a52 }, { claims: kc }));
    sim._block(x + 1.75, 3.5, z - 0.25, 'steel', [0.5, 0.5, 0.25], 0xe23b2e);
  }

  // ------------------------------------------------------------ buildings
  const order = [...D.buildings].sort((a, b) =>
    (LANDMARK_STYLE[b.id] ? 1 : 0) - (LANDMARK_STYLE[a.id] ? 1 : 0) || b.area - a.area || a.id - b.id);
  for (const b of order) {
    const rec = buildShell(sim, b, styleFor(b), {
      claims,
      floorEvery: FULL_FLOORS.has(b.id) ? 1 : 2,
      defaults: { levels: 2 },
    });
    recs.set(b.id, rec);
  }

  // ------------------------------------------------------------ landmark detail
  // QFRONT: "Q's Eye", the screen filling the facade that faces the scramble.
  // LED panels 2 m wide, each hung proud of the actual facade line at its x
  // (the building's plan is not a rectangle), so every panel is carried by
  // the wall it touches.
  {
    const rec = recs.get(QFRONT), r = recBox(rec);
    for (let x = Math.round((r.x1 - 20) * 2) / 2, n = 0; x + 2 <= r.x1 - 0.5; x += 2, n++) {
      let face = -Infinity;
      for (const k of rec.owned) { const i = Math.floor(k / 65536) - 32768; if (i * 0.5 >= x && i * 0.5 < x + 2) face = Math.max(face, ((k % 65536) - 32768 + 1) * 0.5); }
      if (!Number.isFinite(face)) continue;
      for (let y = 7.5, k = 0; y + 5 <= rec.top - 6; y += 5, k++) block(x, y, face, 'steel', [2, 5, 0.25], (k + n) % 2 ? 0x7fd3ff : 0xf2f7ff);
    }
  }
  // MAGNET: screens stacked on the west face toward the crossing, and the
  // rooftop "MAG's PARK" viewing deck's glass balustrade.
  {
    const rec = recs.get(MAGNET), r = recBox(rec);
    for (let z = Math.round((r.z1 - 22) * 2) / 2, n = 0; z + 2 <= r.z1 - 1; z += 2, n++) {
      let face = Infinity;
      for (const k of rec.owned) { const j = (k % 65536) - 32768; if (j * 0.5 >= z && j * 0.5 < z + 2) face = Math.min(face, (Math.floor(k / 65536) - 32768) * 0.5); }
      if (!Number.isFinite(face)) continue;
      for (let y = 8, k = 0; y + 4 <= rec.top - 4; y += 4, k++) block(face - 0.25, y, z, 'steel', [0.25, 4, 2], (k + (n >> 1)) % 2 ? 0xff5c8a : 0xfff1a8);
    }
    for (let z = r.z0 + 1; z < r.z1 - 2; z += 3) if (onRoof(rec, r.x0 + 0.5, z, 0.25, 3)) block(r.x0 + 0.5, rec.top, z, 'steel', [0.25, 1.25, 3], 0xbfe6ff, undefined, true);
  }
  // Shibuya Ekimae Building: the rooftop billboard frames above the square.
  {
    const rec = recs.get(EKIMAE), r = recBox(rec);
    for (let x = r.x0 + 2, n = 0; x + 6 <= r.x1 - 2; x += 7, n++) {
      if (!onRoof(rec, x, r.z1 - 6, 6, 0.5)) continue;
      block(x, rec.top, r.z1 - 6, 'steel', [0.5, 3, 0.5], 0x3c4146, undefined, true);
      block(x + 5.5, rec.top, r.z1 - 6, 'steel', [0.5, 3, 0.5], 0x3c4146, undefined, true);
      block(x, rec.top + 3, r.z1 - 6, 'steel', [6, 4, 0.5], [0xe63946, 0xf1faee, 0x1d3557][n % 3], undefined, true);
    }
  }
  // SHIBUYA109: the "109" sign drum crowning the round tower at the west tip.
  {
    const rec = recs.get(S109), r = recBox(rec);
    // The westmost stretch of roof that can carry a 4 m drum.
    let spot = null;
    for (let x = Math.ceil(r.x0 * 2) / 2; x < r.x1 - 4 && !spot; x += 0.5) {
      for (let z = Math.ceil(r.z0 * 2) / 2; z < r.z1 - 4; z += 0.5) if (onRoof(rec, x, z, 4, 4)) { spot = [x, z]; break; }
    }
    if (spot) {
      block(spot[0], rec.top, spot[1], 'steel', [4, 5, 4], 0xe8e8e8, undefined, true);
      block(spot[0] - 0.25, rec.top + 1, spot[1] + 0.5, 'steel', [0.25, 3, 3], 0xd62839);
    }
  }
  // Seibu A: the blue-and-white "SEIBU" band under the parapet, south face.
  {
    const rec = recs.get(SEIBU_A), r = recBox(rec);
    for (let x = Math.round((r.x0 + 2) * 2) / 2; x + 2 <= r.x1 - 2; x += 2) {
      let face = -Infinity;
      for (const k of rec.owned) { const i = Math.floor(k / 65536) - 32768; if (i * 0.5 >= x && i * 0.5 < x + 2) face = Math.max(face, ((k % 65536) - 32768 + 1) * 0.5); }
      if (Number.isFinite(face)) block(x, rec.top - 4, face, 'steel', [2, 2.5, 0.25], 0x1b4f9c);
    }
  }

  // ------------------------------------------------------------ JR viaduct
  // Yamanote / Saikyo tracks at level 2, from the data's rail centre-lines:
  // a 7 m deck along the corridor on 1 m piers, one per deck bay, wherever no
  // building (the station) already stands on the cells.
  const DECK_Y = 6.5;
  {
    const band = [];
    for (const r of D.rail) {
      if (r.kind !== 'rail') continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let s = 0; s <= L; s += 0.5) {
          const cx = ax + ux * s, cz = az + uz * s;
          if (cx < B.minX + 2 || cx > B.maxX - 2 || cz < B.minZ + 2 || cz > B.maxZ - 2) continue;
          for (let o = -2.5; o <= 2.5; o += 0.5) band.push([Math.floor((cx - uz * o) / 0.5), Math.floor((cz + ux * o) / 0.5)]);
        }
      }
    }
    const uniq = new Map();
    for (const [i, j] of band) uniq.set(i * 100000 + j, [i, j]);
    // Snap the band onto 2 m cells so the deck is a few dozen plates, not
    // hundreds of slivers.
    const coarse = new Map();
    for (const [i, j] of uniq.values()) { const ci = Math.floor(i / 4), cj = Math.floor(j / 4); coarse.set(ci * 100000 + cj, [ci, cj]); }
    const cells = [];
    for (const [ci, cj] of coarse.values()) for (let a = 0; a < 4; a++) for (let b2 = 0; b2 < 4; b2++) cells.push([ci * 4 + a, cj * 4 + b2]);
    // The deck's plan is NOT claimed: streets, bike parking and shops carry on
    // underneath a Tokyo viaduct. Only the piers claim ground; the deck is a
    // 3D reservation that tall furniture must clear.
    const owned = new Set();
    for (const [i, j] of cells) if (!claims.has(i, j)) owned.add((i + 32768) * 65536 + j + 32768);
    const rec = { id: 'jr-viaduct', name: 'JR Yamanote Line viaduct', first: sim._blockId, pieces: 0, top: DECK_Y + 0.75 };
    for (const [i, j, w, h] of slabBays(owned, 11)) {
      const pw = Math.min(2, w), ph = Math.min(2, h);
      const ci = i + Math.floor((w - pw) / 2), cj = j + Math.floor((h - ph) / 2);
      const pier = [];
      for (let a = 0; a < pw; a++) for (let b2 = 0; b2 < ph; b2++) pier.push([ci + a, cj + b2]);
      claims.claim(pier, 'jr-viaduct');
      sim._block(ci * 0.5, 0, cj * 0.5, 'concrete', [pw * 0.5, DECK_Y, ph * 0.5], 0x8d9196); // pier
      sim._block(i * 0.5, DECK_Y, j * 0.5, 'concrete', [w * 0.5, 0.75, h * 0.5], 0x5b534b); // deck + ballast
      extras.push([i * 0.5, DECK_Y - 1.5, j * 0.5, w * 0.5, 2.25 + 4, h * 0.5]);
      rec.pieces += 2;
    }
    // A Yamanote E235 set standing on the northern approach: stainless body,
    // the line's yellow-green band, cars in 5 m bites following the track.
    const track = D.rail.find((r) => r.name === 'Yamanote Line' && r.pts.some(([, z]) => z < -60));
    if (track) {
      const onDeck = (x, z) => owned.has((Math.floor(x / 0.5) + 32768) * 65536 + Math.floor(z / 0.5) + 32768);
      for (let z = -95; z < -55; z += 5) {
        // x of the track centre-line at this z
        let x = null;
        for (let i = 0; i < track.pts.length - 1; i++) {
          const [ax, az] = track.pts[i], [bx, bz] = track.pts[i + 1];
          if ((az - z) * (bz - z) <= 0 && az !== bz) { x = ax + (bx - ax) * (z - az) / (bz - az); break; }
        }
        if (x === null) continue;
        const x0 = Math.round((x - 1.5) * 4) / 4;
        if (![[x0, z], [x0 + 3, z], [x0, z + 5], [x0 + 3, z + 5]].every(([px, pz]) => onDeck(px, pz - 0.01))) continue;
        sim._block(x0, DECK_Y + 0.75, z, 'steel', [3, 1.25, 5], 0xc9ced4);
        sim._block(x0, DECK_Y + 2, z, 'steel', [3, 0.5, 5], 0x8fc31f);
        sim._block(x0, DECK_Y + 2.5, z, 'steel', [3, 1, 5], 0xd5d9de);
        extras.push([x0, DECK_Y + 0.75, z, 3, 2.75, 5]);
        rec.pieces += 3;
      }
    }
    rec.last = sim._blockId - 1;
    recs.set('viaduct', rec);
  }

  // ------------------------------------------------------------ streets
  const plan = planStreets(D, JP, {
    claims,
    stationPostBox: [6, 6],
    flockSpots: hachiko ? [{ x: hachiko.x + 4, z: hachiko.z, r: 6, kind: 'pigeons', note: 'Hachiko Square' }] : [],
  });
  const keepSpawn = (b) => {
    const cx = Math.max(b[0], Math.min(SOLO_SPAWN.x, b[0] + b[3])), cz = Math.max(b[2], Math.min(SOLO_SPAWN.z, b[2] + b[5]));
    if (Math.hypot(cx - SOLO_SPAWN.x, cz - SOLO_SPAWN.z) < 2.5) return true;
    for (const e of extras) if (e[0] < b[0] + b[3] && e[0] + e[3] > b[0] && e[1] < b[1] + b[4] && e[1] + e[4] > b[1] && e[2] < b[2] + b[5] && e[2] + e[5] > b[2]) return true;
    return false;
  };
  const street = placeProps(sim, plan, JP, { claims, extraBlocked: keepSpawn });

  const { decor } = plan;
  sim.sceneDecor = decor;
  sim.sceneSurfaces = {};
  sim.sceneWires = street.wires;
  // The living-world seam (.wiki/plans/living-world.md): walk paths,
  // crossings, left-hand lanes, stop lines, signal cycles, perches, bus stops
  // and taxi ranks. Data only; nothing in the sim reads it yet.
  sim.sceneLife = plan.life;
  sim.lab = {
    meta: D.meta,
    profile: JP.id,
    buildings: [...recs.values()].map(({ owned, ringKeys, ...r }) => r),
    landmarks: { QFRONT, MAGNET, EKIMAE, S109, SEIBU_A, STATION },
    crosswalks: plan.crosswalks.map((c) => ({ id: c.id, a: c.a, b: c.b, w: c.w, control: c.control, markings: c.markings, scramble: c.scramble, road: c.road, stripes: c.stripes, node: c.node, poles: (c.poles || []).map((p) => [p.x, p.z]) })),
    stopLines: plan.stopLines,
    carriage: plan.carriage.list.map((e) => e.poly),
    props: street.placed,
    skipped: street.skipped,
    life: plan.life,
  };
  sim.cameraBlockers = generateBlockers(sim);
}
