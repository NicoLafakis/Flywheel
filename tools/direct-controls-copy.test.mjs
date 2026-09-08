import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const name of ['ready','help','screens','tutorial']) {
 const s=readFileSync(new URL(`../js/ui/${name}.js`,import.meta.url),'utf8').split('\n').filter(l=>!l.trim().startsWith('//')).join('\n');
 assert(!/Q\/?\s*\/??\s*E.?\s*:? Orbit|A\/D turn|drag left ½|Left Screen Half|drag the left half|Turn left|Look around \(touch\)/i.test(s),`${name}: obsolete tank/orbit instructions`);
 assert(/anywhere/i.test(s),`${name}: explains touch-anywhere controls`);
}
console.log('ALL PASS direct control guidance');
