// js/ui/tutorial.js — Cute, Just-in-Time Milestone Onboarding & Introductory Instruction System.
// Inspired by Hole.io, Donut County, and modern mobile casual arcade games.
// Follows strict ES module architecture and headless pure-sim boundary safety.

import { getDeviceInputMode, isTouchDevice } from '../device.js';

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

/**
 * Returns true if the milestone onboarding flow should run for this session.
 * @param {object} save
 * @param {string} scene
 * @returns {boolean}
 */
export function shouldShowTutorial(save, scene = 'gallery') {
  if (!save) return false;
  if (save.tutorialCompleted) return false;
  if (save.settings && save.settings.tutorialHints === false) return false;
  return scene === 'gallery';
}

/**
 * Interactive Just-In-Time Milestone Onboarding Manager.
 */
export class TutorialManager {
  constructor({ save, scene = 'gallery', onSave = null } = {}) {
    this.save = save || {};
    this.scene = scene;
    this.onSave = onSave;
    this.active = shouldShowTutorial(this.save, this.scene);
    this.milestoneCounts = {
      start: 0,
      size2: 0,
      combo4: 0,
      collapse: 0,
    };

    this.container = null;
    this.activeModal = null;
    this.startBubbleTimeout = null;

    if (this.active) {
      this._mountContainer();
      this.triggerStartBubble();
    }
  }

  isActive() {
    return this.active;
  }

  hasShown(milestone) {
    return (this.milestoneCounts[milestone] || 0) > 0;
  }

  _mountContainer() {
    if (typeof document === 'undefined') return;
    let c = document.getElementById('fw-tutorial-overlay');
    if (!c) {
      c = document.createElement('div');
      c.id = 'fw-tutorial-overlay';
      c.className = 'fw-tut-overlay';
      document.body.appendChild(c);
    }
    this.container = c;
  }

  triggerStartBubble() {
    this.milestoneCounts.start = (this.milestoneCounts.start || 0) + 1;
    if (typeof document === 'undefined' || !this.container) return;

    const isTouch = isTouchDevice();
    const bubble = document.createElement('div');
    bubble.className = 'fw-tut-bubble fw-tut-bubble--start animate-pop-bounce';
    bubble.innerHTML = `
      <div class="tut-sprocket-avatar">⚙️</div>
      <div class="tut-bubble-content">
        <div class="tut-bubble-title">START EATING BLOCKS!</div>
        <div class="tut-bubble-sub">${isTouch ? '👆 Drag with your thumb to steer & swallow small props' : '⌨️ Use WASD or Arrow Keys to steer into cones & trash'}</div>
      </div>
      <div class="tut-bouncy-arrow">⬇️</div>
    `;

    this.container.appendChild(bubble);

    // Auto-fade after 4.5 seconds
    this.startBubbleTimeout = setTimeout(() => {
      this._fadeBubble(bubble);
    }, 4500);
  }

  _fadeBubble(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('fading-out');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  onEat(prop) {
    if (!this.active) return;
    // Dismiss start bubble immediately on first swallow
    const startBubble = this.container?.querySelector('.fw-tut-bubble--start');
    if (startBubble) {
      if (this.startBubbleTimeout) clearTimeout(this.startBubbleTimeout);
      this._fadeBubble(startBubble);
    }
  }

  onSizeUp(newSize) {
    if (!this.active) return;
    if (newSize === 2 && !this.hasShown('size2')) {
      this.milestoneCounts.size2 = 1;
      this._showSize2Modal();
    }
  }

  _showSize2Modal() {
    if (typeof document === 'undefined' || !this.container) return;

    const modal = document.createElement('div');
    modal.className = 'fw-tut-modal fw-tut-modal--size2 animate-bounce-in';
    modal.innerHTML = `
      <div class="tut-modal-card">
        <div class="tut-celebrate-header">
          <span class="tut-confetti">🎉</span>
          <div class="tut-sprocket-badge">⚙️</div>
          <span class="tut-confetti">⭐</span>
        </div>
        <h2 class="tut-modal-title">YOU GREW TO SIZE 2!</h2>
        <div class="tut-growth-visual">
          <div class="tut-growth-step">
            <span class="step-icon">🗑️</span>
            <span class="step-label">Small Props</span>
          </div>
          <div class="tut-growth-arrow">➔</div>
          <div class="tut-growth-step tut-growth-step--unlocked">
            <span class="step-icon">🚗🌳</span>
            <span class="step-label">CARS & TREES UNLOCKED!</span>
          </div>
        </div>
        <p class="tut-modal-desc">
          Your hole diameter expanded! You can now swallow parked vehicles, street trees, and food trucks!
        </p>
        <button type="button" class="btn fw-cta tut-modal-btn" id="tut-size2-btn">LET'S EAT! ➔</button>
      </div>
    `;

    this.container.appendChild(modal);

    const btn = modal.querySelector('#tut-size2-btn');
    if (btn) {
      btn.onclick = () => {
        this._dismissModal(modal);
      };
    }

    // Auto-dismiss after 6 seconds if player is busy steering
    setTimeout(() => {
      this._dismissModal(modal);
    }, 6000);
  }

  onCombo(level) {
    if (!this.active) return;
    if (level >= 4 && !this.hasShown('combo4')) {
      this.milestoneCounts.combo4 = 1;
      this._showComboCallout();
    }
  }

  _showComboCallout() {
    if (typeof document === 'undefined' || !this.container) return;

    const callout = document.createElement('div');
    callout.className = 'fw-tut-bubble fw-tut-bubble--combo animate-pop-bounce';
    callout.innerHTML = `
      <div class="tut-combo-flame">🔥</div>
      <div class="tut-bubble-content">
        <div class="tut-bubble-title">4× COMBO MOMENTUM!</div>
        <div class="tut-bubble-sub">Eat props within <strong>1.5s</strong> of each other to multiply your score! At 8× you reach <strong>GODLIKE</strong> frenzy!</div>
      </div>
    `;

    this.container.appendChild(callout);
    setTimeout(() => {
      this._fadeBubble(callout);
    }, 4500);
  }

  onCollapse() {
    if (!this.active) return;
    if (!this.hasShown('collapse')) {
      this.milestoneCounts.collapse = 1;
      this._showCollapseCallout();
    }
  }

  _showCollapseCallout() {
    if (typeof document === 'undefined' || !this.container) return;

    const callout = document.createElement('div');
    callout.className = 'fw-tut-bubble fw-tut-bubble--collapse animate-pop-bounce';
    callout.innerHTML = `
      <div class="tut-collapse-icon">🏗️</div>
      <div class="tut-bubble-content">
        <div class="tut-bubble-title">TIMBERRR! FOUNDATION COLLAPSE!</div>
        <div class="tut-bubble-sub">Break ground pillars under buildings to crumble entire towers into bite-sized snacks!</div>
      </div>
    `;

    this.container.appendChild(callout);
    setTimeout(() => {
      this._fadeBubble(callout);
    }, 4500);
  }

  onPowerUpSpawn() {
    // Handled by existing map beacons and anime impact screens
  }

  onPowerUpCollected() {
    // Handled by existing anime impact screens
  }

  _dismissModal(modal) {
    if (!modal || !modal.parentNode) return;
    modal.classList.add('fading-out');
    setTimeout(() => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }, 300);

    // If size2 is completed, mark onboarding done
    if (this.hasShown('size2')) {
      this._complete();
    }
  }

  _complete() {
    this.active = false;
    this.save.tutorialCompleted = true;
    if (this.onSave) this.onSave(this.save);
    this.teardown();
  }

  skip() {
    this._complete();
  }

  teardown() {
    if (this.startBubbleTimeout) clearTimeout(this.startBubbleTimeout);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}
