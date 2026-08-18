// js/device.js — Centralized device and input detection.
// Pure ES module with no external dependencies; safe to run in both browser and Node test harnesses.

/**
 * Returns true if the active client device relies primarily on touch input
 * (e.g. mobile phone, tablet, coarse pointer device).
 * @returns {boolean}
 */
export function isTouchDevice() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches) {
      return true;
    }
  } catch (e) { /* ignore */ }

  try {
    if (typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) {
      return true;
    }
  } catch (e) { /* ignore */ }

  try {
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
      return true;
    }
  } catch (e) { /* ignore */ }

  return false;
}

/**
 * Returns the current input mode: 'touch' or 'keyboard'.
 * @returns {'touch' | 'keyboard'}
 */
export function getDeviceInputMode() {
  return isTouchDevice() ? 'touch' : 'keyboard';
}
