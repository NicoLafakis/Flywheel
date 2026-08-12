// HUD: mass bar, timer, combo, level banner, minimap, toasts.

import { COMBO_WINDOW, COMBO_MAX_LEVEL, COMBO_LEVEL_NAMES, comboLevel, comboMult } from '../voxelsim.js';

// The arc's circumference at r=42, matching css/main.css's stroke-dasharray.
const CM_CIRCUM = 2 * Math.PI * 42;

// Announcement priorities. One scale, so a future reward system arrives through
// the same door with a rank instead of a new channel (SYS-605).
export const ANN = { COIN: 10, COMBO: 30, SIZE: 50, MILESTONE: 70, GOAL: 90 };

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

    // --- sandbox reward layer -------------------------------------------------
    this.scorePlate = document.getElementById('score-plate');
    this.scoreValue = document.getElementById('score-value');
    this.comboMeter = document.getElementById('combo-meter');
    this.comboArc = this.comboMeter.querySelector('.cm-arc');
    this.comboChain = document.getElementById('cm-chain');
    this.comboMultEl = document.getElementById('cm-mult');
    this.band = document.getElementById('hype-band');
    this.bandText = document.getElementById('hype-text');
    // Display state for the count-up, held here rather than in the sim: it is
    // presentation, and the sim must stay the only writer of the real number.
    this._scoreShown = 0;
    this._scoreLast = performance.now();
    this._comboLevelShown = -1;
    this._comboLive = false;
    // Reduced motion resolves the same two ways it does in js/camera.js and
    // js/voxelworld.js — the OS preference OR the in-game setting — and is
    // reflected onto <body> so css/main.css can carry the variants in one place.
    this._osReduced = false;
    this._settingReduced = false;
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._osReduced = mq.matches;
      const onChange = () => { this._osReduced = mq.matches; this._applyReducedMotion(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) { /* no matchMedia: the setting alone decides */ }
    this._applyReducedMotion();

    // The announcement channel. ONE thing speaks at a time, whichever backend
    // it uses, which is what makes priority mean anything: before this, a 700 ms
    // coin toast and a 2200 ms milestone toast wrote the same element and the
    // same timer, so a coin erased a milestone mid-sentence.
    this._ann = null;        // { priority, source, until, hide }
    this._annTimer = null;
  }

  get reducedMotion() { return this._osReduced || this._settingReduced; }

  setReducedMotion(on) { this._settingReduced = !!on; this._applyReducedMotion(); }

  _applyReducedMotion() {
    document.body.classList.toggle('reduced-motion', this.reducedMotion);
  }

  // --- announcement queue ---------------------------------------------------
  // Takes text, a tier, a priority and a source (FR-019). Three rules:
  //   - a higher priority takes the channel immediately;
  //   - a lower one never truncates a higher one already showing;
  //   - repeats from the same source coalesce in place rather than stacking,
  //     so the player never watches a backlog drain.
  announce({ text, source, priority = 0, ms = 2000, channel = 'toast', tier = 'hype' }) {
    const now = performance.now();
    const live = this._ann && this._ann.until > now ? this._ann : null;
    if (live && live.priority > priority) return false;
    if (live && live.source === source && live.channel === channel) {
      // Coalesce: same speaker, same channel — rewrite in place, extend once.
      this._present(channel, text, tier, /* restart */ false);
      this._arm(priority, source, channel, ms, now);
      return true;
    }
    if (live) this._clearChannel(live.channel);
    this._present(channel, text, tier, true);
    this._arm(priority, source, channel, ms, now);
    return true;
  }

  _arm(priority, source, channel, ms, now) {
    this._ann = { priority, source, channel, until: now + ms };
    clearTimeout(this._annTimer);
    this._annTimer = setTimeout(() => { this._clearChannel(channel); this._ann = null; }, ms);
  }

  _clearChannel(channel) {
    if (channel === 'toast') { clearTimeout(this.toastTimer); this.toast.classList.add('hidden'); }
    else if (channel === 'pop') { clearTimeout(this._bigPopTimer); this.bigPop.classList.add('hidden'); }
    else if (channel === 'band') { this.band.classList.add('hidden'); this.band.classList.remove('show'); }
  }

  _present(channel, text, tier, restart) {
    if (channel === 'toast') this.showToast(text, 1e9);       // the queue owns the timing
    else if (channel === 'pop') this.showBigPop(text);
    else if (channel === 'band') this.showBand(text, tier, restart);
  }

  // Full-width consumption band. One persistent element, restarted rather than
  // recreated, so a run of celebrations never grows the DOM (SYS-904/GWT-903).
  // Text, never markup: the phrase table can therefore never be an injection
  // surface if a phrase ever comes from anywhere but the repo (NFR-07).
  showBand(text, tier = 'hype', restart = true) {
    const el = this.band;
    this.bandText.textContent = text;
    el.className = `tier-${tier}`;
    if (restart) { void el.offsetWidth; }
    el.classList.add('show');
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
    // Live numeric progress, not a static banner: "GOAL: CLEAR 50%" never told
    // the player whether they were at 0.1% or 10% (playtest finding — the bar
    // was the only progress channel and it had no scale). SIZE rides the same
    // line so the grow ladder is visible between size-up pops.
    const goalPct = Math.round(sim.goal.targetFraction * 100);
    this.massLabel.textContent = cleared >= sim.goal.targetFraction
      ? `${sim.goal.name} · GOAL REACHED · SIZE ${h.size}`
      : `CLEARED ${Math.floor(cleared * 100)}% / ${goalPct}% OF THE CITY · SIZE ${h.size}`;
    this.massBar.style.width = `${(cleared * 100).toFixed(1)}%`;
    // No "+2" suffix: the per-coin value read as an unexplained orphan on the
    // HUD; the payout is explained on the results screen where the math lives.
    this.timer.textContent = `🪙 ${sim.coinsCollected}/${sim.coins.length}`;
    this.timer.classList.remove('low');
    if (sim.mode === 'run90') {
      const seconds = Math.max(0, 90 - sim.rankedTicks / 60);
      this.massLabel.textContent = `THE RUN · SIZE ${h.size} · ${Math.floor(cleared * 100)}% OF CHICAGO`;
      this.timer.textContent = `${seconds.toFixed(1)} s`;
      this.timer.classList.toggle('low', seconds <= 10);
    }
    // The old sandbox combo pill printed `⚡ COMBO x{floor((chain-1)/25)+1}` —
    // a LEVEL INDEX in multiplier notation, which read x2 at chain 26 while the
    // sim awarded 1.1. It is replaced outright by the ring below, which reads
    // the sim's own exported ladder. The pill stays hidden in the sandbox.
    this.comboLabel.classList.add('hidden');
    this._updateScore(h.mass);
    this._updateCombo(h);
  }

  // Animated count-up. Eased toward the live value on real time, so a big gain
  // is legible AS a gain; under reduced motion it sets instead (GWT-804). Only
  // ever mutates textContent and one class on an element that already exists.
  _updateScore(mass) {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this._scoreLast) / 1000));
    this._scoreLast = now;
    const target = Math.floor(mass);
    if (this.reducedMotion) this._scoreShown = target;
    else if (this._scoreShown !== target) {
      const gap = target - this._scoreShown;
      // 8/s exponential approach, with a floor so the last few points still
      // arrive promptly instead of crawling asymptotically.
      const stepped = this._scoreShown + gap * Math.min(1, dt * 8) + Math.sign(gap) * dt * 20;
      this._scoreShown = Math.abs(target - stepped) < 1 ? target : stepped;
    }
    const shown = Math.floor(this._scoreShown);
    if (shown !== this._scoreTextShown) {
      this._scoreTextShown = shown;
      this.scoreValue.textContent = shown.toLocaleString('en-US');
      // The tick class is toggled, not re-added per frame: adding it while it is
      // already set would restart nothing and cost a style recalc every frame.
      if (!this._scoreTicking) { this._scoreTicking = true; this.scorePlate.classList.add('gain'); }
      clearTimeout(this._scoreTickTimer);
      this._scoreTickTimer = setTimeout(() => {
        this._scoreTicking = false; this.scorePlate.classList.remove('gain');
      }, 220);
    }
  }

  // The ring: chain count, the multiplier the SIM is applying, and the window
  // draining. The multiplier comes from the sim's exported ladder — never from
  // a second expression here, which is exactly how the old label came to
  // disagree with the sim (§2 of the PRD, ADR-0015).
  _updateCombo(h) {
    const live = h.chain > 0;
    const level = comboLevel(h.chain);
    const frac = live ? Math.max(0, Math.min(1, h.chainTimer / COMBO_WINDOW)) : 0;
    this.comboArc.style.strokeDashoffset = (CM_CIRCUM * (1 - frac)).toFixed(2);
    if (h.chain !== this._chainShown) {
      this._chainShown = h.chain;
      this.comboChain.textContent = h.chain;
    }
    if (level !== this._comboLevelShown) {
      this._comboLevelShown = level;
      this.comboMeter.style.setProperty('--cm-heat', `var(--fw-heat-${Math.min(8, level)})`);
      this.comboMultEl.textContent = level >= COMBO_MAX_LEVEL
        ? COMBO_LEVEL_NAMES[COMBO_MAX_LEVEL]
        : `x${comboMult(h.chain)}`;
    }
    if (live !== this._comboLive) {
      this._comboLive = live;
      this.comboMeter.classList.toggle('live', live);
      // A break is visibly not the same thing as never having started
      // (FR-010): the ring collapses rather than simply resting.
      if (!live) this.pulseComboBreak();
    }
  }

  // Ladder-step pulse, ~250 ms, fired from the sim's combo event. Restarting
  // the animation is a class toggle plus one forced reflow on a persistent
  // element; nothing is created and nothing is destroyed.
  pulseCombo() {
    const el = this.comboMeter;
    el.classList.remove('step');
    void el.offsetWidth;
    el.classList.add('step');
  }

  pulseComboBreak() {
    const el = this.comboMeter;
    el.classList.remove('broke');
    void el.offsetWidth;
    el.classList.add('broke');
    clearTimeout(this._breakTimer);
    this._breakTimer = setTimeout(() => el.classList.remove('broke'), 400);
  }

  // Called when a sandbox run starts, so the plate and the ring do not open
  // holding the previous run's numbers.
  resetSandboxMeters() {
    this._scoreShown = 0; this._scoreTextShown = -1; this._chainShown = -1;
    this._comboLevelShown = -1; this._comboLive = false;
    this._scoreLast = performance.now();
    this.comboMeter.classList.remove('live', 'step', 'broke');
    this.scoreValue.textContent = '0';
    this.comboChain.textContent = '0';
    this.comboMultEl.textContent = 'x1';
    this.comboArc.style.strokeDashoffset = CM_CIRCUM.toFixed(2);
    this._clearChannel('band'); this._clearChannel('toast'); this._clearChannel('pop');
    this._ann = null;
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
