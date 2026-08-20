// Full-screen UI: title, world map, shop, results, pause, mechanic intro.

import { LEVELS, METROS, MECHANICS, LEVELS_PER_METRO, coinsForResult, starsForResult } from '../levels.js';
import { isLevelUnlocked, storeSave, VOX_DEFAULTS, playerName, rerollPlayerName } from '../save.js';
import { ORBIT_RATE, ORBIT_RATE_RAMP } from '../controls.js';
import { defaultTierForDevice } from '../quality.js';
// The shipped mix, so the three slider rows cannot render a different resting
// position from the one the game actually boots at. js/audio/mix.js owns the
// numbers; this file only draws them.
import { DEFAULT_AMBIENCE_VOLUME, DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from '../audio/mix.js';
import { BOARDS_ENABLED } from '../board/config.js';
import { syncStatus } from '../cloud/sync.js';
import { syncIndicator } from './sync-copy.js';
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
import { isTouchDevice } from '../device.js';



// The shop shelf is the skin registry itself — js/skins.js owns the rows, this
// file only draws them. Re-exported rather than re-imported at the call sites so
// nothing that already did `import { SKINS } from './ui/screens.js'` has to
// change, and so there is exactly one list of ids and prices in the codebase.
// (Imported AND re-exported: a bare `export ... from` would not create the
// local binding this file's own shop renderer needs.)
import { SKINS, INDICATOR_SKINS, bakeSkinThumbnails, isSkinAvailable } from '../skins.js';
import { SHOP_CATEGORIES, getShopItemsByCategory, UPGRADES, upgradeCost, upgradeMultiplier, MAX_UPGRADE_RANK } from '../upgrades.js';
export { SKINS, INDICATOR_SKINS };

export const ITEMS = [
  { id: 'clock5', name: '+5s Clock', desc: 'Every level gets 5 extra seconds.', price: 400 },
  { id: 'growth5', name: '+5% Growth', desc: 'Mass gained is 5% higher.', price: 500 },
];

// The master catalog of all single-player metropolis sandboxes and challenge progression helpers.
// Pure data lives in citycatalog.js, imported and re-exported here for backwards compatibility.
import {
  CITY_CATALOG, getSortedCityCatalog, getPlayableCityCatalog, isCityUnlocked,
  isCityChallengeCompleted, getCompletedChallengeCount, isSecret90sChallengeUnlocked,
} from '../citycatalog.js';
export {
  CITY_CATALOG, getSortedCityCatalog, getPlayableCityCatalog, isCityUnlocked,
  isCityChallengeCompleted, getCompletedChallengeCount, isSecret90sChallengeUnlocked,
};

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

// The shelf the landing screen's goal meter points at — read back out of
// `getShopItemsByCategory`, the same call `showShop` renders from, so the menu
// can never advertise a price the shop does not charge or an item the shop does
// not stock. It used to walk `SKINS`, `INDICATOR_SKINS` and the module-local
// `ITEMS` instead, and that third list drifted: no category branch has ever
// returned it, so a player who owned everything at or below 400 was told their
// next unlock was "+5s Clock — 400 coins" and could then open every tab in the
// shop without finding it. Deleting the legacy rows was not an option (saves
// still reference them and an owner keeps what they own) and an exclusion list
// here would only rot the same way, so the shelf is derived rather than
// restated. Anything a future category starts selling is teased automatically;
// anything it stops selling stops being teased.
//
// `kind` is the caption the locked card prints, one per category. The upgrade
// tracks come through this loop too and are filtered out below by the same
// `!row.price` guard that skips free skins — their rows carry a per-rank `cost`,
// not a fixed `price`, so there is no single number to aim a goal meter at. If
// they ever gain one, they join the shelf with no change here.
//
// The goal is the cheapest thing the player does not own AND cannot yet afford.
// A meter aimed at a price the bank already covers is a progress bar for a
// journey already finished: the moment coins cross a skin's price, the goal
// rolls up to the next higher rung instead of continuing to suggest the one
// already in reach. Only when everything left is affordable does the cheapest
// unbought row come back, as a READY TO BUY offer; when nothing is left, there
// is no next unlock and the caller renders neither the bar nor the locked card.
function nextUnlock(save) {
  // Local rather than module-scope so the whole shelf rule reads in one place
  // (and so the headless guard in tools/economy-consistency.test.mjs, which
  // lifts this function out of the source text because js/skins.js drags in
  // three.js, is testing the shipped captions and not its own copy of them).
  const SHELF_KIND = { skins: 'HOLE SKIN', creatures: 'HOLE SKIN', partners: 'HOLE SKIN', indicators: 'NAV INDICATOR', upgrades: 'UPGRADE' };
  const owned = save.ownedItems || [];
  let goal = null;   // cheapest unowned row priced above the bank
  let ready = null;  // cheapest unowned row the bank already covers
  const consider = (row, kind) => {
    if (!row || !row.price || owned.includes(row.id)) return;
    const entry = { id: row.id, name: row.name, price: row.price, kind, css: row.css };
    if (row.price > save.coins) { if (!goal || row.price < goal.price) goal = entry; }
    else if (!ready || row.price < ready.price) ready = entry;
  };
  for (const cat of SHOP_CATEGORIES) {
    const kind = SHELF_KIND[cat.id] || cat.name;
    for (const row of getShopItemsByCategory(cat.id, { save, skins: SKINS, indicatorSkins: INDICATOR_SKINS })) {
      consider(row, kind);
    }
  }
  return goal || ready;
}

export class Screens {
  constructor(root, save, actions) {
    this.root = root;
    this.save = save;
    this.actions = actions; // { play(level), resume(), restart(), quitToMap(), buy(id), buyUpgrade(id), equip(id), toggleMute() }
    this.current = null;
    this.activeShopCategory = 'skins';
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

    // 1. Play button (Primary Hero CTA)
    const ctaWrap = el(`<div class="fw-cta-wrap">
      <button type="button" class="fw-cta" id="btn-main-play">PLAY</button>
    </div>`);
    ctaWrap.querySelector('#btn-main-play').onclick = () => this.showCitySelect();
    s.appendChild(ctaWrap);

    // 2. Multiplayer (Clean, dedicated secondary mode row)
    const mpRow = el(`<div class="fw-menu-row fw-menu-row--full">
      <button type="button" class="btn primary btn--mp" id="btn-main-mp">MULTIPLAYER</button>
    </div>`);
    mpRow.querySelector('#btn-main-mp').onclick = () => {
      if (this.actions.showMultiplayerModal) this.actions.showMultiplayerModal();
    };
    s.appendChild(mpRow);

    // 3. Login | Highest Score
    const pb = personalBest(this.save);
    const unlock = nextUnlock(this.save);

    const statsRow = el(`<div class="fw-status-row fw-status-row--split"></div>`);

    // The player's name. Nobody is anonymous any more: an arriving player is
    // handed one (js/save.js `defaultPlayer`) before this screen ever paints, so
    // this cell shows a NAME rather than an invitation to acquire one, and the
    // note line carries the invitation instead.
    //
    // The re-roll is a sibling of the chip, not a child of it: a button inside a
    // button is invalid, and the browsers that do render it give the outer
    // control the click. So the cell is a wrapper holding both, and the wrapper
    // is what the grid column sees.
    const name = playerName(this.save);
    const claimed = (this.save.player && this.save.player.nameSource) === 'claimed';
    const idCell = el(`<div class="fw-id-cell"></div>`);
    const id = el(`<button type="button" class="fw-stat fw-id">
      <span class="fw-stat-k">${claimed ? 'PLAYER' : 'YOU ARE'}</span>
      <span class="fw-stat-v"></span>
      <span class="fw-stat-note">${claimed ? 'VIEW PROFILE' : 'SIGN IN — KEEP COINS, SKINS & STARS EVERYWHERE'}</span>
    </button>`);
    const nameSlot = id.querySelector('.fw-stat-v');
    nameSlot.textContent = name;
    id.setAttribute('aria-label', `Profile for ${name}`);
    id.onclick = () => this.showProfile();
    // The cloud dot: a colour and a word beside the name, and only when there
    // is something to say (a fresh guest with nothing pushed yet sees no dot).
    // It rides on the plate as a sibling of the note, never a control of its
    // own, and it never blocks anything — the plate stays one tap to PROFILE.
    const ind = syncIndicator(syncStatus(this.save));
    if (ind) {
      const dot = el(`<span class="fw-sync fw-sync--${ind.tone}" role="status"><i class="fw-sync-dot" aria-hidden="true"></i><span class="fw-sync-word"></span></span>`);
      dot.querySelector('.fw-sync-word').textContent = ind.label;
      id.appendChild(dot);
    }
    idCell.appendChild(id);

    if (!claimed) {
      // `secondary` is not styling here — `.fw-reroll` overrides all of it. It is
      // how main.js's one delegated menu-voice listener knows this is a light
      // tap and not a primary confirm.
      const reroll = el(`<button type="button" class="fw-reroll secondary" aria-label="Roll a different name">⟳</button>`);
      reroll.onclick = () => {
        const rolled = rerollPlayerName(this.save);
        nameSlot.textContent = rolled;
        id.setAttribute('aria-label', `Profile for ${rolled}`);
        // Re-triggered by hand on every press: the class is already on the node
        // after the first roll, and without the reflow the second press would
        // animate nothing — which reads as the button having broken.
        nameSlot.classList.remove('is-rolling');
        void nameSlot.offsetWidth;
        nameSlot.classList.add('is-rolling');
      };
      idCell.appendChild(reroll);
    }
    statsRow.appendChild(idCell);

    // Highest Score
    const scoreVal = (pb.score !== null && pb.score !== undefined && pb.score > 0) ? pb.score : 0;
    const scoreCard = el(`<div class="fw-stat">
      <span class="fw-stat-k">HIGHEST SCORE</span>
      <span class="fw-stat-v">${scoreVal.toLocaleString('en-US')}</span>
      <span class="fw-stat-note">${scoreVal > 0 ? 'OVERALL BEST' : 'NO RUNS YET'}</span>
    </div>`);
    statsRow.appendChild(scoreCard);
    s.appendChild(statsRow);

    // 4. Skin Progress (standalone card directly under Login | Highest Score)
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
              <span class="fw-stat-k">SKIN PROGRESS</span>
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
              <span class="fw-meter-coins"><strong>${currentCoins.toLocaleString('en-US')}</strong> / ${unlock.price.toLocaleString('en-US')} COINS</span>
            </div>
            <span class="fw-stat-note">${need.toLocaleString('en-US')} coins needed · SHOP</span>
          </button>`)
        : el(`<button type="button" class="fw-stat fw-stat--goal fw-stat--ready fw-stat--graphic-meter fw-stat--interactive" aria-label="Skin ready to unlock: ${unlock.name} for ${unlock.price} coins.">
            <div class="fw-meter-header">
              <span class="fw-stat-k">READY TO UNLOCK</span>
              <span class="fw-meter-pct fw-meter-pct--ready">100%</span>
            </div>
            <div class="fw-graphic-meter" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100">
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
              <span class="fw-meter-coins fw-meter-coins--gold"><strong>${unlock.price.toLocaleString('en-US')} COINS</strong></span>
            </div>
            <span class="fw-stat-note">${unlock.price} coins · UNLOCK IN SHOP</span>
          </button>`);
      goalCard.onclick = () => this.showShop();
      meterRow.appendChild(goalCard);
    } else {
      const goalCard = el(`<button type="button" class="fw-stat fw-stat--goal fw-stat--graphic-meter fw-stat--interactive" aria-label="All skins unlocked">
        <div class="fw-meter-header">
          <span class="fw-stat-k">SKIN PROGRESS</span>
          <span class="fw-meter-pct fw-meter-pct--ready">MAX</span>
        </div>
        <div class="fw-graphic-meter fw-graphic-meter--ready">
          <div class="fw-meter-track">
            <div class="fw-meter-fill fw-meter-fill--full" style="width:100%"></div>
          </div>
        </div>
        <div class="fw-meter-footer">
          <span class="fw-meter-target"><strong>ALL SKINS UNLOCKED</strong></span>
          <span class="fw-meter-coins"><strong>${currentCoins.toLocaleString('en-US')} COINS</strong></span>
        </div>
        <span class="fw-stat-note">VISIT SHOP</span>
      </button>`);
      goalCard.onclick = () => this.showShop();
      meterRow.appendChild(goalCard);
    }
    s.appendChild(meterRow);

    // 4. City Challenge & Secret 90s Challenge
    const catalog = getSortedCityCatalog();
    const completedChallenges = getCompletedChallengeCount(this.save, catalog);
    const secret90sUnlocked = isSecret90sChallengeUnlocked(this.save, catalog);

    if (secret90sUnlocked) {
      // Secret 90s Challenge Unlocked!
      const challengeRow = el(`<div class="fw-menu-row fw-menu-row--split">
        <button type="button" class="btn secondary btn--challenge-3m" style="border-color:#ffd23f;">RUN 3-MIN CHALLENGE · 2× COINS</button>
        <button type="button" class="btn primary btn--secret-90s" style="background: linear-gradient(135deg, #ff0054, #9d4edd); color: #fff; font-weight: bold;">⚡ SECRET 90s RUN</button>
      </div>`);
      challengeRow.querySelector('.btn--challenge-3m').onclick = () => {
        if (this.actions.startChallenge) this.actions.startChallenge('chicago', 'challenge3m');
        else this.showCitySelect();
      };
      challengeRow.querySelector('.btn--secret-90s').onclick = () => {
        if (this.actions.startChallenge) this.actions.startChallenge('chicago', 'challenge90s');
        else if (this.actions.startRankedRun) this.actions.startRankedRun('chicago');
      };
      s.appendChild(challengeRow);
    } else {
      const challengeRow = el(`<div class="fw-menu-row fw-menu-row--full" style="display:flex; flex-direction:column; gap:4px;">
        <button type="button" class="btn secondary btn--chicago">RUN CHICAGO · 3 MIN CHALLENGE (2× COINS)</button>
        <div class="fw-stat-note" style="text-align:center; font-size:11px; color:#8fb8d8;">
          🔒 SECRET 90s CHALLENGE: ${completedChallenges}/${catalog.length} CITIES COMPLETED
        </div>
      </div>`);
      challengeRow.querySelector('button').onclick = () => {
        if (this.actions.startChallenge) this.actions.startChallenge('chicago', 'challenge3m');
        else this.showCitySelect();
      };
      s.appendChild(challengeRow);
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

    // 6. Settings & Help
    const settingsHelpRow = el(`<div class="fw-menu-row fw-menu-row--split">
      <button type="button" class="btn secondary btn--settings">SETTINGS</button>
      <button type="button" class="btn secondary btn--help">HELP & FAQ</button>
    </div>`);
    settingsHelpRow.querySelector('.btn--settings').onclick = () => this.showSettings(() => this.showTitle());
    settingsHelpRow.querySelector('.btn--help').onclick = () => this.showHelp(() => this.showTitle());
    s.appendChild(settingsHelpRow);

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
  }

  // Stage 2: City Selection & Map Progression Screen.
  // Displays the featured city at center, Act filter tabs to browse regional acts,
  // mission dossier drawer with tactical transmissions, and gated progression.
  showCitySelect(initialIndex = null, initialAct = 'ALL') {
    // Bottom numbered dots rail: hidden for now (see renderCard); keep the code path.
    const SHOW_CITY_DOTS = false;
    this.clear();
    if (this.actions.music) this.actions.music('menu');
    if (this.actions.menuScene) this.actions.menuScene(false);

    const catalog = getSortedCityCatalog();
    const playableCatalog = getPlayableCityCatalog();
    const playableCount = playableCatalog.length;

    const ACTS = [
      { id: 'ALL', label: 'ALL CITIES' },
      { id: 'PROLOGUE', label: 'PROLOGUE' },
      { id: 'ACT I', label: 'ACT I · PACIFIC' },
      { id: 'ACT II', label: 'ACT II · ASIA' },
      { id: 'ACT III', label: 'ACT III · DESERT' },
      { id: 'ACT IV', label: 'ACT IV · EUROPE' },
      { id: 'ACT V', label: 'ACT V · AMERICAS' },
      { id: 'ACT VI', label: 'ACT VI · NEW YORK' },
      { id: 'ACT VII', label: 'ACT VII · UNBOUND' },
    ];

    // Campaign acts in catalog order (everything but the ALL pseudo-tab).
    const CAMPAIGN_ACTS = ACTS.filter((a) => a.id !== 'ALL');
    const isCleared = (scene) => {
      const r = (this.save?.sandbox || {})[scene];
      return !!(r && (r.completions || 0) > 0);
    };
    // Per-act cleared/total, recomputed on demand (the save can change between renders).
    const actStats = (actId) => {
      const cities = actId === 'ALL' ? catalog : catalog.filter((c) => c.act === actId);
      return { total: cities.length, cleared: cities.filter((c) => isCleared(c.scene)).length, cities };
    };
    const totalCleared = () => actStats('ALL').cleared;
    // Unlock gate for a city: nearest preceding PLAYABLE city in the full
    // catalog (mirrors isCityUnlocked), never an in-development city.
    const gateCityFor = (scene) => {
      const idx = catalog.findIndex((c) => c.scene === scene);
      for (let i = idx - 1; i >= 0; i--) if (catalog[i].status === 'PLAYABLE') return catalog[i];
      return null;
    };

    let selectedAct = initialAct;
    let filteredCatalog = selectedAct === 'ALL' ? catalog : catalog.filter((c) => c.act === selectedAct);

    // Find default active city: highest unlocked or first uncompleted in filtered catalog
    let defaultIndex = 0;
    for (let i = 0; i < filteredCatalog.length; i++) {
      if (isCityUnlocked(this.save, filteredCatalog[i].scene, catalog)) {
        defaultIndex = i;
        const rec = (this.save?.sandbox || {})[filteredCatalog[i].scene];
        if (!rec || (rec.completions || 0) === 0) {
          break;
        }
      }
    }

    let currentIndex = initialIndex !== null
      ? Math.max(0, Math.min(filteredCatalog.length - 1, initialIndex))
      : defaultIndex;

    const s = el(`<div class="screen fw-city-select" role="region" aria-label="City Metropolis Campaign"></div>`);

    // Top Header: Back Button + Title + Campaign Unlock Count
    const header = el(`<div class="city-select-header">
      <button type="button" class="btn secondary city-back-btn" aria-label="Back to Title">← BACK</button>
      <div class="city-header-center">
        <h1 class="city-select-title">SELECT CITY</h1>
        <div class="city-select-sub">GLOBAL 29-METROPOLIS CAMPAIGN</div>
      </div>
      <button type="button" class="city-progress-badge" id="city-progress-badge" aria-label="Open World Tour">
        <span class="progress-text"></span>
      </button>
    </div>`);
    header.querySelector('.city-back-btn').onclick = () => this.showTitle();
    header.querySelector('.city-progress-badge').onclick = () => openWorldTour();
    s.appendChild(header);

    // Act Filter Navigation Tabs
    const actTabsRail = el(`<div class="city-act-filter-rail" role="tablist" aria-label="Campaign Act Filters"></div>`);
    const updateActTabs = () => {
      actTabsRail.innerHTML = '';
      ACTS.forEach((act) => {
        const isActActive = (act.id === selectedAct);
        const st = actStats(act.id);
        const actCleared = st.total > 0 && st.cleared === st.total;
        const actBtn = el(`<button type="button" class="act-tab-btn${isActActive ? ' active' : ''}${actCleared ? ' cleared' : ''}" role="tab" aria-selected="${isActActive ? 'true' : 'false'}" aria-label="${act.label}, ${st.cleared} of ${st.total} cleared">
          <span class="tab-label">${act.label}</span>
          <span class="tab-count">${actCleared ? '✓ ' : ''}${st.cleared}/${st.total}</span>
        </button>`);
        actBtn.onclick = () => {
          if (selectedAct !== act.id) {
            selectedAct = act.id;
            filteredCatalog = selectedAct === 'ALL' ? catalog : catalog.filter((c) => c.act === selectedAct);
            let newIndex = 0;
            for (let i = 0; i < filteredCatalog.length; i++) {
              if (isCityUnlocked(this.save, filteredCatalog[i].scene, catalog)) {
                newIndex = i;
                const rec = (this.save?.sandbox || {})[filteredCatalog[i].scene];
                if (!rec || (rec.completions || 0) === 0) break;
              }
            }
            currentIndex = newIndex;
            updateActTabs();
            renderCard(1);
          }
        };
        actTabsRail.appendChild(actBtn);
      });
    };
    updateActTabs();
    s.appendChild(actTabsRail);

    // Campaign progress strip: one segment per act, width proportional to city
    // count, filled by cleared cities; the act holding the current card glows.
    // The whole strip is a 44px-tall button that opens the World Tour sheet.
    const progressStrip = el(`<button type="button" class="city-progress-strip"></button>`);
    progressStrip.onclick = () => openWorldTour();
    s.appendChild(progressStrip);
    const renderStrip = (currentCity) => {
      const cleared = totalCleared();
      progressStrip.setAttribute('aria-label', `Campaign progress: ${cleared} of ${catalog.length} cleared, open World Tour`);
      progressStrip.innerHTML = `<span class="strip-track">${CAMPAIGN_ACTS.map((act) => {
        const st = actStats(act.id);
        const pct = st.total ? Math.round((st.cleared / st.total) * 100) : 0;
        const isCur = currentCity && currentCity.act === act.id;
        return `<span class="strip-seg${isCur ? ' current' : ''}${pct >= 100 ? ' full' : ''}" style="flex:${st.total}" title="${act.label}: ${st.cleared}/${st.total}"><span class="strip-fill" style="width:${pct}%"></span></span>`;
      }).join('')}</span>`;
    };

    // World Tour sheet: bottom sheet on phones, centred panel on desktop.
    let tourEl = null;
    const closeWorldTour = () => {
      if (!tourEl) return;
      const t = tourEl; tourEl = null;
      t.classList.add('closing');
      setTimeout(() => t.remove(), 200);
    };
    const openWorldTour = () => {
      if (tourEl) return;
      const cur = filteredCatalog[currentIndex];
      const unlockedCount = catalog.filter((c) => isCityUnlocked(this.save, c.scene, catalog)).length;
      tourEl = el(`<div class="world-tour-backdrop" role="presentation">
        <div class="world-tour-sheet" role="dialog" aria-modal="true" aria-label="World Tour campaign map">
          <div class="wt-grip" aria-hidden="true"></div>
          <div class="wt-header">
            <div class="wt-title">WORLD TOUR · ${totalCleared()} / ${catalog.length} CLEARED</div>
            <div class="wt-sub">${unlockedCount} / ${catalog.length} UNLOCKED</div>
            <button type="button" class="wt-close" aria-label="Close World Tour">✕</button>
          </div>
          <div class="wt-scroll">
            ${CAMPAIGN_ACTS.map((act) => {
              const st = actStats(act.id);
              return `<section class="wt-act" aria-label="${act.label}">
                <div class="wt-act-head"><span>${act.label}</span><span class="wt-act-count">${st.cleared === st.total && st.total ? '✓ ' : ''}${st.cleared}/${st.total}</span></div>
                ${st.cities.map((c) => {
                  const gi = catalog.indexOf(c);
                  const unl = isCityUnlocked(this.save, c.scene, catalog);
                  const r = (this.save?.sandbox || {})[c.scene];
                  const clr = isCleared(c.scene);
                  const ch = c.status !== 'DEVELOPMENT' && isCityChallengeCompleted(this.save, c.scene);
                  const glyph = c.status === 'DEVELOPMENT' ? '🚧' : (clr ? (ch ? '⚡' : '✓') : (unl ? '▶' : '🔒'));
                  const state = c.status === 'DEVELOPMENT' ? 'dev' : (clr ? 'cleared' : (unl ? 'open' : 'locked'));
                  const best = (r && r.runs > 0) ? `${Math.round((r.bestPercent || 0) * 100)}%` : '';
                  const gate = gateCityFor(c.scene);
                  const hint = state === 'locked' ? `Clear ${gate ? gate.name : 'the previous city'} 100% in under 5 min` : (state === 'dev' ? 'Coming soon' : '');
                  return `<button type="button" class="wt-row wt-row--${state}${cur && cur.scene === c.scene ? ' current' : ''}" data-scene="${c.scene}" aria-label="City ${gi + 1}, ${c.name}, ${state}${best ? `, best ${best}` : ''}">
                    <span class="wt-glyph" aria-hidden="true">${glyph}</span>
                    <span class="wt-main"><span class="wt-name">${gi + 1}. ${c.name}</span>${hint ? `<span class="wt-hint">${hint}</span>` : ''}</span>
                    <span class="wt-best">${best}</span>
                  </button>`;
                }).join('')}
              </section>`;
            }).join('')}
          </div>
        </div>
      </div>`);
      tourEl.onclick = (e) => { if (e.target === tourEl) closeWorldTour(); };
      tourEl.querySelector('.wt-close').onclick = () => closeWorldTour();
      // Swipe-down on the grip/header dismisses (touch only; the scroll area is left alone).
      let dragY = null;
      const sheet = tourEl.querySelector('.world-tour-sheet');
      sheet.addEventListener('touchstart', (e) => { if (e.target.closest('.wt-scroll')) return; dragY = e.touches[0].clientY; }, { passive: true });
      sheet.addEventListener('touchend', (e) => { if (dragY != null && e.changedTouches[0].clientY - dragY > 60) closeWorldTour(); dragY = null; }, { passive: true });
      tourEl.querySelectorAll('.wt-row').forEach((row) => {
        row.onclick = () => {
          // Jump via the ALL filter: the sheet is the whole-campaign view and the
          // breadcrumb/strip number cities globally, so ALL keeps the carousel
          // index coherent with what the player just tapped (no act-tab surprise).
          const scene = row.dataset.scene;
          selectedAct = 'ALL';
          filteredCatalog = catalog;
          const gi = catalog.findIndex((c) => c.scene === scene);
          const dir = gi >= currentIndex ? 1 : -1;
          currentIndex = Math.max(0, gi);
          closeWorldTour();
          updateActTabs();
          renderCard(dir);
        };
      });
      // Mount on the screen root, not the screen: `.screen` carries a
      // backdrop-filter, which makes it the containing block for position:fixed
      // and would drag the sheet along with the screen's own scroll offset.
      // clear() wipes this.root on navigation, so the sheet cannot outlive the screen.
      this.root.appendChild(tourEl);
      const curRow = tourEl.querySelector('.wt-row.current');
      if (curRow) requestAnimationFrame(() => curRow.scrollIntoView({ block: 'center' }));
    };

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

    // Phone widths (<=480px): the arrows are absolutely positioned over the card,
    // so pin them to the hero emoji band (the only row with empty side gutters)
    // instead of the wrapper's vertical centre, which lands on metrics/dossier.
    // Swipe is the primary control; the arrows are secondary affordances.
    const positionNavArrows = () => {
      if (window.innerWidth > 480) { carouselWrapper.style.removeProperty('--nav-arrow-top'); return; }
      const icon = cardHost.querySelector('.city-icon-float');
      if (!icon) return;
      const ir = icon.getBoundingClientRect();
      const wr = carouselWrapper.getBoundingClientRect();
      carouselWrapper.style.setProperty('--nav-arrow-top', `${Math.round(ir.top + ir.height / 2 - wr.top)}px`);
    };
    window.addEventListener('resize', positionNavArrows);

    // Dots pagination rail — gated off for now (29 numbered buttons never fit a
    // phone; the freed height goes to the act tabs + card). Flip SHOW_CITY_DOTS
    // to bring it back; the render path below is kept intact.
    const dotsRail = el(`<div class="city-dots-rail" role="tablist" aria-label="City Selection Indicators"></div>`);
    if (SHOW_CITY_DOTS) s.appendChild(dotsRail);

    const renderCard = (direction = 0) => {
      cardHost.innerHTML = '';
      dotsRail.innerHTML = '';

      const totalFiltered = filteredCatalog.length;
      if (currentIndex >= totalFiltered) currentIndex = Math.max(0, totalFiltered - 1);
      const city = filteredCatalog[currentIndex];
      const unlocked = isCityUnlocked(this.save, city.scene, catalog);
      const rec = (this.save?.sandbox || {})[city.scene];
      // The city whose clear actually gates this one: nearest preceding PLAYABLE
      // city in the FULL catalog (mirrors isCityUnlocked), not the previous card
      // of the act-filtered carousel and never an in-development city.
      const fullIdx = catalog.findIndex((c) => c.scene === city.scene);
      let gateCity = null;
      for (let i = fullIdx - 1; i >= 0; i--) {
        if (catalog[i].status === 'PLAYABLE') { gateCity = catalog[i]; break; }
      }

      const globalIdx = catalog.indexOf(city);
      const actSt = actStats(city.act);
      const idxInAct = actSt.cities.indexOf(city);
      const progressText = header.querySelector('.progress-text');
      if (progressText) progressText.textContent = `CITY ${globalIdx + 1} / ${catalog.length}`;
      renderStrip(city);

      btnPrev.disabled = (currentIndex === 0);
      btnNext.disabled = (currentIndex === totalFiltered - 1);

      // Render dots (only when the rail is enabled)
      if (SHOW_CITY_DOTS) filteredCatalog.forEach((c, idx) => {
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
      const isDev = city.status === 'DEVELOPMENT';
      const cleared = !isDev && !!(rec && (rec.completions || 0) > 0);
      // Separate achievement: the 3-minute challenge. Can be true without a
      // full clear (save.challenges[scene].completed3m), so it is its own mark.
      const challengeDone = !isDev && isCityChallengeCompleted(this.save, city.scene);
      // Locked and in-development cards share the faded treatment + bottom bar.
      const fadeCls = (!unlocked || isDev) ? ' city-fade' : '';
      // Short phones (360x640 etc.): collapse the dossier so PLAY stays above the fold.
      const dossierCollapsed = (typeof window !== 'undefined') && window.innerHeight < 700;

      const card = el(`<div class="city-card ${(unlocked && !isDev) ? 'city-card--unlocked' : 'city-card--locked'} ${isDev ? 'city-card--dev' : ''} ${animClass}" style="--city-accent: ${city.accentColor};">
        <div class="city-card-glow"></div>
        <div class="city-card-header${fadeCls}">
          <div class="city-badge-group">
            <span class="city-tag city-tag--loc">📍 ${city.location}</span>
            <span class="city-tag city-tag--stage">${city.act}: ${city.actTitle}</span>
          </div>
        </div>
        ${cleared || challengeDone ? `<div class="city-marks" aria-hidden="false">
          ${cleared ? `<div class="city-stamp" aria-label="Cleared"><span class="city-stamp-text">CLEARED</span>${rec.completions > 1 ? `<span class="city-stamp-sub">×${rec.completions}</span>` : ''}</div>` : ''}
          ${challengeDone ? `<div class="city-challenge-badge${cleared ? ' city-challenge-badge--on-stamp' : ''}" aria-label="3-minute challenge completed"><span class="badge-bolt" aria-hidden="true">⚡</span><span class="badge-text">3-MIN ★</span></div>` : ''}
        </div>` : ''}

        <div class="city-hero-block${fadeCls}">
          <div class="city-icon-float" aria-hidden="true">${city.icon}</div>
          <h2 class="city-card-title">${city.name}</h2>
          <div class="city-card-tagline">${city.tagline}</div>
          <div class="city-breadcrumb">CITY ${globalIdx + 1} / ${catalog.length} · ${city.act} · ${idxInAct + 1} / ${actSt.total}</div>
          <div class="city-card-sub">${city.desc}</div>
        </div>

        <!-- SPROCKET MISSION DOSSIER (NARRATIVE DRAWER) -->
        <div class="city-dossier-wrap${fadeCls}${dossierCollapsed ? ' collapsed' : ''}">
          <button type="button" class="dossier-header dossier-toggle" aria-expanded="${dossierCollapsed ? 'false' : 'true'}">
            <span class="dossier-label">⚙️ SPROCKET MISSION DOSSIER</span>
            <span class="dossier-companion-tag">${city.momentumFriend}</span>
            <span class="dossier-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="dossier-body">
          <div class="dossier-directive">
            <strong>DIRECTIVE:</strong> ${city.directive}
          </div>
          <div class="dossier-transmission">
            <em>"${city.transmission}"</em>
          </div>
          <div class="dossier-heroes">
            <span class="dossier-heroes-title">HERO LANDMARKS:</span>
            <div class="dossier-hero-chips">
              ${city.heroes.map(h => `<span class="hero-chip">🏛️ ${h}</span>`).join('')}
            </div>
          </div>
          </div>
        </div>

        <div class="city-metrics-row${fadeCls}">
          <div class="city-metric-box">
            <span class="metric-k">📐 CITY SCALE</span>
            <span class="metric-v">${city.blocks.toLocaleString('en-US')}</span>
            <span class="metric-sub">VOXEL BLOCKS</span>
          </div>
          <div class="city-metric-box">
            <span class="metric-k">DIFFICULTY</span>
            <span class="metric-v">${city.difficulty.split('·')[0].trim()}</span>
            <span class="metric-sub">${city.difficulty.split('·')[1]?.trim() || 'METROPOLIS'}</span>
          </div>
          <div class="city-metric-box">
            <span class="metric-k">MAP COINS</span>
            <span class="metric-v">${city.coinCount} COINS</span>
            <span class="metric-sub">${city.coinValue > 1 ? `×${city.coinValue} (+${city.goalBonus} CLEAR)` : `(+${city.goalBonus} CLEAR)`}</span>
          </div>
        </div>

        <div class="city-records-strip${fadeCls}">
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

        ${(isDev || !unlocked) ? '' : `<div class="city-action-row" style="display:flex; flex-direction:column; gap:8px;">`}
          ${isDev ? `
            <div class="city-lock-bar city-lock-bar--dev" role="status">
              <span class="lock-bar-icon" aria-hidden="true">🚧</span>
              <div class="lock-bar-info">
                <strong>UNDER CONSTRUCTION</strong>
                <span>3D voxel architecture for <strong>${city.name}</strong> is being authored for the world tour.</span>
              </div>
            </div>
          ` : (unlocked ? `
            <button type="button" class="btn fw-cta city-launch-btn">PLAY ${city.name}</button>
            <div style="display:flex; gap:8px; width:100%;">
              <button type="button" class="btn secondary city-challenge-btn" style="flex:1; border-color:#ffd23f; font-size:12px;">
                ${isCityChallengeCompleted(this.save, city.scene) ? '⭐ 3-MIN CLEARED' : '⚡ 3-MIN CHALLENGE (2× COINS)'}
              </button>
              ${isSecret90sChallengeUnlocked(this.save, catalog) ? `
                <button type="button" class="btn primary city-secret90s-btn" style="flex:1; background:linear-gradient(135deg,#ff0054,#7209b7); color:#fff; font-size:12px;">
                  🔥 90s RUN
                </button>
              ` : ''}
            </div>
            ${!isSecret90sChallengeUnlocked(this.save, catalog) ? `
              <div class="fw-stat-note" style="text-align:center; font-size:11px; opacity:0.8;">
                🔒 Secret 90s Challenge: ${getCompletedChallengeCount(this.save, catalog)}/${playableCount} 3m Challenges Complete
              </div>
            ` : ''}
          ` : `
            <div class="city-lock-bar" role="status">
              <span class="lock-bar-icon" aria-hidden="true">🔒</span>
              <div class="lock-bar-info">
                <strong>METROPOLIS LOCKED</strong>
                <span>Clear <strong>${gateCity ? gateCity.name : 'the previous city'}</strong> 100% in under 5 minutes to unlock!</span>
              </div>
            </div>
          `)}
        ${(isDev || !unlocked) ? '' : `</div>`}
      </div>`);

      const dossierToggle = card.querySelector('.dossier-toggle');
      if (dossierToggle) {
        dossierToggle.onclick = () => {
          const wrap = dossierToggle.closest('.city-dossier-wrap');
          const nowCollapsed = wrap.classList.toggle('collapsed');
          dossierToggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
        };
      }
      const launchBtn = card.querySelector('.city-launch-btn:not(.disabled)');
      if (launchBtn) {
        launchBtn.onclick = () => this.actions.startVoxelSandbox(city.scene);
      }
      const challengeBtn = card.querySelector('.city-challenge-btn');
      if (challengeBtn) {
        challengeBtn.onclick = () => {
          if (this.actions.startChallenge) this.actions.startChallenge(city.scene, 'challenge3m');
          else this.actions.startVoxelSandbox(city.scene, 'challenge3m');
        };
      }
      const secret90sBtn = card.querySelector('.city-secret90s-btn');
      if (secret90sBtn) {
        secret90sBtn.onclick = () => {
          if (this.actions.startChallenge) this.actions.startChallenge(city.scene, 'challenge90s');
          else if (this.actions.startRankedRun) this.actions.startRankedRun(city.scene);
        };
      }

      cardHost.appendChild(card);
      positionNavArrows();
      requestAnimationFrame(positionNavArrows);
    };

    btnPrev.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCard(-1);
      }
    };

    btnNext.onclick = () => {
      if (currentIndex < filteredCatalog.length - 1) {
        currentIndex++;
        renderCard(1);
      }
    };

    // Touch swipe support on card host
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
        if (dx < 0 && currentIndex < filteredCatalog.length - 1) {
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
      } else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && currentIndex < filteredCatalog.length - 1) {
        currentIndex++;
        renderCard(1);
      } else if (e.code === 'Escape') {
        window.removeEventListener('keydown', keyNav);
        this.showTitle();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        const city = filteredCatalog[currentIndex];
        if (city && isCityUnlocked(this.save, city.scene, catalog) && city.status !== 'DEVELOPMENT') {
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
    const s = el(`<div class="screen loading-screen">
      <div class="loading-brand">
        <div class="boot-logo">⚙️</div>
        <h2>GENERATING METROPOLIS…</h2>
        <div class="loading-label">${label || 'CITY'}</div>
      </div>
      <div class="boot-loader-box">
        <div class="boot-track">
          <div id="city-progress-bar" class="boot-fill" style="width: 0%;">
            <div class="boot-shimmer"></div>
          </div>
        </div>
        <div class="boot-meta">
          <span id="city-status-text">INITIALIZING ENGINE…</span>
          <span id="city-percentage-text">0%</span>
        </div>
      </div>
    </div>`);
    this.root.appendChild(s);
    this.current = 'loading';

    const bar = s.querySelector('#city-progress-bar');
    const pct = s.querySelector('#city-percentage-text');
    const stat = s.querySelector('#city-status-text');

    let curP = 0;
    let targetP = 25;
    const stages = [
      { t: 60, p: 52, txt: 'PARSING DISTRICTS…' },
      { t: 180, p: 82, txt: 'INSTANCING 3D MESHES…' },
      { t: 340, p: 98, txt: 'INITIALIZING PHYSICS GRAPH…' },
    ];
    stages.forEach(({ t, p: nextP, txt }) => {
      setTimeout(() => {
        if (this.current !== 'loading') return;
        targetP = Math.max(targetP, nextP);
        if (stat) stat.textContent = txt;
      }, t);
    });

    const animate = () => {
      if (this.current !== 'loading') return;
      curP += (targetP - curP) * 0.14;
      if (targetP >= 100 && curP > 99.4) curP = 100;
      const displayP = Math.min(100, Math.round(curP));
      if (bar) bar.style.width = curP.toFixed(1) + '%';
      if (pct) pct.textContent = displayP + '%';
      if (curP < 100) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
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
    const coinVal = sim.coinValue || SANDBOX_COIN_VALUE;
    const goalBonusVal = sim.goalBonus || SANDBOX_GOAL_BONUS;
    const isChallenge = Boolean(sim.isChallenge || sim.mode === 'challenge3m' || sim.mode === 'challenge90s');
    const is90s = sim.mode === 'challenge90s';
    const challengeMult = isChallenge ? (sim.coinMultiplier || 2) : 1;

    const bonus = sim.won ? goalBonusVal : 0;
    const coinsCollected = (typeof sim.coinsCollected === 'number' && !isNaN(sim.coinsCollected)) ? sim.coinsCollected : 0;
    const totalCoins = (sim.coins && Array.isArray(sim.coins)) ? sim.coins.length : 0;
    const coinsEarnedFromMap = coinsCollected * coinVal * challengeMult;
    const effectiveBonus = bonus * challengeMult;
    const coins = coinsEarnedFromMap + effectiveBonus;
    const currentSaveCoins = (typeof this.save.coins === 'number' && !isNaN(this.save.coins)) ? this.save.coins : 0;
    const bankTotal = currentSaveCoins + coins;

    const prev = (this.save.sandbox || {})[sim.scene] || {};
    const h = sim.localHole || sim.hole || {};
    const score = Math.floor(h.mass || 0);
    const best = h.bestCombo || 0;
    const newScore = score > (prev.bestScore || 0);
    const newCombo = best > (prev.bestCombo || 0);
    const cleared = sim.totalMass ? (h.rawMass || 0) / sim.totalMass : 0;
    const clearedPct = sim.won ? 100 : Math.floor(cleared * 100);
    const newPercent = !sim.won && cleared > (prev.bestPercent || 0);
    const elapsed = typeof sim.time === 'number' ? sim.time : 0;
    const newFastest = sim.won && (prev.bestTime == null || elapsed < prev.bestTime);
    const fastestDisplay = sim.won
      ? (newFastest ? elapsed : Math.min(prev.bestTime || elapsed, elapsed))
      : (prev.bestTime ?? null);

    const catalog = getSortedCityCatalog();
    const cityEntry = catalog.find((c) => c.scene === sim.scene);
    const wasUnlockedBefore = isSecret90sChallengeUnlocked(this.save, catalog);
    const completedChallengesCount = getCompletedChallengeCount(this.save, catalog);
    const willUnlockSecret = isChallenge && sim.won && !isCityChallengeCompleted(this.save, sim.scene) && (completedChallengesCount + 1 >= catalog.length) && !wasUnlockedBefore;

    let resultTitle = sim.won ? '🎉 GOAL COMPLETE! 🎉' : "TIME'S UP!";
    if (isChallenge && sim.won) {
      resultTitle = is90s ? '⚡ SECRET 90s RUN COMPLETE! ⚡' : '🏆 3-MIN CHALLENGE CLEARED! 🏆';
    }

    const s = el(`<div class="screen results-screen">
      <div class="results-card">
        <h2>${resultTitle}</h2>
        ${isChallenge ? `<div class="challenge-reward-badge" style="background:#ffd23f; color:#000; font-weight:bold; font-size:12px; padding:4px 8px; border-radius:4px; margin-bottom:8px; display:inline-block;">⭐ 2× COIN MULTIPLIER ACTIVE</div>` : ''}
        ${sim.won && cityEntry ? `<div class="results-debrief-card" style="background: linear-gradient(135deg, rgba(76,201,240,0.15), rgba(157,78,221,0.15)); border: 1.5px solid rgba(76,201,240,0.45); border-radius: 8px; padding: 10px 14px; margin: 10px 0; text-align: left;">
          <div style="font-size: 11px; font-weight: bold; color: #4cc9f0; letter-spacing: 0.08em; text-transform: uppercase;">🌟 KINETIC REVIVAL ACHIEVED · MISSION DEBRIEF</div>
          <div style="font-size: 12.5px; color: #fff; margin-top: 4px; font-style: italic; line-height: 1.4;">"${cityEntry.debrief}"</div>
          ${cityEntry.momentumFriend ? `<div style="font-size: 11px; color: #ffd23f; margin-top: 6px;">⚙️ Rescued Companion: <strong>${cityEntry.momentumFriend}</strong> safely secured in Workshop!</div>` : ''}
        </div>` : ''}
        ${willUnlockSecret ? `<div class="secret-unlock-card" style="background:linear-gradient(135deg,rgba(255,0,84,0.35),rgba(157,78,221,0.35)); border:2px solid #ff0054; border-radius:8px; padding:10px 14px; margin:10px 0; text-align:center;">
          <div style="font-weight:bold; font-size:14px; color:#ffd23f;">🔥 SECRET 90s HYPER RUN UNLOCKED! 🔥</div>
          <div style="font-size:12px; color:#fff; margin-top:2px;">All 3-minute city challenges conquered! The Secret 90s speed challenge is now available across every metropolis!</div>
        </div>` : ''}
        <div class="results-stats">
          <div>${sim.goal.name}</div>
          <div>City cleared <b>${clearedPct}%</b>${newPercent ? ' <span class="rec-new">BEST!</span>' : ''}</div>
          <div>Score <b>${score.toLocaleString('en-US')}</b>${newScore ? ' <span class="rec-new">BEST!</span>' : ''}</div>
          <div>Best chain <b>${best} eats at x${comboMult(best)}</b>${newCombo ? ' <span class="rec-new">BEST!</span>' : ''}</div>
          <div>Time elapsed <b>${elapsed.toFixed(1)}s</b></div>
          ${fastestDisplay !== null ? `<div>Fastest Clear <b>${fastestDisplay.toFixed(1)}s</b>${newFastest ? ' <span class="rec-new">BEST!</span>' : ''}</div>` : ''}
          <div>Coins found <b>${coinsCollected}/${totalCoins} (+${coinsEarnedFromMap})${challengeMult > 1 ? ` [${challengeMult}× MULTIPLIER]` : ''}</b></div>
          ${sim.won ? `<div>Finish bonus <b>+${effectiveBonus}${challengeMult > 1 ? ` [${challengeMult}× BONUS]` : ''}</b></div>` : ''}
          ${coins > 0 ? `<div>Coins earned <b>+${coins}${challengeMult > 1 ? ` (${challengeMult}× CHALLENGE REWARD)` : ''}</b></div>` : ''}
          <div>Bank <b>${bankTotal} COINS</b></div>
        </div>
        <div class="results-actions">
          <button class="btn results-btn-again">${sim.won ? 'PLAY AGAIN' : 'RETRY'}</button>
          <button class="btn secondary results-btn-cities">CHANGE MAP</button>
          <button class="btn secondary results-btn-menu">MAIN MENU</button>
        </div>
      </div>
    </div>`);

    s.querySelector('.results-btn-again').onclick = () => onContinue(false, coins);
    s.querySelector('.results-btn-cities').onclick = () => onContinue('cities', coins);
    s.querySelector('.results-btn-menu').onclick = () => onContinue('menu', coins);
    this.root.appendChild(s);
    this.current = 'results';
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
      // The "how do I get a name" path that used to be injected here is gone
      // with the problem it solved. Every player now arrives holding a name, so
      // there is no nameless state to explain, and the copy it added — that a
      // name comes only from a server-verified run — stopped being true the
      // moment names were handed out on arrival. The profile screen owns the
      // whole name story now (show it, re-roll it, sign in to keep it) and
      // nothing has to be bolted on from out here.
      this.current = 'profile';
    } catch { this.showTitle(); }
  }

  showShop(categoryId = this.activeShopCategory || 'skins') {
    this.clear();
    this.activeShopCategory = categoryId;
    if (this.actions.menuScene) this.actions.menuScene(false);
    if (this.actions.music) this.actions.music('shop');

    // Every count on this screen runs off the AVAILABLE catalog, never the raw
    // one. A withdrawn partner skin in a denominator is a completion figure no
    // player can ever reach, and the seven are unbuyable — so `SKINS.length` is
    // the wrong total the moment approval gating exists.
    const availableSkins = SKINS.filter(isSkinAvailable);
    const totalCosmetics = availableSkins.length + INDICATOR_SKINS.length;
    const ownedCosmetics = [...availableSkins, ...INDICATOR_SKINS].filter(
      (item) => item.price === 0 || (this.save.ownedItems || []).includes(item.id)
    ).length;
    const totalUpgradeRanks = Object.values(this.save.upgrades || {}).reduce((a, b) => a + (b || 0), 0);
    const maxPossibleRanks = UPGRADES.length * MAX_UPGRADE_RANK;

    // Three rows, in this order, and the middle one is the ONLY scroller. The
    // banner and the item grid moved inside .shop-scroll so that the header and
    // the bottom nav are pinned by layout instead of by `position: fixed` — the
    // bar used to be fixed, got captured by .screen's backdrop-filter as its
    // containing block, and scrolled off the phone with the list (see the
    // .shop-screen comment block in css/main.css).
    const s = el(`<div class="screen shop-screen">
      <div class="shop-header">
        <button class="shop-back-btn" id="shop-back-btn">‹ BACK</button>
        <div class="shop-title-block">
          <h2>SHOP</h2>
          <div class="shop-progress-summary">Cosmetics: ${ownedCosmetics}/${totalCosmetics} · Upgrades: ${totalUpgradeRanks}/${maxPossibleRanks}</div>
        </div>
        <div class="shop-coin-pill"><span class="coin-num">${(this.save.coins || 0).toLocaleString()}</span> COINS</div>
      </div>
      <div class="shop-scroll">
        <div class="shop-category-banner"></div>
        <div class="shop-content-area" style="width:100%"></div>
      </div>
      <nav class="shop-tab-bar" role="tablist" aria-label="Shop Categories"></nav>
    </div>`);

    const backBtn = s.querySelector('#shop-back-btn');
    backBtn.onclick = () => this.showTitle();

    // 1. Tab Bar with Category Labels and Badges (Docked at Bottom)
    const tabBar = s.querySelector('.shop-tab-bar');
    const categoryCounts = {
      skins: `${SKINS.filter((s) => !s.family && (s.price === 0 || (this.save.ownedItems || []).includes(s.id))).length}/${SKINS.filter((s) => !s.family).length}`,
      creatures: `${SKINS.filter((s) => s.family === 'creature' && (s.price === 0 || (this.save.ownedItems || []).includes(s.id))).length}/${SKINS.filter((s) => s.family === 'creature').length}`,
      // Both halves off `availableSkins`: the denominator used to be the whole
      // partner shelf, so a gated shelf would have read 1/8 with seven rows the
      // tab could never open.
      partners: `${availableSkins.filter((s) => s.family === 'partner' && (s.price === 0 || (this.save.ownedItems || []).includes(s.id))).length}/${availableSkins.filter((s) => s.family === 'partner').length}`,
      indicators: `${INDICATOR_SKINS.filter((i) => i.price === 0 || (this.save.ownedItems || []).includes(i.id)).length}/${INDICATOR_SKINS.length}`,
      upgrades: `${totalUpgradeRanks}/${maxPossibleRanks}`,
    };

    for (const cat of SHOP_CATEGORIES) {
      const isActive = cat.id === categoryId;
      // .secondary carries no visual weight here (shop-tab has its own style
      // block with higher specificity), but it lets the #screen-root delegated
      // click listener in main.js play audio.uiTap() on every tab switch —
      // the same sound every other secondary button produces. (ADR-0020)
      // `cat.name` (SKINS, CREATURES, …), not `cat.title` ("Partner Agency
      // Tributes"). Five tabs share the width of the phone, which is ~57px of
      // label box at 320px — the long titles were rendering as an ellipsis on
      // every phone size, so the nav named none of its own destinations. The
      // long title still leads the category banner, where there is room for it.
      const tab = el(`<button class="shop-tab secondary ${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive}" id="shop-tab-${cat.id}">
        <span class="tab-label">${cat.name}</span>
        <span class="tab-badge">${categoryCounts[cat.id] || ''}</span>
      </button>`);
      tab.onclick = () => {
        if (cat.id !== this.activeShopCategory) {
          this.showShop(cat.id);
        }
      };
      tabBar.appendChild(tab);
    }

    // 2. Category Banner
    const banner = s.querySelector('.shop-category-banner');
    const currentCatObj = SHOP_CATEGORIES.find((c) => c.id === categoryId) || SHOP_CATEGORIES[0];
    // No `${currentCatObj.icon}` here: SHOP_CATEGORIES carries id/name/title/desc
    // and never had an icon field, so this line printed the literal string
    // "undefined Hole Skins" at the top of every category, on every device.
    banner.innerHTML = `<div>
      <h3>${currentCatObj.title}</h3>
      <p>${currentCatObj.desc}</p>
    </div>`;

    // 3. Category Content
    const contentArea = s.querySelector('.shop-content-area');
    const items = getShopItemsByCategory(categoryId, {
      save: this.save,
      skins: SKINS,
      indicatorSkins: INDICATOR_SKINS,
    });

    if (categoryId === 'upgrades') {
      const grid = el(`<div class="shop-upgrades-grid"></div>`);
      for (const it of items) {
        const currentRank = it.currentRank;
        const currentBoost = currentRank * it.stepPercent;
        const nextBoost = Math.min(it.maxRank * it.stepPercent, (currentRank + 1) * it.stepPercent);
        const cost = it.cost;
        const canAfford = cost !== null && (this.save.coins || 0) >= cost;
        const isMaxed = it.isMaxed;

        // Build 20 discrete pips
        let pipsHtml = '';
        for (let r = 0; r < it.maxRank; r++) {
          const filled = r < currentRank;
          pipsHtml += `<div class="upgrade-pip ${filled ? 'filled' : ''}"></div>`;
        }

        const card = el(`<div class="upgrade-card ${isMaxed ? 'is-maxed' : ''}">
          <div>
            <div class="upgrade-top-row">
              <div class="upgrade-icon-title">
                <div class="upgrade-icon-wrap">${it.icon}</div>
                <div class="upgrade-titles">
                  <h4>${it.name}</h4>
                  <div class="stat-name">${it.statName}</div>
                </div>
              </div>
              <div class="upgrade-rank-pill">${isMaxed ? 'MAXED 👑' : `Rank ${currentRank}/${it.maxRank}`}</div>
            </div>
            <p class="upgrade-desc">${it.desc}</p>
            <div class="upgrade-meter-wrap">
              <div class="upgrade-meter-label">
                <span>Power Boost</span>
                <span class="boost-num">+${currentBoost}%</span>
              </div>
              <div class="upgrade-meter">${pipsHtml}</div>
            </div>
          </div>
          <div class="upgrade-footer">
            <div class="upgrade-next-hint">
              ${isMaxed ? '<span style="color:#ffd23f">Maximum Capability</span>' : `Next: <b>+${nextBoost}%</b> (+${it.stepPercent}%)`}
            </div>
            ${isMaxed
              ? `<button class="upgrade-action-btn maxed" disabled>MAXED</button>`
              : `<button class="upgrade-action-btn primary" ${!canAfford ? 'disabled' : ''}>UPGRADE · ${cost} COINS</button>`
            }
          </div>
        </div>`);

        if (!isMaxed) {
          const btn = card.querySelector('.upgrade-action-btn');
          btn.onclick = () => {
            if (this.actions.buyUpgrade) {
              const res = this.actions.buyUpgrade(it.id);
              if (res && res.success) {
                this.showShop('upgrades');
              }
            }
          };
        }

        grid.appendChild(card);
      }
      contentArea.appendChild(grid);
    } else {
      // Cosmetics (skins, creatures, partners, indicators)
      const grid = el(`<div class="shop-items"></div>`);
      const shots = bakeSkinThumbnails();

      for (const it of items) {
        const owned = it.isOwned;
        const equipped = it.isEquipped;
        const isIndicator = categoryId === 'indicators';

        let art = '';
        if (isIndicator) {
          art = `<div class="swatch" style="background:${it.css};display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;box-shadow:0 0 16px ${it.color ? '#' + it.color.toString(16).padStart(6, '0') : '#38bdf8'}">➤</div>`;
        } else {
          const shot = shots && shots.get(it.id);
          art = shot
            ? `<img class="preview" src="${shot}" alt="">`
            : `<div class="swatch" style="background:${it.css}"></div>`;
        }

        const canAfford = !owned && (this.save.coins || 0) >= it.price;
        const card = el(`<div class="shop-item ${equipped ? 'is-equipped' : ''}">
          <h4>${it.name}</h4>
          ${art}
          <p class="blurb">${it.blurb || ''}</p>
          <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : it.price + ' coins'}</div>
          <div class="card-footer">
            ${equipped
              ? `<button class="btn equipped" disabled>EQUIPPED</button>`
              : (owned
                ? `<button class="btn equip">EQUIP</button>`
                : `<button class="btn buy" ${!canAfford ? 'disabled' : ''}>BUY · ${it.price} COINS</button>`
              )
            }
          </div>
        </div>`);

        const btn = card.querySelector('.btn');
        if (!equipped) {
          btn.onclick = () => {
            if (isIndicator) {
              if (owned) {
                if (this.actions.equipIndicator) this.actions.equipIndicator(it.id);
              } else if (this.actions.buy(it.id, it.price)) {
                if (this.actions.equipIndicator) this.actions.equipIndicator(it.id);
              }
            } else {
              if (owned) {
                if (this.actions.equip) this.actions.equip(it.id);
              } else if (this.actions.buy(it.id, it.price)) {
                if (this.actions.equip) this.actions.equip(it.id);
              }
            }
            this.showShop(categoryId);
          };
        }

        grid.appendChild(card);
      }
      contentArea.appendChild(grid);
    }

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
        <div class="pu-showcase-countdown">Resuming in <b id="pu-count-sec">10</b>s...</div>
        <button class="btn pu-resume-btn" type="button">RESUME (SPACE)</button>
      </div>
    </div>`);

    let remainingMs = 10000;
    let finished = false;
    const countSec = s.querySelector('#pu-count-sec');
    const fill = s.querySelector('.pu-timer-fill');
    const btn = s.querySelector('.pu-resume-btn');
    let timerInterval = null;
    // Named constant so the fill formula and the countdown share the same
    // total duration. A prior edit updated remainingMs to 10 000 but left the
    // fill formula at 6 000, causing the bar to hit 100% at 4 s elapsed and
    // go negative for the remaining 6 s. (ADR-0020)
    const SHOWCASE_TOTAL_MS = 10000;

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
        if (fill) fill.style.width = `${((SHOWCASE_TOTAL_MS - remainingMs) / SHOWCASE_TOTAL_MS) * 100}%`;
      }
    }, tickInterval);

    this.root.appendChild(s);
    this.current = 'pu_showcase';

  }

  showSuperOverdriveTransformation({ powerup, onSkip, onDone, audio, reducedMotion = false, duration = 4.0 } = {}) {
    this.dismissSuperOverdriveTransformation();
    const spec = (powerup && powerup.spec) || (powerup && POWERUP_SPECS[powerup.type]) || {
      id: 'boost',
      name: 'HYPER OVERDRIVE',
      zoomParts: ['HYPER', 'VELOCITY', 'OVERDRIVE!'],
      tagline: 'Maximum Power Surge',
      desc: 'Enhanced velocity and maximum absorption power!',
      color: 0x00f0ff,
    };
    const parts = spec.zoomParts || (spec.name ? spec.name.split(' ') : ['HYPER', 'POWER', 'OVERDRIVE!']);
    while (parts.length < 3) parts.push('OVERDRIVE!');
    const colorHex = '#' + (spec.color != null ? spec.color.toString(16).padStart(6, '0') : '00f0ff');

    const overlay = el(`<div id="overdrive-collect-overlay" class="overdrive-overlay" style="--pu-accent:${colorHex}">
      <div class="overdrive-cinematic-bar top"></div>
      ${reducedMotion ? '' : `
        <div class="overdrive-anamorphic-flare"></div>
        <div class="overdrive-chromatic-pulse"></div>
        <div class="overdrive-energy-aura"></div>
      `}
      <div class="overdrive-zoom-stage stage-1">
        <div class="overdrive-sub-header">✦ ENERGY TRANSFORMATION ACTIVE ✦</div>
        
        <div class="overdrive-word-box word-1">
          <div class="overdrive-word-inner">${parts[0]}</div>
        </div>

        <div class="overdrive-word-box word-2">
          <div class="overdrive-word-inner">${parts[1]}</div>
        </div>

        <div class="overdrive-word-box word-3">
          <div class="overdrive-word-inner">${parts[2]}</div>
        </div>

        <div class="overdrive-reveal-card">
          <div class="overdrive-card-header">
            <div class="overdrive-card-headings">
              <div class="overdrive-card-badge">POWER-UP OVERDRIVE ACTIVE</div>
              <h2 class="overdrive-card-title">${spec.name}</h2>
              <div class="overdrive-card-tagline">${spec.tagline || ''}</div>
            </div>
          </div>
          <p class="overdrive-card-desc">${spec.desc || ''}</p>
          <div class="overdrive-card-meta">
            <span class="overdrive-meta-pill">DURATION: ${spec.duration ? spec.duration + ' SECONDS' : 'INSTANT SHOCKWAVE'}</span>
            <span class="overdrive-meta-pill">STATUS: MAXIMUM BURST</span>
          </div>
          <div class="overdrive-card-hint">SPACE / TAP TO CONTINUE</div>
        </div>
      </div>
      <div class="overdrive-cinematic-bar bottom"></div>
    </div>`);

    let done = false;
    const stage = overlay.querySelector('.overdrive-zoom-stage');
    const timeouts = [];
    
    if (audio) {
      if (audio.playPowerUpTransformation) {
        audio.playPowerUpTransformation({ vol: 1.0 });
      } else if (audio.playBassDrop) {
        audio.playBassDrop({ vol: 1.0 });
      }
    }

    timeouts.push(setTimeout(() => {
      if (done) return;
      if (stage) stage.className = 'overdrive-zoom-stage stage-2';
      if (audio && audio.playDragonballHit2) audio.playDragonballHit2();
    }, 450));

    timeouts.push(setTimeout(() => {
      if (done) return;
      if (stage) stage.className = 'overdrive-zoom-stage stage-3';
      if (audio && audio.playDragonballHit3) audio.playDragonballHit3();
    }, 900));

    timeouts.push(setTimeout(() => {
      if (done) return;
      if (stage) stage.className = 'overdrive-zoom-stage stage-reveal';
    }, 1350));

    const finish = () => {
      if (done) return;
      done = true;
      timeouts.forEach(clearTimeout);
      this.dismissSuperOverdriveTransformation();
      if (typeof onDone === 'function') onDone();
      else if (typeof onSkip === 'function') onSkip();
    };

    const autoDismissTimeout = setTimeout(() => { if (!done) finish(); }, Math.max(10000, duration * 1000));
    const handleSkip = (e) => {
      if (done) return;
      if (e && e.type === 'keydown') {
        if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
        e.preventDefault();
      }
      finish();
    };

    window.addEventListener('keydown', handleSkip);
    overlay.addEventListener('click', handleSkip);
    overlay.addEventListener('touchstart', handleSkip, { passive: true });

    this._overdriveCollectCleanup = () => {
      clearTimeout(autoDismissTimeout);
      timeouts.forEach(clearTimeout);
      window.removeEventListener('keydown', handleSkip);
      overlay.removeEventListener('click', handleSkip);
      overlay.removeEventListener('touchstart', handleSkip);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    document.body.appendChild(overlay);
    this._overdriveCollectOverlayEl = overlay;
    return overlay;
  }

  showCivilDisasterEmergencyCinematic({ onSkip, reducedMotion = false, duration = 5.0, disaster = {} } = {}) {
    this.dismissCivilDisasterEmergencyCinematic();
    const title = disaster.title || 'SEISMIC FAULT LINE RUPTURE';
    const sub = disaster.sub || 'MAGNITUDE: 7.8 RICHTER · EPICENTER: METROPOLIS GRID';

    const overlay = el(`<div id="civil-disaster-overlay" class="civil-emergency-overlay ${reducedMotion ? 'reduced-motion' : ''}">
      <div class="civil-cinematic-bar top">
        <div class="civil-emergency-ticker">⚠️ CIVIL EMERGENCY ALERT · TECTONIC FAULT RUPTURE IN PROGRESS · EVACUATE SURFACE ⚠️</div>
      </div>
      ${reducedMotion ? '' : `
        <div class="civil-anamorphic-flare"></div>
        <div class="civil-chromatic-pulse"></div>
        <div class="civil-seismic-rift-lines"></div>
      `}
      <div class="civil-zoom-stage stage-1" aria-hidden="true">
        <div class="civil-telemetry-badge">${sub}</div>
        <div class="civil-alert-title">${title}</div>
        <div class="civil-prompt-pill">SPACE / TAP TO PROCEED</div>
      </div>
      <div class="civil-cinematic-bar bottom"></div>
    </div>`);

    let done = false;
    const timeouts = [];

    const handleSkip = (e) => {
      if (done) return;
      if (e && e.type === 'keydown') {
        if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
        e.preventDefault();
      }
      done = true;
      this.dismissCivilDisasterEmergencyCinematic();
      if (typeof onSkip === 'function') onSkip();
    };

    const autoDismissTimeout = setTimeout(() => { if (!done) handleSkip(); }, Math.max(10000, duration * 1000));
    window.addEventListener('keydown', handleSkip);
    overlay.addEventListener('click', handleSkip);
    overlay.addEventListener('touchstart', handleSkip, { passive: true });

    this._civilDisasterCleanup = () => {
      clearTimeout(autoDismissTimeout);
      timeouts.forEach(clearTimeout);
      window.removeEventListener('keydown', handleSkip);
      overlay.removeEventListener('click', handleSkip);
      overlay.removeEventListener('touchstart', handleSkip);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    document.body.appendChild(overlay);
    this._civilDisasterOverlayEl = overlay;
    return overlay;
  }

  showEarthquakeCinematic(opts) {
    return this.showCivilDisasterEmergencyCinematic(opts);
  }

  dismissCivilDisasterEmergencyCinematic() {
    if (this._civilDisasterOverlayEl) {
      this._civilDisasterOverlayEl.classList.add('fading-out');
      const cleanup = this._civilDisasterCleanup;
      setTimeout(() => {
        if (cleanup) cleanup();
      }, 250);
      this._civilDisasterOverlayEl = null;
      this._civilDisasterCleanup = null;
    }
  }

  dismissEarthquakeCinematic() {
    this.dismissCivilDisasterEmergencyCinematic();
  }

  showOrbitalBeaconNotification(powerup) {
    const spec = (powerup && powerup.spec) || (typeof POWERUP_SPECS !== 'undefined' && POWERUP_SPECS[powerup && powerup.type]) || {};
    const name = spec.name || 'POWER-UP';
    const desc = spec.desc || spec.tagline || 'Supercharge active effect boost enabled!';
    const puType = powerup && powerup.type;
    const icon = spec.icon || (puType === 'vortex' ? '🌀' : puType === 'speed' ? '⚡' : puType === 'titan' ? '🍄' : puType === 'quake' ? '🌋' : puType === 'frenzy' ? '🔥' : puType === 'chrono' ? '⏳' : '⚡');
    const colorHex = '#' + (spec.color != null ? spec.color.toString(16).padStart(6, '0') : 'ffd23f');
    const glowHex = '#' + (spec.glowColor != null ? spec.glowColor.toString(16).padStart(6, '0') : 'ff9e00');

    if (typeof document === 'undefined') return;

    const overlay = el(`<div id="poke-encounter-overlay" style="--poke-color: ${colorHex}; --poke-glow: ${glowHex};">
      <div class="poke-battle-wipe left"></div>
      <div class="poke-battle-wipe right"></div>
      <div class="poke-radial-burst"></div>
      <div class="poke-encounter-card">
        <div class="poke-card-header">
          <div class="poke-wild-title" style="font-size:clamp(11px,2.2vw,14px);font-weight:900;letter-spacing:2px;color:var(--poke-color);text-shadow:0 0 12px var(--poke-glow);">⚡ A WILD ${name.toUpperCase()} HAS APPEARED! ⚡</div>
          <div class="poke-rarity-badge">LEGENDARY</div>
        </div>
        <div class="poke-card-body">
          <div class="poke-icon-circle">
            <div class="poke-icon-aura"></div>
            <div class="poke-icon">${icon}</div>
          </div>
          <div class="poke-info">
            <div class="poke-name-row">
              <h2 class="poke-powerup-name">${name}</h2>
            </div>
            <p class="poke-flavor-text" style="font-size:clamp(11px,2.2vw,13px);font-weight:600;color:rgba(255,255,255,0.9);margin-top:6px;line-height:1.4;">${desc}</p>
          </div>
        </div>
      </div>
    </div>`);

    document.body.appendChild(overlay);
    this._activePokeEncounter = overlay;

    setTimeout(() => {
      overlay.classList.add('fading-out');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (this._activePokeEncounter === overlay) this._activePokeEncounter = null;
      }, 350);
    }, 3650);
  }

  showPokemonEncounterModal({ powerup, onSkip } = {}) {
    this.showOrbitalBeaconNotification(powerup);
    this._pokeEncounterSkip = typeof onSkip === 'function' ? onSkip : null;
  }

  // The teardown path (js/main.js teardownWorld) and any other early exit.
  dismissPokemonEncounterModal() {
    if (this._activePokeEncounter) {
      if (this._activePokeEncounter.parentNode) {
        this._activePokeEncounter.parentNode.removeChild(this._activePokeEncounter);
      }
      this._activePokeEncounter = null;
    }
    const cb = this._pokeEncounterSkip;
    this._pokeEncounterSkip = null;
    if (typeof cb === 'function') cb();
  }

  showResults(level, sim, onContinue) {
    this.clear();
    if (this.actions.music) this.actions.music('results', { restart: true });
    const stars = starsForResult(level, sim.timeLeft, sim.won);
    const coins = coinsForResult(level, stars, sim.player.bestCombo);
    const elapsed = typeof sim.elapsedTime === 'number' ? sim.elapsedTime : Math.max(0, (level.time || 300) - (sim.timeLeft || 0));
    const prev = (this.save.levels || {})[level.index] || {};
    const newFastest = sim.won && (prev.fastestClear == null || elapsed < prev.fastestClear);
    const fastestDisplay = sim.won
      ? (newFastest ? elapsed : Math.min(prev.fastestClear || elapsed, elapsed))
      : (prev.fastestClear ?? null);

    const s = el(`<div class="screen results-screen">
      <div class="results-card">
        <h2>${sim.won ? '🎉 LEVEL COMPLETE! 🎉' : "TIME'S UP!"}</h2>
        <div class="results-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="results-stats">
          <div>Mass <b>${Math.floor(sim.player.mass)} / ${level.target}</b></div>
          <div>Time elapsed <b>${elapsed.toFixed(1)}s</b></div>
          ${fastestDisplay !== null ? `<div>Fastest Clear <b>${fastestDisplay.toFixed(1)}s</b>${newFastest ? ' <span class="rec-new">BEST!</span>' : ''}</div>` : ''}
          <div>Time left <b>${Math.ceil(sim.timeLeft)}s</b></div>
          <div>Best chain <b>${sim.player.bestCombo} eats at x${campaignComboMult(sim.player.bestCombo).toFixed(1)}</b></div>
          <div>Coins earned <b>+${coins}</b></div>
        </div>
        <div class="results-actions">
          <button class="btn results-btn-cont">${sim.won ? 'CONTINUE' : 'RETRY'}</button>
          <button class="btn secondary results-btn-cities">CHANGE MAP</button>
          <button class="btn secondary results-btn-menu">MAIN MENU</button>
        </div>
      </div>
    </div>`);

    s.querySelector('.results-btn-cont').onclick = () => onContinue(stars, coins, false);
    s.querySelector('.results-btn-cities').onclick = () => onContinue(stars, coins, 'cities');
    s.querySelector('.results-btn-menu').onclick = () => onContinue(stars, coins, 'menu');
    this.root.appendChild(s);
    this.current = 'results';
  }

  showPause() {
    this.clear();
    if (this.actions.music) this.actions.music('pause');
    const isTouch = isTouchDevice();
    // Pause is a panic surface: the two things a player reaches for under time
    // pressure are RESTART and CITIES, and at 844x390 landscape — how a phone
    // is actually held for this game — the inline 9-track music picker held the
    // slot above them and pushed them to y=556 and y=622 on a 390px screen.
    // Under 700px of viewport height the actions lay out as a grid and the
    // picker collapses to one row; see .pause-actions / .pause-music.collapsed
    // in css/main.css.
    const shortView = window.innerHeight < 700;
    const s = el(`<div class="screen">
      <h2>PAUSED</h2>
      <div class="pause-ctrl-hint" style="font-size:11px; font-weight:700; color:rgba(255,210,63,0.85); background:rgba(12,16,28,0.7); border:1px solid rgba(255,210,63,0.25); border-radius:12px; padding:6px 14px; margin-bottom:8px; text-align:center;">
        ${isTouch ? '🕹️ Left: Steer · 🔄 Right: Look · 🤏 Pinch/Expand: Zoom' : '⌨️ WASD: Move · Q/E: Orbit · R/F or Scroll: Zoom · Esc: Resume'}
      </div>
    </div>`);
    const resume = el(`<button class="btn">RESUME</button>`);
    resume.onclick = () => this.actions.resume();
    const settings = el(`<button class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showPause());
    const help = el(`<button class="btn secondary">HELP & FAQ</button>`);
    help.onclick = () => this.showHelp(() => this.showPause());

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
    // One group, primary actions first: the picker can never come between
    // RESTART/CITIES and the fold again, at any viewport, because it is no
    // longer between them in the DOM.
    const pauseActions = el(`<div class="pause-actions"></div>`);
    pauseActions.append(resume, restart, quit, settings, help);
    s.appendChild(pauseActions);
    // MUSIC picker: the session override from js/audio/tracklist.js — the
    // default pool plus one row per unlocked city. Selecting a track starts
    // it immediately (that doubles as the preview), and the choice holds
    // until the run ends. Buttons update in place rather than re-rendering
    // via showPause(), which would re-request the pause theme over the
    // track the player just asked to hear.
    if (this.actions.musicTracks && this.actions.musicSelect) {
      const nowPlaying = this.actions.nowPlaying ? this.actions.nowPlaying() : null;
      const tracks = this.actions.musicTracks();
      const current = tracks.find((t) => t.cue === nowPlaying);
      const musicBox = el(`<div class="pause-music${shortView ? ' collapsed' : ''}"></div>`);
      // The picker is exploratory, so on a short viewport it costs one row and
      // opens on demand — the same progressive-disclosure deal the City Select
      // dossier makes. The row still names the track that is playing, so the
      // collapsed state answers "what is this?" without being opened.
      const toggle = el(`<button class="btn secondary pause-music-toggle" aria-expanded="${!shortView}">
        <span class="pause-music-k">MUSIC</span>
        <span class="pause-music-now">${current ? current.label : '—'}</span>
        <span class="pause-music-caret" aria-hidden="true">▾</span>
      </button>`);
      const now = toggle.querySelector('.pause-music-now');
      toggle.onclick = () => {
        const open = !musicBox.classList.toggle('collapsed');
        toggle.setAttribute('aria-expanded', String(open));
      };
      const list = el(`<div class="pause-music-list"></div>`);
      for (const track of tracks) {
        const b = el(`<button class="btn secondary pause-music-track">${track.label}</button>`);
        if (track.cue === nowPlaying) b.classList.add('playing');
        b.onclick = () => {
          if (!this.actions.musicSelect(track.cue)) return;
          list.querySelectorAll('.pause-music-track').forEach((x) => x.classList.remove('playing'));
          b.classList.add('playing');
          now.textContent = track.label;
        };
        list.appendChild(b);
      }
      musicBox.append(toggle, list);
      s.appendChild(musicBox);
    }
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

    // 4 audio sliders: Master volume scales all output proportionally;
    // SFX (30%), Music (25%), Ambience (15%) set individual bus levels.
    const masterVol = typeof st.masterVol === 'number' ? st.masterVol : (this.actions.masterVolume ? this.actions.masterVolume() : DEFAULT_MASTER_VOLUME);
    const masterRow = el(`<div class="set-row"><span class="set-label">🎛️ Master volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Master volume" value="${masterVol}"></span></div>`);
    const masterSlider = masterRow.querySelector('input');
    masterSlider.oninput = () => {
      st.masterVol = parseFloat(masterSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(masterRow);

    // Effects volume (SFX: crashes, gulps, powerups, UI)
    const volRow = el(`<div class="set-row"><span class="set-label">🔊 Effects volume (SFX)</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Effects volume" value="${st.sfxVol !== undefined ? st.sfxVol : DEFAULT_SFX_VOLUME}"></span></div>`);
    const volSlider = volRow.querySelector('input');
    volSlider.oninput = () => {
      st.sfxVol = parseFloat(volSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(volRow);

    // Music volume (score / soundtracks)
    const musicVol = typeof st.musicVol === 'number' ? st.musicVol : (this.actions.musicVolume ? this.actions.musicVolume() : DEFAULT_MUSIC_VOLUME);
    const musicRow = el(`<div class="set-row"><span class="set-label">🎵 Music volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Music volume" value="${musicVol}"></span></div>`);
    const musicSlider = musicRow.querySelector('input');
    musicSlider.oninput = () => {
      st.musicVol = parseFloat(musicSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(musicRow);

    // Ambience volume (city beds, harbor, wind)
    const ambRow = el(`<div class="set-row"><span class="set-label">🌆 Ambience volume</span>
      <span class="set-val"><input type="range" min="0" max="1" step="0.05"
        aria-label="Ambience volume" value="${st.ambVol !== undefined ? st.ambVol : DEFAULT_AMBIENCE_VOLUME}"></span></div>`);
    const ambSlider = ambRow.querySelector('input');
    ambSlider.oninput = () => {
      st.ambVol = parseFloat(ambSlider.value);
      this.actions.applySettings();
    };
    panel.appendChild(ambRow);

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

    const helpRow = el(`<div class="set-row"><span class="set-label">📖 Academy & Walkthrough</span>
      <span class="set-val"><button class="btn secondary">OPEN HELP & FAQ</button></span></div>`);
    helpRow.querySelector('button').onclick = () => this.showHelp(() => this.showSettings(onBack));
    panel.appendChild(helpRow);

    s.appendChild(panel);
    const back = el(`<button class="btn set-back">BACK</button>`);
    back.onclick = onBack;
    s.appendChild(back);
    this.root.appendChild(s);
    this.current = 'settings';
  }

  async showHelp(onBack = () => this.showTitle()) {
    this.clear();
    try {
      const { renderHelp } = await import('./help.js');
      await renderHelp(this.root, {
        save: this.save,
        onBack: onBack || (() => this.showTitle()),
      });
      this.current = 'help';
    } catch (err) {
      console.error('Failed to load help screen:', err);
      if (onBack) onBack();
      else this.showTitle();
    }
  }
}

