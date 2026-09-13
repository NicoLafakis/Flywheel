import { generateBlockers } from './voxelkit.js';
import { slab, column, pier, beam, drum } from './voxelforms.js';

// Identical occupied volume on both sides: only the subdivision changes.
// Keep street snacks granular; consolidate buildings by bay, never whole towers.
export function buildLab(sim) {
  sim.bounds = 62;
  sim.boundsRect = { minX: -62, maxX: 62, minZ: -72, maxZ: 30 };
  sim.labCities = [];
  const roads = [], sidewalks = [], parks = [], laneMarkers = [], crosswalks = [];
  for (const [offset, architectural] of [[-36, false], [36, true]]) {
    const city = { name: architectural ? 'ARCHITECTURAL PIECES' : 'VOXELS', offset,
      minX: offset-20, maxX: offset+20, first: sim.blocks.length };
    const piece = (x,y,z,w,h,d,mat,color,small=false) => {
      if (architectural && !small) sim._block(offset+x,y,z,mat,[w,h,d],color);
      else for(let ix=0;ix<w;ix+=0.5) for(let iy=0;iy<h;iy+=0.5) for(let iz=0;iz<d;iz+=0.5)
        sim._block(offset+x+ix,y+iy,z+iz,mat,0.5,color);
    };
    // Starter market: low crates, cars and trees remain many little bites.
    for (let x=-18;x<=18;x+=3) {
      piece(x,0,12,1,0.5,1,'wood',0xc98a50,true);
      piece(x,0,15,0.5,0.5,0.5,'brick',0xe9bd75,true);
    }
    for(const x of [-15,-5,5,15]) {
      piece(x,0,3,1.5,0.5,3,'steel',x<0?0xe7af45:0x5b9eae,true);
      piece(x,0.5,3.5,1.5,0.5,1.5,'glass',0x9ecbd0,true);
      piece(x,0,-3,0.5,1.5,0.5,'wood',0x8d6548,true);
      piece(x-0.5,1.5,-3.5,1.5,1.5,1.5,'wood',0x78a66a,true);
    }
    // Two shops, two apartment houses and a taller skyline anchor.
    for(const [x,z,floors,color] of [[-18,-18,2,0xc97d60],[-7,-18,4,0x80a8b3],[7,-18,3,0xd9bd84],[-16,19,1,0xddad65],[7,19,2,0x84a793]]) {
      for(let floor=0;floor<floors;floor++) {
        const y=floor*3;
        // Two-metre floor bays still produce multiple falling sections.
        for(let dx=0;dx<6;dx+=2) for(let dz=0;dz<6;dz+=2)
          piece(x+dx,y,z+dz,2,0.5,2,'concrete',0xd3cbbb);
        for(let dy=0.5;dy<3;dy+=0.5) {
          for(let dx=0;dx<6;dx+=2) {
            const tint = dy===1.5 || dy===2 ? 0x8ab9c5 : color;
            // Masonry mullions remain load-bearing; window colour adds rhythm.
            piece(x+dx,y+dy,z,2,0.5,0.5,'brick',tint);
            piece(x+dx,y+dy,z+5.5,2,0.5,0.5,'brick',tint);
          }
          for(let dz=0.5;dz<5.5;dz+=1)
            for(const dx of [0,5.5]) piece(x+dx,y+dy,z+dz,0.5,0.5,1,'brick',color);
        }
      }
      for(let dx=0;dx<6;dx+=2) for(let dz=0;dz<6;dz+=2)
        piece(x+dx,floors*3,z+dz,2,0.5,2,'concrete',0x596b76);
      piece(x+2,floors*3+0.5,z+2,2,0.5,2,'steel',0x91a2aa);
    }
    city.end=sim.blocks.length;
    sim.labCities.push(city);
    sidewalks.push({x:offset-21,z:-21,w:42,d:48,color:0xcac6b8});
    roads.push({x:offset-21,z:-1,w:42,d:10,color:0x384953});
    roads.push({x:offset-1,z:-21,w:5,d:48,color:0x384953});
    parks.push({x:offset+15,z:-18,w:5,d:12,color:0x8cae77});
    for(let x=-20;x<20;x+=4) laneMarkers.push({x:offset+x,z:0,w:2,d:0.25,color:0xf3cf79});
    for (const z of [-2,9]) {
      laneMarkers.push({x:offset-1,z,w:5,d:0.5,color:0xf8fafc,isStopLine:true});
      for(let x=-1;x<4;x+=1) crosswalks.push({x:offset+x,z:z+0.5,w:0.5,d:1.5,color:0xf8fafc});
    }
    // Colour-coded entrance pads identify west/cubes and east/architectural.
    laneMarkers.push({x:offset-19,z:10,w:38,d:0.5,color:architectural?0x64c8b4:0xf0b657});
  }

  // --- TOKYO PROTOTYPE (z -70..-34) ------------------------------------------
  // Miniature mixed-geometry recreations of Tokyo's five heroes
  // (TOKYO_HEROES in voxelscene-tokyo.js): the sandbox where piece sizing and
  // bite granularity for the Tokyo method get compared before map work.
  // Architectural members carry the big forms; cubes stay where bites are felt.
  sim.labTokyo = { name: 'TOKYO PROTOTYPE', minX: -56, maxX: 56, minZ: -70, maxZ: -34, first: sim.blocks.length };

  // Tocho Twins: two 12 m slab towers, hollow cores, one skybridge.
  // Walls follow the comparison cities' proven pattern — stacked 0.5 m masonry
  // courses with glass-BLUE painted sections for window rhythm — because glass
  // panels are non-structural here: slabs over a glass wall get no vertical
  // support and the whole tower cascades at spawn (measured: 144 pieces).
  for (const tx of [-52, -44]) {
    for (let floor = 0; floor < 4; floor++) {
      const y = floor * 3;
      for (let dx = 0; dx < 6; dx += 2) for (let dz = 0; dz < 6; dz += 2)
        slab(sim, { x: tx + dx, y, z: -66 + dz, w: 2, d: 2, color: 0xb9c2c9 });
      for (let dy = 0.5; dy < 3; dy += 0.5) {
        for (let dx = 0; dx < 6; dx += 2) {
          const tint = dy === 1.5 || dy === 2 ? 0x8ab9c5 : 0x7d8b99;
          sim._block(tx + dx, y + dy, -66, 'brick', [2, 0.5, 0.5], tint);
          sim._block(tx + dx, y + dy, -60.5, 'brick', [2, 0.5, 0.5], tint);
        }
        for (let dz = 0.5; dz < 5.5; dz += 1)
          for (const dx of [0, 5.5]) sim._block(tx + dx, y + dy, -66 + dz, 'brick', [0.5, 0.5, 1], 0x7d8b99);
      }
    }
    for (let dx = 0; dx < 6; dx += 2) for (let dz = 0; dz < 6; dz += 2)
      slab(sim, { x: tx + dx, y: 12, z: -66 + dz, w: 2, d: 2, color: 0x596b76 });
    column(sim, { x: tx + 2.75, y: 12.5, z: -63.25, h: 3, s: 0.5, mat: 'steel', color: 0x8d99ae });
  }
  // The 2 m gap between tower faces makes the bridge a single short beam whose
  // ends bear on the fourth-floor slabs.
  beam(sim, { x: -47, y: 9, z: -63.5, len: 4, axis: 'x', depth: 1, mat: 'concrete', color: 0xb9c2c9 });

  // Cocoon Tower: three drum tiers in white/concrete/cyan banding. The radius
  // stays constant — a tapered ring's facets stop aligning vertically and the
  // upper tier falls at spawn (measured: 25 pieces). The colour banding, not
  // the taper, carries the miniature's silhouette at this scale.
  for (const [y, mat, c] of [[0, 'steel', 0xe8ecef], [4, 'concrete', 0x8ecae6], [8, 'steel', 0xe8ecef]])
    drum(sim, { x: -24, y, z: -66, r: 3, h: 4, facets: 12, mat, color: c });
  // No cap: a centre slab spans 1.8 m past the top ring's cells and falls.

  // Kabukicho gate: red piers carrying a continuous lintel of tiling 4 m beams.
  // `corbelArch` is deliberately not used — every corbel course trips
  // probePlacementStep (the probe's "gap" IS the arch's opening; documented
  // false positive in voxelscene-cambridge.js §7/P6.9), and Cambridge's
  // established answer is to step course-on-course instead. The beams tile
  // end-to-end (gap 0), each within the hop budget off its piers.
  for (const px of [-7, -3, 2, 6]) pier(sim, { x: px, z: -50, w: 1, h: 5, mat: 'steel', color: 0xd7263d });
  for (const bx of [-7, -3, 1]) beam(sim, { x: bx, y: 5, z: -50, len: 4, axis: 'x', t: 0.5, depth: 1, mat: 'steel', color: 0xd7263d });
  beam(sim, { x: 5, y: 5, z: -50, len: 2, axis: 'x', t: 0.5, depth: 1, mat: 'steel', color: 0xd7263d });
  for (const bx of [-5, -1]) beam(sim, { x: bx, y: 5.5, z: -50, len: 4, axis: 'x', t: 0.5, depth: 1, mat: 'steel', color: 0xa41623 });

  // Golden Gai: twelve tiny izakaya, walls kept as 0.5 cubes — these are
  // starter bites, not structure, so granularity is the point.
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 3; gz++) {
    const ox = 8 + gx * 5, oz = -62 + gz * 5;
    const wall = gz % 2 ? 0x8d6548 : 0xa4703b;
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      if (ix === 1 && iz === 1) continue;
      sim._block(ox + ix * 0.5, 0, oz + iz * 0.5, 'wood', 0.5, wall);
      sim._block(ox + ix * 0.5, 0.5, oz + iz * 0.5, 'wood', 0.5, wall);
    }
    slab(sim, { x: ox - 0.25, y: 1, z: oz - 0.25, w: 2, d: 2, t: 0.25, mat: 'steel', color: 0x495057 });
    sim._block(ox + 1.5, 0, oz + 1.5, 'glass', 0.5, 0xffd166); // lantern by the door
  }

  // Station viaduct: piers every 3 m with a one-piece deck per span, and a
  // five-car train resting on it. Short spans keep the bridge within the hop
  // budget; the train cars are single bites at mid-game size.
  for (let x = -56; x <= 53; x += 3) column(sim, { x, z: -39.5, h: 3, s: 1, mat: 'concrete', color: 0x7d8590 });
  for (let x = -56; x < 55; x += 3) beam(sim, { x, y: 3, z: -40, len: 3, axis: 'x', t: 0.5, depth: 3, mat: 'steel', color: 0x4a4e69 });
  for (let i = 0; i < 5; i++)
    sim._block(-10 + i * 3, 3.5, -39.5, 'steel', [2.5, 2, 2], i % 2 ? 0xe8ecef : 0xd7263d);

  // Shibuya 109: one silver drum with a magenta crown tier. A perimeter
  // cornice ring fails here — an 8 m cornice run overshoots the drum's ~2 m
  // facet chords and has nothing to bear on (measured: the cornices fell).
  drum(sim, { x: 38, y: 0, z: -66, r: 4, h: 9, facets: 12, mat: 'concrete', color: 0xc9ced6 });
  drum(sim, { x: 38, y: 9, z: -66, r: 4, h: 0.5, facets: 12, mat: 'steel', color: 0xe05a9b });

  // Promenade street food: crates and lantern posts between the gate and the
  // viaduct, so a fresh hole has a route into the band. Lanterns sit at grade —
  // hung at the post top they cantilever two cells off a 0.25 m post and fall.
  for (let x = -34; x <= 34; x += 4) {
    sim._block(x, 0, -43.5, 'wood', 0.5, 0xc98a50);
    sim._block(x + 0.5, 0, -43, 'brick', 0.5, 0xe9bd75);
    column(sim, { x: x + 1.5, z: -43.5, h: 2, s: 0.25, mat: 'steel', color: 0x495057 });
    sim._block(x + 2, 0, -43.5, 'glass', 0.5, 0xffd166);
  }
  sim.labTokyo.end = sim.blocks.length;

  // Band approach: an east-west avenue between the comparison cities and the
  // viaduct, the band's pavement, and a magenta pad at the band entrance.
  roads.push({x:-15,z:10,w:30,d:8,color:0x65716e});
  roads.push({x:-57,z:-34,w:114,d:8,color:0x384953});
  sidewalks.push({x:-57,z:-72,w:114,d:38,color:0xcac6b8});
  laneMarkers.push({x:-20,z:-31,w:40,d:0.5,color:0xe05a9b});
  sim.sceneDecor = { roads, sidewalks, parks, laneMarkers, crosswalks };
  sim.sceneSurfaces = {};
  sim.cameraBlockers = generateBlockers(sim);
}
