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

  // 3b. Dots rail is flag-gated OFF (29 numbered buttons never fit a phone);
  // act tabs get the freed space as real touch targets.
  test('City dots rail is gated off by SHOW_CITY_DOTS and act tabs are >=40px touch targets', () => {
    assert(/const SHOW_CITY_DOTS\s*=\s*false/.test(screensSrc), 'screens.js must declare SHOW_CITY_DOTS = false');
    assert(/SHOW_CITY_DOTS[\s\S]{0,200}city-dots-rail/.test(screensSrc),
      'dots rail DOM creation must be inside the SHOW_CITY_DOTS gate');
    const tab = cssSrc.match(/\.act-tab-btn \{[^}]*\}/);
    assert(tab && /min-height:\s*4[0-9]px/.test(tab[0]), '.act-tab-btn must set min-height >= 40px');
  });

  // 3c. Status pill is gone; state is shown on the card itself.
  test('City card uses CLEARED stamp and lock/construction bar instead of the status pill', () => {
    assert(!screensSrc.includes('city-status-pill'), 'screens.js must not render .city-status-pill');
    assert(screensSrc.includes('city-stamp'), 'screens.js must render a .city-stamp overlay for cleared cities');
    assert(screensSrc.includes('city-lock-bar'), 'screens.js must render a .city-lock-bar for locked/dev cities');
    assert(screensSrc.includes('UNDER CONSTRUCTION'), 'dev cities must show UNDER CONSTRUCTION bar');
    assert(!/PLAY \$\{city\.name\} \(5 MIN\)/.test(screensSrc), 'Play button must not carry a time callout');
    assert(screensSrc.includes('PLAY ${city.name}</button>'), 'Play button must read PLAY {city}');
    assert(cssSrc.includes('.city-stamp'), 'Must style .city-stamp');
    assert(cssSrc.includes('.city-lock-bar'), 'Must style .city-lock-bar');
    assert(cssSrc.includes('.city-card--locked .city-fade'), 'locked card content must be faded via CSS');
    // The lock bar must name the city that actually gates the unlock (the
    // nearest preceding PLAYABLE city in the full catalog, mirroring
    // isCityUnlocked), not merely the previous card in the filtered carousel.
    assert(/gateCity[\s\S]{0,400}status === 'PLAYABLE'/.test(screensSrc), 'lock bar must derive its gate city from the preceding PLAYABLE city');
    assert(screensSrc.includes('${gateCity ? gateCity.name'), 'lock bar copy must reference gateCity');
  });

  // 3d. CLEARED stamp (100% clear) and 3-MIN challenge badge are separate marks.
  test('CLEARED stamp and 3-MIN challenge badge are independent, separately styled marks', () => {
    assert(screensSrc.includes('city-challenge-badge'), 'screens.js must render a .city-challenge-badge');
    assert(!/city-stamp-sub">3-MIN/.test(screensSrc), 'stamp sub-line must not carry the 3-MIN challenge');
    assert(/const challengeDone = [^\n]*isCityChallengeCompleted/.test(screensSrc), 'challengeDone must derive from isCityChallengeCompleted');
    assert(/\$\{challengeDone \? `<div class="city-challenge-badge/.test(screensSrc), 'badge must render independently of the CLEARED stamp');
    assert(cssSrc.includes('.city-challenge-badge'), 'Must style .city-challenge-badge');
  });

  // 3e. Desktop-only breathing room; mobile rules untouched.
  test('Desktop City Select breathing room lives in a >=1024px, non-touch media query', () => {
    assert(/@media \(min-width: 1024px\) and \(hover: hover\)[\s\S]{0,1200}\.city-act-filter-rail/.test(cssSrc), 'desktop-only query must restyle the act rail');
    assert(/@media \(min-width: 1024px\) and \(hover: hover\)[\s\S]{0,1200}\.city-action-row/.test(cssSrc), 'desktop-only query must pad the CTA area');
    // Act tab pills: ~20% taller on desktop (40px mobile -> 48px), rail padding ~20% more.
    const desk = cssSrc.match(/@media \(min-width: 1024px\) and \(hover: hover\)[\s\S]{0,1500}?\n\}/);
    assert(desk && /\.act-tab-btn \{[^}]*min-height:\s*48px[^}]*padding:\s*10px/.test(desk[0]), 'desktop .act-tab-btn must be min-height 48px with 10px vertical padding');
    assert(desk && /\.city-act-filter-rail \{[^}]*padding:\s*12px 4px 14px/.test(desk[0]), 'desktop act rail padding must be 12px top / 14px bottom');
  });

  // 3f. The act rail is a scroll container inside a height-constrained column
  // flex screen; its auto min-size is 0, so without flex-shrink:0 it collapses
  // to its padding and clips the pills top/bottom (Nico's 2026-08-19 desktop shot).
  test('Act filter rail cannot collapse and clip its pills', () => {
    const rail = cssSrc.match(/\n\.city-act-filter-rail \{[^}]*\}/);
    assert(rail && /flex-shrink:\s*0/.test(rail[0]), '.city-act-filter-rail must set flex-shrink: 0');
  });

  // 4. Campaign wayfinding (strip, breadcrumb, tab counts, World Tour sheet, header pill)
  test('City Select wayfinding: progress strip, breadcrumb, tab counts, World Tour sheet, header pill', () => {
    // strip: one segment per act (Prologue + Acts I-VII = 8), button with aria-label, opens sheet
    assert(screensSrc.includes('city-progress-strip'), 'must render .city-progress-strip');
    assert(/CAMPAIGN_ACTS\.map\(/.test(screensSrc), 'strip segments must be mapped from CAMPAIGN_ACTS (8 entries)');
    assert(/const CAMPAIGN_ACTS = ACTS\.filter\(\(a\) => a\.id !== 'ALL'\)/.test(screensSrc), 'CAMPAIGN_ACTS = ACTS minus ALL');
    assert(/`Campaign progress: \$\{[^}]+\} of \$\{[^}]+\} cleared, open World Tour`/.test(screensSrc), 'strip aria-label format');
    assert(screensSrc.includes('strip-seg'), 'segments');
    assert(screensSrc.includes('strip-fill'), 'segment fill');
    // breadcrumb
    assert(/CITY \$\{[^}]+\} \/ \$\{catalog\.length\} · \$\{[^}]+\} · \$\{[^}]+\} \/ \$\{[^}]+\}/.test(screensSrc), 'breadcrumb CITY n / 29 · ACT · i / n');
    assert(screensSrc.includes('city-breadcrumb'), '.city-breadcrumb');
    // tab counts + cleared glyph
    assert(screensSrc.includes('tab-count'), 'tab count span');
    assert(/class="act-tab-btn[\s\S]{0,120}actCleared \? ' cleared'/.test(screensSrc), 'cleared act tabs get .cleared');
    assert(screensSrc.includes('✓'), 'cleared act tabs show a check glyph');
    // world tour sheet
    assert(screensSrc.includes('world-tour-sheet'), '.world-tour-sheet');
    assert(screensSrc.includes('WORLD TOUR ·'), 'sheet header');
    assert(screensSrc.includes('wt-row'), 'rows');
    assert(/openWorldTour|openTour/.test(screensSrc) && /closeWorldTour|closeTour/.test(screensSrc), 'open/close fns');
    assert(/selectedAct = 'ALL'[\s\S]{0,300}closeWorldTour\(\)|closeWorldTour\(\)[\s\S]{0,300}selectedAct = 'ALL'/.test(screensSrc), 'row jump switches filter to ALL then closes');
    // header pill is a button that opens the sheet
    assert(/<button[^>]*class="[^"]*city-progress-badge/.test(screensSrc), 'header pill is a button');
    assert(/CITY \$\{[^}]+\} \/ \$\{catalog\.length\}`/.test(screensSrc) || screensSrc.includes("`CITY ${globalIdx + 1} / ${catalog.length}`"), 'header pill reads CITY n / 29');
    assert(!screensSrc.includes('UNLOCKED`'), 'header pill no longer reads N / 29 UNLOCKED');
    // css
    for (const sel of ['.city-progress-strip', '.strip-seg', '.strip-fill', '.city-breadcrumb', '.tab-count', '.world-tour-sheet', '.world-tour-backdrop', '.wt-row']) {
      assert(cssSrc.includes(sel), `Must style ${sel}`);
    }
    assert(/\.city-progress-strip \{[^}]*min-height:\s*44px/.test(cssSrc), 'strip tap target >= 44px');
    assert(/\.wt-row \{[^}]*min-height:\s*48px/.test(cssSrc), 'sheet rows >= 48px');
  });

  // 5. Short-viewport card: dossier collapses by default under 700px, toggle exists
  test('City card collapses the dossier under 700px tall viewports with a toggle', () => {
    assert(screensSrc.includes('dossier-toggle'), 'dossier toggle button');
    assert(screensSrc.includes('dossier-body'), 'dossier body wrapper');
    assert(/innerHeight < 700/.test(screensSrc), 'collapsed by default under 700px');
    assert(cssSrc.includes('.city-dossier-wrap.collapsed .dossier-body'), 'collapsed CSS hides body');
    assert(/@media \(max-height: 700px\)[\s\S]{0,600}\.city-icon-float/.test(cssSrc), 'short-viewport hero emoji shrink');
  });

  // 5b. Phone nav arrows are pinned to the hero emoji band, never over metrics/dossier/CTAs
  test('City Select phone nav arrows are anchored to the hero band (no content overlap)', () => {
    assert(/positionNavArrows/.test(screensSrc), 'positionNavArrows helper');
    assert(/city-icon-float[\s\S]{0,400}getBoundingClientRect/.test(screensSrc) || /getBoundingClientRect[\s\S]{0,400}city-icon-float/.test(screensSrc), 'anchors on the .city-icon-float rect');
    assert(/addEventListener\('resize', positionNavArrows/.test(screensSrc), 're-anchors on resize');
    assert(/--nav-arrow-top/.test(screensSrc) && /--nav-arrow-top/.test(cssSrc), 'top set via --nav-arrow-top custom property');
  });

  // 6. Mobile Shop Shell & Docked Navigation
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
