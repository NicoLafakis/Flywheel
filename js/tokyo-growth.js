// Earned material is never lost. Large collapses fill the growth reserve;
// expansion after the opening sizes is gradual rather than an instant leap.
export function advanceTokyoGrowth(current,earned,dt) {
  const opening=Math.max(current,Math.min(8,earned));
  return Math.max(current,Math.min(earned,opening+Math.max(0,dt)*0.105));
}
