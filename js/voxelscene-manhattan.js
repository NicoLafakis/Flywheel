// Lower Manhattan — the second voxel sandbox scene.
// Hand-authored and deterministic (pure sim: no Math.random, no three.js).
// Builders come from js/voxelkit.js (the 5-class size system).
//
// Layout (x = east, z = south, north = -z), world bounds ±80 (plus a
// `boundsRect` clamp — the peninsula is off-center, see sim.boundsRect below):
//   NW  WTC plaza: One WTC (setback tiers + spire), twin memorial pools
//   N   Woolworth-style setback tower (terracotta), modern glass slab tower;
//       Civic Center (Municipal Building, courthouse), Chinatown storefront
//       rows, Columbus Park, Tribeca lofts, Brooklyn Bridge pylons (NE edge)
//   MID Wall St bank canyon (portico facades), Trinity Church, City Hall;
//       FiDi infill — Federal Reserve, NYSE, 7 WTC, Oculus rib pavilion
//   E   elevated train viaduct over Pearl St, with a parked 3-car train;
//       East River Seaport (pavilion, pier sheds, tall ship), heliport
//   W   Battery Park City towers, Hudson marina + pier shed, esplanade
//   S   Battery Park (trees, lamps), Charging Bull, ferry pier on the harbor,
//       Castle Clinton, Staten Island Ferry Terminal + slips, Custom House
//
// Build rules (same as the gallery — see .wiki/modules/voxel.md):
//   - one block per fine cell (placement step must match brick size)
//   - glass never carries load: every pane hangs off a non-glass neighbor at
//     its own level (span 1); support never flows UP through glass, so slab
//     plates span horizontally between columns (concrete maxSpan 3)
//   - every roof that carries objects gets an explicit top plate (tower()
//     tops out on a wall layer unless y1 lands on a slab multiple)
//   - spawn (0,16) sits on the Broadway × Battery Pl crossing — keep blocks
//     clear of it (removal disc + hanging margin)

import { sedan, bus, boxVan, motorcycle, tree, lampPost, hydrant, mailbox, bench, trafficLight, newsstand, hotDogCart, subwayEntrance, tower } from './voxelkit.js';

export function buildManhattan(sim) {
  sim.bounds = 80;
  // Off-center peninsula: a square ±80 left ~36 m of empty harbor south of the
  // last block (~4 s of driving into nothing). Content bbox is x[-60,64]
  // z[-74,44]; this keeps ~10 m of open water on every side.
  sim.boundsRect = { minX: -70, maxX: 74, minZ: -84, maxZ: 54 };
  const B = (x, y, z, m, s, c) => sim._block(x, y, z, m, s, c);
  const BOX = (x0, y0, z0, nx, ny, nz, m, s, c) => sim._box(x0, y0, z0, nx, ny, nz, m, s, c);
  const F = (x, y, z, m, c) => B(x, y, z, m, 0.25, c);
  const B25 = (x0, y0, z0, nx, ny, nz, m, c) => BOX(x0, y0, z0, nx, ny, nz, m, 0.25, c);

  // --- ONE WTC (x -30..-18, z -34..-22): three setback tiers + spire ----------
  // Tier heights are chosen so every tier TOP lands on a slab layer — a
  // setback tier's base slab needs the full plate below it, not a wall ring.
  tower(sim, -30, -34, 12, 12, 0, 25, 'curtain');   // slabs 0..24
  tower(sim, -29, -33, 10, 10, 25, 38, 'curtain');  // slabs 25..37
  tower(sim, -28, -32, 8, 8, 38, 47, 'curtain');    // slabs 38..46
  BOX(-25, 47, -29, 2, 1, 2, 'steel', 1);              // spire base
  BOX(-24.75, 48, -28.75, 1, 40, 1, 'steel', 0.25);    // mast (slim, 10 m)
  B(-24.75, 58, -28.75, 'glass', 0.25, 0xffffff);      // beacon tip
  sim.cameraBlockers.push({ minX: -30, maxX: -18, minZ: -34, maxZ: -22, h: 59 });

  // --- memorial pools (twin footprints E of the tower) -------------------------
  for (const pz of [-33, -25]) {
    for (let x = 0; x < 6; x++) {
      for (let z = 0; z < 6; z++) {
        const edge = x === 0 || x === 5 || z === 0 || z === 5;
        B(-16 + x, 0, pz + z, edge ? 'concrete' : 'glass', 1, edge ? 0x4a5058 : 0x3fa7d6);
      }
    }
    for (const [cx, cz] of [[-16, pz], [-11, pz], [-16, pz + 5], [-11, pz + 5]]) B(cx, 1, cz, 'steel', 1);
  }
  // plaza trees
  for (const [tx, tz] of [[-20, -36], [-20, -18], [-12, -36], [-12, -18]]) tree(sim, tx, tz);

  // --- WOOLWORTH-STYLE (x 6..15, z -34..-27): terracotta setbacks + crown ------
  tower(sim, 6, -34, 10, 8, 0, 13, 'masonry', 'brick', 0xa8765a);   // slabs 0..12
  tower(sim, 7, -33, 8, 6, 13, 20, 'masonry', 'brick', 0xa8765a);   // slabs 13..19
  tower(sim, 8, -32, 6, 4, 20, 27, 'masonry', 'brick', 0xa8765a);   // slabs 20..26
  BOX(9, 27, -31, 4, 1, 2, 'wood', 1);                 // crown plate
  BOX(9.5, 28, -31, 2, 2, 2, 'wood', 0.5);             // crown
  B(10, 29, -30.5, 'wood', 0.5);                       // tip
  sim.cameraBlockers.push({ minX: 6, maxX: 16, minZ: -34, maxZ: -26, h: 30 });

  // --- GLASS SLAB TOWER (x 28..39, z -34..-24): modern curtain, E of the El ---
  tower(sim, 28, -34, 12, 10, 0, 33, 'curtain');            // slabs 0..32
  BOX(36, 33, -27, 3, 2, 2, 'panel', 1, 0x6a7078);     // rooftop bulkhead
  sim.cameraBlockers.push({ minX: 28, maxX: 40, minZ: -34, maxZ: -24, h: 35 });

  // --- WALL ST BANK CANYON (north side, z -10..-2) ------------------------------
  for (const bx of [-28, -19, -10]) {
    tower(sim, bx, -10, 8, 9, 0, 10, 'masonry', 'concrete', 0xa89f8d);
    // portico: 4 columns 1 m proud of the facade + pediment slab (Federal Hall)
    for (const px of [1, 3, 5, 7]) BOX(bx + px, 0, -1, 1, 3, 1, 'steel', 1);
    BOX(bx + 1, 3, -1, 7, 1, 1, 'concrete', 1, 0xa89f8d);
    sim.cameraBlockers.push({ minX: bx, maxX: bx + 8, minZ: -10, maxZ: -1, h: 11 });
  }
  // south side (z 8..13): brick offices, one with a rooftop water tower
  tower(sim, -30, 8, 10, 6, 0, 7, 'masonry', 'brick', 0x8a5a44);     // slabs 0..6
  tower(sim, -18, 8, 12, 6, 0, 10, 'masonry', 'concrete', 0x7a7f88); // slabs 0..9
  // h: 11 — the rooftop water tower's cap tops out at 11 m, and camera.js only
  // pulls in when camY < b.h, so a 9 here let the camera clip through the tank
  sim.cameraBlockers.push({ minX: -30, maxX: -20, minZ: 8, maxZ: 14, h: 11 });
  sim.cameraBlockers.push({ minX: -18, maxX: -6, minZ: 8, maxZ: 14, h: 10 });
  {
    // water tower on the brick roof slab: legs, ring tank, cap
    BOX(-27, 7, 9, 2, 1, 2, 'wood', 1);
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
      const edge = x === 0 || x === 2 || z === 0 || z === 2;
      if (edge) { B(-27.5 + x, 8, 8.5 + z, 'wood', 1); B(-27.5 + x, 9, 8.5 + z, 'wood', 1); }
    }
    BOX(-27.5, 10, 8.5, 3, 1, 3, 'wood', 1);
  }

  // --- TRINITY CHURCH (Broadway at Wall St, x -5..-1, z 7..15) ------------------
  // Nave + south bell tower as one bonded complex. The nearest block (the
  // brick at x-2, z12) sits 3.16 m from the (0,16) spawn. The threshold it has
  // to clear is the radius-scaled hanging margin — remR + (span + 1.5) ×
  // radius/6.6, ≈ 1.6 m at the 1.1 m start radius — not the old flat
  // remR + span + 1.5 (≈3.55 m) this comment used to cite.
  for (let x = 0; x < 4; x++) for (let z = 0; z < 6; z++) {
    const edge = x === 0 || x === 3 || z === 0 || z === 5;
    if (!edge) continue;
    B(-5 + x, 0, 7 + z, 'brick', 1);
    B(-5 + x, 1, 7 + z, (x + z) % 2 === 1 ? 'glass' : 'brick', 1);
    B(-5 + x, 2, 7 + z, 'brick', 1);
  }
  BOX(-5, 3, 7, 4, 1, 6, 'wood', 1);                   // roof plate
  BOX(-4, 4, 7, 2, 1, 6, 'wood', 1);                   // gable ridge
  for (let y = 0; y < 6; y++) for (const [tx, tz] of [[-5, 13], [-4, 13], [-5, 14], [-4, 14]]) B(tx, y, tz, 'brick', 1);
  BOX(-5, 6, 13, 2, 1, 2, 'wood', 1);
  B(-4.75, 7, 13.25, 'wood', 0.5);                     // spire tip
  sim.cameraBlockers.push({ minX: -5, maxX: -1, minZ: 7, maxZ: 15, h: 7.5 });

  // --- CITY HALL (x -8..0, z -20..-16) ------------------------------------------
  tower(sim, -8, -20, 8, 5, 0, 4, 'masonry', 'concrete', 0xcfc8b8);  // slabs 0..3
  BOX(-8, 4, -20, 8, 1, 5, 'concrete', 1);             // roof plate
  for (const px of [-7, -5, -3, -1]) BOX(px, 0, -15, 1, 3, 1, 'steel', 1);
  BOX(-8, 3, -15, 8, 1, 1, 'concrete', 1, 0xcfc8b8);   // portico entablature
  BOX(-6, 5, -19, 4, 1, 3, 'wood', 1);                 // dome
  BOX(-5.5, 6, -18.5, 3, 1, 2, 'wood', 0.5);           // cupola
  B(-5, 6.5, -18.25, 'wood', 0.5, 0x3e7d5c);           // copper tip
  sim.cameraBlockers.push({ minX: -8, maxX: 0, minZ: -20, maxZ: -14, h: 7 });

  // --- SE TENEMENTS (x 8..19, z 8..14): shops at grade --------------------------
  tower(sim, 8, 8, 5, 6, 0, 7, 'masonry', 'brick', 0x9a5a3a);
  tower(sim, 14, 8, 5, 6, 0, 7, 'masonry', 'brick', 0x8a4a3a);
  BOX(8, 1, 7, 5, 1, 1, 'panel', 1, 0xc23b2e);         // shop awnings
  BOX(14, 1, 7, 5, 1, 1, 'panel', 1, 0x2e5d3a);
  sim.cameraBlockers.push({ minX: 8, maxX: 19, minZ: 7, maxZ: 14, h: 7 });

  // --- ELEVATED TRAIN over Pearl St (x 22..27, z -36..22) -----------------------
  for (let z = -36; z <= 20; z += 4) {
    for (const cx of [23, 25]) BOX(cx, 0, z, 1, 3, 1, 'steel', 1); // bent columns
    BOX(22, 3, z, 5, 1, 1, 'steel', 1);                            // crosshead
  }
  for (let z = -36; z <= 21.5; z += 0.5) {
    for (let w = 0; w < 6; w++) B(22.5 + w * 0.5, 4, z, 'concrete', 0.5); // deck
  }
  for (let z = -36; z <= 20; z += 2) {
    B(22.5, 4.5, z, 'steel', 0.5); B(25, 4.5, z, 'steel', 0.5);
    B(22.5, 5, z, 'steel', 0.5); B(25, 5, z, 'steel', 0.5);       // guard rails
  }
  for (const cz of [-10, -4.5, 1]) {                               // 3-car train
    BOX(23.5, 4.5, cz + 1, 3, 1, 2, 'steel', 0.5);
    BOX(23.5, 4.5, cz + 5, 3, 1, 2, 'steel', 0.5);                 // bogies
    BOX(23.5, 5, cz, 3, 2, 8, 'panel', 0.5, 0xb8c0c8);             // carbody
  }
  sim.cameraBlockers.push({ minX: 22, maxX: 27, minZ: -36, maxZ: 22, h: 6 });

  // --- BATTERY PARK (z 18..25): trees, lamps, benches ---------------------------
  for (const [tx, tz] of [[-26, 20], [-18, 22.5], [-10, 20], [-2, 22.5], [6, 20], [12, 22.5], [16, 19.5], [-22, 24]]) tree(sim, tx, tz);
  for (const [lx, lz] of [[-14, 19], [2, 19], [10, 19]]) lampPost(sim, lx, lz);
  bench(sim, -6, 21.5); bench(sim, 4, 21.5);

  // --- CHARGING BULL (Bowling Green, Broadway S of Wall St) ----------------------
  BOX(0, 0, 12, 6, 1, 3, 'concrete', 0.5, 0x6a7078);   // pedestal
  for (const [lx, lz] of [[0.5, 12.5], [0.5, 13], [2, 12.5], [2, 13]]) B(lx, 0.5, lz, 'panel', 0.5, 0x8c6a3f);
  BOX(0.5, 1, 12.5, 4, 1, 2, 'panel', 0.5, 0x8c6a3f);  // body
  B(0, 1, 12.75, 'panel', 0.5, 0x8c6a3f);              // head
  F(0.125, 1.5, 12.75, 'steel'); F(0.125, 1.5, 13, 'steel'); // horns
  F(2.5, 1, 12.875, 'panel', 0x8c6a3f);                // tail

  // --- FERRY PIER (S harbor) ------------------------------------------------------
  BOX(6, 0, 26, 8, 1, 8, 'wood', 1);                   // deck
  for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) {
    const edge = x === 0 || x === 3 || z === 0 || z === 2;
    if (!edge) continue;
    B(7 + x, 1, 30 + z, 'panel', 1, 0xe8ecf2);
    B(7 + x, 2, 30 + z, 'panel', 1, 0xe8ecf2);
  }
  BOX(7, 3, 30, 4, 1, 3, 'wood', 1);                   // terminal roof
  B(8, 4, 30.5, 'panel', 1, 0x2a5f9a);                 // sign block

  // --- VEHICLES (E-W streets, so the +x build axis reads as parallel-parked) ---
  sedan(sim, -16, 3.5, 0xf7c948);                      // taxi, Wall St
  sedan(sim, 4, 3.5, 0xe8ecf2, 0x2a2f3a);              // NYPD, Wall St
  boxVan(sim, -2, 3.5, 5, 0x8a8f98, 0xd97c2c);         // delivery van, Wall St
  sedan(sim, 6, 15.25, 0xf7c948);                      // taxi, Battery Pl
  bus(sim, -14, 15.25, 0x2a5f9a);                      // city bus, Battery Pl
  boxVan(sim, 8, -13.5, 5, 0xf2f2f2, 0xf2f2f2);        // ambulance, Chambers St
  motorcycle(sim, 12, 15.5);

  // --- STREET FURNITURE ------------------------------------------------------------
  // Broadway lamps: east curb all along; west curb only where buildings
  // don't front the street (city hall/banks sit right on the curb line)
  for (const [lx, lzs] of [[-3.25, [-30, 6]], [3.25, [-30, -18, -6, 6]]]) {
    for (const z of lzs) lampPost(sim, lx, z);
  }
  trafficLight(sim, 3.375, 2.375);                     // Broadway × Wall St
  hydrant(sim, 1, 7.5);                                // Wall St curb
  mailbox(sim, 3.5, 9.75);
  newsstand(sim, 6, -10.5);                            // E sidewalk, N of Wall St
  hotDogCart(sim, 4.75, 12.25);                        // near the bull
  subwayEntrance(sim, 3, -10.75);                      // City Hall park corner

  // ================= S — BATTERY / FERRY (full-peninsula expansion) ============

  // --- CASTLE CLINTON (round fort in Battery Park, ~(-22, 30)) -------------------
  // Square ring with chamfered corners reads as the circular fort at voxel
  // scale. C4 scale, sandstone brick; open courtyard.
  {
    const cx = -22, cz = 30, R = 4;
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const ax = Math.abs(x), az = Math.abs(z);
        const outer = Math.max(ax, az) === R && ax + az <= R + 3; // chamfered ring
        const inner = Math.max(ax, az) >= R - 1;
        if (!outer || !inner) continue;
        B(cx + x, 0, cz + z, 'brick', 1, 0x9a7a5a);
        B(cx + x, 1, cz + z, 'brick', 1, 0x9a7a5a);
        B(cx + x, 2, cz + z, 'concrete', 1, 0x8a7a5a); // parapet cap
      }
    }
  }

  // --- STATEN ISLAND FERRY TERMINAL (x 22..34, z 28..36) + slips + ferry --------
  // White terminal hall with a glass band; two wooden slips reach into the
  // harbor; an ORANGE ferry is moored at the south slip.
  {
    // hall: 12×8, 3 layers — glass band between white panel courses; every
    // other block in the band stays panel so course y=2 never floats on glass
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 12; x++) {
        for (let z = 0; z < 8; z++) {
          const edge = x === 0 || x === 11 || z === 0 || z === 7;
          if (!edge) continue;
          const corner = (x === 0 || x === 11) && (z === 0 || z === 7);
          if (corner) { B(22 + x, y, 28 + z, 'steel', 1); continue; }
          const mat = y === 1 && (x + z) % 2 === 1 ? 'glass' : 'panel';
          B(22 + x, y, 28 + z, mat, 1, mat === 'glass' ? undefined : 0xe8ecf2);
        }
      }
    }
    BOX(22, 3, 28, 12, 1, 8, 'panel', 1, 0xe8ecf2);    // roof
    // interior posts: a 12 m roof plate needs span ≤ 3 m support paths
    for (const [px, pz] of [[26, 31], [29, 31]]) for (let y = 0; y < 3; y++) B(px, y, pz, 'steel', 1);
    BOX(30, 4, 30, 3, 1, 3, 'panel', 1, 0x2a5f9a);     // sign block
    // slips: wood fingers south into the water
    BOX(24, 0, 36, 2, 1, 8, 'wood', 1);
    BOX(30, 0, 36, 2, 1, 8, 'wood', 1);
    // the orange ferry (C2-large): orange hull, white cabin band, 0.5 bricks,
    // moored EAST of the slips (never straddle: one block per fine cell)
    const FB = (x, y, z, m, c) => B(x, y, z, m, 0.5, c);
    for (let x = 0; x < 14; x++) for (let z = 0; z < 8; z++) FB(32.5 + x * 0.5, 0, 37 + z * 0.5, 'panel', 0xd96c2c); // hull deck
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 14; x++) {
        for (let z = 0; z < 8; z++) {
          const edge = x === 0 || x === 13 || z === 0 || z === 7;
          if (!edge) continue;
          FB(32.5 + x * 0.5, 0.5 + y * 0.5, 37 + z * 0.5, 'panel', 0xd96c2c); // hull sides
        }
      }
    }
    for (let x = 0; x < 14; x++) {
      for (let z = 0; z < 8; z++) {
        const edge = x === 0 || x === 13 || z === 0 || z === 7;
        if (!edge) continue;
        FB(32.5 + x * 0.5, 1.5, 37 + z * 0.5, 'panel', 0xf2f2f2); // cabin band
      }
    }
    // cabin roof: full plate DIRECTLY on the band ring (a plate inset from
    // its supporting ring floats — diagonal contact is not a support path)
    for (let x = 0; x < 14; x++) for (let z = 0; z < 8; z++) FB(32.5 + x * 0.5, 2, 37 + z * 0.5, 'panel', 0xf2f2f2);
  }

  // --- CUSTOM HOUSE (x 28..36, z 8..15): steps, column front, entablature --------
  // (E of the El line — the viaduct runs x 22..27; one block per fine cell)
  {
    BOX(27, 0, 6, 10, 1, 1, 'concrete', 1);            // steps
    tower(sim, 28, 8, 8, 7, 0, 7, 'masonry', 'concrete', 0xcfc8b8);
    BOX(28, 7, 8, 8, 1, 7, 'concrete', 1);             // roof plate
    for (const px of [29, 31, 33, 35]) BOX(px, 0, 7, 1, 4, 1, 'steel', 1); // columns
    BOX(28, 4, 7, 8, 1, 1, 'concrete', 1, 0xcfc8b8);   // entablature
    BOX(30, 8, 10, 4, 1, 3, 'wood', 1);                // low dome
    sim.cameraBlockers.push({ minX: 27, maxX: 37, minZ: 6, maxZ: 15, h: 9 });
  }

  // --- BATTERY PARK EAST gardens: hedges, trees, lamps, benches ------------------
  // step 0.5 to match the brick size — a 1 m step left 0.5 m gaps (isolated cubes)
  for (let x = 18; x <= 30; x += 0.5) { B(x, 0, 19, 'leaf', 0.5); B(x, 0.5, 19, 'leaf', 0.5); } // hedge row
  for (const [tx, tz] of [[20, 22.5], [24, 23.5], [28, 22.5], [32, 20]]) tree(sim, tx, tz);
  for (const [lx, lz] of [[18, 21], [27, 22], [34, 21]]) lampPost(sim, lx, lz);
  bench(sim, 22, 21.5); bench(sim, 30, 21.5);

  // ================= E — EAST RIVER / SEAPORT ====================================
  // --- SEAPORT PAVILION (x 48..57, z -22..-15): wood pier hall + deck -------------
  tower(sim, 48, -22, 10, 8, 0, 4, 'masonry', 'wood', 0x8f6a4a); // 4 = 3k+1, tops on slab
  BOX(49, 4, -21, 8, 1, 6, 'wood', 1);                 // gabled roof
  BOX(50, 5, -20, 6, 1, 4, 'wood', 1);
  sim.cameraBlockers.push({ minX: 48, maxX: 58, minZ: -22, maxZ: -14, h: 6 });
  BOX(58, 0, -20, 6, 1, 6, 'wood', 1);                 // pier deck east into the river
  // --- PIER SHEDS (x 58..63): brick cargo sheds -------------------------------------
  tower(sim, 58, -6, 6, 8, 0, 4, 'masonry', 'brick', 0x8a5a44);
  tower(sim, 58, 6, 6, 6, 0, 4, 'masonry', 'brick', 0x9a6a4a);
  // --- TALL SHIP (x 60..63, z -32..-26): dark wood hull, two masts ------------------
  {
    const HB = (x, y, z, m, c) => B(x, y, z, m, 0.5, c);
    for (let x = 0; x < 7; x++) for (let z = 0; z < 12; z++) HB(60 + x * 0.5, 0, -32 + z * 0.5, 'wood', 0x4a3328); // deck
    for (const y of [0.5, 1]) {
      for (let x = 0; x < 7; x++) {
        for (let z = 0; z < 12; z++) {
          const edge = x === 0 || x === 6 || z === 0 || z === 11;
          if (!edge) continue;
          HB(60 + x * 0.5, y, -32 + z * 0.5, 'wood', 0x4a3328); // hull sides
        }
      }
    }
    // masts rise FROM THE DECK TOP (y 0.5, directly above the y0 deck plate);
    // yard arms mount at the mast tops
    for (const mz of [-30, -27.5]) BOX(61.5, 0.5, mz, 1, 11, 1, 'wood', 0.5);
    for (const mz of [-30, -27.5]) for (const yd of [61, 61.5, 62]) HB(yd, 6, mz, 'wood', 0x6a4a32);
  }
  sim.cameraBlockers.push({ minX: 60, maxX: 64, minZ: -32, maxZ: -26, h: 6.5 });
  // --- HELIPORT (x 56..61, z 14..17): pad with the H painted INTO the slab ------
  // (marker blocks layered on top would share fine cells — paint, not stack)
  for (let x = 0; x < 6; x++) {
    for (let z = 0; z < 4; z++) {
      const h = (x === 2 || x === 4) && (z === 1 || z === 2) || (x === 3 && z === 1);
      B(56 + x, 0, 14 + z, h ? 'panel' : 'concrete', 1, h ? 0xe8ecf2 : 0x4a5058);
    }
  }
  // --- street life on South St ------------------------------------------------------
  sedan(sim, 48, -2, 0xf7c948);                        // taxi by the sheds
  sedan(sim, 52, 4, 0xe8ecf2, 0x2a2f3a);               // NYPD by the heliport

  // ================= N — CIVIC CENTER / CHINATOWN / TRIBECA / BRIDGE =============
  // --- MUNICIPAL BUILDING (x -12..2, z -54..-44): civic base + tower + cupola ----
  tower(sim, -12, -54, 14, 10, 0, 10, 'masonry', 'concrete', 0xa89f8d);  // slabs 0..9
  tower(sim, -10, -52, 8, 8, 10, 23, 'masonry', 'concrete', 0xa89f8d);   // slabs 10..22
  BOX(-10, 23, -52, 8, 1, 8, 'concrete', 1);           // top plate
  BOX(-8, 24, -50, 4, 2, 4, 'wood', 1);                // cupola
  for (const px of [-9, -6, -3, 0]) BOX(px, 0, -43, 1, 4, 1, 'steel', 1); // portico
  // entablature spans z[-44,-43]: it bridges the base facade (ends at z-44) to
  // the column row at z-43, so the portico reads as a porch roof, not a
  // detached colonnade standing 1 m clear of the wall
  BOX(-10, 4, -44, 11, 1, 2, 'concrete', 1, 0xa89f8d); // entablature
  sim.cameraBlockers.push({ minX: -12, maxX: 2, minZ: -54, maxZ: -44, h: 26 });

  // --- COURTHOUSE (x -26..-16, z -52..-44) -----------------------------------------
  tower(sim, -26, -52, 10, 8, 0, 7, 'masonry', 'concrete', 0xcfc8b8);    // slabs 0..6
  BOX(-26, 7, -52, 10, 1, 8, 'concrete', 1);           // roof plate
  BOX(-27, 0, -42, 12, 1, 1, 'concrete', 1);           // steps (clear of the columns)
  for (const px of [-24, -22, -20, -18]) BOX(px, 0, -43, 1, 4, 1, 'steel', 1); // columns
  BOX(-26, 4, -44, 10, 1, 2, 'concrete', 1, 0xcfc8b8); // pediment (bridges facade → columns)
  sim.cameraBlockers.push({ minX: -27, maxX: -16, minZ: -52, maxZ: -42, h: 8 });

  // --- CHINATOWN storefront rows (x 24..43, z -56..-50): bright awnings -----------
  {
    const rows = [
      [24, 0x9a5a3a, 0xc23b2e], [31, 0x8a4a3a, 0x2e5d3a],
      [38, 0xa8765a, 0xd9a02c],
    ];
    for (const [rx, wall, awn] of rows) {
      tower(sim, rx, -56, 5, 6, 0, 7, 'masonry', 'brick', wall);
      BOX(rx, 1, -50, 5, 1, 1, 'panel', 1, awn);       // awning, face-adjacent (span support)
      sim.cameraBlockers.push({ minX: rx, maxX: rx + 5, minZ: -56, maxZ: -49, h: 7 });
    }
  }

  // --- COLUMBUS PARK (x 24..38, z -66..-58) ------------------------------------------
  for (const [tx, tz] of [[26, -62], [30, -60], [34, -62], [36, -60], [28, -65], [32, -65]]) tree(sim, tx, tz);
  for (const [lx, lz] of [[28, -58], [34, -58]]) lampPost(sim, lx, lz);
  bench(sim, 30, -62.5); bench(sim, 35, -62.5);

  // --- TRIBECA loft warehouses (x -42..-21, z -62..-55) + roof water towers ------
  tower(sim, -42, -62, 10, 8, 0, 10, 'masonry', 'brick', 0x8a5a44);      // slabs 0..9
  tower(sim, -30, -62, 10, 8, 0, 10, 'masonry', 'brick', 0x9a6a4a);      // slabs 0..9
  for (const [wx, wz] of [[-39, -59], [-27, -59]]) {
    BOX(wx, 10, wz, 2, 1, 2, 'wood', 1);               // legs
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
      const edge = x === 0 || x === 2 || z === 0 || z === 2;
      if (edge) { B(wx - 0.5 + x, 11, wz - 0.5 + z, 'wood', 1); B(wx - 0.5 + x, 12, wz - 0.5 + z, 'wood', 1); }
    }
    BOX(wx - 0.5, 13, wz - 0.5, 3, 1, 3, 'wood', 1);   // tank cap
  }
  sim.cameraBlockers.push({ minX: -42, maxX: -32, minZ: -62, maxZ: -54, h: 14 });
  sim.cameraBlockers.push({ minX: -30, maxX: -20, minZ: -62, maxZ: -54, h: 14 });

  // --- BROOKLYN BRIDGE tower + approach (x 44..62, z -78..-62) ----------------------
  // Twin Gothic pylons with a connecting crown; stone color. Edge monument —
  // one tower, not the full span. Pylons top out at y11 so the crown's y12
  // base slab rests ON them (shared cells would ghost).
  tower(sim, 54, -74, 3, 5, 0, 12, 'masonry', 'concrete', 0x8a7a68);     // pylon W
  tower(sim, 59, -74, 3, 5, 0, 12, 'masonry', 'concrete', 0x8a7a68);     // pylon E
  tower(sim, 54, -74, 8, 5, 12, 16, 'masonry', 'concrete', 0x8a7a68);    // crown (slab spans the gap)
  for (const px of [54, 55, 60, 61]) BOX(px, 16, -74, 1, 2, 1, 'concrete', 1, 0x8a7a68); // caps
  // approach viaduct: steel bents + concrete deck heading SW to the shore —
  // bents every 4 m the whole run, or the deck outruns its supports
  for (let x = 44; x <= 60; x += 4) {
    for (const cz of [-68, -66]) BOX(x, 0, cz, 1, 4, 1, 'steel', 1);
    BOX(x, 4, -68, 1, 1, 3, 'steel', 1);               // crosshead
  }
  for (let x = 44; x <= 61.5; x += 0.5) for (const dz of [-68, -67.5, -67, -66.5]) B(x, 5, dz, 'concrete', 0.5);
  sim.cameraBlockers.push({ minX: 54, maxX: 62, minZ: -74, maxZ: -69, h: 18 });

  // --- street life, north side -------------------------------------------------------
  sedan(sim, 30, -48, 0xf7c948);                       // taxi, Chinatown
  sedan(sim, -16, -40, 0xe8ecf2, 0x2a2f3a);            // NYPD, courthouse
  bus(sim, -6, -40, 0x2a5f9a);                         // bus, Church St
  newsstand(sim, 26, -48); hotDogCart(sim, 36, -48);
  hydrant(sim, 34, -46); mailbox(sim, 28, -46);
  subwayEntrance(sim, 4, -42);                         // Chambers St station
  trafficLight(sim, 2, -40);
  for (const [lx, lz] of [[-14, -42], [8, -42], [22, -42], [43, -46]]) lampPost(sim, lx, lz);

  // ================= W — HUDSON / BATTERY PARK CITY ================================
  // --- BPC residential towers ---------------------------------------------------------
  tower(sim, -52, -30, 10, 10, 0, 16, 'masonry', 'brick', 0xa8765a);     // slabs 0..15
  tower(sim, -56, -6, 10, 10, 0, 13, 'masonry', 'concrete', 0x8a8f98);   // slabs 0..12
  sim.cameraBlockers.push({ minX: -52, maxX: -42, minZ: -30, maxZ: -20, h: 17 });
  sim.cameraBlockers.push({ minX: -56, maxX: -46, minZ: -6, maxZ: 4, h: 14 });
  // --- marina: small boats on the Hudson ------------------------------------------------
  for (const [bx, bz] of [[-50, 12], [-47, 16], [-50, 20]]) {
    BOX(bx, 0, bz, 4, 1, 2, 'panel', 0.5, 0xf2f2f2);   // hull
    for (const my of [0.5, 1, 1.5]) B(bx + 1, my, bz, 'steel', 0.5); // mast (on the hull)
    B(bx + 1, 0.5, bz + 0.5, 'panel', 0.5, 0x2a5f9a);  // cabin (on the hull)
  }
  // --- Hudson pier shed (x -60..-53, z -14..-7) ------------------------------------------
  tower(sim, -60, -14, 8, 8, 0, 4, 'masonry', 'wood', 0x8f6a4a);
  // --- esplanade dressing ------------------------------------------------------------------
  for (const [tx, tz] of [[-40, -20], [-46, 8], [-42, 10]]) tree(sim, tx, tz);
  for (const [lx, lz] of [[-40, -26], [-40, 6], [-40, 16]]) lampPost(sim, lx, lz);
  bench(sim, -41.5, -10); bench(sim, -41.5, 5);
  sedan(sim, -44, -16, 0xf7c948);                      // taxi, BPC
  bus(sim, -40, 12, 0x2a5f9a);                         // bus, West Side Hwy

  // ================= FIDI INFILL ==========================================================
  // --- FEDERAL RESERVE (x -44..-33, z -8..1): rusticated fortress -------------------------
  tower(sim, -44, -8, 12, 10, 0, 13, 'masonry', 'concrete', 0x6a6f78);   // slabs 0..12
  sim.cameraBlockers.push({ minX: -44, maxX: -32, minZ: -8, maxZ: 2, h: 14 });
  // --- NYSE (x 10..17, z -2..5): big columns + flags ---------------------------------------
  tower(sim, 10, -2, 8, 8, 0, 7, 'masonry', 'concrete', 0xcfc8b8);       // slabs 0..6
  BOX(10, 7, -2, 8, 1, 8, 'concrete', 1);              // roof plate
  for (const px of [11, 13, 15, 16]) BOX(px, 0, 6, 1, 4, 1, 'steel', 1); // columns
  BOX(10, 4, 6, 8, 1, 1, 'concrete', 1, 0xcfc8b8);     // pediment
  sim.cameraBlockers.push({ minX: 10, maxX: 18, minZ: -2, maxZ: 7, h: 8 });
  // one flag in the gap between the tenement awnings (x 13 — the only clear
  // cell column; poles elsewhere share cells with columns or awnings)
  B25(13, 0, 7.5, 1, 8, 1, 'steel');
  B25(13.25, 1.5, 7.5, 2, 1, 1, 'panel', 0xc23b2e);
  B25(13.25, 1.25, 7.5, 2, 1, 1, 'panel', 0xe8ecf2);
  B25(13.25, 1, 7.5, 2, 1, 1, 'panel', 0x2a4f9a);
  // --- NE quadrant offices / hotel ------------------------------------------------------------
  tower(sim, 38, -18, 8, 8, 0, 17, 'curtain');                          // slabs 0..16
  tower(sim, 48, -30, 8, 8, 0, 13, 'masonry', 'concrete', 0x7a7f88);     // hotel, slabs 0..12
  tower(sim, 36, -6, 10, 9, 0, 10, 'masonry', 'concrete', 0x8a8f98);     // office, slabs 0..9
  sim.cameraBlockers.push({ minX: 38, maxX: 46, minZ: -18, maxZ: -10, h: 18 });
  sim.cameraBlockers.push({ minX: 48, maxX: 56, minZ: -30, maxZ: -22, h: 14 });
  sim.cameraBlockers.push({ minX: 36, maxX: 46, minZ: -6, maxZ: 3, h: 11 });

  // ================= WTC SITE INFILL ========================================================
  // --- 7 WTC (x -38..-31, z -20..-13) -----------------------------------------------------------
  tower(sim, -38, -20, 8, 8, 0, 21, 'curtain');                          // slabs 0..20
  sim.cameraBlockers.push({ minX: -38, maxX: -30, minZ: -20, maxZ: -12, h: 22 });
  // --- OCULUS (x -9..-3, z -29..-25): rib pavilion — vertical stacks of rising height
  // read as the ribbed wings, and every stack is self-supported (stepped
  // diagonals have no face contact — they would float)
  for (const rz of [-29, -27, -25]) {
    const heights = [1, 2, 4, 6, 4, 2, 1];
    for (let i = 0; i < heights.length; i++) {
      for (let y = 0; y < heights[i]; y++) B(-9 + i, y, rz, 'steel', 1, 0xe8ecf2);
    }
  }
  sim.cameraBlockers.push({ minX: -9, maxX: -2, minZ: -29, maxZ: -24, h: 6 });
  // --- street life, west + infill -----------------------------------------------------------------
  hydrant(sim, -43, 4); mailbox(sim, -42, -24);         // hydrant on the West Side Hwy curb
  // newsstand on Fulton St's north sidewalk. z -21.75, not -22: its roof
  // overhangs 0.25 m north of the body, and One WTC's base tier ends at z-22.
  newsstand(sim, -29, -21.75); trafficLight(sim, -2, -24);
  subwayEntrance(sim, -2, -34);                        // WTC site
  for (const [lx, lz] of [[-38, -28], [-34, -10], [-46, 6], [12, -6], [47, -10]]) lampPost(sim, lx, lz);

  // --- render-side decor + camera data ---------------------------------------------
  sim.sceneDecor = {
    roads: [
      { x: -2.5, z: -38, w: 5, d: 62 },   // Broadway
      { x: 22, z: -38, w: 4, d: 56 },     // Pearl St (under the El) — stops at the park edge
      { x: -34, z: 3, w: 68, d: 4 },      // Wall St
      { x: -34, z: -14, w: 68, d: 3 },    // Chambers St
      { x: -30, z: 15, w: 52, d: 3 },     // Battery Pl
      { x: -44, z: -78, w: 4, d: 104 },   // West Side Hwy
      { x: -7, z: -78, w: 5, d: 40 },     // Church St
      { x: 40, z: -38, w: 4, d: 64 },     // Water St
      { x: 44, z: -78, w: 4, d: 104 },    // FDR / South St
      { x: -44, z: -19, w: 64, d: 3 },    // Liberty St
      { x: -30, z: -23, w: 88, d: 4 },    // Fulton St
      { x: -40, z: -37, w: 60, d: 3 },    // Vesey St
      { x: 8, z: -14, w: 4, d: 29 },      // Broad St
      { x: -2, z: -44, w: 4, d: 24 },     // Park Row
      { x: -14, z: -56, w: 4, d: 12 },    // Centre St
      { x: -60, z: -80, w: 120, d: 4 },   // Canal-side north edge
      { x: -20, z: -43, w: 46, d: 5 },    // Duane St — Civic Center cross street
      { x: 22, z: -49, w: 24, d: 4 },     // Bayard St — Chinatown
      { x: 46, z: -3, w: 12, d: 3 },      // South St apron, N of the pier sheds
      { x: 46, z: 3, w: 12, d: 3 },       // South St apron, by the heliport
    ],
    parks: [
      { x: -30, z: 18, w: 66, d: 8 },     // Battery Park (reaches the east gardens)
      { x: -26, z: 26, w: 10, d: 8 },     // Castle Clinton point
      { x: -10, z: -24, w: 14, d: 10 },   // City Hall Park
      { x: 24, z: -66, w: 14, d: 8 },     // Columbus Park
    ],
    water: [
      // The harbor is carved around the two land pockets that carry structures:
      // Castle Clinton's Battery point and the Whitehall ferry apron. A single
      // rect put the fort and the ferry terminal in open water, and buried the
      // Castle Clinton park plane (water draws at y .008 over parks at .006).
      { x: -80, z: 26, w: 54, d: 54 },    // harbor, W of Castle Clinton
      { x: -26, z: 35, w: 46, d: 45 },    // harbor, S of Castle Clinton
      { x: -16, z: 26, w: 36, d: 9 },     // harbor, E of the fort (ferry pier)
      { x: 20, z: 37, w: 60, d: 43 },     // harbor, S of the ferry apron
      { x: 36, z: 26, w: 44, d: 11 },     // harbor, E of the ferry apron
      { x: -80, z: -80, w: 14, d: 106 },  // Hudson River (W)
      { x: -66, z: 10, w: 22, d: 16 },    // Hudson marina basin — reaches the moorings
      { x: 66, z: -80, w: 14, d: 106 },   // East River (E)
      { x: 58, z: -40, w: 22, d: 26 },    // East River off the Seaport (tall ship + pier)
      { x: 40, z: -80, w: 40, d: 14 },    // under the Brooklyn Bridge (NE)
    ],
  };

  // Surface registry rollout — render-side only; the sim never reads it.
  // The same full-coverage map every scene carries (js/voxelsurfaces.js);
  // rubber/leaf stay unmapped on Boston's documented judgement.
  sim.sceneSurfaces = {
    brick: 'mat_brick_red',
    glass: 'mat_shop_window',
    concrete: 'mat_suburban_siding',
    steel: 'mat_warehouse_roll',
    panel: 'mat_awning_stripe',
    wood: 'mat_clay_shingles',
  };
}
