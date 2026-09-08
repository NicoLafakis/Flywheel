// Preserve authored tile density when multiple pieces become one box.
export function surfaceRepeat(block,perMetre) {
  if(!block.tileSize) {
    const value=perMetre?block.sAvg:1;
    return [value,value,value];
  }
  const original=block.tileSize;
  const base=perMetre?Math.cbrt(original[0]*original[1]*original[2]):1;
  return [block.sx,block.sy,block.sz].map((extent,i)=>extent/original[i]*base);
}
