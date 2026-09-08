export function summarizeSteps(samples) {
  if (!samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Expected non-empty finite step timings');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}

export function attackLabel(growing, size) {
  return growing ? `hole growing from SIZE ${size}` : `hole pinned at SIZE ${size}`;
}

export function countAwake(blocks) {
  return blocks.filter(b => b.state === 'falling' && !b.asleep).length;
}
