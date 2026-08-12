// Owner-only moderation surface. The password travels only in the request
// header; this static page contains no operator secret and stores none.

const root = document.getElementById('operator-root');
const login = document.getElementById('operator-login');
const status = document.getElementById('operator-status');

function node(tag, text = '') { const el = document.createElement(tag); el.textContent = text; return el; }

async function request(secret, method = 'GET', payload) {
  const response = await fetch('/api/operator', {
    method, headers: { 'x-fw-operator': secret, ...(payload ? { 'content-type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(5000),
  });
  const json = await response.json();
  if (!response.ok || !json.ok) throw new Error((json.error && json.error.message) || 'Operator request failed.');
  return json.data;
}

function render(secret, data) {
  root.innerHTML = '';
  root.appendChild(node('h1', 'BOARD OPERATOR'));
  const refresh = node('button', 'REFRESH'); refresh.className = 'btn secondary';
  refresh.onclick = async () => { try { render(secret, await request(secret)); } catch (error) { status.textContent = error.message; } };
  root.appendChild(refresh);
  root.appendChild(node('h2', `REPORTS · ${data.reports.length}`));
  const reports = node('ul');
  for (const row of data.reports) reports.appendChild(node('li', `${row.player_id} · ${new Date(row.created_at).toLocaleString()}`));
  root.appendChild(reports);
  root.appendChild(node('h2', 'RECENT CLAIMS'));
  const list = node('ul');
  for (const player of data.players) {
    const item = node('li');
    item.append(`${player.name} · ${player.moderation_state} `);
    for (const action of ['rename', 'hide']) {
      const control = node('button', action.toUpperCase()); control.type = 'button'; control.className = 'btn secondary';
      control.onclick = async () => {
        const reason = window.prompt(`Reason for ${action}:`, '') || '';
        control.disabled = true;
        try { await request(secret, 'POST', { player_id: player.id, action, reason }); render(secret, await request(secret)); }
        catch (error) { window.alert(error.message); control.disabled = false; }
      };
      item.appendChild(control);
    }
    list.appendChild(item);
  }
  root.appendChild(list);
}

login.onsubmit = async (event) => {
  event.preventDefault();
  const secret = new FormData(login).get('secret');
  status.textContent = 'LOADING…';
  try { render(secret, await request(secret)); }
  catch (error) { status.textContent = error.message; }
};
