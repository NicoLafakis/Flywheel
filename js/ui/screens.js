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

// The free-play shelf on the landing screen. Brooklyn leads because it was the
// first showcase scene; Boston is the second and carries the same establishing
// shot and READY gate, so only Brooklyn keeps the pill — two tags side by side
// read as a bug rather than an endorsement. The pill says START HERE because
// 'Showcase' answered no question a player was asking (playtest finding). The
// generic sandbox trails because it is a physics test bed, not a place.
// `scene` is passed straight to actions.startVoxelSandbox(); the sandbox entry
// omits it so the undefined lands on that function's own 'gallery' default,
// which keeps the scene id written down in exactly one place (js/main.js).
const FREE_PLAY = [
  { scene: 'brooklyn', name: 'BROOKLYN', sub: 'Bridges to Coney Island', tag: 'START HERE' },
  { scene: 'boston', name: 'BOSTON', sub: 'Seaport and the Convention Center' },
  { scene: 'cambridge', name: 'CAMBRIDGE', sub: 'Canal Park to the Portuguese seam' },
  { scene: 'chicago', name: 'CHICAGO', sub: 'The Loop & Willis Tower' },
  { scene: 'manhattan', name: 'LOWER MANHATTAN', sub: 'Downtown towers' },
  { scene: 'upper-manhattan', name: 'UPPER MANHATTAN', sub: 'Central Park' },
  { name: 'SANDBOX', sub: 'Physics playground' },
];

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

  // The landing screen. Three tiers, in this order: the mark and the name, the
  // one campaign entry, then the free-play shelf, then the utilities. The old
  // version stacked seven buttons of identical weight, which said nothing about
  // which of them was the game.
  showTitle() {
    this.clear();
    if (this.actions.music) this.actions.music('menu');
    // The live city behind this screen (js/ui/menuscene.js). Mounting the
    // landing screen is what turns it on and every takeover below turns it off,
    // so its lifetime is exactly this screen's lifetime and no caller has to
    // remember either half.
    if (this.actions.menuScene) this.actions.menuScene(true);
    // Two independent sources of "hold still": the in-game setting, read here,
    // and the OS preference, handled by the prefers-reduced-motion block in
    // main.css. Either one alone is enough to park the sprocket and the letters.
    const still = !!(this.save.settings && this.save.settings.reducedMotion);
    const s = el(`<div class="screen fw-landing${still ? ' fw-still' : ''}"></div>`);

    // The wordmark is decorative type (aria-hidden), so the accessible name for
    // the screen is stated once here and never read twice.
    s.appendChild(el(`<h1 class="fw-a11y">Flywheel. A sprocket's story.</h1>`));

    const hero = el(`<div class="fw-hero"></div>`);
    hero.appendChild(buildSprocket());
    const heroText = el(`<div class="fw-hero-text"></div>`);
    // 8 = the letter count of FLYWHEEL, so it renders at full size and only a
    // longer name would ever be scaled down.
    heroText.appendChild(buildBlockWord('FLYWHEEL', { fitChars: 8 }));
    heroText.appendChild(el(`<div class="fw-plate">A SPROCKET'S STORY</div>`));
    hero.appendChild(heroText);
    s.appendChild(hero);

    // Sandboxes are the game now: Brooklyn is the first city, not a campaign map.
    // The CTA names the city because it hard-launches Brooklyn — 'PLAY A CITY'
    // promised a choice it never offered (playtest finding).
    const ctaWrap = el(`<div class="fw-cta-wrap"></div>`);
    const play = el(`<button type="button" class="fw-cta">PLAY BROOKLYN</button>`);
    play.onclick = () => this.actions.startVoxelSandbox('brooklyn');
    ctaWrap.appendChild(play);
    s.appendChild(ctaWrap);

    // Returning-player recognition (playtest finding: a seeded save rendered
    // byte-identical to a first visit). The bank belongs on the front door, not
    // three screens deep in SHOP — and next to it, what the bank is FOR: the
    // next rung it has not reached yet, named, with the gap to it.
    //
    // Every value here is read from the save. A first-run player has no record
    // and no bank, so the whole strip is absent rather than rendered full of
    // zeroes — the strip is recognition, and there is nothing yet to recognise.
    //
    // The strip can never render as an empty bordered box: BEST SCORE is
    // optional, but the coin row below it is an if/else and both arms append, so
    // any save that opens this block contributes at least one cell. Anything
    // added here that is conditional on BOTH sides has to bring its own guard.
    // The identity chip below is the same shape of promise in the other
    // direction — it is an if/else with no third arm, so when boards are on it
    // ADDS a cell and can never be the reason the row is empty.
    const pb = personalBest(this.save);
    const unlock = nextUnlock(this.save);
    if (this.save.coins > 0 || pb.runs > 0) {
      const strip = el(`<div class="fw-status"></div>`);
      // Who the player IS heads the row that holds their records — this strip is
      // the player's own line, and identity belongs at the front of it. It used
      // to be a PROFILE button in the utility row beside SHOP, gated on
      // `save.player.name`, which hid the one screen that explains how to get a
      // name from precisely the players who do not have one. Both states are
      // the same control now: named, it says who you are; unnamed, it says the
      // name is available and what it costs to get. One door to one room.
      if (BOARDS_ENABLED) {
        const claimed = this.save.player && this.save.player.name;
        const id = el(`<button type="button" class="fw-stat fw-id${claimed ? '' : ' fw-id--none'}">
          <span class="fw-stat-k">PLAYER</span>
          <span class="fw-stat-v"></span>
          <span class="fw-stat-note">${claimed ? 'VIEW PROFILE' : 'HOW TO CLAIM ONE'}</span>
        </button>`);
        // textContent, not interpolation: every other value on this screen comes
        // from a registry or is a number, but a board name is text a player
        // typed. It is server-validated on claim and it is still not markup.
        id.querySelector('.fw-stat-v').textContent = claimed ? this.save.player.name : 'NO NAME YET';
        id.setAttribute('aria-label', claimed
          ? `Profile for ${this.save.player.name}`
          : 'No board name yet. Open the profile screen to see how to claim one.');
        id.onclick = () => this.showProfile();
        strip.appendChild(id);
      }
      if (pb.score !== null) {
        strip.appendChild(el(`<div class="fw-stat"><span class="fw-stat-k">BEST SCORE</span><span class="fw-stat-v">${pb.score.toLocaleString('en-US')}</span></div>`));
      }
      if (unlock) {
        // Width is set once, at render, on a transform-scaled fill — the bar
        // never animates a layout property.
        //
        // Two states, and they are genuinely different sentences. While the bank
        // is short, this is a GOAL: a bar, the gap in coins, and the price to
        // beat. Once the bank covers the price it is an OFFER, so the bar goes
        // entirely — a full bar plus a countdown label is a progress meter for a
        // journey already finished, and it read as pending next to a card that
        // said UNLOCKS AT. The locked card below switches on the same flag, so
        // the strip and the card can never disagree about whether the player can
        // buy the thing.
        const need = Math.max(0, unlock.price - this.save.coins);
        const pct = Math.max(0, Math.min(1, this.save.coins / unlock.price));
        strip.appendChild(need > 0
          ? el(`<div class="fw-stat fw-stat--goal">
              <span class="fw-stat-k">🪙 ${this.save.coins} · NEXT UNLOCK ${unlock.price}</span>
              <span class="fw-bar"><span class="fw-bar-fill" style="transform:scaleX(${pct.toFixed(3)})"></span></span>
              <span class="fw-stat-note">${need} to go</span>
            </div>`)
          : el(`<div class="fw-stat fw-stat--goal fw-stat--ready">
              <span class="fw-stat-k">🪙 ${this.save.coins} · READY TO BUY</span>
              <span class="fw-stat-v">${unlock.name}</span>
              <span class="fw-stat-note">${unlock.price} coins · get it in the shop</span>
            </div>`));
      } else {
        strip.appendChild(el(`<div class="fw-stat fw-stat--goal"><span class="fw-stat-k">🪙 ${this.save.coins}</span><span class="fw-stat-note">everything unlocked</span></div>`));
      }
      s.appendChild(strip);
    }

    const group = el(`<section class="fw-group" aria-labelledby="fw-free-play"></section>`);
    group.appendChild(el(`<div class="fw-group-label" id="fw-free-play">Choose a city · collect coins · grow big</div>`));
    const chips = el(`<div class="fw-chips"></div>`);
    let stagger = 0;
    for (const sc of FREE_PLAY) {
      // The SANDBOX entry carries no scene id; 'gallery' is startVoxelSandbox's
      // own default and the key recordSandboxResult writes under.
      const rec = (this.save.sandbox || {})[sc.scene || 'gallery'];
      // Two different sentences, because the 180 s clock made them two different
      // facts (R-2.6). CLEARED ×N is reserved for genuine full clears of the
      // whole city and would read as a lie on a run that ended at 4%; every
      // other player who has finished a run gets the record they actually set,
      // which is how far they got. A record from before the migration has no
      // `runs`, so it falls back to `completions` and keeps its old line.
      const runs = rec ? (rec.runs ?? rec.completions ?? 0) : 0;
      const progress = rec && rec.completions > 0
        ? `<span class="fw-chip-progress">CLEARED ×${rec.completions} · BEST SIZE ${rec.bestSize}</span>`
        : (runs > 0
          ? `<span class="fw-chip-progress">BEST ${Math.floor((rec.bestPercent || 0) * 100)}% · SIZE ${rec.bestSize}</span>`
          : '');
      // --i drives the entrance stagger in css/main.css: 40 ms per item, and the
      // index keeps counting across the locked card below so the whole shelf
      // deals out in one pass rather than in two overlapping ones.
      const chip = el(`<button type="button" class="fw-chip${sc.tag ? ' fw-chip--lead' : ''}" style="--i:${stagger++}">
        <span class="fw-chip-name">${sc.name}</span>
        <span class="fw-chip-sub">${sc.sub}</span>
        ${progress}
        ${sc.tag ? `<span class="fw-chip-tag">${sc.tag}</span>` : ''}
      </button>`);
      chip.onclick = () => this.actions.startVoxelSandbox(sc.scene);
      chips.appendChild(chip);
    }
    // One locked thing, named, with its condition in words. Every city is open
    // — nothing in the save gates a scene — so the only genuinely locked
    // content in this game is what coins buy, and this is the goal row from
    // nextUnlock: the cheapest row the bank has not reached yet (or, once every
    // remaining row is affordable, the cheapest unbought one), drawn as a
    // silhouette: the shape is there, the colour is not. It reads as a card in
    // the same shelf because it is the same shelf: this is where "what's next"
    // lives. Clicking it goes to the shop, which is where the condition is met.
    if (unlock) {
      // Locked and affordable are two states of one card, not one state. The
      // card used to print its price unconditionally, so a player holding 240
      // coins was told a 100-coin skin "UNLOCKS AT 100 COINS" — a condition
      // already met, drawn as a silhouette. Same flag as the strip above.
      const affordable = this.save.coins >= unlock.price;
      const card = el(`<button type="button" class="fw-chip ${affordable ? 'fw-chip--ready' : 'fw-chip--locked'}" style="--i:${stagger++}">
        <span class="fw-lock-art" aria-hidden="true"></span>
        <span class="fw-chip-name">${unlock.name}</span>
        <span class="fw-chip-sub">${unlock.kind}</span>
        <span class="fw-chip-progress">${affordable ? `BUY NOW · ${unlock.price} COINS` : `UNLOCKS AT ${unlock.price} COINS`}</span>
      </button>`);
      card.onclick = () => this.showShop();
      chips.appendChild(card);
    }
    group.appendChild(chips);
    s.appendChild(group);

    const util = el(`<div class="fw-utility"></div>`);
    if (BOARDS_ENABLED) {
      // THE RUN is deliberately a separate, bounded score attack rather than a
      // disguised city clear. Chicago is the first ranked city because it is the
      // measured low-cost verifier route; more cities join only after their own
      // replay-budget gate passes.
      const run = el(`<div class="fw-utility"><button type="button" class="btn secondary">RUN CHICAGO · 90 SECONDS</button></div>`);
      run.querySelector('button').onclick = () => this.actions.startRankedRun('chicago');
      s.appendChild(run);
      const records = el(`<button type="button" class="btn secondary">RECORDS</button>`);
      records.onclick = () => this.showBoards();
      util.appendChild(records);
      // No PROFILE button here. The identity chip at the head of the status
      // strip is the one route to that screen; a second door in the utility row
      // would be the same room reached two ways, and this row is for the places
      // that are not about the player (RECORDS is everyone's, SHOP and SETTINGS
      // are the game's).
    }
    const shop = el(`<button type="button" class="btn secondary">SHOP</button>`);
    shop.onclick = () => this.showShop();
    const settings = el(`<button type="button" class="btn secondary">SETTINGS</button>`);
    settings.onclick = () => this.showSettings(() => this.showTitle());
    util.append(shop, settings);
    s.appendChild(util);

    // The screen's footer: the CC0 sound manifest and the legal line. ONE child
    // of the landing stack rather than two, because they are one block — and
    // because .fw-landing's gap is a section gap (up to 24px), which is the
    // wrong distance between two lines of the same fine print and is pure
    // vertical cost on a screen that already scrolls at typical desktop heights.
    const foot = el(`<div class="fw-foot"></div>`);
    // The same CC0 sound manifest the arena landing carries (arena.html
    // #sound-credits): not legally required, given anyway.
    foot.appendChild(el(`<div class="fw-credits">SOUND EFFECTS · CC0 · KENNEY.NL · OPENGAMEART (THIMRAS, RANGO MANGO) ·
      FREESOUND (THAIGHAUDIO, COGNITO PERCEPTU, BRAINCLAIM, CRAIGSMITH,
      METROSTOCK99, QUBODUP, PUSHKIN, MRRAP4FOOD, DRBODKIN, TAKAREADS)</div>`));

    // Fine print, and drawn as fine print — quieter than the sound manifest
    // above it, because the manifest is a thank-you and this is a footer. Plain
    // <a> to two plain documents rather than buttons into the state machine:
    // privacy.html and terms.html are standalone pages that have to render for
    // someone who arrives on a shared link with the game never booting, so the
    // route to them is the same route a search engine or a store review would
    // take. Same-origin, no target, so the back button returns to the title.
    foot.appendChild(el(`<div class="fw-legal">
      <a href="privacy.html">PRIVACY</a>
      <a href="terms.html">TERMS</a>
    </div>`));
    s.appendChild(foot);

    this.root.appendChild(s);
    this.current = 'title';
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
    this.showTitle();
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
    const bonus = sim.won ? SANDBOX_GOAL_BONUS : 0;
    const coins = sim.coinsCollected * SANDBOX_COIN_VALUE + bonus;
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
      <div>Coins found <b>${sim.coinsCollected}/${sim.coins.length}</b></div>
      ${sim.won ? `<div>Finish bonus <b>+${SANDBOX_GOAL_BONUS}</b></div>` : ''}
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
        onStartCampaign: () => this.showLevelSelect(),
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
        onStartCampaign: () => this.showLevelSelect(),
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
