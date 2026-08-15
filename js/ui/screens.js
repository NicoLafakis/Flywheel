// Full-screen UI: title, world map, shop, results, pause, mechanic intro.

import { LEVELS, METROS, MECHANICS, LEVELS_PER_METRO, coinsForResult, starsForResult } from '../levels.js';
import { isLevelUnlocked, storeSave, VOX_DEFAULTS } from '../save.js';
import { ORBIT_RATE, ORBIT_RATE_RAMP } from '../controls.js';
import { defaultTierForDevice } from '../quality.js';
// The shipped mix, so the three slider rows cannot render a different resting
// position from the one the game actually boots at. js/audio/mix.js owns the
// numbers; this file only draws them.
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from '../audio/mix.js';
import { BOARDS_ENABLED } from '../board/config.js';
// The sandbox payout constants, so the results screen cannot advertise a coin
// value or a finish bonus the sim does not define. js/voxelsim.js owns both.
// RANKED_TICK_COUNT joins them for the same reason: the run's length was typed
// here as the literal "90.0 s", a third statement of ADR-0016's decision of
// record beside the sim's constant and (until T-504) the HUD's own literal 90.
import { SANDBOX_COIN_VALUE, SANDBOX_GOAL_BONUS, RANKED_TICK_COUNT, comboMult } from '../voxelsim.js';
// The CAMPAIGN ladder, which is a different one — it caps at 3.0 where the
// voxel ladder caps at 8x. Imported rather than restated so the results screen
// cannot print a multiplier the campaign sim never awarded (T-309: it used to
// print the raw chain COUNT with an `x` in front, which read x47 for a run that
// scored at 3.0).
import { comboMultiplier as campaignComboMult } from '../sim.js';
import { buildBlockWord } from './blockword.js';
import { buildSprocket } from './sprocket.js';
import { POWERUP_SPECS } from '../powerups.js';

// The shop shelf is the skin registry itself — js/skins.js owns the rows, this
// file only draws them. Re-exported rather than re-imported at the call sites so
// nothing that already did `import { SKINS } from './ui/screens.js'` has to
// change, and so there is exactly one list of ids and prices in the codebase.
// (Imported AND re-exported: a bare `export ... from` would not create the
// local binding this file's own shop renderer needs.)
import { SKINS, INDICATOR_SKINS, bakeSkinThumbnails } from '../skins.js';
export { SKINS, INDICATOR_SKINS };

export const ITEMS = [
  { id: 'clock5', name: '+5s Clock', desc: 'Every level gets 5 extra seconds.', price: 400 },
  { id: 'growth5', name: '+5% Growth', desc: 'Mass gained is 5% higher.', price: 500 },
];

// The master catalog of all single-player metropolis sandboxes.
// Progression order is dynamically sorted by block count ascending (smallest -> largest).
// Any future city added automatically threads into its appropriate ladder position.
export const CITY_CATALOG = [
  {
    scene: 'gallery',
    name: 'THE LAB',
    location: 'PROVING GROUND',
    sub: 'Physics playground & training yard',
    desc: 'Compact starter grid with ramps, street props, and training structures.',
    tagline: 'WARMUP & CALIBRATION',
    blocks: 12213,
    difficulty: 'TIER 1 · CASUAL',
    badge: 'STARTER',
    accentColor: '#00f0ff',
    icon: '🧪',
    coinCount: 60,
    coinValue: 1,
    goalBonus: 25,
  },
  {
    scene: 'manhattan',
    name: 'LOWER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Financial District, Wall Street & Downtown Skyscrapers',
    desc: 'Dense skyscraper canyon grid with granite plazas and office monoliths.',
    tagline: 'FINANCIAL GRID',
    blocks: 25875,
    difficulty: 'TIER 2 · NORMAL',
    badge: 'STAGE 1',
    accentColor: '#ffd23f',
    icon: '🏦',
    coinCount: 70,
    coinValue: 2,
    goalBonus: 50,
  },
  {
    scene: 'brooklyn',
    name: 'BROOKLYN',
    location: 'NEW YORK CITY',
    sub: 'Bridges to Coney Island, DUMBO & East River Piers',
    desc: 'Sprawling waterfront with suspension bridges, ferry docks, and warehouses.',
    tagline: 'WATERFRONT METROPOLIS',
    blocks: 39984,
    difficulty: 'TIER 3 · SKILLED',
    badge: 'STAGE 2',
    accentColor: '#ff9f1c',
    icon: '🌉',
    coinCount: 80,
    coinValue: 2,
    goalBonus: 75,
  },
  {
    scene: 'chicago',
    name: 'CHICAGO LOOP',
    location: 'CHICAGO, IL',
    sub: 'The Loop, Willis Tower & Iconic River Crossings',
    desc: 'Colossal skyscraper grid, elevated rail loops, and deep river ravines.',
    tagline: 'SKYSCRAPER CANYONS',
    blocks: 44578,
    difficulty: 'TIER 4 · EXPERT',
    badge: 'STAGE 3',
    accentColor: '#ff2a2a',
    icon: '🏙️',
    coinCount: 100,
    coinValue: 2,
    goalBonus: 100,
  },
  {
    scene: 'cambridge',
    name: 'CAMBRIDGE',
    location: 'MASSACHUSETTS',
    sub: 'Kendall Square, Canal Park & Lechmere Seam',
    desc: 'Tech district featuring winding waterways, brick labs, and modern campuses.',
    tagline: 'INNOVATION HUB',
    blocks: 72943,
    difficulty: 'TIER 5 · MASTER',
    badge: 'STAGE 4',
    accentColor: '#9d4edd',
    icon: '🧬',
    coinCount: 120,
    coinValue: 3,
    goalBonus: 150,
  },
  {
    scene: 'upper-manhattan',
    name: 'UPPER MANHATTAN',
    location: 'NEW YORK CITY',
    sub: 'Central Park perimeter & Historic Brownstones',
    desc: 'Vast parkland surrounded by classic avenues, grand museums, and brownstone rows.',
    tagline: 'PARKLAND & UPTOWN',
    blocks: 73393,
    difficulty: 'TIER 6 · GRANDMASTER',
    badge: 'STAGE 5',
    accentColor: '#06d6a0',
    icon: '🌳',
    coinCount: 140,
    coinValue: 3,
    goalBonus: 200,
  },
  {
    scene: 'boston',
    name: 'BOSTON SEAPORT',
    location: 'MASSACHUSETTS',
    sub: 'Seaport Boulevard, BCEC & Historic Harbor',
    desc: 'Massive convention halls, seaport piers, and high-density coastal blocks.',
    tagline: 'COASTAL EXPEDITION',
    blocks: 82894,
    difficulty: 'TIER 7 · TITAN',
    badge: 'STAGE 6',
    accentColor: '#3a86ff',
    icon: '⚓',
    coinCount: 160,
    coinValue: 4,
    goalBonus: 300,
  },
  {
    scene: 'tokyo',
    name: 'TOKYO SHINJUKU',
    location: 'TOKYO, JAPAN',
    sub: 'Neo-Shinjuku Skyscraper Grid & Shibuya Scramble',
    desc: 'Mega metropolis with dazzling neon, endless towers, and famous crossings.',
    tagline: 'MEGA METROPOLIS',
    blocks: 84122,
    difficulty: 'TIER 8 · APEX',
    badge: 'FINAL APEX',
    accentColor: '#ff0054',
    icon: '🗼',
    coinCount: 200,
    coinValue: 5,
    goalBonus: 500,
  },
];

// Returns all cities ordered from smallest to largest size (block count ascending)
export function getSortedCityCatalog() {
  return [...CITY_CATALOG].sort((a, b) => a.blocks - b.blocks);
}

// Progression Gate: A city is unlocked if it is the first in the ladder (The Lab),
// or if the player has already played it and recorded a score/run on it.
// If not yet played, it remains unavailable until the previous city has been
// cleared at 100% in under the 5-minute (300s) duration limit.
export function isCityUnlocked(save, cityScene, sortedCatalog) {
  const catalog = sortedCatalog || getSortedCityCatalog();
  const idx = catalog.findIndex((c) => c.scene === cityScene);
  if (idx <= 0) return true; // First city (The Lab) is always unlocked
  const currentRec = (save?.sandbox || {})[cityScene];
  if (currentRec && ((currentRec.runs || 0) > 0 || (currentRec.bestScore || 0) > 0 || (currentRec.completions || 0) > 0)) {
    return true;
  }
  const prevCity = catalog[idx - 1];
  const prevRec = (save?.sandbox || {})[prevCity.scene];
  if (!prevRec) return false;
  
  // Previous city must have a 100% clear (completions > 0 or bestPercent >= 1.0) achieved within the 5-minute (300s) limit
  const hasFullClear = Boolean((prevRec.completions || 0) > 0 || (prevRec.bestPercent || 0) >= 1.0);
  const under5Minutes = prevRec.bestTime !== null && prevRec.bestTime !== undefined && prevRec.bestTime <= 300;
  return Boolean(hasFullClear && under5Minutes);
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

// ---------------------------------------------------------------- save reads
// Everything the landing screen says about the player is derived here, from the
// save and only from the save. Nothing on that screen is allowed to be a
// plausible-looking number: if a record has never been set, the row that would
// have shown it is not rendered.

// The best run anywhere, across every scene. Per-scene bests already ride on
// the city chips; this is the one number that answers "how well have I played",
// which is the question a player actually carries between sessions.
// `bestScore` only exists from save v16 on, so an older record legitimately has
// none and reports null rather than 0 — never measured is not the same as zero.
// Deliberately no biggest-SIZE cell: a global high-water mark on the hole's own
// radius is a low bar every returning player has already maxed, so it stopped
// being recognition and became furniture. Per-city SIZE stays on the chips,
// where it is earned against that city rather than against the player's whole
// history.
function personalBest(save) {
  let score = 0, runs = 0;
  for (const rec of Object.values(save.sandbox || {})) {
    if (!rec) continue;
    // `runs`, not `completions`: since the 180 s clock landed, `completions`
    // counts FULL CLEARS of a city, which almost no run is (js/save.js v18). The
    // question this strip answers is "has this player played before", so it has
    // to count finished runs. `?? completions` covers a record written by a
    // build older than the migration.
    runs += rec.runs ?? rec.completions ?? 0;
    if ((rec.bestScore || 0) > score) score = rec.bestScore;
  }
  return { score: score || null, runs };
}

// The shelf the landing screen's goal meter points at — built from the three
// real registries, so the menu can never advertise a price the shop does not
// charge or an item the shop does not stock.
//
// The goal is the cheapest thing the player does not own AND cannot yet afford.
// A meter aimed at a price the bank already covers is a progress bar for a
// journey already finished: the moment coins cross a skin's price, the goal
// rolls up to the next higher rung instead of continuing to suggest the one
// already in reach. Only when everything left is affordable does the cheapest
// unbought row come back, as a READY TO BUY offer; when nothing is left, there
// is no next unlock and the caller renders neither the bar nor the locked card.
function nextUnlock(save) {
  const owned = save.ownedItems || [];
  let goal = null;   // cheapest unowned row priced above the bank
  let ready = null;  // cheapest unowned row the bank already covers
  const consider = (row, kind) => {
    if (!row || !row.price || owned.includes(row.id)) return;
    const entry = { id: row.id, name: row.name, price: row.price, kind, css: row.css };
    if (row.price > save.coins) { if (!goal || row.price < goal.price) goal = entry; }
    else if (!ready || row.price < ready.price) ready = entry;
  };
  for (const s of SKINS) consider(s, 'HOLE SKIN');
  for (const i of INDICATOR_SKINS) consider(i, 'NAV INDICATOR');
  for (const it of ITEMS) consider(it, 'UPGRADE');
  return goal || ready;
}

export class Screens {
  constructor(root, save, actions) {
    this.root = root;
    this.save = save;
    this.actions = actions; // { play(level), resume(), restart(), quitToMap(), buy(id), equip(id), toggleMute() }
    this.current = null;
  }

  clear() {
    this.root.innerHTML = '';
    this.current = null;
  }

  // The landing screen (Stage 1).
  // Clean, focused title screen with exact hierarchy:
  // Play button -> Login | Highest Score -> Skin Progress -> Chicago Challenge -> Records | Shop -> Settings
  showTitle() {
    this.clear();
    if (this.actions.music) this.actions.music('menu');
    if (this.actions.menuScene) this.actions.menuScene(true);
    const still = !!(this.save.settings && this.save.settings.reducedMotion);
    const s = el(`<div class="screen fw-landing${still ? ' fw-still' : ''}"></div>`);

    s.appendChild(el(`<h1 class="fw-a11y">Flywheel. A sprocket's story.</h1>`));

    // Wordmark / Hero
    const hero = el(`<div class="fw-hero"></div>`);
    hero.appendChild(buildSprocket());
    const heroText = el(`<div class="fw-hero-text"></div>`);
    heroText.appendChild(buildBlockWord('FLYWHEEL', { fitChars: 8 }));
    heroText.appendChild(el(`<div class="fw-plate">A SPROCKET'S STORY</div>`));
    hero.appendChild(heroText);
    s.appendChild(hero);

    // 1. Play button (clean, no subtitle)
    const ctaWrap = el(`<div class="fw-cta-wrap">
      <button type="button" class="fw-cta" id="btn-main-play">PLAY</button>
    </div>`);
    ctaWrap.querySelector('#btn-main-play').onclick = () => this.showCitySelect();
    s.appendChild(ctaWrap);

    // 2. Login | Highest Score
    const pb = personalBest(this.save);
    const unlock = nextUnlock(this.save);

    const statsRow = el(`<div class="fw-status-row fw-status-row--split"></div>`);

    // Player Login / Profile
    const claimed = Boolean(this.save.player && this.save.player.name);
    const id = el(`<button type="button" class="fw-stat fw-id${claimed ? '' : ' fw-id--none'}">
      <span class="fw-stat-k">👤 ${claimed ? 'PLAYER' : 'PLAYER LOGIN'}</span>
      <span class="fw-stat-v"></span>
      <span class="fw-stat-note">${claimed ? 'VIEW PROFILE' : 'SIGN IN / REGISTER'}</span>
    </button>`);
    id.querySelector('.fw-stat-v').textContent = claimed ? this.save.player.name : 'LOG IN';
    id.setAttribute('aria-label', claimed
      ? `Profile for ${this.save.player.name}`
      : 'Player Login. Open profile screen to sign in or register.');
    id.onclick = () => this.showProfile();
    statsRow.appendChild(id);

    // Highest Score
    const scoreVal = (pb.score !== null && pb.score !== undefined && pb.score > 0) ? pb.score : 0;
    const scoreCard = el(`<div class="fw-stat">
      <span class="fw-stat-k">HIGHEST SCORE</span>
      <span class="fw-stat-v">${scoreVal.toLocaleString('en-US')}</span>
      <span class="fw-stat-note">${scoreVal > 0 ? 'OVERALL BEST' : 'NO RUNS YET'}</span>
    </div>`);
    statsRow.appendChild(scoreCard);
    s.appendChild(statsRow);

    // 3. Skin Progress (standalone card directly under Login | Highest Score)
    const meterRow = el(`<div class="fw-status-row fw-status-row--meter"></div>`);
    const currentCoins = this.save.coins || 0;
    if (unlock) {
      const need = Math.max(0, unlock.price - currentCoins);
      const pct = Math.max(0, Math.min(1, currentCoins / unlock.price));
      const pctDisplay = Math.round(pct * 100);
      const totalSegments = 10;
      const filledSegments = Math.min(totalSegments, Math.floor(pct * totalSegments + 0.001));

      let segmentsHtml = '';
      for (let i = 0; i < totalSegments; i++) {
        const lit = i < filledSegments;
        segmentsHtml += `<span class="fw-meter-seg${lit ? ' fw-seg--lit' : ''}"></span>`;
      }

      const goalCard = need > 0
        ? el(`<button type="button" class="fw-stat fw-stat--goal fw-stat--graphic-meter fw-stat--interactive" aria-label="Next skin: ${unlock.name}, ${pctDisplay}% complete. Need ${need} more coins.">
            <div class="fw-meter-header">
              <span class="fw-stat-k">🪙 SKIN PROGRESS</span>
              <span class="fw-meter-pct">${pctDisplay}%</span>
            </div>
            <div class="fw-graphic-meter" role="progressbar" aria-valuenow="${pctDisplay}" aria-valuemin="0" aria-valuemax="100">
              <div class="fw-meter-track">
                <div class="fw-meter-fill" style="width:${pctDisplay}%">
                  <div class="fw-meter-glare"></div>
                </div>
                <div class="fw-meter-ticks">
                  <span class="fw-tick" style="left:25%"></span>
                  <span class="fw-tick" style="left:50%"></span>
                  <span class="fw-tick" style="left:75%"></span>
                </div>
              </div>
              <div class="fw-meter-segments">
                ${segmentsHtml}
              </div>
            </div>
            <div class="fw-meter-footer">
              <span class="fw-meter-target">NEXT: <strong>${unlock.name}</strong></span>
              <span class="fw-meter-coins"><strong>${currentCoins.toLocaleString('en-US')}</strong> / ${unlock.price.toLocaleString('en-US')} 🪙</span>
            </div>
            <span class="fw-stat-note">${need.toLocaleString('en-US')} coins needed · SHOP</span>
          </button>`)
        : el(`<button type="button" class="fw-stat fw-stat--goal fw-stat--ready fw-stat--graphic-meter fw-stat--interactive" aria-label="Skin ready to unlock: ${unlock.name} for ${unlock.price} coins.">
            <div class="fw-meter-header">
              <span class="fw-stat-k">🪙 READY TO UNLOCK</span>
              <span class="fw-meter-pct fw-meter-pct--ready">100%</span>
            </div>
            <div class="fw-graphic-meter fw-graphic-meter--ready">
              <div class="fw-meter-track">
                <div class="fw-meter-fill fw-meter-fill--full" style="width:100%">
                  <div class="fw-meter-glare"></div>
                </div>
              </div>
              <div class="fw-meter-segments">
                ${segmentsHtml}
              </div>
            </div>
            <div class="fw-meter-footer">
              <span class="fw-meter-target">UNLOCK: <strong>${unlock.name}</strong></span>
              <span class="fw-meter-coins fw-meter-coins--gold"><strong>${unlock.price.toLocaleString('en-US')} 🪙</strong></span>
            </div>
            <span class="fw-stat-note">${unlock.price} coins · UNLOCK IN SHOP</span>
          </button>`);
      goalCard.onclick = () => this.showShop();
      meterRow.appendChild(goalCard);
    } else {
      const goalCard = el(`<button type="button" class="fw-stat fw-stat--goal fw-stat--graphic-meter fw-stat--interactive" aria-label="All skins unlocked">
        <div class="fw-meter-header">
          <span class="fw-stat-k">🪙 SKIN PROGRESS</span>
          <span class="fw-meter-pct fw-meter-pct--ready">MAX</span>
        </div>
        <div class="fw-graphic-meter fw-graphic-meter--ready">
          <div class="fw-meter-track">
            <div class="fw-meter-fill fw-meter-fill--full" style="width:100%"></div>
          </div>
        </div>
        <div class="fw-meter-footer">
          <span class="fw-meter-target"><strong>ALL SKINS UNLOCKED</strong></span>
          <span class="fw-meter-coins"><strong>${currentCoins.toLocaleString('en-US')} 🪙</strong></span>
        </div>
        <span class="fw-stat-note">VISIT SHOP</span>
      </button>`);
      goalCard.onclick = () => this.showShop();
      meterRow.appendChild(goalCard);
    }
    s.appendChild(meterRow);

    // 4. Chicago challenge
    if (BOARDS_ENABLED) {
      const chicagoRow = el(`<div class="fw-menu-row fw-menu-row--full">
        <button type="button" class="btn secondary btn--chicago">RUN CHICAGO · 90 SECONDS</button>
      </div>`);
      chicagoRow.querySelector('button').onclick = () => this.actions.startRankedRun('chicago');
      s.appendChild(chicagoRow);
    }

    // 5. Records | Shop
    const recordsShopRow = el(`<div class="fw-menu-row fw-menu-row--split"></div>`);
    if (BOARDS_ENABLED) {
      const records = el(`<button type="button" class="btn secondary">RECORDS</button>`);
      records.onclick = () => this.showBoards();
      recordsShopRow.appendChild(records);
    }
    const shop = el(`<button type="button" class="btn secondary">SHOP</button>`);
    shop.onclick = () => this.showShop();
    recordsShopRow.appendChild(shop);
    s.appendChild(recordsShopRow);

    // 6. Settings
    const settingsRow = el(`<div class="fw-menu-row fw-menu-row--full">
      <button type="button" class="btn secondary btn--settings">SETTINGS</button>
    </div>`);
    settingsRow.querySelector('button').onclick = () => this.showSettings(() => this.showTitle());
    s.appendChild(settingsRow);

    // Footer: sound credits + legal
    const foot = el(`<div class="fw-foot"></div>`);
    foot.appendChild(el(`<div class="fw-credits">SOUND EFFECTS · CC0 · KENNEY.NL · OPENGAMEART (THIMRAS, RANGO MANGO) ·
      FREESOUND (THAIGHAUDIO, COGNITO PERCEPTU, BRAINCLAIM, CRAIGSMITH,
      METROSTOCK99, QUBODUP, PUSHKIN, MRRAP4FOOD, DRBODKIN, TAKAREADS)</div>`));

    foot.appendChild(el(`<div class="fw-legal">
      <a href="privacy.html">PRIVACY</a>
      <a href="terms.html">TERMS</a>
    </div>`));
    s.appendChild(foot);

    this.root.appendChild(s);
    this.current = 'title';
  }

  // Stage 2: City Selection & Map Progression Screen.
  // Displays the featured city at center, navigation arrows (and touch swipe) to advance,
  // ordered strictly from smallest to largest size, with gated progression.
  showCitySelect(initialIndex = null) {
    this.clear();
    if (this.actions.music) this.actions.music('menu');
    if (this.actions.menuScene) this.actions.menuScene(false);

    const catalog = getSortedCityCatalog();
    const totalCities = catalog.length;

    // Find default active city: highest unlocked or first uncompleted
    let defaultIndex = 0;
    for (let i = 0; i < catalog.length; i++) {
      if (isCityUnlocked(this.save, catalog[i].scene, catalog)) {
        defaultIndex = i;
        const rec = (this.save?.sandbox || {})[catalog[i].scene];
        if (!rec || (rec.completions || 0) === 0) {
          break;
        }
      }
    }

    let currentIndex = initialIndex !== null
      ? Math.max(0, Math.min(totalCities - 1, initialIndex))
      : defaultIndex;

    const s = el(`<div class="screen fw-city-select" role="region" aria-label="City Metropolis Campaign"></div>`);

    // Top Header: Back Button + Title + Campaign Unlock Count
    const header = el(`<div class="city-select-header">
      <button type="button" class="btn secondary city-back-btn" aria-label="Back to Title">← BACK</button>
      <div class="city-header-center">
        <h1 class="city-select-title">SELECT CITY</h1>
        <div class="city-select-sub">ASCENDING METROPOLIS CAMPAIGN</div>
      </div>
      <div class="city-progress-badge" id="city-progress-badge">
        <span class="progress-icon">🏆</span>
        <span class="progress-text"></span>
      </div>
    </div>`);
    header.querySelector('.city-back-btn').onclick = () => this.showTitle();
    s.appendChild(header);

    // Carousel Area
    const carouselWrapper = el(`<div class="city-carousel-wrapper"></div>`);

    const btnPrev = el(`<button type="button" class="city-nav-arrow city-nav-prev" aria-label="Previous City">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>`);

    const cardHost = el(`<div class="city-card-host"></div>`);

    const btnNext = el(`<button type="button" class="city-nav-arrow city-nav-next" aria-label="Next City">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>`);

    carouselWrapper.append(btnPrev, cardHost, btnNext);
    s.appendChild(carouselWrapper);

    // Dots pagination rail
    const dotsRail = el(`<div class="city-dots-rail" role="tablist" aria-label="City Selection Indicators"></div>`);
    s.appendChild(dotsRail);

    const renderCard = (direction = 0) => {
      cardHost.innerHTML = '';
      dotsRail.innerHTML = '';

      const city = catalog[currentIndex];
      const unlocked = isCityUnlocked(this.save, city.scene, catalog);
      const rec = (this.save?.sandbox || {})[city.scene];
      const prevCity = currentIndex > 0 ? catalog[currentIndex - 1] : null;

      const unlockedCount = catalog.filter((c) => isCityUnlocked(this.save, c.scene, catalog)).length;
      const progressText = header.querySelector('.progress-text');
      if (progressText) progressText.textContent = `${unlockedCount} / ${catalog.length} UNLOCKED`;

      btnPrev.disabled = (currentIndex === 0);
      btnNext.disabled = (currentIndex === totalCities - 1);

      // Render dots
      catalog.forEach((c, idx) => {
        const isCur = (idx === currentIndex);
        const isUnl = isCityUnlocked(this.save, c.scene, catalog);
        const cRec = (this.save?.sandbox || {})[c.scene];
        const isClr = (cRec && (cRec.completions || 0) > 0);

        const dot = el(`<button type="button" class="city-dot${isCur ? ' active' : ''}${isClr ? ' cleared' : (isUnl ? ' unlocked' : ' locked')}"
          role="tab" aria-selected="${isCur ? 'true' : 'false'}"
          aria-label="City ${idx + 1}: ${c.name} (${isClr ? 'Cleared' : (isUnl ? 'Unlocked' : 'Locked')})">
          <span class="dot-inner"></span>
          <span class="dot-num">${idx + 1}</span>
        </button>`);
        dot.onclick = () => {
          if (idx !== currentIndex) {
            const dir = idx > currentIndex ? 1 : -1;
            currentIndex = idx;
            renderCard(dir);
          }
        };
        dotsRail.appendChild(dot);
      });

      // Format records
      const bestScoreStr = (rec && typeof rec.bestScore === 'number' && rec.bestScore > 0)
        ? rec.bestScore.toLocaleString('en-US')
        : '—';
      const bestSizeStr = (rec && rec.bestSize) ? `SIZE ${rec.bestSize}` : '—';
      const bestPercentStr = (rec && rec.bestPercent)
        ? `${Math.round(rec.bestPercent * 100)}%`
        : (rec && rec.completions > 0 ? '100%' : '—');
      const bestTimeStr = (rec && rec.bestTime) ? `${rec.bestTime.toFixed(1)}s` : '—';

      const animClass = direction > 0 ? 'slide-left' : (direction < 0 ? 'slide-right' : '');

      const card = el(`<div class="city-card ${unlocked ? 'city-card--unlocked' : 'city-card--locked'} ${animClass}" style="--city-accent: ${city.accentColor};">
        <div class="city-card-glow"></div>
        <div class="city-card-header">
          <div class="city-badge-group">
            <span class="city-tag city-tag--loc">📍 ${city.location}</span>
            <span class="city-tag city-tag--stage">${city.badge}</span>
          </div>
          <div class="city-status-wrap">
            ${rec && rec.completions > 0
              ? `<span class="city-status-pill city-status--cleared">🏆 CLEARED ×${rec.completions}</span>`
              : (unlocked && rec && rec.runs > 0
                ? `<span class="city-status-pill city-status--progress">⚡ BEST ${Math.round((rec.bestPercent || 0) * 100)}%</span>`
                : (unlocked
                  ? `<span class="city-status-pill city-status--open">✦ OPEN ✦</span>`
                  : `<span class="city-status-pill city-status--locked">🔒 LOCKED</span>`))}
          </div>
        </div>

        <div class="city-hero-block">
          <div class="city-icon-float" aria-hidden="true">${city.icon}</div>
          <h2 class="city-card-title">${city.name}</h2>
          <div class="city-card-tagline">${city.tagline}</div>
          <div class="city-card-sub">${city.sub}</div>
        </div>

        <div class="city-metrics-row">
          <div class="city-metric-box">
            <span class="metric-k">📐 CITY SCALE</span>
            <span class="metric-v">${city.blocks.toLocaleString('en-US')}</span>
            <span class="metric-sub">VOXEL BLOCKS</span>
          </div>
          <div class="city-metric-box">
            <span class="metric-k">⚡ DIFFICULTY</span>
            <span class="metric-v">${city.difficulty.split('·')[0].trim()}</span>
            <span class="metric-sub">${city.difficulty.split('·')[1]?.trim() || 'METROPOLIS'}</span>
          </div>
          <div class="city-metric-box">
            <span class="metric-k">🪙 MAP COINS</span>
            <span class="metric-v">${city.coinCount} COINS</span>
            <span class="metric-sub">${city.coinValue > 1 ? `×${city.coinValue} (+${city.goalBonus} CLEAR)` : `(+${city.goalBonus} CLEAR)`}</span>
          </div>
        </div>

        <div class="city-records-strip">
          <div class="record-item">
            <span class="rec-k">BEST SCORE</span>
            <span class="rec-v">${bestScoreStr}</span>
          </div>
          <div class="record-item">
            <span class="rec-k">MAX SIZE</span>
            <span class="rec-v">${bestSizeStr}</span>
          </div>
          <div class="record-item">
            <span class="rec-k">BEST CLEAR</span>
            <span class="rec-v">${bestPercentStr}</span>
          </div>
          <div class="record-item">
            <span class="rec-k">BEST TIME</span>
            <span class="rec-v">${bestTimeStr}</span>
          </div>
        </div>

        <div class="city-action-row">
          ${unlocked ? `
            <button type="button" class="btn fw-cta city-launch-btn">PLAY ${city.name}</button>
            ${(city.scene === 'chicago' || city.scene === 'brooklyn') && BOARDS_ENABLED ? `
              <button type="button" class="btn secondary city-ranked-btn">RUN 90s RANKED</button>
            ` : ''}
          ` : `
            <div class="city-locked-notice">
              <span class="locked-icon">🔒</span>
              <div class="locked-info">
                <strong>METROPOLIS LOCKED</strong>
                <span>Clear <strong>${prevCity ? prevCity.name : 'previous city'}</strong> 100% in under 5 minutes to unlock!</span>
              </div>
            </div>
            <button type="button" class="btn fw-cta city-launch-btn disabled" disabled>🔒 LOCKED</button>
          `}
        </div>
      </div>`);

      const launchBtn = card.querySelector('.city-launch-btn:not(.disabled)');
      if (launchBtn) {
        launchBtn.onclick = () => this.actions.startVoxelSandbox(city.scene);
      }
      const rankedBtn = card.querySelector('.city-ranked-btn');
      if (rankedBtn) {
        rankedBtn.onclick = () => this.actions.startRankedRun(city.scene);
      }

      cardHost.appendChild(card);
    };

    btnPrev.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCard(-1);
      }
    };

    btnNext.onclick = () => {
      if (currentIndex < totalCities - 1) {
        currentIndex++;
        renderCard(1);
      }
    };

    // Swipe gestures on carouselWrapper (Touch + Pointer Drag support)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isSwiping = false;

    const onPointerDown = (e) => {
      if (e.target.closest('button')) return;
      touchStartX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
      touchStartY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
      touchStartTime = performance.now();
      isSwiping = true;
    };

    const onPointerUp = (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      const endX = e.clientX ?? (e.changedTouches && e.changedTouches[0]?.clientX) ?? 0;
      const endY = e.clientY ?? (e.changedTouches && e.changedTouches[0]?.clientY) ?? 0;
      const dx = endX - touchStartX;
      const dy = endY - touchStartY;
      const dt = performance.now() - touchStartTime;

      const isFlick = dt < 350 && Math.abs(dx) > 25;
      const isDrag = Math.abs(dx) > 38;

      if ((isFlick || isDrag) && Math.abs(dx) > Math.abs(dy) * 1.1) {
        if (dx < 0 && currentIndex < totalCities - 1) {
          currentIndex++;
          renderCard(1);
        } else if (dx > 0 && currentIndex > 0) {
          currentIndex--;
          renderCard(-1);
        }
      }
    };

    carouselWrapper.addEventListener('touchstart', onPointerDown, { passive: true });
    carouselWrapper.addEventListener('touchend', onPointerUp, { passive: true });
    carouselWrapper.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mouseup', onPointerUp);

    // Keyboard navigation
    const keyNav = (e) => {
      if (!document.body.contains(s)) {
        window.removeEventListener('keydown', keyNav);
        window.removeEventListener('mouseup', onPointerUp);
        return;
      }
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && currentIndex > 0) {
        currentIndex--;
        renderCard(-1);
      } else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && currentIndex < totalCities - 1) {
        currentIndex++;
        renderCard(1);
      } else if (e.code === 'Escape') {
        window.removeEventListener('keydown', keyNav);
        this.showTitle();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        const city = catalog[currentIndex];
        if (isCityUnlocked(this.save, city.scene, catalog)) {
          window.removeEventListener('keydown', keyNav);
          this.actions.startVoxelSandbox(city.scene);
        }
      }
    };
    window.addEventListener('keydown', keyNav);

    // Initial render
    renderCard(0);

    this.root.appendChild(s);
    this.current = 'city_select';
  }

  showLoading(label) {
    this.clear();
    if (this.actions.menuScene) this.actions.menuScene(false);
    const s = el(`<div class="screen"><h2>BUILDING CITY…</h2>
      <p style="opacity:0.7">${label}</p></div>`);
    this.root.appendChild(s);
    this.current = 'loading';
  }

  showWorldMap() {
    this.showCitySelect();
  }

  // A sandbox run now ends TWO ways and both are normal endings (R-1.3): the
  // clock runs out, or the player clears the whole city. Neither is a failure
  // state and neither takes an error path — the same screen renders both, and
  // the outcome it reports is the percentage reached.
  showSandboxResults(sim, onContinue) {
    this.clear();
    if (this.actions.music) this.actions.music('results', { restart: true });
    // The two payout constants come from the sim rather than being typed here.
    // They were literals — `coinsCollected * 2 + 35` beside a "+35" in the copy
    // — which is three independent statements of two numbers that must agree.
    // The finish bonus is a payout for FINISHING (T-503). It used to be added
    // unconditionally, so a run that ran out of clock at 3% of the city was
    // paid +35 for reaching a goal it never reached — on a screen whose own
    // heading two lines below reads "TIME'S UP" and whose own body prints
    // "City cleared 3%". Harmless while a sandbox run could only end by
    // reaching the goal; a live payout bug from the moment the 180 s clock made
    // timing out the ordinary ending. `sim.won` is the same latch the heading
    // and the percentage read, so all three now state one outcome.
    const coinVal = sim.coinValue || SANDBOX_COIN_VALUE;
    const goalBonusVal = sim.goalBonus || SANDBOX_GOAL_BONUS;
    const bonus = sim.won ? goalBonusVal : 0;
    const coins = sim.coinsCollected * coinVal + bonus;
    // Bank line projects the post-award total: recordSandboxResult runs in the
    // continue callback, so at render time save.coins is still pre-award.
    // The run's peak has to survive the run, or every celebration during it was
    // retroactively meaningless. Read BEFORE recordSandboxResult runs (it fires
    // in the continue callback), so "beaten" compares against the stored best
    // rather than against the run that just overwrote it.
    const prev = (this.save.sandbox || {})[sim.scene] || {};
    const score = Math.floor(sim.hole.mass);
    const best = sim.hole.bestCombo;
    const newScore = score > (prev.bestScore || 0);
    const newCombo = best > (prev.bestCombo || 0);
    // Against the WHOLE city, which is now also the goal (R-2.1/R-2.2). `won`
    // rather than a second fraction comparison, for the same float reason the
    // HUD reads the latch: at targetFraction 1.0 a real full clear lands a few
    // parts in 1e12 short and would print 99%.
    const cleared = sim.totalMass ? sim.hole.rawMass / sim.totalMass : 0;
    const clearedPct = sim.won ? 100 : Math.floor(cleared * 100);
    const newPercent = !sim.won && cleared > (prev.bestPercent || 0);
    const s = el(`<div class="screen"><h2>${sim.won ? 'GOAL COMPLETE' : "TIME'S UP"}</h2><div class="results-stats">
      <div>${sim.goal.name}</div><div>City cleared <b>${clearedPct}%</b>${newPercent ? ' <span class="rec-new">BEST!</span>' : ''}</div>
      <div>Score <b>${score.toLocaleString('en-US')}</b>${newScore ? ' <span class="rec-new">BEST!</span>' : ''}</div>
      <div>Best chain <b>${best} eats at x${comboMult(best)}</b>${newCombo ? ' <span class="rec-new">BEST!</span>' : ''}</div>
      <div>Coins found <b>${sim.coinsCollected}/${sim.coins.length} (+${sim.coinsCollected * coinVal})</b></div>
      ${sim.won ? `<div>Finish bonus <b>+${goalBonusVal}</b></div>` : ''}
      ${coins > 0 ? `<div>Coins earned <b>+${coins}</b></div>` : ''}
      <div>Bank <b>🪙 ${this.save.coins + coins}</b></div></div></div>`);
    const again = el(`<button class="btn">PLAY AGAIN</button>`); again.onclick = () => onContinue(false, coins);
    const cities = el(`<button class="btn secondary">CITIES</button>`); cities.onclick = () => onContinue(true, coins);
    s.append(again, cities); this.root.appendChild(s); this.current = 'results';
  }

  // A RUN ends on its fixed tick boundary, never by clearing a city. Its score
  // is useful immediately but becomes public only after the server replays the
  // trace; this local-first presentation keeps offline play honest and smooth.
  showRunResults(sim, trace, onContinue) {
    this.clear();
    if (this.actions.music) this.actions.music('results', { restart: true });
    const score = Math.floor(sim.hole.mass);
    const traceNote = trace ? `${trace.length.toLocaleString('en-US')} B trace saved` : 'trace unavailable';
    const s = el(`<div class="screen"><h2>THE RUN</h2><div class="results-stats">
      <div>YOUR RUN <b>${score.toLocaleString('en-US')} pts</b></div>
      <div>Best chain <b>${sim.hole.bestCombo} eats at x${comboMult(sim.hole.bestCombo)}</b></div>
      <div>Clock <b>${(RANKED_TICK_COUNT / 60).toFixed(1)} s</b></div>
      <div class="run-rank-status">SAVED — NOT RANKED (NO CONNECTION)</div>
      <div>${traceNote}</div></div></div>`);
    // By class, not by child index. The index was `children[3]`, which silently
    // repoints at whatever row happens to sit fourth — one added or reordered
    // stat line and the board status would start overwriting the clock.
    const status = s.querySelector('.run-rank-status');
    const claim = el(`<div class="fw-claim-slot"></div>`);
    const check = el(`<button class="btn secondary" type="button" hidden>CHECK BOARD STATUS</button>`);
    let runId = null;
    const setRankStatus = (result) => {
      const verdict = result && result.verdict;
      if (verdict === 'verified') {
        status.textContent = `VERIFIED · ${Number(result.verified_score ?? score).toLocaleString('en-US')}`;
        if (!(this.save.player && this.save.player.name) && runId) {
          import('./boards.js').then(({ mountClaim }) => mountClaim(claim, {
            save: this.save, runId, onClaimed: () => { status.textContent = 'VERIFIED · YOUR NAME IS ON THE BOARD'; check.hidden = true; },
          }));
        }
      } else if (verdict === 'pending' || verdict === 'queued') {
        status.textContent = 'SAVED — VERIFYING';
      } else if (verdict === 'unranked') {
        status.textContent = 'SAVED — NOT RANKED THIS TIME'; check.hidden = true;
      } else {
        status.textContent = 'SAVED — NOT RANKED';
      }
    };
    check.onclick = async () => {
      if (!runId) return;
      check.disabled = true;
      try {
        const { status: readStatus } = await import('../board/run.js');
        setRankStatus(await readStatus(runId));
      } catch { status.textContent = 'STILL VERIFYING — TRY AGAIN SOON'; }
      finally { check.disabled = false; }
    };
    const again = el(`<button class="btn">RUN AGAIN</button>`); again.onclick = () => onContinue(false);
    const cities = el(`<button class="btn secondary">CITIES</button>`); cities.onclick = () => onContinue(true);
    s.append(check, claim, again, cities); this.root.appendChild(s); this.current = 'results';
    return {
      setRankStatus,
      setRunId: (id) => { runId = id; check.hidden = !id; },
    };
  }

  async showBoards() {
    this.clear();
    if (this.actions.menuScene) this.actions.menuScene(false);
    this.root.appendChild(el(`<div class="screen">LOADING RECORDS…</div>`));
    try {
      const { renderBoards } = await import('./boards.js');
      await renderBoards(this.root, {
        save: this.save,
        onBack: () => this.showTitle(),
        onProfile: () => this.showProfile(),
        onStartCity: (scene) => this.actions.startVoxelSandbox(scene),
        onStartRankedRun: (scene) => this.actions.startRankedRun(scene),
      });
      this.current = 'records';
    } catch {
      this.root.innerHTML = '';
      const offline = el(`<div class="screen"><h2>RECORDS</h2><p>RECORDS ARE OFFLINE. PLAYING STILL WORKS.</p></div>`);
      const back = el(`<button class="btn secondary">CITIES</button>`); back.onclick = () => this.showTitle();
      offline.appendChild(back); this.root.appendChild(offline); this.current = 'records';
    }
  }

  async showProfile() {
    this.clear();
    if (this.actions.menuScene) this.actions.menuScene(false);
    this.root.appendChild(el(`<div class="screen">LOADING PROFILE…</div>`));
    try {
      const { renderProfile } = await import('./boards.js');
      renderProfile(this.root, {
        save: this.save,
        onBack: () => this.showTitle(),
        onRecords: () => this.showBoards(),
        onStartCity: (scene) => this.actions.startVoxelSandbox(scene),
        onStartRankedRun: (scene) => this.actions.startRankedRun(scene),
      });
      // The identity chip brings players here who have no name at all, which
      // that button was gated against before — so this screen is now the place
      // the game explains how a name is obtained, and it has to be honest about
      // it. boards.js already states the FACT ("EARN A VERIFIED RUN TO CLAIM
      // ONE") and that stays the sentence; what it cannot state is the door,
      // because THE RUN is a main.js action the board layer has no handle on.
      // There is exactly one claim flow in this codebase — showRunResults mounts
      // mountClaim when the server verdict comes back `verified` and the device
      // holds no name — so the whole path is: play THE RUN, get verified, claim
      // on that results screen. No other route is invented here, because no
      // other route exists.
      if (!(this.save.player && this.save.player.name) && this.actions.startRankedRun) {
        // Anchored to the empty-state note by class rather than by child index,
        // for the reason showRunResults documents: an index silently repoints at
        // whatever happens to sit there after the next edit. With no name there
        // is no transfer note, so this is the only .fw-board-note on the screen.
        const note = this.root.querySelector('.fw-board-note');
        const path = el(`<div class="fw-claim-path">
          <p class="fw-board-note">A name comes from a verified place on the board, not from a sign-up. Play THE RUN; if the server verifies your score, the claim form appears on that run's results screen.</p>
        </div>`);
        // Same label as the title screen's, so it reads as the same door rather
        // than a second one.
        const run = el(`<button type="button" class="btn">RUN CHICAGO · 90 SECONDS</button>`);
        run.onclick = () => this.actions.startRankedRun('chicago');
        path.appendChild(run);
        if (note) note.after(path); else this.root.querySelector('.screen').appendChild(path);
      }
      this.current = 'profile';
    } catch { this.showTitle(); }
  }

  showShop() {
    this.clear();
    if (this.actions.menuScene) this.actions.menuScene(false);
    if (this.actions.music) this.actions.music('shop');
    const s = el(`<div class="screen"><h2>SHOP</h2>
      <div class="coins">&#128176; ${this.save.coins} coins</div>
      <div class="shop-items"></div></div>`);
    const wrap = s.querySelector('.shop-items');
    // A flat colour swatch could describe a skin when a skin WAS a colour. It
    // cannot show teeth, a sweep or an eyelid, so the shelf renders each row's
    // actual geometry — baked once into data URLs, cached for the session. The
    // fallback is the old swatch, so a machine that cannot make a GL context
    // still gets a usable shop.
    const shots = bakeSkinThumbnails();
    for (const skin of SKINS) {
      const owned = this.save.ownedItems.includes(skin.id) || skin.price === 0;
      const equipped = this.save.equippedSkin === skin.id;
      const shot = shots && shots.get(skin.id);
      const art = shot
        ? `<img class="preview" src="${shot}" alt="">`
        : `<div class="swatch" style="background:${skin.css}"></div>`;
      const item = el(`<div class="shop-item"><h4>${skin.name}</h4>
        ${art}
        <p class="blurb">${skin.blurb || ''}</p>
        <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : skin.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}</button>`);
      btn.disabled = equipped;
      btn.onclick = () => {
        if (owned) { this.actions.equip(skin.id); }
        else if (this.actions.buy(skin.id, skin.price)) { /* bought then equip below */ this.actions.equip(skin.id); }
        this.showShop();
      };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const indHeader = el(`<div style="width:100%;margin:14px 0 6px 0;text-align:center"><h3 style="margin:0;color:#38bdf8;font-size:15px;letter-spacing:1px">NAV INDICATOR SKINS</h3></div>`);
    wrap.appendChild(indHeader);
    for (const ind of INDICATOR_SKINS) {
      const owned = this.save.ownedItems.includes(ind.id) || ind.price === 0;
      const equipped = (this.save.equippedIndicator || 'ind-default') === ind.id;
      const art = `<div class="swatch" style="background:${ind.css};display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;box-shadow:0 0 12px ${ind.color ? '#' + ind.color.toString(16).padStart(6, '0') : '#38bdf8'}">➤</div>`;
      const item = el(`<div class="shop-item"><h4>${ind.name}</h4>
        ${art}
        <p class="blurb">${ind.blurb || ''}</p>
        <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : ind.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : 'BUY'}</button>`);
      btn.disabled = equipped;
      btn.onclick = () => {
        if (owned) { if (this.actions.equipIndicator) this.actions.equipIndicator(ind.id); }
        else if (this.actions.buy(ind.id, ind.price)) { if (this.actions.equipIndicator) this.actions.equipIndicator(ind.id); }
        this.showShop();
      };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const itemHeader = el(`<div style="width:100%;margin:14px 0 6px 0;text-align:center"><h3 style="margin:0;color:#ffd23f;font-size:15px;letter-spacing:1px">UPGRADES</h3></div>`);
    wrap.appendChild(itemHeader);
    for (const it of ITEMS) {
      const owned = this.save.ownedItems.includes(it.id);
      const item = el(`<div class="shop-item"><h4>${it.name}</h4>
        <p style="font-size:12px;line-height:1.35;min-height:46px;opacity:.72;margin:6px 0 2px">${it.desc}</p>
        <div class="price">${owned ? 'OWNED' : it.price + ' coins'}</div></div>`);
      const btn = el(`<button class="btn ${owned ? 'secondary' : ''}">${owned ? 'OWNED' : 'BUY'}</button>`);
      btn.disabled = owned;
      btn.onclick = () => { this.actions.buy(it.id, it.price); this.showShop(); };
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    const back = el(`<button class="btn secondary">BACK</button>`);
    back.onclick = () => this.showTitle();
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'shop';
  }

  showMechanicIntro(level, onDone) {
    this.clear();
    const mech = MECHANICS[level.introduces];
    const s = el(`<div class="screen"><h2>LEVEL ${level.index}</h2>
      <div class="mechanic-intro"><b>NEW MECHANIC: ${mech.icon} ${mech.name}</b><br>${mech.desc}</div></div>`);
    const go = el(`<button class="btn">GO</button>`);
    go.onclick = onDone;
    s.appendChild(go);
    this.root.appendChild(s);
    this.current = 'intro';
  }

  showPowerUpShowcase(powerup, onDone) {
    this.clear();
    const spec = powerup.spec || POWERUP_SPECS[powerup.type] || {
      name: 'POWER-UP',
      icon: '⚡',
      tagline: 'Supercharge',
      desc: 'Active effect boost enabled!',
      duration: 10,
      color: 0x00d2ff,
    };
    const colorHex = '#' + (spec.color != null ? spec.color.toString(16).padStart(6, '0') : '00d2ff');
    const s = el(`<div class="screen pu-showcase-screen">
      <div class="pu-showcase-card" style="--pu-accent:${colorHex}">
        <div class="pu-showcase-badge">POWER-UP ACQUIRED</div>
        <div class="pu-showcase-icon">${spec.icon || '⚡'}</div>
        <h2 class="pu-showcase-title">${spec.name || 'POWER-UP'}</h2>
        <div class="pu-showcase-tagline">${spec.tagline || ''}</div>
        <p class="pu-showcase-desc">${spec.desc || ''}</p>
        <div class="pu-showcase-meta">
          <span class="pu-meta-pill">⏱️ ${spec.duration ? spec.duration + 's Duration' : 'Instant Boost'}</span>
        </div>
        <div class="pu-showcase-timer-bar">
          <div class="pu-timer-fill"></div>
        </div>
        <div class="pu-showcase-countdown">Resuming in <b id="pu-count-sec">5</b>s...</div>
        <button class="btn pu-resume-btn" type="button">RESUME (SPACE)</button>
      </div>
    </div>`);

    let remainingMs = 5000;
    let finished = false;
    const countSec = s.querySelector('#pu-count-sec');
    const fill = s.querySelector('.pu-timer-fill');
    const btn = s.querySelector('.pu-resume-btn');
    let timerInterval = null;

    const cleanupAndDone = () => {
      if (finished) return;
      finished = true;
      if (timerInterval) clearInterval(timerInterval);
      window.removeEventListener('keydown', handleKey);
      this.clear();
      onDone();
    };

    const handleKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        cleanupAndDone();
      }
    };

    window.addEventListener('keydown', handleKey);
    btn.onclick = cleanupAndDone;

    const tickInterval = 50;
    timerInterval = setInterval(() => {
      remainingMs -= tickInterval;
      if (remainingMs <= 0) {
        cleanupAndDone();
      } else {
        if (countSec) countSec.textContent = Math.ceil(remainingMs / 1000);
        if (fill) fill.style.width = `${((5000 - remainingMs) / 5000) * 100}%`;
      }
    }, tickInterval);

    this.root.appendChild(s);
    this.current = 'pu_showcase';
  }

  showEarthquakeCinematic({ onSkip, reducedMotion = false } = {}) {
    this.dismissEarthquakeCinematic();
    const overlay = el(`<div id="quake-cinematic-overlay">
      <div class="quake-cinematic-bar top"></div>
      ${reducedMotion ? '' : '<div class="quake-impact-flash"></div>'}
      ${reducedMotion ? '' : '<div class="quake-speed-lines"></div>'}
      <div class="quake-anime-banner">
        <div class="quake-banner-sub">⚡ TECTONIC CATACLYSM ⚡</div>
        <h1 class="quake-banner-title">FAULT LINE RUPTURE</h1>
        <div class="quake-banner-hint">SPACE / TAP TO SKIP</div>
      </div>
      <div class="quake-cinematic-bar bottom"></div>
    </div>`);

    let done = false;
    const handleSkip = (e) => {
      if (done) return;
      if (e && e.type === 'keydown') {
        if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
        e.preventDefault();
      }
      done = true;
      this.dismissEarthquakeCinematic();
      if (typeof onSkip === 'function') onSkip();
    };

    window.addEventListener('keydown', handleSkip);
    overlay.addEventListener('click', handleSkip);
    overlay.addEventListener('touchstart', handleSkip, { passive: true });

    this._quakeOverlayCleanup = () => {
      window.removeEventListener('keydown', handleSkip);
      overlay.removeEventListener('click', handleSkip);
      overlay.removeEventListener('touchstart', handleSkip);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    document.body.appendChild(overlay);
    this._quakeOverlayEl = overlay;
    return overlay;
  }

  dismissEarthquakeCinematic() {
    if (this._quakeOverlayEl) {
      this._quakeOverlayEl.classList.add('fading-out');
      const cleanup = this._quakeOverlayCleanup;
      setTimeout(() => {
        if (cleanup) cleanup();
      }, 300);
      this._quakeOverlayEl = null;
      this._quakeOverlayCleanup = null;
    }
  }

  showPokemonEncounterModal({ powerup, onSkip, reducedMotion = false } = {}) {
    this.dismissPokemonEncounterModal();
    const spec = (powerup && powerup.spec) || powerup || {};
    const colorHex = '#' + (spec.color || 0xffb703).toString(16).padStart(6, '0');
    const glowHex = '#' + (spec.glowColor || 0xff7700).toString(16).padStart(6, '0');
    const pokeType = spec.pokeType || 'MYTHICAL / POWER';
    const pokeLevel = spec.pokeLevel || 50;
    const pokeRarity = spec.pokeRarity || 'LEGENDARY';

    const overlay = el(`<div id="poke-encounter-overlay" style="--poke-color: ${colorHex}; --poke-glow: ${glowHex};">
      ${reducedMotion ? '' : `
        <div class="poke-battle-wipe left"></div>
        <div class="poke-battle-wipe right"></div>
        <div class="poke-radial-burst"></div>
      `}
      <div class="poke-encounter-card">
        <div class="poke-card-header">
          <span class="poke-wild-tag">⚡ A WILD POWER-UP HAS APPEARED! ⚡</span>
          <span class="poke-rarity-badge">${pokeRarity}</span>
        </div>
        <div class="poke-card-body">
          <div class="poke-icon-circle">
            <span class="poke-icon">${spec.icon || '⚡'}</span>
            <div class="poke-icon-aura"></div>
          </div>
          <div class="poke-info">
            <div class="poke-name-row">
              <h1 class="poke-powerup-name">${spec.name || 'POWER-UP'}</h1>
              <span class="poke-level">Lv.${pokeLevel}</span>
            </div>
            <div class="poke-type-pill">TYPE / ${pokeType}</div>
            <p class="poke-flavor-text">${spec.desc || spec.tagline || 'A powerful booster has landed in the city!'}</p>
          </div>
        </div>
        <div class="poke-card-footer">
          <span class="poke-prompt-pill">SPACE / TAP TO ENGAGE</span>
        </div>
      </div>
    </div>`);

    let done = false;
    const handleSkip = (e) => {
      if (done) return;
      if (e && e.type === 'keydown') {
        if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
        e.preventDefault();
      }
      done = true;
      this.dismissPokemonEncounterModal();
      if (typeof onSkip === 'function') onSkip();
    };

    window.addEventListener('keydown', handleSkip);
    overlay.addEventListener('click', handleSkip);
    overlay.addEventListener('touchstart', handleSkip, { passive: true });

    this._pokeOverlayCleanup = () => {
      window.removeEventListener('keydown', handleSkip);
      overlay.removeEventListener('click', handleSkip);
      overlay.removeEventListener('touchstart', handleSkip);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    document.body.appendChild(overlay);
    this._pokeOverlayEl = overlay;
    return overlay;
  }

  dismissPokemonEncounterModal() {
    if (this._pokeOverlayEl) {
      this._pokeOverlayEl.classList.add('fading-out');
      const cleanup = this._pokeOverlayCleanup;
      setTimeout(() => {
        if (cleanup) cleanup();
      }, 250);
      this._pokeOverlayEl = null;
      this._pokeOverlayCleanup = null;
    }
  }

  showResults(level, sim, onContinue) {
    this.clear();
    if (this.actions.music) this.actions.music('results', { restart: true });
    const stars = starsForResult(level, sim.timeLeft, sim.won);
    const coins = coinsForResult(level, stars, sim.player.bestCombo);
    const s = el(`<div class="screen">
      <h2>${sim.won ? 'LEVEL COMPLETE!' : "TIME'S UP!"}</h2>
      <div class="results-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="results-stats">
        Mass <b>${Math.floor(sim.player.mass)} / ${level.target}</b><br>
        Time left <b>${Math.ceil(sim.timeLeft)}s</b><br>
        Best chain <b>${sim.player.bestCombo} eats at x${campaignComboMult(sim.player.bestCombo).toFixed(1)}</b><br>
        Coins earned <b>+${coins}</b>
      </div></div>`);
    const cont = el(`<button class="btn">${sim.won ? 'CONTINUE' : 'RETRY'}</button>`);
    cont.onclick = () => onContinue(stars, coins);
    const map = el(`<button class="btn secondary">CITIES</button>`);
    map.onclick = () => { onContinue(stars, coins, true); };
    s.append(cont, map);
    this.root.appendChild(s);
    this.current = 'results';
  }

  showPause() {
    this.clear();
    if (this.actions.music) this.actions.music('pause');
    const s = el(`<div class="screen"><h2>PAUSED</h2></div>`);
    const resume = el(`<button class="btn">RESUME</button>`);
    resume.onclick = () => this.actions.resume();
    const settings = el(`<button class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showPause());
    // RESTART and CITIES both discard the run, and pause is only reachable
    // mid-run — so both ask once before throwing the run away (playtest
    // finding: silent mid-run progress loss). Two-step inline confirm, not a
    // modal: the pause screen deliberately has no dialogs. First click arms
    // the button, second acts, clicking anywhere else disarms it.
    const armable = (label, act) => {
      const btn = el(`<button class="btn secondary">${label}</button>`);
      btn.onclick = () => {
        if (btn.dataset.armed) { act(); return; }
        btn.dataset.armed = '1';
        btn.textContent = `${label} — SURE?`;
        btn.classList.add('danger');
        const disarm = (e) => {
          if (e.target === btn) return;
          delete btn.dataset.armed;
          btn.textContent = label;
          btn.classList.remove('danger');
          s.removeEventListener('pointerdown', disarm, true);
        };
        s.addEventListener('pointerdown', disarm, true);
      };
      return btn;
    };
    const restart = armable('RESTART', () => this.actions.restart());
    // CITIES, not WORLD MAP: the button has always landed on the title/city
    // shelf and no map exists (showWorldMap is an alias for showTitle). The
    // old label promised a reorientation hub and delivered the front door.
    const quit = armable('CITIES', () => this.actions.quitToMap());
    s.append(resume, settings, restart, quit);
    this.root.appendChild(s);
    this.current = 'pause';
  }

  showSettings(onBack) {
    this.clear();
    if (this.actions.menuScene) this.actions.menuScene(false);
    const st = this.save.settings;
    const s = el(`<div class="screen"><h2>SETTINGS</h2></div>`);
    // `set-panel` widens the panel and trims its padding at phone width; every
    // row below uses the `set-row` flex layout instead of a floated value. See
    // the block comment in css/main.css — the short version is that a floated
    // value wraps invisibly, so neither the eye nor a script could tell a
    // one-line row from a two-line one.
    const panel = el(`<div class="results-stats set-panel" style="float:none"></div>`);

    // `hint` is optional and renders as a second line under the label. Used
    // where the label alone does not say what the setting COSTS you — a toggle
    // named for what it turns on reads like the default, which is how "Tap to
    // steer" hid the fact that switching it on removes the joystick entirely.
    const toggle = (label, key, hint) => {
      const row = el(`<div class="set-row"><span class="set-label">${label}${hint ? `<small class="set-hint">${hint}</small>` : ''}</span>
        <span class="set-val"><button class="btn secondary">${st[key] ? 'ON' : 'OFF'}</button></span></div>`);
      const btn = row.querySelector('button');
      btn.onclick = () => {
        st[key] = !st[key];
        btn.textContent = st[key] ? 'ON' : 'OFF';
        this.actions.applySettings();
      };
      return row;
    };

    panel.appendChild(toggle('👆 Tap to move', 'pointMove', 'Replaces the on-screen joystick'));
    panel.appendChild(toggle('↔ Flip left and right', 'invertX'));
    panel.appendChild(toggle('↕ Flip up and down', 'invertY'));
    panel.appendChild(toggle('🌤 Pretty shadows', 'shadows'));
    panel.appendChild(toggle('🫧 Less movement', 'reducedMotion'));
    panel.appendChild(toggle('⚡ Smoother play', 'perfMode'));

    // Full controls listing — every ability gets its own keybind. FIRST in the
    // panel, above the fold: the playtest showed nobody opens SETTINGS before
    // playing, so the one place the scheme is written down has to be the first
    // thing seen when anyone does (and the READY gate now carries the short
    // version at point of play).
    const ctlTitle = el(`<h3 style="margin:18px 0 4px">CONTROLS</h3>`);
    panel.appendChild(ctlTitle);
    const ctl = (label, keys) => panel.appendChild(
      el(`<div class="set-row"><span class="set-label">${label}</span>
        <span class="set-val">${keys}</span></div>`));
    // One flat list, no sub-headers. There used to be CITY PLAY / CITY LEVELS /
    // GENERAL groups, and the first two were byte-identical — CITY LEVELS
    // documented the campaign, which a137054 retired. showTitle() offers only
    // sandbox scenes plus SHOP/SETTINGS now, so there is no route to a campaign
    // level and no second scheme left to distinguish.
    ctl('Drive forward', 'W / ↑');
    ctl('Reverse', 'S / ↓');
    ctl('Turn left', 'A / ←');
    ctl('Turn right', 'D / →');
    ctl('Orbit camera', 'Q / E');
    ctl('Zoom in / out', 'R / F');
    ctl('Pause', 'Esc');
    // Touch is three separate bindings, so it gets three rows. It was one row
    // reading 'left ½ steers · right ½ looks · pinch zooms', which was ~300px of
    // value on a 276px row at 320px — no layout saves that, and trimming the
    // wording until it happened to fit would break again on the next edit.
    // Splitting also matches how every other line here reads: action, then
    // binding. Left half is direct steer (the drag names a screen direction and
    // the hole turns to face it), not a heading nudge.
    ctl('Steer (touch)', 'drag left ½');
    ctl('Look around (touch)', 'drag right ½');
    ctl('Zoom (touch)', 'pinch two fingers');

    // Graphics detail, binary: full graphics or not. LOW drops the pixel ratio,
    // shadows, ambient life and the debris/support budgets (js/quality.js has
    // the measured rationale for each). There is still no AUTO — nothing
    // classifies the device while playing and nothing adjusts mid-session.
    //
    // The DEFAULT does depend on the device (phones start on LOW, desktops on
    // HIGH), and the label has to show what the game is ACTUALLY running or the
    // screen lies to a phone player about why their frames look the way they do.
    // So the button reads the effective tier — the stored value once the player
    // has chosen, the device default until then — and pressing it records that a
    // choice now exists, after which the stored value is the only authority.
    //
    // Still the same button rather than a <select>: every other control on this
    // screen is a button, a native dropdown is the one widget that would look
    // imported, and two options make the cycle a straight toggle.
    const QUALITY_ORDER = ['high', 'low'];
    const QUALITY_LABEL = { high: 'HIGH', low: 'LOW' };
    const effectiveQuality = () => {
      if (!st.qualityChosen) return defaultTierForDevice();
      return st.quality === 'low' ? 'low' : 'high';
    };
    const qualityText = () => QUALITY_LABEL[effectiveQuality()] || QUALITY_LABEL.high;
    const qRow = el(`<div class="set-row"><span class="set-label">🎚 Graphics detail</span>
      <span class="set-val"><button class="btn secondary">${qualityText()}</button></span></div>`);
    const qBtn = qRow.querySelector('button');
    qBtn.onclick = () => {
      // Cycle from the tier the LABEL is showing, not from a sentinel and not
      // from the raw stored string: an unchosen phone shows LOW while `quality`
      // still holds 'high', and starting the cycle from the stored value would
      // make the first press look like it did nothing.
      const i = Math.max(0, QUALITY_ORDER.indexOf(effectiveQuality()));
      st.quality = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length];
      st.qualityChosen = true;
      qBtn.textContent = qualityText();
      this.actions.applySettings();
    };
    panel.appendChild(qRow);

    const muteRow = el(`<div class="set-row"><span class="set-label">🔊 Game sounds</span>
      <span class="set-val"><button class="btn secondary">${this.save.muted ? 'OFF' : 'ON'}</button></span></div>`);
    const muteBtn = muteRow.querySelector('button');
    muteBtn.onclick = () => {
      this.actions.toggleMute();
      muteBtn.textContent = this.save.muted ? 'OFF' : 'ON';
    };
    panel.appendChild(muteRow);

    // Three independent levels, no master among them: EFFECTS (crashes, gulps,
    // UI), AMBIENCE (the city beds and the el-train rattle) and MUSIC. Game
    // sounds above is the one global off switch. Ordered loudest-to-quietest by
    // how often a player reaches for them.
    const volRow = el(`<div class="set-row"><span class="set-label">🔊 Effects volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Effects volume" value="${st.sfxVol !== undefined ? st.sfxVol : DEFAULT_SFX_VOLUME}"></span></div>`);
    const volSlider = volRow.querySelector('input');
    volSlider.oninput = () => {
      st.sfxVol = parseFloat(volSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(volRow);

    // The city under the demolition: keeping the beds up while pulling the
    // crashes down (or the reverse) is the whole point of splitting these.
    const ambRow = el(`<div class="set-row"><span class="set-label">🌆 Ambience volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Ambience volume" value="${st.ambVol !== undefined ? st.ambVol : DEFAULT_AMBIENCE_VOLUME}"></span></div>`);
    const ambSlider = ambRow.querySelector('input');
    ambSlider.oninput = () => {
      st.ambVol = parseFloat(ambSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(ambRow);

    // Independent of both sliders above: players can keep gameplay cues while
    // lowering the score. MusicDirector owns persistence, so standalone
    // arena.html inherits the same choice without importing the main save.
    const musicVol = this.actions.musicVolume ? this.actions.musicVolume() : DEFAULT_MUSIC_VOLUME;
    const musicRow = el(`<div class="set-row"><span class="set-label">🎵 Music volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Music volume" value="${musicVol}"></span></div>`);
    const musicSlider = musicRow.querySelector('input');
    musicSlider.oninput = () => {
      if (this.actions.setMusicVolume) this.actions.setMusicVolume(parseFloat(musicSlider.value));
    };
    panel.appendChild(musicRow);

    // Stacked: measured at 320px this label alone is 240px of a 276px row, so it
    // cannot share a line with a slider at any slider width worth dragging.
    const distRow = el(`<div class="set-row set-row--stack"><span class="set-label">📷 Camera view (closer ↔ farther)</span>
      <span class="set-val"><input type="range" min="0.7" max="1.5" step="0.05" value="${st.camDist}"></span></div>`);
    const slider = distRow.querySelector('input');
    slider.oninput = () => {
      st.camDist = parseFloat(slider.value);
      this.actions.applySettings();
    };
    panel.appendChild(distRow);

    // Turn rate shown to the player: ORBIT_RATE rad/s × sens, in degrees.
    // Derived from the constant rather than typed as a literal so the readout
    // cannot drift when the controls are re-tuned — a hand-copied number here
    // would keep claiming the old speed after a change in controls.js and
    // nobody would notice, because it still looks plausible.
    //
    // One slider, two consumers, both in the sandbox: A/D steering and the
    // Q/E / touch-drag manual orbit both run at ORBIT_RATE × turnSens × the
    // size ramp (controls.js _steerSens/_orbitSens; the touch stick's direct
    // steer then multiplies by DIRECT_STEER_BOOST under the DIRECT_STEER_MAX
    // cap), so the range printed here is the base each is built from. It used
    // to print STEER_RATE × sens, which
    // described nothing that ran anywhere — the sandbox's old A/D steering
    // ignored this slider entirely and used its own size-ramped 0.2–0.8, so
    // the screen advertised ~155°/s for a control that actually turned at
    // ~31°/s.
    //
    // Printed as a RANGE, not a single number, because the rate is genuinely
    // size-dependent now: quoting either end alone would be false for the whole
    // rest of the ladder, which is the same class of lie the old readout told.
    // Both ends come off the exported constants, so neither can drift.
    const DEG_PER_RAD = 180 / Math.PI;
    const sensFmt = (v) => `${v.toFixed(2)} · ~${Math.round(ORBIT_RATE * DEG_PER_RAD * v)}` +
      `-${Math.round(ORBIT_RATE * ORBIT_RATE_RAMP * DEG_PER_RAD * v)}°/s (SIZE 1→12)`;
    // Stacked for the same reason as the camera row, and more so: the readout is
    // deliberately a full range with a SIZE annotation (see above), which is
    // 223px on its own at 320px. Shortening it to fit would re-introduce exactly
    // the lie the comment above exists to prevent.
    const sensRow = el(`<div class="set-row set-row--stack"><span class="set-label">Sandbox turn sensitivity</span>
      <span class="set-val"><span class="tune-val">${sensFmt(st.turnSens !== undefined ? st.turnSens : 1)}</span>
      <input type="range" min="0.1" max="2.5" step="0.05" value="${st.turnSens !== undefined ? st.turnSens : 1}"></span></div>`);
    const sensSlider = sensRow.querySelector('input');
    const sensVal = sensRow.querySelector('.tune-val');
    sensSlider.oninput = () => {
      st.turnSens = parseFloat(sensSlider.value);
      sensVal.textContent = sensFmt(st.turnSens);
      this.actions.applySettings();
    };
    panel.appendChild(sensRow);

    // Dev voxel-physics tuning — live-applied to the running sandbox via
    // actions.applySettings(). Folded behind an ADVANCED disclosure (playtest
    // finding: engineering-unit sliders sat in the player-facing list), with a
    // reset because there was no way back to the shipped feel once moved.
    // Values come from VOX_DEFAULTS so the reset can never drift from the
    // defaults a fresh save starts on.
    const fold = el(`<details class="set-details"><summary>ADVANCED — CITY FEEL</summary></details>`);
    panel.appendChild(fold);
    const tune = (label, key, min, max, step, fmt) => {
      const row = el(`<div class="set-row"><span class="set-label">${label}</span>
        <span class="set-val"><span class="tune-val">${fmt(st[key])}</span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${st[key]}"></span></div>`);
      const input = row.querySelector('input');
      const val = row.querySelector('.tune-val');
      input.oninput = () => {
        st[key] = parseFloat(input.value);
        val.textContent = fmt(st[key]);
        this.actions.applySettings();
      };
      fold.appendChild(row);
    };
    tune('Gravity', 'voxGravity', 26, 130, 1, (v) => `${v} · ${(v / 26).toFixed(1)}×`);
    tune('Collapse wave', 'voxWaveK', 0.05, 1, 0.05, (v) => `${v.toFixed(2)} s/m`);
    tune('Creak delay', 'voxCreak', 0, 2, 0.05, (v) => `${v.toFixed(2)}×`);
    tune('Hole speed', 'voxSpeed', 0.7, 3, 0.1, (v) => `${v.toFixed(1)}× · ~${(7.1 * v).toFixed(1)} m/s`);
    tune('Attraction pull', 'voxAttract', 0, 20, 1, (v) => `${v}`);
    const reset = el(`<button class="btn secondary">RESET TO DEFAULTS</button>`);
    reset.onclick = () => {
      Object.assign(st, VOX_DEFAULTS);
      this.actions.applySettings();
      this.showSettings(onBack);
    };
    fold.appendChild(reset);

    s.appendChild(panel);
    const back = el(`<button class="btn set-back">BACK</button>`);
    back.onclick = onBack;
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'settings';
  }
}
