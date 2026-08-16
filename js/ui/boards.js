// Lazy UI for the public records, personal archives & player identity.
// It is intentionally imported only from the title/results actions so a normal
// offline city session never pays for it.

import { cityBoard, overallBoard } from '../board/read.js';
import { claimName, deviceKey, removePlayer, startTransfer, redeemTransfer, renamePlayer, registerPlayer, loginPlayer, playerSecret } from '../board/player.js';
import { post } from '../board/request.js';
import { comboMult, comboLevel, COMBO_LEVEL_NAMES } from '../voxelsim.js';
import { ensurePlayer, storeSave } from '../save.js';

const CITY_CATALOG = [
  { scene: 'brooklyn', name: 'Brooklyn', sub: 'Bridges to Coney Island', tag: 'Showcase' },
  { scene: 'boston', name: 'Boston', sub: 'Seaport & Waterfront' },
  { scene: 'cambridge', name: 'Cambridge', sub: 'Kendall Square to MIT Domes' },
  { scene: 'chicago', name: 'Chicago', sub: 'The Loop & Willis Tower' },
  { scene: 'manhattan', name: 'Lower Manhattan', sub: 'Financial District Towers' },
  { scene: 'upper-manhattan', name: 'Upper Manhattan', sub: 'Central Park & Museum Mile' },
  { scene: 'gallery', name: 'Sandbox Playground', sub: '100% Consumption Lab' },
];

const RANKED_CITIES = [
  { scene: 'chicago', name: 'Chicago' },
  { scene: 'brooklyn', name: 'Brooklyn' },
  { scene: 'boston', name: 'Boston' },
  { scene: 'cambridge', name: 'Cambridge' },
  { scene: 'manhattan', name: 'Lower Manhattan' },
  { scene: 'upper-manhattan', name: 'Upper Manhattan' },
];

// Weekly seasons anchor: Monday 00:00:00 UTC, Aug 10, 2026 (Season 1).
const SEASON_EPOCH_MS = Date.UTC(2026, 7, 10, 0, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function currentWeeklySeasonInfo(nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - SEASON_EPOCH_MS);
  const season = 1 + Math.floor(elapsed / WEEK_MS);
  const nextResetMs = SEASON_EPOCH_MS + season * WEEK_MS;
  const remainingMs = Math.max(0, nextResetMs - nowMs);
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return { season, nextResetMs, days, hours, mins };
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

function boardTable(rows, overall, onReport) {
  const table = element('table', 'fw-board-table');
  const caption = element('caption', '', overall ? 'THE FLYWHEEL · lifetime verified points across cities' : 'WEEKLY CITY RECORDS · verified ranked 90s runs');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  const headers = overall ? ['Rank', 'Player', 'Points', 'Cities', 'Best Rank'] : ['Rank', 'Player', 'Score', 'Verified', 'Report'];
  for (const label of headers) {
    const th = element('th', '', label); th.scope = 'col'; hrow.appendChild(th);
  }
  head.appendChild(hrow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const rankStr = rankBadge(row.rank);
    const values = overall
      ? [rankStr, row.name, Number(row.points).toLocaleString('en-US'), String(row.cities), row.best_rank ? `#${row.best_rank}` : '—']
      : [rankStr, row.name, Number(row.score).toLocaleString('en-US'), new Date(row.verified_at).toLocaleDateString()];
    for (let idx = 0; idx < values.length; idx++) {
      const td = element('td', '', values[idx]);
      if (idx === 0 && row.rank <= 3) td.style.fontWeight = '900';
      tr.appendChild(td);
    }
    if (!overall && onReport) {
      const cell = document.createElement('td');
      const report = button('REPORT', true);
      report.classList.add('fw-board-report');
      report.onclick = () => onReport(row.player_id, report);
      cell.appendChild(report); tr.appendChild(cell);
    }
    body.appendChild(tr);
  }
  table.append(caption, head, body);
  return table;
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
  
  wrap.appendChild(element('h2', '', 'RECORDS & STATS'));

  // Tab Navigation Bar
  const navBar = element('div', 'fw-records-tabs');
  const btnBests = button('PERSONAL BESTS', true);
  const btnBoards = button('LEADERBOARDS', true);
  const btnProfile = button('IDENTITY & PROFILE', true);
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
    btnBests.classList.toggle('fw-records-tab--active', tab === 'bests');
    btnBoards.classList.toggle('fw-records-tab--active', tab === 'boards');
    btnProfile.classList.toggle('fw-records-tab--active', tab === 'profile');

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

  async function renderLeaderboardTab(target) {
    target.innerHTML = '';

    const seasonInfo = currentWeeklySeasonInfo();

    // Season Banner
    const seasonBanner = element('div', 'fw-campaign-banner');
    seasonBanner.style.marginBottom = '12px';
    const seasonText = element('div');
    seasonText.innerHTML = `<h4 style="margin:0 0 4px; color:var(--fw-gold)">⚡ WEEKLY SEASON ${seasonInfo.season}</h4>
      <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.75)">
        Weekly reset in <b>${seasonInfo.days}d ${seasonInfo.hours}h ${seasonInfo.mins}m</b> · City records reset weekly; overall points accumulate lifetime.
      </p>`;
    seasonBanner.appendChild(seasonText);
    target.appendChild(seasonBanner);

    // City & Global sub-selectors
    const subNav = element('div', 'fw-records-tabs');
    subNav.style.margin = '4px 0 12px';
    
    const subButtons = [];

    const subOverall = button('👑 THE FLYWHEEL (LIFETIME)', true);
    subButtons.push({ key: 'overall', btn: subOverall });
    subNav.appendChild(subOverall);

    for (const c of RANKED_CITIES) {
      const btn = button(c.name.toUpperCase(), true);
      subButtons.push({ key: c.scene, btn });
      subNav.appendChild(btn);
    }
    target.appendChild(subNav);

    const boardContent = element('div', 'fw-board-slot');
    boardContent.textContent = 'LOADING VERIFIED RECORDS…';
    target.appendChild(boardContent);

    let currentSelection = 'overall';

    async function loadBoard(kind) {
      currentSelection = kind;
      for (const item of subButtons) {
        item.btn.classList.toggle('fw-records-tab--active', item.key === kind);
      }
      boardContent.textContent = 'LOADING VERIFIED RECORDS…';
      try {
        const result = kind === 'overall' ? await overallBoard() : await cityBoard(kind);
        boardContent.innerHTML = '';
        if (result.cached) {
          boardContent.appendChild(element('p', 'fw-board-note', `OFFLINE CACHE · Showing saved records from ${new Date(result.at).toLocaleString()}`));
        }
        const rows = result.data || [];
        if (!rows.length) {
          const cityName = kind === 'overall' ? 'any city' : RANKED_CITIES.find(c => c.scene === kind)?.name || kind;
          boardContent.appendChild(element('p', 'fw-board-note', `FIRST VERIFIED RUN SETS THE RECORD. Complete a 90-second run in ${cityName} to claim the top spot.`));
        } else {
          boardContent.appendChild(boardTable(rows, kind === 'overall', async (playerId, report) => {
            report.disabled = true;
            try {
              await post('/report', { player_id: playerId, device_key: deviceKey() });
              report.textContent = 'REPORTED';
            } catch {
              report.textContent = 'TRY LATER';
              report.disabled = false;
            }
          }));
        }
      } catch {
        boardContent.innerHTML = '';
        boardContent.appendChild(element('p', 'fw-board-note', 'LEADERBOARDS ARE CURRENTLY OFFLINE. Offline personal records and local gameplay remain fully functional.'));
        const retryBtn = button('RETRY CONNECTION', true);
        retryBtn.onclick = () => loadBoard(kind);
        boardContent.appendChild(retryBtn);
      }
    }

    subOverall.onclick = () => loadBoard('overall');
    for (const item of subButtons) {
      if (item.key !== 'overall') {
        item.btn.onclick = () => loadBoard(item.key);
      }
    }
    loadBoard('overall');
  }

  function renderProfileTab(target, save, refresh, { onStartRankedRun }) {
    const wrap = element('div', 'results-stats');
    wrap.style.maxWidth = '720px';
    wrap.style.margin = '0 auto';
    wrap.style.width = '100%';

    const name = save.player && save.player.name;
    const title = element('h3', '', name ? `PLAYER IDENTITY: ${name}` : 'UNCLAIMED IDENTITY');
    title.style.color = 'var(--fw-gold)';
    title.style.margin = '0 0 8px';
    wrap.appendChild(title);

    const desc = element('p', 'fw-board-note', name
      ? `This device is linked to "${name}". All verified scores in ranked runs are credited to this name.`
      : 'No public board name is claimed on this device yet. Claim a name below or enter a 6-character transfer code from another device.');
    desc.style.marginBottom = '16px';
    wrap.appendChild(desc);

    // Section 1: Player Authentication & Account Status
    const idCard = element('div', 'fw-stat-card');
    idCard.style.marginBottom = '16px';
    if (!name) {
      idCard.append(
        element('span', 'k', '🔐 PLAYER SIGN IN / CREATE ACCOUNT'),
        element('p', 'fw-board-note', 'Use a simple Player Name and Password to sign in or create an account across your phone, tablet, and PC.')
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
        submitBtn.textContent = 'CREATE ACCOUNT';
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
        element('p', 'fw-board-note', `Signed in as "${name}". All verified scores in ranked runs are credited to this account across your devices.`)
      );

      const actionRow = element('div');
      actionRow.style.display = 'flex';
      actionRow.style.gap = '8px';
      actionRow.style.marginTop = '12px';
      actionRow.style.flexWrap = 'wrap';

      const logoutBtn = button('LOG OUT / SWITCH USER', true);
      logoutBtn.onclick = () => {
        if (!window.confirm('Log out from this browser? Your account remains safe on the cloud.')) return;
        const player = ensurePlayer(save);
        player.id = null; player.name = null; player.claimedAt = null;
        try { localStorage.removeItem('fw-player'); } catch {}
        storeSave(save);
        refresh();
      };

      actionRow.appendChild(logoutBtn);
      idCard.appendChild(actionRow);
    }
    wrap.appendChild(idCard);

    if (name) {
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

