// HUD: mass bar, timer, combo, level banner, minimap, toasts.

import { SANDBOX_COIN_VALUE } from '../voxelsim.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.banner = document.getElementById('level-banner');
    this.massBar = document.getElementById('mass-bar');
    this.massLabel = document.getElementById('mass-label');
    this.comboLabel = document.getElementById('combo-label');
    this.timer = document.getElementById('timer');
    this.toast = document.getElementById('toast');
    this.bigPop = document.getElementById('big-pop');
    this.minimap = document.getElementById('minimap');
    this.minimapWrap = document.getElementById('minimap-wrap');
    this.mctx = this.minimap.getContext('2d');
    this.toastTimer = null;
    this._minimapShown = null; // no mode has declared itself yet
  }

  // The minimap only has a data source in the campaign: drawMinimap() reads
  // sim.city / sim.player / sim.rivals, none of which VoxelSandboxSim has, so
  // the sandbox frame loop never calls it. Left alone, #minimap-wrap would
  // still paint its bordered box over every sandbox frame with nothing inside
  // it. So visibility follows whoever actually draws — revealed by
  // drawMinimap, hidden by the sandbox's own per-frame update — which keeps
  // the decision here in the HUD instead of needing a mode flag from main.js.
  // Cached because both callers run every frame.
  _showMinimap(on) {
    if (this._minimapShown === on) return;
    this._minimapShown = on;
    this.minimapWrap.classList.toggle('hidden', !on);
  }

  // Start hidden on every show(): the mode is not known until the first frame
  // draws, and one hidden frame beats an empty box. This is also what makes a
  // sandbox -> campaign switch in the same session come back correctly, since
  // the HUD instance outlives both.
  show() { this.root.classList.remove('hidden'); this._showMinimap(false); }
  hide() { this.root.classList.add('hidden'); this._showMinimap(false); }

  setLevel(level, metroName) {
    this.banner.textContent = level.index === 'SANDBOX' ? `✦ ${metroName}` : `LEVEL ${level.index} - ${metroName}`;
  }

  showToast(text, ms = 2200) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), ms);
  }

  // Center-screen celebration pop ("SIZE 2!") — CSS animation does the show.
  showBigPop(text) {
    const el = this.bigPop;
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth; // restart the animation on repeat triggers
    el.style.animation = '';
    clearTimeout(this._bigPopTimer);
    this._bigPopTimer = setTimeout(() => el.classList.add('hidden'), 1200);
  }

  update(sim) {
    const p = sim.player;
    const frac = Math.min(1, p.mass / sim.level.target);
    this.massBar.style.width = `${(frac * 100).toFixed(1)}%`;
    this.massLabel.textContent = `${Math.floor(p.mass)} / ${sim.level.target} collected`;
    const t = Math.ceil(sim.timeLeft);
    this.timer.textContent = t;
    this.timer.classList.toggle('low', t <= 10);
    if (p.chain >= 2) {
      this.comboLabel.classList.remove('hidden');
      this.comboLabel.textContent = `COMBO x${p.chain}`;
    } else {
      this.comboLabel.classList.add('hidden');
    }
  }

  // Voxel sandbox variant: SIZE level + progress to the next size on the
  // bar, voxel/mass counts in the label, elapsed time, combo readout.
  updateSandbox(sim) {
    this._showMinimap(false);
    const h = sim.hole;
    this.massBar.style.background = '#ffd23f';
    const cleared = Math.min(1, h.rawMass / sim.totalMass);
    this.massLabel.textContent = cleared >= sim.goal.targetFraction
      ? `${sim.goal.name} · GOAL REACHED`
      : `GOAL: CLEAR 50% · ${sim.goal.name}`;
    this.massBar.style.width = `${(cleared * 100).toFixed(1)}%`;
    this.timer.textContent = `${sim.coinsCollected}/${sim.coins.length} · ${SANDBOX_COIN_VALUE}`;
    this.timer.textContent = `🪙 ${sim.coinsCollected}/${sim.coins.length} · +${SANDBOX_COIN_VALUE}`;
    this.timer.classList.remove('low');
    if (h.chain >= 2) {
      this.comboLabel.classList.remove('hidden');
      this.comboLabel.textContent = `⚡ COMBO x${Math.floor((h.chain - 1) / 25) + 1}`;
      // escalate color/size with combo tier so big chains feel big
      const tier = h.chain >= 75 ? 3 : h.chain >= 50 ? 2 : h.chain >= 25 ? 1 : 0;
      this.comboLabel.style.color = ['#ffffff', '#ffd23f', '#ff9a3f', '#ff5a1f'][tier];
      this.comboLabel.style.fontSize = ['', '18px', '20px', '22px'][tier];
    } else {
      this.comboLabel.classList.add('hidden');
      this.comboLabel.style.color = '';
      this.comboLabel.style.fontSize = '';
    }
  }

  drawMinimap(sim) {
    this._showMinimap(true);
    const ctx = this.mctx;
    const W = this.minimap.width, H = this.minimap.height;
    const city = sim.city;
    const scale = W / (city.size * 1.15);
    const ox = W / 2, oz = H / 2;
    ctx.fillStyle = '#06121c';
    ctx.fillRect(0, 0, W, H);
    // bounds
    const b = city.bounds;
    ctx.strokeStyle = '#3f9fd8';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + b.xmin * scale, oz + b.zmin * scale, (b.xmax - b.xmin) * scale, (b.zmax - b.zmin) * scale);
    // objects (uneaten, edible tiers colored by tier)
    const colors = [null, '#9be37a', '#7ec8ff', '#ffd23f', '#ff9a3f', '#ff6b81', '#b44bff', '#ffffff'];
    for (const o of city.objects) {
      if (o.eaten) continue;
      ctx.fillStyle = o.golden ? '#ffd23f' : (o.shielded ? '#66ccff' : colors[o.tier]);
      ctx.fillRect(ox + o.x * scale - 1, oz + o.z * scale - 1, 2, 2);
    }
    // player + rivals
    ctx.fillStyle = '#4be34b';
    ctx.beginPath();
    ctx.arc(ox + sim.player.x * scale, oz + sim.player.z * scale, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b44bff';
    for (const r of sim.rivals) {
      ctx.beginPath();
      ctx.arc(ox + r.x * scale, oz + r.z * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
