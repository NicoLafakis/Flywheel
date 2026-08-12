// Pure ranked-run trace codec. Each tick is exactly two signed-int8 movement
// intents, so browser recording and Node verification share one small format.

export const REPLAY_ENCODING = 'rle-i8-v1';
export const INPUTS_PER_TICK = 2;

export function createInputBuffer(tickCount) {
  return new Int8Array(tickCount * INPUTS_PER_TICK);
}

export function writeInput(buffer, tick, x, z) {
  const i = tick * INPUTS_PER_TICK;
  buffer[i] = Math.max(-127, Math.min(127, Math.round(x * 127)));
  buffer[i + 1] = Math.max(-127, Math.min(127, Math.round(z * 127)));
}

export function inputAt(buffer, tick, out = { x: 0, z: 0 }) {
  const i = tick * INPUTS_PER_TICK;
  out.x = buffer[i] / 127;
  out.z = buffer[i + 1] / 127;
  return out;
}

// Three bytes per run: count, x, z. Count never uses zero, so malformed input
// cannot become an infinite decoder loop. Runs cap at 255 ticks by construction.
export function encodeTrace(buffer, tickCount = buffer.length / INPUTS_PER_TICK) {
  if (!(buffer instanceof Int8Array) || !Number.isInteger(tickCount)
    || tickCount < 0 || buffer.length < tickCount * INPUTS_PER_TICK) {
    throw new TypeError('rle-i8-v1 needs an Int8Array with complete tick pairs');
  }
  const bytes = [];
  for (let tick = 0; tick < tickCount;) {
    const i = tick * INPUTS_PER_TICK;
    const x = buffer[i], z = buffer[i + 1];
    let count = 1;
    while (count < 255 && tick + count < tickCount) {
      const j = (tick + count) * INPUTS_PER_TICK;
      if (buffer[j] !== x || buffer[j + 1] !== z) break;
      count++;
    }
    bytes.push(count, x & 0xff, z & 0xff);
    tick += count;
  }
  return Uint8Array.from(bytes);
}

export function decodeTrace(payload, tickCount) {
  if (!(payload instanceof Uint8Array) || !Number.isInteger(tickCount) || tickCount < 0
    || payload.length % 3 !== 0) throw new TypeError('invalid rle-i8-v1 payload');
  const out = createInputBuffer(tickCount);
  let src = 0, tick = 0;
  while (src < payload.length) {
    const count = payload[src++];
    const x = payload[src++] << 24 >> 24;
    const z = payload[src++] << 24 >> 24;
    if (count === 0 || tick + count > tickCount || Math.abs(x) > 127 || Math.abs(z) > 127) {
      throw new RangeError('invalid rle-i8-v1 run');
    }
    for (let n = 0; n < count; n++, tick++) {
      const i = tick * INPUTS_PER_TICK;
      out[i] = x;
      out[i + 1] = z;
    }
  }
  if (tick !== tickCount) throw new RangeError('rle-i8-v1 tick count mismatch');
  return out;
}
