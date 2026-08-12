import { API_BASE, BOARD_TIMEOUT_MS } from './config.js';

export async function post(path, payload, timeoutMs = BOARD_TIMEOUT_MS) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok || !json || !json.ok) {
    const error = new Error(json && json.error ? json.error.message : 'Boards are unavailable.');
    error.code = json && json.error && json.error.code;
    error.retryable = !!(json && json.error && json.error.retryable);
    error.status = response.status;
    error.extra = json && json.error;
    throw error;
  }
  return json.data;
}
