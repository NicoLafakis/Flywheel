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
// All builders take the sim as the first argument and place blocks through
// sim._block / sim._box. Colors are paint, never physics.

export const VOXEL_CLASSES = {
  PROP: { brick: 0.25, band: '< 2 m', desc: 'street furniture smaller than trees/cars' },
  VEHICLE: { brick: 0.5, band: '2-8 m', desc: 'trees, cars, buses, small boats, statues' },
  SMALL_BLDG: { brick: 1, band: '3-10 m', desc: 'houses, shops, churches, terminals' },
  LARGE_BLDG: { brick: 1, band: '10-30 m', desc: 'apartments, hotels, industrial, offices, banks' },
  MEGA: { brick: 1, band: '30 m+', desc: 'skyscrapers, monuments, forts, big statues' },
};

// --- C2 VEHICLE / flora ------------------------------------------------------

// 0.5 m sedan family: car, taxi, police. Rubber wheels, steel frame/pillars,
// panel body, glass cabin band.
export function sedan(sim, ox, oz, bodyColor, roofColor = bodyColor) {
  const B = (x, y, z, m, c) => sim._block(ox + x, y, oz + z, m, 0.5, c);
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
export function bus(sim, ox, oz, bodyColor) {
  const S = 0.5;
  const B = (x, y, z, m, c) => sim._block(ox + x, y, oz + z, m, S, c);
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
export function boxVan(sim, ox, oz, len, cabColor, boxColor) {
  const S = 0.5;
  const B = (x, y, z, m, c) => sim._block(ox + x, y, oz + z, m, S, c);
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
export function lampPost(sim, lx, lz) {
  B25(sim, lx - 0.125, 0, lz - 0.125, 1, 5, 1, 'steel');
  B25(sim, lx - 0.25, 1.25, lz - 0.25, 2, 1, 2, 'steel');
  B25(sim, lx - 0.25, 1.5, lz - 0.25, 2, 1, 2, 'glass');
}

// Fire hydrant: body, dome, side caps.
export function hydrant(sim, x, z) {
  B25(sim, x, 0, z, 2, 3, 2, 'panel');
  F(sim, x + 0.125, 0.75, z + 0.125, 'panel');
  F(sim, x - 0.25, 0.375, z + 0.125, 'panel'); F(sim, x + 0.5, 0.375, z + 0.125, 'panel');
}

// Mailbox (USPS blue): legs, box body, cap.
export function mailbox(sim, x, z, color = 0x2a4f9a) {
  F(sim, x, 0, z + 0.125, 'steel'); F(sim, x + 0.5, 0, z + 0.125, 'steel');
  B25(sim, x, 0.25, z, 2, 3, 2, 'panel', color);
  B25(sim, x, 1, z, 2, 1, 2, 'panel', color);
}

// Park bench: steel legs, wood seat + back slats.
export function bench(sim, bx, bz) {
  B25(sim, bx, 0, bz + 0.125, 1, 2, 1, 'steel'); B25(sim, bx + 1, 0, bz + 0.125, 1, 2, 1, 'steel');
  B25(sim, bx - 0.25, 0.5, bz, 4, 1, 2, 'wood');
  B25(sim, bx - 0.25, 0.75, bz, 4, 2, 1, 'wood');
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
