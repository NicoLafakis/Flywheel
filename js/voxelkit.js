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

// Curvilinear surface ribbon: stamps square rects along a polyline so a drive,
// a bridle path or a footpath can bend without the scene hand-rolling a chain
// of rects per corner. Only the park scenes need diagonals — a straight street
// is still one rect, and should stay one rect.
//
// The stamp is a square of side `width` centred on the line, stepped at
// `width * 0.6` so consecutive stamps overlap even on a 45° run. Joints are
// emitted once (the next segment skips its k = 0 sample) so a polyline never
// double-stamps a vertex.
export function pathRibbon(points, width, opts = {}) {
  const { step = width * 0.6, color, closed = false } = opts;
  const out = [];
  const h = width / 2;
  const pts = closed ? [...points, points[0]] : points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i > 0 ? 1 : 0; k <= n; k++) {
      const t = k / n;
      const r = { x: x0 + (x1 - x0) * t - h, z: z0 + (z1 - z0) * t - h, w: width, d: width };
      if (color !== undefined) r.color = color;
      out.push(r);
    }
  }
  return out;
}

// --- shared scene scaffolding -------------------------------------------------
// These two used to live inside voxelscene-brooklyn.js. They are here because
// the SECOND scene that needed them is the point: a forked copy drifts, and the
// only symptom of a drifted blocker list is the chase cam clipping through a
// roof — invisible until someone plays that exact corner of that exact map.

// Footprint of a vehicle entry, in metres. Kept beside the placer so a scene
// and the validator can never disagree about where a car actually is.
export function vehicleBBox(v) {
  const along = v.kind === 'sedan' ? 5 : v.kind === 'bus' ? 6
    : v.kind === 'boxVan' ? v.len : v.kind === 'bigTruck' ? 6 : 1.5;
  const across = v.kind === 'motorcycle' ? 0.5 : 2;
  return v.axis === 'z'
    ? { minX: v.x, maxX: v.x + across, minZ: v.z, maxZ: v.z + along }
    : { minX: v.x, maxX: v.x + along, minZ: v.z, maxZ: v.z + across };
}

// Camera blockers, GENERATED from the finished geometry rather than typed by
// hand. The validator checks coverage per 1 m footprint cell for everything
// ≥ `minH` tall; past a few thousand blocks a hand list drifts on every edit.
// Heights round UP to the next half-metre so a merged rect always covers the
// tallest cell inside it. Call it as the last statement of a scene builder.
export function generateBlockers(sim, minH = 6) {
  const tops = new Map();
  for (const b of sim.blocks) {
    const top = (b.gy + b.fsy) * 0.25;
    for (let cx = Math.floor(b.gx * 0.25); cx < Math.ceil((b.gx + b.fsx) * 0.25); cx++) {
      for (let cz = Math.floor(b.gz * 0.25); cz < Math.ceil((b.gz + b.fsz) * 0.25); cz++) {
        const k = cx + ',' + cz;
        if (!(tops.get(k) >= top)) tops.set(k, top);
      }
    }
  }
  const cells = new Map();
  for (const [k, top] of tops) if (top >= minH) cells.set(k, Math.ceil(top * 2) / 2);
  const keys = [...cells.keys()].sort((a, b) => {
    const [ax, az] = a.split(',').map(Number), [bx, bz] = b.split(',').map(Number);
    return az - bz || ax - bx;
  });
  const taken = new Set();
  const out = [];
  for (const k of keys) {
    if (taken.has(k)) continue;
    const [x0, z0] = k.split(',').map(Number);
    const h = cells.get(k);
    let w = 1;
    while (cells.get((x0 + w) + ',' + z0) === h && !taken.has((x0 + w) + ',' + z0)) w++;
    let d = 1;
    for (; ;) {
      let ok = true;
      for (let i = 0; i < w; i++) {
        const kk = (x0 + i) + ',' + (z0 + d);
        if (cells.get(kk) !== h || taken.has(kk)) { ok = false; break; }
      }
      if (!ok) break;
      d++;
    }
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) taken.add((x0 + i) + ',' + (z0 + j));
    out.push({ minX: x0, maxX: x0 + w, minZ: z0, maxZ: z0 + d, h });
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

// --- LANDSCAPE: the park vocabulary -------------------------------------------
// Central Park is not made of buildings, so the civic/industrial builders above
// do not cover it. Everything below is the same contract as the rest of the kit:
// one primitive call site per builder, parametric, and physically standing by
// construction rather than by luck.

// Water basin rim: the ONE ring of ground blocks immediately outside a water
// footprint. Take the water rects as the input and derive the rim from them —
// never the other way round. Hand-written rims drift from their water plane by
// a metre and the plane then visibly runs out past its own bank (Upper
// Manhattan shipped two of three that way).
//
// `rects` may be several lobes of one body: the rim is the boundary of their
// UNION, so a shared edge between two lobes is water, not stone.
export function basinRim(sim, rects, opts = {}) {
  const { mat = 'concrete', color = 0x7b7f74, skip = null } = opts;
  const wet = (x, z) => rects.some((w) => x >= w.x && x < w.x + w.w && z >= w.z && z < w.z + w.d);
  const seen = new Set();
  const cells = [];
  const mark = (x, z) => {
    const k = x + ',' + z;
    if (seen.has(k)) return;
    seen.add(k);
    cells.push([x, z]);
  };
  for (const w of rects) {
    for (let x = w.x - 1; x < w.x + w.w + 1; x++) { mark(x, w.z - 1); mark(x, w.z + w.d); }
    for (let z = w.z; z < w.z + w.d; z++) { mark(w.x - 1, z); mark(w.x + w.w, z); }
  }
  for (const [x, z] of cells) {
    if (wet(x, z)) continue;
    if (skip && skip(x, z)) continue;
    sim._block(x, 0, z, mat, 1, color);
  }
  return rects;
}

// Low boundary wall: the park's perimeter, a garden enclosure, or the retaining
// shoulder of a sunken road. 1 m masonry on a 1 m step, with square piers at a
// fixed pitch and named gate openings cut out of the run. `gaps` are [from, to)
// offsets in metres from the run's own origin, so a gate stays put when the
// wall's endpoints move.
export function parkWall(sim, o) {
  const {
    x, z, len, axis = 'x', h = 1, mat = 'concrete', color = 0x6d6a62,
    pierEvery = 0, pierColor = 0x807b70, pierH = 1, gaps = [],
  } = o;
  for (let u = 0; u < len; u++) {
    if (gaps.some(([a, b]) => u >= a && u < b)) continue;
    const bx = axis === 'x' ? x + u : x;
    const bz = axis === 'x' ? z : z + u;
    const pier = pierEvery > 0 && u % pierEvery === 0;
    const top = h + (pier ? pierH : 0);
    for (let y = 0; y < top; y++) sim._block(bx, y, bz, mat, 1, pier ? pierColor : color);
  }
}

// See-through fence: posts on a pitch with a top rail resting ON the post tops.
// The rail is a continuous run of cells, not one cell per bay: a bar drawn only
// between the posts hovers over the gap with no support path (the bike rack in
// this kit fell exactly that way). Every rail cell is at most `postEvery / 2`
// from a post, far inside steel's 3 m span.
export function fenceRun(sim, o) {
  const {
    x, z, len, axis = 'x', h = 1.25, s = 0.25, mat = 'steel',
    color = 0x2f4a35, postEvery = 2, postColor = color,
  } = o;
  const ph = Math.max(s, Math.round(h / s) * s);
  const n = Math.round(len / s);
  const per = Math.max(1, Math.round(postEvery / s));
  for (let i = 0; i < n; i++) {
    const u = i * s;
    const bx = axis === 'x' ? x + u : x;
    const bz = axis === 'x' ? z : z + u;
    if (i % per === 0) for (let y = 0; y < ph; y += s) sim._block(bx, y, bz, mat, s, postColor);
    sim._block(bx, ph, bz, mat, s, color);
  }
}

// Landform: a rock outcrop, a glacial knoll, or a grassy hill, built as a solid
// stepped mass. Solid rather than shelled on purpose — a hollow hill collapses
// like a building and reads like one when the hole opens it. Each layer insets
// by `inset` until it reaches the crown, so every cell sits directly on the one
// below and nothing can float.
export function rockMound(sim, o) {
  const {
    x, z, w, d, h, mat = 'concrete', color = 0x6b675e,
    crownColor = color, inset = 1, crownW = 1, crownD = 1, y0 = 0,
  } = o;
  const kx = Math.max(0, Math.floor((w - crownW) / 2));
  const kz = Math.max(0, Math.floor((d - crownD) / 2));
  for (let y = 0; y < h; y++) {
    const k = Math.min(y * inset, kx, kz);
    for (let i = k; i < w - k; i++) {
      for (let j = k; j < d - k; j++) sim._block(x + i, y0 + y, z + j, mat, 1, y === h - 1 ? crownColor : color);
    }
  }
}

// Masonry arch carrying a path over a stream, a drive, or a transverse.
// Support never flows downward here, so a true voussoir ring is impossible: the
// opening is CORBELLED instead — each course reaches at most one cell further
// in than the course below it, which is a 1 m horizontal hop off a cell that is
// itself vertically supported. The same trick as the suspension bridge's
// stepped cable, applied sideways.
//
// `axis` is the direction the arch spans; the built run is
// `pier + span + pier` along it and `width` across. The deck plate on top is
// what the path actually crosses on.
export function stoneArch(sim, o) {
  const {
    x, z, span, width = 2, rise = 3, axis = 'x', pier = 2, spring = 0,
    mat = 'concrete', color = 0x6b6560, deck = true, deckMat = mat, deckColor = 0x7d7468,
    soffit = null, y0 = 0,
  } = o;
  const put = (u, y, v, m, c) => (axis === 'x'
    ? sim._block(x + u, y0 + y, z + v, m, 1, c)
    : sim._block(x + v, y0 + y, z + u, m, 1, c));
  const L = pier * 2 + span;
  const open = [];
  for (let y = 0; y < rise; y++) {
    const cut = Math.max(0, span - 2 * Math.max(0, y - spring));
    const c0 = pier + (span - cut) / 2, c1 = c0 + cut;
    open[y] = [c0, c1];
    for (let u = 0; u < L; u++) {
      if (u + 0.5 > c0 && u + 0.5 < c1) continue;
      for (let v = 0; v < width; v++) put(u, y, v, mat, color);
    }
  }
  // The deck's UNDERSIDE is the tunnel ceiling, so a `soffit` colour on the
  // cells that bridge the opening is the whole Minton-tile vault: one paint
  // change, no second layer of geometry hanging under a plate it cannot reach.
  if (deck) {
    const [c0, c1] = open[rise - 1] || [0, 0];
    for (let u = 0; u < L; u++) {
      const lid = soffit !== null && u + 0.5 > c0 - 1 && u + 0.5 < c1 + 1;
      for (let v = 0; v < width; v++) put(u, rise, v, deckMat, lid ? soffit : deckColor);
    }
  }
}

// Pergola / vine arcade: two post rows, a beam grid on the post tops, and an
// optional leaf canopy resting on the beams. The side beams run continuously so
// every cross-beam cell reaches a post within half the walk's width; the leaves
// only go where there is a beam under them, because leaf carries nothing.
export function pergola(sim, o) {
  const {
    x, z, len, axis = 'x', w = 2, h = 2.5, postEvery = 2,
    mat = 'wood', color = 0x5a4a32, beamColor = 0x6b5a3e, vine = true,
  } = o;
  const S = 0.5;
  const ph = Math.round(h / S) * S;
  const n = Math.round(len / S), per = Math.max(1, Math.round(postEvery / S));
  const nv = Math.round(w / S);
  const put = (u, y, v, m, c) => (axis === 'x'
    ? sim._block(x + u * S, y, z + v * S, m, S, c)
    : sim._block(x + v * S, y, z + u * S, m, S, c));
  for (let i = 0; i < n; i++) {
    const post = i % per === 0;
    for (const v of [0, nv - 1]) {
      if (post) for (let y = 0; y < ph; y += S) put(i, y, v, mat, color);
      put(i, ph, v, mat, beamColor);
    }
    if (post) for (let v = 1; v < nv - 1; v++) put(i, ph, v, mat, beamColor);
    if (vine && i % 2 === 0) for (const v of [0, nv - 1]) put(i, ph + S, v, 'leaf', 0x3f7a3a);
    if (vine && post) for (let v = 1; v < nv - 1; v++) put(i, ph + S, v, 'leaf', 0x3f7a3a);
  }
}

// Small civic pavilion: a masonry body, a full roof plate, and a stepped hip
// roof. The lodge/gatehouse/rec-centre shape that a park repeats a dozen times
// — a gatehouse and a boathouse differ by colour and roof pitch, not massing.
// Each roof ring sits on the plate below it, so the pitch can never float.
export function pavilion(sim, o) {
  const {
    x, z, w, d, h, kind = 'masonry', wallMat = 'brick', wall = 0x8a4a38,
    plate = 0x6a6259, roofMat = 'panel', roof = 0x4a5450, roofRise = 2,
    porch = null,        // { dir: -1 | 1, xs: [...], h }
  } = o;
  tower(sim, x, z, w, d, 0, h, kind, wallMat, wall);
  sim._box(x, h, z, w, 1, d, 'concrete', 1, plate);
  for (let r = 1; r <= roofRise; r++) {
    const rw = w - 2 * r, rd = d - 2 * r;
    if (rw <= 0 || rd <= 0) break;
    sim._box(x + r, h + r, z + r, rw, 1, rd, roofMat, 1, roof);
  }
  if (porch) {
    const { dir = -1, xs = [], h: ph = Math.min(h - 1, 3) } = porch;
    const pz = dir < 0 ? z - 1 : z + d;
    for (const px of xs) sim._box(px, 0, pz, 1, ph, 1, 'steel', 1, plate);
    sim._box(x, ph, pz, w, 1, 1, 'concrete', 1, plate);
  }
}

// Monument: a stepped stone plinth with a figure standing on it. Solid all the
// way up — a statue is two dozen blocks and hollowing it buys nothing but a
// support path that can fail. `figW`/`figD` narrow the figure so the plinth
// still reads as a plinth from the ground.
export function statue(sim, o) {
  const {
    x, z, h = 4, plinth = 1.5, w = 1, d = 1, figW = w, figD = d,
    stone = 0x9a9184, bronze = 0x4a5f46, mat = 'panel',
  } = o;
  const S = 0.5;
  const nx = Math.round(w / S), nz = Math.round(d / S);
  const fx = Math.max(1, Math.round(figW / S)), fz = Math.max(1, Math.round(figD / S));
  sim._box(x - S, 0, z - S, nx + 2, 1, nz + 2, 'concrete', S, stone);
  for (let y = S; y < plinth; y += S) sim._box(x, y, z, nx, 1, nz, 'concrete', S, stone);
  const ox = x + Math.floor((nx - fx) / 2) * S, oz = z + Math.floor((nz - fz) / 2) * S;
  for (let y = plinth; y < h; y += S) sim._box(ox, y, oz, fx, 1, fz, mat, S, bronze);
}

// Deterministic tree scatter over a rect. Woodland is dozens of trees and the
// scenes are pure sim, so the jitter is a fixed hash of the grid index — same
// grove every run, on the 0.5 m grid `tree()` needs. The step/jitter defaults
// keep neighbouring canopies (1.5 m wide) at least 0.5 m apart.
// A canopy spans [tx - 0.5, tx + 1.0] on both axes — the trunk is not centred
// in it. Exported because every caller that wants to keep two groves from
// growing through each other has to test that exact rect, not a point.
export const TREE_FOOTPRINT = { dx: -0.5, dz: -0.5, w: 1.5, d: 1.5 };

export function treeGrove(sim, o) {
  const { x, z, w, d, step = 3, jitter = 0.5, skip = null, note = null } = o;
  const nx = Math.floor(w / step), nz = Math.floor(d / step);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const tx = x + 0.5 + i * step + ((i * 7 + k * 13) % 3) * jitter;
      const tz = z + 0.5 + k * step + ((i * 5 + k * 11) % 3) * jitter;
      if (skip && skip(tx, tz)) continue;
      tree(sim, tx, tz);
      if (note) note(tx, tz);
    }
  }
}

// --- PASS 2: the park's BUILT vocabulary --------------------------------------
// Central Park's structures are follies, terraces, bridges and bandshells, and
// not one of them is a building in the C3/C4 sense — a folly is a statue with
// rooms in it. Everything below keeps the kit's contract: one primitive call
// site per builder, parametric, and standing by construction.
//
// Several drop to 0.5 m bricks where the real footprint is three or four metres
// across. That is not detail for its own sake: tower() needs w,d >= 3 or it
// reads every cell as a corner, so a 5 x 5 m crag carrying a tower AND a wing
// AND a terrace is simply not expressible at 1 m.

// Battlemented crown: a full cap plate with alternating merlons standing on it.
// The plate is what makes it legal — merlons on a bare wall RING each sit over
// a hollow interior cell with nothing under them.
export function crenellation(sim, o) {
  const { x, y, z, w, d, s = 1, mat = 'concrete', color = 0x8a8478, step = 2 } = o;
  const nx = Math.round(w / s), nz = Math.round(d / s);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const edge = i === 0 || i === nx - 1 || k === 0 || k === nz - 1;
      if (!edge) continue;
      const along = (k === 0 || k === nz - 1) ? i : k;
      if (along % step !== 0) continue;
      sim._block(x + i * s, y, z + k * s, mat, s, color);
    }
  }
}

// Scottish-Gothic folly on a schist crag — Belvedere Castle, and the shape any
// park's "castle" wants. The crag is INSIDE the builder rather than a separate
// rockMound call because the castle's floor level IS the crag's top course;
// splitting them across two call sites is how a tower ends up a metre in the
// air, or a metre inside the rock.
//
// The tower is 1 m (it is the mass, and the second-highest point in the park);
// the wing, terrace and balustrade are 0.5 m because the crown they stand on is
// only five metres across. Same grey for rock and walls, deliberately.
export function castleFolly(sim, o) {
  const {
    x, z, w = 5, d = 5, cragH = 3, towerW = 3, towerD = 3, towerH = 6,
    wingH = 4, terraceD = 2, rock = 0x6b675e, rockCrown = 0x746f66,
    stone = 0x6c6760, trim = 0xa39c8e, roof = 0x49505a, merlon = 0x7d776b,
  } = o;
  const S = 0.5;
  for (let y = 0; y < cragH; y++) {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) {
        sim._block(x + i, y, z + k, 'concrete', 1, y === cragH - 1 ? rockCrown : rock);
      }
    }
  }
  const ty = cragH;
  tower(sim, x, z, towerW, towerD, ty, ty + towerH, 'masonry', 'concrete', stone);
  sim._box(x, ty + towerH, z, towerW, 1, towerD, 'concrete', 1, trim);
  crenellation(sim, { x, y: ty + towerH + 1, z, w: towerW, d: towerD, color: merlon });
  // lower pavilion east of the tower: 0.5 m shell, full plate, hipped cap
  const wx = x + towerW, ww = w - towerW, wd = Math.min(d, towerD);
  const nwx = Math.round(ww / S), nwz = Math.round(wd / S), nwy = Math.round(wingH / S);
  for (let j = 0; j < nwy; j++) {
    for (let i = 0; i < nwx; i++) {
      for (let k = 0; k < nwz; k++) {
        if (!(i === 0 || i === nwx - 1 || k === 0 || k === nwz - 1)) continue;
        const win = j > 1 && j % 3 === 2 && (i + k) % 3 === 1;
        sim._block(wx + i * S, ty + j * S, z + k * S, win ? 'glass' : 'concrete', S, win ? undefined : stone);
      }
    }
  }
  for (let i = 0; i < nwx; i++) {
    for (let k = 0; k < nwz; k++) sim._block(wx + i * S, ty + wingH, z + k * S, 'concrete', S, trim);
  }
  for (let i = 1; i < nwx - 1; i++) {
    for (let k = 1; k < nwz - 1; k++) sim._block(wx + i * S, ty + wingH + S, z + k * S, 'panel', S, roof);
  }
  // open terrace on the remaining crown, one 0.5 m course proud of the crag
  const tz = z + Math.min(d, towerD), td = Math.min(terraceD, d - towerD);
  if (td > 0) {
    const ntx = Math.round(w / S), ntz = Math.round(td / S);
    for (let i = 0; i < ntx; i++) {
      for (let k = 0; k < ntz; k++) sim._block(x + i * S, ty, tz + k * S, 'concrete', S, trim);
    }
    for (let i = 0; i < ntx; i++) {
      for (let k = 0; k < ntz; k++) {
        if (!(k === ntz - 1 || i === 0 || i === ntx - 1) || (i + k) % 2) continue;
        sim._block(x + i * S, ty + S, tz + k * S, 'concrete', S, merlon);
      }
    }
  }
  return { top: ty + towerH + 2 };
}

// Open-air amphitheatre: a fan of solid seating tiers rising away from a stage
// box, with a light-rigging mast behind it. Every tier is its own
// ground-anchored column from grade to its own height — the naive version (a
// stepped plate on legs) puts each riser one horizontal hop past the last and
// the back rows drop at spawn.
export function amphitheater(sim, o) {
  const {
    x, z, w, d, rows = 6, rise = 0.5, stageW = 1.5, stageH = 3, towerH = 6,
    seat = 0x3c4a42, stage = 0x74736c, mast = 0x2f3640, fence = 0x2c3a30,
  } = o;
  const S = 0.5;
  const nz = Math.round(d / S);
  const nsx = Math.round(stageW / S), nsy = Math.round(stageH / S);
  for (let i = 0; i < nsx; i++) {
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < nsy; j++) sim._block(x + i * S, j * S, z + k * S, 'concrete', S, stage);
    }
  }
  for (let j = 0; j < Math.round((towerH - stageH) / S); j++) {
    for (const k of [1, nz - 2]) sim._block(x, stageH + j * S, z + k * S, 'steel', S, mast);
  }
  for (let k = 1; k <= nz - 2; k++) sim._block(x, towerH, z + k * S, 'steel', S, mast);
  const x0 = x + stageW;
  for (let r = 0; r < rows; r++) {
    const h = (r + 1) * rise;
    const flare = Math.min(Math.floor(nz / 2) - 1, Math.max(0, Math.floor((rows - 1 - r) / 2)));
    for (let k = flare; k < nz - flare; k++) {
      for (let j = 0; j < Math.round(h / S); j++) sim._block(x0 + r * S, j * S, z + k * S, 'concrete', S, seat);
    }
  }
  const fx = x0 + rows * S, fw = Math.max(0, Math.round((w - stageW - rows * S) / S));
  for (let i = 0; i < fw; i++) {
    for (const k of [0, nz - 1]) {
      for (let j = 0; j < 3; j++) sim._block(fx + i * S, j * 0.25, z + k * S, 'wood', 0.25, fence);
    }
  }
  return { top: towerH + S };
}

// Tapered stone shaft on a stepped plinth: Cleopatra's Needle, the USS Maine
// pylon, a memorial column. Each narrower course sits wholly on the one below,
// so the whole thing is a vertical stack with no horizontal hop in it anywhere.
export function obelisk(sim, o) {
  const {
    x, z, h = 6, s = 0.5, baseW = 2, baseH = 1, shaftW = 1, taper = 0,
    taperEvery = 4, cap = true, stone = 0x8a5f4a, capColor = 0xb99a63,
    plinth = 0x9a9184, mat = 'concrete',
  } = o;
  const nb = Math.round(baseW / s), nbh = Math.max(1, Math.round(baseH / s));
  for (let j = 0; j < nbh; j++) {
    const k = Math.min(j, Math.floor((nb - 1) / 2));
    for (let i = k; i < nb - k; i++) {
      for (let m = k; m < nb - k; m++) sim._block(x + i * s, j * s, z + m * s, mat, s, plinth);
    }
  }
  const nsw0 = Math.round(shaftW / s);
  const org = ((nb - nsw0) / 2) * s;
  const rows = Math.round((h - baseH) / s);
  let nsw = nsw0;
  for (let j = 0; j < rows; j++) {
    if (taper > 0 && j > 0 && j % taperEvery === 0 && nsw > 1) nsw -= taper;
    const off = ((nsw0 - nsw) / 2) * s;
    const top = cap && j >= rows - 2;
    for (let i = 0; i < nsw; i++) {
      for (let m = 0; m < nsw; m++) {
        sim._block(x + org + off + i * s, baseH + j * s, z + org + off + m * s, mat, s, top ? capColor : stone);
      }
    }
  }
}

// Broad ceremonial stair. Every tread is a solid column from grade to its own
// height (the stoop rule at terrace scale), flanked by cheek walls, so a stair
// can never be the thing that falls. `dir` is the direction it climbs.
export function grandStair(sim, o) {
  const {
    x, z, w, steps = 6, s = 0.5, dir = 1, axis = 'z', y0 = 0,
    stone = 0xb0a184, cheek = 0x9a8d72, mat = 'concrete',
  } = o;
  const n = Math.round(w / s);
  for (let i = 0; i < steps; i++) {
    const u = dir > 0 ? i * s : -(i + 1) * s;
    for (let k = -1; k <= n; k++) {
      const wall = k < 0 || k === n;
      for (let j = 0; j < i + 1 + (wall ? 1 : 0); j++) {
        const bx = axis === 'z' ? x + k * s : x + u;
        const bz = axis === 'z' ? z + u : z + k * s;
        sim._block(bx, y0 + j * s, bz, mat, s, wall ? cheek : stone);
      }
    }
  }
  return { top: y0 + steps * s };
}

// Carved stone balustrade: a continuous coping rail carried on short balusters,
// with heavier newel piers at a fixed pitch. Same physics as fenceRun — the
// coping is a continuous run of cells, never one cell per bay — but in masonry,
// at terrace scale, with the pier cells standing a course above the coping.
export function balustrade(sim, o) {
  const {
    x, z, len, axis = 'x', s = 0.25, h = 0.75, y0 = 0, pierEvery = 2,
    mat = 'concrete', color = 0xb0a184, pierColor = 0x9a8d72,
  } = o;
  const n = Math.round(len / s), rail = Math.max(2, Math.round(h / s));
  const per = Math.max(1, Math.round(pierEvery / s));
  for (let i = 0; i < n; i++) {
    const bx = axis === 'x' ? x + i * s : x;
    const bz = axis === 'x' ? z : z + i * s;
    const pier = i % per === 0;
    for (let j = 0; j < rail + (pier ? 1 : 0); j++) {
      if (j < rail - 1 && !pier && i % 2) continue;    // open between the balusters
      sim._block(bx, y0 + j * s, bz, mat, s, pier ? pierColor : color);
    }
  }
}

// Park bridge: a corbelled stoneArch plus the parapet that makes it read as a
// bridge rather than a wall with a hole in it. The rail sits ON the deck plate
// (never one cell past its edge), and the urn planters are extra cells stacked
// on rail cells, so nothing in here has a horizontal-only support path.
//
// One builder covers all four named crossings because they differ by PALETTE
// and proportion, not by structure: Bow is cream cast iron on a long shallow
// arch, Gapstow squat schist, Oak white timber, Glen Span rough boulder.
export function archBridge(sim, o) {
  const {
    x, z, span, width = 2, rise = 3, axis = 'x', pier = 2, spring = 0, y0 = 0,
    mat = 'concrete', color = 0x6b6560, deckColor = 0x7d7468, soffit = null,
    railMat = 'steel', rail = 0xe8e2d2, railH = 0.75, urnEvery = 0, urn = rail,
  } = o;
  stoneArch(sim, { x, z, span, width, rise, axis, pier, spring, y0, mat, color, deckColor, soffit });
  const L = pier * 2 + span, s = 0.25, deckY = y0 + rise + 1;
  const nRail = Math.round(railH / s);
  for (let u = 0; u < L; u += s) {
    for (const v of [0, width - s]) {
      const bx = axis === 'x' ? x + u : x + v;
      const bz = axis === 'x' ? z + v : z + u;
      // Ornate pierced railing: every other cell is open above the bottom bar,
      // and the bar itself is continuous so the open cells are tied in.
      const solid = Math.round(u / s) % 2 === 0;
      for (let j = 0; j < nRail; j++) {
        if (j > 0 && !solid) continue;
        sim._block(bx, deckY + j * s, bz, railMat, s, rail);
      }
      if (urnEvery > 0 && Math.abs(u % urnEvery) < 1e-9) {
        for (let j = nRail; j < nRail + 2; j++) sim._block(bx, deckY + j * s, bz, railMat, s, urn);
      }
    }
  }
  return { deckY };
}

// Tiered circular fountain: a solid stepped stone cone of shrinking discs with
// a figure standing on the crown. Solid rather than a ring of basins because
// every disc then sits wholly on the one below — a hollow bowl on a pedestal is
// a plate cantilevered off a single column and it drops at spawn.
export function tieredFountain(sim, o) {
  const {
    cx, cz, r = 1.75, s = 0.5, tiers = 3, tierDrop = 0.5, figureH = 0,
    stone = 0xb0a184, rim = 0x9a8d72, bronze = 0x2f4a40, jet = 0xd8e4e8,
  } = o;
  const put = (x, y, zz, m, c) => sim._block(x, y, zz, m, s, c);
  for (let t = 0; t < tiers; t++) {
    const rr = (r - t * tierDrop) / s;
    for (let ix = -Math.ceil(rr); ix < Math.ceil(rr); ix++) {
      for (let iz = -Math.ceil(rr); iz < Math.ceil(rr); iz++) {
        const dr = Math.hypot(ix + 0.5, iz + 0.5);
        if (dr > rr) continue;
        put(cx + ix * s, t * s, cz + iz * s, 'concrete', dr > rr - 1 ? rim : stone);
      }
    }
  }
  // The angel: a bronze figure on the crown with one arm out. The arm is a
  // horizontal pair at the shoulder's own level, never a cell hung off it.
  if (figureH > 0) {
    const y0 = tiers * s;
    for (let y = y0; y < y0 + figureH; y += s) put(cx, y, cz, 'panel', bronze);
    const sh = y0 + figureH - s;
    put(cx + s, sh, cz, 'panel', bronze);
    put(cx - s, sh, cz, 'panel', bronze);
    put(cx + s, sh, cz + s, 'panel', bronze);           // the outstretched arm
    put(cx, y0 + figureH, cz, 'panel', jet);            // the lily / spray
  }
}

// Neoclassical bandshell: a straight drum closing three sides of a semicircle,
// then a CORBELLED half-dome — each course is a ring one cell smaller than the
// one below, so every cell sits directly on masonry. A true hemisphere is
// impossible here for the usual reason: its lower courses would overhang.
export function halfDomeShell(sim, o) {
  const {
    cx, cz, r = 3.5, s = 0.5, drum = 3, dir = -1, thick = 3,
    stone = 0xd8d0ba, coffer = 0xc0b79f, mat = 'concrete',
  } = o;
  const rr = Math.round(r / s);
  const ring = (rad, y, color) => {
    for (let ix = -rad; ix <= rad; ix++) {
      for (let iz = -rad; iz <= rad; iz++) {
        const dr = Math.hypot(ix + 0.5, iz + 0.5);
        if (dr > rad || dr < rad - thick) continue;
        if (dir < 0 ? iz > 0 : iz < -1) continue;          // the open face
        sim._block(cx + ix * s, y, cz + iz * s, mat, s, color);
      }
    }
  };
  for (let j = 0; j < Math.round(drum / s); j++) ring(rr, j * s, stone);
  let rad = rr;
  for (let j = 0; rad > thick; j++) {
    rad -= 1;
    ring(rad, drum + j * s, j % 2 ? coffer : stone);
  }
  return { top: drum + (rr - thick) * s };
}

// The Mall's elm tunnel: two rows of trunks whose crowns MEET overhead, built
// as a corbelled leaf vault rather than two separate canopies.
//
// Leaf has maxSpan 1, so a 0.5 m leaf cell reaches exactly two hops from
// whatever supports it vertically. Course 0 sits on the trunk tops and reaches
// 1 m; course 1 sits on course 0 and reaches 2 m; course 2 reaches 3 m. With
// the rows `gap` apart the vault closes at course ceil(gap/2) - 1. Trunks must
// be <= 2 m apart ALONG the run for the same reason, or the vault has holes
// between them — the budget is Manhattan distance, and the along-run offset
// spends from the same 1 m as the cross-run one.
export function elmTunnel(sim, o) {
  const {
    x, z, len, axis = 'z', gap = 5, step = 1.5, courses = 3, overhang = 1,
    trunkH = 2, trunk = 0x6a4f38, leaf = 0x3f7a3a, leaf2 = 0x356b32, skip = null,
  } = o;
  const S = 0.5;
  const put = (u, y, v, m, c) => (axis === 'z'
    ? sim._block(x + v, y, z + u, m, S, c)
    : sim._block(x + u, y, z + v, m, S, c));
  const trunks = [];
  for (let u = 0; u + 0.01 < len; u += step) {
    for (const v of [0, gap]) {
      if (skip) {
        const tx = axis === 'z' ? x + v : x + u;
        const tz = axis === 'z' ? z + u : z + v;
        if (skip(tx, tz)) continue;
      }
      trunks.push([u, v]);
      for (let y = 0; y < trunkH; y += S) put(u, y, v, 'wood', trunk);
    }
  }
  if (!trunks.length) return;
  const nCross = Math.round((gap + 2 * overhang) / S);
  const nAlong = Math.round(len / S);
  for (let j = 0; j < courses; j++) {
    const reach = j + 1;
    for (let iu = 0; iu < nAlong; iu++) {
      for (let iv = 0; iv <= nCross; iv++) {
        const u = iu * S, v = -overhang + iv * S;
        let best = Infinity;
        for (const [tu, tv] of trunks) best = Math.min(best, Math.abs(u - tu) + Math.abs(v - tv));
        if (best > reach + 1e-9) continue;
        put(u, trunkH + j * S, v, 'leaf', (iu + iv) % 3 ? leaf : leaf2);
      }
    }
  }
}

// Round brick drum with a conical roof: the Carousel building, and any small
// rotunda. The cap is a SOLID plate (concrete, so its centre stays inside the
// 3 m span from the ring) and the cone is a stack of shrinking discs, each one
// wholly on the disc below.
export function roundHouse(sim, o) {
  const {
    cx, cz, r = 2.5, h = 3.5, s = 0.5, wallMat = 'brick', wall = 0xa8452f,
    plate = 0x8a6a4a, roof = 0xc4552f, cone = 4, finial = 0xe0c46a, arches = 6,
  } = o;
  const rr = Math.round(r / s);
  for (let j = 0; j < Math.round(h / s); j++) {
    for (let ix = -rr; ix < rr; ix++) {
      for (let iz = -rr; iz < rr; iz++) {
        const dr = Math.hypot(ix + 0.5, iz + 0.5);
        if (dr > rr || dr < rr - 1) continue;
        // open arched bays, but never in the top two courses — those are the
        // lintel band that carries the cap plate all the way round
        const bay = Math.floor(((Math.atan2(iz + 0.5, ix + 0.5) + Math.PI) / (Math.PI * 2)) * arches * 2);
        const open = bay % 2 === 1 && j > 0 && j < Math.round(h / s) - 2;
        if (open) continue;
        sim._block(cx + ix * s, j * s, cz + iz * s, wallMat, s, wall);
      }
    }
  }
  for (let ix = -rr; ix < rr; ix++) {
    for (let iz = -rr; iz < rr; iz++) {
      if (Math.hypot(ix + 0.5, iz + 0.5) > rr) continue;
      sim._block(cx + ix * s, h, cz + iz * s, 'concrete', s, plate);
    }
  }
  for (let c = 1; c <= cone; c++) {
    const cr = rr - c;
    if (cr <= 0) break;
    for (let ix = -cr; ix < cr; ix++) {
      for (let iz = -cr; iz < cr; iz++) {
        if (Math.hypot(ix + 0.5, iz + 0.5) > cr) continue;
        sim._block(cx + ix * s, h + c * s, cz + iz * s, 'panel', s, roof);
      }
    }
  }
  sim._block(cx - s / 2 + s / 2, h + (cone + 1) * s, cz, 'panel', s, finial);
  return { top: h + (cone + 2) * s };
}

// Small ornate gazebo / open pavilion: posts, a full plate on the post tops,
// and a stepped peaked roof. The plate is what lets the roof exist — a peak
// resting on four post tops alone has nothing under its middle.
export function gazebo(sim, o) {
  const {
    x, z, w = 2, d = 2, h = 2.5, s = 0.5, postMat = 'steel', post = 0xe0dcc8,
    plate = 0xd0c8b0, roof = 0x8a4a3c, peak = 2, octagon = false,
  } = o;
  const nx = Math.round(w / s), nz = Math.round(d / s);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const edge = i === 0 || i === nx - 1 || k === 0 || k === nz - 1;
      const corner = (i === 0 || i === nx - 1) && (k === 0 || k === nz - 1);
      if (octagon && corner) continue;                    // clipped corners
      if (!edge || (i + k) % 2) continue;
      for (let y = 0; y < h; y += s) sim._block(x + i * s, y, z + k * s, postMat, s, post);
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) sim._block(x + i * s, h, z + k * s, 'concrete', s, plate);
  }
  for (let c = 1; c <= peak; c++) {
    for (let i = c; i < nx - c; i++) {
      for (let k = c; k < nz - c; k++) sim._block(x + i * s, h + c * s, z + k * s, 'panel', s, roof);
    }
  }
  return { top: h + (peak + 1) * s };
}

// Flood-light mast: a steel pole with a head plate and lamp box. Taller than
// lampPost and structurally the same idea — the glass lens sits on steel.
export function lightMast(sim, x, z, h = 5, color = 0x39414d) {
  const s = 0.25;
  for (let y = 0; y < h; y += s) sim._block(x, y, z, 'steel', s, color);
  for (const [dx, dz] of [[0, 0], [-s, 0], [s, 0], [0, -s], [0, s]]) {
    sim._block(x + dx, h, z + dz, 'steel', s, color);
    sim._block(x + dx, h + s, z + dz, 'glass', s);
  }
}

// Moored rowboat: a 0.5 m hull with a thwart. Sits at grade INSIDE a water
// rect — the water plane is render-only decor, so the hull reads as floating in
// it while the physics still has it standing on the lake bed.
export function rowBoat(sim, x, z, axis = 'x', color = 0x2f6b3a) {
  const S = 0.5;
  for (let i = 0; i < 3; i++) {
    const bx = axis === 'x' ? x + i * S : x;
    const bz = axis === 'x' ? z : z + i * S;
    sim._block(bx, 0, bz, 'wood', S, color);
  }
  const mx = axis === 'x' ? x + S : x, mz = axis === 'x' ? z : z + S;
  sim._block(mx, S, mz, 'wood', S, 0xd8cfae);
}

// Model sailboat for a formal boat pond: 0.25 m hull, a mast, and a panel sail.
// The sail is beside the mast at the mast's own levels, never hung off its top.
export function sailBoat(sim, x, z, sail = 0xf2ede2, hull = 0x7a3a2e) {
  const s = 0.25;
  for (let i = 0; i < 2; i++) sim._block(x + i * s, 0, z, 'wood', s, hull);
  for (let j = 1; j <= 4; j++) sim._block(x, j * s, z, 'wood', s, hull);
  for (let j = 1; j <= 3; j++) sim._block(x + s, j * s, z, 'panel', s, sail);
}

// Playground: a stepped slide, a swing frame with a continuous top beam, and a
// climbing cube. Bright primaries — this is the one place in a park that is
// allowed to shout.
export function playgroundSet(sim, o) {
  const {
    x, z, s = 0.25, slide = 0xf2c14e, frame = 0xc23b2e, climb = 0x2a7fb8, deck = 0x3ddc84,
  } = o;
  for (let i = 0; i < 5; i++) {                            // slide: solid stepped ramp
    for (let j = 0; j <= i; j++) sim._block(x + i * s, j * s, z, 'panel', s, i === 4 ? deck : slide);
  }
  // The run-out is a stepped SOLID ramp too. A single descending cell per step
  // has no cell under it and only a diagonal neighbour, so it drops at spawn.
  for (let i = 1; i <= 4; i++) {
    for (let j = 0; j <= 4 - i; j++) sim._block(x + 4 * s + i * s, j * s, z, 'panel', s, slide);
  }
  const sx = x + 2.5;                                      // clear of the slide's run-out
  for (const px of [sx, sx + 1.25]) {                      // swing frame
    for (let j = 0; j < 6; j++) sim._block(px, j * s, z, 'steel', s, frame);
  }
  for (let u = 0; u <= 1.25 + 1e-9; u += s) sim._block(sx + u, 1.5, z, 'steel', s, frame);
  const cx = x + 4;                                        // climbing cube
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        if (!(i === 0 || i === 3 || k === 0 || k === 3)) continue;
        // Alternate in PLAN, never in section: a checkerboard that alternates
        // with height leaves every other cell with no cell below it and no
        // same-level neighbour either, and the whole climber falls at spawn.
        if ((i + k) % 2) continue;
        sim._block(cx + i * s, j * s, z + k * s, 'steel', s, climb);
      }
    }
  }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) sim._block(cx + i * s, 1, z + k * s, 'panel', s, deck);
}

// Drinking fountain and a park signpost pillar — the two smallest things a park
// path has, and the cheapest isolated props a SIZE 1 hole can actually bite.
export function drinkingFountain(sim, x, z, color = 0x2f4a3a) {
  const s = 0.25;
  for (let j = 0; j < 3; j++) sim._block(x, j * s, z, 'steel', s, color);
  sim._block(x, 0.75, z, 'panel', s, 0xb8bec6);
  sim._block(x + s, 0.5, z, 'steel', s, color);
}

// Gilded equestrian group: plinth, horse body, neck, and rider. The rider sits
// on the horse's back cell, the neck on the body's front cell — every part has
// a cell directly beneath it.
export function equestrian(sim, o) {
  const {
    x, z, h = 3, s = 0.5, w = 1.5, d = 1, axis = 'x',
    stone = 0xb59a6a, bronze = 0xc9a227,
  } = o;
  const nx = Math.round(w / s), nz = Math.round(d / s);
  sim._box(x - s, 0, z - s, nx + 2, 1, nz + 2, 'concrete', s, stone);
  for (let y = s; y < h; y += s) sim._box(x, y, z, nx, 1, nz, 'concrete', s, stone);
  const bx = axis === 'x' ? x : x, bz = z;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) sim._block(bx + i * s, h, bz + k * s, 'panel', s, bronze);
  }
  sim._block(bx + (nx - 1) * s, h + s, bz, 'panel', s, bronze);          // neck
  sim._block(bx + (nx - 1) * s, h + 2 * s, bz, 'panel', s, bronze);      // head
  sim._block(bx + s, h + s, bz, 'panel', s, bronze);                     // rider
  sim._block(bx + s, h + 2 * s, bz, 'panel', s, bronze);
  return { top: h + 3 * s };
}

// Circular mosaic medallion, as DECOR rects rather than blocks: a flush terrazzo
// disc has no volume, and a 0.25 m block field would be an ankle-high plinth.
// Radiating segments in two high-contrast tones plus a solid centre, so it stays
// legible from the chase camera's overhead framing.
export function mosaicDisc(cx, cz, r, opts = {}) {
  const { step = 0.25, colors = [0x14161a, 0xe8e4da], segments = 12, core = 1 } = opts;
  const out = [];
  const n = Math.ceil(r / step);
  for (let ix = -n; ix < n; ix++) {
    for (let iz = -n; iz < n; iz++) {
      const px = (ix + 0.5) * step, pz = (iz + 0.5) * step;
      const dr = Math.hypot(px, pz);
      if (dr > r) continue;
      const seg = Math.floor(((Math.atan2(pz, px) + Math.PI) / (Math.PI * 2)) * segments);
      const inner = dr < r * 0.34;
      out.push({
        x: cx + ix * step, z: cz + iz * step, w: step, d: step,
        color: inner ? colors[core] : colors[seg % 2],
      });
    }
  }
  return out;
}

// --- PASS 3: the perimeter city ------------------------------------------------
// Upper Manhattan's avenues are not a handful of landmarks — they are hundreds
// of metres of continuous STREET WALL with five or six famous silhouettes
// punched out of it. Authoring that as inline loops would be thousands of lines
// of near-duplicate nesting, so the wall gets a vocabulary: a tiered apartment
// mass, a run of them, a crowned tower, a mansard, a portico, and the handful of
// one-off shapes (the Guggenheim's inverted spiral, the Hayden sphere, a Gothic
// nave, an elevated railway) that no amount of parameters folds into the rest.
//
// Determinism note: every "varied" run below indexes fixed tables through a pure
// integer hash of the run position, never rng — same wall, every run.
const hash2 = (a, b) => {
  let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
  h ^= h >>> 13; h = (h * 1274126177) | 0; h ^= h >>> 16;
  return (h >>> 0);
};

// Pre-war apartment / office mass: one or more setback tiers, each closed by an
// explicit full slab plate, plus the deep street cornice, an optional rooftop
// water tower and an optional fire escape.
//
// The cap plate is the load-bearing decision. voxel.md rule 6: a tier whose top
// LAYER is a wall ring leaves the next tier's base plate floating over hollow
// interior. Capping every tier means a caller can pick any tier height at all
// instead of hunting for one congruent to the wall's slab period.
//
// `tiers` is `[{ h, inset, color }]`, each inset measured from the tier below.
// Returns `{ top, x, z, w, d }` — the roof surface and the crowning footprint —
// so a caller stacking a tower on it never re-derives them.
export function setbackTower(sim, o) {
  const {
    ox, oz, w, d, tiers = [{ h: 12 }], kind = 'masonry', wallMat = 'brick',
    wall = 0x9a8468, roof = 0x5f5a52, base = null, baseH = 2,
    cornice = null, corniceS = 0.5, corniceDir = -1, corniceAxis = 'x',
    water = false, waterTint = 0x6f5238, escape = 0, escapeDir = -1, escapeAt = 2,
  } = o;
  let y = 0, cx = ox, cz = oz, cw = w, cd = d, corniceY = null;
  for (let t = 0; t < tiers.length; t++) {
    // Insets are per-axis because a 4 m-deep street wall cannot afford a
    // symmetric one: tower() reads EVERY cell of a 2-wide footprint as a
    // corner, so the setback tier would come out solid steel.
    const { h, inset = 0, insetX = inset, insetZ = inset, color } = tiers[t];
    cx += insetX; cz += insetZ; cw -= insetX * 2; cd -= insetZ * 2;
    if (cw < 3 || cd < 3 || h < 1) break;
    // A limestone water table under the brick: the bottom courses are their own
    // TIER in a different material with their own floor slab on top, never a
    // repaint of cells the wall already owns. `_block` does not paint — a second
    // block written into an occupied fine cell overwrites the first, and the
    // loser is a ghost that is unreachable in the support BFS and drops at
    // spawn. That single mistake ghosted 25k cells during authoring.
    const split = base !== null && t === 0 && h > baseH + 2;
    if (split) {
      tower(sim, cx, cz, cw, cd, y, y + baseH, kind, 'concrete', base);
      for (let i = 0; i < cw; i++) for (let k = 0; k < cd; k++) sim._block(cx + i, y + baseH, cz + k, 'concrete', 1, base);
      tower(sim, cx, cz, cw, cd, y + baseH + 1, y + h, kind, wallMat, color ?? wall);
    } else {
      tower(sim, cx, cz, cw, cd, y, y + h, kind, wallMat, color ?? wall);
    }
    for (let i = 0; i < cw; i++) {
      for (let k = 0; k < cd; k++) {
        sim._block(cx + i, y + h, cz + k, 'concrete', 1, t === tiers.length - 1 ? roof : (color ?? wall));
      }
    }
    if (t === 0) corniceY = y + h;
    y = y + h + 1;
  }
  // Street cornice: a projecting band at the FIRST tier's cap, which is the
  // continuous shadow line a whole avenue reads by. It sits at the cap plate's
  // own level and one cell outboard, so every cornice cell is orthogonally
  // adjacent on the fine grid to the plate carrying it.
  if (cornice !== null && corniceY !== null) {
    const s = corniceS;
    const n = Math.round((corniceAxis === 'x' ? w : d) / s);
    for (let i = 0; i < n; i++) {
      const u = i * s;
      const bx = corniceAxis === 'x' ? ox + u : (corniceDir < 0 ? ox - s : ox + w);
      const bz = corniceAxis === 'x' ? (corniceDir < 0 ? oz - s : oz + d) : oz + u;
      sim._block(bx, corniceY, bz, 'brick', s, cornice);
      sim._block(bx, corniceY + s, bz, 'brick', s, cornice);
    }
  }
  if (water && cw >= 4 && cd >= 4) waterTower(sim, cx + 1, y, cz + 1, waterTint);
  if (escape > 0 && w >= 4) {
    // Landings on SLAB layers only (y % 3 === 0 against masonry's slabEvery 3):
    // a landing hung off a window course has glass as its only horizontal
    // neighbour, and glass carries nothing.
    fireEscape(sim, ox + escapeAt, escapeDir < 0 ? oz : oz + d, escape, escapeDir, 2, 3, 3);
  }
  return { top: y, x: cx, z: cz, w: cw, d: cd };
}

// A run of setbackTowers filling a street-wall band. The three neighbourhood
// "tells" in the geography plan are all properties of the RUN — the Upper West
// Side is jagged, the Upper East Side is a dead-flat line for blocks at a time,
// Harlem is four storeys and one cornice — so the rhythm lives here rather than
// in any single building.
//
// `axis` is the direction the wall runs; `front` says which side the street is
// on (-1 = the lower cross-coordinate). Returns the footprints it placed.
export function streetWall(sim, o) {
  const {
    x, z, len, depth, axis = 'z', front = -1, unit = 5, gap = 0,
    heights = [13], colors = [0x9a8468], roofColors = [0x5f5a52], setback = 0,
    kind = 'masonry', wallMat = 'brick', cornice = null, base = null,
    water = 0, escape = 0, seed = 0, skip = null, jitter = 0,
  } = o;
  const out = [];
  const n = Math.floor(len / unit);
  for (let i = 0; i < n; i++) {
    const u = i * unit;
    const ox = axis === 'z' ? x : x + u;
    const oz = axis === 'z' ? z + u : z;
    const w = axis === 'z' ? depth : unit - gap;
    const d = axis === 'z' ? unit - gap : depth;
    if (skip && skip(ox, oz, w, d)) continue;
    const hsh = hash2(i + seed * 977, Math.round(x * 4) ^ Math.round(z * 4));
    let h = heights[hsh % heights.length];
    if (jitter) h += (hsh >>> 5) % (jitter + 1);
    // The setback insets along the RUN only: across the run a street wall is
    // three or four metres deep and there is nothing to give back.
    const tiers = setback && h > setback + 4
      ? [{ h: h - setback - 1 }, { h: setback, insetX: axis === 'z' ? 0 : 1, insetZ: axis === 'z' ? 1 : 0 }]
      : [{ h }];
    const r = setbackTower(sim, {
      ox, oz, w, d, tiers, kind, wallMat,
      wall: colors[(hsh >>> 9) % colors.length],
      roof: roofColors[(hsh >>> 13) % roofColors.length],
      base, cornice, corniceDir: front, corniceAxis: axis === 'z' ? 'z' : 'x',
      water: water > 0 && i % water === 0,
      escape: escape > 0 && i % escape === 1 ? Math.max(2, Math.floor(h / 4)) : 0,
      // The escape always hangs on the face the CORNICE is not on. For a run
      // along z they are already on different axes; for a run along x they
      // would share the same face, and a landing and a cornice band at the same
      // height want exactly the same cells.
      escapeDir: axis === 'z' ? -1 : -front,
    });
    out.push({ x: ox, z: oz, w, d, top: r.top });
  }
  return out;
}

// Tower crown. Central Park West's fame is exactly this: the towers themselves
// are ordinary slabs and the CAP is the recognition point, so the cap is the
// parameter. Every style stands on the plate handed in as `y`.
export function towerCrown(sim, o) {
  const { ox, oz, w, d, y, style = 'flat', color = 0xb8ae94, accent = 0x8a7f6a } = o;
  const S = 0.5;
  const plate = (px, pz, pw, pd, py, m, c, s = 1) => {
    for (let i = 0; i < Math.round(pw / s); i++) {
      for (let k = 0; k < Math.round(pd / s); k++) sim._block(px + i * s, py, pz + k * s, m, s, c);
    }
  };
  if (style === 'deco') {
    for (let r = 1; r <= 2; r++) {
      const rw = w - 2 * r * S, rd = d - 2 * r * S;
      if (rw <= 0 || rd <= 0) break;
      plate(ox + r * S, oz + r * S, rw, rd, y + (r - 1) * S, 'concrete', r === 1 ? color : accent, S);
    }
    for (let i = 0; i < 4; i++) sim._block(ox + w / 2 - 0.125, y + 1 + i * 0.25, oz + d / 2 - 0.125, 'steel', 0.25, accent);
  } else if (style === 'temple') {
    // The San Remo's open circular temple: a ring of columns under a disc roof.
    const cx = ox + w / 2, cz = oz + d / 2, r = Math.min(w, d) / 2 - S;
    const seen = new Set();
    for (let a = 0; a < 10; a++) {
      const t = (a / 10) * Math.PI * 2;
      const px = Math.round((cx + Math.cos(t) * r) / S) * S - S;
      const pz = Math.round((cz + Math.sin(t) * r) / S) * S - S;
      const k = px + ',' + pz;
      if (seen.has(k)) continue;
      seen.add(k);
      for (let yy = 0; yy < 1.5; yy += S) sim._block(px, y + yy, pz, 'concrete', S, color);
    }
    plate(ox, oz, w, d, y + 1.5, 'concrete', color, S);
    for (let i = 0; i < 3; i++) sim._block(cx - 0.125, y + 2 + i * 0.25, cz - 0.125, 'steel', 0.25, accent);
  } else if (style === 'lantern') {
    // The Beresford's baroque tower lanterns: a squat drum under a copper cap.
    const nx = Math.round((w - 2 * S) / S), nz = Math.round((d - 2 * S) / S);
    plate(ox + S, oz + S, w - 2 * S, d - 2 * S, y, 'concrete', color, S);
    for (let yy = S; yy < 1.5; yy += S) {
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          if (!(i === 0 || i === nx - 1 || k === 0 || k === nz - 1)) continue;
          sim._block(ox + S + i * S, y + yy, oz + S + k * S, 'concrete', S, color);
        }
      }
    }
    plate(ox + S, oz + S, w - 2 * S, d - 2 * S, y + 1.5, 'panel', accent, S);
    plate(ox + 1, oz + 1, w - 2, d - 2, y + 2, 'panel', accent, S);
  } else if (style === 'pyramid' || style === 'spire') {
    // The Pierre's copper lantern and the Sherry-Netherland's gothic spire are
    // the same stepped pyramid; one of them carries a mast.
    let rw = w, rd = d, rx = ox, rz = oz, yy = y;
    while (rw >= S && rd >= S) {
      plate(rx, rz, rw, rd, yy, 'panel', color, S);
      rx += S; rz += S; rw -= 2 * S; rd -= 2 * S; yy += S;
    }
    if (style === 'spire') {
      for (let i = 0; i < 8; i++) sim._block(ox + w / 2 - 0.125, yy + i * 0.25, oz + d / 2 - 0.125, 'steel', 0.25, accent);
    }
  } else {
    plate(ox, oz, w, d, y, 'concrete', color);
  }
}

// A slim tower rising off a base's cap plate, wearing one of the crowns above.
export function crownedTower(sim, o) {
  const {
    ox, oz, w, d, y0, h, kind = 'masonry', wallMat = 'brick', wall = 0xb0a184,
    crown = 'flat', crownColor = 0xb8ae94, crownAccent = 0x8a7f6a, roof = 0x6a655c,
  } = o;
  tower(sim, ox, oz, w, d, y0, y0 + h, kind, wallMat, wall);
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) sim._block(ox + i, y0 + h, oz + k, 'concrete', 1, roof);
  towerCrown(sim, { ox, oz, w, d, y: y0 + h + 1, style: crown, color: crownColor, accent: crownAccent });
  return { top: y0 + h + 1 };
}

// The Central Park West signature: a flat-topped base with N towers punched up
// out of it. WHICH corners carry a tower and HOW MANY there are is the entire
// identity of each building (El Dorado two, Beresford three, Dakota none), so
// the tower list is a parameter and nothing about it is derived.
export function twinTowerBlock(sim, o) {
  const {
    ox, oz, w, d, baseH, wallMat = 'brick', wall = 0xb0a184, kind = 'masonry',
    base = null, cornice = null, corniceDir = -1, corniceAxis = 'z',
    roof = 0x6a655c, towers = [], crown = 'flat',
    crownColor = 0xb8ae94, crownAccent = 0x8a7f6a, setback = 0, water = false,
  } = o;
  const tiers = setback ? [{ h: baseH - setback - 1 }, { h: setback, inset: 1 }] : [{ h: baseH }];
  const b = setbackTower(sim, {
    ox, oz, w, d, tiers, kind, wallMat, wall, roof, base, cornice,
    corniceDir, corniceAxis, water,
  });
  for (const t of towers) {
    crownedTower(sim, {
      ox: ox + t.dx, oz: oz + t.dz, w: t.w, d: t.d, y0: b.top, h: t.h,
      kind, wallMat, wall: t.color ?? wall, crown: t.crown ?? crown,
      crownColor, crownAccent, roof,
    });
  }
  return b;
}

// Steep mansard roof — the Dakota's, the Plaza's, the Frick's. Stepped 0.5 m
// courses, each standing squarely on the one below, with dormer bumps on the
// first course and chimney stacks rising through the whole thing.
export function mansardRoof(sim, o) {
  const {
    ox, oz, w, d, y, courses = 4, s = 0.5, color = 0x3a3f46, dormer = null,
    chimney = [], chimneyH = 2, chimneyColor = 0x7a4636,
  } = o;
  for (let c = 0; c < courses; c++) {
    const inset = c * s;
    const rw = w - 2 * inset, rd = d - 2 * inset;
    if (rw <= 0 || rd <= 0) break;
    for (let i = 0; i < Math.round(rw / s); i++) {
      for (let k = 0; k < Math.round(rd / s); k++) {
        sim._block(ox + inset + i * s, y + c * s, oz + inset + k * s, 'panel', s, color);
      }
    }
  }
  if (dormer) {
    const { color: dc = 0xd8d2c2, every = 2, faces = ['minZ'] } = dormer;
    for (const f of faces) {
      const along = f === 'minZ' || f === 'maxZ' ? w : d;
      for (let u = 1; u < along - 1; u += every) {
        // Outboard of course 1, which is inset by s: a dormer at the inset
        // line wants the same cells as the roof course it is supposed to sit on.
        const bx = (f === 'minZ' || f === 'maxZ') ? ox + u : (f === 'minX' ? ox : ox + w - s);
        const bz = f === 'minZ' ? oz : (f === 'maxZ' ? oz + d - s : oz + u);
        sim._block(bx, y + s, bz, 'panel', s, dc);
        sim._block(bx, y + 2 * s, bz, 'panel', s, color);
      }
    }
  }
  // A chimney starts on TOP of the last mansard course that covers it, not at
  // the eaves: a stack begun at the eaves shares every cell of the roof it is
  // supposed to be piercing.
  for (const [cx, cz] of chimney) {
    let c = 0;
    while (c < courses && cx >= c * s && cx < w - c * s && cz >= c * s && cz < d - c * s) c++;
    const cy = y + c * s;
    for (let i = 0; i < Math.round(chimneyH / s); i++) sim._block(ox + cx, cy + i * s, oz + cz, 'brick', s, chimneyColor);
  }
}

// Axis-aware colonnaded front: the Met's Fifth Avenue face, Low Library's
// portico, Lincoln Center's travertine screens, the Historical Society. The
// museumBlock builder already in this kit only ever faces -z, and every one of
// these faces a different way, so the front comes out as its own builder.
//
// `dir` is the direction the portico projects from the wall line at (x, z);
// `len` runs along `axis`. `steps` is the flight spilling into the street, and
// every tread is its own ground-anchored column so the flight can never fall.
export function porticoFront(sim, o) {
  const {
    x, z, len, axis = 'z', dir = 1, depth = 1, colH = 6, colEvery = 3, colPairs = false,
    mat = 'concrete', color = 0xd8d0ba, entab = 0xc8c0a8, attic = null,
    steps = 0, stepColor = 0xc0b8a2, colMat = 'concrete',
  } = o;
  // `v` counts outward from the wall line; dir < 0 walks the other way and the
  // block's min corner has to move with it.
  const put = (u, y, v, m, c, s = 1) => {
    const off = dir < 0 ? -(v + 1) * s + (s - 1) : v;
    return axis === 'z'
      ? sim._block(x + off, y, z + u, m, s, c)
      : sim._block(x + u, y, z + off, m, s, c);
  };
  for (let u = 0; u < len; u++) {
    const m = u % colEvery;
    const col = colEvery <= 1 ? true : (colPairs ? (m === 1 || m === 2) : (m === 1));
    if (!col) continue;
    for (let y = 0; y < colH; y++) for (let v = 0; v < depth; v++) put(u, y, v, colMat, color);
  }
  for (let u = 0; u < len; u++) for (let v = 0; v < depth; v++) put(u, colH, v, mat, entab);
  for (let u = 0; u < len; u++) for (let v = 0; v < depth; v++) put(u, colH + 1, v, mat, color);
  if (attic !== null) {
    for (let u = 0; u < len; u++) for (let v = 0; v < depth; v++) put(u, colH + 2, v, mat, attic);
  }
  // Treads are 0.5 m and they WALK on a 0.5 m step: a half-metre brick placed on
  // a one-metre pitch is a row of isolated cubes with gaps between them, and
  // physics never complains because each one is grounded (voxel.md rule 10).
  for (let t = 0; t < steps; t++) {
    const h = (steps - t) * 0.5;
    const off = dir < 0 ? -(depth + (t + 1) * 0.5) : depth + t * 0.5;
    for (let u = -0.5; u < len + 0.5; u += 0.5) {
      for (let y = 0; y < h; y += 0.5) {
        if (axis === 'z') sim._block(x + off, y, z + u, 'concrete', 0.5, stepColor);
        else sim._block(x + u, y, z + off, 'concrete', 0.5, stepColor);
      }
    }
  }
}

// The Guggenheim. The geography plan's recipe verbatim: stacked circular slabs,
// each one WIDER than the last, so the outer face is a cone opening upward.
// Growing outward by at most half a metre per slab keeps every new outer cell
// one hop from the cell under it, well inside concrete's 3 m span — an inverted
// cone is one of the very few overhangs this engine can actually carry.
export function spiralRotunda(sim, o) {
  const {
    cx, cz, y0 = 0, s = 0.5, slabs = 6, courses = 3, r0 = 1.4, dr = 0.2,
    thick = 1, mat = 'concrete', color = 0xded6c4, groove = 0xc4bba6,
    cap = 0xd0c8b4, dome = 2,
  } = o;
  const disc = (r, rin, y, c) => {
    const n = Math.ceil(r / s) + 1;
    for (let ix = -n; ix <= n; ix++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = (ix + 0.5) * s, pz = (iz + 0.5) * s;
        const dd = Math.hypot(px, pz);
        if (dd > r || dd < rin) continue;
        sim._block(cx + ix * s, y, cz + iz * s, mat, s, c);
      }
    }
  };
  disc(r0, 0, y0, color);                                   // ground floor, solid
  for (let i = 0; i < slabs; i++) {
    const r = r0 + i * dr;
    for (let c = 0; c < courses; c++) {
      const y = y0 + s + (i * courses + c) * s;
      disc(r, Math.max(0, r - thick), y, c === 0 ? groove : color);
    }
  }
  let y = y0 + s + slabs * courses * s;
  let r = r0 + (slabs - 1) * dr;
  for (let c = 0; c < dome; c++) { disc(r, 0, y, cap); r -= s; y += s; }
  return { top: y };
}

// The Rose Center: a transparent steel-framed cube with a matte white sphere
// apparently floating inside it. Nothing floats here, so the sphere is a stack
// of discs standing on a slim core column — which is also how the real one is
// held up, on supports through its middle.
export function glassSphere(sim, o) {
  const {
    ox, oz, w, d, h, cx, cz, r = 2, y0 = 1, s = 0.5,
    frame = 0xd8dce2, sphere = 0xf2f0ea, core = 0xb8bec6,
  } = o;
  // The cube is built here rather than through tower(): tower fills a full slab
  // plate every fourth course, and the sphere's core column runs straight
  // through every one of them. A curtain wall with a steel post every other
  // metre carries its own roof plate (2 m to the ring, inside steel's 3 m span)
  // and leaves the interior genuinely empty, which is the whole look.
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) {
        const edge = i === 0 || i === w - 1 || k === 0 || k === d - 1;
        if (!edge) continue;
        const corner = (i === 0 || i === w - 1) && (k === 0 || k === d - 1);
        const along = (k === 0 || k === d - 1) ? i : k;
        const post = corner || along % 2 === 0;
        sim._block(ox + i, y, oz + k, post ? 'steel' : 'glass', 1, post ? frame : undefined);
      }
    }
  }
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) sim._block(ox + i, h, oz + k, 'steel', 1, frame);
  // The core runs the FULL height of the cube, not just the sphere's: it is
  // what the roof plate's middle cells stand on (a 7 m plate puts the centre
  // three hops from the curtain wall, right on steel's span limit) and it is
  // also how the real sphere is held, on supports through its middle.
  const top = y0 + 2 * r;
  for (let y = 0; y < h; y += s) sim._block(cx - s, y, cz - s, 'steel', s, core);
  for (let y = y0; y < top; y += s) {
    const dy = (y + s / 2) - (y0 + r);
    const rr = Math.sqrt(Math.max(0, r * r - dy * dy));
    const n = Math.ceil(rr / s) + 1;
    for (let ix = -n; ix <= n; ix++) {
      for (let iz = -n; iz <= n; iz++) {
        const px = (ix + 0.5) * s, pz = (iz + 0.5) * s;
        if (Math.hypot(px, pz) > rr) continue;
        if (ix === -1 && iz === -1) continue;                 // the core column owns this cell
        sim._block(cx + ix * s, y, cz + iz * s, 'panel', s, sphere);
      }
    }
  }
}

// Church / cathedral mass: a long ribbed nave, an optional transept crossing
// bulging both ways, buttress fins down the flanks, corner towers, and the one
// enormous gable window that is the whole identity of Temple Emanu-El and of
// St John the Divine's front.
export function naveChurch(sim, o) {
  const {
    ox, oz, w, d, h, axis = 'x', mat = 'concrete', stone = 0xc8c2b0,
    roof = 0x6a6f74, roofRise = 1, buttress = 0, buttressH = null, buttressColor = null,
    transept = null,          // { at, over, h }  — `over` metres each side
    towers = [],              // [{ dx, dz, w, d, h, cap }]
    gable = null,             // { face, w, h, color, y0 }
    apse = null,              // { end: 'min' | 'max', r }
  } = o;
  // Everything that rises THROUGH the nave roof — the crossing and the corner
  // towers — is cut out of the roof rise up front. A transept 3 m taller than
  // the nave and a hipped roof course both want the same cells, and whichever
  // is written second becomes a ghost.
  const annex = towers.map((t) => ({ x: ox + t.dx, z: oz + t.dz, w: t.w, d: t.d }));
  if (transept) {
    const { at, over = 2, thick = 3 } = transept;
    annex.push(axis === 'x'
      ? { x: ox + at, z: oz - over, w: thick, d: d + over * 2 }
      : { x: ox - over, z: oz + at, w: w + over * 2, d: thick });
  }
  const inAnnex = (px, pz) => annex.some((a) => px >= a.x && px < a.x + a.w && pz >= a.z && pz < a.z + a.d);
  tower(sim, ox, oz, w, d, 0, h, 'masonry', mat, stone);
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) sim._block(ox + i, h, oz + k, 'concrete', 1, stone);
  for (let r = 1; r <= roofRise; r++) {
    const rw = w - 2 * r, rd = d - 2 * r;
    if (rw <= 0 || rd <= 0) break;
    for (let i = 0; i < rw; i++) {
      for (let k = 0; k < rd; k++) {
        if (inAnnex(ox + r + i, oz + r + k)) continue;
        sim._block(ox + r + i, h + r, oz + r + k, 'panel', 1, roof);
      }
    }
  }
  if (transept) {
    const { at, over = 2, h: th = h + 2, thick = 3 } = transept;
    const tx = axis === 'x' ? ox + at : ox - over;
    const tz = axis === 'x' ? oz - over : oz + at;
    const tw = axis === 'x' ? thick : w + over * 2;
    const td = axis === 'x' ? d + over * 2 : thick;
    // The crossing shares cells with the nave, so only the wings are new.
    for (let y = 0; y < th; y++) {
      const slab = y % 3 === 0;
      for (let i = 0; i < tw; i++) {
        for (let k = 0; k < td; k++) {
          const px = tx + i, pz = tz + k;
          if (px >= ox && px < ox + w && pz >= oz && pz < oz + d && y < h + 1) continue;
          const edge = i === 0 || i === tw - 1 || k === 0 || k === td - 1;
          if (!slab && !edge) continue;
          sim._block(px, y, pz, slab ? 'concrete' : mat, 1, stone);
        }
      }
    }
    for (let i = 0; i < tw; i++) {
      for (let k = 0; k < td; k++) {
        const px = tx + i, pz = tz + k;
        if (px >= ox && px < ox + w && pz >= oz && pz < oz + d && th < h + 1) continue;
        sim._block(px, th, pz, 'concrete', 1, stone);
      }
    }
  }
  if (buttress > 0) {
    const bh = buttressH ?? h - 2;
    const bc = buttressColor ?? stone;
    for (let b = 0; b < buttress; b++) {
      const u = Math.round(((b + 0.5) / buttress) * (axis === 'x' ? w : d));
      for (const side of [-1, 1]) {
        const bx = axis === 'x' ? ox + u : (side < 0 ? ox - 1 : ox + w);
        const bz = axis === 'x' ? (side < 0 ? oz - 1 : oz + d) : oz + u;
        if (inAnnex(bx, bz)) continue;                 // the crossing owns this flank cell
        for (let y = 0; y <= bh; y++) sim._block(bx, y, bz, 'concrete', 1, bc);
      }
    }
  }
  if (apse) {
    const { end = 'min', r = 2 } = apse;
    const ax = axis === 'x' ? (end === 'min' ? ox - 1 : ox + w) : ox + Math.floor(w / 2);
    const az = axis === 'x' ? oz + Math.floor(d / 2) : (end === 'min' ? oz - 1 : oz + d);
    for (let y = 0; y < h; y++) {
      for (let i = -r; i <= r; i++) {
        for (let k = -r; k <= r; k++) {
          if (Math.hypot(i, k) > r) continue;
          const px = ax + i, pz = az + k;
          if (px >= ox && px < ox + w && pz >= oz && pz < oz + d) continue;
          if (inAnnex(px, pz)) continue;
          sim._block(px, y, pz, 'concrete', 1, stone);
        }
      }
    }
  }
  if (gable) {
    // The great window: a screen set one cell proud of the end wall, alternating
    // GROUND-ANCHORED stone mullions with glass panes. It cannot lean on the
    // wall behind it, because tower() puts a window band on that wall too and
    // glass carries nothing in either direction (vertBond .40, horizBond .30,
    // both under the .50 carry threshold) — a pure glass panel one cell proud
    // of a glass wall cell is a floating panel.
    const { face = 'min', w: gw = 3, h: gh = 5, color = 0x2f4a6a, y0 = 2, s = 0.5, mullion = stone } = gable;
    const n = Math.round(gw / s), m = Math.round(gh / s);
    // The gable is the END of the nave, so it faces along the LONG axis: for an
    // east-west nave the screen is on the x face and runs in z.
    const put = (i, y, mt, c) => (axis === 'x'
      ? sim._block(face === 'min' ? ox - s : ox + w, y, oz + Math.floor((d - gw) / 2) + i * s, mt, s, c)
      : sim._block(ox + Math.floor((w - gw) / 2) + i * s, y, face === 'min' ? oz - s : oz + d, mt, s, c));
    for (let i = 0; i < n; i++) {
      const arc = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const pier = i % 2 === 0;
      // Only the GLASS follows the arch. A mullion cut down to the arch line
      // leaves the pane beside it with nothing at its own level to lean on, and
      // the top of the window floats.
      const topJ = pier ? m - 1 : Math.floor(m - 1 - arc * arc * (m * 0.4));
      if (pier) for (let y = 0; y < y0; y += s) put(i, y, 'concrete', mullion);
      for (let j = 0; j <= topJ; j++) put(i, y0 + j * s, pier ? 'concrete' : 'glass', pier ? mullion : color);
    }
  }
  // Towers run from the GROUND, skipping whatever the nave already owns — a
  // tower started at the nave's roof line would be a shaft resting on a plate
  // it does not reach, and one started at 0 without the skip would put two
  // blocks in every shared cell.
  for (const t of towers) {
    const tx = ox + t.dx, tz = oz + t.dz;
    const inNave = (px, pz, y) => px >= ox && px < ox + w && pz >= oz && pz < oz + d && y <= h;
    for (let y = 0; y <= t.h; y++) {
      const slab = y % 3 === 0 || y === t.h;
      for (let i = 0; i < t.w; i++) {
        for (let k = 0; k < t.d; k++) {
          const px = tx + i, pz = tz + k;
          if (inNave(px, pz, y)) continue;
          const edge = i === 0 || i === t.w - 1 || k === 0 || k === t.d - 1;
          if (!slab && !edge) continue;
          sim._block(px, y, pz, slab ? 'concrete' : mat, 1, t.color ?? stone);
        }
      }
    }
    if (t.cap === 'battlement') crenellation(sim, { x: tx, y: t.h + 1, z: tz, w: t.w, d: t.d, color: stone });
    else if (t.cap === 'spire') {
      towerCrown(sim, { ox: tx, oz: tz, w: t.w, d: t.d, y: t.h + 1, style: 'spire', color: roof, accent: stone });
    }
  }
}

// Elevated railway over an avenue median: riveted lattice bents standing in the
// planted strip, a deck spanning both carriageways, parapets and running rails.
// The deck is the ONLY thing over the asphalt, and the scene declares it as a
// road span — which is the whole reason the legs stay in the median.
export function metroViaduct(sim, o) {
  const {
    legXs, deckX0, deckW, z0, z1, legH = 4, bay = 4, skip = null,
    steel = 0x5a4c42, deckMat = 'concrete', deckColor = 0x6a625a,
    rail = 0x7a6a5a, railStep = 2,
  } = o;
  // A bent that lands in a cross street slides to the next clear metre. Its
  // LEGS are the only ground-level part of this structure and the median is the
  // only ground it is allowed to stand on.
  const bent = new Set();
  for (let z = z0; z <= z1; z += bay) {
    let bz = z;
    for (let k = 1; k <= bay && skip && skip(bz); k++) bz = z + k;
    if (skip && skip(bz)) continue;
    if (bent.has(bz)) continue;
    bent.add(bz);
    for (const lx of legXs) for (let y = 0; y < legH; y++) sim._block(lx, y, bz, 'steel', 1, steel);
    for (let x = deckX0; x < deckX0 + deckW; x++) sim._block(x, legH, bz, 'steel', 1, steel);
  }
  for (let z = z0; z <= z1; z++) {
    if (bent.has(z)) continue;
    for (let x = deckX0; x < deckX0 + deckW; x++) sim._block(x, legH, z, deckMat, 1, deckColor);
  }
  for (let z = z0; z <= z1; z += railStep) {
    for (const rx of [deckX0 + 0.5, deckX0 + deckW - 1]) {
      sim._block(rx, legH + 1, z, 'steel', 0.5, rail);
      sim._block(rx, legH + 1.5, z, 'steel', 0.5, rail);
    }
  }
}

// Open cast-iron lattice tower — the Mount Morris fire watchtower, the last of
// its kind. Tapering tiers of thin columns with a platform plate between each,
// so a narrower tier always has something under its corners, and a bell hung
// under the open top platform.
export function latticeTower(sim, o) {
  const {
    cx, cz, y0 = 0, tiers = [[2, 2], [1.5, 2], [1, 1.5]], s = 0.25,
    color = 0x22262c, plate = 0x2f3440, bell = 0x8a6a3a,
  } = o;
  let y = y0;
  for (let t = 0; t < tiers.length; t++) {
    const [tw, th] = tiers[t];
    const half = tw / 2;
    for (const px of [cx - half, cx + half - s]) {
      for (const pz of [cz - half, cz + half - s]) {
        for (let yy = 0; yy < th; yy += s) sim._block(px, y + yy, pz, 'steel', s, color);
      }
    }
    // Horizontal ties every third course. A true diagonal brace has no vertical
    // path on this grid, so the lattice reads through the ties instead.
    for (let yy = s * 3; yy < th; yy += s * 3) {
      for (let u = cx - half + s; u < cx + half - s; u += s) {
        sim._block(u, y + yy, cz - half, 'steel', s, color);
        sim._block(u, y + yy, cz + half - s, 'steel', s, color);
      }
      for (let v = cz - half + s; v < cz + half - s; v += s) {
        sim._block(cx - half, y + yy, v, 'steel', s, color);
        sim._block(cx + half - s, y + yy, v, 'steel', s, color);
      }
    }
    y += th;
    const nw = t + 1 < tiers.length ? tiers[t + 1][0] : tw;
    const ph = Math.max(tw, nw) / 2;
    for (let u = cx - ph; u < cx + ph - s / 2; u += s) {
      for (let v = cz - ph; v < cz + ph - s / 2; v += s) sim._block(u, y, v, 'steel', s, plate);
    }
    y += s;
  }
  for (const [u, v] of [[cx - s, cz - s], [cx, cz - s], [cx - s, cz], [cx, cz]]) {
    sim._block(u, y, v, 'panel', s, bell);
  }
  return { top: y + s };
}

// Theatre front: a bulb-edged marquee cantilevered over the sidewalk and a tall
// vertical blade sign climbing the facade above it. The blade is a solid panel
// slab and the lettering is mounted one cell proud of it — a free-standing glyph
// has no internal support path (the middle of an O is a hole), so a sign always
// needs a wall behind it.
export function marqueeSign(sim, o) {
  const {
    x, z, w, dir = -1, y = 3, depth = 1, s = 0.5,
    board = 0x2b1f1a, bulbs = 0xf2e8c0, blade = 0xc23b2e,
    bladeX = null, bladeH = 4, bladeW = 1.5, text = null,
    textColor = 0xf2ede2, textScale = 1,
  } = o;
  const z0 = dir < 0 ? z - depth : z + 1;
  for (let i = 0; i < Math.round(w / s); i++) {
    for (let k = 0; k < Math.round(depth / s); k++) {
      sim._block(x + i * s, y, z0 + k * s, 'steel', s, board);
      sim._block(x + i * s, y + s, z0 + k * s, 'panel', s, i % 2 ? bulbs : board);
    }
  }
  const bx = bladeX ?? x + w / 2 - bladeW / 2;
  const by = y + 1;
  // The blade stands on the marquee's OUTER face, not against the building: at
  // the facade line it shares cells with the street cornice at the same height.
  const bz = dir < 0 ? z - depth : z + 1;
  for (let i = 0; i < Math.round(bladeW / s); i++) {
    for (let yy = 0; yy < bladeH; yy += s) sim._block(bx + i * s, by + yy, bz, 'panel', s, blade);
  }
  if (text) {
    const chars = text.toUpperCase().split('');
    const gh = 6 * 0.25 * textScale;
    chars.forEach((ch, i) => {
      const gy = by + bladeH - (i + 1) * gh;
      if (gy < by) return;
      signText(sim, ch, bx + 0.25, gy, dir < 0 ? bz - 0.25 : bz + s,
        { axis: 'x', px: 0.25, scale: textScale, color: textColor, mat: 'panel' });
    });
  }
}

// A run of row houses — Harlem's four-storey brownstone line, Striver's Row's
// three graded sub-rows. Party walls touch, the roofline never varies, and the
// colour steps house to house: that combination IS the neighbourhood tell, so
// the RUN is the builder and a single house is not.
export function rowBlock(sim, o) {
  const {
    x, z, len, axis = 'x', unit = 3, depth = 3, floors = 1, dir = -1,
    shades = [0x8a5545, 0x77463a, 0x9a6250], trim = 0x6b5546, stoopSteps = 3,
    escapeEvery = 0, roof = 0x5a5f66, seed = 0, skip = null,
  } = o;
  const out = [];
  const n = Math.floor(len / unit);
  for (let i = 0; i < n; i++) {
    const ox = axis === 'x' ? x + i * unit : x;
    const oz = axis === 'x' ? z : z + i * unit;
    const w = axis === 'x' ? unit : depth;
    const d = axis === 'x' ? depth : unit;
    if (skip && skip(ox, oz, w, d)) continue;
    const hsh = hash2(i + seed * 613, Math.round(x * 4) ^ Math.round(z * 4));
    brownstone(sim, ox, oz, w, d, floors, shades[hsh % shades.length], {
      dir, trim, stoopSteps, roof, escape: escapeEvery > 0 && i % escapeEvery === 1,
    });
    // The returned footprint INCLUDES the stoop, which projects up to two
    // metres off the facade in z. A caller claiming only the house leaves the
    // stoop invisible to every later placement gate, and a bin lands in it.
    const proj = stoopSteps * 0.5 + 0.5;
    out.push({ x: ox, z: dir < 0 ? oz - proj : oz, w, d: d + proj });
  }
  return out;
}

// Sidewalk scaffolding shed — the most New York object there is. Posts on a
// pitch, a plain deck plate resting on the post tops, a painted fascia board.
export function scaffoldShed(sim, o) {
  const {
    x, z, len, axis = 'x', w = 1.5, h = 2.5, s = 0.5, postEvery = 1.5,
    post = 0x5a6472, deck = 0x8a7f6a, fascia = 0x2f6b4a,
  } = o;
  const n = Math.round(len / s), nv = Math.round(w / s), per = Math.max(1, Math.round(postEvery / s));
  const put = (u, y, v, m, c) => (axis === 'x'
    ? sim._block(x + u * s, y, z + v * s, m, s, c)
    : sim._block(x + v * s, y, z + u * s, m, s, c));
  for (let i = 0; i < n; i++) {
    if (i % per === 0) for (const v of [0, nv - 1]) for (let y = 0; y < h; y += s) put(i, y, v, 'steel', post);
    for (let v = 0; v < nv; v++) put(i, h, v, 'wood', deck);
    put(i, h + s, 0, 'panel', fascia);
  }
}
