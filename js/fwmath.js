// Small pure arithmetic set for values that enter replayed voxel physics.
// ECMAScript specifies +, -, *, / and Math.sqrt exactly; Math.hypot, cbrt and
// trig are implementation-approximated, so a browser and the Node verifier may
// otherwise drift even with the same seed and inputs.

export function fwHypot2(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function fwHypot3(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

// Horner-form Taylor polynomials. Chunk rotations are clamped to [-0.7, 0.7]
// before reaching these functions, so range reduction (and its own rounding
// seam) is deliberately unnecessary. The retained terms leave error far below
// one binary64 ULP across that domain while using only specified operations.
export function fwSin(x) {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2
    * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2
      * (-1 / 1307674368000 + x2 / 355687428096000))))))));
}

export function fwCos(x) {
  const x2 = x * x;
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2
    * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2
      * (-1 / 87178291200 + x2 / 20922789888000)))))));
}

// Deterministic Newton iteration for the non-cube characteristic length used
// by boxes and movers. Normalising by powers of eight keeps the fixed 10-step
// iteration well-conditioned without an implementation-approximated log/exp.
export function fwCbrt(value) {
  if (!Number.isFinite(value) || value === 0) return value;
  const neg = value < 0;
  let x = neg ? -value : value;
  let scale = 1;
  while (x > 1) { x /= 8; scale *= 2; }
  while (x < 0.125) { x *= 8; scale *= 0.5; }
  let y = 1;
  for (let i = 0; i < 10; i++) y = (2 * y + x / (y * y)) / 3;
  y *= scale;
  return neg ? -y : y;
}
