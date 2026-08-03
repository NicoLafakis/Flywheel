// HUD: mass bar, timer, combo, level banner, minimap, toasts.

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
    this.mctx = this.minimap.getContext('2d');
    this.toastTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setLevel(level, metroName) {
    this.banner.textContent = `LEVEL ${level.index} - ${metroName}`;
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
    const h = sim.hole;
    this.massBar.style.width = `${(h.sizeFrac * 100).toFixed(1)}%`;
    this.massBar.style.background = '#ffd23f';
    this.massLabel.textContent = h.size >= sim.MAX_SIZE && h.sizeFrac >= 1
      ? `SIZE ${h.size} MAX · ${h.eatenCount} voxels · ${Math.floor(h.rawMass)} mass`
      : `SIZE ${h.size} → SIZE ${h.size + 1} · ${Math.round(h.sizeFrac * 100)}% · ${h.eatenCount} voxels`;
    this.timer.textContent = Math.floor(sim.time);
    this.timer.classList.remove('low');
    if (h.chain >= 2) {
      this.comboLabel.classList.remove('hidden');
      this.comboLabel.textContent = `COMBO x${h.chain > 99 ? '99+' : h.chain}`;
      // escalate color/size with combo tier so big chains feel big
      const tier = h.chain >= 50 ? 3 : h.chain >= 25 ? 2 : h.chain >= 10 ? 1 : 0;
      this.comboLabel.style.color = ['#ffffff', '#ffd23f', '#ff9a3f', '#ff5a1f'][tier];
      this.comboLabel.style.fontSize = ['', '18px', '20px', '22px'][tier];
    } else {
      this.comboLabel.classList.add('hidden');
      this.comboLabel.style.color = '';
      this.comboLabel.style.fontSize = '';
    }
  }

  drawMinimap(sim) {
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
