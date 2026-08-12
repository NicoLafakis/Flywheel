import { storeSave } from '../save.js';
import { post } from './request.js';

const MAX_OUTBOX = 20;
const MAX_OUTBOX_BYTES = 1024 * 1024;

function encodedBytes(entry) {
  return new TextEncoder().encode(JSON.stringify(entry)).byteLength;
}

function trim(queue) {
  let bytes = queue.reduce((total, entry) => total + encodedBytes(entry), 0);
  while (queue.length > MAX_OUTBOX || bytes > MAX_OUTBOX_BYTES) {
    bytes -= encodedBytes(queue.shift());
  }
}

export function enqueue(save, entry) {
  const queue = Array.isArray(save.outbox) ? save.outbox : (save.outbox = []);
  if (!queue.some((row) => row.run_id === entry.run_id)) {
    queue.push(entry);
    trim(queue);
    storeSave(save);
  }
}

export async function drain(save, onResult = null) {
  const queue = Array.isArray(save.outbox) ? save.outbox : [];
  for (let index = 0; index < queue.length;) {
    const entry = queue[index];
    try {
      const result = await post('/run/submit', entry);
      queue.splice(index, 1);
      storeSave(save);
      if (onResult) onResult(result, entry);
    } catch (error) {
      if (!error.retryable) {
        queue.splice(index, 1);
        storeSave(save);
        if (onResult) onResult({ run_id: entry.run_id, verdict: error.code || 'unranked', error }, entry);
      } else {
        index++;
      }
    }
  }
}
