// Deterministic city-district generator. Pure (no three.js): produces a layout
// description plus a flat object list consumed by sim.js, world3d.js and the
// validator. Same seed => identical output on every machine.
//
// Placement is TILE-BASED: the map is a 1 m lattice, every tile is classified
// (lane/curb/sidewalk/build/yard/park/stall/water), every object snaps to a
// tile center and may only sit on tiles allowed for its kind. Tier radii stay
// continuous (gameplay + the validator's circle-overlap proof), but alignment
// and type discipline come from the grid.

import { RNG } from './rng.js';
import { TIERS } from './tiers.js';

// ---------------------------------------------------------------- spatial hash
export class SpatialHash {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.map = new Map();
  }
  key(x, z) { return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`; }
  insert(obj) {
    const k = this.key(obj.x, obj.z);
    obj._cell = k;
    let arr = this.map.get(k);
    if (!arr) this.map.set(k, arr = []);
    arr.push(obj);
  }
  // Re-home an object that moved (bounced props).
  update(obj) {
    const k = this.key(obj.x, obj.z);
    if (k === obj._cell) return;
    const arr = this.map.get(obj._cell);
    if (arr) {
      const i = arr.indexOf(obj);
      if (i >= 0) arr.splice(i, 1);
    }
    this.insert(obj);
  }
  // Visit all objects in cells overlapping the circle (x,z,r).
  query(x, z, r, cb) {
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const arr = this.map.get(`${cx},${cz}`);
      if (arr) for (let i = 0; i < arr.length; i++) cb(arr[i]);
    }
  }
}

const PLACEMENT_MARGIN = 0.05;

function overlapsAny(hash, x, z, r) {
  let hit = false;
  hash.query(x, z, r + 3, (o) => {
    if (hit) return;
    const dx = o.x - x, dz = o.z - z;
    const rr = o.radius + r + PLACEMENT_MARGIN;
    if (dx * dx + dz * dz < rr * rr) hit = true;
  });
  return hit;
}

function tryPlace(hash, rng, r, xmin, xmax, zmin, zmax, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const x = rng.float(xmin + r, xmax - r);
    const z = rng.float(zmin + r, zmax - r);
    if (xmin + r >= xmax - r || zmin + r >= zmax - r) return null;
    if (!overlapsAny(hash, x, z, r)) return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------- tile grid
export const TILE = {
  GROUND: 0, WATER: 1, LANE: 2, CURB: 3, SIDEWALK: 4,
  BUILD: 5, YARD: 6, PARK: 7, STALL: 8,
};

class TileGrid {
  // 1 m tiles over [x0,x0+cols) x [z0,z0+rows); tile (i,j) center is
  // (x0+i+0.5, z0+j+0.5).
  constructor(x0, z0, cols, rows) {
    this.x0 = x0; this.z0 = z0;
    this.cols = cols; this.rows = rows;
    this.type = new Uint8Array(cols * rows);
    this.used = new Uint8Array(cols * rows);
  }
  idx(i, j) { return j * this.cols + i; }
  inBounds(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }
  typeAt(x, z) {
    const i = Math.floor(x - this.x0), j = Math.floor(z - this.z0);
    if (!this.inBounds(i, j)) return TILE.WATER;
    return this.type[this.idx(i, j)];
  }
  setAt(x, z, t) {
    const i = Math.floor(x - this.x0), j = Math.floor(z - this.z0);
    if (this.inBounds(i, j)) this.type[this.idx(i, j)] = t;
  }
  // Every tile center within (r + pad) of (x,z) must be an allowed type and
  // unoccupied.
  canOccupy(x, z, r, allowed, pad = 0.35) {
    const R = r + pad;
    for (let tx = Math.floor(x - R) + 0.5; tx <= x + R; tx += 1) {
      for (let tz = Math.floor(z - R) + 0.5; tz <= z + R; tz += 1) {
        const dx = tx - x, dz = tz - z;
        if (dx * dx + dz * dz > R * R) continue;
        const i = Math.floor(tx - this.x0), j = Math.floor(tz - this.z0);
        if (!this.inBounds(i, j)) return false;
        const k = this.idx(i, j);
        if (!allowed.includes(this.type[k]) || this.used[k]) return false;
      }
    }
    return true;
  }
  occupy(x, z, r, pad = 0.35) {
    const R = r + pad;
    for (let tx = Math.floor(x - R) + 0.5; tx <= x + R; tx += 1) {
      for (let tz = Math.floor(z - R) + 0.5; tz <= z + R; tz += 1) {
        const dx = tx - x, dz = tz - z;
        if (dx * dx + dz * dz > R * R) continue;
        const i = Math.floor(tx - this.x0), j = Math.floor(tz - this.z0);
        if (this.inBounds(i, j)) this.used[this.idx(i, j)] = 1;
      }
    }
  }
}

const snap = (v) => Math.floor(v) + 0.5;

// ---------------------------------------------------------------- generator
// Returns {
//   size, spawn, bounds, waterRect, roads, blocks, tileGrid,
//   objects: [{id,tier,kind,x,z,radius,mass,golden,colorIdx,h,w,d,rotY}],
//   landmark (optional), hash, tides
// }
export function generateCity(level) {
  const rng = new RNG(level.seed);
  const size = level.size;
  const half = size / 2;
  const hash = new SpatialHash(4);
  const objects = [];
  let nextId = 1;

  const addObject = (o) => {
    o.id = nextId++;
    o.eaten = false;
    objects.push(o);
    hash.insert(o);
    return o;
  };

  // --- waterfront: water strip along the south edge (z = +half) ---
  const waterDepth = size * 0.12;
  const waterRect = { x: -half, z: half - waterDepth, w: size, h: waterDepth };
  const playable = { xmin: -half, xmax: half, zmin: -half, zmax: half - waterDepth };

  // --- street grid ---
  const blockSize = rng.float(16, 20);
  const roadW = 4;
  const roads = { vertical: [], horizontal: [], width: roadW };
  for (let x = -half + roadW; x < half - roadW; x += blockSize + roadW) roads.vertical.push(x);
  for (let z = -half + roadW; z < playable.zmax - roadW; z += blockSize + roadW) roads.horizontal.push(z);

  // --- spawn: center of the district, away from water ---
  const spawn = { x: 0, z: (playable.zmin + playable.zmax) / 2 };

  // --- blocks between roads, zoned by distance from center: dense URBAN core
  // (towers/shops), MIXED ring, RESIDENTIAL outer edge. ---
  const coreR = (0.16 + level.metroIndex * 0.06) * size;
  const midR = coreR + 0.22 * size;
  const blocks = [];
  const xs = [-half, ...roads.vertical, half];
  const zs = [-half, ...roads.horizontal, playable.zmax];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < zs.length - 1; bj++) {
      const xmin = xs[bi] + roadW / 2, xmax = xs[bi + 1] - roadW / 2;
      const zmin = zs[bj] + roadW / 2, zmax = zs[bj + 1] - roadW / 2;
      if (xmax - xmin < 6 || zmax - zmin < 6) continue;
      const d = Math.hypot((xmin + xmax) / 2 - spawn.x, (zmin + zmax) / 2 - spawn.z);
      let type;
      if (d < coreR) {
        type = 'towers';
      } else if (d < midR) {
        const roll = rng.next();
        type = roll < 0.55 ? 'shops' : roll < 0.78 ? 'park' : 'parking';
      } else {
        const roll = rng.next();
        type = roll < 0.78 ? 'housing' : roll < 0.90 ? 'park' : 'parking';
      }
      blocks.push({ xmin, xmax, zmin, zmax, type });
    }
  }

  // --- tile classification ---
  const grid = new TileGrid(-half, -half, size, size);
  // water
  for (let x = -half + 0.5; x < half; x += 1) {
    for (let z = waterRect.z; z < half; z += 1) grid.setAt(x, snap(z), TILE.WATER);
  }
  // roads: lane in the middle, curb parking band at the edges, intersections lane
  for (let x = -half + 0.5; x < half; x += 1) {
    for (let z = -half + 0.5; z < half; z += 1) {
      let dv = Infinity, dh = Infinity;
      for (const rx of roads.vertical) dv = Math.min(dv, Math.abs(x - rx));
      for (const rz of roads.horizontal) dh = Math.min(dh, Math.abs(z - rz));
      const onV = dv <= roadW / 2, onH = dh <= roadW / 2;
      if (onV && onH) grid.setAt(x, z, TILE.LANE);
      else if (onV) grid.setAt(x, z, dv > roadW / 2 - 1 ? TILE.CURB : TILE.LANE);
      else if (onH) grid.setAt(x, z, dh > roadW / 2 - 1 ? TILE.CURB : TILE.LANE);
    }
  }
  // block interiors: sidewalk ring, then per-type zones
  for (const b of blocks) {
    for (let x = snap(b.xmin); x < b.xmax; x += 1) {
      for (let z = snap(b.zmin); z < b.zmax; z += 1) {
        const dEdge = Math.min(x - b.xmin, b.xmax - x, z - b.zmin, b.zmax - z);
        let t;
        if (dEdge < 1) t = TILE.SIDEWALK;
        else if (b.type === 'park') t = TILE.PARK;
        else if (b.type === 'parking') t = dEdge < 1.5 ? TILE.SIDEWALK : TILE.STALL;
        else if (b.type === 'housing') t = dEdge <= 4 ? TILE.BUILD : TILE.YARD;
        else if (b.type === 'shops') t = dEdge <= 5 ? TILE.BUILD : TILE.YARD;
        else t = TILE.BUILD; // towers: dense to the core
        grid.setAt(x, z, t);
      }
    }
  }

  // --- placement core: grid-snapped, type-checked, no-overlap ---
  const place = (o, allowed) => {
    if (overlapsAny(hash, o.x, o.z, o.radius)) return null;
    if (!grid.canOccupy(o.x, o.z, o.radius, allowed)) return null;
    grid.occupy(o.x, o.z, o.radius);
    return addObject(o);
  };

  // --- guaranteed snack ring FIRST so nothing can crowd it out ---
  const SNACK_TILES = [TILE.BUILD, TILE.YARD, TILE.SIDEWALK, TILE.PARK, TILE.STALL, TILE.CURB];
  const snackCount = 12;
  for (let i = 0; i < snackCount; i++) {
    const angle = (i / snackCount) * Math.PI * 2;
    const dist = 2.0 + (i % 3) * 1.0; // 2..4 m; arc spacing >= 1 tile
    const tier = i % 2 === 0 ? 1 : 2;
    const r = TIERS[tier].radius;
    // try the snapped ring position, then nearby tile offsets, until one fits
    const candidates = [];
    for (const dOff of [0, 0.6, 1.2]) {
      for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        candidates.push([
          snap(spawn.x + Math.cos(angle) * (dist + dOff)) + ox,
          snap(spawn.z + Math.sin(angle) * (dist + dOff)) + oz,
        ]);
      }
    }
    for (const [x, z] of candidates) {
      const ok = place({
        tier, kind: tier === 1 ? 'clutter' : 'bike', x, z, radius: r,
        mass: TIERS[tier].mass, golden: false, colorIdx: rng.int(0, 5), snack: true,
      }, SNACK_TILES);
      if (ok) break;
    }
  }

  // --- metro tier-mix: later metros shift mass upward ---
  const m = level.metroIndex;
  const buildingTierPick = () => {
    const roll = rng.next();
    const t7 = 0.06 + m * 0.05, t6 = 0.22 + m * 0.06;
    if (roll < t7) return 7;
    if (roll < t7 + t6) return 6;
    return 5;
  };

  const BUILD_TILES = [TILE.BUILD];
  const placeBuilding = (tier, x, z, rotY, kind) => {
    const r = TIERS[tier].radius;
    const h = tier === 5 ? rng.float(3.2, 5.5)
      : tier === 6 ? rng.float(8, 16)
      : rng.float(18, 32);
    return place({
      tier, kind: 'building', variant: kind, x, z, radius: r,
      mass: TIERS[tier].mass, golden: level.golden && rng.chance(0.01),
      colorIdx: rng.int(0, 5), h, w: r * 1.5, d: r * 1.2, rotY,
    }, BUILD_TILES);
  };

  // Frontage walk: lots every `step` tiles along each block edge, building
  // centers snapped to the tile lattice, fronts facing the street.
  const frontageFill = (b, step, insetTiles, tierFn, kind, fillChance) => {
    const rMax = TIERS[7].radius;
    for (let x = snap(b.xmin); x < b.xmax - 1; x += step) {
      for (const [zEdge, rotY] of [[b.zmin, 0], [b.zmax, Math.PI]]) {
        if (!rng.chance(fillChance)) continue;
        const tier = tierFn();
        const z = zEdge === b.zmin
          ? snap(b.zmin + insetTiles + TIERS[tier].radius)
          : snap(b.zmax - insetTiles - TIERS[tier].radius);
        placeBuilding(tier, x, z, rotY, kind);
      }
    }
    for (let z = snap(b.zmin); z < b.zmax - 1; z += step) {
      for (const [xEdge, rotY] of [[b.xmin, Math.PI / 2], [b.xmax, -Math.PI / 2]]) {
        if (!rng.chance(fillChance)) continue;
        const tier = tierFn();
        const x = xEdge === b.xmin
          ? snap(b.xmin + insetTiles + TIERS[tier].radius)
          : snap(b.xmax - insetTiles - TIERS[tier].radius);
        placeBuilding(tier, x, z, rotY, kind);
      }
    }
  };

  const scatterOnTiles = (b, tileType, tries, make) => {
    for (let i = 0; i < tries; i++) {
      const x = snap(rng.float(b.xmin + 1, b.xmax - 1));
      const z = snap(rng.float(b.zmin + 1, b.zmax - 1));
      if (grid.typeAt(x, z) !== tileType) continue;
      make(x, z);
    }
  };

  for (const b of blocks) {
    if (b.type === 'towers') {
      frontageFill(b, 6, 1.4, () => Math.max(6, rng.chance(0.45) ? 7 : buildingTierPick()), 'tower', 0.72);
      // interior towers on the lattice
      for (let x = snap(b.xmin + 3); x < b.xmax - 3; x += 6) {
        for (let z = snap(b.zmin + 3); z < b.zmax - 3; z += 6) {
          if (!rng.chance(0.5)) continue;
          const tier = buildingTierPick();
          placeBuilding(tier, x, z, 0, tier === 5 ? 'shop' : 'tower');
        }
      }
    } else if (b.type === 'shops') {
      frontageFill(b, 4, 1.4, () => (rng.chance(0.3) ? 6 : 5), 'shop', 0.8);
    } else if (b.type === 'housing') {
      frontageFill(b, 3, 1.4, () => 5, 'house', 0.8);
      // yards: trees + clutter
      scatterOnTiles(b, TILE.YARD, Math.floor((b.xmax - b.xmin) * (b.zmax - b.zmin) / 30), (x, z) => {
        const tier = rng.chance(0.6) ? 2 : 1;
        place({
          tier, kind: tier === 2 ? 'tree' : 'clutter', x, z, radius: TIERS[tier].radius,
          mass: TIERS[tier].mass, golden: level.golden && rng.chance(0.03),
          colorIdx: rng.int(0, 5),
        }, [TILE.YARD]);
      });
    } else if (b.type === 'park') {
      scatterOnTiles(b, TILE.PARK, Math.floor((b.xmax - b.xmin) * (b.zmax - b.zmin) / 7), (x, z) => {
        const tier = rng.chance(0.55) ? 2 : 1;
        place({
          tier, kind: tier === 2 ? 'tree' : 'clutter', x, z, radius: TIERS[tier].radius,
          mass: TIERS[tier].mass, golden: level.golden && rng.chance(0.04),
          colorIdx: rng.int(0, 5),
        }, [TILE.PARK]);
      });
    } else {
      // parking lot: stalls in rows on STALL tiles, aligned with the lot
      let rowIdx = 0;
      for (let z = snap(b.zmin + 2); z < b.zmax - 1.5; z += 2, rowIdx++) {
        for (let x = snap(b.xmin + 1.5); x < b.xmax - 1.5; x += 2) {
          if (!rng.chance(0.7)) continue;
          const tier = rng.chance(0.06) ? 4 : 3;
          place({
            tier, kind: tier === 4 ? 'bus' : 'car', x, z, radius: TIERS[tier].radius,
            mass: TIERS[tier].mass, golden: level.golden && rng.chance(0.03),
            colorIdx: rng.int(0, 5), rotY: rowIdx % 2 === 0 ? 0 : Math.PI,
          }, [TILE.STALL]);
        }
      }
    }
  }

  // --- curb parking: cars on CURB tiles only, aligned with the road ---
  for (const rx of roads.vertical) {
    let gap = 0;
    for (let z = -half + 1.5; z < playable.zmax - 1.5; z += 1) {
      if (gap > 0) { gap--; continue; }
      if (!rng.chance(0.4)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = snap(rx + side * (roadW / 2 - 0.5));
      const placedCar = place({
        tier: 3, kind: 'car', x, z, radius: TIERS[3].radius, mass: TIERS[3].mass,
        golden: level.golden && rng.chance(0.02), colorIdx: rng.int(0, 5),
        rotY: side > 0 ? 0 : Math.PI,
      }, [TILE.CURB]);
      if (placedCar) gap = 2;
    }
    // buses in the driving lane, away from intersections
    for (let z = -half + 4; z < playable.zmax - 4; z += 1) {
      if (!rng.chance(0.02)) continue;
      const x = snap(rx);
      const placedBus = place({
        tier: 4, kind: 'bus', x, z, radius: TIERS[4].radius, mass: TIERS[4].mass,
        golden: false, colorIdx: rng.int(0, 5), rotY: 0,
      }, [TILE.LANE]);
      if (placedBus) z += 8;
    }
  }
  for (const rz of roads.horizontal) {
    let gap = 0;
    for (let x = -half + 1.5; x < half - 1.5; x += 1) {
      if (gap > 0) { gap--; continue; }
      if (!rng.chance(0.4)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const z = snap(rz + side * (roadW / 2 - 0.5));
      const placedCar = place({
        tier: 3, kind: 'car', x, z, radius: TIERS[3].radius, mass: TIERS[3].mass,
        golden: level.golden && rng.chance(0.02), colorIdx: rng.int(0, 5),
        rotY: side > 0 ? Math.PI / 2 : -Math.PI / 2,
      }, [TILE.CURB]);
      if (placedCar) gap = 2;
    }
    for (let x = -half + 4; x < half - 4; x += 1) {
      if (!rng.chance(0.02)) continue;
      const z = snap(rz);
      const placedBus = place({
        tier: 4, kind: 'bus', x, z, radius: TIERS[4].radius, mass: TIERS[4].mass,
        golden: false, colorIdx: rng.int(0, 5), rotY: Math.PI / 2,
      }, [TILE.LANE]);
      if (placedBus) x += 8;
    }
  }

  // --- sidewalk life: clutter + bikes on SIDEWALK tiles only ---
  for (let x = -half + 0.5; x < half; x += 1) {
    for (let z = -half + 0.5; z < playable.zmax; z += 1) {
      if (grid.typeAt(x, z) !== TILE.SIDEWALK) continue;
      if (!rng.chance(0.035)) continue;
      const tier = rng.chance(0.7) ? 1 : 2;
      place({
        tier, kind: tier === 1 ? 'clutter' : 'bike', x, z, radius: TIERS[tier].radius,
        mass: TIERS[tier].mass, golden: level.golden && rng.chance(0.05),
        colorIdx: rng.int(0, 5), rotY: rng.float(0, Math.PI * 2),
      }, [TILE.SIDEWALK]);
    }
  }

  // --- capstone landmark: shielded, at district center-north. A guaranteed
  // placement: clear any objects inside its footprint, then drop it in. ---
  let landmark = null;
  if (level.landmark) {
    const r = TIERS[7].radius * 1.6;
    let lx = snap(spawn.x), lz = snap(playable.zmin + size * 0.18);
    const pos = tryPlace(hash, rng, r, playable.xmin, playable.xmax, playable.zmin, playable.zmax, 60);
    if (pos) { lx = pos.x; lz = pos.z; }
    const evict = [];
    hash.query(lx, lz, r + 3, (o) => {
      const dx = o.x - lx, dz = o.z - lz;
      const rr = o.radius + r + PLACEMENT_MARGIN;
      if (dx * dx + dz * dz < rr * rr) evict.push(o);
    });
    for (const o of evict) {
      const idx = objects.indexOf(o);
      if (idx >= 0) objects.splice(idx, 1);
      for (const arr of hash.map.values()) {
        const ai = arr.indexOf(o);
        if (ai >= 0) { arr.splice(ai, 1); break; }
      }
    }
    landmark = addObject({
      tier: 7, kind: 'landmark', x: lx, z: lz, radius: r,
      mass: level.landmark.rewardMass, golden: false, colorIdx: 0,
      h: 40, w: r * 1.6, d: r * 1.6, rotY: 0, shielded: true,
    });
    grid.occupy(lx, lz, r);
  }

  // --- tide schedule (times in seconds, shrink fraction of current bounds) ---
  const tides = [];
  for (let i = 0; i < level.tideEvents; i++) {
    tides.push({ at: level.clock * (0.35 + i * 0.25), shrink: 0.12 });
  }

  return {
    size, spawn, bounds: { ...playable }, originalBounds: { ...playable },
    waterRect, roads, blocks, tileGrid: grid, objects, landmark, tides, hash,
  };
}
