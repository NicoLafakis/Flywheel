import { chromium } from 'playwright';

(async () => {
  console.log('Starting Playwright test...');
  console.log('Launching Host...');
  const browserHost = await chromium.launch({ headless: true });
  console.log('Launching Peer...');
  const browserPeer = await chromium.launch({ headless: true });

  console.log('Creating contexts...');
  const ctxHost = await browserHost.newContext();
  const ctxPeer = await browserPeer.newContext();

  const pageHost = await ctxHost.newPage();
  pageHost.on('console', msg => console.log('HOST PAGE:', msg.text()));
  pageHost.on('pageerror', err => console.log('HOST ERROR:', err));
  
  // 1. Host creates a lobby
  console.log('Host navigating to localhost...');
  await pageHost.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });
  // Need to interact with the UI to create a 2-player lobby
  await pageHost.waitForSelector('#btn-main-mp', { state: 'visible', timeout: 15000 });
  await pageHost.click('#btn-main-mp');

  // Select 2 players
  await pageHost.waitForSelector('button.mp-cap-pill[data-count="2"]', { state: 'visible' });
  await pageHost.click('button.mp-cap-pill[data-count="2"]');

  // Click CREATE ROOM
  await pageHost.click('#mp-btn-create');

  // Wait for the lobby to initialize and room code to appear
  // The room code is usually displayed in the UI, or we can check window.mpLobby
  const roomCode = await pageHost.evaluate(() => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const el = document.querySelector('.mp-room-code');
        if (el && el.innerText.trim().length === 5) {
          clearInterval(checkInterval);
          resolve(el.innerText.trim());
        }
      }, 500);
    });
  });

  console.log(`Host created lobby with room code: ${roomCode}`);

  // 2. Peer joins via URL
  const pagePeer = await ctxPeer.newPage();
  pagePeer.on('console', msg => console.log('PEER PAGE:', msg.text()));
  pagePeer.on('pageerror', err => console.log('PEER ERROR:', err));
  
  const joinUrl = `http://localhost:8000/?room=${roomCode}`;
  console.log(`Peer joining via: ${joinUrl}`);
  await pagePeer.goto(joinUrl, { waitUntil: 'domcontentloaded' });

  // 3. Verify Peer sees 2 slots instead of 4
  console.log('Waiting for peer lobby UI to render...');
  
  const peerLobbyState = await pagePeer.evaluate(() => {
    return new Promise((resolve) => {
      // Wait for the room state to sync and roster to update
      const checkInterval = setInterval(() => {
        const slots = document.querySelectorAll('.mp-roster-card');
        const filledSlots = document.querySelectorAll('.mp-roster-card.filled');
        if (slots.length > 0 && slots.length !== 4) {
          clearInterval(checkInterval);
          resolve({
            maxPlayers: slots.length,
            connectedCount: filledSlots.length,
          });
        }
      }, 500);

      // Fallback timeout if it fails to sync
      setTimeout(() => {
        clearInterval(checkInterval);
        const slots = document.querySelectorAll('.mp-roster-card');
        const filledSlots = document.querySelectorAll('.mp-roster-card.filled');
        resolve({
          maxPlayers: slots.length,
          connectedCount: filledSlots.length,
        });
      }, 5000);
    });
  });

  console.log('Peer Lobby State:', peerLobbyState);

  if (peerLobbyState && peerLobbyState.maxPlayers === 2 && peerLobbyState.connectedCount === 2) {
    console.log('SUCCESS: Peer successfully synced with Host lobby and correctly sees 2 slots!');
  } else {
    console.error('FAILED: Peer did not sync correctly. Expected 2 slots, got:', peerLobbyState?.maxPlayers);
  }

  await browserHost.close();
  await browserPeer.close();
  process.exit(peerLobbyState?.maxPlayers === 2 ? 0 : 1);
})();
