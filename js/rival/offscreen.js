// Off-screen rival indicator (pattern 4): an edge chevron in the rival's
// color, sized by their mass, extending the shipped directional-indicator
// vocabulary (commit 552f290) rather than inventing a second pointer system.
//
// `edgeProject` is the pure half (AC-04.1, headless-tested at the
// camera-matrix level): NDC in, screen-edge placement out. The visibility
// boundary carries hysteresis (CHEVRON_EDGE_EPS) so the chevron cannot
// flicker as a rival crosses the frustum edge (AC-04.3).
//
// ChevronLayer is the DOM half. Allocation-free on the frame path (AC-04.5):
// one reusable projection vector lives in the caller; this class writes
// transform strings only when the rounded position/size actually changed.

import { slotColorCss } from './identity.js';
import { RIVAL } from './constants.js';

/**
 * Place an off-screen point's chevron on the screen edge nearest it.
 *
 * @param {number} ndcX @param {number} ndcY  the point in NDC (camera.project)
 * @param {number} w @param {number} h        viewport size in px
 * @param {number} inset                      px inside the edge
 * @param {boolean} wasOffscreen              last verdict, for hysteresis
 * @returns {{x:number,y:number,angle:number,offscreen:boolean}}
 *   angle in radians, 0 = pointing screen-right, positive = clockwise (CSS).
 */
export function edgeProject(ndcX, ndcY, w, h, inset = RIVAL.CHEVRON_INSET_PX, wasOffscreen = false) {
  // Hysteresis: to BECOME off-screen the point must clear the edge by EPS; to
  // come back it only has to re-enter the frame. No flicker at the boundary.
  const lim = wasOffscreen ? 1 : 1 + RIVAL.CHEVRON_EDGE_EPS;
  const offscreen = Math.abs(ndcX) > lim || Math.abs(ndcY) > lim;
  let sx = ((ndcX + 1) / 2) * w;
  let sy = ((1 - ndcY) / 2) * h;
  if (!offscreen) return { x: sx, y: sy, angle: 0, offscreen: false };

  const cx = w / 2, cy = h / 2;
  const dx = sx - cx, dy = sy - cy;
  const kx = dx !== 0 ? (cx - inset) / Math.abs(dx) : Infinity;
  const ky = dy !== 0 ? (cy - inset) / Math.abs(dy) : Infinity;
  const k = Math.min(kx, ky);
  return {
    x: cx + dx * k,
    y: cy + dy * k,
    angle: Math.atan2(dy, dx),
    offscreen: true,
  };
}

/** Chevron size in px for a rival's mass (linear, clamped — AC-04.2). */
export function chevronSize(mass) {
  const t = Math.max(0, Math.min(1, (mass || 0) / RIVAL.CHEVRON_MASS_FULL));
  return Math.round(RIVAL.CHEVRON_MIN_PX + (RIVAL.CHEVRON_MAX_PX - RIVAL.CHEVRON_MIN_PX) * t);
}

export class ChevronLayer {
  /** @param {HTMLElement} container  fixed, full-screen, pointer-events none */
  constructor(container) {
    this.container = container;
    this.bySlot = new Map();
  }

  /** Create (once) the chevron for a slot. Label is the redundant channel. */
  ensure(slot, label) {
    let c = this.bySlot.get(slot);
    if (c) return c;
    const root = document.createElement('div');
    root.className = 'chev';
    const arrow = document.createElement('div');
    arrow.className = 'chev-arrow';
    arrow.style.borderLeftColor = slotColorCss(slot);
    const tag = document.createElement('div');
    tag.className = 'chev-tag';
    tag.style.color = slotColorCss(slot);
    tag.textContent = label || '';
    root.appendChild(arrow);
    root.appendChild(tag);
    this.container.appendChild(root);
    c = { root, arrow, tag, visible: false, offscreen: false, lastKey: '' };
    this.bySlot.set(slot, c);
    return c;
  }

  /**
   * Per-frame update for one slot. `proj` from edgeProject; `sizePx` from
   * chevronSize. Writes styles only on change.
   */
  update(slot, proj, sizePx) {
    const c = this.bySlot.get(slot);
    if (!c) return;
    c.offscreen = proj.offscreen;
    if (!proj.offscreen) {
      if (c.visible) { c.root.style.display = 'none'; c.visible = false; }
      return;
    }
    if (!c.visible) { c.root.style.display = 'block'; c.visible = true; }
    const x = Math.round(proj.x), y = Math.round(proj.y);
    const deg = Math.round(proj.angle * (180 / Math.PI));
    const key = x + '|' + y + '|' + deg + '|' + sizePx;
    if (key === c.lastKey) return;
    c.lastKey = key;
    c.root.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    c.arrow.style.transform = 'translate(-50%,-50%) rotate(' + deg + 'deg)';
    c.arrow.style.borderTopWidth = c.arrow.style.borderBottomWidth = (sizePx / 2) + 'px';
    c.arrow.style.borderLeftWidth = sizePx + 'px';
  }

  /** Last off-screen verdict for a slot — feeds edgeProject's hysteresis. */
  wasOffscreen(slot) {
    const c = this.bySlot.get(slot);
    return c ? c.offscreen : false;
  }
}
