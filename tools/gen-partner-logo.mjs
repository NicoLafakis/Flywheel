// Turn "this agency wants to be featured" into a pasteable SKINS row in one run.
//
//   node tools/gen-partner-logo.mjs --name "SmartBug Media" --site smartbug.com
//   node tools/gen-partner-logo.mjs --name "Acme" --file ./mark.png
//   node tools/gen-partner-logo.mjs --name "Acme" --site acme.com --generate
//
// Flags: --name (required) --site --file --generate --slug --price --blurb
//        --server (default http://localhost:8150) --dry
//
// ---------------------------------------------------------------- source order
//
// 1. THE AGENCY'S OWN APP ICON. This is the whole trick, and it is not our
//    invention — it is the ordinary way icon pipelines source a brand mark. Any
//    site that has ever wanted a decent home-screen tile already publishes one,
//    and it is declared in exactly two documented places: `<link rel="apple-touch-
//    icon">`, which Safari reads INSTEAD of the manifest, and the W3C web app
//    manifest's `icons[]`. So both are read, never just one.
//
//    Why it beats every other source: an app icon is square by definition,
//    already designed by the brand to survive being small, and needs no
//    generation, no tracing and no permission conversation. It is the asset that
//    made the Supered skin work.
//
// 2. og:image or the largest declared favicon — a square-croppable region of the
//    primary mark. Weaker: usually a wide lockup, and wide marks are what leave a
//    logo illegible at badge size.
//
// 3. Generation, only with --generate and only when 1 and 2 found nothing.
//
// ------------------------------------------------------------- the fullBleed call
//
// `logoTexPart` in js/skins.js either trusts the image edge-to-edge (`fullBleed`)
// or ink-scans it for a bounding box, keeping texels with alpha >= 8 AND
// luminance > 0.06. That scan is why a PURE BLACK BACKGROUND is load-bearing for
// generated art: black is below the ink threshold, so it crops away for free and
// the additive blend contributes nothing — no alpha channel and no keying needed.
//
// This tool runs THAT EXACT predicate over the real pixels and decides the flag
// from the answer instead of leaving it to be discovered by a blank badge:
//   - ink box covers ~the whole image  -> fullBleed: true  (Supered's magenta
//     app icon is this case: opaque ink to the edge, nothing to crop)
//   - ink box is a proper subset       -> fullBleed: false (the crop does work)
//   - ink box is EMPTY                 -> hard fail. logoTexPart returns early on
//     an empty box, so the badge would simply never appear, with no error
//     anywhere. That is a silent failure and it is not allowed to ship.
//
// ------------------------------------------------------------------- security
//
// Flywheel has no build step and no server, and it is a public repo: every file
// under it is served verbatim to every browser. LEONARDO_API_KEY is therefore read
// from the environment at runtime, used for the request, and never written to any
// file, never echoed, never logged. Nothing this tool writes into the repo has
// ever held it.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf('--' + k);
  return i === -1 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};
const NAME = arg('name');
if (!NAME || NAME === true) {
  console.error('usage: node tools/gen-partner-logo.mjs --name "Agency Name" [--site domain] [--file path] [--generate]');
  process.exit(2);
}
const SLUG = String(arg('slug') || NAME).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const SITE = arg('site');
const FILE = arg('file');
const GENERATE = arg('generate') === true;
const PRICE = Number(arg('price', 750));
const BLURB = arg('blurb') || 'TODO: one line, in the voice of the other rows.';
const SERVER = arg('server', 'http://localhost:8150');
const DRY = arg('dry') === true;

const log = (...a) => console.log(...a);
let failed = 0;
const fail = (m) => { failed++; console.error('FAIL: ' + m); };

const pw = await import('file:///' + process.env.APPDATA.replace(/\\/g, '/') + '/npm/node_modules/playwright/index.mjs');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// ------------------------------------------------- 1+2. discover the brand mark
// Read the DOM rather than regexing HTML: it resolves relative hrefs correctly
// (`/apple-touch-icon.png` vs `../icons/x.png`) and survives a client-rendered
// head, both of which a regex gets wrong in ways that look like "no icon found".
async function discoverIcons(site) {
  const url = /^https?:\/\//.test(site) ? site : 'https://' + site;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`  could not load ${url}: ${e.message.split('\n')[0]}`);
    return [];
  }
  const found = await page.evaluate(async () => {
    const out = [];
    const px = (s) => {
      if (!s) return 0;
      const m = /(\d+)\s*[x×]\s*(\d+)/i.exec(s);
      return m ? Math.min(+m[1], +m[2]) : 0;
    };
    for (const l of document.querySelectorAll('link[rel~="apple-touch-icon" i],link[rel~="apple-touch-icon-precomposed" i]')) {
      out.push({ url: l.href, size: px(l.getAttribute('sizes')) || 180, src: 'apple-touch-icon', rank: 0 });
    }
    for (const l of document.querySelectorAll('link[rel~="icon" i]')) {
      out.push({ url: l.href, size: px(l.getAttribute('sizes')), src: 'link rel=icon', rank: 2 });
    }
    const man = document.querySelector('link[rel="manifest" i]');
    if (man) {
      try {
        const j = await (await fetch(man.href)).json();
        for (const ic of (j.icons || [])) {
          out.push({ url: new URL(ic.src, man.href).href, size: px(ic.sizes), src: 'manifest icons[]', rank: 1 });
        }
      } catch (e) { /* a manifest that will not parse is simply not a source */ }
    }
    const og = document.querySelector('meta[property="og:image" i]');
    if (og && og.content) out.push({ url: new URL(og.content, location.href).href, size: 0, src: 'og:image', rank: 3 });
    return out;
  });
  // Well-known default, which plenty of sites serve without ever declaring it.
  found.push({ url: new URL('/apple-touch-icon.png', url).href, size: 180, src: 'apple-touch-icon (undeclared default)', rank: 0.5 });
  // `link rel=icon` is the weakest signal on the page and plenty of sites point
  // it at whatever image was handy: measured on real HubSpot partners, it served
  // a newsletter sketch on one and an Instagram post ("AIC Post - 1080 x 1080")
  // on another. Neither is a brand mark. A URL that looks like an icon is
  // demoted less than one that does not, which lets a properly-named favicon
  // still beat a random hubfs upload without over-trusting the tag.
  for (const c of found) {
    if (!/icon|logo|favicon|touch|mark|brand/i.test(c.url.split('/').pop())) c.rank += 1.5;
  }
  // App icon first, then bigger is better. Size beats rank only within a tier so
  // a 512 manifest icon never loses to a 32 px favicon that happens to rank high.
  found.sort((a, b) => (a.rank - b.rank) || (b.size - a.size));
  return found;
}

// ------------------------------------------------------- 3. generation, last resort
async function generate(name) {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) {
    fail('--generate requested but LEONARDO_API_KEY is not in the environment. ' +
      'Export it from DiscoverAIWithNico/.env.local for this shell only; it must never be written into this repo.');
    return null;
  }
  // v2 to submit, v1 to poll. Verified shape, not guessed — see the `leonardo`
  // skill, which carries the working integration; `mode` was replaced by
  // `quality` on 2026-05-04 and sending it now fails validation.
  const body = {
    model: 'gpt-image-1.5',
    parameters: {
      prompt: `A single flat vector brand mark for the company "${name}", centered, ` +
        `on a PURE BLACK (#000000) background. Bold simple geometric icon, high contrast, ` +
        `no text, no wordmark, no gradients, no shadows, no border, no frame. ` +
        `The mark fills roughly two thirds of the square.`,
      width: 1024, height: 1024, quantity: 2, quality: 'HIGH', prompt_enhance: 'OFF',
    },
    public: false,
  };
  log('  submitting to Leonardo (gpt-image-1.5, 1024x1024, 2 candidates, ~$0.11)...');
  const r = await fetch('https://cloud.leonardo.ai/api/rest/v2/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { fail(`Leonardo POST ${r.status}: ${(await r.text()).slice(0, 300)}`); return null; }
  const id = (await r.json())?.generate?.generationId;
  if (!id) { fail('Leonardo returned no generationId'); return null; }
  for (let i = 0; i < 60; i++) {
    await new Promise((s) => setTimeout(s, 5000));
    const p = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const g = (await p.json())?.generations_by_pk;
    if (g?.status === 'COMPLETE') {
      const urls = (g.generated_images || []).map((im) => im.url);
      log(`  generated ${urls.length} candidate(s); using the first. Others: ${urls.slice(1).join(' ') || '(none)'}`);
      return urls[0] ? { url: urls[0], size: 1024, src: 'Leonardo gpt-image-1.5' } : null;
    }
    if (g?.status === 'FAILED') { fail('Leonardo generation FAILED'); return null; }
  }
  fail('Leonardo generation timed out after 5 minutes');
  return null;
}

// ------------------------------------------------------------ analyse the pixels
// Runs logoTexPart's OWN predicate (alpha >= 8, luminance > 0.06) so the flag this
// tool sets and the crop the renderer performs cannot disagree.
async function analyse(dataUrl) {
  // A clean page, not whatever partner site `page` last navigated to. Measured:
  // the numbers come out identical either way, so this is hygiene rather than a
  // fix — it removes a third party's document from a measurement we rely on.
  const scratch = await browser.newPage();
  await scratch.goto('about:blank');
  const out = await scratch.evaluate(async (u) => {
    const img = new Image();
    try { await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('decode failed')); img.src = u; }); }
    catch (e) { return { error: e.message }; }
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return { error: 'image decoded to zero size' };
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const ALPHA = 8, INK = 0.06;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, ink = 0, opaque = 0, darkInk = 0;
    const hue = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) << 2;
        if (d[p + 3] < ALPHA) continue;
        opaque++;
        const lum = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255;
        // Opaque but under the ink threshold: the artist drew something there and
        // the renderer will not show it. Counted, because a mark made of BLACK is
        // the one asset class the additive path cannot carry at all.
        if (lum <= INK) { darkInk++; continue; }
        ink++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        // Quantise to a 32-step cube and keep a count, so the two brand colours
        // fall out of the histogram rather than being picked by eye. The shift
        // is >> 3 (8 bits down to 5) and MUST match the & 31 / * 8 decode below;
        // an earlier >> 5 packed 3-bit channels into 5-bit fields and capped
        // every recovered colour at 60/255, which read as "every agency's brand
        // colour is near-black" and was believable enough to nearly ship.
        const k = ((d[p] >> 3) << 10) | ((d[p + 1] >> 3) << 5) | (d[p + 2] >> 3);
        hue.set(k, (hue.get(k) || 0) + 1);
      }
    }
    if (x1 < x0) return { W, H, ink: 0, opaque, darkInk, empty: true };
    const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
    const pal = [...hue.entries()]
      .map(([k, n]) => ({ r: ((k >> 10) & 31) * 8 + 4, g: ((k >> 5) & 31) * 8 + 4, b: (k & 31) * 8 + 4, n }))
      .sort((a, b) => b.n - a.n);
    // The rim wants BRAND colour, not the near-white or near-black the mark is
    // drawn over, so rank by "how much of the image is it" x "how saturated".
    // Saturated AND bright enough to read as a rim over the 0x232838 ground. The
    // luminance floor matters: without it the antialiased fringe between black
    // ink and transparency wins the histogram on sheer pixel count and the row
    // gets a near-black "brand colour" that is invisible on the rim.
    const lumOf = (c) => (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
    const brand = pal.filter((c) => sat(c.r, c.g, c.b) > 0.25 && lumOf(c) > 0.18)
      .sort((a, b) => b.n * sat(b.r, b.g, b.b) - a.n * sat(a.r, a.g, a.b));
    const far = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 120;
    const primary = brand[0] || pal[0];
    const secondary = brand.find((c) => far(c, primary)) || pal.find((c) => far(c, primary)) || null;
    const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('');
    return {
      W, H, ink, opaque, darkInk,
      box: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
      coverage: ((x1 - x0 + 1) * (y1 - y0 + 1)) / (W * H),
      primary: hex(primary), secondary: secondary ? hex(secondary) : null,
    };
  }, dataUrl);
  await scratch.close();
  return out;
}

// ============================================================== run
log(`partner: ${NAME}  (slug: ${SLUG})`);

let picked = null, buf = null;

if (FILE && FILE !== true) {
  if (!existsSync(FILE)) { fail(`--file ${FILE} does not exist`); }
  else { buf = readFileSync(FILE); picked = { url: 'file://' + FILE, src: 'local --file', size: 0 }; }
} else if (SITE && SITE !== true) {
  log(`discovering the app icon on ${SITE} ...`);
  const cands = await discoverIcons(SITE);
  for (const c of cands) {
    try {
      const r = await fetch(c.url);
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!/^image\//.test(ct) || /svg/.test(ct)) continue;   // canvas cannot measure an SVG's ink reliably
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 200) continue;
      picked = { ...c, contentType: ct };
      buf = b;
      break;
    } catch (e) { /* next candidate */ }
  }
  if (picked) {
    log(`  using ${picked.src}: ${picked.url} (${(buf.length / 1024).toFixed(1)} KB)`);
    // og:image is the social preview card, which on a marketing site is usually a
    // PHOTOGRAPH — measured: one partner's og:image is a stock shot of people. It
    // is kept as a last resort because some sites publish nothing else, but it is
    // never silently treated as a brand mark.
    if (picked.src === 'og:image') {
      log('  WARNING: this is the og:image social card, not a declared icon. It is very often a');
      log('           photograph rather than a mark. LOOK at the written file before pasting the row.');
    }
  } else log('  no usable raster app icon found');
}

if (!buf && GENERATE) {
  log('falling back to generation (no usable existing mark) ...');
  const g = await generate(NAME);
  if (g) { const r = await fetch(g.url); buf = Buffer.from(await r.arrayBuffer()); picked = { ...g, contentType: 'image/png' }; }
} else if (!buf && !failed) {
  fail('no mark found. Pass --file with the asset the agency sent, or --generate to synthesise one.');
}

if (!buf) { await browser.close(); process.exit(1); }

// ---------------------------------------------------------------- analyse
const ext = /webp/.test(picked.contentType || '') ? '.webp'
  : /jpe?g/.test(picked.contentType || '') ? '.jpg'
    : (extname(picked.url.split('?')[0]) || '.png').toLowerCase();
const mime = ext === '.webp' ? 'image/webp' : ext === '.jpg' ? 'image/jpeg' : 'image/png';
const info = await analyse(`data:${mime};base64,${buf.toString('base64')}`);

if (info.error) { fail(`could not decode the asset: ${info.error}`); await browser.close(); process.exit(1); }
log(`asset: ${info.W}x${info.H}`);

if (info.empty) {
  fail('the ink scan found NOTHING above alpha 8 / luminance 0.06. logoTexPart returns early on ' +
    'an empty box, so this asset would render as an INVISIBLE badge with no error anywhere. ' +
    'It is a transparent or all-black image — get a different asset.');
  await browser.close(); process.exit(1);
}

// THE DARK-INK GATE. The badge material is additive, so black contributes
// nothing: a mark drawn in black does not render dim, it does not render. The
// ink scan agrees — it drops every opaque texel at or below luminance 0.06 — so
// an asset that is mostly black ink silently ships as whatever fraction of
// itself happens to be bright, cropped to that fraction's bounding box.
//
// This is not hypothetical. SmartBug Media's own 180px app icon is a black beetle
// beside a green "B": 85.6% of its opaque pixels are below the threshold, the
// scan crops to a 36x79 box around the "B" alone, and the row would have shipped
// a lone green letter as "the SmartBug logo" — with every other check green.
// That is exactly the failure mode this tool exists to prevent, so it is a hard
// stop, not a note.
const darkFrac = info.opaque ? info.darkInk / info.opaque : 0;
log(`opaque texels: ${info.opaque}  (${(darkFrac * 100).toFixed(1)}% below the ink threshold — additive blending cannot show those)`);
if (darkFrac > 0.35) {
  fail(`${(darkFrac * 100).toFixed(1)}% of this mark is dark ink that the additive badge CANNOT render. ` +
    `Only the bright ${(100 - darkFrac * 100).toFixed(1)}% would appear, cropped to ${info.box.w}x${info.box.h}. ` +
    `This asset is unusable as-is: ask the agency for a light-on-dark or single-bright-colour version, ` +
    `supply one with --file, or --generate a mark on pure black.`);
}

// Nothing is written into the repo once the asset is known to be unusable — a
// rejected mark sitting in assets/ is how a bad file gets pasted into a row later.
if (failed) { await browser.close(); process.exit(1); }

const fullBleed = info.coverage > 0.98;
log(`ink box: ${info.box.w}x${info.box.h} = ${(info.coverage * 100).toFixed(1)}% of the image`);
log(`fullBleed: ${fullBleed}  (${fullBleed ? 'ink runs to the edge, nothing to crop' : 'the ink scan crops real margin'})`);
log(`palette: primary ${info.primary}${info.secondary ? `, accent ${info.secondary}` : ' (no distinct second colour found)'}`);
if (info.W < 180 || info.H < 180) {
  log(`  NOTE: ${info.W}x${info.H} is small for a badge. Legible on the shelf, soft in-game. Prefer a 512 manifest icon if the site has one.`);
}

// ---------------------------------------------------------------- write + verify
const relDir = `assets/skins/partners/${SLUG}`;
const relPath = `${relDir}/${SLUG}-logo-large${ext}`;
if (!DRY) {
  mkdirSync(join(ROOT, relDir), { recursive: true });
  writeFileSync(join(ROOT, relPath), buf);
  log(`wrote ${relPath} (${(buf.length / 1024).toFixed(1)} KB)`);
} else {
  log(`--dry: would write ${relPath}`);
}

// The 404 guard. A missing texture is SILENT — img.onload never fires, the badge
// never becomes visible, and nothing is logged. So the path in the row is fetched
// over the real server exactly as the browser will fetch it, rather than merely
// checked with existsSync, which would pass on a case-mismatch that the server
// then 404s.
if (!DRY) {
  try {
    const r = await fetch(`${SERVER}/${relPath}`);
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) fail(`${SERVER}/${relPath} -> HTTP ${r.status}. The row would reference a texture that 404s, and a 404 here is invisible at runtime.`);
    else if (!/^image\//.test(ct)) fail(`${SERVER}/${relPath} served content-type "${ct}", not an image.`);
    else log(`verified over the server: GET /${relPath} -> 200 ${ct}`);
  } catch (e) {
    fail(`could not reach ${SERVER} to verify the asset path (${e.message}). Start the dev server or pass --server.`);
  }
}

// ---------------------------------------------------------------- emit the row
const id = `partner-${SLUG}`;
const accent = info.secondary || info.primary;
const row = `  { id: '${id}', name: ${JSON.stringify(NAME)}, price: ${PRICE}, color: 0x${info.primary.slice(1)}, accent: 0x${accent.slice(1)},
    css: 'linear-gradient(90deg,${info.primary} 50%,${accent} 50%)', family: 'partner',
    logoTex: '${relPath}',${fullBleed ? `\n    logoFit: { fullBleed: true },` : ''}
    blurb: ${JSON.stringify(BLURB)}, build: buildPartner },`;

// Typecheck the row against what buildPartner actually reads, so a bad field is
// caught here and not by a blank badge three days later.
const checks = [
  ['id', id.startsWith('partner-'), 'id must be namespaced partner-* — save data keys off id and a collision silently swaps a player\'s skin'],
  ['name', typeof NAME === 'string' && NAME.length > 0, 'name must be a non-empty string'],
  ['price', Number.isFinite(PRICE), 'price must be a number'],
  ['color', /^#[0-9a-f]{6}$/.test(info.primary), 'color must resolve to a 6-digit hex'],
  ['accent', /^#[0-9a-f]{6}$/.test(accent), 'accent must resolve to a 6-digit hex'],
  ['logoTex', relPath.startsWith('assets/'), 'logoTex must be a repo-relative path under assets/'],
  ['blurb', typeof BLURB === 'string' && BLURB.length > 0, 'blurb must be a non-empty string'],
];
for (const [f, ok, why] of checks) if (!ok) fail(`row field \`${f}\`: ${why}`);

log('\n--- paste into the partner shelf in js/skins.js ---');
console.log(row);
log('--- end ---\n');
if (BLURB.startsWith('TODO')) log('NOTE: blurb is a placeholder. Pass --blurb "..." or write one before pasting.');
log('After pasting, run: node tools/skinsheet.mjs   (the tile is the proof the badge renders)');

await browser.close();
if (failed) { console.error(`${failed} problem(s).`); process.exit(1); }
log('OK');
