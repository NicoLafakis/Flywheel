// Fine-grid coordinates fit exactly in 52 bits: signed 16-bit x/z and 20-bit y.
// Numeric lookups avoid allocating a coordinate string for every debris probe.
// Out-of-range cells retain string keys, so probes cannot wrap onto the city.
const Y = 1048576, X = 68719476736;
function pack(x, y, z) {
  return x >= -32768 && x < 32768 && z >= -32768 && z < 32768 && y >= -524288 && y < 524288
    ? (x + 32768) * X + (z + 32768) * Y + y + 524288
    : `${x},${y},${z}`;
}
function coordinates(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split(',');
  if (parts.length !== 3) return null;
  const coords = parts.map(Number);
  return coords.every((n, i) => Number.isInteger(n) && String(n) === parts[i])
    ? coords : null;
}
function externalKey(key) {
  const coords = coordinates(key);
  return coords ? pack(...coords) : key;
}
function unpack(key) {
  if (typeof key !== 'number') return key;
  const x = Math.floor(key / X), rest = key - x * X;
  const z = Math.floor(rest / Y), y = rest - z * Y;
  return `${x - 32768},${y - 524288},${z - 32768}`;
}

export class VoxelGrid extends Map {
  getCell(x, y, z) { return super.get(pack(x, y, z)); }
  setCell(x, y, z, value) {
    const key = pack(x, y, z);
    if (!this._columns) this._columns = new Map();
    const columnKey = pack(x, 0, z);
    let column = this._columns.get(columnKey);
    if (!column) { column = { ys: [], runs: null }; this._columns.set(columnKey, column); }
    if (!super.has(key)) column.ys.push(y);
    column.runs = null;
    super.set(key, value);
    return this;
  }
  deleteCell(x, y, z) {
    const column = this._columns?.get(pack(x, 0, z));
    if (column) column.runs = null;
    return super.delete(pack(x, y, z));
  }
  clear() { super.clear(); this._columns?.clear(); }
  // Lazily coalesce occupied vertical cells into owner runs. State is read live:
  // a detached block immediately ceases to support anything without rebuilding
  // this index. Actual ownership edits invalidate only the affected column.
  supportBelow(x, z, cy, maxTop) {
    const column = this._columns?.get(pack(x, 0, z));
    if (!column) return 0;
    if (!column.runs) {
      column.ys = [...new Set(column.ys)].sort((a, b) => b - a);
      const runs = column.runs = [];
      for (const y of column.ys) {
        const owner = this.getCell(x, y, z);
        if (!owner) continue;
        const last = runs.at(-1);
        if (last && last.owner === owner && last.lo === y + 1) last.lo = y;
        else runs.push({ hi: y, lo: y, owner });
      }
    }
    for (const run of column.runs) {
      if (cy < 0) break;
      if (run.lo > cy || run.hi < 0) continue;
      const b = run.owner;
      if (b.state !== 'static' && b.state !== 'unstable') continue;
      const top = (b.gy + b.fsy) * 0.25;
      if (top <= maxTop) return top;
      cy = b.gy - 1;
    }
    return 0;
  }
  // Scene authoring and external probes retain their existing string-key API.
  get(key) { return super.get(externalKey(key)); }
  has(key) { return super.has(externalKey(key)); }
  set(key, value) {
    const coords = coordinates(key);
    if (coords) return this.setCell(...coords, value);
    super.set(key, value); return this;
  }
  delete(key) {
    const coords = coordinates(key);
    return coords ? this.deleteCell(...coords) : super.delete(key);
  }
  *keys() { for (const key of super.keys()) yield unpack(key); }
  *entries() { for (const [key, value] of super.entries()) yield [unpack(key), value]; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(callback, thisArg) {
    super.forEach((value, key) => callback.call(thisArg, value, unpack(key), this));
  }
}
