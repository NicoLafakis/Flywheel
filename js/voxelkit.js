// Voxel city kit — the 5 object size classes + their canonical builders.
// Pure sim: no three.js, no Math.random (determinism — see rng.js).
//
// The class system is the content taxonomy for the voxel scenes: every city
// object is built at one of five scales, each with a canonical brick size.
// (Brick size is voxel resolution; class is object scale. Physics — span
// limits, glass never carrying load, slab tops — is identical across
// classes; scenes compose these builders and the validator checks the
// result: one block per fine cell, nothing floating.)
//
//   C1 PROP        0.25 m bricks, < 2 m   — lamps, hydrants, benches, carts
//   C2 VEHICLE     0.5 m bricks, 2-8 m    — cars, buses, trucks, trees
//   C3 SMALL_BLDG  1 m bricks, 3-10 m     — houses, shops, churches, terminals
//   C4 LARGE_BLDG  1 m bricks, 10-30 m    — apartments, hotels, industrial, offices
//   C5 MEGA        1-2 m bricks, 30 m+    — skyscrapers, monuments, forts
//
// The 2 m brick is the MEGA class's mass tool: bridge towers and anchorages,
// refinery blocks, arena shells, triumphal arches. Keep 2 m placements on a
// 2 m lattice (even-metre min corners) so they never share fine cells with the
// 1 m / 0.5 m detail around them, and remember the span maths — a 2 m→2 m
// horizontal hop costs 2 m, so a 2 m plate reaches exactly ONE hop from its
// support (concrete/steel maxSpan 3). Plates wider than 4 cells need columns.
//
// All builders take the sim as the first argument and place blocks through
// sim._block / sim._box. Colors are paint, never physics.

export const VOXEL_CLASSES = {
  PROP: { brick: 0.25, band: '< 2 m', desc: 'street furniture smaller than trees/cars' },
  VEHICLE: { brick: 0.5, band: '2-8 m', desc: 'trees, cars, buses, small boats, statues' },
  SMALL_BLDG: { brick: 1, band: '3-10 m', desc: 'houses, shops, churches, terminals' },
  LARGE_BLDG: { brick: 1, band: '10-30 m', desc: 'apartments, hotels, industrial, offices, banks' },
  MEGA: { brick: '1-2', band: '30 m+', desc: 'skyscrapers, monuments, forts, bridge towers, arenas' },
};

// --- C2 VEHICLE / flora ------------------------------------------------------

// 0.5 m sedan family: car, taxi, police. Rubber wheels, steel frame/pillars,
// panel body, glass cabin band.
export function sedan(sim, ox, oz, bodyColor, roofColor = bodyColor, axis = 'x') {
  // Keep the canonical mesh local to +x, then rotate its footprint in the
  // voxel grid for avenue traffic. This makes parked cars follow Manhattan's
  // street direction without introducing render-only transform state.
  const B = (x, y, z, m, c) => axis === 'z'
    ? sim._block(ox + z, y, oz + x, m, 0.5, c)
    : sim._block(ox + x, y, oz + z, m, 0.5, c);
  for (const [wx, wz] of [[0, 0], [0, 1.5], [4.5, 0], [4.5, 1.5]]) B(wx, 0, wz, 'rubber');
  for (let x = 0; x < 5; x += 0.5) {
    for (let z = 0; z < 2; z += 0.5) {
      const edge = x === 0 || x >= 4.5 || z === 0 || z >= 1.5;
      B(x, 0.5, z, edge ? 'steel' : 'panel', edge ? undefined : bodyColor);
    }
  }
  for (let x = 0; x < 1; x += 0.5) for (let z = 0; z < 2; z += 0.5) B(x, 1, z, 'panel', bodyColor); // hood
  for (let x = 4; x < 5; x += 0.5) for (let z = 0; z < 2; z += 0.5) B(x, 1, z, 'panel', bodyColor); // trunk
  for (const [px, pz] of [[2, 0], [2, 1.5], [3.5, 0], [3.5, 1.5]]) { B(px, 1, pz, 'steel'); B(px, 1.5, pz, 'steel'); }
  for (const gx of [2.5, 3]) {
    B(gx, 1, 0, 'glass'); B(gx, 1, 1.5, 'glass');
    B(gx, 1.5, 0, 'glass'); B(gx, 1.5, 1.5, 'glass');
  }
  for (let x = 2; x < 4; x += 0.5) for (let z = 0; z < 2; z += 0.5) B(x, 2, z, 'panel', roofColor); // roof
}

// 0.5 m city bus: 6 wheels, pillar-framed glass band.
export function bus(sim, ox, oz, bodyColor, axis = 'x') {
  const S = 0.5;
  const B = (x, y, z, m, c) => axis === 'z'
    ? sim._block(ox + z, y, oz + x, m, S, c)
    : sim._block(ox + x, y, oz + z, m, S, c);
  const pillars = new Set(['0,0', '0,1.5', '2.5,0', '2.5,1.5', '5,0', '5,1.5']);
  for (const [wx, wz] of [[0.5, 0], [0.5, 1.5], [2.5, 0], [2.5, 1.5], [4.5, 0], [4.5, 1.5]]) B(wx, 0, wz, 'rubber');
  for (let x = 0; x < 6; x += S) {
    for (let z = 0; z < 2; z += S) {
      const edge = x === 0 || x >= 5.5 || z === 0 || z >= 1.5;
      B(x, 0.5, z, edge ? 'steel' : 'panel');
    }
  }
  for (let x = 0; x < 6; x += S) {
    for (let z = 0; z < 2; z += S) {
      const edge = x === 0 || x >= 5.5 || z === 0 || z >= 1.5;
      if (!edge) continue;
      if (pillars.has(x + ',' + z)) { B(x, 1, z, 'steel'); B(x, 1.5, z, 'steel'); }
      else { B(x, 1, z, 'panel', bodyColor); B(x, 1.5, z, 'glass'); }
    }
  }
  for (let x = 0; x < 6; x += S) for (let z = 0; z < 2; z += S) B(x, 2, z, 'panel', bodyColor);
}

// 0.5 m box van / ambulance: cab with windshield + box body.
export function boxVan(sim, ox, oz, len, cabColor, boxColor, axis = 'x') {
  const S = 0.5;
  const B = (x, y, z, m, c) => axis === 'z'
    ? sim._block(ox + z, y, oz + x, m, S, c)
    : sim._block(ox + x, y, oz + z, m, S, c);
  for (const [wx, wz] of [[0.5, 0], [0.5, 1.5], [len - 1, 0], [len - 1, 1.5]]) B(wx, 0, wz, 'rubber');
  for (let x = 0; x < len; x += S) {
    for (let z = 0; z < 2; z += S) {
      const edge = x === 0 || x >= len - S || z === 0 || z >= 1.5;
      B(x, 0.5, z, edge ? 'steel' : 'panel');
    }
  }
  for (const y of [1, 1.5]) {
    for (let x = 0; x < len; x += S) {
      for (let z = 0; z < 2; z += S) {
        const edge = x === 0 || x >= len - S || z === 0 || z >= 1.5;
        if (!edge) continue;
        const cab = x < 2;
        if (cab && y === 1.5) B(x, y, z, x === 0 ? 'glass' : 'panel', cabColor);
        else B(x, y, z, 'panel', cab ? cabColor : boxColor);
      }
    }
  }
  for (let x = 0; x < len; x += S) for (let z = 0; z < 2; z += S) B(x, 2, z, 'panel', x < 2 ? cabColor : boxColor);
}

// 1 m heavy truck: fire engine (ladder) / garbage truck (high box).
export function bigTruck(sim, ox, oz, boxColor, ladder = false) {
  const B = (x, y, z, m, c) => sim._block(ox + x, y, oz + z, m, 1, c);
  for (const [wx, wz] of [[0, 0], [0, 1], [2, 0], [2, 1], [4, 0], [4, 1]]) B(wx, 0, wz, 'rubber');
  for (let x = 0; x < 6; x++) for (let z = 0; z < 2; z++) B(x, 1, z, 'steel');
  B(0, 2, 0, 'glass'); B(0, 2, 1, 'glass'); // windshield
  B(1, 2, 0, 'panel', boxColor); B(1, 2, 1, 'panel', boxColor); // cab
  for (let x = 2; x < 6; x++) for (let z = 0; z < 2; z++) { B(x, 2, z, 'panel', boxColor); B(x, 3, z, 'panel', boxColor); }
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) B(x, 3, z, 'panel', boxColor); // cab roof
  for (let x = 2; x < 6; x++) for (let z = 0; z < 2; z++) B(x, 4, z, ladder ? 'steel' : 'panel', ladder ? undefined : boxColor);
}

export function motorcycle(sim, ox, oz) {
  const B = (x, y, z, m, c) => sim._block(ox + x, y, oz + z, m, 0.5, c);
  B(0, 0, 0, 'rubber'); B(1, 0, 0, 'rubber');
  B(0, 0.5, 0, 'steel'); B(1, 0.5, 0, 'steel');
  B(1, 1, 0, 'panel', 0x1a1a1e); // tank/seat
}

// Street tree: wood trunk, leaf canopy — foliage clumps shear off light.
export function tree(sim, tx, tz) {
  for (let y = 0; y < 1.5; y += 0.5) sim._block(tx, y, tz, 'wood', 0.5);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const cy of [1.5, 2]) sim._block(tx + dx * 0.5, cy, tz + dz * 0.5, 'leaf', 0.5);
    }
  }
  sim._block(tx, 2.5, tz, 'leaf', 0.5);
}

// --- C1 PROP (0.25 m detail bricks) -------------------------------------------
// Local helpers every prop shares.
const F = (sim, x, y, z, m, c) => sim._block(x, y, z, m, 0.25, c);
const B25 = (sim, x0, y0, z0, nx, ny, nz, m, c) => sim._box(x0, y0, z0, nx, ny, nz, m, 0.25, c);

// Lamp post: pole, steel plate, glass head (glass rests on steel, never glass).
// `y` is the surface it stands on — 0 for the street, or a deck's top face.
export function lampPost(sim, lx, lz, y = 0) {
  B25(sim, lx - 0.125, y, lz - 0.125, 1, 5, 1, 'steel');
  B25(sim, lx - 0.25, y + 1.25, lz - 0.25, 2, 1, 2, 'steel');
  B25(sim, lx - 0.25, y + 1.5, lz - 0.25, 2, 1, 2, 'glass');
}

// Fire hydrant: body, dome, side caps.
export function hydrant(sim, x, z) {
  B25(sim, x, 0, z, 2, 3, 2, 'panel');
  F(sim, x + 0.125, 0.75, z + 0.125, 'panel');
  F(sim, x - 0.25, 0.375, z + 0.125, 'panel'); F(sim, x + 0.5, 0.375, z + 0.125, 'panel');
}

// NYC sidewalk waste bin: compact dark body, overhanging lid, and a steel
// side handle. It stays below the 2 m PROP class so it participates in the
// same deterministic support/overlap checks as the other curb furniture.
export function trashBin(sim, x, z, color = 0x3f4650) {
  B25(sim, x, 0, z, 2, 3, 2, 'panel', color);
  B25(sim, x - 0.125, 0.75, z - 0.125, 3, 1, 3, 'panel', 0x252a30);
  F(sim, x + 0.5, 0.25, z + 0.125, 'steel');
}

// Mailbox (USPS blue): legs, box body, cap.
export function mailbox(sim, x, z, color = 0x2a4f9a) {
  F(sim, x, 0, z + 0.125, 'steel'); F(sim, x + 0.5, 0, z + 0.125, 'steel');
  B25(sim, x, 0.25, z, 2, 3, 2, 'panel', color);
  B25(sim, x, 1, z, 2, 1, 2, 'panel', color);
}

// Park bench: steel legs, wood seat + back slats.
export function bench(sim, bx, bz, y = 0) {
  // The seat spans bx-0.25..bx+0.75; keep both legs under its ends.
  B25(sim, bx, y, bz + 0.125, 1, 2, 1, 'steel'); B25(sim, bx + 0.5, y, bz + 0.125, 1, 2, 1, 'steel');
  B25(sim, bx - 0.25, y + 0.5, bz, 4, 1, 2, 'wood');
  B25(sim, bx - 0.25, y + 0.75, bz, 4, 2, 1, 'wood');
}

// Traffic light: pole, head, R/Y/G lenses.
export function trafficLight(sim, x, z) {
  B25(sim, x, 0, z, 1, 6, 1, 'steel');
  B25(sim, x, 1.5, z, 1, 3, 1, 'panel', 0x1a1a1e);
  F(sim, x, 2, z + 0.25, 'glass', 0xd93025);
  F(sim, x, 1.75, z + 0.25, 'glass', 0xf7c948);
  F(sim, x, 1.5, z + 0.25, 'glass', 0x3ddc84);
}

// Newsstand: green body, overhanging roof.
export function newsstand(sim, x, z, color = 0x2e4d3a) {
  B25(sim, x, 0, z, 4, 3, 3, 'panel', color);
  B25(sim, x - 0.25, 0.75, z - 0.25, 5, 1, 4, 'panel', color);
}

// Hot dog cart: yellow body on wheels, red umbrella.
export function hotDogCart(sim, x, z) {
  F(sim, x, 0, z, 'rubber'); F(sim, x + 1, 0, z, 'rubber');
  B25(sim, x, 0.25, z, 4, 2, 2, 'panel', 0xf7c948);
  B25(sim, x + 0.75, 0.75, z + 0.125, 1, 4, 1, 'steel');
  B25(sim, x + 0.25, 1.75, z - 0.25, 3, 1, 3, 'panel', 0xc23b2e);
}

// Subway entrance: railing posts + rails, green globe lamp (steel plate under
// the globe — glass can't rest on glass).
export function subwayEntrance(sim, x, z) {
  for (const [sx, sz] of [[x, z], [x + 1.75, z], [x, z + 1], [x + 1.75, z + 1]]) B25(sim, sx, 0, sz, 1, 3, 1, 'steel');
  B25(sim, x, 0.75, z, 1, 1, 5, 'steel'); B25(sim, x + 1.75, 0.75, z, 1, 1, 5, 'steel');
  B25(sim, x, 0, z - 0.5, 1, 3, 1, 'steel');
  B25(sim, x - 0.25, 0.75, z - 0.75, 2, 1, 2, 'steel');
  B25(sim, x - 0.25, 1, z - 0.75, 2, 1, 2, 'glass', 0x3ddc84);
}

// --- C3–C5 buildings ------------------------------------------------------------

// Perimeter-wall tower tier. kind 'curtain': steel columns every 2 m with
// glass between (each pane flanked by steel at its level). kind 'masonry':
// load-bearing walls with 1-in-3 window panes. Slabs every `slabEvery`
// layers are full concrete plates; an interior column grid (footprints
// ≥ 9 m) keeps every slab cell within concrete's 3 m span of a column.
// Used for C3 walk-ups through C5 supertalls (tier stacking).
export function tower(sim, ox, oz, w, d, y0, y1, kind, wallMat, color) {
  const slabEvery = kind === 'curtain' ? 4 : 3;
  // Interior column grid: every slab cell must reach an edge or a column in
  // ≤ 3 m of hops (concrete maxSpan). Quarter points on axes ≥ 9 m, middle
  // row on the short axis; footprints ≥ 8 m need columns — an 8×8 masonry
  // slab's center cell sits 4 hops out once window panes punch the vertical
  // support field (glass period 3), so "no columns below 9" falls at spawn.
  const icx = w >= 9 ? [Math.floor(w / 3), w - 1 - Math.floor(w / 3)] : [Math.floor((w - 1) / 2)];
  const icz = d >= 9 ? [Math.floor(d / 3), d - 1 - Math.floor(d / 3)] : [Math.floor((d - 1) / 2)];
  const needCols = w >= 8 || d >= 8;
  for (let y = y0; y < y1; y++) {
    const slab = (y - y0) % slabEvery === 0;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (slab) { sim._block(ox + x, y, oz + z, 'concrete', 1); continue; }
        if (!edge) {
          if (needCols && icx.includes(x) && icz.includes(z)) sim._block(ox + x, y, oz + z, 'steel', 1);
          continue;
        }
        const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
        if (corner) { sim._block(ox + x, y, oz + z, 'steel', 1); continue; }
        const along = (z === 0 || z === d - 1) ? x : z;
        if (kind === 'curtain') {
          // columns every 2 m along each face; spandrel band every 4th layer
          if (along % 2 === 0) sim._block(ox + x, y, oz + z, 'steel', 1);
          else if ((y - y0) % 4 === 3) sim._block(ox + x, y, oz + z, 'panel', 1, 0x2a3440);
          else sim._block(ox + x, y, oz + z, 'glass', 1);
        } else {
          const win = along % 3 === 1 && y % 3 !== 0;
          sim._block(ox + x, y, oz + z, win ? 'glass' : wallMat, 1, win ? undefined : color);
        }
      }
    }
  }
}

// --- C5 MEGA: parametric civic + industrial masses ----------------------------
// Every large mass a scene places goes through one of these rather than a hand
// rolled loop in the scene file. Each builder takes origin, extents and
// materials, and funnels ALL of its own geometry through ONE `put()` call site.
// That single site is the whole point: when the primitive changes — a
// non-uniform slab instead of a cube, say — it is a one-line edit per builder
// instead of an audit of every nested loop in every scene. Builders that
// compose another named builder (megaShell, tower) inherit that builder's own
// single site; nothing here reaches sim._block from more than one place.
//
// `fill` reproduces sim._box's iteration order exactly (x outer, then y, then
// z) so a mass moved into the kit emits its cells in the order it always did.

// Hollow 2 m shell with the interior column grid a 2 m roof plate needs. One
// 2 m hop is 2 m and two are 4 m — past concrete's and steel's 3 m span — so
// every interior roof cell must be a column or orthogonally touch one.
// `(ix + 2*iz) % 5` is the perfect dominating pattern for that: one column in
// five, every remaining cell adjacent to exactly one.
export function megaShell(sim, ox, oy, oz, nx, ny, nz, mat, color, opts = {}) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const { roof = true, roofMat = 'concrete', roofColor = color, skip = null } = opts;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        if (skip && skip(ix, iy, iz)) continue;
        const edge = ix === 0 || ix === nx - 1 || iz === 0 || iz === nz - 1;
        if (!edge && (ix + 2 * iz) % 5 !== 0) continue;
        put(ox + ix * 2, oy + iy * 2, oz + iz * 2, mat, 2, color);
      }
    }
  }
  if (roof) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) put(ox + ix * 2, oy + ny * 2, oz + iz * 2, roofMat, 2, roofColor);
    }
  }
}

// Suspension-bridge monument: 2 m tower, 2 m anchorage, a piered deck through
// the tower's arches, and 0.25 m cables. The cables are the interesting part —
// support never flows downward in this sim, so a hanging catenary is impossible.
// Both cable runs are therefore held UP: the backstay climbs monotonically from
// the anchorage, and the main span is carried by 0.25 m suspenders standing on
// the deck. That is also how the real thing works.
export function suspensionBridge(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    x0, towerZ, towerH, anchorZ0, anchorZ1, deckZ0, deckY,
    stone = 0x8d8377, cable = 0x5d6672, deckColor = 0x7f858c, tw = 8,
  } = o;
  const archIX = new Set([1, 2, 5, 6]);
  const deckX = [x0 + 2, x0 + 10];              // the two roadways, one per arch
  // tower: solid to deck level, twin gothic arches above the roadway
  for (let iy = 0; iy < towerH; iy++) {
    for (let ix = 0; ix < tw; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const y = iy * 2;
        if (y >= deckY && y < deckY + 12 && archIX.has(ix)) continue;
        put(x0 + ix * 2, y, towerZ + iz * 2, 'concrete', 2, stone);
      }
    }
  }
  // corner finials — only the OUTER corners, so the cable saddles at x0+2 and
  // x0+13.75 stay clear of a 2 m cell
  for (const ix of [0, 7]) {
    for (let iz = 0; iz < 2; iz++) put(x0 + ix * 2, towerH * 2, towerZ + iz * 2, 'concrete', 2, 0x9a9084);
  }
  // anchorage: hollow 2 m masonry block, capped one layer below the deck so the
  // roadway lands on a full plate rather than a wall ring
  const an = Math.round((anchorZ1 - anchorZ0) / 2);
  megaShell(sim, x0 + 2, 0, anchorZ0, 6, Math.round(deckY / 2) - 1, an, 'concrete', stone, { roofColor: stone });
  // river piers: spaced so no deck cell is ever more than concrete's 3 m from a
  // pier top or from the tower's own solid base
  for (const pz of [towerZ + 6, towerZ - 4, deckZ0]) {
    for (const px of [x0 + 2, x0 + 12]) {
      for (let y = 0; y < deckY; y += 2) put(px, y, pz, 'concrete', 2, 0x6f757c);
    }
  }
  // deck: two 4 m roadways threading the arches, with a kerb rail each side
  for (const dx of deckX) {
    for (let x = 0; x < 4; x++) {
      for (let z = deckZ0; z < anchorZ1; z++) put(dx + x, deckY, z, 'concrete', 1, deckColor);
    }
    for (let z = deckZ0; z < anchorZ1; z += 2) {
      for (const rx of [dx + 0.5, dx + 3.25]) put(rx, deckY + 1, z, 'steel', 0.25, 0x39414d);
    }
  }
  // Cables (0.25 m). Support never flows downward in this sim, so a hanging
  // catenary is impossible: the backstay CLIMBS from the anchorage to the
  // tower, the saddle rests on the tower top, and the main span is stood up on
  // suspenders rooted in the deck. Both runs stop at the tower faces — a cable
  // routed through the tower's mid-plane would sit inside its 2 m cells.
  const top = towerH * 2, zS = towerZ, zN = towerZ + 4, base = deckY + 1;
  const cableY = { back: (z) => {
    const u = (anchorZ1 - 2 - z) / (anchorZ1 - 2 - zN);
    return Math.round((base + (top - base) * u * u) * 4) / 4;
  }, main: (z) => {
    const u = (zS - z) / (zS - deckZ0);
    return Math.round((top - (top - deckY - 8) * u * u) * 4) / 4;
  } };
  // A smooth catenary cannot stand up here: every cell on a descending stretch
  // would be orphaned. The cable is built instead as a stepped run — flat
  // segments each carried by the suspender beneath it, joined by vertical risers
  // at the segment boundaries. Stops must be ordered from the low end to the
  // high one so every riser climbs.
  const mid = (a, b) => Math.round(((a + b) / 2) * 4) / 4;   // joins stay on the fine grid
  const cableRun = (cx, stops) => {
    for (let i = 0; i < stops.length; i++) {
      const { z, h, susp } = stops[i];
      if (susp) for (let y = base; y < h; y += 0.25) put(cx, y, z, 'steel', 0.25, cable);
      const zA = i > 0 ? mid(z, stops[i - 1].z) : z;
      const zB = i < stops.length - 1 ? mid(z, stops[i + 1].z) : z;
      for (let zz = Math.min(zA, zB); zz <= Math.max(zA, zB); zz += 0.25) {
        put(cx, h, zz, 'steel', 0.25, cable);
      }
      if (i < stops.length - 1) {
        for (let y = h + 0.25; y < stops[i + 1].h; y += 0.25) put(cx, y, zB, 'steel', 0.25, cable);
      }
    }
  };
  const mainStops = [];
  // 4 m between suspenders puts every flat segment's far end 2 m from its riser,
  // inside steel's 3 m span, at two thirds the cell cost of a 3 m spacing.
  for (let z = deckZ0; z < zS - 1; z += 4) mainStops.push({ z, h: cableY.main(z), susp: true });
  mainStops.push({ z: zS - 0.25, h: top, susp: false });        // meets the saddle
  const backStops = [{ z: anchorZ1 - 2, h: base, susp: false }]; // lands on the deck plate
  for (let z = anchorZ1 - 4; z > zN; z -= 4) backStops.push({ z, h: cableY.back(z), susp: true });
  backStops.push({ z: zN, h: top, susp: false });
  for (const cx of [x0 + 2, x0 + 13.75]) {
    for (let z = zS; z < zN; z += 0.25) put(cx, top, z, 'steel', 0.25, cable); // saddle
    cableRun(cx, mainStops);
    cableRun(cx, backStops);
  }
}

// Arena shell: a rounded-rectangle ring of 2 m panels, stepped in height bands,
// with an optional notch cut low and a cantilevered oculus canopy over it. WIDE
// rather than tall on purpose — footprint is free to the chase camera (which
// only ramps on maxBlockerH) while height is expensive, so a stadium is the
// cheapest way to put a genuinely monumental object in frame.
//
// `rx`/`rz` are half-extents in 2 m CELLS, so the built footprint is
// (2*rx+1)*2 by (2*rz+1)*2 metres. Heights are in 2 m layers.
// Returns the ground rect it wants under it and the outer face of its +z wall,
// so the caller can lay decor and hang a sign without re-deriving either.
export function stadiumBowl(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    cx, cz, rx, rz, mat = 'panel', colors = [0x74412a, 0x8a4f33],
    bands = { notch: 2, corner: 4, flank: 5, crown: 6 }, crownIX = 2,
    notch = (ix, iz) => ix < -3 && iz < 0,
    canopy = true, canopyMat = 'steel', canopyColor = 0x3f4750, canopyY = 4,
    plazaPad = 4, plazaColor = 0x66625b,
  } = o;
  // clipped corners: the plan is a rectangle with its four corner cells cut
  const inPlan = (ix, iz) => Math.abs(ix) <= rx && Math.abs(iz) <= rz
    && !(Math.abs(ix) > rx - 2 && Math.abs(iz) > rz - 1);
  const ring = (ix, iz) => inPlan(ix, iz) && !(
    inPlan(ix - 1, iz) && inPlan(ix + 1, iz) && inPlan(ix, iz - 1) && inPlan(ix, iz + 1)
    && inPlan(ix - 1, iz - 1) && inPlan(ix + 1, iz + 1)
    && inPlan(ix - 1, iz + 1) && inPlan(ix + 1, iz - 1));
  const shell = new Set(), cut = new Set();
  for (let ix = -rx; ix <= rx; ix++) {
    for (let iz = -rz; iz <= rz; iz++) {
      if (!ring(ix, iz)) continue;
      shell.add(`${ix},${iz}`);
      const low = notch(ix, iz);
      if (low) cut.add(`${ix},${iz}`);
      const band = low ? bands.notch
        : Math.abs(ix) > rx - 2 ? bands.corner
          : Math.abs(ix) > crownIX ? bands.flank : bands.crown;
      for (let iy = 0; iy < band; iy++) {
        put(cx + ix * 2, iy * 2, cz + iz * 2, mat, 2, iy % 2 ? colors[1] : colors[0]);
      }
    }
  }
  // Oculus canopy over the notch. A 2 m brick reaches exactly one 2 m hop, so a
  // plate cell goes in only where it stands on a notch column or touches one —
  // anything further out would be two hops and would fall.
  if (canopy) {
    const plate = new Set(cut);
    for (const k of cut) {
      const [ix, iz] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = `${ix + dx},${iz + dz}`;
        if (!shell.has(nk) && inPlan(ix + dx, iz + dz)) plate.add(nk);
      }
    }
    for (const k of plate) {
      const [ix, iz] = k.split(',').map(Number);
      put(cx + ix * 2, canopyY, cz + iz * 2, canopyMat, 2, canopyColor);
    }
  }
  return {
    plaza: { x: cx - rx * 2 - plazaPad, z: cz - rz * 2 - plazaPad, w: rx * 4 + plazaPad * 2, d: rz * 4 + plazaPad * 2, color: plazaColor },
    faceZ: cz + rz * 2 + 2,                       // outer face of the +z wall
    top: bands.crown * 2,
  };
}

// Industrial refinery: a 2 m brick block, a square stack beside it, and a row
// of 1 m storage tanks. The block is the mass; the stack is the silhouette.
export function refineryMass(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oy = 0, oz, nx, ny, nz, wallMat = 'brick', wallColor = 0x7c4436,
    roofMat = 'concrete', roofColor = 0x5a5048,
    stack = null,   // { x, z, h, mat, color, capMat, capColor }
    tanks = null,   // { xs: [x...], z, h, w, outerR, innerR, mat, ringMat, color, ringColor }
  } = o;
  megaShell(sim, ox, oy, oz, nx, ny, nz, wallMat, wallColor, { roofMat, roofColor });
  if (stack) {
    const { x, z, h, mat = wallMat, color = wallColor, capMat = 'concrete', capColor = 0x5f544c } = stack;
    for (let y = 0; y < h; y += 2) {
      for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) put(x + ix * 2, y, z + iz * 2, mat, 2, color);
    }
    for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) put(x + ix * 2, h, z + iz * 2, capMat, 2, capColor);
  }
  if (tanks) {
    const {
      xs, z, h = 7, w = 5, outerR = 2.4, innerR = 1.4, mat = 'panel',
      ringMat = 'steel', color = 0xd8d2c2, ringColor = 0xb8bec6,
    } = tanks;
    // Hollow cylinder: cells outside outerR are off the barrel, cells inside
    // innerR are the void — except on the lid layer, which is solid so the
    // barrel is closed and every wall cell has a plate to carry.
    const cr = (w - 1) / 2, lid = h - 1;
    for (const tx of xs) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          for (let zz = 0; zz < w; zz++) {
            const rad = Math.hypot(x - cr, zz - cr);
            if (rad > outerR) continue;
            if (rad <= innerR && y < lid) continue;
            put(tx + x, y, z + zz, y === lid ? ringMat : mat, 1, y === lid ? ringColor : color);
          }
        }
      }
    }
  }
}

// Beaux-arts civic block: masonry body, full roof plate, a free-standing
// colonnade with its entablature, an entrance step, and an attic penthouse.
// Returns the forecourt rect so the caller never re-derives it.
export function museumBlock(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const fill = (x0, y0, z0, cx, cy, cz, m, s, c) => {
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) put(x0 + i * s, y0 + j * s, z0 + k * s, m, s, c);
  };
  const {
    ox, oz, w, d, h, wallMat = 'concrete', wall = 0xd0c8b6, trim = 0xbcb4a2,
    colOffset = 2, colH = 6, colXs, colMat = 'steel', colColor = 0xe0d9c8,
    stepColor = 0xb2aa98, attic = null,          // { dx, dz, w, h, d }
    court = null,                                // { x, z, w, d, color }
  } = o;
  const front = oz - colOffset;                  // colonnade sits in front of the body
  tower(sim, ox, oz, w, d, 0, h, 'masonry', wallMat, wall);         // body
  fill(ox, h, oz, w, 1, d, wallMat, 1, trim);                       // roof plate
  for (const px of colXs) fill(px, 0, front, 1, colH, 1, colMat, 1, colColor);
  fill(ox, colH, front, w, 1, colOffset, wallMat, 1, wall);         // entablature
  fill(ox, colH + 1, front, w, 1, 1, wallMat, 1, trim);             // cornice
  fill(ox - 1, 0, front - 1, w + 2, 1, 1, wallMat, 1, stepColor);   // entrance step
  if (attic) fill(ox + attic.dx, h + 1, oz + attic.dz, attic.w, attic.h, attic.d, wallMat, 1, trim);
  return { court };
}

// Triumphal arch: a 2 m granite mass with a single 4 m opening (one 2 m hop
// from each pier — the widest a 2 m lintel can carry), a roof plate, and a
// bronze quadriga. `nx`/`ny` are counts of 2 m cells; `voidIX` names the cells
// the opening removes, and `voidIY` the layer it stops at.
export function triumphalArch(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const fill = (x0, y0, z0, cx, cy, cz, m, s, c) => {
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) put(x0 + i * s, y0 + j * s, z0 + k * s, m, s, c);
  };
  const {
    ox, oz, nx = 6, ny = 10, nz = 2, voidIX = [2, 3], voidIY = 8,
    mat = 'concrete', stone = 0xc4bba6, attic = 0xd2c9b4, cap = 0xb0a894,
    quadriga = null,   // { color, harness, xs, dz }
  } = o;
  const cut = new Set(voidIX);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        if (iy < voidIY && cut.has(ix)) continue;
        put(ox + ix * 2, iy * 2, oz + iz * 2, mat, 2, iy > voidIY ? attic : stone);
      }
    }
  }
  fill(ox, ny * 2, oz, nx * 2, 1, nz * 2, mat, 1, cap);
  if (quadriga) {
    const { color = 0x7d6a3f, harness = 0x6d5c37, xs, dz = 1 } = quadriga;
    const y = ny * 2 + 1;
    for (const hx of xs) {
      fill(hx, y, oz + dz, 3, 2, 2, 'panel', 0.5, color);       // horse body
      fill(hx, y + 1, oz + dz, 1, 2, 1, 'panel', 0.5, color);   // head + neck
    }
    fill(ox + 4, y, oz + dz + 1.5, 4, 4, 2, 'panel', 0.5, harness);  // chariot
  }
}

// Steel truss viaduct: paired legs on a bay pitch, a top chord tying them, a
// 1 m deck plate, and a 0.5 m parapet each side. Runs along z.
//
// The three runs take separate end z's on purpose. A viaduct heading off-map
// wants its deck to stop short of the last bent and its parapet shorter still,
// so the structure reads as continuing rather than as a severed stump — one
// shared `z1` would square all three off at the same line.
export function trussViaduct(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const fill = (x0, y0, z0, cx, cy, cz, m, s, c) => {
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) put(x0 + i * s, y0 + j * s, z0 + k * s, m, s, c);
  };
  const {
    xW, xE, z0, legZ1, deckZ1, railZ1, legH, bay = 4, railStep = 2,
    steel = 0x5a6472, deckMat = 'concrete', deckColor = 0x7f858c, rail = 0x8d3f36,
  } = o;
  const span = xE - xW + 1;
  for (let z = z0; z <= legZ1; z += bay) {
    for (const cx of [xW, xE]) fill(cx, 0, z, 1, legH, 1, 'steel', 1, steel);
    fill(xW, legH, z, span, 1, 1, 'steel', 1, steel);          // top chord
  }
  for (let z = z0; z <= deckZ1; z++) {
    for (let x = xW; x <= xE; x++) put(x, legH + 1, z, deckMat, 1, deckColor);
  }
  for (let z = z0; z <= railZ1; z += railStep) {
    for (const rx of [xW, xE + 0.5]) {
      put(rx, legH + 2, z, 'steel', 0.5, rail);
      put(rx, legH + 2.5, z, 'steel', 0.5, rail);
    }
  }
}

// Parachute-jump tower: four 2 m steel legs, a 0.5 m lattice mast on the legs'
// INNER corners, a head plate and a painted ring. The mast offset is load
// bearing — centred on the tower it would sit over the 2 m gap BETWEEN the legs
// with nothing under it, which is exactly how a 4,000-cell assembly floats.
export function parachuteTower(sim, o) {
  const put = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const {
    ox, oz, legH = 18, legSpan = 4, legColor = 0x9a3f36, braceAt = [6, 12],
    mastY0 = 20, mastY1 = 34, mastColor = 0xd94f3d, tieEvery = 6,
    discR2 = 4.6, ringColors = [0xf2c14e, 0xf2ede2],
  } = o;
  for (let y = 0; y < legH; y += 2) {
    for (const lx of [ox, ox + legSpan]) for (const lz of [oz, oz + legSpan]) put(lx, y, lz, 'steel', 2, legColor);
    if (braceAt.includes(y)) {
      for (const lz of [oz, oz + legSpan]) put(ox + 2, y, lz, 'steel', 2, legColor);
      for (const lx of [ox, ox + legSpan]) put(lx, y, oz + 2, 'steel', 2, legColor);
    }
  }
  for (const lx of [ox, ox + legSpan]) for (const lz of [oz, oz + legSpan]) put(lx, legH, lz, 'steel', 2, legColor);
  const mx = [ox + 1.5, ox + legSpan], mz = [oz + 1.5, oz + legSpan];
  for (let y = mastY0; y < mastY1; y += 0.5) {
    for (const lx of mx) for (const lz of mz) put(lx, y, lz, 'steel', 0.5, mastColor);
    if (Math.round(y * 2) % tieEvery === 0) {
      // ties skip the corners the columns already own (one block per cell)
      for (let u = mx[0] + 0.5; u <= mx[1] - 0.5; u += 0.5) {
        for (const lz of mz) put(u, y, lz, 'steel', 0.5, mastColor);
      }
      for (let v = mz[0] + 0.5; v <= mz[1] - 0.5; v += 0.5) {
        for (const lx of mx) put(lx, y, v, 'steel', 0.5, mastColor);
      }
    }
  }
  // Head plate: a disc on the mast tops, radius chosen so no cell is more than
  // 3 m of horizontal path from a column (steel's maxSpan).
  const cx = ox + legSpan / 2 + 0.5, cz = oz + legSpan / 2 + 0.5;
  for (let x = -2; x <= 2; x += 0.5) {
    for (let z = -2; z <= 2; z += 0.5) {
      if (x * x + z * z > discR2) continue;
      put(cx + x, mastY1, cz + z, 'steel', 0.5, mastColor);
    }
  }
  const rim = [[-2, 0], [-1.5, -1.5], [0, -2], [1.5, -1.5], [2, 0], [1.5, 1.5], [0, 2], [-1.5, 1.5]];
  rim.forEach(([rx, rz], i) => {
    put(cx + rx, mastY1 + 0.5, cz + rz, 'panel', 0.5, i % 2 ? ringColors[0] : ringColors[1]);
    put(cx + rx, mastY1 + 1, cz + rz, 'panel', 0.5, i % 2 ? ringColors[1] : ringColors[0]);
  });
  for (let y = mastY1 + 0.5; y < mastY1 + 2; y += 0.5) put(cx, y, cz, 'steel', 0.5, mastColor);
}

// --- render-only decor generators ---------------------------------------------
// These return sceneDecor rects ({x,z,w,d} min-corner + size), never blocks.
// They live in the kit so every scene draws its markings the same way.

// Axis-aware crosswalk. `axis` is the axis the bars REPEAT along — i.e. the
// direction traffic flows — so the stripes always read as rungs laid across
// the roadway. Getting this wrong renders the crossing as one solid bar down
// the middle of the street (Upper Manhattan's inline helper always stepped in
// z, so half its crossings are wrong). The bar run is centred inside the given
// crossing rect, so every stripe stays within it — put the rect inside a road.
export function zebra({ x, z, w, d, axis = 'x', stripe = 0.32, gap = 0.58 }) {
  const out = [];
  const span = axis === 'x' ? w : d;
  const pitch = stripe + gap;
  const n = Math.max(1, Math.floor((span + gap) / pitch));
  const start = (span - (n * pitch - gap)) / 2;
  for (let i = 0; i < n; i++) {
    const o = start + i * pitch;
    out.push(axis === 'x'
      ? { x: x + o, z, w: stripe, d }
      : { x, z: z + o, w, d: stripe });
  }
  return out;
}

// Dashed lane centreline filling a thin rect. `axis` is the direction of
// travel; dashes repeat along it and are centred inside the rect.
export function laneDashes({ x, z, w, d, axis = 'x', dash = 2.4, gap = 3.6 }) {
  const out = [];
  const span = axis === 'x' ? w : d;
  const pitch = dash + gap;
  const n = Math.max(1, Math.floor((span + gap) / pitch));
  const start = (span - (n * pitch - gap)) / 2;
  for (let i = 0; i < n; i++) {
    const o = start + i * pitch;
    out.push(axis === 'x'
      ? { x: x + o, z, w: dash, d }
      : { x, z: z + o, w, d: dash });
  }
  return out;
}

// --- C1 PROP additions --------------------------------------------------------

// --- C1 PROP: loose plaza clutter --------------------------------------------
// These exist as much for PHYSICS as for dressing. A SIZE 1 hole (r 1.1 m,
// removal disc 1.045 m) unseats a ground block only when 3 of its 4 base
// corners fall inside that disc, and a block that loses its own anchor is still
// carried by any neighbour within the material's maxSpan. So a continuous field
// of 1 m paving is close to inedible at SIZE 1 — its neighbours hold it up —
// while a small, ISOLATED prop drops the moment the disc reaches it. Scatter
// these where a fresh hole starts; a paved plaza on its own is a dead zone.

// Stacked produce crates: a 1 m pallet of 0.5 m boxes with a partial second
// tier, so the silhouette is not a flat slab.
export function crateStack(sim, x, z, tiers = 2, color = 0x8a6a44) {
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 2; k++) sim._block(x + i * 0.5, 0, z + k * 0.5, 'wood', 0.5, color);
  }
  if (tiers > 1) {
    sim._block(x, 0.5, z, 'wood', 0.5, 0x9c7a52);
    sim._block(x + 0.5, 0.5, z + 0.5, 'wood', 0.5, 0x74593a);
  }
  if (tiers > 2) sim._block(x, 1, z, 'wood', 0.5, color);
}

// Bike-share dock: `n` steel hoops on a pitch, each a pair of posts joined by a
// cross bar. `axis` is the direction the row runs.
//
// The bar spans post top to post top INCLUSIVE. Placing only the middle cell —
// the obvious way to draw a bar "between" two posts — leaves it hovering over
// the 0.25 m gap with no support path at all, and every hoop in the scene falls
// at spawn. With the end cells in, the middle one is carried horizontally from
// both sides at 0.25 m, far inside steel's 3 m span.
export function bikeRack(sim, x, z, n = 3, axis = 'x', color = 0x3a4450) {
  for (let i = 0; i < n; i++) {
    const ox = axis === 'x' ? x + i * 0.75 : x;
    const oz = axis === 'x' ? z : z + i * 0.75;
    const [dx, dz] = axis === 'x' ? [0, 0.5] : [0.5, 0];
    for (const [px, pz] of [[ox, oz], [ox + dx, oz + dz]]) {
      for (let y = 0; y < 0.75; y += 0.25) F(sim, px, y, pz, 'steel', color);
    }
    for (const f of [0, 0.5, 1]) F(sim, ox + dx * f, 0.75, oz + dz * f, 'steel', color);
  }
}

// Café table: 0.25 m pedestal, a round top clipped at the corners, and two
// chairs. The top's centre cell sits directly on the pedestal — a ring would
// leave the middle with nothing under it.
export function cafeTable(sim, x, z, top = 0xe8e2d4, chair = 0x3a4450) {
  for (let y = 0; y < 0.5; y += 0.25) F(sim, x, y, z, 'steel', chair);
  for (const [dx, dz] of [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) {
    F(sim, x + dx, 0.5, z + dz, 'panel', top);
  }
  for (const [cx, cz] of [[x - 0.75, z], [x + 0.75, z]]) {
    F(sim, cx, 0, cz, 'steel', chair);
    F(sim, cx, 0.25, cz, 'panel', chair);
    F(sim, cx, 0.5, cz, 'panel', chair);
  }
}

// Newspaper vending box: legs, painted body with a display window, and a lid.
// The window is ONE cell, not a full course. A course of glass would put the
// lid on glass, which carries nothing — the lid and everything under it drops
// at spawn. The panel beside the window carries the course above, and the
// window's own cell is 0.25 m from it, far inside panel's 3 m span.
export function newsBox(sim, x, z, color = 0xc23b2e) {
  F(sim, x, 0, z, 'steel', 0x2f3640); F(sim, x + 0.25, 0, z, 'steel', 0x2f3640);
  F(sim, x, 0.25, z, 'glass'); F(sim, x + 0.25, 0.25, z, 'panel', color);
  B25(sim, x, 0.5, z, 2, 1, 1, 'panel', color);
  B25(sim, x, 0.75, z, 2, 1, 1, 'panel', 0x2f3640);
}

// Refuse bags heaped at a kerb. A stepped pile, not a stack of columns: each
// upper lump straddles two below it, so nothing rides on a single cell.
export function trashBags(sim, x, z, color = 0x22262c) {
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 2; k++) F(sim, x + i * 0.25, 0, z + k * 0.25, 'panel', color);
  }
  for (let i = 0; i < 3; i++) F(sim, x + i * 0.25, 0.25, z, 'panel', 0x2e333a);
  F(sim, x + 0.25, 0.5, z, 'panel', color);
}

// Sidewalk bollard: short steel post with a paler cap.
export function bollard(sim, x, z, color = 0x2f3640) {
  B25(sim, x, 0, z, 1, 3, 1, 'steel', color);
  F(sim, x, 0.75, z, 'steel', 0x8f97a4);
}

// Masonry planter: a 0.25 m curb ring with leaf fill sitting inside it.
export function planter(sim, x, z, w = 1.5, d = 1, color = 0x6d5a4a, y = 0) {
  const nx = Math.round(w / 0.25), nz = Math.round(d / 0.25);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const edge = i === 0 || i === nx - 1 || k === 0 || k === nz - 1;
      F(sim, x + i * 0.25, y, z + k * 0.25, 'brick', edge ? color : 0x5b4634);
      F(sim, x + i * 0.25, y + 0.25, z + k * 0.25, edge ? 'brick' : 'leaf', edge ? color : undefined);
    }
  }
}

// Street/shop sign: steel post with a painted board. `axis` is the board's long
// axis. The board hangs off the post at its own level (never above it).
export function signPost(sim, x, z, color, h = 2, axis = 'x', len = 1.25) {
  const posts = Math.round(h / 0.25);
  B25(sim, x, 0, z, 1, posts, 1, 'steel');
  const n = Math.round(len / 0.25);
  for (let i = 1; i <= n; i++) {
    for (const y of [h - 0.75, h - 0.5, h - 0.25]) {
      if (axis === 'x') F(sim, x + i * 0.25, y, z, 'panel', color);
      else F(sim, x, y, z + i * 0.25, 'panel', color);
    }
  }
}

// 3×5 pixel font for voxel signage. Only the glyphs the scenes actually spell
// are here; an unknown character renders as a blank cell so a typo shows up as
// a gap instead of throwing during scene construction.
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'], M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.##'], W: ['#.#', '#.#', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], ' ': ['...', '...', '...', '...', '...'],
};

// Voxel signage. Glyphs run along `axis` from (x, z) with their baseline at y.
// Every pixel is `scale` cells of `px` metres square.
//
// Letters have no internal support path — the middle of an O is a hole and its
// upper arc only meets the baseline diagonally — so a sign MUST have something
// behind it. Either mount it on a wall (pass rail = null and place the glyphs
// one cell proud of the facade), or let it build its own billboard: `rail`
// emits a backing bar behind every font row plus posts down to `postY`.
export function signText(sim, text, x, y, z, opts = {}) {
  const {
    axis = 'x', px = 0.25, scale = 2, color = 0xf2c14e, mat = 'panel',
    dir = -1, rail = null, postY = null, postEvery = 6,
  } = opts;
  const chars = text.toUpperCase().split('');
  const gw = (3 * scale + scale) * px;            // glyph cell + one-pixel gap
  const w = chars.length * gw;
  const put = (u, v, h, m, c) => (axis === 'x'
    ? sim._block(x + u, y + v, z + h, m, px, c)
    : sim._block(x + h, y + v, z + u, m, px, c));
  if (rail !== null) {
    // One bar per FONT row, not per cell row: a glyph's upper sub-rows rest
    // vertically on the sub-row the bar already backs.
    for (let r = 0; r < 5; r++) {
      for (let u = 0; u < w; u += px) put(u, (4 - r) * scale * px, dir * px, 'steel', rail);
    }
    if (postY !== null) {
      for (let u = 0; u <= w - px; u += postEvery * px * scale) {
        for (let v = postY; v < 0; v += px) put(u, v, dir * px, 'steel', rail);
      }
    }
  }
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            put(i * gw + (c * scale + sx) * px, ((4 - r) * scale + sy) * px, 0, mat, color);
          }
        }
      }
    }
  });
  return w;
}

// Sidewalk A-frame chalkboard — the cheapest way to make a shopfront read.
export function sandwichBoard(sim, x, z, color = 0x2b3038) {
  B25(sim, x, 0, z, 3, 1, 2, 'wood', 0x6b543c);
  B25(sim, x, 0.25, z, 3, 2, 1, 'panel', color);
  B25(sim, x, 0.25, z + 0.25, 3, 2, 1, 'panel', color);
}

// --- C2 VEHICLE-scale additions ------------------------------------------------

// Rooftop water tower (Brooklyn's most-repeated silhouette): 2×2 wood legs,
// a ring tank, and a full cap plate. `y` is the roof slab's top.
export function waterTower(sim, x, y, z, tint) {
  sim._box(x, y, z, 2, 1, 2, 'wood', 1, tint);
  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      if (!(ix === 0 || ix === 2 || iz === 0 || iz === 2)) continue;
      sim._block(x - 0.5 + ix, y + 1, z - 0.5 + iz, 'wood', 1, tint);
      sim._block(x - 0.5 + ix, y + 2, z - 0.5 + iz, 'wood', 1, tint);
    }
  }
  sim._box(x - 0.5, y + 3, z - 0.5, 3, 1, 3, 'wood', 1, tint);
}

// Brownstone stoop: solid 0.5 m steps climbing to the parlour floor, with
// 0.25 m railings. Every step is its own ground-anchored column, so the stoop
// can never be the thing that falls. `dir` is the direction it projects from
// the facade: -1 for north (-z), +1 for south.
export function stoop(sim, x, z, steps = 4, dir = -1, w = 1.5, color = 0x8a7f70) {
  const nx = Math.round(w / 0.5);
  for (let i = 0; i < steps; i++) {
    const sz = dir < 0 ? z - (i + 1) * 0.5 : z + i * 0.5;
    const h = (steps - i) * 0.5;
    for (let ix = 0; ix < nx; ix++) {
      for (let y = 0; y < h; y += 0.5) sim._block(x + ix * 0.5, y, sz, 'concrete', 0.5, color);
    }
    // Masonry cheek walls flanking the run. Each is its own ground-anchored
    // column, which is both the real brownstone detail and the cheapest way to
    // avoid a stepped handrail whose cells only meet along diagonals.
    for (const rx of [x - 0.5, x + w]) {
      for (let y = 0; y < h + 0.5; y += 0.5) sim._block(rx, y, sz, 'brick', 0.5, 0x6a5342);
    }
  }
}

// Fire escape: 0.5 m steel landings hung off a facade with ladder runs between
// them. Landings cantilever 1 m (2 hops — well inside steel's 3 m span) and
// every ladder cell sits directly above the landing below it.
export function fireEscape(sim, x, z, floors, dir = -1, w = 2, y0 = 3, rise = 3) {
  const nx = Math.round(w / 0.5);
  const lz = dir < 0 ? z - 1 : z;      // landing occupies 1 m off the facade
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * rise;
    for (let ix = 0; ix < nx; ix++) {
      for (const dz of [0, 0.5]) sim._block(x + ix * 0.5, y, lz + dz, 'steel', 0.5);
    }
    // outboard guard rail
    const gz = dir < 0 ? lz : lz + 0.5;
    for (let ix = 0; ix < nx; ix++) sim._block(x + ix * 0.5, y + 0.5, gz, 'steel', 0.5);
    // ladder to the next landing, on the outboard edge
    if (f < floors - 1) {
      for (let y2 = y + 1; y2 < y + rise; y2 += 0.5) sim._block(x, y2, gz, 'steel', 0.5);
    }
  }
}

// Brooklyn brownstone: masonry row house with a stoop, a painted door plate, a
// front cornice band, and an optional fire escape. Kept narrow (w,d ≤ 7) so
// every roof-plate cell stays within concrete's 3 m span of a wall.
export function brownstone(sim, ox, oz, w, d, floors, color, opts = {}) {
  const {
    trim = 0x6b5546, door = 0x3f2d21, dir = -1, stoopSteps = 4,
    escape = false, roof = 0x5a5f66,
  } = opts;
  const H = floors * 3 + 1;                       // masonry slabEvery 3 → tops on a slab
  tower(sim, ox, oz, w, d, 0, H, 'masonry', 'brick', color);
  sim._box(ox, H, oz, w, 1, d, 'concrete', 1, roof);
  // Front cornice: a 0.25 m band overhanging the facade, tied in horizontally
  // at the roof plate's own level (0.625 m hop, inside brick's 2 m span).
  const fz = dir < 0 ? oz - 0.25 : oz + d;
  for (let i = 0; i < w * 4; i++) {
    F(sim, ox + i * 0.25, H, fz, 'brick', trim);
    F(sim, ox + i * 0.25, H + 0.25, fz, 'brick', trim);
  }
  // Stoop + door on the parlour floor.
  const sx = ox + Math.floor((w - 2) / 2) + 0.25;
  stoop(sim, sx, dir < 0 ? oz : oz + d, stoopSteps, dir, 1.5, trim);
  const parlour = stoopSteps * 0.5;
  const dz = dir < 0 ? oz - 0.25 : oz + d;
  // Door plate spans exactly the stoop's run: one cell wider and it would share
  // fine cells with the masonry cheek wall beside it.
  for (let i = 0; i < 6; i++) {
    for (let y = parlour; y < parlour + 1.75; y += 0.25) F(sim, sx + i * 0.25, y, dz, 'panel', door);
  }
  if (escape) fireEscape(sim, ox + 1, dir < 0 ? oz : oz + d, Math.max(2, floors - 1), dir, 2, 4, 3);
}

// Shipping container: 1 m panel box, open-topped ring with a lid so the walls
// never carry a floating plate. `len` in metres along x.
export function shippingContainer(sim, x, y, z, len = 6, color = 0xb4552f) {
  for (let i = 0; i < len; i++) {
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 2; j++) sim._block(x + i, y + j, z + k, 'panel', 1, color);
      sim._block(x + i, y + 2, z + k, 'steel', 1, color); // corrugated lid
    }
  }
}

// Market / boardwalk stall: 0.5 m counter, corner posts, and a striped awning
// resting directly on the post tops (no gap — mounts need a vertical path).
export function marketStall(sim, x, z, color = 0xc23b2e, w = 3, d = 2) {
  const nx = Math.round(w / 0.5), nz = Math.round(d / 0.5);
  for (let i = 0; i < nx; i++) sim._block(x + i * 0.5, 0, z, 'wood', 0.5, 0x7a5f42);
  for (let i = 0; i < nx; i++) sim._block(x + i * 0.5, 0.5, z, 'wood', 0.5, 0x8f6f4c);
  for (const px of [x, x + w - 0.5]) {
    for (const pz of [z, z + d - 0.5]) {
      // the front pair share their lowest cells with the counter — start above it
      for (let y = pz === z ? 1 : 0; y < 2; y += 0.5) sim._block(px, y, pz, 'wood', 0.5, 0x5f4a34);
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      sim._block(x + i * 0.5, 2, z + k * 0.5, 'panel', 0.5, (i + k) % 2 === 0 ? color : 0xf2ede2);
    }
  }
}

// --- C4/C5 landmark-scale additions --------------------------------------------

// Vertical ferris wheel in the x/y plane. The rim's lowest cells sit ON the
// ground (gy 0), so the whole ring is anchored there and support climbs the rim
// and the spokes — a wheel lifted clear of the ground has nothing to stand on.
// Cabins mount on the rim's SIDE (same y-range = horizontal bond); nothing may
// hang below its support in this engine.
export function ferrisWheel(sim, cx, cz, R, opts = {}) {
  const {
    rim = 0x8f2f3a, spokeColor = 0xe8e2d2, spokes = 16,
    cabinColors = [0xf2c14e, 0x3fa7d6, 0xe25a4a, 0x5cb85c], cabins = 8, tower = 0x4a5262,
  } = opts;
  const S = 0.5, hub = R;                       // hub height = R → rim bottom at y 0
  const cell = (fx, fy, m, c) => sim._block(cx + fx * S, hub + fy * S, cz, m, S, c);
  const put = new Set();
  const add = (ix, iy, m, c) => { const k = ix + ',' + iy; if (put.has(k)) return; put.add(k); cell(ix, iy, m, c); };
  const rr = R / S;
  // Rim: a 3-cell-thick annulus so it is 4-connected all the way round.
  for (let ix = -Math.ceil(rr) - 2; ix <= Math.ceil(rr) + 2; ix++) {
    for (let iy = -Math.ceil(rr) - 2; iy <= Math.ceil(rr) + 2; iy++) {
      if (hub + iy * S < 0) continue;
      const dr = Math.hypot(ix + 0.5, iy + 0.5) - rr;
      if (dr > 0.2 || dr < -2.4) continue;
      add(ix, iy, 'steel', rim);
    }
  }
  // Spokes: drawn as 4-connected staircases from the hub outward, so support
  // always climbs one face at a time instead of jumping a diagonal.
  for (let s = 0; s < spokes; s++) {
    const a = (s / spokes) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let px = 0, py = 0;
    for (let t = 0; t <= rr; t += 0.25) {
      const nx = Math.round(ca * t), ny = Math.round(sa * t);
      if (hub + ny * S < 0) continue;
      if (nx !== px && ny !== py) add(px, ny, 'steel', spokeColor); // L-corner keeps it face-connected
      add(nx, ny, 'steel', spokeColor);
      px = nx; py = ny;
    }
  }
  // Inner ring at half radius. It is not decoration: the two horizontal spokes
  // are pure straight runs with no vertical step to reset the cantilever span,
  // so their middle cells sit further than steel's 3 m from both the rim and the
  // hub. The inner ring is fed by the vertical spokes and reaches them.
  for (let ix = -Math.ceil(rr); ix <= Math.ceil(rr); ix++) {
    for (let iy = -Math.ceil(rr); iy <= Math.ceil(rr); iy++) {
      if (hub + iy * S < 0) continue;
      const dr = Math.hypot(ix + 0.5, iy + 0.5) - rr / 2;
      if (dr > 0.2 || dr < -1.2) continue;
      add(ix, iy, 'steel', spokeColor);
    }
  }
  for (let ix = -2; ix < 2; ix++) for (let iy = -2; iy < 2; iy++) add(ix, iy, 'steel', 0xd8d2c2); // hub boss
  // Cabins ride the rim's outer face, one cell clear of the wheel plane.
  for (let c = 0; c < cabins; c++) {
    const a = (c / cabins) * Math.PI * 2 + Math.PI / cabins;
    const bx = Math.round(Math.cos(a) * (rr - 1)) * S, by = hub + Math.round(Math.sin(a) * (rr - 1)) * S;
    if (by < 0.5) continue;
    const col = cabinColors[c % cabinColors.length];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) sim._block(cx + bx + i * S, by + j * S, cz + S, 'panel', S, col);
  }
  // A-frame legs: vertical columns in their own z planes, one on each side of
  // the wheel, with a short inward head arm. Nothing crosses the wheel plane —
  // a tie through z = cz would land inside the rim's own cells.
  for (const [lx, sgn] of [[cx - (R - 1), 1], [cx + (R - 1), -1]]) {
    for (const lz of [cz - 1, cz + 1]) {
      for (let y = 0; y <= hub; y += S) sim._block(lx, y, lz, 'steel', S, tower);
      for (let a = S; a <= 2.5; a += S) sim._block(lx + sgn * a, hub, lz, 'steel', S, tower);
    }
  }
}

// Wooden coaster: a stepped trestle run. Each 2 m bay gets its own pair of
// ground-anchored bents, so no deck cell is ever more than 1 m (2 hops) from a
// post — wood's span is 2 m. `profile(i)` returns the bay's deck height.
export function woodCoaster(sim, ox, oz, bays, profile, opts = {}) {
  const { w = 3, wood = 0x9c6b41, rail = 0x6f4626, cars = [], carColor = 0xe2452f } = opts;
  const S = 0.5, nz = Math.round(w / S);
  const posts = new Set([0, Math.floor(nz / 2), nz - 1]);
  for (let i = 0; i <= bays; i++) {
    const h = profile(i);
    const bx = ox + i * 2;
    for (const k of posts) {
      for (let y = 0; y < h; y += S) sim._block(bx, y, oz + k * S, 'wood', S, wood);
    }
    // cross ties every 2 m of height read as the lattice (post cells already
    // fill their own columns — placing a tie there would share a fine cell)
    for (let y = 2; y < h; y += 2) {
      for (let k = 0; k < nz; k++) if (!posts.has(k)) sim._block(bx, y, oz + k * S, 'wood', S, wood);
    }
  }
  for (let i = 0; i < bays; i++) {
    const h = profile(i);
    for (let x = 0; x < 2; x += S) {
      for (let k = 0; k < nz; k++) sim._block(ox + i * 2 + x, h, oz + k * S, 'wood', S, wood);
    }
    for (let x = 0; x < 2; x += S) {
      sim._block(ox + i * 2 + x, h + S, oz, 'wood', S, rail);
      sim._block(ox + i * 2 + x, h + S, oz + (nz - 1) * S, 'wood', S, rail);
    }
  }
  for (const i of cars) {
    const h = profile(i) + S;
    for (let x = 0; x < 2; x += S) {
      for (let k = 1; k < nz - 1; k++) sim._block(ox + i * 2 + x, h, oz + k * S, 'panel', S, carColor);
      for (let k = 1; k < nz - 1; k++) sim._block(ox + i * 2 + x, h + S, oz + k * S, 'panel', S, 0x2b3038);
    }
  }
}

// Carousel: a round platform on a centre drum, painted horses on poles, and a
// striped conical canopy. The canopy rests on the pole tops, never on glass.
export function carousel(sim, cx, cz, R = 3.5, opts = {}) {
  const { deck = 0xe8d9b5, canopy = [0xc23b2e, 0xf2ede2], poleColor = 0xd6b64a } = opts;
  const S = 0.5, rr = R / S;
  for (let ix = -rr; ix < rr; ix++) {
    for (let iz = -rr; iz < rr; iz++) {
      if (Math.hypot(ix + 0.5, iz + 0.5) > rr) continue;
      sim._block(cx + ix * S, 0, cz + iz * S, 'wood', S, deck);
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.round(Math.cos(a) * (rr - 1.5)), pz = Math.round(Math.sin(a) * (rr - 1.5));
    // the horse IS a cell of the pole, not a block bolted into the same cell
    for (let y = S; y < 2.5; y += S) {
      sim._block(cx + px * S, y, cz + pz * S, y === 1 ? 'panel' : 'steel', S,
        y === 1 ? (i % 2 ? 0xe8ecf2 : 0x8a5a3a) : poleColor);
    }
  }
  for (let ix = -rr; ix < rr; ix++) {
    for (let iz = -rr; iz < rr; iz++) {
      const dr = Math.hypot(ix + 0.5, iz + 0.5);
      if (dr > rr) continue;
      const band = Math.round(Math.atan2(iz + 0.5, ix + 0.5) / (Math.PI / 6));
      sim._block(cx + ix * S, 2.5, cz + iz * S, 'panel', S, canopy[(band + 12) % 2]);
      if (dr < rr - 2) sim._block(cx + ix * S, 3, cz + iz * S, 'panel', S, canopy[(band + 12) % 2]);
    }
  }
  for (let y = S; y < 2.5; y += S) sim._box(cx - S, y, cz - S, 2, 1, 2, 'steel', S, 0xb9a06a);
}

// Container gantry crane: two 2 m concrete legs per side, a 0.5 m steel portal
// beam, and a cantilevered boom braced back to the tower top.
// Every dimension here is bounded by steel's 3 m cantilever: the portal gap is
// 4 m (2 m to mid-span from either leg) and the boom reaches exactly 3 m past
// the leg. Widen either and the crane drops its own beam at spawn.
export function gantryCrane(sim, ox, oz, opts = {}) {
  const { h = 14, color = 0xd9552f, leg = 0x9aa1ab } = opts;
  const S = 0.5, span = 8, boom = 3;
  for (const lx of [ox, ox + span - 2]) {
    for (const lz of [oz, oz + 4]) {
      for (let y = 0; y < h; y += 2) sim._block(lx, y, lz, 'concrete', 2, leg);
    }
  }
  for (const lz of [oz, oz + 4]) {
    for (let x = -boom; x < span; x += S) {
      sim._block(ox + x, h, lz, 'steel', S, color);
      if (x >= 0) sim._block(ox + x, h + S, lz, 'steel', S, color);
    }
  }
  // Portal head ties sit DIRECTLY over the legs, where the beam's own span is
  // still 0 — a tie at mid-span starts 1.5 m in the hole and runs out of steel
  // before it reaches the middle of the 4 m crossing.
  for (const bx of [ox + S, ox + span - 2 + S]) {
    for (let z = S; z < 4; z += S) sim._block(bx, h, oz + z, 'steel', S, color);
  }
  // trolley: 1 m stubs off each boom rail, never a full girder across the tip
  for (const tz of [oz + S, oz + 4 - S]) {
    sim._block(ox - boom + S, h + S, tz, 'steel', S, 0x2b3038);
    sim._block(ox - boom + S, h, tz, 'steel', S, 0x2b3038);
  }
}
