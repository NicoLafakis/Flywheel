// Full-screen UI: title, world map, shop, results, pause, mechanic intro.

import { LEVELS, METROS, MECHANICS, LEVELS_PER_METRO, coinsForResult, starsForResult } from '../levels.js';
import { isLevelUnlocked, storeSave, VOX_DEFAULTS } from '../save.js';
import { ORBIT_RATE, ORBIT_RATE_RAMP } from '../controls.js';
import { buildBlockWord } from './blockword.js';
import { buildSprocket } from './sprocket.js';

// The shop shelf is the skin registry itself — js/skins.js owns the rows, this
// file only draws them. Re-exported rather than re-imported at the call sites so
// nothing that already did `import { SKINS } from './ui/screens.js'` has to
// change, and so there is exactly one list of ids and prices in the codebase.
// (Imported AND re-exported: a bare `export ... from` would not create the
// local binding this file's own shop renderer needs.)
import { SKINS, INDICATOR_SKINS, bakeSkinThumbnails } from '../skins.js';
export { SKINS, INDICATOR_SKINS };

export const ITEMS = [
  { id: 'clock5', name: '+5s Clock', desc: 'Every level gets 5 extra seconds.', price: 400 },
  { id: 'growth5', name: '+5% Growth', desc: 'Mass gained is 5% higher.', price: 500 },
];

// The free-play shelf on the landing screen. Brooklyn leads because it was the
// first showcase scene; Boston is the second and carries the same establishing
// shot and READY gate, so only Brooklyn keeps the pill — two tags side by side
// read as a bug rather than an endorsement. The pill says START HERE because
// 'Showcase' answered no question a player was asking (playtest finding). The
// generic sandbox trails because it is a physics test bed, not a place.
// `scene` is passed straight to actions.startVoxelSandbox(); the sandbox entry
// omits it so the undefined lands on that function's own 'gallery' default,
// which keeps the scene id written down in exactly one place (js/main.js).
const FREE_PLAY = [
  { scene: 'brooklyn', name: 'BROOKLYN', sub: 'Bridges to Coney Island', tag: 'START HERE' },
  { scene: 'boston', name: 'BOSTON', sub: 'Seaport and the Convention Center' },
  { scene: 'cambridge', name: 'CAMBRIDGE', sub: 'Canal Park to the Portuguese seam' },
  { scene: 'chicago', name: 'CHICAGO', sub: 'The Loop & Willis Tower' },
  { scene: 'manhattan', name: 'LOWER MANHATTAN', sub: 'Downtown towers' },
  { scene: 'upper-manhattan', name: 'UPPER MANHATTAN', sub: 'Central Park' },
  { name: 'SANDBOX', sub: 'Physics playground' },
];

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

export class Screens {
  constructor(root, save, actions) {
    this.root = root;
    this.save = save;
    this.actions = actions; // { play(level), resume(), restart(), quitToMap(), buy(id), equip(id), toggleMute() }
    this.current = null;
  }

  clear() {
    this.root.innerHTML = '';
    this.current = null;
  }

  // The landing screen. Three tiers, in this order: the mark and the name, the
  // one campaign entry, then the free-play shelf, then the utilities. The old
  // version stacked seven buttons of identical weight, which said nothing about
  // which of them was the game.
  showTitle() {
    this.clear();
    // Two independent sources of "hold still": the in-game setting, read here,
    // and the OS preference, handled by the prefers-reduced-motion block in
    // main.css. Either one alone is enough to park the sprocket and the letters.
    const still = !!(this.save.settings && this.save.settings.reducedMotion);
    const s = el(`<div class="screen fw-landing${still ? ' fw-still' : ''}"></div>`);

    // The wordmark is decorative type (aria-hidden), so the accessible name for
    // the screen is stated once here and never read twice.
    s.appendChild(el(`<h1 class="fw-a11y">Flywheel. A sprocket's story.</h1>`));

    const hero = el(`<div class="fw-hero"></div>`);
    hero.appendChild(buildSprocket());
    const heroText = el(`<div class="fw-hero-text"></div>`);
    // 8 = the letter count of FLYWHEEL, so it renders at full size and only a
    // longer name would ever be scaled down.
    heroText.appendChild(buildBlockWord('FLYWHEEL', { fitChars: 8 }));
    heroText.appendChild(el(`<div class="fw-plate">A SPROCKET'S STORY</div>`));
    hero.appendChild(heroText);
    s.appendChild(hero);

    // Sandboxes are the game now: Brooklyn is the first city, not a campaign map.
    // The CTA names the city because it hard-launches Brooklyn — 'PLAY A CITY'
    // promised a choice it never offered (playtest finding).
    const ctaWrap = el(`<div class="fw-cta-wrap"></div>`);
    const play = el(`<button type="button" class="fw-cta">PLAY BROOKLYN</button>`);
    play.onclick = () => this.actions.startVoxelSandbox('brooklyn');
    ctaWrap.appendChild(play);
    s.appendChild(ctaWrap);

    // Returning-player recognition (playtest finding: a seeded save rendered
    // byte-identical to a first visit). The bank belongs on the front door, not
    // three screens deep in SHOP. Hidden at zero — a first-run player has no
    // bank to recognize and the pill would be pure noise.
    if (this.save.coins > 0) {
      s.appendChild(el(`<div class="fw-bank">🪙 ${this.save.coins}</div>`));
    }

    const group = el(`<section class="fw-group" aria-labelledby="fw-free-play"></section>`);
    group.appendChild(el(`<div class="fw-group-label" id="fw-free-play">Choose a city · collect coins · grow big</div>`));
    const chips = el(`<div class="fw-chips"></div>`);
    for (const sc of FREE_PLAY) {
      // The SANDBOX entry carries no scene id; 'gallery' is startVoxelSandbox's
      // own default and the key recordSandboxResult writes under.
      const rec = (this.save.sandbox || {})[sc.scene || 'gallery'];
      const progress = rec && rec.completions > 0
        ? `<span class="fw-chip-progress">CLEARED ×${rec.completions} · BEST SIZE ${rec.bestSize}</span>` : '';
      const chip = el(`<button type="button" class="fw-chip">
        <span class="fw-chip-name">${sc.name}</span>
        <span class="fw-chip-sub">${sc.sub}</span>
        ${progress}
        ${sc.tag ? `<span class="fw-chip-tag">${sc.tag}</span>` : ''}
      </button>`);
      chip.onclick = () => this.actions.startVoxelSandbox(sc.scene);
      chips.appendChild(chip);
    }
    group.appendChild(chips);
    s.appendChild(group);

    const util = el(`<div class="fw-utility"></div>`);
    const shop = el(`<button type="button" class="btn secondary">SHOP</button>`);
    shop.onclick = () => this.showShop();
    const settings = el(`<button type="button" class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showTitle());
    util.append(shop, settings);
    s.appendChild(util);

    // The same CC0 sound manifest the arena landing carries (arena.html
    // #sound-credits): not legally required, given anyway.
    s.appendChild(el(`<div class="fw-credits">SOUND EFFECTS · CC0 · KENNEY.NL · OPENGAMEART (THIMRAS, RANGO MANGO) ·
      FREESOUND (THAIGHAUDIO, COGNITO PERCEPTU, BRAINCLAIM, CRAIGSMITH,
      METROSTOCK99, QUBODUP, PUSHKIN, MRRAP4FOOD, DRBODKIN, TAKAREADS)</div>`));

    this.root.appendChild(s);
    this.current = 'title';
  }

  showLoading(label) {
    this.clear();
    const s = el(`<div class="screen"><h2>BUILDING CITY…</h2>
      <p style="opacity:0.7">${label}</p></div>`);
    this.root.appendChild(s);
    this.current = 'loading';
  }

  showWorldMap() {
    this.showTitle();
  }

  showSandboxResults(sim, onContinue) {
    this.clear();
    const coins = sim.coinsCollected * 2 + 35;
    // Bank line projects the post-award total: recordSandboxResult runs in the
    // continue callback, so at render time save.coins is still pre-award.
    // The run's peak has to survive the run, or every celebration during it was
    // retroactively meaningless. Read BEFORE recordSandboxResult runs (it fires
    // in the continue callback), so "beaten" compares against the stored best
    // rather than against the run that just overwrote it.
    const prev = (this.save.sandbox || {})[sim.scene] || {};
    const score = Math.floor(sim.hole.mass);
    const best = sim.hole.bestCombo;
    const newScore = score > (prev.bestScore || 0);
    const newCombo = best > (prev.bestCombo || 0);
    const s = el(`<div class="screen"><h2>GOAL COMPLETE</h2><div class="results-stats">
      <div>${sim.goal.name}</div><div>City cleared <b>${Math.round(sim.hole.rawMass / sim.totalMass * 100)}%</b></div>
      <div>Score <b>${score.toLocaleString('en-US')}</b>${newScore ? ' <span class="rec-new">BEST!</span>' : ''}</div>
      <div>Best combo <b>${best}</b>${newCombo ? ' <span class="rec-new">BEST!</span>' : ''}</div>
      <div>Coins found <b>${sim.coinsCollected}/${sim.coins.length}</b></div>
      <div>Finish bonus <b>+35</b></div><div>Coins earned <b>+${coins}</b></div>
      <div>Bank <b>🪙 ${this.save.coins + coins}</b></div></div></div>`);
    const again = el(`<button class="btn">PLAY AGAIN</button>`); again.onclick = () => onContinue(false, coins);
    const cities = el(`<button class="btn secondary">CITIES</button>`); cities.onclick = () => onContinue(true, coins);
    s.append(again, cities); this.root.appendChild(s); this.current = 'results';
  }

  showShop() {
    this.clear();
    const s = el(`<div class="screen"><h2>SHOP</h2>
      <div class="coins">&#128176; ${this.save.coins} coins</div>
      <div class="shop-items"></div></div>`);
    const wrap = s.querySelector('.shop-items');
    // A flat colour swatch could describe a skin when a skin WAS a colour. It
    // cannot show teeth, a sweep or an eyelid, so the shelf renders each row's
    // actual geometry — baked once into data URLs, cached for the session. The
    // fallback is the old swatch, so a machine that cannot make a GL context
    // still gets a usable shop.
    const shots = bakeSkinThumbnails();
    for (const skin of SKINS) {
      const owned = this.save.ownedItems.includes(skin.id) || skin.price === 0;
      const equipped = this.save.equippedSkin === skin.id;
      const shot = shots && shots.get(skin.id);
      const art = shot
        ? `<img class="preview" src="${shot}" alt="">`
        : `<div class="swatch" style="background:${skin.css}"></div>`;
      const item = el(`<div class="shop-item"><h4>${skin.name}</h4>
        ${art}
        <p class="blurb">${skin.blurb || ''}</p>
        <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : skin.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}</button>`);
      btn.disabled = equipped;
      btn.onclick = () => {
        if (owned) { this.actions.equip(skin.id); }
        else if (this.actions.buy(skin.id, skin.price)) { /* bought then equip below */ this.actions.equip(skin.id); }
        this.showShop();
      };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const indHeader = el(`<div style="width:100%;margin:14px 0 6px 0;text-align:center"><h3 style="margin:0;color:#38bdf8;font-size:15px;letter-spacing:1px">NAV INDICATOR SKINS</h3></div>`);
    wrap.appendChild(indHeader);
    for (const ind of INDICATOR_SKINS) {
      const owned = this.save.ownedItems.includes(ind.id) || ind.price === 0;
      const equipped = (this.save.equippedIndicator || 'ind-default') === ind.id;
      const art = `<div class="swatch" style="background:${ind.css};display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;box-shadow:0 0 12px ${ind.color ? '#' + ind.color.toString(16).padStart(6, '0') : '#38bdf8'}">➤</div>`;
      const item = el(`<div class="shop-item"><h4>${ind.name}</h4>
        ${art}
        <p class="blurb">${ind.blurb || ''}</p>
        <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : ind.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}</button>`);
      btn.disabled = equipped;
      btn.onclick = () => {
        if (owned) { if (this.actions.equipIndicator) this.actions.equipIndicator(ind.id); }
        else if (this.actions.buy(ind.id, ind.price)) { if (this.actions.equipIndicator) this.actions.equipIndicator(ind.id); }
        this.showShop();
      };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const itemHeader = el(`<div style="width:100%;margin:14px 0 6px 0;text-align:center"><h3 style="margin:0;color:#ffd23f;font-size:15px;letter-spacing:1px">UPGRADES</h3></div>`);
    wrap.appendChild(itemHeader);
    for (const it of ITEMS) {
      const owned = this.save.ownedItems.includes(it.id);
      const item = el(`<div class="shop-item"><h4>${it.name}</h4>
        <p style="font-size:12px;line-height:1.35;min-height:46px;opacity:.72;margin:6px 0 2px">${it.desc}</p>
        <div class="price">${owned ? 'OWNED' : it.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${owned ? 'OWNED' : 'BUY'}</button>`);
      btn.disabled = owned;
      btn.onclick = () => { this.actions.buy(it.id, it.price); this.showShop(); };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const back = el(`<button class="btn secondary">BACK</button>`);
    back.onclick = () => this.showTitle();
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'shop';
  }

  showMechanicIntro(level, onDone) {
    this.clear();
    const mech = MECHANICS[level.introduces];
    const s = el(`<div class="screen"><h2>LEVEL ${level.index}</h2>
      <div class="mechanic-intro"><b>NEW MECHANIC: ${mech.icon} ${mech.name}</b><br>${mech.desc}</div></div>`);
    const go = el(`<button class="btn">GO</button>`);
    go.onclick = onDone;
    s.appendChild(go);
    this.root.appendChild(s);
    this.current = 'intro';
  }

  showResults(level, sim, onContinue) {
    this.clear();
    const stars = starsForResult(level, sim.timeLeft, sim.won);
    const coins = coinsForResult(level, stars, sim.player.bestCombo);
    const s = el(`<div class="screen">
      <h2>${sim.won ? 'LEVEL COMPLETE!' : "TIME'S UP!"}</h2>
      <div class="results-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="results-stats">
        Mass <b>${Math.floor(sim.player.mass)} / ${level.target}</b><br>
        Time left <b>${Math.ceil(sim.timeLeft)}s</b><br>
        Best combo <b>x${sim.player.bestCombo}</b><br>
        Coins earned <b>+${coins}</b>
      </div></div>`);
    const cont = el(`<button class="btn">${sim.won ? 'CONTINUE' : 'RETRY'}</button>`);
    cont.onclick = () => onContinue(stars, coins);
    const map = el(`<button class="btn secondary">CITIES</button>`);
    map.onclick = () => { onContinue(stars, coins, true); };
    s.append(cont, map);
    this.root.appendChild(s);
    this.current = 'results';
  }

  showPause() {
    this.clear();
    const s = el(`<div class="screen"><h2>PAUSED</h2></div>`);
    const resume = el(`<button class="btn">RESUME</button>`);
    resume.onclick = () => this.actions.resume();
    const settings = el(`<button class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showPause());
    // RESTART and CITIES both discard the run, and pause is only reachable
    // mid-run — so both ask once before throwing the run away (playtest
    // finding: silent mid-run progress loss). Two-step inline confirm, not a
    // modal: the pause screen deliberately has no dialogs. First click arms
    // the button, second acts, clicking anywhere else disarms it.
    const armable = (label, act) => {
      const btn = el(`<button class="btn secondary">${label}</button>`);
      btn.onclick = () => {
        if (btn.dataset.armed) { act(); return; }
        btn.dataset.armed = '1';
        btn.textContent = `${label} — SURE?`;
        btn.classList.add('danger');
        const disarm = (e) => {
          if (e.target === btn) return;
          delete btn.dataset.armed;
          btn.textContent = label;
          btn.classList.remove('danger');
          s.removeEventListener('pointerdown', disarm, true);
        };
        s.addEventListener('pointerdown', disarm, true);
      };
      return btn;
    };
    const restart = armable('RESTART', () => this.actions.restart());
    // CITIES, not WORLD MAP: the button has always landed on the title/city
    // shelf and no map exists (showWorldMap is an alias for showTitle). The
    // old label promised a reorientation hub and delivered the front door.
    const quit = armable('CITIES', () => this.actions.quitToMap());
    s.append(resume, settings, restart, quit);
    this.root.appendChild(s);
    this.current = 'pause';
  }

  showSettings(onBack) {
    this.clear();
    const st = this.save.settings;
    const s = el(`<div class="screen"><h2>SETTINGS</h2></div>`);
    // `set-panel` widens the panel and trims its padding at phone width; every
    // row below uses the `set-row` flex layout instead of a floated value. See
    // the block comment in css/main.css — the short version is that a floated
    // value wraps invisibly, so neither the eye nor a script could tell a
    // one-line row from a two-line one.
    const panel = el(`<div class="results-stats set-panel" style="float:none"></div>`);

    // `hint` is optional and renders as a second line under the label. Used
    // where the label alone does not say what the setting COSTS you — a toggle
    // named for what it turns on reads like the default, which is how "Tap to
    // steer" hid the fact that switching it on removes the joystick entirely.
    const toggle = (label, key, hint) => {
      const row = el(`<div class="set-row"><span class="set-label">${label}${hint ? `<small class="set-hint">${hint}</small>` : ''}</span>
        <span class="set-val"><button class="btn secondary">${st[key] ? 'ON' : 'OFF'}</button></span></div>`);
      const btn = row.querySelector('button');
      btn.onclick = () => {
        st[key] = !st[key];
        btn.textContent = st[key] ? 'ON' : 'OFF';
        this.actions.applySettings();
      };
      return row;
    };

    panel.appendChild(toggle('👆 Tap to move', 'pointMove', 'Replaces the on-screen joystick'));
    panel.appendChild(toggle('↔ Flip left and right', 'invertX'));
    panel.appendChild(toggle('↕ Flip up and down', 'invertY'));
    panel.appendChild(toggle('🌤 Pretty shadows', 'shadows'));
    panel.appendChild(toggle('🫧 Less movement', 'reducedMotion'));
    panel.appendChild(toggle('⚡ Smoother play', 'perfMode'));

    // Full controls listing — every ability gets its own keybind. FIRST in the
    // panel, above the fold: the playtest showed nobody opens SETTINGS before
    // playing, so the one place the scheme is written down has to be the first
    // thing seen when anyone does (and the READY gate now carries the short
    // version at point of play).
    const ctlTitle = el(`<h3 style="margin:18px 0 4px">CONTROLS</h3>`);
    panel.appendChild(ctlTitle);
    const ctl = (label, keys) => panel.appendChild(
      el(`<div class="set-row"><span class="set-label">${label}</span>
        <span class="set-val">${keys}</span></div>`));
    // One flat list, no sub-headers. There used to be CITY PLAY / CITY LEVELS /
    // GENERAL groups, and the first two were byte-identical — CITY LEVELS
    // documented the campaign, which a137054 retired. showTitle() offers only
    // sandbox scenes plus SHOP/SETTINGS now, so there is no route to a campaign
    // level and no second scheme left to distinguish.
    ctl('Drive forward', 'W / ↑');
    ctl('Reverse', 'S / ↓');
    ctl('Turn left', 'A / ←');
    ctl('Turn right', 'D / →');
    ctl('Orbit camera', 'Q / E');
    ctl('Zoom in / out', 'R / F');
    ctl('Pause', 'Esc');
    // Touch is three separate bindings, so it gets three rows. It was one row
    // reading 'left ½ steers · right ½ looks · pinch zooms', which was ~300px of
    // value on a 276px row at 320px — no layout saves that, and trimming the
    // wording until it happened to fit would break again on the next edit.
    // Splitting also matches how every other line here reads: action, then
    // binding. Left half is direct steer (the drag names a screen direction and
    // the hole turns to face it), not a heading nudge.
    ctl('Steer (touch)', 'drag left ½');
    ctl('Look around (touch)', 'drag right ½');
    ctl('Zoom (touch)', 'pinch two fingers');

    // Graphics detail, binary: full graphics or not. HIGH is the default and is
    // the pre-tier sim exactly; LOW drops the pixel ratio, shadows, ambient life
    // and the debris/support budgets (js/quality.js has the measured rationale
    // for each). There is no AUTO — nothing classifies the device and nothing
    // adjusts while playing, so the button reads the setting and only that.
    //
    // Still the same button rather than a <select>: every other control on this
    // screen is a button, a native dropdown is the one widget that would look
    // imported, and two options make the cycle a straight toggle.
    const QUALITY_ORDER = ['high', 'low'];
    const QUALITY_LABEL = { high: 'HIGH', low: 'LOW' };
    const qualityText = () => QUALITY_LABEL[st.quality] || QUALITY_LABEL.high;
    const qRow = el(`<div class="set-row"><span class="set-label">🎚 Graphics detail</span>
      <span class="set-val"><button class="btn secondary">${qualityText()}</button></span></div>`);
    const qBtn = qRow.querySelector('button');
    qBtn.onclick = () => {
      // Fall back to the tier the LABEL is showing, not to a sentinel: an
      // unrecognised stored value renders as HIGH, so starting the cycle
      // anywhere else makes the first click look like it did nothing.
      const i = Math.max(0, QUALITY_ORDER.indexOf(st.quality));
      st.quality = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length];
      qBtn.textContent = qualityText();
      this.actions.applySettings();
    };
    panel.appendChild(qRow);

    const muteRow = el(`<div class="set-row"><span class="set-label">🔊 Game sounds</span>
      <span class="set-val"><button class="btn secondary">${this.save.muted ? 'OFF' : 'ON'}</button></span></div>`);
    const muteBtn = muteRow.querySelector('button');
    muteBtn.onclick = () => {
      this.actions.toggleMute();
      muteBtn.textContent = this.save.muted ? 'OFF' : 'ON';
    };
    panel.appendChild(muteRow);

    const volRow = el(`<div class="set-row"><span class="set-label">🔊 Sound volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        value="${st.sfxVol !== undefined ? st.sfxVol : 1}"></span></div>`);
    const volSlider = volRow.querySelector('input');
    volSlider.oninput = () => {
      st.sfxVol = parseFloat(volSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(volRow);

    // Stacked: measured at 320px this label alone is 240px of a 276px row, so it
    // cannot share a line with a slider at any slider width worth dragging.
    const distRow = el(`<div class="set-row set-row--stack"><span class="set-label">📷 Camera view (closer ↔ farther)</span>
      <span class="set-val"><input type="range" min="0.7" max="1.5" step="0.05" value="${st.camDist}"></span></div>`);
    const slider = distRow.querySelector('input');
    slider.oninput = () => {
      st.camDist = parseFloat(slider.value);
      this.actions.applySettings();
    };
    panel.appendChild(distRow);

    // Turn rate shown to the player: ORBIT_RATE rad/s × sens, in degrees.
    // Derived from the constant rather than typed as a literal so the readout
    // cannot drift when the controls are re-tuned — a hand-copied number here
    // would keep claiming the old speed after a change in controls.js and
    // nobody would notice, because it still looks plausible.
    //
    // One slider, two consumers, both in the sandbox: A/D steering and the
    // Q/E / touch-drag manual orbit both run at ORBIT_RATE × turnSens × the
    // size ramp (controls.js _steerSens/_orbitSens; the touch stick's direct
    // steer then multiplies by DIRECT_STEER_BOOST under the DIRECT_STEER_MAX
    // cap), so the range printed here is the base each is built from. It used
    // to print STEER_RATE × sens, which
    // described nothing that ran anywhere — the sandbox's old A/D steering
    // ignored this slider entirely and used its own size-ramped 0.2–0.8, so
    // the screen advertised ~155°/s for a control that actually turned at
    // ~31°/s.
    //
    // Printed as a RANGE, not a single number, because the rate is genuinely
    // size-dependent now: quoting either end alone would be false for the whole
    // rest of the ladder, which is the same class of lie the old readout told.
    // Both ends come off the exported constants, so neither can drift.
    const DEG_PER_RAD = 180 / Math.PI;
    const sensFmt = (v) => `${v.toFixed(2)} · ~${Math.round(ORBIT_RATE * DEG_PER_RAD * v)}` +
      `-${Math.round(ORBIT_RATE * ORBIT_RATE_RAMP * DEG_PER_RAD * v)}°/s (SIZE 1→12)`;
    // Stacked for the same reason as the camera row, and more so: the readout is
    // deliberately a full range with a SIZE annotation (see above), which is
    // 223px on its own at 320px. Shortening it to fit would re-introduce exactly
    // the lie the comment above exists to prevent.
    const sensRow = el(`<div class="set-row set-row--stack"><span class="set-label">Sandbox turn sensitivity</span>
      <span class="set-val"><span class="tune-val">${sensFmt(st.turnSens !== undefined ? st.turnSens : 1)}</span>
      <input type="range" min="0.1" max="2.5" step="0.05" value="${st.turnSens !== undefined ? st.turnSens : 1}"></span></div>`);
    const sensSlider = sensRow.querySelector('input');
    const sensVal = sensRow.querySelector('.tune-val');
    sensSlider.oninput = () => {
      st.turnSens = parseFloat(sensSlider.value);
      sensVal.textContent = sensFmt(st.turnSens);
      this.actions.applySettings();
    };
    panel.appendChild(sensRow);

    // Dev voxel-physics tuning — live-applied to the running sandbox via
    // actions.applySettings(). Folded behind an ADVANCED disclosure (playtest
    // finding: engineering-unit sliders sat in the player-facing list), with a
    // reset because there was no way back to the shipped feel once moved.
    // Values come from VOX_DEFAULTS so the reset can never drift from the
    // defaults a fresh save starts on.
    const fold = el(`<details class="set-details"><summary>ADVANCED — CITY FEEL</summary></details>`);
    panel.appendChild(fold);
    const tune = (label, key, min, max, step, fmt) => {
      const row = el(`<div class="set-row"><span class="set-label">${label}</span>
        <span class="set-val"><span class="tune-val">${fmt(st[key])}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${st[key]}"></span></div>`);
      const input = row.querySelector('input');
      const val = row.querySelector('.tune-val');
      input.oninput = () => {
        st[key] = parseFloat(input.value);
        val.textContent = fmt(st[key]);
        this.actions.applySettings();
      };
      fold.appendChild(row);
    };
    tune('Gravity', 'voxGravity', 26, 130, 1, (v) => `${v} · ${(v / 26).toFixed(1)}×`);
    tune('Collapse wave', 'voxWaveK', 0.05, 1, 0.05, (v) => `${v.toFixed(2)} s/m`);
    tune('Creak delay', 'voxCreak', 0, 2, 0.05, (v) => `${v.toFixed(2)}×`);
    tune('Hole speed', 'voxSpeed', 0.7, 3, 0.1, (v) => `${v.toFixed(1)}× · ~${(7.1 * v).toFixed(1)} m/s`);
    tune('Attraction pull', 'voxAttract', 0, 20, 1, (v) => `${v}`);
    const reset = el(`<button class="btn secondary">RESET TO DEFAULTS</button>`);
    reset.onclick = () => {
      Object.assign(st, VOX_DEFAULTS);
      this.actions.applySettings();
      this.showSettings(onBack);
    };
    fold.appendChild(reset);

    s.appendChild(panel);
    const back = el(`<button class="btn set-back">BACK</button>`);
    back.onclick = onBack;
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'settings';
  }
}
