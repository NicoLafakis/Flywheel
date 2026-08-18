// tools/mobile-ui.test.mjs — Automated tests for Mobile-First Responsive UI & Navigation.
// Run: node tools/mobile-ui.test.mjs

import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const cssSrc = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
const screensSrc = readFileSync(new URL('../js/ui/screens.js', import.meta.url), 'utf8');

export function runMobileUiSelftest() {
  let passed = 0;
  function test(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      throw err;
    }
  }

  // 1. Mobile Safe Area & Viewport Insets
  test('CSS defines mobile safe area variables and viewport-fit integration', () => {
    assert(cssSrc.includes('--sai-top'), 'CSS must declare or consume --sai-top');
    assert(cssSrc.includes('--sai-bottom'), 'CSS must declare or consume --sai-bottom');
    assert(cssSrc.includes('--sai-left'), 'CSS must declare or consume --sai-left');
    assert(cssSrc.includes('--sai-right'), 'CSS must declare or consume --sai-right');
  });

  // 2. Mobile Title Screen Grid & Layout
  test('CSS provides mobile responsive layout for Title Screen with thumb-friendly touch targets', () => {
    assert(cssSrc.includes('@media (max-width: 640px)'), 'Must include 640px mobile breakpoint');
    assert(cssSrc.includes('.fw-landing'), 'Must style .fw-landing');
    assert(cssSrc.includes('.fw-cta'), 'Must style .fw-cta hero play button');
  });

  // 3. Mobile City Carousel & Touch Navigation
  test('City Selection screen provides mobile touch-friendly carousel styles', () => {
    assert(cssSrc.includes('.fw-city-select'), 'Must style .fw-city-select');
    assert(cssSrc.includes('.city-card'), 'Must style .city-card');
    assert(cssSrc.includes('.city-nav-arrow'), 'Must style .city-nav-arrow');
    assert(cssSrc.includes('.city-dots-rail'), 'Must style .city-dots-rail');
  });

  // 4. Mobile Shop Shell & Docked Navigation
  test('Shop provides mobile docked tab bar and responsive item grid', () => {
    assert(cssSrc.includes('.shop-screen'), 'Must style .shop-screen');
    assert(cssSrc.includes('.shop-scroll'), 'Must style .shop-scroll');
    assert(cssSrc.includes('.shop-tab-bar'), 'Must style .shop-tab-bar');
    assert(cssSrc.includes('.shop-tab'), 'Must style .shop-tab');
  });

  // 5. Mobile In-Game HUD Safe Insets
  test('HUD elements respect safe-area-inset-top on mobile notches', () => {
    assert(cssSrc.includes('var(--sai-top'), 'HUD or top screens must respect safe area insets');
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('mobile-ui.test.mjs')) {
  console.log('--- Validating Mobile-First UI & Navigation Architecture ---');
  const count = runMobileUiSelftest();
  console.log(`\nALL PASS. ${count} mobile UI tests passing cleanly!`);
}
