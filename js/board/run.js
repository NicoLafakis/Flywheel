import { RANKED_SIM_VERSION, RANKED_TICK_COUNT, RANKED_TUNE_ID } from '../voxelsim.js';
import { encodeTrace } from '../replay.js';
import { BUILD_ID, RANKED_SCENES } from './config.js';
import { deviceKey, playerSecret } from './player.js';
import { enqueue, drain } from './outbox.js';
import { post } from './request.js';

// A run belongs to the identity that obtained its ticket, even if the player
// signs into another account before finishing. Do not persist an auto identity
// over a pending requested account just to authenticate this one run.
const ticketSecrets = new WeakMap();

function rankedSecret() {
  const secret = playerSecret();
  return secret && secret.player_id.startsWith('local-') && secret.token.startsWith('local-token-')
    ? null : secret;
}

function toBase64(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export async function startTicket(sceneId) {
  if (!RANKED_SCENES.includes(sceneId)) return null;
  const secret = rankedSecret();
  try {
    const ticket = await post('/run/start', {
      scene_id: sceneId, mode: 'run90', device_key: deviceKey(),
      player_id: secret && secret.player_id, player_token: secret && secret.token,
    }, 2500);
    ticketSecrets.set(ticket, secret || (ticket.player_token
      ? { player_id: ticket.player_id, token: ticket.player_token } : null));
    return ticket;
  } catch { return null; }
}

export async function finishRun(save, ticket, sim, inputs) {
  if (!ticket || !inputs || inputs.length !== RANKED_TICK_COUNT * 2) return { verdict: 'unranked' };
  const current = rankedSecret();
  const secret = ticketSecrets.has(ticket) ? ticketSecrets.get(ticket)
    : (current && current.player_id === ticket.player_id ? current : null);
  const entry = {
    run_id: ticket.run_id, ticket: ticket.ticket, device_key: deviceKey(),
    tick_count: RANKED_TICK_COUNT, tune_id: RANKED_TUNE_ID, sim_version: RANKED_SIM_VERSION,
    client_build: BUILD_ID, claimed_score: Math.floor(sim.hole.mass), trace: toBase64(encodeTrace(inputs)),
    player_id: secret && secret.player_id, player_token: secret && secret.token,
  };
  enqueue(save, entry);
  let result = { run_id: entry.run_id, verdict: 'queued' };
  await drain(save, (next) => { if (next.run_id === entry.run_id) result = next; });
  return result;
}

export function status(runId) { return post('/run/status', { run_id: runId, device_key: deviceKey() }); }
