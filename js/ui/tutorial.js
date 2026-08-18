// js/ui/tutorial.js — Interactive Step-by-Step Walkthrough & Onboarding System.
// Pure state machine + DOM Coachmark renderer. Follows strict ES module architecture.

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: 'steer_props',
    stepNum: 1,
    badge: 'STEP 1 OF 5 · STEERING & PROPS',
    icon: '🕹️',
    title: 'STEER & EAT SMALL PROPS',
    instruction: 'Use WASD / Arrow keys (or drag on touch) to steer into small traffic cones, hydrants, and trash cans!',
    hint: 'Start with small props in the snack ring around you.',
    reqEats: 3,
  },
  {
    id: 'size_growth',
    stepNum: 2,
    badge: 'STEP 2 OF 5 · MASS & SIZE TIERS',
    icon: '📈',
    title: 'YOU GREW TO SIZE 2!',
    instruction: 'Your Mass Bar (top center) filled up! You can now swallow larger objects like parked cars, trees, and dumpsters.',
    hint: 'Your hole expands automatically as you swallow mass.',
    reqSize: 2,
  },
  {
    id: 'combo_chain',
    stepNum: 3,
    badge: 'STEP 3 OF 5 · COMBO MULTIPLIER',
    icon: '🔥',
    title: 'COMBO MOMENTUM',
    instruction: 'Eat props within 1.5s of each other to build your Combo Multiplier up to 8× and supercharge your score!',
    hint: 'Keep moving rapidly between props to maintain the chain.',
    reqCombo: 3,
  },
  {
    id: 'topple_buildings',
    stepNum: 4,
    badge: 'STEP 4 OF 5 · STRUCTURAL PHYSICS',
    icon: '🏗️',
    title: 'TOPPLE GIANT BUILDINGS',
    instruction: 'Eat ground pillars and foundation walls under buildings. The upper floors will crumble down into edible rubble!',
    hint: 'Ingest supports to trigger structural collapse waves.',
    reqSize: 3,
  },
  {
    id: 'powerup_beacons',
    stepNum: 5,
    badge: 'STEP 5 OF 5 · POWER-UP BEACONS',
    icon: '⚡',
    title: 'POWER-UP BEACONS (0 PENALTIES)',
    instruction: 'Orbital beacons drop every ~30–45s! Drive into the vertical light beam for powerful boosts with ZERO penalties!',
    hint: 'Magnetron, Chrono Freeze, Titan, and Speed boost your run.',
  },
]);

export const CONTEXTUAL_HINTS = Object.freeze({
  too_big: {
    icon: '⚠️',
    title: 'TOO BIG TO SWALLOW!',
    text: 'You need a larger hole radius to eat this. Grow your size first by eating smaller objects around the city.',
  },
  powerup_magnet: {
    icon: '🧲',
    title: 'MAGNETRON AURA',
    desc: 'Vacuum pull attracts all nearby props directly into your hole!',
  },
  powerup_freeze: {
    icon: '⏱️',
    title: 'CHRONO FREEZE',
    desc: 'Match clock & rival holes are frozen for 10 seconds!',
  },
  powerup_speed: {
    icon: '⚡',
    title: 'SPEED OVERDRIVE',
    desc: 'Top velocity & steering acceleration doubled!',
  },
  powerup_titan: {
    icon: '🦖',
    title: 'TITAN VORTEX',
    desc: 'Super-size activation! Ingest colossal structures above your tier!',
  },
  powerup_quake: {
    icon: '💥',
    title: 'MEGA QUAKE',
    desc: 'Seismic shockwave shatters building roofs into edible rubble!',
  },
});

export function getTutorialStepDef(id) {
  return TUTORIAL_STEPS.find((s) => s.id === id) || null;
}

export function shouldShowTutorial(save, scene = 'gallery') {
  if (!save) return false;
  if (save.settings && save.settings.tutorialHints === false) return false;
  if (save.tutorialCompleted) return false;
  // Primary walkthrough is anchored to the prologue / starter proving ground
  return scene === 'gallery' || scene === 'level-1';
}

export class TutorialManager {
  constructor({ save, scene = 'gallery', onSave = null } = {}) {
    this.save = save || {};
    this.scene = scene;
    this.onSave = onSave;
    this.currentStepIndex = 0;
    this.active = shouldShowTutorial(this.save, this.scene);
    this.propsEaten = 0;
    this.maxCombo = 0;
    this.collapseCount = 0;
    this.el = null;
    this._dismissTimer = null;

    if (this.active && typeof document !== 'undefined') {
      this.mount();
    }
  }

  get currentStep() {
    return TUTORIAL_STEPS[this.currentStepIndex] || null;
  }

  isActive() {
    return this.active;
  }

  mount() {
    if (typeof document === 'undefined') return;
    this.unmount();

    const container = document.createElement('div');
    container.id = 'fw-tutorial-coachmark';
    container.className = 'fw-tutorial-coachmark fw-tutorial-slide-in';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');

    container.innerHTML = `
      <div class="tut-glow"></div>
      <div class="tut-inner">
        <div class="tut-header">
          <div class="tut-badge-wrap">
            <span class="tut-icon"></span>
            <span class="tut-badge"></span>
          </div>
          <button type="button" class="tut-skip-btn" aria-label="Skip Tutorial">SKIP ✕</button>
        </div>
        <div class="tut-body">
          <div class="tut-title"></div>
          <div class="tut-instruction"></div>
        </div>
        <div class="tut-footer">
          <div class="tut-hint"></div>
          <button type="button" class="tut-next-btn">GOT IT ➔</button>
        </div>
      </div>
    `;

    const skipBtn = container.querySelector('.tut-skip-btn');
    if (skipBtn) {
      skipBtn.onclick = (e) => {
        e.stopPropagation();
        this.skip();
      };
    }

    const nextBtn = container.querySelector('.tut-next-btn');
    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.stopPropagation();
        this.advance();
      };
    }

    document.body.appendChild(container);
    this.el = container;
    this.render();
  }

  unmount() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    clearTimeout(this._dismissTimer);
  }

  render() {
    if (!this.el || !this.active) return;
    const step = this.currentStep;
    if (!step) {
      this.complete();
      return;
    }

    const iconEl = this.el.querySelector('.tut-icon');
    const badgeEl = this.el.querySelector('.tut-badge');
    const titleEl = this.el.querySelector('.tut-title');
    const instEl = this.el.querySelector('.tut-instruction');
    const hintEl = this.el.querySelector('.tut-hint');

    if (iconEl) iconEl.textContent = step.icon;
    if (badgeEl) badgeEl.textContent = step.badge;
    if (titleEl) titleEl.textContent = step.title;
    if (instEl) instEl.textContent = step.instruction;
    if (hintEl) hintEl.textContent = step.hint || '';

    this.el.classList.remove('tut-pulse');
    void this.el.offsetWidth; // trigger reflow
    this.el.classList.add('tut-pulse');
  }

  advance() {
    if (!this.active) return;
    this.currentStepIndex++;
    if (this.currentStepIndex >= TUTORIAL_STEPS.length) {
      this.complete();
    } else {
      this.render();
    }
  }

  onEat(obj) {
    if (!this.active) return;
    if (this.currentStepIndex === 0) {
      this.propsEaten++;
      if (this.propsEaten >= (TUTORIAL_STEPS[0].reqEats || 3)) {
        this.advance();
      }
    }
  }

  onSizeUp(newSize) {
    if (!this.active) return;
    if (this.currentStepIndex === 1 && newSize >= 2) {
      this.advance();
    } else if (this.currentStepIndex === 3 && newSize >= 3) {
      this.advance();
    }
  }

  onCombo(chain) {
    if (!this.active) return;
    if (chain > this.maxCombo) this.maxCombo = chain;
    if (this.currentStepIndex === 2 && chain >= 3) {
      this.advance();
    }
  }

  onCollapse() {
    if (!this.active) return;
    this.collapseCount++;
    if (this.currentStepIndex === 3) {
      this.advance();
    }
  }

  onPowerUpSpawn(type) {
    if (!this.active) return;
    if (this.currentStepIndex === 4) {
      this.render();
    }
  }

  onPowerUpCollected(type) {
    if (!this.active) return;
    if (this.currentStepIndex === 4) {
      this.complete();
    }
  }

  complete() {
    this.active = false;
    this.save.tutorialCompleted = true;
    if (typeof this.onSave === 'function') {
      this.onSave(this.save);
    }
    if (this.el) {
      this.el.classList.add('tut-out');
      this._dismissTimer = setTimeout(() => this.unmount(), 400);
    }
  }

  skip() {
    this.complete();
  }
}
