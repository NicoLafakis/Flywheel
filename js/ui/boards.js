// Lazy UI for the public records, personal archives & player identity.
// It is intentionally imported only from the title/results actions so a normal
// offline city session never pays for it.

import { leaderboard, playerCityRecords, playerStanding } from '../board/read.js';
import { claimName, deviceKey, removePlayer, startTransfer, redeemTransfer, renamePlayer, registerPlayer, loginPlayer, playerSecret, signOutPlayer } from '../board/player.js';
import { syncStatus, lastTrimmed } from '../cloud/sync.js';
import { SYNC_DETAIL, syncIndicator, shouldShowFirstNote, markFirstNoteShown, firstNoteText, trimmedNoticeText } from './sync-copy.js';
import { post } from '../board/request.js';
import { comboMult, comboLevel, COMBO_LEVEL_NAMES } from '../voxelsim.js';
import { ensurePlayer, storeSave, playerName, rerollPlayerName } from '../save.js';
import { CITY_CATALOG } from '../citycatalog.js';

// How many players the leaderboard shows. Not a database concern: the view
// materializes every player and the cut is a presentation decision, which is
// why it lives here and in one place.
const LEADERBOARD_SIZE = 10;

/**
 * The top-ten cut, tie-aware and pure so it can be asserted headlessly.
 *
 * `v_leaderboard.rank` is a `dense_rank()`, so three players tied on total score
 * all hold rank 10 and all three genuinely ARE tenth. Slicing the array to ten
 * rows would drop two of them out of a place they hold, which is the one thing a
 * leaderboard may not do. So the cut is on the RANK, not on the row count, and
 * the returned list can legitimately be longer than `limit`.
 *
 * A row with no rank at all (an older offline cache, or a view that changed
 * shape) still has to render something rather than vanishing, so those fall back
 * to their arrival order and are capped at `limit`.
 */
export function topTen(rows, limit = LEADERBOARD_SIZE) {
  if (!Array.isArray(rows)) return [];
  const ranked = rows.filter((row) => row && Number.isFinite(Number(row.rank)));
  if (ranked.length !== rows.length) return rows.filter(Boolean).slice(0, limit);
  return ranked.filter((row) => Number(row.rank) <= limit);
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label, secondary = false) {
  const node = element('button', `btn${secondary ? ' secondary' : ''}`, label);
  node.type = 'button';
  return node;
}

function formatTime(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}.${ms}s`;
}

function formatCombo(chain) {
  if (!chain || chain <= 0) return '—';
  const mult = comboMult(chain);
  const lvl = comboLevel(chain);
  const name = COMBO_LEVEL_NAMES[lvl] || '';
  return `⚡ ${chain} (x${mult}${name === 'MAX' ? ' MAX' : ''})`;
}

function rankBadge(rank) {
  if (rank === 1) return '🥇 1';
  if (rank === 2) return '🥈 2';
  if (rank === 3) return '🥉 3';
  return String(rank || '—');
}

function score(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

/**
 * THE leaderboard: every player, all time, ranked by the sum of their best
 * verified score on each city.
 *
 * `Cities` is not decoration — it is the column that explains the total. Without
 * it "412,000" is an unexplained number; with it a player can see that the
 * leader's total is four cities deep and that replaying one city cannot inflate
 * it. That is the whole ranking rule, shown rather than written.
 */
function leaderboardTable(rows, youId, onReport) {
  const table = element('table', 'fw-board-table fw-leaderboard');
  table.append(element('caption', '', 'ALL-TIME · YOUR BEST SCORE ON EACH CITY, ADDED UP'));

  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  for (const label of ['Rank', 'Player', 'Total score', 'Cities', '']) {
    const th = element('th', '', label);
    th.scope = 'col';
    if (!label) th.className = 'fw-col-report';
    hrow.appendChild(th);
  }
  head.appendChild(hrow);

  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const rank = Number(row.rank);
    if (rank >= 1 && rank <= 3) tr.classList.add(`fw-podium-${rank}`);
    const isYou = youId && row.player_id === youId;
    if (isYou) tr.classList.add('fw-is-you');

    tr.appendChild(element('td', 'fw-rank-cell', rankBadge(rank)));

    const nameCell = element('td', 'fw-name-cell');
    nameCell.appendChild(element('span', 'fw-board-name', row.name || 'Unnamed'));
    // The player finding themselves in a list of strangers is the whole reason
    // they opened the screen, so it is a tag rather than a colour alone.
    if (isYou) nameCell.appendChild(element('span', 'fw-you-tag', 'YOU'));
    tr.appendChild(nameCell);

    tr.appendChild(element('td', 'fw-num-cell', score(row.total_score)));
    tr.appendChild(element('td', 'fw-num-cell fw-cities-cell', String(row.cities ?? '—')));

    const reportCell = element('td', 'fw-col-report');
    if (onReport && !isYou && row.player_id) {
      const report = button('⚑', true);
      report.classList.add('fw-board-report');
      report.title = `Report ${row.name || 'this player'}`;
      report.setAttribute('aria-label', `Report ${row.name || 'this player'}`);
      report.onclick = () => onReport(row.player_id, report);
      reportCell.appendChild(report);
    }
    tr.appendChild(reportCell);

    body.appendChild(tr);
  }
  table.append(head, body);
  return table;
}

/**
 * An empty board is the state this screen will be in for its whole first week,
 * so it is built as an invitation and not as an apology. One sentence stating
 * the fact, one stating the stake, and the door — a 90-second ranked run — right
 * there, because a player who reads "be the first" and then has to go find the
 * button will not.
 */
function emptyBoard(onStartRankedRun, you) {
  const plate = element('div', 'fw-board-empty');

  // The signature of this screen, and the reason the empty state is not a
  // paragraph: the first-place row, drawn as a vacant slot with the player's own
  // name already sitting in it. It says what the board is, what a row looks like,
  // and what happens if they run — in one glance and no sentences.
  const slot = element('div', 'fw-empty-slot');
  slot.append(
    element('span', 'fw-empty-rank', '🥇 1'),
    element('span', 'fw-empty-name', you || 'YOUR NAME'),
    element('span', 'fw-empty-score', '—'),
  );
  plate.append(
    slot,
    element('h4', '', 'THIS SEAT IS OPEN'),
    element('p', '', 'Nobody has set a verified score yet. One 90-second run puts you at the top, and you stay there until somebody beats it.'),
  );
  if (onStartRankedRun) {
    const go = button('RUN CHICAGO · 90 SECONDS');
    go.classList.add('fw-board-empty-cta');
    go.onclick = () => onStartRankedRun('chicago');
    plate.appendChild(go);
  }
  return plate;
}

/**
 * A player's own verified bests, per city, folded into the RECORDS cards that
 * are already on screen.
 *
 * Deliberately fire-and-forget and deliberately silent on failure. The local
 * save has already answered the question the screen asks; this only adds the
 * server's confirmation of it, so a timeout, an offline device or a player who
 * has never had a run verified all land on the same correct outcome — the local
 * records, with no error furniture bolted to them.
 */
async function hydrateVerified(container, save) {
  const player = save.player;
  if (!player || !player.id) return;
  try {
    const result = await playerCityRecords(player.id);
    const rows = Array.isArray(result.data) ? result.data : [];
    if (!rows.length) return;
    // One row per city: the view can hold several verified runs for a player on
    // the same city, and the record is the best of them.
    const best = new Map();
    for (const row of rows) {
      const prev = best.get(row.scene_id);
      if (!prev || Number(row.score) > Number(prev.score)) best.set(row.scene_id, row);
    }
    for (const card of container.querySelectorAll('.fw-city-card')) {
      const row = best.get(card.dataset.scene);
      const slot = card.querySelector('.fw-city-verified');
      if (!row || !slot) continue;
      const value = slot.querySelector('.val');
      value.textContent = row.rank ? `${score(row.score)} · #${row.rank}` : score(row.score);
      value.classList.add('highlight');
      slot.hidden = false;
    }
  } catch { /* the local records already answered; the server's copy is a bonus */ }
}

function renderPersonalBests(container, save, { onStartCity, onStartCampaign, onStartRankedRun }) {
  container.innerHTML = '';

  // 1. Calculate Aggregate Metrics
  let allTimeBestScore = 0;
  let allTimeBestCombo = 0;
  let totalSandboxClears = 0;
  for (const rec of Object.values(save.sandbox || {})) {
    if (!rec) continue;
    totalSandboxClears += (rec.completions || 0);
    if ((rec.bestScore || 0) > allTimeBestScore) allTimeBestScore = rec.bestScore;
    if ((rec.bestCombo || 0) > allTimeBestCombo) allTimeBestCombo = rec.bestCombo;
  }

  let campaignLevelsWon = 0;
  let campaignStars = 0;
  for (const lvl of Object.values(save.levels || {})) {
    if (!lvl) continue;
    if (lvl.won || (lvl.stars || 0) > 0) campaignLevelsWon++;
    campaignStars += (lvl.stars || 0);
  }

  const unlockedGearCount = 2 + (save.ownedItems || []).length; // 2 default items

  // 2. Hero Overview Stat Grid
  const statGrid = element('div', 'fw-stat-grid');
  
  const cardScore = element('div', 'fw-stat-card');
  cardScore.append(
    element('span', 'k', 'ALL-TIME HIGH SCORE'),
    element('span', 'v', allTimeBestScore > 0 ? allTimeBestScore.toLocaleString('en-US') : '0'),
    element('span', 'sub', allTimeBestScore > 0 ? 'Personal record' : 'Play a city to set one')
  );
  
  const cardCombo = element('div', 'fw-stat-card');
  cardCombo.append(
    element('span', 'k', 'HIGHEST COMBO'),
    element('span', 'v', allTimeBestCombo > 0 ? formatCombo(allTimeBestCombo) : '—'),
    element('span', 'sub', allTimeBestCombo > 0 ? 'Max chain length' : 'Chain bites rapidly')
  );

  const cardClears = element('div', 'fw-stat-card');
  cardClears.append(
    element('span', 'k', 'CITY CLEARS'),
    element('span', 'v', `${totalSandboxClears} RUNS`),
    element('span', 'sub', 'Completed sandbox goals')
  );

  const cardVault = element('div', 'fw-stat-card');
  cardVault.append(
    element('span', 'k', 'COIN VAULT'),
    element('span', 'v', (save.coins || 0).toLocaleString('en-US')),
    element('span', 'sub', 'Available to spend in Shop')
  );

  const cardGear = element('div', 'fw-stat-card');
  cardGear.append(
    element('span', 'k', 'CUSTOM GEAR'),
    element('span', 'v', `${unlockedGearCount} UNLOCKED`),
    element('span', 'sub', 'Hole skins & indicators')
  );

  statGrid.append(cardScore, cardCombo, cardClears, cardVault, cardGear);
  container.appendChild(statGrid);

  // Everything above this line is the local save — the honest, always-available
  // answer that an offline player still gets (invariant 10). Everything below is
  // the SERVER's copy of the same player, which only exists once a run has been
  // verified, and which arrives late or never. It is added to the cards that are
  // already on screen rather than gating them, so nothing waits on the network.
  hydrateVerified(container, save);

  // 3. City Breakdown Matrix
  const citySectionHead = element('div', 'fw-section-header');
  citySectionHead.append(
    element('span', '', 'CITY ARCHIVES & PERFORMANCE'),
    element('span', 'fw-stat-note', `${CITY_CATALOG.length} CITIES AVAILABLE`)
  );
  container.appendChild(citySectionHead);

  const cityCards = element('div', 'fw-city-cards');
  for (const city of CITY_CATALOG) {
    const rec = (save.sandbox || {})[city.scene || 'gallery'] || {};
    const clears = rec.completions || 0;
    const bestScore = rec.bestScore || 0;
    const bestCombo = rec.bestCombo || 0;
    const bestTime = rec.bestTime || 0;

    const card = element('div', 'fw-city-card');
    card.dataset.scene = city.scene || 'gallery';

    // Header
    const header = element('div', 'fw-city-card-header');
    const titleWrap = element('div');
    titleWrap.append(
      element('div', 'fw-city-card-title', city.name),
      element('div', 'fw-city-card-sub', city.sub)
    );
    
    let badgeClass = 'fw-badge--unplayed';
    let badgeText = 'UNPLAYED';
    if (clears >= 5) {
      badgeClass = 'fw-badge--mastered';
      badgeText = '🌟 MASTERED';
    } else if (clears > 0) {
      badgeClass = 'fw-badge--cleared';
      badgeText = `✓ CLEARED ×${clears}`;
    }
    const badge = element('span', `fw-badge ${badgeClass}`, badgeText);
    header.append(titleWrap, badge);
    card.appendChild(header);

    // Stat Rows
    const rowScore = element('div', 'fw-city-stats-row');
    rowScore.append(
      element('span', 'lbl', 'Best Score:'),
      element('span', `val${bestScore > 0 ? ' highlight' : ''}`, bestScore > 0 ? bestScore.toLocaleString('en-US') : '—')
    );

    const rowCombo = element('div', 'fw-city-stats-row');
    rowCombo.append(
      element('span', 'lbl', 'Max Combo:'),
      element('span', 'val', bestCombo > 0 ? formatCombo(bestCombo) : '—')
    );

    const rowTime = element('div', 'fw-city-stats-row');
    rowTime.append(
      element('span', 'lbl', 'Fastest Clear:'),
      element('span', 'val', formatTime(bestTime))
    );

    card.append(rowScore, rowCombo, rowTime);

    // Filled in by hydrateVerified() when the server holds a verified run for
    // this player on this city. Absent until then rather than showing a dash: a
    // "—" beside the words RANKED BEST reads as a score of nothing.
    const rowVerified = element('div', 'fw-city-stats-row fw-city-verified');
    rowVerified.hidden = true;
    rowVerified.append(
      element('span', 'lbl', 'Ranked best:'),
      element('span', 'val', '—'),
    );
    card.appendChild(rowVerified);

    const btnGroup = element('div', 'fw-city-btn-group');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '6px';
    btnGroup.style.marginTop = '6px';

    if (onStartCity) {
      const playBtn = button(clears > 0 ? `FREE PLAY` : `ENTER`, clears === 0);
      playBtn.classList.add('fw-city-play-btn');
      playBtn.style.flex = '1';
      playBtn.onclick = () => onStartCity(city.scene);
      btnGroup.appendChild(playBtn);
    }

    if (onStartRankedRun && city.scene && city.scene !== 'gallery') {
      const runBtn = button('RANKED 90s', true);
      runBtn.classList.add('fw-city-play-btn');
      runBtn.style.flex = '1';
      runBtn.onclick = () => onStartRankedRun(city.scene);
      btnGroup.appendChild(runBtn);
    }

    card.appendChild(btnGroup);
    cityCards.appendChild(card);
  }
  container.appendChild(cityCards);
}

export async function renderBoards(root, { onBack, onProfile, onStartCity, onStartCampaign, onStartRankedRun, save, initialTab = 'bests' }) {
  root.innerHTML = '';
  const screen = element('section', 'screen');
  const wrap = element('div', 'fw-records-wrap');
  
  wrap.appendChild(element('h2', '', 'RECORDS'));

  // Two questions, two tabs, and the labels say which is which: RECORDS is
  // "how am I doing" (this player, every city, all time) and LEADERBOARD is
  // "who is the best" (every player, one global list). They used to be the same
  // read behind three tabs, which is why neither answered its own question.
  const navBar = element('div', 'fw-records-tabs');
  const btnBests = button('MY RECORDS', true);
  const btnBoards = button('LEADERBOARD', true);
  const btnProfile = button('MY NAME', true);
  navBar.setAttribute('role', 'tablist');
  navBar.setAttribute('aria-label', 'Records sections');
  for (const b of [btnBests, btnBoards, btnProfile]) {
    b.setAttribute('role', 'tab');
    b.classList.add('fw-records-tab');
  }
  navBar.append(btnBests, btnBoards, btnProfile);
  wrap.appendChild(navBar);

  const contentSlot = element('div', 'fw-board-slot');
  contentSlot.style.width = '100%';
  wrap.appendChild(contentSlot);

  // Scroll Hint Affordance
  const scrollHint = element('div', 'fw-scroll-hint');
  scrollHint.append(
    element('span', '', '↓ SCROLL FOR MORE CONTENT')
  );
  wrap.appendChild(scrollHint);

  const backBtn = button('CITIES', true);
  backBtn.onclick = onBack;
  wrap.appendChild(backBtn);
  
  screen.appendChild(wrap);
  root.appendChild(screen);

  function updateScrollHint() {
    if (!scrollHint || !screen) return;
    const canScroll = screen.scrollHeight > screen.clientHeight + 50;
    const isScrolled = screen.scrollTop > 30;
    const atBottom = screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 30;
    scrollHint.classList.toggle('is-hidden', !canScroll || isScrolled || atBottom);
  }

  screen.addEventListener('scroll', updateScrollHint, { passive: true });
  window.addEventListener('resize', updateScrollHint, { passive: true });

  let activeTab = initialTab;

  function setTab(tab) {
    activeTab = tab;
    for (const [node, key] of [[btnBests, 'bests'], [btnBoards, 'boards'], [btnProfile, 'profile']]) {
      const on = tab === key;
      node.classList.toggle('fw-records-tab--active', on);
      node.setAttribute('aria-selected', on ? 'true' : 'false');
    }

    if (tab === 'bests') {
      contentSlot.innerHTML = '';
      renderPersonalBests(contentSlot, save, { onStartCity, onStartCampaign, onStartRankedRun });
    } else if (tab === 'boards') {
      renderLeaderboardTab(contentSlot);
    } else if (tab === 'profile') {
      contentSlot.innerHTML = '';
      renderProfileTab(contentSlot, save, () => setTab('profile'), { onStartRankedRun });
    }
    setTimeout(updateScrollHint, 80);
  }

  // ONE board. Every player, all time, ranked by the sum of their best score on
  // each city — so replaying a city only moves you if you beat your own best
  // there, and the ranking grows on its own as cities are added because nothing
  // here enumerates them. There are no seasons and nothing resets.
  async function renderLeaderboardTab(target) {
    target.innerHTML = '';

    const you = ensurePlayer(save);

    // The RECORDS tab is a wide card grid, so the shared content slot is full
    // width. A ten-row list is not: at 1180px the rows stretch until rank and
    // score are half a screen apart. So the leaderboard sets its own measure and
    // centres it under the tab bar rather than hugging the left edge.
    const column = element('div', 'fw-board-column');
    target.appendChild(column);
    target = column;

    const header = element('div', 'fw-board-head');
    header.append(
      element('h3', '', 'LEADERBOARD'),
      element('p', '', `The ten highest players in the game. Your rank is the total of your best verified score on every city — beat your own record anywhere and the total goes up.`),
    );
    target.appendChild(header);

    const boardContent = element('div', 'fw-board-slot');
    target.appendChild(boardContent);

    const standingSlot = element('div', 'fw-standing-slot');
    target.appendChild(standingSlot);

    function loading() {
      boardContent.innerHTML = '';
      const skeleton = element('p', 'fw-board-note', 'READING VERIFIED SCORES…');
      skeleton.setAttribute('role', 'status');
      boardContent.appendChild(skeleton);
    }

    async function loadBoard() {
      loading();
      try {
        const result = await leaderboard(LEADERBOARD_SIZE);
        boardContent.innerHTML = '';
        if (result.cached) {
          boardContent.appendChild(element('p', 'fw-board-note', `SAVED COPY · last read ${new Date(result.at).toLocaleString()}`));
        }
        const rows = topTen(result.data, LEADERBOARD_SIZE);
        if (!rows.length) {
          boardContent.appendChild(emptyBoard(onStartRankedRun, playerName(save)));
        } else {
          boardContent.appendChild(leaderboardTable(rows, you.id, async (playerId, report) => {
            report.disabled = true;
            try {
              await post('/report', { player_id: playerId, device_key: deviceKey() });
              report.textContent = '✓';
              report.setAttribute('aria-label', 'Reported');
            } catch {
              report.textContent = '⚑';
              report.disabled = false;
              report.setAttribute('aria-label', 'Report failed, try again');
            }
          }));
          // Someone outside the top ten still has a standing, and it is the
          // number that makes the board mean anything to them.
          if (you.id && !rows.some((row) => row.player_id === you.id)) loadStanding(you.id);
        }
      } catch {
        boardContent.innerHTML = '';
        boardContent.appendChild(element('p', 'fw-board-note', 'The leaderboard could not be reached. Everything else — your records, every city, every run — still works.'));
        const retryBtn = button('TRY AGAIN', true);
        retryBtn.onclick = () => loadBoard();
        boardContent.appendChild(retryBtn);
      }
    }

    async function loadStanding(playerId) {
      try {
        const result = await playerStanding(playerId);
        const mine = (result.data || [])[0];
        if (!mine) return;
        standingSlot.innerHTML = '';
        const card = element('div', 'fw-standing');
        card.append(
          element('span', 'k', 'YOUR PLACE'),
          element('span', 'v', `#${mine.rank}`),
          element('span', 'sub', `${score(mine.total_score)} across ${mine.cities} ${mine.cities === 1 ? 'city' : 'cities'}`),
        );
        standingSlot.appendChild(card);
      } catch { /* a missing standing is a quiet absence, not an error state */ }
    }

    loadBoard();
  }

  function renderProfileTab(target, save, refresh, { onStartRankedRun }) {
    const wrap = element('div', 'results-stats');
    wrap.style.maxWidth = '720px';
    wrap.style.margin = '0 auto';
    wrap.style.width = '100%';

    // Everybody has a name from the first frame, so this screen no longer opens
    // on an absence. `claimed` — not the presence of a name — is what decides
    // whether it shows the sign-in door or the account it is already signed in
    // to. A claimed name belongs to the server and is not re-rollable here.
    const name = playerName(save);
    const claimed = (save.player && save.player.nameSource) === 'claimed';

    const title = element('h3', 'fw-identity-title', 'YOUR NAME');
    wrap.appendChild(title);

    const plate = element('div', 'fw-name-plate');
    const namePlate = element('span', 'fw-name-value', name);
    namePlate.setAttribute('aria-live', 'polite');
    plate.appendChild(namePlate);

    if (!claimed) {
      const reroll = button('⟳ ROLL AGAIN', true);
      reroll.classList.add('fw-reroll', 'fw-reroll--wide');
      reroll.setAttribute('aria-label', 'Roll a different name');
      reroll.onclick = () => {
        namePlate.textContent = rerollPlayerName(save);
        // Restart the flip on every press: without the reflow the class is
        // already there and the second press animates nothing, which reads as
        // a dead button on exactly the press that proves the button works.
        namePlate.classList.remove('is-rolling');
        void namePlate.offsetWidth;
        namePlate.classList.add('is-rolling');
      };
      plate.appendChild(reroll);
    }
    // The cloud dot, same four states as the title screen, with a sentence of
    // explanation under the plate because here there is room for one.
    const status = syncStatus(save);
    const ind = syncIndicator(status);
    if (ind) {
      const dot = element('span', `fw-sync fw-sync--${ind.tone}`);
      dot.setAttribute('role', 'status');
      const i = element('i', 'fw-sync-dot'); i.setAttribute('aria-hidden', 'true');
      dot.append(i, element('span', 'fw-sync-word', ind.label));
      plate.appendChild(dot);
    }
    wrap.appendChild(plate);

    const desc = element('p', 'fw-board-note', claimed
      ? (SYNC_DETAIL[status] || `You are signed in as "${name}". Your coins, skins, stars and verified scores follow this name to every device.`)
      : 'This is the name beside your scores. Roll for another as many times as you like — it costs nothing and changes nothing else. Sign in below and your coins, skins and stars come with you to every device you play on.');
    desc.style.marginBottom = '16px';
    wrap.appendChild(desc);

    // Signed out on another device: say so once, plainly, above the sign-in
    // form. It is the same form as always — no new door to find.
    if (!claimed && status === 'signed-out') {
      const out = element('div', 'fw-sync-note fw-sync-note--out');
      out.append(element('span', 'k', 'SIGNED OUT ELSEWHERE'), element('p', 'fw-board-note', SYNC_DETAIL['signed-out']));
      wrap.appendChild(out);
    }

    // The one-time card: the first time this account has been saved to the
    // cloud, say where the progress went. Stamped on render, not on dismiss, so
    // it shows once even if they leave the tab without tapping.
    if (shouldShowFirstNote(save)) {
      markFirstNoteShown(save);
      storeSave(save);
      const card = element('div', 'fw-sync-note');
      card.append(element('span', 'k', 'SAVED TO YOUR ACCOUNT'), element('p', 'fw-board-note', firstNoteText(name)));
      const trimmed = trimmedNoticeText(lastTrimmed());
      if (trimmed) card.appendChild(element('p', 'fw-board-note', trimmed));
      const ok = button('GOT IT', true);
      ok.style.alignSelf = 'flex-start';
      ok.onclick = () => card.remove();
      card.appendChild(ok);
      wrap.appendChild(card);
    } else if (claimed) {
      const trimmed = trimmedNoticeText(lastTrimmed());
      if (trimmed) {
        const card = element('div', 'fw-sync-note fw-sync-note--trim');
        card.append(element('span', 'k', 'SOME ITEMS COULD NOT BE VERIFIED'), element('p', 'fw-board-note', trimmed));
        wrap.appendChild(card);
      }
    }

    // Section 1: Player Authentication & Account Status
    const idCard = element('div', 'fw-stat-card');
    idCard.style.marginBottom = '16px';
    if (!claimed) {
      idCard.append(
        element('span', 'k', '🔐 KEEP THIS NAME ON EVERY DEVICE'),
        element('p', 'fw-board-note', 'Add a password and this name — with your coins, skins and stars — is yours on your phone, tablet and computer. Already have an account? Sign in instead.')
      );

      const authToggleWrap = element('div');
      authToggleWrap.style.display = 'flex';
      authToggleWrap.style.gap = '8px';
      authToggleWrap.style.margin = '10px 0';

      const btnModeLogin = button('SIGN IN', true);
      const btnModeRegister = button('CREATE NEW ACCOUNT', true);
      btnModeLogin.classList.add('fw-records-tab--active');
      authToggleWrap.append(btnModeLogin, btnModeRegister);
      idCard.appendChild(authToggleWrap);

      let isRegister = false;

      const authForm = document.createElement('form');
      authForm.style.display = 'flex';
      authForm.style.flexDirection = 'column';
      authForm.style.gap = '8px';
      authForm.style.marginTop = '6px';
      // The card centres its children, which left both fields at their intrinsic
      // width — the name placeholder was cut off mid-word ("Player Name (3–16
      // characte") in a card with 300px of empty space either side.
      authForm.style.width = '100%';
      authForm.style.alignItems = 'stretch';

      const nameInput = document.createElement('input');
      nameInput.className = 'fw-claim-input';
      nameInput.name = 'username'; nameInput.maxLength = 16; nameInput.required = true;
      nameInput.placeholder = 'Player Name (3–16 characters)';
      nameInput.style.minHeight = '38px';
      nameInput.style.padding = '0 12px';
      nameInput.style.background = 'rgba(7, 10, 18, .82)';
      nameInput.style.border = '1px solid rgba(255, 255, 255, .28)';
      nameInput.style.borderRadius = '8px';
      nameInput.style.color = '#fff';

      const passInput = document.createElement('input');
      passInput.className = 'fw-claim-input';
      passInput.name = 'password'; passInput.type = 'password'; passInput.required = true;
      passInput.placeholder = 'Password (min 4 characters)';
      passInput.style.minHeight = '38px';
      passInput.style.padding = '0 12px';
      passInput.style.background = 'rgba(7, 10, 18, .82)';
      passInput.style.border = '1px solid rgba(255, 255, 255, .28)';
      passInput.style.borderRadius = '8px';
      passInput.style.color = '#fff';

      const submitBtn = button('SIGN IN');
      submitBtn.type = 'submit';

      const note = element('p', 'fw-board-note', '');
      note.style.marginTop = '6px';
      note.style.fontSize = '12px';

      authForm.append(nameInput, passInput, submitBtn);
      idCard.append(authForm, note);

      btnModeLogin.onclick = () => {
        isRegister = false;
        btnModeLogin.classList.add('fw-records-tab--active');
        btnModeRegister.classList.remove('fw-records-tab--active');
        submitBtn.textContent = 'SIGN IN';
        note.textContent = '';
      };

      btnModeRegister.onclick = () => {
        isRegister = true;
        btnModeRegister.classList.add('fw-records-tab--active');
        btnModeLogin.classList.remove('fw-records-tab--active');
        submitBtn.textContent = `CREATE ACCOUNT`;
        // The name they have been shopping for is the name they want to keep,
        // so the field arrives holding it rather than empty. Still editable, and
        // never overwritten if they have already typed something.
        if (!nameInput.value) nameInput.value = save.player.name || '';
        note.textContent = '';
      };

      authForm.onsubmit = async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        note.textContent = isRegister ? 'CREATING ACCOUNT…' : 'SIGNING IN…';
        note.style.color = 'var(--fw-gold)';
        try {
          const res = isRegister
            ? await registerPlayer(save, nameInput.value.trim(), passInput.value)
            : await loginPlayer(save, nameInput.value.trim(), passInput.value);
          note.textContent = res.isOffline
            ? `PROFILE ACTIVE! Welcome, ${res.name} (Local/Offline Mode).`
            : `WELCOME, ${res.name}! Your scores and identity are active.`;
          setTimeout(refresh, 600);
        } catch (err) {
          submitBtn.disabled = false;
          note.textContent = err.extra && err.extra.suggestions
            ? `${err.message} Try ${err.extra.suggestions.join(' · ')}.` : err.message;
          note.style.color = '#ff6b6b';
        }
      };
    } else {
      idCard.append(
        element('span', 'k', 'LOGGED IN ACCOUNT'),
        element('p', 'fw-board-note', `Signed in as "${name}". Your coins, skins, stars and verified scores are credited to this account on every device.`)
      );

      const actionRow = element('div');
      actionRow.style.display = 'flex';
      actionRow.style.gap = '8px';
      actionRow.style.marginTop = '12px';
      actionRow.style.flexWrap = 'wrap';

      // Sign out is not "remove identity" (the danger card below): the account
      // stays, this device just stops being it. signOutPlayer flushes what the
      // device still owes the account first, then hands it a fresh guest name;
      // progress stays on the device on purpose (a shared tablet loses nothing).
      const signOutBtn = button('SIGN OUT', true);
      const signOutNote = element('p', 'fw-board-note', '');
      signOutNote.style.fontSize = '12px';
      signOutBtn.onclick = async () => {
        if (!window.confirm('Sign out on this device? Your account and everything in it stay safe; this device keeps playing as a guest.')) return;
        signOutBtn.disabled = true;
        signOutNote.textContent = 'SAVING, THEN SIGNING OUT…';
        signOutNote.style.color = 'var(--fw-gold)';
        await signOutPlayer(save);
        signOutNote.textContent = 'Signed out.';
        setTimeout(refresh, 400);
      };
      actionRow.appendChild(signOutBtn);
      idCard.append(actionRow, signOutNote);
    }
    wrap.appendChild(idCard);

    // Only a name the SERVER holds can be removed from the boards. An automatic
    // local name has nothing published behind it, so offering to delete it would
    // be offering a destructive action that does nothing.
    if (claimed) {
      const dangerCard = element('div', 'fw-stat');
      dangerCard.append(
        element('span', 'k', '⚠️ DANGER ZONE'),
        element('p', 'fw-board-note', 'Remove your public leaderboard name and disconnect this browser. Your verified scores become anonymous ("Retired Sprocket") and your secret bearer token is permanently destroyed.')
      );

      const removeBtn = button('REMOVE IDENTITY FROM BOARDS', true);
      removeBtn.classList.add('btn', 'danger');
      removeBtn.style.marginTop = '10px';
      const removeNote = element('p', 'fw-board-note', '');
      removeNote.style.fontSize = '11px';

      removeBtn.onclick = async () => {
        if (!window.confirm('Are you sure? This will permanently remove your name from the public leaderboard. Local save progress on this device will stay intact.')) return;
        removeBtn.disabled = true;
        removeNote.textContent = 'REMOVING IDENTITY…';
        try {
          await removePlayer(save);
          removeNote.textContent = 'Identity removed. You are now anonymous.';
          setTimeout(refresh, 800);
        } catch (error) {
          removeBtn.disabled = false;
          removeNote.textContent = error.message;
          removeNote.style.color = '#ff6b6b';
        }
      };

      dangerCard.append(removeBtn, removeNote);
      wrap.appendChild(dangerCard);
    }

    target.appendChild(wrap);
  }

  btnBests.onclick = () => setTab('bests');
  btnBoards.onclick = () => setTab('boards');
  btnProfile.onclick = () => setTab('profile');

  setTab(initialTab);
}

export function renderProfile(root, { onBack, onRecords, onStartCity, onStartCampaign, onStartRankedRun, save }) {
  renderBoards(root, { onBack, onProfile: () => {}, onStartCity, onStartCampaign, onStartRankedRun, save, initialTab: 'profile' });
}

export function mountClaim(target, { save, runId, onClaimed }) {
  target.innerHTML = '';
  target.appendChild(element('h3', '', 'YOU MADE THE BOARD'));
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.name = 'name'; input.maxLength = 16; input.required = true; input.autocomplete = 'nickname';
  input.placeholder = 'what should we call you?'; input.setAttribute('aria-label', 'Board name');
  const submit = button('PUT ME ON THE BOARD'); submit.type = 'submit';
  const note = element('p', 'fw-board-note', 'This name is public beside your score. It lives in this browser; get a transfer code before clearing it.');
  const result = element('p', 'fw-board-note');
  form.append(input, submit); target.append(form, note, result); input.focus();
  form.onsubmit = async (event) => {
    event.preventDefault(); submit.disabled = true; result.textContent = 'CLAIMING…';
    try {
      const claimed = await claimName(save, input.value.trim(), runId);
      result.textContent = `WELCOME, ${claimed.name}. YOUR VERIFIED RUN IS ON THE BOARD.`;
      if (onClaimed) onClaimed(claimed);
    } catch (error) {
      result.textContent = error.extra && error.extra.suggestions
        ? `${error.message} Try ${error.extra.suggestions.join(' · ')}.` : error.message;
      submit.disabled = false;
    }
  };
}

