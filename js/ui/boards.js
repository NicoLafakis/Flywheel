// Lazy UI for the public records. It is intentionally imported only from the
// title/results actions so a normal offline city session never pays for it.

import { cityBoard, overallBoard } from '../board/read.js';
import { claimName, deviceKey, removePlayer, startTransfer } from '../board/player.js';
import { post } from '../board/request.js';

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

function boardTable(rows, overall, onReport) {
  const table = element('table', 'fw-board-table');
  const caption = element('caption', '', overall ? 'THE FLYWHEEL · points across city records' : 'CHICAGO RECORDS · verified runs');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  for (const label of overall ? ['Rank', 'Player', 'Points', 'Cities'] : ['Rank', 'Player', 'Score', 'When', 'Report']) {
    const th = element('th', '', label); th.scope = 'col'; hrow.appendChild(th);
  }
  head.appendChild(hrow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const values = overall
      ? [String(row.rank || '—'), row.name, Number(row.points).toLocaleString('en-US'), String(row.cities)]
      : [String(row.rank), row.name, Number(row.score).toLocaleString('en-US'), new Date(row.verified_at).toLocaleDateString()];
    for (const value of values) tr.appendChild(element('td', '', value));
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

function localHistory(save) {
  const list = element('div', 'results-stats');
  let entries = 0;
  for (const [scene, record] of Object.entries(save.sandbox || {})) {
    // Gated on RUNS, not on clears. `completions` means a full clear of the
    // whole city since the 180 s clock landed (js/save.js v18), so gating here
    // would hide every local record a player has actually set. "local clears"
    // becomes "runs" for the same reason — the number never counted clears
    // under the new rule, and the word has to say which quantity it is.
    const runs = record ? (record.runs ?? record.completions ?? 0) : 0;
    if (!runs) continue;
    entries++;
    list.appendChild(element('div', '', `${scene.toUpperCase()} · ${runs} local runs · best ${Number(record.bestScore || 0).toLocaleString('en-US')}`));
  }
  if (!entries) list.appendChild(element('div', '', 'No local city records yet.'));
  return list;
}

export async function renderBoards(root, { onBack, onProfile, save }) {
  root.innerHTML = '';
  const screen = element('section', 'screen');
  screen.appendChild(element('h2', '', 'RECORDS'));
  const tabs = element('div', 'fw-utility');
  const city = button('CHICAGO', true), overall = button('THE FLYWHEEL', true), profile = button('PROFILE', true);
  tabs.append(city, overall, profile); screen.appendChild(tabs);
  const slot = element('div', 'fw-board-slot', 'LOADING RECORDS…'); screen.appendChild(slot);
  const back = button('CITIES', true); back.onclick = onBack; screen.appendChild(back);
  root.appendChild(screen);

  async function render(kind) {
    slot.textContent = 'LOADING RECORDS…';
    try {
      const result = kind === 'overall' ? await overallBoard() : await cityBoard('chicago');
      slot.innerHTML = '';
      if (result.cached) slot.appendChild(element('p', 'fw-board-note', `OFFLINE · showing saved records from ${new Date(result.at).toLocaleString()}`));
      const rows = result.data || [];
      if (!rows.length) slot.appendChild(element('p', 'fw-board-note', 'FIRST VERIFIED RUN SETS THE RECORD.'));
      else slot.appendChild(boardTable(rows, kind === 'overall', async (playerId, report) => {
        report.disabled = true;
        try { await post('/report', { player_id: playerId, device_key: deviceKey() }); report.textContent = 'REPORTED'; }
        catch { report.textContent = 'TRY LATER'; report.disabled = false; }
      }));
    } catch {
      slot.textContent = 'RECORDS ARE OFFLINE. PLAYING STILL WORKS.';
    }
  }
  city.onclick = () => render('city');
  overall.onclick = () => render('overall');
  profile.onclick = onProfile;
  render('city');
}

export function renderProfile(root, { onBack, onRecords, save }) {
  root.innerHTML = '';
  const screen = element('section', 'screen');
  screen.appendChild(element('h2', '', 'PROFILE'));
  const name = save.player && save.player.name;
  screen.appendChild(element('p', 'fw-board-note', name ? `PLAYING AS ${name}` : 'NO BOARD NAME ON THIS DEVICE YET. EARN A VERIFIED RUN TO CLAIM ONE.'));
  screen.appendChild(element('h3', '', 'YOUR HISTORY (THIS DEVICE)'));
  screen.appendChild(localHistory(save));
  if (name) {
    const transfer = button('PLAY ON ANOTHER DEVICE', true);
    const transferNote = element('p', 'fw-board-note');
    transfer.onclick = async () => {
      transfer.disabled = true; transferNote.textContent = 'MAKING A ONE-USE CODE…';
      try {
        const result = await startTransfer(save);
        transferNote.textContent = `TRANSFER CODE: ${result.code} · expires in 10 minutes`;
      } catch (error) { transferNote.textContent = error.message; transfer.disabled = false; }
    };
    const remove = button('REMOVE ME FROM THE BOARDS', true);
    remove.onclick = async () => {
      if (!window.confirm('Remove this name and its traces? Scores remain anonymous.')) return;
      remove.disabled = true;
      try { await removePlayer(save); renderProfile(root, { onBack, onRecords, save }); }
      catch (error) { remove.disabled = false; transferNote.textContent = error.message; }
    };
    screen.append(transfer, transferNote, remove);
  }
  const records = button('RECORDS', true); records.onclick = onRecords;
  const back = button('CITIES', true); back.onclick = onBack;
  screen.append(records, back); root.appendChild(screen);
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
      const claimed = await claimName(save, input.value, runId);
      result.textContent = `WELCOME, ${claimed.name}. YOUR VERIFIED RUN IS ON THE BOARD.`;
      if (onClaimed) onClaimed(claimed);
    } catch (error) {
      result.textContent = error.extra && error.extra.suggestions
        ? `${error.message} Try ${error.extra.suggestions.join(' · ')}.` : error.message;
      submit.disabled = false;
    }
  };
}
