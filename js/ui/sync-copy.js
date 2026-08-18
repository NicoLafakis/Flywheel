// The words and state mapping for the cloud-progress surface: the little
// "SYNCED" dot beside the name, the one-time "your progress now belongs to
// <name>" card, and the "some purchases could not be verified" line. Pure —
// no DOM, no three.js — so tools/progress-ui.test.mjs can import it in Node
// and the wiring in screens.js / boards.js stays a thin renderer.
//
// The keys mirror the strings js/cloud/sync.js `syncStatus()` returns; 'idle'
// (nothing to say yet, or a guest with a local-only secret) deliberately maps
// to nothing at all rather than a fifth label, because a dot that says
// "NOT SYNCED" reads as a fault on the very first launch.

export const SYNC_LABELS = Object.freeze({
  synced: 'SYNCED',
  syncing: 'SYNCING…',
  offline: 'OFFLINE — WILL SYNC',
  'signed-out': 'SIGNED OUT ELSEWHERE',
});

// Longer wording for the same states, used where there is room (the profile
// tab), so the dot never has to explain itself.
export const SYNC_DETAIL = Object.freeze({
  synced: 'Your coins, skins and stars are saved to your account.',
  syncing: 'Saving your progress to your account…',
  offline: 'No connection right now. Your progress is safe here and will sync when you are back online.',
  'signed-out': 'You signed in on another device, so this one was signed out. Sign in again to keep syncing.',
});

// → { label, tone } for the four visible states, null for anything else.
export function syncIndicator(status) {
  const label = SYNC_LABELS[status];
  return label ? { label, tone: status } : null;
}

// The first-time card: once per account, and only after the server has
// actually answered once (lastPulledAt), so the card never promises a sync
// that has not happened yet.
export function shouldShowFirstNote(save) {
  const claimed = save && save.player && save.player.nameSource === 'claimed';
  const c = save && save.cloud;
  return Boolean(claimed && c && c.lastPulledAt && !c.firstNoteShownAt);
}

export function markFirstNoteShown(save, now = Date.now()) {
  if (!save.cloud) return;
  save.cloud.firstNoteShownAt = now;
}

export function firstNoteText(name) {
  return `Your coins, skins and stars from this device now belong to ${name}. Sign in on another phone or computer and they will be there.`;
}

// The server trimmed something it could not verify (a skin the ledger does not
// cover, coins above the verified total). One calm line; never a modal.
export function trimmedNoticeText(trimmed) {
  if (!Array.isArray(trimmed) || trimmed.length === 0) return null;
  return 'Some coins or items on this device could not be verified by the server, so they were left out of your account. Everything you earn from here on counts.';
}
