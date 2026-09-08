// Independent pre-optimization oracle: side and bottom probes are interleaved.
export function originalContact(b, vx, vz) {
  const fx = Math.round(b.x / 0.25 - b.fsx / 2);
  const fy = Math.round(b.y / 0.25 - b.fsy / 2);
  const fz = Math.round(b.z / 0.25 - b.fsz / 2);
  const xd = Math.abs(vx) > Math.abs(vz), sign = (xd ? vx : vz) >= 0 ? 1 : -1;
  const lat = xd ? b.fsz : b.fsx;
  for (let u = 0; u < Math.max(lat, b.fsx); u++) {
    for (let v = 0; v < Math.max(b.fsy, b.fsz); v++) {
      if (u < lat && v < b.fsy) {
        const x = xd ? (sign > 0 ? fx + b.fsx : fx - 1) : fx + u;
        const z = xd ? fz + u : (sign > 0 ? fz + b.fsz : fz - 1);
        const o = this.grid.getCell(x, fy + v, z);
        if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
      }
      if (u < b.fsx && v < b.fsz) {
        const o = this.grid.getCell(fx + u, fy - 1, fz + v);
        if (o && o !== b && (o.state === 'static' || o.state === 'unstable')) return o;
      }
    }
  }
  return null;
}
