// Shibuya Crossing district (The Lab's Tokyo remake). See extract-osm.mjs.
//
// rotDeg 12: the crossing's hero buildings (QFRONT 15 deg, MAGNET 11, Ekimae 11,
// Seibu A 12) share one street grid about 12 degrees off true east. Rotating the
// frame by it puts that grid on the voxel axes. Shift [-24, -18] puts the fixed
// solo spawn (0, 16) on open paving in Hachiko Square, so the opening minute is
// the square's real trees, bollards and furniture, 30 m from the scramble.
export default {
  name: 'Shibuya Crossing, Tokyo',
  fetched: '2026-09-27',
  bbox: [139.6960, 35.6565, 139.7045, 35.6625],
  frame: { lat0: 35.65950, lon0: 139.70055, rotDeg: 12, shift: [-24, -18] },
  bounds: { minX: -214, maxX: 86, minZ: -136, maxZ: 90 },
  minBuildingArea: 12,
  // Mapped as buildings but not buildings you could stand in front of: the
  // station's fare-gate concourse outline (indoor) and the west deck walkway.
  exclude: [904652318, 1333409445, 904734439],
  includeParts: [521569271],
  // The JR station building is mostly beyond the district, but its Hachiko-exit
  // end IS the district's east edge, so it is kept and cut at the boundary.
  keepClipped: [904652357],
  out: 'js/citydata/shibuya.js',
};
