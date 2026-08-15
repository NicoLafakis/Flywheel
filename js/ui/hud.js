// HUD: mass bar, timer, combo, level banner, minimap, toasts.

import {
  COMBO_WINDOW, COMBO_MAX_LEVEL, COMBO_LEVEL_NAMES, comboLevel, RANKED_TICK_COUNT,
} from '../voxelsim.js';
import { LEVEL_CLOCK_URGENT_SECONDS, LEVEL_CLOCK_WARN_SECONDS, formatClock } from '../levelclock.js';
import { comboMultiplier as campaignComboMult } from '../sim.js';
import { POWERUP_TYPES, hasActivePowerUp } from '../powerups.js';

// The arc's circumference at r=42, matching css/main.css's stroke-dasharray.
const CM_CIRCUM = 2 * Math.PI * 42;

// Announcement priorities. One scale, so a future reward system arrives through
// the same door with a rank instead of a new channel (SYS-605).
// CLOCK sits above MILESTONE and below GOAL on purpose: "10 seconds left" must
// not be buried under a consumption phrase, but nothing outranks the run ending.
export const ANN = { COIN: 10, COMBO: 30, SIZE: 50, MILESTONE: 70, CLOCK: 80, GOAL: 90 };

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.banner = document.getElementById('level-banner');
    this.massBar = document.getElementById('mass-bar');
    this.massLabel = document.getElementById('mass-label');
    this.comboLabel = document.getElementById('combo-label');
    this.timer = document.getElementById('timer');
    this.levelClock = document.getElementById('level-clock');
    // Last rendered clock text and state, so the countdown touches the DOM once
    // per second rather than once per frame — the same caching idiom the score
    // plate and the combo readout already use.
    this._clockTextShown = null;
    this._clockStateShown = null;
    this.toast = document.getElementById('toast');
    this.bigPop = document.getElementById('big-pop');
    this.minimap = document.getElementById('minimap');
    this.minimapWrap = document.getElementById('minimap-wrap');
    this.mctx = this.minimap.getContext('2d');
    this.toastTimer = null;
    this._minimapShown = null; // no mode has declared itself yet

    // --- active powerups UI layer ---
    this.powerupBadges = document.getElementById('active-powerups');
    this._powerupPills = new Map();

    // --- sandbox reward layer -------------------------------------------------
    this.scorePlate = document.getElementById('score-plate');
    this.scoreValue = document.getElementById('score-value');
    this.comboMeter = document.getElementById('combo-meter');
    this.comboArc = this.comboMeter ? this.comboMeter.querySelector('.cm-arc') : null;
    this.comboChain = document.getElementById('cm-chain');
    this.comboMultEl = document.getElementById('cm-mult');
    this.comboBurst = document.getElementById('cm-burst');
    this.comboBurstMult = document.getElementById('cm-burst-mult');
    this.comboBurstSub = document.getElementById('cm-burst-sub');
    this._comboBurstTimer = null;

    this.bigPop = document.getElementById('big-pop');
    this.bigPopText = document.getElementById('big-pop-text');
    this.bigPopSub = document.getElementById('big-pop-sub');
    this._bigPopTimer = null;

    this.band = document.getElementById('hype-band');
    this.bandText = document.getElementById('hype-text');
    this.bandSub = document.getElementById('hype-sub');

    this.blocksLeftPill = document.getElementById('blocks-left-pill');
    this.blocksLeftText = document.getElementById('blocks-left-text');

    this.chronoOverlay = document.getElementById('chrono-freeze-overlay');
    this.vortexOverlay = document.getElementById('vortex-suction-overlay');
    this.titanOverlay = document.getElementById('titan-surge-overlay');
    this.speedOverlay = document.getElementById('speed-frenzy-overlay');
    this.chainOverlay = document.getElementById('chain-frenzy-overlay');
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
  // Takes text, sub, a tier, a priority and a source (FR-019). Three rules:
  //   - a higher priority takes the channel immediately;
  //   - a lower one never truncates a higher one already showing;
  //   - repeats from the same source coalesce in place rather than stacking,
  //     so the player never watches a backlog drain.
  announce({ text, sub = '', source, priority = 0, ms = 2000, channel = 'band', tier = 'hype' }) {
    const now = performance.now();
    const live = this._ann && this._ann.until > now ? this._ann : null;
    if (live && live.priority > priority) return false;
    if (live && live.source === source && live.channel === channel) {
      // Coalesce: same speaker, same channel — rewrite in place, extend once.
      this._present(channel, text, tier, /* restart */ false, sub);
      this._arm(priority, source, channel, ms, now);
      return true;
    }
    if (live) this._clearChannel(live.channel);
    this._present(channel, text, tier, true, sub);
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
    else if (channel === 'pop') { clearTimeout(this._bigPopTimer); if (this.bigPop) this.bigPop.classList.add('hidden'); }
    else if (channel === 'cm_burst') { clearTimeout(this._comboBurstTimer); if (this.comboBurst) this.comboBurst.classList.add('hidden'); }
    else if (channel === 'band') { this.band.classList.add('hidden'); this.band.classList.remove('show'); }
  }

  _present(channel, text, tier, restart, sub = '') {
    if (channel === 'toast') this.showToast(text, 1e9);       // the queue owns the timing
    else if (channel === 'pop') this.showBigPop(text, sub);
    else if (channel === 'cm_burst') this.showComboBurst(text, sub, tier);
    else if (channel === 'band') this.showBand(text, tier, restart, sub);
  }

  // Full-width anime consumption & combo battle band.
  // One persistent element, restarted rather than recreated.
  showBand(text, tier = 'hype', restart = true, sub = '') {
    const el = this.band;
    this.bandText.textContent = text;
    if (this.bandSub) {
      if (sub) {
        this.bandSub.textContent = sub;
        this.bandSub.classList.remove('hidden');
      } else {
        this.bandSub.textContent = '';
        this.bandSub.classList.add('hidden');
      }
    }
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
    this.banner.textContent = level.index === 'SANDBOX' ? `✦ ${metroName} · SANDBOX ✦` : `LEVEL ${level.index} · ${metroName}`;
  }

  showToast(text, ms = 2200) {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), ms);
  }

  // Center-screen celebration pop ("SIZE 2!") — CSS animation does the show.
  showBigPop(text, sub = '✦ EXPANDING VORTEX ✦') {
    const el = this.bigPop;
    if (!el) return;
    if (this.bigPopText) {
      this.bigPopText.textContent = text;
      if (this.bigPopSub) this.bigPopSub.textContent = sub;
    } else {
      el.textContent = text;
    }
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth; // restart the animation on repeat triggers
    el.style.animation = '';
    clearTimeout(this._bigPopTimer);
    this._bigPopTimer = setTimeout(() => el.classList.add('hidden'), 1250);
  }

  // Anime Combo Burst over the combo meter widget (+20% diameter)
  showComboBurst(multText, subText = 'COMBO!', level = 1) {
    const el = this.comboBurst;
    if (!el) return;
    const numLevel = typeof level === 'number' ? level : 1;
    let color = '#ffd23f';
    let glow = 'rgba(255, 210, 63, 0.85)';
    if (numLevel >= 8) {
      color = '#00e5ff';
      glow = 'rgba(0, 229, 255, 0.95)';
    } else if (numLevel >= 6) {
      color = '#ff2a2a';
      glow = 'rgba(255, 42, 42, 0.9)';
    } else if (numLevel >= 4) {
      color = '#ff9f1c';
      glow = 'rgba(255, 159, 28, 0.85)';
    }

    el.style.setProperty('--cm-burst-color', color);
    el.style.setProperty('--cm-burst-glow', glow);
    if (this.comboBurstMult) this.comboBurstMult.textContent = multText;
    if (this.comboBurstSub) this.comboBurstSub.textContent = subText;

    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._comboBurstTimer);
    this._comboBurstTimer = setTimeout(() => el.classList.add('hidden'), 1100);
  }

  update(sim) {
    const p = sim.player;
    const frac = Math.min(1, p.mass / sim.level.target);
    this.massBar.style.width = `${(frac * 100).toFixed(1)}%`;
    this.massLabel.textContent = `${Math.floor(p.mass)} / ${sim.level.target} collected`;
    this._updateClock(sim.timeLeft);
    this.timer.classList.add('hidden');
    if (p.chain >= 2) {
      this.comboLabel.classList.remove('hidden');
      this.comboLabel.textContent = `CHAIN ${p.chain} · x${campaignComboMult(p.chain).toFixed(1)}`;
    } else {
      this.comboLabel.classList.add('hidden');
    }
    this._updatePowerUps(sim.activePowerUps);
    this._updateScreenHeat(p.chain, sim.activePowerUps);
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
    // The target is only worth printing when it is NOT the whole city. At
    // targetFraction 1.0 "CLEARED 4% / 100% OF THE CITY" states its denominator
    // twice — the sentence already ends in "OF THE CITY". Computed rather than
    // deleted so the line still reads correctly if a scene is ever given a
    // partial goal again (R-2.5 keeps that a one-constant change).
    const goalPct = Math.round(sim.goal.targetFraction * 100);
    const targetSuffix = goalPct >= 100 ? '' : ` / ${goalPct}%`;
    // `sim.won`, NOT a second `cleared >= targetFraction` comparison here. That
    // comparison was safe while cities sat at 0.5 and half a city of slack hid
    // the float shortfall; at targetFraction 1.0 it is the exact expression the
    // sim needs a 1e-9 epsilon for (see the win check in js/voxelsim.js), so a
    // real full clear would land on 0.9999999999 and the HUD would sit on
    // "CLEARED 99%" forever while the sim had already awarded the goal. One
    // latch, read by both.
    this.massLabel.textContent = sim.won
      ? `${sim.goal.name} · GOAL REACHED · SIZE ${h.size}`
      : `CLEARED ${Math.floor(cleared * 100)}%${targetSuffix} OF THE CITY · SIZE ${h.size}`;
    this.massBar.style.width = `${(cleared * 100).toFixed(1)}%`;
    // No "+2" suffix: the per-coin value read as an unexplained orphan on the
    // HUD; the payout is explained on the results screen where the math lives.
    this.timer.textContent = `🪙 ${sim.coinsCollected}/${sim.coins.length}`;
    this.timer.classList.remove('low');
    // THE RUN's countdown belongs in the countdown pill, not in this one (T-504).
    // It used to overwrite #timer, which index.html's own comment says cannot be
    // both ("one element cannot be both without one of them disappearing") — and
    // the thing that disappeared was the coin readout, for the whole of the one
    // mode whose length is a decision of record. Meanwhile #level-clock sat
    // hidden, because `sim.timeLeft` is null in run90, so the run's clock was
    // rendered in a pill with no endgame states while the pill that has them was
    // switched off. One countdown, one element, every mode.
    //
    // Derived from RANKED_TICK_COUNT rather than a literal 90: the ranked length
    // is ADR-0016's decision of record and the HUD must not hold a second copy
    // of it, for the same reason the level clock reads LEVEL_CLOCK_SECONDS.
    let clockSeconds = sim.timeLeft;
    if (sim.mode === 'run90') {
      clockSeconds = Math.max(0, (RANKED_TICK_COUNT - sim.rankedTicks) / 60);
      this.massLabel.textContent = `THE RUN · SIZE ${h.size} · ${Math.floor(cleared * 100)}% OF CHICAGO`;
    }
    // The old sandbox combo pill printed `⚡ COMBO x{floor((chain-1)/25)+1}` —
    // a LEVEL INDEX in multiplier notation, which read x2 at chain 26 while the
    // sim awarded 1.1. It is replaced outright by the ring below, which reads
    // the sim's own exported ladder. The pill stays hidden in the sandbox.
    this.comboLabel.classList.add('hidden');
    this._updateClock(clockSeconds);
    this._updateScore(h.mass);
    this._updateCombo(h);
    this._updatePowerUps(h.activePowerUps);
    this._updateScreenHeat(h.chain, h.activePowerUps || sim.activePowerUps);

    // Endgame remaining blocks counter (displays when <= 100 blocks remain or <= 30s left)
    const standingBlocks = sim.remainingBlocksCount != null
      ? sim.remainingBlocksCount
      : (sim.blocks ? sim.blocks.filter((b) => b.state !== 'eaten' && b.state !== 'consumed').length : 0);
    
    if (this.blocksLeftPill) {
      if (!sim.won && standingBlocks > 0 && (standingBlocks <= 100 || (clockSeconds != null && clockSeconds <= 30))) {
        this.blocksLeftPill.classList.remove('hidden');
        if (this.blocksLeftText) {
          this.blocksLeftText.textContent = `${standingBlocks} BLOCKS LEFT`;
        }
      } else {
        this.blocksLeftPill.classList.add('hidden');
      }
    }
  }

  _updateScreenHeat(chain, activeList) {
    if (!this._appEl) this._appEl = document.getElementById('app');
    if (!this._appEl) return;

    const isVortex = hasActivePowerUp(activeList, POWERUP_TYPES.VORTEX);
    const isTitan = hasActivePowerUp(activeList, POWERUP_TYPES.TITAN);
    const isFrenzy = hasActivePowerUp(activeList, POWERUP_TYPES.FRENZY);
    const isSpeed = hasActivePowerUp(activeList, POWERUP_TYPES.SPEED);
    const isChrono = hasActivePowerUp(activeList, POWERUP_TYPES.CHRONO);

    this._appEl.classList.toggle('pu-vortex-active', isVortex);
    this._appEl.classList.toggle('pu-titan-active', isTitan);
    this._appEl.classList.toggle('pu-frenzy-active', isFrenzy);
    this._appEl.classList.toggle('pu-speed-active', isSpeed);

    if (this.chronoOverlay) this.chronoOverlay.classList.toggle('hidden', !isChrono);
    if (this.vortexOverlay) this.vortexOverlay.classList.toggle('hidden', !isVortex);
    if (this.titanOverlay) this.titanOverlay.classList.toggle('hidden', !isTitan);
    if (this.speedOverlay) this.speedOverlay.classList.toggle('hidden', !isSpeed);
    if (this.chainOverlay) this.chainOverlay.classList.toggle('hidden', !isFrenzy);
  }

  _updatePowerUps(activeList) {
    if (!this.powerupBadges) return;
    const activeMap = new Map();
    for (const act of activeList || []) {
      if (act && act.type) activeMap.set(act.type, act);
    }

    // 1. Update or create persistent pills for active power-ups
    for (const [type, act] of activeMap.entries()) {
      const spec = act.spec || {};
      const pct = Math.max(0, Math.min(100, (act.remaining / (act.duration || 1)) * 100));
      const secs = Math.ceil(act.remaining);
      const isExpiring = act.remaining <= 3.0;

      let pillEntry = this._powerupPills.get(type);
      if (!pillEntry) {
        const colorHex = '#' + (spec.color || 0x00d2ff).toString(16).padStart(6, '0');
        const glowHex = '#' + (spec.glowColor || 0x0055ff).toString(16).padStart(6, '0');

        const el = document.createElement('div');
        el.className = 'powerup-pill flyout-in';
        el.style.setProperty('--pu-color', colorHex);
        el.style.setProperty('--pu-border', colorHex);
        el.style.setProperty('--pu-glow', glowHex);

        el.innerHTML = `
          <span class="pu-icon">${spec.icon || '⚡'}</span>
          <div class="pu-details">
            <div class="pu-name-row">
              <span class="pu-name-text">${spec.name || 'POWER-UP'}</span>
              <span class="pu-timer">${secs}s</span>
            </div>
            <div class="pu-bar-bg">
              <div class="pu-bar-fill" style="width: ${pct.toFixed(1)}%;"></div>
            </div>
          </div>
        `;

        this.powerupBadges.appendChild(el);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (el) el.classList.remove('flyout-in');
          });
        });

        pillEntry = {
          el,
          timerEl: el.querySelector('.pu-timer'),
          barFillEl: el.querySelector('.pu-bar-fill'),
          isExiting: false,
        };
        this._powerupPills.set(type, pillEntry);
      } else if (!pillEntry.isExiting) {
        if (pillEntry.timerEl) pillEntry.timerEl.textContent = `${secs}s`;
        if (pillEntry.barFillEl) pillEntry.barFillEl.style.width = `${pct.toFixed(1)}%`;
        pillEntry.el.classList.toggle('is-expiring', isExpiring);
      }
    }

    // 2. Slide out and remove pills for power-ups that have ended
    for (const [type, pillEntry] of this._powerupPills.entries()) {
      if (!activeMap.has(type) && !pillEntry.isExiting) {
        pillEntry.isExiting = true;
        pillEntry.el.classList.remove('is-expiring');
        pillEntry.el.classList.add('flyout-out');
        setTimeout(() => {
          if (pillEntry.el && pillEntry.el.parentNode) {
            pillEntry.el.parentNode.removeChild(pillEntry.el);
          }
          this._powerupPills.delete(type);
        }, 320);
      }
    }
  }

  // The countdown pill, and the ONLY countdown in the sandbox HUD (T-504).
  // `seconds` is derived from a TICK COUNT — `sim.timeLeft` in free play,
  // `RANKED_TICK_COUNT - rankedTicks` in THE RUN — so the readout is SIM time
  // and cannot drift from the tick the run actually ends on; a HUD counting
  // wall-clock seconds would show 0:00 while the sim kept running on a slow
  // device. `null` means the mode has no countdown at all (the campaign, which
  // keeps its own in #timer), and the pill goes away rather than showing a zero.
  _updateClock(seconds) {
    if (seconds === null || seconds === undefined) {
      if (this._clockStateShown !== 'off') {
        this._clockStateShown = 'off';
        this.levelClock.classList.add('hidden');
      }
      return;
    }
    const text = formatClock(seconds);
    if (text !== this._clockTextShown) {
      this._clockTextShown = text;
      this.levelClock.textContent = text;
    }
    // Thresholds come from js/levelclock.js — the same numbers the sim fires its
    // endgame events on, so the pill can never change state on a different
    // second from the cue.
    const state = seconds <= LEVEL_CLOCK_URGENT_SECONDS ? 'urgent'
      : seconds <= LEVEL_CLOCK_WARN_SECONDS ? 'warn' : 'normal';
    if (state !== this._clockStateShown) {
      this._clockStateShown = state;
      this.levelClock.classList.remove('hidden');
      this.levelClock.classList.toggle('warn', state === 'warn');
      this.levelClock.classList.toggle('urgent', state === 'urgent');
    }
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
      // One expression for every rung including the top. The old code branched
      // at COMBO_MAX_LEVEL to print the word `MAX` instead of the number, so x8
      // — the actual ceiling — was never shown to anyone (T-311). The summit
      // now reads as the summit through a STATE on the ring rather than through
      // a label, because the chain count beside it keeps climbing forever and a
      // label saying "stopped" over a climbing number is what made the ceiling
      // unreadable in the first place.
      this.comboMultEl.textContent = COMBO_LEVEL_NAMES[level];
      this.comboMeter.classList.toggle('topped', level >= COMBO_MAX_LEVEL);
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
    // The clock too, or a RESTART inherits the previous run's endgame state and
    // opens on a red 0:00 until the first frame writes over it.
    this._clockTextShown = null; this._clockStateShown = null;
    this.levelClock.classList.remove('warn', 'urgent');
    this.levelClock.classList.add('hidden');
    this._scoreLast = performance.now();
    this.comboMeter.classList.remove('live', 'step', 'broke');
    this.scoreValue.textContent = '0';
    this.comboChain.textContent = '0';
    this.comboMultEl.textContent = 'x1';
    this.comboArc.style.strokeDashoffset = CM_CIRCUM.toFixed(2);
    this._clearChannel('band'); this._clearChannel('toast'); this._clearChannel('pop');
    this._ann = null;
    this._updatePowerUps([]);
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
