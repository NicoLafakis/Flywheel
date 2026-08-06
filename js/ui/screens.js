// Full-screen UI: title, world map, shop, results, pause, mechanic intro.

import { LEVELS, METROS, MECHANICS, LEVELS_PER_METRO, coinsForResult, starsForResult } from '../levels.js';
import { isLevelUnlocked, storeSave } from '../save.js';
import { ORBIT_RATE, ORBIT_RATE_RAMP } from '../controls.js';
import { buildBlockWord } from './blockword.js';
import { buildSprocket } from './sprocket.js';

// The shop shelf is the skin registry itself — js/skins.js owns the rows, this
// file only draws them. Re-exported rather than re-imported at the call sites so
// nothing that already did `import { SKINS } from './ui/screens.js'` has to
// change, and so there is exactly one list of ids and prices in the codebase.
// (Imported AND re-exported: a bare `export ... from` would not create the
// local binding this file's own shop renderer needs.)
import { SKINS, bakeSkinThumbnails } from '../skins.js';
export { SKINS };

export const ITEMS = [
  { id: 'clock5', name: '+5s Clock', desc: 'Every level gets 5 extra seconds.', price: 400 },
  { id: 'growth5', name: '+5% Growth', desc: 'Mass gained is 5% higher.', price: 500 },
];

// The free-play shelf on the landing screen. Brooklyn leads because it was the
// first showcase scene; Boston is the second and carries the same establishing
// shot and READY gate, so only Brooklyn keeps the pill — two 'Showcase' tags
// side by side read as a bug rather than an endorsement. The generic sandbox
// trails because it is a physics test bed, not a place.
// `scene` is passed straight to actions.startVoxelSandbox(); the sandbox entry
// omits it so the undefined lands on that function's own 'gallery' default,
// which keeps the scene id written down in exactly one place (js/main.js).
const FREE_PLAY = [
  { scene: 'brooklyn', name: 'BROOKLYN', sub: 'Bridges to Coney Island', tag: 'Showcase' },
  { scene: 'boston', name: 'BOSTON', sub: 'Seaport and the Convention Center' },
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
    const ctaWrap = el(`<div class="fw-cta-wrap"></div>`);
    const play = el(`<button type="button" class="fw-cta">PLAY A CITY</button>`);
    play.onclick = () => this.actions.startVoxelSandbox('brooklyn');
    ctaWrap.appendChild(play);
    s.appendChild(ctaWrap);

    const group = el(`<section class="fw-group" aria-labelledby="fw-free-play"></section>`);
    group.appendChild(el(`<div class="fw-group-label" id="fw-free-play">Choose a city · collect coins · grow big</div>`));
    const chips = el(`<div class="fw-chips"></div>`);
    for (const sc of FREE_PLAY) {
      const chip = el(`<button type="button" class="fw-chip">
        <span class="fw-chip-name">${sc.name}</span>
        <span class="fw-chip-sub">${sc.sub}</span>
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
    const s = el(`<div class="screen"><h2>GOAL COMPLETE</h2><div class="results-stats">
      <div>${sim.goal.name}</div><div>City cleared <b>${Math.round(sim.hole.rawMass / sim.totalMass * 100)}%</b></div>
      <div>Coins found <b>${sim.coinsCollected}/${sim.coins.length}</b></div>
      <div>Finish bonus <b>+35</b></div><div>Coins earned <b>+${coins}</b></div></div></div>`);
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
    for (const it of ITEMS) {
      const owned = this.save.ownedItems.includes(it.id);
      const item = el(`<div class="shop-item"><h4>${it.name}</h4>
        <p style="font-size:13px;min-height:34px">${it.desc}</p>
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
    const map = el(`<button class="btn secondary">WORLD MAP</button>`);
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
    const restart = el(`<button class="btn secondary">RESTART</button>`);
    restart.onclick = () => this.actions.restart();
    const quit = el(`<button class="btn secondary">WORLD MAP</button>`);
    quit.onclick = () => this.actions.quitToMap();
    s.append(resume, settings, restart, quit);
    this.root.appendChild(s);
    this.current = 'pause';
  }

  showSettings(onBack) {
    this.clear();
    const st = this.save.settings;
    const s = el(`<div class="screen"><h2>SETTINGS</h2></div>`);
    const panel = el(`<div class="results-stats" style="float:none"></div>`);

    const toggle = (label, key) => {
      const row = el(`<div style="margin:8px 0">${label}
        <button class="btn secondary" style="float:right;padding:4px 18px;font-size:14px;margin:0">
        ${st[key] ? 'ON' : 'OFF'}</button></div>`);
      const btn = row.querySelector('button');
      btn.onclick = () => {
        st[key] = !st[key];
        btn.textContent = st[key] ? 'ON' : 'OFF';
        this.actions.applySettings();
      };
      return row;
    };

    panel.appendChild(toggle('👆 Tap to steer', 'pointMove'));
    panel.appendChild(toggle('↔ Flip left and right', 'invertX'));
    panel.appendChild(toggle('↕ Flip up and down', 'invertY'));
    panel.appendChild(toggle('🌤 Pretty shadows', 'shadows'));
    panel.appendChild(toggle('🫧 Less movement', 'reducedMotion'));
    panel.appendChild(toggle('⚡ Smoother play', 'perfMode'));

    // Device quality. AUTO is the default and the only value that lets the live
    // watchdog work — the named tiers pin it, which is the point of choosing
    // one. Cycled by a single button rather than a <select> because every other
    // control on this screen is a button and a native dropdown is the one widget
    // that would look imported; five options is few enough that a cycle never
    // feels like hunting.
    //
    // The label reports what AUTO actually resolved to, because the honest
    // failure mode of an auto setting is a player who cannot tell whether it
    // did anything. `window.__quality` is set by main.js at boot.
    const QUALITY_ORDER = ['auto', 'high', 'medium', 'low', 'potato'];
    const QUALITY_LABEL = { auto: 'AUTO', high: 'HIGH', medium: 'MEDIUM', low: 'LOW', potato: 'LOWEST' };
    const qualityText = () => {
      const cur = st.quality || 'auto';
      if (cur !== 'auto') return QUALITY_LABEL[cur];
      const q = typeof window !== 'undefined' && window.__quality;
      const live = q && q.tier ? q.tier() : null;
      return live ? `AUTO · ${QUALITY_LABEL[live] || live.toUpperCase()}` : 'AUTO';
    };
    const qRow = el(`<div style="margin:8px 0">🎚 Graphics detail
      <button class="btn secondary" style="float:right;padding:4px 14px;font-size:14px;margin:0">
      ${qualityText()}</button></div>`);
    const qBtn = qRow.querySelector('button');
    qBtn.onclick = () => {
      const i = QUALITY_ORDER.indexOf(st.quality || 'auto');
      st.quality = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length];
      qBtn.textContent = qualityText();
      this.actions.applySettings();
      // Re-read AFTER applySettings: switching back to AUTO re-resolves the tier,
      // and the label would otherwise show the previous one until the next visit.
      qBtn.textContent = qualityText();
    };
    panel.appendChild(qRow);

    const muteRow = el(`<div style="margin:8px 0">🔊 Game sounds
      <button class="btn secondary" style="float:right;padding:4px 18px;font-size:14px;margin:0">
      ${this.save.muted ? 'OFF' : 'ON'}</button></div>`);
    const muteBtn = muteRow.querySelector('button');
    muteBtn.onclick = () => {
      this.actions.toggleMute();
      muteBtn.textContent = this.save.muted ? 'OFF' : 'ON';
    };
    panel.appendChild(muteRow);

    const volRow = el(`<div style="margin:8px 0">🔊 Sound volume
      <input type="range" min="0" max="1" step="0.05" value="${st.sfxVol !== undefined ? st.sfxVol : 1}"
        style="float:right;width:140px"></div>`);
    const volSlider = volRow.querySelector('input');
    volSlider.oninput = () => {
      st.sfxVol = parseFloat(volSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(volRow);

    const distRow = el(`<div style="margin:8px 0">📷 Camera view (closer ↔ farther)
      <input type="range" min="0.7" max="1.5" step="0.05" value="${st.camDist}"
        style="float:right;width:140px"></div>`);
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
    // size ramp (controls.js _steerSens/_orbitSens), so the range printed
    // here is true for each. It used to print STEER_RATE × sens, which
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
    const sensRow = el(`<div style="margin:8px 0">Sandbox turn sensitivity
      <span style="float:right"><span class="tune-val" style="font-weight:700">${sensFmt(st.turnSens !== undefined ? st.turnSens : 1)}</span>
      <input type="range" min="0.1" max="2.5" step="0.05" value="${st.turnSens !== undefined ? st.turnSens : 1}"
        style="width:100px;vertical-align:middle;margin-left:8px"></span></div>`);
    const sensSlider = sensRow.querySelector('input');
    const sensVal = sensRow.querySelector('.tune-val');
    sensSlider.oninput = () => {
      st.turnSens = parseFloat(sensSlider.value);
      sensVal.textContent = sensFmt(st.turnSens);
      this.actions.applySettings();
    };
    panel.appendChild(sensRow);

    // Dev voxel-physics tuning — live-applied to the running sandbox via
    // actions.applySettings(). Shipped with the game while in development.
    const tuneTitle = el(`<h3 style="clear:both;margin:16px 0 4px">CITY FEEL</h3>`);
    panel.appendChild(tuneTitle);
    const tune = (label, key, min, max, step, fmt) => {
      const row = el(`<div style="clear:both;margin:6px 0">${label}
        <span style="float:right"><span class="tune-val" style="font-weight:700">${fmt(st[key])}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${st[key]}"
          style="width:120px;vertical-align:middle;margin-left:8px"></span></div>`);
      const input = row.querySelector('input');
      const val = row.querySelector('.tune-val');
      input.oninput = () => {
        st[key] = parseFloat(input.value);
        val.textContent = fmt(st[key]);
        this.actions.applySettings();
      };
      panel.appendChild(row);
    };
    tune('Gravity', 'voxGravity', 26, 130, 1, (v) => `${v} · ${(v / 26).toFixed(1)}×`);
    tune('Collapse wave', 'voxWaveK', 0.05, 1, 0.05, (v) => `${v.toFixed(2)} s/m`);
    tune('Creak delay', 'voxCreak', 0, 2, 0.05, (v) => `${v.toFixed(2)}×`);
    tune('Hole speed', 'voxSpeed', 0.7, 3, 0.1, (v) => `${v.toFixed(1)}× · ~${(7.1 * v).toFixed(1)} m/s`);
    tune('Attraction pull', 'voxAttract', 0, 20, 1, (v) => `${v}`);

    // Full controls listing — every ability gets its own keybind.
    const ctlTitle = el(`<h3 style="margin:18px 0 4px">CONTROLS</h3>`);
    panel.appendChild(ctlTitle);
    const ctl = (label, keys) => panel.appendChild(
      el(`<div style="clear:both;margin:4px 0">${label}
        <span style="float:right;font-weight:700">${keys}</span></div>`));
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
    ctl('Touch', 'left ½ steers · right ½ looks · pinch zooms');

    s.appendChild(panel);
    const back = el(`<button class="btn">BACK</button>`);
    back.onclick = onBack;
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'settings';
  }
}
