// Full-screen UI: title, world map, shop, results, pause, mechanic intro.

import { LEVELS, METROS, MECHANICS, LEVELS_PER_METRO, coinsForResult, starsForResult } from '../levels.js';
import { isLevelUnlocked, storeSave } from '../save.js';

export const SKINS = [
  { id: 'classic', name: 'Classic Void', color: 0x4be34b, css: '#4be34b', price: 0 },
  { id: 'neon', name: 'Neon Circuit', color: 0x00f0ff, css: '#00f0ff', price: 150 },
  { id: 'lava', name: 'Lava Core', color: 0xff5a1f, css: '#ff5a1f', price: 250 },
  { id: 'frost', name: 'Frost Rift', color: 0x70c0ff, css: '#70c0ff', price: 350 },
  { id: 'galaxy', name: 'Galaxy Swirl', color: 0xb44bff, css: '#b44bff', price: 500 },
  { id: 'gold', name: 'Golden Singularity', color: 0xffd23f, css: '#ffd23f', price: 800 },
];
export const ITEMS = [
  { id: 'clock5', name: '+5s Clock', desc: 'Every level gets 5 extra seconds.', price: 400 },
  { id: 'growth5', name: '+5% Growth', desc: 'Mass gained is 5% higher.', price: 500 },
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

  showTitle() {
    this.clear();
    const s = el(`<div class="screen"><h1>HOLE CITY</h1>
      <p style="margin-bottom:14px">Eat the city. Beat the clock.</p></div>`);
    const play = el(`<button class="btn">PLAY</button>`);
    play.onclick = () => this.showWorldMap();
    const sandbox = el(`<button class="btn secondary" style="background:#b44bff;color:#fff">VOXEL SANDBOX</button>`);
    sandbox.onclick = () => this.actions.startVoxelSandbox();
    const nyc = el(`<button class="btn secondary" style="background:#2a5f9a;color:#fff">NYC: LOWER MANHATTAN</button>`);
    nyc.onclick = () => this.actions.startVoxelSandbox('manhattan');
    const upper = el(`<button class="btn secondary" style="background:#3e8a5b;color:#fff">NYC: UPPER MANHATTAN — CENTRAL PARK</button>`);
    upper.onclick = () => this.actions.startVoxelSandbox('upper-manhattan');
    const bklyn = el(`<button class="btn secondary" style="background:#8a4f33;color:#fff">NYC: BROOKLYN — BRIDGES TO CONEY ISLAND</button>`);
    bklyn.onclick = () => this.actions.startVoxelSandbox('brooklyn');
    const shop = el(`<button class="btn secondary">SHOP</button>`);
    shop.onclick = () => this.showShop();
    const settings = el(`<button class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showTitle());
    s.append(play, sandbox, nyc, upper, bklyn, shop, settings);
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
    this.clear();
    const s = el(`<div class="screen"><h2>WORLD MAP</h2>
      <div class="coins">&#128176; ${this.save.coins} coins</div></div>`);
    LEVELS.forEach((lvl, i) => {
      if (i % LEVELS_PER_METRO !== 0) return;
      const metro = METROS[lvl.metroIndex];
      const row = el(`<div class="metro-row"><h3>${metro.name}</h3><div class="level-cards"></div></div>`);
      const cards = row.querySelector('.level-cards');
      for (let j = i; j < i + LEVELS_PER_METRO; j++) {
        const L = LEVELS[j];
        const rec = this.save.levels[L.index];
        const unlocked = isLevelUnlocked(this.save, L.index);
        const stars = rec ? rec.stars : 0;
        const mech = L.introduces ? MECHANICS[L.introduces].icon : '';
        const card = el(`<div class="level-card ${unlocked ? '' : 'locked'}">
          <div>${L.index}</div><div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
          <div class="mech">${mech}</div></div>`);
        if (unlocked) card.onclick = () => this.actions.play(L);
        cards.appendChild(card);
      }
      s.appendChild(row);
    });
    const back = el(`<button class="btn secondary">BACK</button>`);
    back.onclick = () => this.showTitle();
    const shop = el(`<button class="btn secondary">SHOP</button>`);
    shop.onclick = () => this.showShop();
    const btnRow = el(`<div></div>`);
    btnRow.append(shop, back);
    s.appendChild(btnRow);
    this.root.appendChild(s);
    this.current = 'map';
  }

  showShop() {
    this.clear();
    const s = el(`<div class="screen"><h2>SHOP</h2>
      <div class="coins">&#128176; ${this.save.coins} coins</div>
      <div class="shop-items"></div></div>`);
    const wrap = s.querySelector('.shop-items');
    for (const skin of SKINS) {
      const owned = this.save.ownedItems.includes(skin.id) || skin.price === 0;
      const equipped = this.save.equippedSkin === skin.id;
      const item = el(`<div class="shop-item"><h4>${skin.name}</h4>
        <div class="swatch" style="background:${skin.css}"></div>
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

    panel.appendChild(toggle('Invert move X', 'invertX'));
    panel.appendChild(toggle('Invert move Y', 'invertY'));
    panel.appendChild(toggle('Shadows', 'shadows'));
    panel.appendChild(toggle('Reduced Motion', 'reducedMotion'));
    panel.appendChild(toggle('Performance Mode', 'perfMode'));

    const muteRow = el(`<div style="margin:8px 0">Sound
      <button class="btn secondary" style="float:right;padding:4px 18px;font-size:14px;margin:0">
      ${this.save.muted ? 'OFF' : 'ON'}</button></div>`);
    const muteBtn = muteRow.querySelector('button');
    muteBtn.onclick = () => {
      this.actions.toggleMute();
      muteBtn.textContent = this.save.muted ? 'OFF' : 'ON';
    };
    panel.appendChild(muteRow);

    const volRow = el(`<div style="margin:8px 0">SFX volume
      <input type="range" min="0" max="1" step="0.05" value="${st.sfxVol !== undefined ? st.sfxVol : 1}"
        style="float:right;width:140px"></div>`);
    const volSlider = volRow.querySelector('input');
    volSlider.oninput = () => {
      st.sfxVol = parseFloat(volSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(volRow);

    const distRow = el(`<div style="margin:8px 0">Camera distance
      <input type="range" min="0.7" max="1.5" step="0.05" value="${st.camDist}"
        style="float:right;width:140px"></div>`);
    const slider = distRow.querySelector('input');
    slider.oninput = () => {
      st.camDist = parseFloat(slider.value);
      this.actions.applySettings();
    };
    panel.appendChild(distRow);

    // turn rate: 0.045 rad/frame × sens ≈ 154.7°/s at 1× (60 fps nominal)
    const sensFmt = (v) => `${v.toFixed(2)} · ~${Math.round(154.7 * v)}°/s`;
    const sensRow = el(`<div style="margin:8px 0">Turn sensitivity
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
    const tuneTitle = el(`<h3 style="clear:both;margin:16px 0 4px">DEV TUNING — VOXEL SANDBOX</h3>`);
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
    const ctlGroup = (name) => panel.appendChild(
      el(`<div style="clear:both;margin:8px 0 2px;opacity:0.7;font-size:13px;font-weight:700">${name}</div>`));
    const ctl = (label, keys) => panel.appendChild(
      el(`<div style="clear:both;margin:4px 0">${label}
        <span style="float:right;font-weight:700">${keys}</span></div>`));
    ctlGroup('VOXEL SANDBOX');
    ctl('Move forward', 'W / ↑');
    ctl('Move back', 'S / ↓');
    ctl('Turn left', 'A / ←');
    ctl('Turn right', 'D / →');
    ctl('Move left', 'Q');
    ctl('Move right', 'E');
    ctl('Zoom in / out', 'R / F');
    ctlGroup('CITY LEVELS');
    ctl('Move', 'WASD / arrows');
    ctl('Orbit camera', 'Q / E');
    ctl('Zoom in / out', 'R / F');
    ctlGroup('GENERAL');
    ctl('Pause', 'Esc');
    ctl('Touch', 'left ½ joystick · right ½ orbit');

    s.appendChild(panel);
    const back = el(`<button class="btn">BACK</button>`);
    back.onclick = onBack;
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'settings';
  }
}
