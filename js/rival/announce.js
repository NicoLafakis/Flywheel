// The arena page's announcement channel — ONE element, one speaker at a time,
// priority-ordered, exactly the queue discipline js/ui/hud.js established for
// the campaign HUD (score-combo-and-hype FR-019). The arena page does not load
// the campaign HUD, so this is that discipline's arena instance, NOT a second
// toast system layered over an existing one (AC-05.3): every callout on the
// page flows through this queue or it does not appear.
//
// Reduced motion is inherited from the shipped rule: with
// prefers-reduced-motion, callouts fade without the pop transform.

export class AnnounceQueue {
  /** @param {HTMLElement} el  the one callout element (page-styled `.callout`) */
  constructor(el) {
    this.el = el;
    this.queue = [];        // pending, highest priority first
    this.current = null;
    this._timer = 0;
    this.reduced = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reduced) el.classList.add('reduced');
  }

  /**
   * @param {object} a { text, color, priority = 0, ms = 2000, source = 'beat' }
   * A higher-priority arrival preempts the current callout; equal or lower
   * waits its turn. The queue holds at most 2 — beats are rare by design, and
   * a backlog of stale news is worse than dropping it.
   */
  say(a) {
    if (this.current && a.priority > this.current.priority) {
      this._show(a);
      return;
    }
    if (!this.current) { this._show(a); return; }
    this.queue.push(a);
    this.queue.sort((x, y) => y.priority - x.priority);
    if (this.queue.length > 2) this.queue.length = 2;
  }

  _show(a) {
    this.current = a;
    clearTimeout(this._timer);
    this.el.textContent = a.text;
    this.el.style.color = a.color || '';
    // Restart the pop animation: force a reflow between class toggles.
    this.el.classList.remove('on');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this._timer = setTimeout(() => this._next(), a.ms || 2000);
  }

  _next() {
    this.el.classList.remove('on');
    this.current = null;
    const n = this.queue.shift();
    if (n) this._timer = setTimeout(() => this._show(n), 180);
  }

  clear() {
    clearTimeout(this._timer);
    this.queue.length = 0;
    this.current = null;
    this.el.classList.remove('on');
  }
}
