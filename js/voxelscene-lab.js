import { generateBlockers } from './voxelkit.js';

// Identical occupied volume on both sides: only the subdivision changes.
// Keep street snacks granular; consolidate buildings by bay, never whole towers.
export function buildLab(sim) {
  sim.bounds = 62;
  sim.boundsRect = { minX: -62, maxX: 62, minZ: -26, maxZ: 30 };
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
  roads.push({x:-15,z:10,w:30,d:8,color:0x65716e});
  sim.sceneDecor = { roads, sidewalks, parks, laneMarkers, crosswalks };
  sim.sceneSurfaces = {};
  sim.cameraBlockers = generateBlockers(sim);
}
