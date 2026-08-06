// Renders every row in SKINS to docs/skins/<id>.png and writes a contact sheet
// at docs/skins/index.html, so a skin can be reviewed without booting the game.
//
// Run:  node tools/skinsheet.mjs [http://localhost:8150] [size]
//
// WHY A BROWSER AT ALL. Skins are three.js geometry, so there is no headless
// path — the marks only exist once something has drawn them. This drives a real
// GL context via Playwright and pulls the finished pixels out.
//
// WHAT IT REUSES. Everything. `bakeSkinThumbnails()` in js/skins.js already
// renders every row's real geometry to a data URL at a fixed hero pose, wound
// forward 54 deterministic frames so the trail skins (Compounding, Attribution)
// have the history that IS their identity — a still of Compounding at t=0 is an
// empty ring. This tool calls that function and writes the bytes to disk; it
// does not re-pose, re-light or re-render anything. Two consequences worth
// stating, because both are features:
//
//   - What Nico sees here is exactly what the shop shelf shows him. If a tile
//     looks wrong on this sheet, the shop is wrong too, in the same way.
//   - There is no `save.equippedSkin` round-trip and no VoxelWorld. The baker
//     calls `makeSkin(row.id)` per row directly, so the usual hazard — a bad id
//     silently falling back to 'classic' and every tile still looking fine —
//     cannot arise from a mis-bound save. It could still arise from a builder
//     that draws nothing, so the identical-bytes assertion below covers it from
//     the pixel side instead, which is the direction that actually proves it.
//
// WHAT IT DOES NOT REUSE, and why that is a REPORTED FINDING rather than a fork:
// `bakeSkinThumbnails` runs its build-pose-render loop fully synchronously. A
// row on the raster path (`logoTex`) loads its mark through `new Image()` and an
// `onload` handler, and the mesh starts `visible = false` until that fires. An
// onload cannot run inside a synchronous loop, so such a row bakes WITHOUT its
// mark. This tool detects that case and says so loudly instead of shipping a
// blank tile that looks deliberate. Fixing it means making the baker async,
// which is a change inside js/skins.js and belongs to whoever owns that file.
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP_URL = process.argv[2] || 'http://localhost:8150';
const SIZE = Number(process.argv[3] || 512);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'skins');

const pw = await import('file:///' + process.env.APPDATA.replace(/\\/g, '/') + '/npm/node_modules/playwright/index.mjs');
const browser = await pw.chromium.launch({
  // Real GL. The software rasterizer produces a context that renders, but the
  // additive materials every skin leans on come out flat under it.
  args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(APP_URL, { waitUntil: 'load' });

const baked = await page.evaluate(async (size) => {
  const S = await import('/js/skins.js');
  const rows = S.SKINS.map((r) => ({
    id: r.id, name: r.name, price: r.price, family: r.family || 'core',
    blurb: r.blurb, css: r.css,
    color: '#' + r.color.toString(16).padStart(6, '0'),
    accent: r.accent === undefined ? null : '#' + r.accent.toString(16).padStart(6, '0'),
    // Which mark path this row is on. `logoTex` is the raster path and is the
    // one the synchronous baker cannot wait for; `logo` is traced point data
    // that is already resident and bakes fine.
    markPath: r.logoTex ? 'logoTex (raster, async)' : (r.logo ? 'logo (traced, sync)' : null),
  }));
  // No try/catch here on purpose. If this throws, the stack is the finding.
  const thumbs = S.bakeSkinThumbnails(size);
  if (!thumbs) return { rows, thumbs: null, note: 'bakeSkinThumbnails returned null (no GL, lost context, or a builder threw)' };
  return { rows, thumbs: Object.fromEntries(thumbs), note: null };
}, SIZE);

if (!baked.thumbs) {
  console.error('FAILED: ' + baked.note);
  console.error('page errors: ' + JSON.stringify(pageErrors, null, 2));
  await browser.close();
  process.exit(1);
}

// --- write the PNGs ----------------------------------------------------------
// The directory is cleared first so a row deleted from SKINS does not leave a
// stale tile behind that the sheet no longer links but a reader still finds.
if (existsSync(OUT)) for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });

const hashes = new Map();
const missing = [];
let bytes = 0;
for (const row of baked.rows) {
  const url = baked.thumbs[row.id];
  if (!url) { missing.push(row.id); continue; }
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(OUT, row.id + '.png'), buf);
  bytes += buf.length;
  const h = createHash('sha256').update(buf).digest('hex');
  row.sha = h.slice(0, 12);
  if (!hashes.has(h)) hashes.set(h, []);
  hashes.get(h).push(row.id);
}

// --- the assertions ----------------------------------------------------------
// A silent truncation reads as "covered everything" when it did not, and a
// silent fallback to 'classic' makes every tile look fine while proving nothing.
// Both are checked from the output side, which is the only side that can tell.
let failed = 0;
const problem = (m) => { failed++; console.error('  PROBLEM: ' + m); };

console.log(`SKINS rows: ${baked.rows.length}`);
console.log(`PNGs written: ${baked.rows.length - missing.length} (${(bytes / 1024).toFixed(0)} KB) at ${SIZE}x${SIZE}`);
if (missing.length) problem(`${missing.length} row(s) baked no image: ${missing.join(', ')}`);

const dupes = [...hashes.entries()].filter(([, ids]) => ids.length > 1);
if (dupes.length) {
  for (const [, ids] of dupes) problem(`byte-identical tiles — these rows rendered the same pixels: ${ids.join(', ')}`);
} else {
  console.log(`distinct tiles: ${hashes.size}/${baked.rows.length - missing.length} — every row rendered its own pixels`);
}

// The raster-path rows the synchronous baker cannot wait for. Named, counted,
// and non-fatal: the tile still exists, it is just missing its mark.
const asyncMark = baked.rows.filter((r) => r.markPath && r.markPath.startsWith('logoTex'));
if (asyncMark.length) {
  console.log(`NOTE: ${asyncMark.length} row(s) on the async raster mark path: ${asyncMark.map((r) => r.id).join(', ')}`);
  console.log('      bakeSkinThumbnails is synchronous, so an Image().onload cannot fire inside it.');
  console.log('      Verify those tiles by eye before trusting them.');
}
if (pageErrors.length) console.log('page errors during bake: ' + JSON.stringify(pageErrors));

// --- the contact sheet -------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAMILY_LABEL = { core: 'Core shelf', creature: 'Creature shelf', partner: 'Partner shelf' };
const families = [...new Set(baked.rows.map((r) => r.family))];

const section = (fam) => {
  const rows = baked.rows.filter((r) => r.family === fam);
  return `<section>
    <h2>${esc(FAMILY_LABEL[fam] || fam)} <span class="count">${rows.length}</span></h2>
    <div class="grid">${rows.map((r) => `
      <figure${r.markPath && r.markPath.startsWith('logoTex') ? ' class="flagged"' : ''}>
        <a href="${esc(r.id)}.png"><img src="${esc(r.id)}.png" alt="${esc(r.name)}" width="${SIZE}" height="${SIZE}"></a>
        <figcaption>
          <b>${esc(r.name)}</b>
          <span class="id">${esc(r.id)}</span>
          <span class="price">${r.price === 0 ? 'free' : r.price + ' coins'}</span>
          <p>${esc(r.blurb)}</p>
          <div class="sw"><i style="background:${esc(r.color)}"></i>${esc(r.color)}${r.accent ? `<i style="background:${esc(r.accent)}"></i>${esc(r.accent)}` : ''}</div>
          ${r.markPath ? `<div class="mark">mark: ${esc(r.markPath)}</div>` : ''}
        </figcaption>
      </figure>`).join('')}</div>
  </section>`;
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>Flywheel skins — contact sheet</title>
<style>
  :root { color-scheme: dark; --bg:#0e111a; --card:#171c2b; --line:#252b3d; --ink:#e6ebf5; --dim:#8b97ad; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px; background:var(--bg); color:var(--ink);
         font:14px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif; }
  h1 { margin:0 0 4px; font-size:22px; letter-spacing:.02em; }
  .sub { color:var(--dim); margin:0 0 28px; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim);
       border-bottom:1px solid var(--line); padding-bottom:8px; margin:34px 0 16px; }
  .count { color:#5b6580; font-weight:400; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); }
  figure { margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  figure.flagged { border-color:#7a5a1e; }
  img { display:block; width:100%; height:auto; background:#141926; }
  figcaption { padding:12px 14px 14px; }
  figcaption b { font-size:15px; }
  .id { float:right; color:#5b6580; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px; }
  .price { display:block; color:var(--dim); font-size:12px; margin-top:2px; }
  figcaption p { margin:8px 0 10px; color:#b9c3d4; font-size:12.5px; }
  .sw { display:flex; align-items:center; gap:6px; font-family:ui-monospace,Consolas,monospace;
        font-size:10.5px; color:var(--dim); }
  .sw i { width:13px; height:13px; border-radius:3px; border:1px solid #0007; }
  .mark { margin-top:7px; font-size:10.5px; color:#c9a227; }
</style>
<h1>Flywheel skins</h1>
<p class="sub">${baked.rows.length} skins &middot; ${SIZE}&times;${SIZE} &middot; generated by <code>tools/skinsheet.mjs</code> from
  <code>bakeSkinThumbnails()</code>, the same renderer the shop shelf uses &mdash; so these tiles are what the shop shows.
  Click a tile for the full-size PNG.</p>
${families.map(section).join('\n')}
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`contact sheet: docs/skins/index.html (${families.length} shelves: ${families.join(', ')})`);

await browser.close();
if (failed) { console.error(`${failed} problem(s).`); process.exit(1); }
console.log('OK');
